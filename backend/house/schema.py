"""
house.schema - the neutral JSON exchange format.

Everything that produces a structural model - the Rhino adapter today, a DXF or
IFC importer or the Omkreds web editor later - writes this format and nothing
else.  Keeping the reader strict is what stops interpretation logic leaking back
into the adapters.

    {
      "schema_version": 1,
      "project": {"name": "Test House"},
      "levels":  [{"id": "GF", "elevation": 0.0, "height": 2.5}],
      "walls":   [...], "openings": [...], "beams": [...], "columns": [...],
      "roofs":   [...], "floors": [...], "foundations": [...],
      "assumptions": {...}, "tolerances": {...}, "overrides": [...]
    }
"""

from __future__ import annotations

import json
from dataclasses import MISSING, fields, is_dataclass
from pathlib import Path
from typing import Any

from .model import (
    Assumptions, Beam, Column, Floor, Foundation, Level, Opening, Override,
    Roof, StructuralModel, Tolerances, Wall,
)

SCHEMA_VERSION = 1


class SchemaError(ValueError):
    """The JSON does not describe a structural model this version understands."""


# -- reading ------------------------------------------------------------------

def _pt(value: Any, where: str) -> tuple[float, float]:
    if (not isinstance(value, (list, tuple))) or len(value) != 2:
        raise SchemaError(f"{where}: expected a point [x, y], got {value!r}")
    try:
        return (float(value[0]), float(value[1]))
    except (TypeError, ValueError):
        raise SchemaError(f"{where}: point coordinates must be numbers, got {value!r}")


def _ring(value: Any, where: str) -> list[tuple[float, float]]:
    if not isinstance(value, list):
        raise SchemaError(f"{where}: expected a list of points")
    return [_pt(p, f"{where}[{i}]") for i, p in enumerate(value)]


def _build(cls, raw: dict, where: str, point_fields=(), ring_fields=()):
    """Construct a dataclass from a dict, rejecting unknown keys.

    Unknown keys are an error rather than a silent ignore: a typo in an adapter
    ("loadbearing" for "load_bearing") would otherwise turn a load-bearing wall
    into a non-structural one without a word of warning.
    """
    if not isinstance(raw, dict):
        raise SchemaError(f"{where}: expected an object, got {type(raw).__name__}")
    known = {f.name for f in fields(cls)}
    unknown = set(raw) - known
    if unknown:
        raise SchemaError(f"{where}: unknown field(s) {sorted(unknown)}; "
                          f"known fields are {sorted(known)}")
    kwargs: dict[str, Any] = {}
    for key, value in raw.items():
        if key in point_fields and value is not None:
            kwargs[key] = _pt(value, f"{where}.{key}")
        elif key in ring_fields:
            kwargs[key] = _ring(value, f"{where}.{key}")
        else:
            kwargs[key] = value
    missing = [f.name for f in fields(cls)
               if f.name not in kwargs
               and f.default is MISSING and f.default_factory is MISSING]
    if missing:
        raise SchemaError(f"{where}: missing required field(s) {missing}")
    try:
        return cls(**kwargs)
    except TypeError as exc:
        raise SchemaError(f"{where}: {exc}")


def model_from_dict(raw: dict) -> StructuralModel:
    """Build a StructuralModel from the neutral JSON structure."""
    if not isinstance(raw, dict):
        raise SchemaError("top level: expected a JSON object")

    version = raw.get("schema_version", SCHEMA_VERSION)
    if version != SCHEMA_VERSION:
        raise SchemaError(f"schema_version {version} is not supported "
                          f"(this build reads version {SCHEMA_VERSION})")

    known_top = {"schema_version", "project", "levels", "walls", "openings",
                 "beams", "columns", "roofs", "floors", "foundations",
                 "assumptions", "tolerances", "overrides"}
    unknown = set(raw) - known_top
    if unknown:
        raise SchemaError(f"top level: unknown key(s) {sorted(unknown)}")

    project = raw.get("project") or {}
    levels = [_build(Level, r, f"levels[{i}]")
              for i, r in enumerate(raw.get("levels") or [])] or [Level("GF")]

    model = StructuralModel(
        name=project.get("name", "Untitled"),
        levels=levels,
        walls=[_build(Wall, r, f"walls[{i}]", point_fields=("start", "end"))
               for i, r in enumerate(raw.get("walls") or [])],
        openings=[_build(Opening, r, f"openings[{i}]")
                  for i, r in enumerate(raw.get("openings") or [])],
        beams=[_build(Beam, r, f"beams[{i}]", point_fields=("start", "end"))
               for i, r in enumerate(raw.get("beams") or [])],
        columns=[_build(Column, r, f"columns[{i}]", point_fields=("at",))
                 for i, r in enumerate(raw.get("columns") or [])],
        roofs=[_build(Roof, r, f"roofs[{i}]", point_fields=("span_direction",),
                      ring_fields=("outline",))
               for i, r in enumerate(raw.get("roofs") or [])],
        floors=[_build(Floor, r, f"floors[{i}]",
                       point_fields=("span_direction",), ring_fields=("outline",))
                for i, r in enumerate(raw.get("floors") or [])],
        foundations=[_build(Foundation, r, f"foundations[{i}]")
                     for i, r in enumerate(raw.get("foundations") or [])],
        overrides=[_build(Override, r, f"overrides[{i}]")
                   for i, r in enumerate(raw.get("overrides") or [])],
    )
    if raw.get("assumptions"):
        model.assumptions = _build(Assumptions, raw["assumptions"], "assumptions")
    if raw.get("tolerances"):
        model.tolerances = _build(Tolerances, raw["tolerances"], "tolerances")
    return model


def loads_model(text: str) -> StructuralModel:
    try:
        raw = json.loads(text)
    except json.JSONDecodeError as exc:
        raise SchemaError(f"invalid JSON: {exc}")
    return model_from_dict(raw)


def load_model(path: str | Path) -> StructuralModel:
    return loads_model(Path(path).read_text(encoding="utf-8"))


# -- writing ------------------------------------------------------------------

def _plain(value):
    if is_dataclass(value):
        return {f.name: _plain(getattr(value, f.name)) for f in fields(value)}
    if isinstance(value, tuple):
        return [_plain(v) for v in value]
    if isinstance(value, list):
        return [_plain(v) for v in value]
    return value


def model_to_dict(model: StructuralModel) -> dict:
    return {
        "schema_version": SCHEMA_VERSION,
        "project": {"name": model.name},
        "levels": [_plain(x) for x in model.levels],
        "walls": [_plain(x) for x in model.walls],
        "openings": [_plain(x) for x in model.openings],
        "beams": [_plain(x) for x in model.beams],
        "columns": [_plain(x) for x in model.columns],
        "roofs": [_plain(x) for x in model.roofs],
        "floors": [_plain(x) for x in model.floors],
        "foundations": [_plain(x) for x in model.foundations],
        "assumptions": _plain(model.assumptions),
        "tolerances": _plain(model.tolerances),
        "overrides": [_plain(x) for x in model.overrides],
    }


def dumps_model(model: StructuralModel, indent: int = 2) -> str:
    return json.dumps(model_to_dict(model), indent=indent, ensure_ascii=False)
