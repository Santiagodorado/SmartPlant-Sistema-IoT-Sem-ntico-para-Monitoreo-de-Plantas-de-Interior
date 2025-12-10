## SmartPlant Backend

Servicio Flask que recibe lecturas del nodo ESP32, genera observaciones semánticas usando SSN/SOSA + SensorThings y expone endpoints REST para el dashboard.

### Requisitos

1. Python 3.11+
2. Crear un entorno virtual (opcional) y ejecutar:
   ```
   pip install -r requirements.txt
   ```

### Ejecución

```
set FLASK_ENV=development
python app.py
```

El servidor corre en `http://localhost:5000`.

### Configuración MQTT

El backend puede recibir lecturas también vía MQTT (por ejemplo desde Mosquitto). Variables de entorno principales:

| Variable | Descripción | Valor por defecto |
|----------|-------------|-------------------|
| `MQTT_ENABLED` | Activa/desactiva el bridge | `true` |
| `MQTT_BROKER_HOST` | Host del broker | `localhost` |
| `MQTT_BROKER_PORT` | Puerto | `1883` |
| `MQTT_TOPIC` | Tópico que escucha | `smartplant/observations` |
| `MQTT_USERNAME` / `MQTT_PASSWORD` | Credenciales si aplica | vacío |

Cada mensaje MQTT debe ser un JSON con el mismo formato que el POST HTTP (`temperature`, `humidity`, `illuminance`, etc.).

### Perfiles de plantas

Los umbrales recomendados se definen en `data/plants.json`. Cada perfil incluye:

```json
{
  "id": "monstera-deliciosa",
  "name": "Monstera deliciosa",
  "description": "Texto descriptivo",
  "ranges": {
    "temperature": { "min": 20, "max": 28 },
    "humidity": { "min": 50, "max": 80 },
    "illuminance": { "min": 300, "max": 700 }
  },
  "tips": ["Tip 1", "Tip 2"]
}
```

El endpoint `/api/plants` expone esta lista para que el dashboard permita la selección guiada.

### Endpoints principales

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/observations` | Recibe lecturas (`temperature`, `humidity`, `illuminance`) y genera triples RDF |
| GET | `/api/observations/latest` | Retorna las últimas lecturas almacenadas |
| GET | `/api/observations/rdf` | Devuelve el grafo completo en TTL o JSON-LD (`Accept` header o `?format=`) |
| POST | `/api/config` | Guarda nombre, ubicación, periodo de muestreo y `plantType` predefinido |
| GET | `/api/config` | Obtiene la configuración actual + perfil de planta |
| GET | `/api/plants` | Lista de plantas soportadas (definidas en `data/plants.json`) |
| GET | `/api/recommendations/latest` | Entrega el estado semántico y recomendaciones |

### Estructura

```
backend/
├── app.py                 # Flask + endpoints REST
├── services/
│   ├── semantic_store.py  # Gestión del grafo RDF y serialización
│   ├── storage.py         # Persistencia sencilla en JSON
│   ├── recommendations.py # Reglas semánticas básicas
│   └── plants.py          # Perfiles de plantas y umbrales
└── data/
    ├── observations.json  # Historial de lecturas
    ├── observations.ttl   # Grafo RDF persistido
    └── plants.json        # Catálogo editable de plantas
```

