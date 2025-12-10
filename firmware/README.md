# SmartPlant Firmware (PlatformIO)

Firmware para ESP32 DevKit V1 usando PlatformIO + Arduino framework. Lee DHT11 (temperatura/humedad) y LDR (luz), luego envía lecturas al backend vía HTTP (REST) y/o MQTT.

## Requisitos

1. [PlatformIO CLI o extensión VS Code](https://platformio.org/)
2. ESP32 DevKit V1, sensor DHT11, LDR + divisor de tensión, cables y proto board

## Estructura

```
firmware/
├── platformio.ini      # Configuración de entorno esp32dev
├── include/config.h    # Credenciales Wi-Fi y backend
└── src/main.cpp        # Lógica principal
```

## Pasos de uso

1. Duplicar `include/config.h` y actualizar SSID, contraseña, URL del backend, datos de broker MQTT y metadatos.
2. Conectar el DHT11 al pin GPIO4 (datos), LDR al pin ADC34 con divisor de tensión.
   - LED verde → GPIO16, amarillo → GPIO17, rojo → GPIO5 (puedes cambiarlos en `config.h`). Recuerda colocar resistencias de 220 Ω en serie.
3. En la raíz de `firmware/` ejecutar:
   ```
   pio run
   pio run --target upload
   pio device monitor
   ```
4. Verificar en la consola que el dispositivo envía lecturas (HTTP y/o MQTT) y recibe respuesta `201` del backend cuando está en modo REST.

## Personalización

- Ajusta `SAMPLING_SECONDS` para el periodo deseado.
- Modifica `readLux()` si cuentas con una calibración más precisa del LDR.
- Activa/desactiva `USE_HTTP` o `USE_MQTT` en `config.h` según el transporte requerido.
- Define `MQTT_TOPIC`, host y credenciales en `config.h` para tu broker (Mosquitto, HiveMQ, etc.).
- Ajusta `TEMP_MIN/MAX`, `HUM_MIN/MAX`, `LUX_MIN/MAX` para sincronizar las alertas de LED con los perfiles de planta que uses.

