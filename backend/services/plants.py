from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
PLANT_FILE = DATA_DIR / "plants.json"


def _read_plants() -> List[Dict[str, Any]]:
    if not PLANT_FILE.exists():
        raise FileNotFoundError(
            "No se encontró plants.json. Verifica que backend/data/plants.json exista."
        )
    return json.loads(PLANT_FILE.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def get_plants() -> List[Dict[str, Any]]:
    return _read_plants()


def get_profile(plant_id: Optional[str]) -> Optional[Dict[str, Any]]:
    plants = get_plants()
    if not plants:
        return None

    if plant_id:
        for plant in plants:
            if plant["id"] == plant_id:
                return plant
        return None
    return plants[0]

