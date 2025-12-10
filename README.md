### SmartPlant – Sistema IoT Semántico para Monitoreo de Plantas de Interior

SmartPlant es un prototipo IoT que monitorea una planta de interior usando un **ESP32** con **DHT11** (temperatura/humedad) y **LDR** (nivel de luz).  
Las lecturas se envían a un **backend Flask** vía HTTP/MQTT, se estructuran con la ontología **SSN/SOSA** y se visualizan en un **dashboard web** con estados semánticos y recomendaciones de cuidado.

---

### 1. Estructura del proyecto

- `backend/` – API REST en Flask, lógica semántica, almacenamiento y RDF.
- `frontend/` – Dashboard web (HTML, CSS, JS, Chart.js).
- `firmware/` – Firmware ESP32 (PlatformIO).
- `docs/` – Diagramas y material de documentación (por ejemplo `arquitectura.png`).

---

### 2. Requisitos

- **PC**
  - Windows 10
  - Python 3.11+
  - Git
  - Broker MQTT Mosquitto
- **Firmware**
  - PlatformIO (VS Code)
- **Hardware**
  - ESP32
  - DHT11
  - LDR + resistencia
  - 3 LEDs (verde, amarillo, rojo) + resistencias
  - Protoboard y cables

---

### 3. Backend (Flask)

#### 3.1. Instalación

```bash
cd backend
pip install -r requirements.txt
```

#### 3.2. Ejecutar

```bash
cd backend
set FLASK_SKIP_DOTENV=1
py app.py
```

El backend queda en: `http://127.0.0.1:5000`  
Salud: `http://127.0.0.1:5000/api/health`

Endpoints principales:

- `POST /api/observations` – Recibe lecturas del ESP32.
- `GET  /api/observations/latest` – Última lectura por planta.
- `GET  /api/recommendations/latest` – Recomendaciones semánticas.
- `GET  /api/plants` – Perfiles de plantas (rangos + tips).
- `GET/POST /api/config` – Configuración activa (planta, ubicación, frecuencia).
- `GET/POST /api/plants/configs` – Gestión de plantas guardadas.
- `GET /api/observations/rdf` – Observaciones en RDF (TTL/JSON-LD, SSN/SOSA).
- `GET /api/device` – Metadatos del nodo IoT.

---

### 4. Broker MQTT (Mosquitto)

```bash
cd "C:\Program Files\mosquitto"
mosquitto -v -c .\mosquitto.conf
```

- Tópico usado: `smartplant/observations`
- El backend se suscribe vía `paho-mqtt`.

Prueba rápida:

```bash
mosquitto_sub -h 192.168.101.7 -t smartplant/observations
mosquitto_pub -h 192.168.101.7 -t smartplant/observations -m '{"test":1}'
```

---

### 5. Frontend (Dashboard web)

#### 5.1. Servir el frontend

```bash
cd frontend
# opción 1 (Node)
npx serve .

# opción 2 (Python)
python -m http.server 4173
```

Abrir:

- `http://localhost:3000` (serve)
- o `http://localhost:4173/index.html` (Python)

#### 5.2. Flujo de uso

1. Al entrar se muestra un **modal de configuración** obligatorio:
   - Nombre de planta, ubicación, tipo de planta, frecuencia de muestreo.
2. Al guardar:
   - Se inicia el polling al backend.
   - Se muestra estado del sistema (conectado/desconectado).
   - Se actualizan lecturas y gráficas.
3. Menú lateral:
   - **Inicio**: estado actual + métricas + recomendaciones.
   - **Planta**: perfil semántico de la planta (rangos y tips).
   - **Configuración**: cambiar frecuencia y seleccionar plantas guardadas.

---

### 6. Firmware ESP32 (PlatformIO)

#### 6.1. Configuración

Editar `firmware/include/config.h`:

- WiFi:
  ```cpp
  static const char* WIFI_SSID = "TU_SSID";
  static const char* WIFI_PASS = "TU_PASSWORD";
  ```
- Backend:
  ```cpp
  static const char* BACKEND_URL = "http://<IP_PC>:5000/api/observations";
  static const char* CONFIG_URL  = "http://<IP_PC>:5000/api/config";
  static const char* MQTT_BROKER = "<IP_PC>";
  ```

- Pines de sensores y LEDs ya definidos (DHT11, LDR, LED verde/amarillo/rojo).
- La luz se maneja como **porcentaje 0–100%** (no lux reales) con umbrales:

  ```cpp
  static const float LUX_MIN = 20.0f;
  static const float LUX_MAX = 80.0f;
  ```

#### 6.2. Compilar y subir

```bash
cd firmware
pio run -t upload --upload-port COM5
pio device monitor --port COM5 --baud 115200
```

El firmware:

- Conecta a WiFi y al broker MQTT.
- Lee DHT11 y LDR periódicamente.
- Envía observaciones por HTTP y MQTT.
- Solicita `/api/config` para actualizar el intervalo de muestreo.
- Enciende LEDs según estados (ok/advertencia/error).

---

### 7. Arquitectura (resumen rápido)

- **ESP32**: captura datos y envía JSON (HTTP/MQTT).
- **Mosquitto**: broker MQTT.
- **Flask backend**: API REST, almacenamiento, semántica (SSN/SOSA, RDF).
- **Frontend**: dashboard web para estado, histórico y recomendaciones.

Patrones de comunicación:

- **Cliente–servidor (HTTP)**: ESP32 / frontend → Flask.
- **Publicador–suscriptor (MQTT)**: ESP32 → Mosquitto → Flask.

---

### 8. Notas de seguridad

- No subir credenciales reales de WiFi a repositorios públicos.
- Usar `config.h` con valores ficticios o gestionarlos vía variables de entorno / archivos ignorados por Git (`.gitignore`).
