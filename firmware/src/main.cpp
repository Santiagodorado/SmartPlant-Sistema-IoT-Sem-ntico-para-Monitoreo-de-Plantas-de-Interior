#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <PubSubClient.h>
#include <math.h>
#include "DHT.h"

#include "config.h"

#define DHTTYPE DHT11

DHT dht(PIN_DHT, DHTTYPE);
WiFiClient espClient;
PubSubClient mqttClient(espClient);

unsigned long lastSample = 0;
uint16_t samplingInterval = SAMPLING_SECONDS;  // se puede actualizar desde backend
unsigned long lastConfigFetch = 0;
const unsigned long CONFIG_REFRESH_MS = 5000;  // volver a pedir config cada 5s

enum Status {
    STATUS_IDLE,
    STATUS_OK,
    STATUS_WARN,
    STATUS_ERROR,
};

void logLine(const String& text) {
    Serial.println("[SmartPlant] " + text);
}

void setStatus(Status status) {
    digitalWrite(PIN_LED_GREEN, status == STATUS_OK ? HIGH : LOW);
    digitalWrite(PIN_LED_YELLOW, (status == STATUS_WARN || status == STATUS_IDLE) ? HIGH : LOW);
    digitalWrite(PIN_LED_RED, status == STATUS_ERROR ? HIGH : LOW);
}

void connectWifi() {
    if (WiFi.status() == WL_CONNECTED) {
        return;
    }

    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    logLine("Conectando a Wi-Fi...");
    uint8_t retries = 0;
    while (WiFi.status() != WL_CONNECTED && retries < 40) {
        delay(500);
        Serial.print(".");
        retries++;
    }
    Serial.println();
    if (WiFi.status() == WL_CONNECTED) {
        logLine("Wi-Fi conectado: " + WiFi.localIP().toString());
        setStatus(STATUS_IDLE);
    } else {
        logLine("No se pudo conectar a Wi-Fi");
        setStatus(STATUS_ERROR);
    }
}

void ensureMqtt() {
    if (!USE_MQTT) {
        return;
    }

    if (mqttClient.connected()) {
        return;
    }

    logLine("Conectando a MQTT...");
    String clientId = "SmartPlant-" + String((uint32_t)ESP.getEfuseMac(), HEX);
    bool connected = false;
    if (strlen(MQTT_USER) > 0) {
        connected = mqttClient.connect(clientId.c_str(), MQTT_USER, MQTT_PASS);
    } else {
        connected = mqttClient.connect(clientId.c_str());
    }

    if (connected) {
        logLine("MQTT conectado a " + String(MQTT_BROKER) + ":" + String(MQTT_PORT));
    } else {
        logLine("Error conectando MQTT, rc=" + String(mqttClient.state()));
        setStatus(STATUS_WARN);
    }
}

// Devuelve nivel de luz como porcentaje 0–100 (%), no lux reales.
// En TU conexión (por cómo se está comportando):
//   - Más luz → lectura ADC (raw) MÁS ALTA.
//   - Menos luz → lectura ADC (raw) MÁS BAJA.
// Así que NO invertimos: usamos la lectura directa normalizada
// y aplicamos la escala LUX_SCALE definida en config.h.
float readLux() {
    int raw = analogRead(PIN_LDR);  // 0–4095

    // Más luz → raw más alto → nivel (%) más alto.
    float level = static_cast<float>(raw) / 4095.0f;  // 0.0–1.0

    // Convertimos a porcentaje y aplicamos escala/offset de calibración.
    float lux = level * 100.0f * LUX_SCALE + LUX_OFFSET;

    if (lux < 0.0f) lux = 0.0f;
    if (lux > 100.0f) lux = 100.0f;  // Clamp a 0–100 %

    return lux;
}

String buildPayload(float temperature, float humidity, float lux) {
    String payload = "{";
    payload += "\"plantName\":\"" + String(PLANT_NAME) + "\",";
    payload += "\"location\":\"" + String(LOCATION) + "\",";
    payload += "\"temperature\":" + String(temperature, 2) + ",";
    payload += "\"humidity\":" + String(humidity, 2) + ",";
    payload += "\"illuminance\":" + String(lux, 0);
    payload += "}";
    return payload;
}

bool sendViaHttp(const String& payload) {
    if (!USE_HTTP) {
        return false;
    }
    HTTPClient http;
    http.begin(BACKEND_URL);
    http.addHeader("Content-Type", "application/json");
    int code = http.POST(payload);
    if (code > 0) {
        logLine("HTTP -> " + String(code));
        logLine(http.getString());
    } else {
        logLine("Error HTTP: " + String(code));
    }
    http.end();
    return code > 0 && code < 400;
}

bool sendViaMqtt(const String& payload) {
    if (!USE_MQTT) {
        return false;
    }
    if (!mqttClient.connected()) {
        ensureMqtt();
    }
    if (!mqttClient.connected()) {
        logLine("MQTT no disponible");
        return false;
    }

    bool ok = mqttClient.publish(MQTT_TOPIC, payload.c_str());
    logLine(ok ? "MQTT publish OK" : "MQTT publish falló");
    return ok;
}

bool fetchSamplingInterval() {
    if (!USE_HTTP) {
        return false;
    }
    HTTPClient http;
    http.begin(CONFIG_URL);
    int code = http.GET();
    if (code <= 0) {
        logLine("No se pudo leer config HTTP");
        http.end();
        return false;
    }
    String body = http.getString();
    http.end();

    int keyIdx = body.indexOf("\"samplingSeconds\"");
    if (keyIdx < 0) {
        logLine("Config sin samplingSeconds");
        return false;
    }
    int colon = body.indexOf(":", keyIdx);
    if (colon < 0) {
        return false;
    }
    int start = colon + 1;
    while (start < (int)body.length() && (body[start] == ' ' || body[start] == '\t')) {
        start++;
    }
    int end = start;
    while (end < (int)body.length() && isDigit(body[end])) {
        end++;
    }
    String num = body.substring(start, end);
    uint16_t val = num.toInt();
    if (val < 5 || val > 3600) {  // límites razonables
        logLine("samplingSeconds fuera de rango");
        return false;
    }
    samplingInterval = val;
    logLine("Intervalo desde backend: " + String(samplingInterval) + "s");
    return true;
}

bool sampleAndSend() {
    float humidity = dht.readHumidity();
    float temperature = dht.readTemperature();

    if (isnan(humidity) || isnan(temperature)) {
        logLine("Error leyendo DHT11");
        setStatus(STATUS_ERROR);
        return false;
    }

    float lux = readLux();
    logLine("Lecturas -> T: " + String(temperature, 1) + "C, H: " + String(humidity, 1) + "%, L: " + String(lux, 0) + " lux");

    if (WiFi.status() != WL_CONNECTED) {
        connectWifi();
        if (WiFi.status() != WL_CONNECTED) {
            logLine("Sin Wi-Fi, no se envía");
            setStatus(STATUS_ERROR);
            return false;
        }
    }

    String payload = buildPayload(temperature, humidity, lux);
    bool httpOk = sendViaHttp(payload);
    bool mqttOk = sendViaMqtt(payload);

    bool anyOk = httpOk || mqttOk;
    bool tempOk = temperature >= TEMP_MIN && temperature <= TEMP_MAX;
    bool humOk = humidity >= HUM_MIN && humidity <= HUM_MAX;
    bool luxOk = lux >= LUX_MIN && lux <= LUX_MAX;

    if (!anyOk) {
        setStatus(STATUS_ERROR);
    } else if (tempOk && humOk && luxOk) {
        setStatus(STATUS_OK);
    } else {
        setStatus(STATUS_WARN);
    }

    return anyOk;
}

void setup() {
    Serial.begin(115200);
    delay(1000);
    logLine("Inicializando sensores...");
    dht.begin();
    pinMode(PIN_LDR, INPUT);
    pinMode(PIN_LED_GREEN, OUTPUT);
    pinMode(PIN_LED_YELLOW, OUTPUT);
    pinMode(PIN_LED_RED, OUTPUT);
    setStatus(STATUS_IDLE);
    connectWifi();
    fetchSamplingInterval();
    lastConfigFetch = millis();
    mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
}

void loop() {
    unsigned long now = millis();
    if (samplingInterval == 0) {
        samplingInterval = SAMPLING_SECONDS;
    }
    // Refrescar intervalo desde backend sin reiniciar
    if (now - lastConfigFetch >= CONFIG_REFRESH_MS) {
        fetchSamplingInterval();
        lastConfigFetch = now;
    }
    if (now - lastSample >= (unsigned long)samplingInterval * 1000UL) {
        lastSample = now;
        sampleAndSend();
    }

    if (WiFi.status() != WL_CONNECTED) {
        connectWifi();
    }

    if (USE_MQTT) {
        if (!mqttClient.connected()) {
            ensureMqtt();
        }
        mqttClient.loop();
    }

    delay(200);
}

