from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import uuid
from pathlib import Path
from typing import Dict, Iterable

from rdflib import Graph, Literal, Namespace, URIRef
from rdflib.namespace import RDF, RDFS, XSD

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
RDF_FILE = DATA_DIR / "observations.ttl"

SOSA = Namespace("http://www.w3.org/ns/sosa/")
SSN = Namespace("http://www.w3.org/ns/ssn/")
EX = Namespace("http://example.org/smartplant/")
QUDT = Namespace("http://qudt.org/schema/qudt/")
UNIT = Namespace("http://qudt.org/vocab/unit/")


@dataclass(frozen=True)
class Measurement:
    key: str
    observed_property: URIRef
    sensor: URIRef
    unit: URIRef


MEASUREMENTS: Iterable[Measurement] = (
    Measurement(
        key="temperature",
        observed_property=EX["property/temperature"],
        sensor=EX["sensor/dht11-temperature"],
        unit=UNIT["DEG_C"],
    ),
    Measurement(
        key="humidity",
        observed_property=EX["property/humidity"],
        sensor=EX["sensor/dht11-humidity"],
        unit=UNIT["PERCENT"],
    ),
    Measurement(
        key="illuminance",
        observed_property=EX["property/illuminance"],
        sensor=EX["sensor/ldr-light"],
        unit=UNIT["LUX"],
    ),
)


class SemanticStore:
    def __init__(self, path: Path | None = None) -> None:
        self.path = path or RDF_FILE
        self.graph = Graph()
        self._bind_namespaces()
        if self.path.exists():
            self.graph.parse(self.path, format="turtle")

    def _bind_namespaces(self) -> None:
        self.graph.bind("sosa", SOSA)
        self.graph.bind("ssn", SSN)
        self.graph.bind("ex", EX)
        self.graph.bind("qudt", QUDT)
        self.graph.bind("unit", UNIT)

    @staticmethod
    def _slug(text: str) -> str:
        return text.lower().replace(" ", "-")

    def add_observation(self, payload: Dict[str, float], meta: Dict[str, str]) -> str:
        now = datetime.fromisoformat(meta.get("timestamp") or datetime.now(tz=timezone.utc).isoformat())
        iso_time = now.astimezone(timezone.utc).isoformat()
        feature_uri = EX[f"feature/{self._slug(meta.get('plantName', 'SmartPlant'))}"]
        location_uri = EX[f"location/{self._slug(meta.get('location', 'living-room'))}"]

        self.graph.add((feature_uri, RDF.type, SOSA.FeatureOfInterest))
        self.graph.add((feature_uri, RDFS.label, Literal(meta.get("plantName", "SmartPlant"))))
        self.graph.add((feature_uri, SSN.hasProperty, EX["property/plant-health"]))

        self.graph.add((location_uri, RDF.type, SSN.Platform))
        self.graph.add((location_uri, RDFS.label, Literal(meta.get("location", "Living Room"))))

        batch_id = uuid.uuid4().hex[:8]

        for measurement in MEASUREMENTS:
            value = payload.get(measurement.key)
            if value is None:
                continue

            obs_uri = EX[f"observation/{measurement.key}-{batch_id}"]
            result_uri = EX[f"result/{measurement.key}-{batch_id}"]

            self.graph.add((obs_uri, RDF.type, SOSA.Observation))
            self.graph.add((obs_uri, SOSA.hasFeatureOfInterest, feature_uri))
            self.graph.add((obs_uri, SOSA.observedProperty, measurement.observed_property))
            self.graph.add((obs_uri, SOSA.madeBySensor, measurement.sensor))
            self.graph.add((obs_uri, SOSA.resultTime, Literal(iso_time, datatype=XSD.dateTime)))
            self.graph.add((obs_uri, SOSA.phenomenonTime, Literal(iso_time, datatype=XSD.dateTime)))
            self.graph.add((obs_uri, SOSA.hasResult, result_uri))

            self.graph.add((result_uri, RDF.type, SOSA.Result))
            self.graph.add((result_uri, SOSA.hasSimpleResult, Literal(value, datatype=XSD.float)))
            self.graph.add((result_uri, QUDT.unit, measurement.unit))

        self._persist()
        return batch_id

    def _persist(self) -> None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        self.graph.serialize(destination=self.path, format="turtle")

    def serialize(self, mime: str = "text/turtle") -> str:
        format_map = {
            "text/turtle": "turtle",
            "application/ld+json": "json-ld",
            "application/rdf+xml": "xml",
        }
        fmt = format_map.get(mime, "turtle")
        return self.graph.serialize(format=fmt)

