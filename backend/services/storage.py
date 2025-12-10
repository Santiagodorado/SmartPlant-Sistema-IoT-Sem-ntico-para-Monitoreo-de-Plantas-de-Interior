from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
OBS_FILE = DATA_DIR / "observations.json"
CFG_FILE = DATA_DIR / "config.json"
PLANT_CFGS_FILE = DATA_DIR / "plant_configs.json"


def _ensure_files() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not OBS_FILE.exists():
        OBS_FILE.write_text("[]", encoding="utf-8")
    if not CFG_FILE.exists():
        CFG_FILE.write_text(
            json.dumps(
                {
                    "plantName": "SmartPlant",
                    "location": "Living Room",
                    "samplingSeconds": 60,
                    "plantType": "monstera-deliciosa",
                    "plantConfigId": None,
                },
                indent=2,
            ),
            encoding="utf-8",
        )
    if not PLANT_CFGS_FILE.exists():
        PLANT_CFGS_FILE.write_text("[]", encoding="utf-8")


def append_observation(record: Dict[str, Any], max_records: int = 200) -> None:
    _ensure_files()
    data: List[Dict[str, Any]] = json.loads(OBS_FILE.read_text(encoding="utf-8"))
    data.append(record)
    if len(data) > max_records:
        data = data[-max_records:]
    OBS_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")


def clear_observations() -> None:
    """Borra el histórico de observaciones."""
    _ensure_files()
    OBS_FILE.write_text("[]", encoding="utf-8")


def load_observations(
    limit: int | None = None,
    plant_config_id: str | None = None,
    plant_type: str | None = None,
) -> List[Dict[str, Any]]:
    _ensure_files()
    data: List[Dict[str, Any]] = json.loads(OBS_FILE.read_text(encoding="utf-8"))
    if plant_config_id:
        data = [item for item in data if item.get("plantConfigId") == plant_config_id]
    if plant_type:
        data = [item for item in data if item.get("plantType") == plant_type]
    return data[-limit:] if limit else data


def save_config(config: Dict[str, Any]) -> Dict[str, Any]:
    _ensure_files()
    merged = load_config()
    merged.update(config)
    CFG_FILE.write_text(json.dumps(merged, indent=2), encoding="utf-8")
    return merged


def load_config() -> Dict[str, Any]:
    _ensure_files()
    return json.loads(CFG_FILE.read_text(encoding="utf-8"))


def load_plant_configs() -> List[Dict[str, Any]]:
    _ensure_files()
    return json.loads(PLANT_CFGS_FILE.read_text(encoding="utf-8"))


def add_plant_config(cfg: Dict[str, Any]) -> Dict[str, Any]:
    _ensure_files()
    data: List[Dict[str, Any]] = load_plant_configs()
    data.append(cfg)
    PLANT_CFGS_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return cfg


def get_plant_config(cfg_id: str) -> Dict[str, Any] | None:
    for item in load_plant_configs():
        if item.get("id") == cfg_id:
            return item
    return None

