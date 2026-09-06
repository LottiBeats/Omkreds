"""
house — the Omkreds Structural Model and its engines.

Pure standard library: no FastAPI, no OpenSeesPy, no forallpeople, no database.
Units throughout are metres, kN, kN/m, kN/m² and degrees.

    from house import load_model, interpret, check_model

    model  = load_model("house/examples/test_001_rectangle.json")
    interp = interpret(model)
    issues = check_model(model, interp)
"""

from .model import (
    StructuralModel, Level, Wall, Opening, Beam, Column, Roof, Floor,
    Foundation, Assumptions, Tolerances,
)
from .schema import load_model, loads_model, model_to_dict, model_from_dict
from .interpret import interpret, Interpretation
from .validate import check_model, Issue

__all__ = [
    "StructuralModel", "Level", "Wall", "Opening", "Beam", "Column", "Roof",
    "Floor", "Foundation", "Assumptions", "Tolerances",
    "load_model", "loads_model", "model_to_dict", "model_from_dict",
    "interpret", "Interpretation",
    "check_model", "Issue",
]

SCHEMA_VERSION = 1
