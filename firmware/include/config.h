#pragma once

// Configuración Wi-Fi
static const char* WIFI_SSID = "Familia_Gomez";
static const char* WIFI_PASS = "1003103288";

// Envío de datos
static const bool USE_HTTP = true;
static const bool USE_MQTT = true;

// Endpoint del backend Flask (HTTP)
static const char* BACKEND_URL = "http://192.168.101.7:5000/api/observations";
static const char* CONFIG_URL = "http://192.168.101.7:5000/api/config";

// Broker MQTT
static const char* MQTT_BROKER = "192.168.101.7";
static const uint16_t MQTT_PORT = 1883;
static const char* MQTT_TOPIC = "smartplant/observations";
static const char* MQTT_USER = "";  // opcional
static const char* MQTT_PASS = "";  // opcional

// Metadatos de la planta
static const char* PLANT_NAME = "SmartPlant";
static const char* LOCATION = "Living Room";

// Intervalo de muestreo en segundos
static const uint16_t SAMPLING_SECONDS = 60;

// Pines de sensores
static const uint8_t PIN_DHT = 4;         // GPIO4
static const uint8_t PIN_LDR = 34;        // ADC1_CH6

// Pines para indicadores LED
static const uint8_t PIN_LED_GREEN = 16;
static const uint8_t PIN_LED_YELLOW = 17;
static const uint8_t PIN_LED_RED = 5;

// Umbrales básicos para mostrar alertas locales
// Nota: ahora la "luz" se maneja como porcentaje 0–100 (%), no como lux reales.
static const float TEMP_MIN = 18.0f;
static const float TEMP_MAX = 28.0f;
static const float HUM_MIN = 40.0f;
static const float HUM_MAX = 70.0f;
static const float LUX_MIN = 20.0f;   // 20 % de luz mínima aceptable
static const float LUX_MAX = 80.0f;   // 80 % de luz máxima antes de considerar "mucha luz"

// Ya no se intenta calibrar a lux físicos, solo porcentaje relativo.
// LUX_SCALE permite bajar o subir la escala sin tocar el código:
//   - Si en luz normal ves ~98 %, baja LUX_SCALE (ej: 0.7) para que quede ~70 %.
static const float LUX_SCALE = 0.7f;
static const float LUX_OFFSET = 0.0f;

