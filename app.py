from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict
import logging
import os
from uuid import uuid4

from flask import Flask, jsonify, request, Response
from flask_cors import CORS

from services.semantic_store import SemanticStore
from services import storage, recommendations, plants
from services.mqtt_bridge import MQTTBridge

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("smartplant.app")

app = Flask(__name__)
CORS(app)

semantic_store = SemanticStore()


def _iso_now() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def _as_float(value: Any, field: str) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        raise ValueError(f"Campo {field} inválido")


def ingest_observation(body: Dict[str, Any]) -> Dict[str, Any]:
    if not body:
        raise ValueError("JSON requerido")

    cfg = storage.load_config()
    plant_name = body.get("plantName", cfg["plantName"])
    location = body.get("location", cfg["location"])
    plant_type = body.get("plantType", cfg.get("plantType", "monstera-deliciosa"))
    plant_config_id = cfg.get("plantConfigId")
    profile = plants.get_profile(plant_type)
    if profile is None:
        raise ValueError("Tipo de planta no válido")

    timestamp = body.get("timestamp") or _iso_now()

    temperature = _as_float(body.get("temperature"), "temperature")
    humidity = _as_float(body.get("humidity"), "humidity")
    illuminance = _as_float(body.get("illuminance") or body.get("light"), "illuminance")

    observation = {
        "plantName": plant_name,
        "location": location,
        "plantType": plant_type,
        "temperature": temperature,
        "humidity": humidity,
        "illuminance": illuminance,
        "timestamp": timestamp,
        "plantConfigId": plant_config_id,
    }

    storage.append_observation(observation)
    semantic_store.add_observation(
        payload={
            "temperature": temperature,
            "humidity": humidity,
            "illuminance": illuminance,
        },
        meta={
            "plantName": plant_name,
            "location": location,
            "timestamp": timestamp,
            "plantType": plant_type,
        },
    )
    recs = recommendations.build_recommendations(observation, profile)

    return {
        "stored": True,
        "timestamp": timestamp,
        "plantType": plant_type,
        "plantProfile": profile,
        "recommendations": recs,
    }


def _handle_mqtt_payload(payload: Dict[str, Any]) -> None:
    try:
        ingest_observation(payload)
        logger.info("Observación recibida por MQTT")
    except Exception:
        logger.exception("Error procesando mensaje MQTT")


mqtt_bridge = MQTTBridge(_handle_mqtt_payload)
if os.getenv("WERKZEUG_RUN_MAIN") == "true" or os.getenv("WERKZEUG_RUN_MAIN") is None:
    mqtt_bridge.start()


@app.get("/api/health")
def health() -> Dict[str, str]:
    return {"status": "ok", "service": "smartplant-backend"}


@app.get("/api/device")
def device_info() -> Response:
    cfg = storage.load_config()
    topic = os.getenv("MQTT_TOPIC", "smartplant/observations")
    host_http = request.host_url.rstrip("/")
    info = {
        "id": "esp32-smartplant",
        "name": cfg.get("plantName", "SmartPlant"),
        "location": cfg.get("location", "Living Room"),
        "description": "Nodo ESP32 con DHT11 + LDR y actuadores LED de estado",
        "samplingSeconds": cfg.get("samplingSeconds", 60),
        "plantType": cfg.get("plantType", "monstera-deliciosa"),
        "plantConfigId": cfg.get("plantConfigId"),
        "transport": {
            "http": {
                "base": host_http,
                "observations": f"{host_http}/api/observations",
                "config": f"{host_http}/api/config",
                "device": f"{host_http}/api/device",
            },
            "mqtt": {
                "topic": topic,
                "host": os.getenv("MQTT_BROKER_HOST", "localhost"),
                "port": int(os.getenv("MQTT_BROKER_PORT", "1883")),
                "enabled": os.getenv("MQTT_ENABLED", "true").lower() != "false",
            },
        },
        "sensors": [
            {"id": "dht11-temperature", "type": "temperature", "unit": "degC", "property": "airTemperature"},
            {"id": "dht11-humidity", "type": "humidity", "unit": "percent", "property": "relativeHumidity"},
            {"id": "ldr-illuminance", "type": "illuminance", "unit": "lux", "property": "ambientLight"},
        ],
        "actuators": [
            {"id": "led-green", "type": "indicator", "role": "ok"},
            {"id": "led-yellow", "type": "indicator", "role": "warn"},
            {"id": "led-red", "type": "indicator", "role": "error"},
        ],
        "firmware": {
            "version": "1.0.0",
            "platform": "esp32",
            "protocols": ["http", "mqtt"],
        },
    }

    return jsonify(info)


@app.post("/api/config")
def save_config() -> Response:
    body = request.get_json(force=True, silent=True) or {}
    requested_type = body.get("plantType")
    existing_cfg = storage.load_config()
    plant_type = requested_type or existing_cfg.get("plantType", "monstera-deliciosa")
    profile = plants.get_profile(plant_type)
    if profile is None:
        return jsonify({"error": "Tipo de planta no válido"}), 400

    cfg = storage.save_config(
        {
            "plantName": body.get("plantName", "SmartPlant"),
            "location": body.get("location", "Living Room"),
            "samplingSeconds": int(body.get("samplingSeconds", 60)),
            "plantType": plant_type,
            "plantConfigId": body.get("plantConfigId", existing_cfg.get("plantConfigId")),
        }
    )
    return jsonify({**cfg, "plantProfile": profile}), 201


@app.get("/api/config")
def get_config() -> Response:
    cfg = storage.load_config()
    profile = plants.get_profile(cfg.get("plantType"))
    return jsonify({**cfg, "plantProfile": profile})


@app.get("/api/plants")
def list_plants() -> Response:
    return jsonify(plants.get_plants())


@app.get("/api/plants/configs")
def list_saved_configs() -> Response:
    return jsonify(storage.load_plant_configs())


@app.post("/api/plants/configs")
def add_saved_config() -> Response:
    body = request.get_json(force=True, silent=True) or {}
    plant_type = body.get("plantType") or "monstera-deliciosa"
    profile = plants.get_profile(plant_type)
    if profile is None:
        return jsonify({"error": "Tipo de planta no válido"}), 400
    cfg = {
        "id": body.get("id") or uuid4().hex[:12],
        "plantName": body.get("plantName", "SmartPlant"),
        "location": body.get("location", "Living Room"),
        "samplingSeconds": int(body.get("samplingSeconds", 60)),
        "plantType": plant_type,
    }
    storage.add_plant_config(cfg)
    return jsonify({**cfg, "plantProfile": profile}), 201


@app.post("/api/config/activate")
def activate_config() -> Response:
    body = request.get_json(force=True, silent=True) or {}
    cfg_id = body.get("plantConfigId")
    if not cfg_id:
        return jsonify({"error": "plantConfigId requerido"}), 400
    cfg = storage.get_plant_config(cfg_id)
    if not cfg:
        return jsonify({"error": "Config no encontrada"}), 404
    profile = plants.get_profile(cfg.get("plantType"))
    merged = storage.save_config({**cfg, "plantConfigId": cfg_id})
    return jsonify({**merged, "plantProfile": profile}), 200


@app.post("/api/observations")
def create_observation() -> Response:
    body = request.get_json(force=True)
    try:
        result = ingest_observation(body)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception:
        logger.exception("Fallo procesando observación HTTP")
        return jsonify({"error": "No se pudo almacenar la lectura"}), 500
    return jsonify(result), 201


@app.get("/api/observations/latest")
def latest_observations() -> Response:
    limit = request.args.get("limit", default=10, type=int)
    cfg_id = request.args.get("plantConfigId")
    plant_type = request.args.get("plantType")
    data = storage.load_observations(limit=limit, plant_config_id=cfg_id, plant_type=plant_type)
    return jsonify({"items": data, "count": len(data)})


@app.get("/api/observations/rdf")
def rdf_dump() -> Response:
    fmt_query = (request.args.get("format") or "").lower()
    mime_map = {
        "jsonld": "application/ld+json",
        "json-ld": "application/ld+json",
        "ttl": "text/turtle",
        "turtle": "text/turtle",
        "xml": "application/rdf+xml",
    }
    if fmt_query in mime_map:
        best = mime_map[fmt_query]
    else:
        best = request.accept_mimetypes.best_match(
            ["application/ld+json", "text/turtle", "application/rdf+xml"],
            default="text/turtle",
        )
    return Response(semantic_store.serialize(best), mimetype=best)


@app.get("/api/recommendations/latest")
def latest_recommendations() -> Response:
    cfg_id = request.args.get("plantConfigId")
    plant_type = request.args.get("plantType")
    data = storage.load_observations(limit=1, plant_config_id=cfg_id, plant_type=plant_type)
    if not data:
        return jsonify({"error": "Sin observaciones"}), 404
    cfg = storage.load_config()
    effective_type = data[-1].get("plantType") or plant_type or cfg.get("plantType")
    profile = plants.get_profile(effective_type)
    recs = recommendations.build_recommendations(data[-1], profile)
    return jsonify({"timestamp": data[-1]["timestamp"], "recommendations": recs, "profile": profile})


@app.get("/")
def index() -> Dict[str, str]:
    return {
        "message": "SmartPlant Backend activo",
        "docs": "/backend/README.md",
    }


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)

