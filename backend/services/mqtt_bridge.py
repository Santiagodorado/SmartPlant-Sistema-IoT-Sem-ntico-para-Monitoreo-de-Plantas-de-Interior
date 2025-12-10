from __future__ import annotations

import json
import logging
import os
from threading import Thread
from typing import Callable, Dict, Any
from uuid import uuid4

from paho.mqtt import client as mqtt

logger = logging.getLogger("smartplant.mqtt")


class MQTTBridge:
    def __init__(self, handler: Callable[[Dict[str, Any]], None]) -> None:
        self.handler = handler
        self.enabled = os.getenv("MQTT_ENABLED", "true").lower() != "false"
        self.host = os.getenv("MQTT_BROKER_HOST", "localhost")
        self.port = int(os.getenv("MQTT_BROKER_PORT", "1883"))
        self.topic = os.getenv("MQTT_TOPIC", "smartplant/observations")
        self.username = os.getenv("MQTT_USERNAME", "")
        self.password = os.getenv("MQTT_PASSWORD", "")
        self.client_id = os.getenv("MQTT_CLIENT_ID", f"smartplant-backend-{uuid4().hex[:6]}")
        self._client: mqtt.Client | None = None
        self._thread: Thread | None = None

    def start(self) -> None:
        if not self.enabled:
            logger.info("MQTT bridge disabled (set MQTT_ENABLED=true to enable)")
            return
        if self._thread and self._thread.is_alive():
            return
        self._thread = Thread(target=self._run, daemon=True)
        self._thread.start()
        logger.info("MQTT bridge thread started")

    def _run(self) -> None:
        self._client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=self.client_id)
        if self.username:
            self._client.username_pw_set(self.username, self.password or None)
        self._client.on_connect = self._on_connect
        self._client.on_message = self._on_message
        self._client.connect(self.host, self.port, keepalive=60)
        try:
            self._client.loop_forever()
        except KeyboardInterrupt:
            pass

    def _on_connect(self, client: mqtt.Client, userdata: Any, flags: dict, reason_code: int, properties: Any) -> None:
        if reason_code == 0:
            logger.info("MQTT conectado a %s:%s, suscribiendo a %s", self.host, self.port, self.topic)
            client.subscribe(self.topic)
        else:
            logger.error("Conexión MQTT fallida, code=%s", reason_code)

    def _on_message(self, client: mqtt.Client, userdata: Any, msg: mqtt.MQTTMessage) -> None:
        try:
            payload = json.loads(msg.payload.decode("utf-8"))
        except json.JSONDecodeError:
            logger.warning("Mensaje MQTT inválido (no JSON)")
            return

        try:
            self.handler(payload)
            logger.info("Observación MQTT procesada")
        except Exception:
            logger.exception("No se pudo procesar mensaje MQTT")



