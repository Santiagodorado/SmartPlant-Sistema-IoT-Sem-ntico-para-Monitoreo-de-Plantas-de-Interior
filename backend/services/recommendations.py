from __future__ import annotations

from typing import Any, Dict, List, Tuple, Optional

DEFAULT_RANGES = {
    "temperature": {"min": 18, "max": 28},
    "humidity": {"min": 40, "max": 70},
    "illuminance": {"min": 200, "max": 800},
}

MESSAGES = {
    "temperature": (
        "Temperatura ideal",
        "Mover a un lugar más cálido",
        "Mover a un lugar más fresco",
    ),
    "humidity": (
        "Humedad estable",
        "Regar la planta",
        "Reducir riego o ventilación",
    ),
    "light": (
        "Luz adecuada",
        "Acercar a una ventana",
        "Filtrar la luz o mover la planta",
    ),
}


def _eval_range(value: float, low: float, high: float) -> int:
    """Return -1 if low, 1 if high, 0 if ok."""
    if value < low:
        return -1
    if value > high:
        return 1
    return 0


def _status_map(result: int, ok_msg: str, low_msg: str, high_msg: str) -> Tuple[str, str]:
    if result < 0:
        return "low", low_msg
    if result > 0:
        return "high", high_msg
    return "ok", ok_msg


def _select_range(profile: Optional[Dict[str, Any]], key: str) -> Dict[str, float]:
    ranges = (profile or {}).get("ranges", {})
    return ranges.get(key, DEFAULT_RANGES.get(key, DEFAULT_RANGES["temperature"]))


def build_recommendations(
    payload: Dict[str, float],
    profile: Optional[Dict[str, Any]] = None,
) -> Dict[str, List[Dict[str, str]]]:
    temperature = float(payload.get("temperature", 0))
    humidity = float(payload.get("humidity", 0))
    light = float(payload.get("illuminance", payload.get("light", 0)))

    temp_range = _select_range(profile, "temperature")
    hum_range = _select_range(profile, "humidity")
    light_range = _select_range(profile, "illuminance")

    evaluations = [
        (
            "temperature",
            _status_map(
                _eval_range(temperature, temp_range["min"], temp_range["max"]),
                *MESSAGES["temperature"],
            ),
        ),
        (
            "humidity",
            _status_map(
                _eval_range(humidity, hum_range["min"], hum_range["max"]),
                *MESSAGES["humidity"],
            ),
        ),
        (
            "light",
            _status_map(
                _eval_range(light, light_range["min"], light_range["max"]),
                *MESSAGES["light"],
            ),
        ),
    ]

    tips = []
    alerts = []
    for feature, (status, message) in evaluations:
        entry = {"feature": feature, "status": status, "message": message}
        if status == "ok":
            tips.append(entry)
        else:
            alerts.append(entry)

    overall = "alert" if alerts else "ok"
    return {"status": overall, "alerts": alerts, "tips": tips}

