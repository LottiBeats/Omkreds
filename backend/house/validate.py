"""
house.validate - the Structural Model Checker.

Runs before any calculation.  Critical errors block; warnings ask for the
engineer's attention but do not stop the work (vision section 8).

The checker never repairs the model.  Where it can see what the fix probably is,
it says so in the message and leaves the decision with the engineer.
"""

from __future__ import annotations

import math
from collections import Counter
from dataclasses import dataclass, field

from .interpret import Interpretation
from .model import StructuralModel

CRITICAL = "critical"
WARNING = "warning"
INFO = "info"

_ORDER = {CRITICAL: 0, WARNING: 1, INFO: 2}


@dataclass(frozen=True)
class Issue:
    severity: str
    code: str
    message: str
    refs: tuple[str, ...] = ()

    def __str__(self) -> str:  # pragma: no cover - display only
        mark = {CRITICAL: "x", WARNING: "!", INFO: "-"}[self.severity]
        return f"{mark} {self.message}"


@dataclass
class CheckResult:
    issues: list[Issue] = field(default_factory=list)

    def add(self, severity: str, code: str, message: str, *refs: str) -> None:
        self.issues.append(Issue(severity, code, message, tuple(refs)))

    @property
    def critical(self) -> list[Issue]:
        return [i for i in self.issues if i.severity == CRITICAL]

    @property
    def warnings(self) -> list[Issue]:
        return [i for i in self.issues if i.severity == WARNING]

    @property
    def blocks_calculation(self) -> bool:
        return bool(self.critical)

    def sorted(self) -> list[Issue]:
        return sorted(self.issues, key=lambda i: (_ORDER[i.severity], i.code))


def check_model(model: StructuralModel, interp: Interpretation) -> CheckResult:
    """Validate the model and the engine's reading of it."""
    res = CheckResult()
    _check_identity(model, res)
    _check_geometry(model, interp, res)
    _check_levels(model, res)
    _check_openings(model, res)
    _check_gravity(model, interp, res)
    _check_stability(model, res)
    _check_data(model, res)
    return res


# -- identity and geometry ----------------------------------------------------

def _check_identity(model: StructuralModel, res: CheckResult) -> None:
    ids = model.member_ids + [o.id for o in model.openings]
    for mid, count in Counter(ids).items():
        if count > 1:
            res.add(CRITICAL, "duplicate_id",
                    f"id {mid} is used by {count} objects", mid)


def _check_geometry(model: StructuralModel, interp: Interpretation,
                    res: CheckResult) -> None:
    tol = model.tolerances

    for wall in model.walls:
        if wall.length <= tol.node:
            res.add(CRITICAL, "zero_length",
                    f"wall {wall.id} has zero length", wall.id)
    for beam in model.beams:
        if beam.length <= tol.node:
            res.add(CRITICAL, "zero_length",
                    f"beam {beam.id} has zero length", beam.id)

    for nm in interp.topology.near_misses:
        res.add(WARNING, "near_miss",
                f"{nm.a} appears to meet {nm.b} but no contact was detected - "
                f"gap = {nm.gap * 1000:.0f} mm (tolerance "
                f"{tol.node * 1000:.0f} mm). Move the geometry, or add a "
                f"'connect' override.",
                nm.a, nm.b)

    for roof in model.roofs:
        if len(roof.outline) < 3:
            res.add(CRITICAL, "roof_outline",
                    f"roof {roof.id} needs at least 3 outline points", roof.id)
        elif roof.plan_area <= 0.0:
            res.add(CRITICAL, "roof_outline",
                    f"roof {roof.id} has zero plan area", roof.id)


def _check_levels(model: StructuralModel, res: CheckResult) -> None:
    known = {lv.id for lv in model.levels}
    for group, label in ((model.walls, "wall"), (model.beams, "beam"),
                         (model.columns, "column"), (model.roofs, "roof"),
                         (model.floors, "floor")):
        for obj in group:
            if obj.level not in known:
                res.add(CRITICAL, "unknown_level",
                        f"{label} {obj.id} refers to level '{obj.level}', "
                        f"which is not defined", obj.id)


# -- openings -----------------------------------------------------------------

def _check_openings(model: StructuralModel, res: CheckResult) -> None:
    for opening in model.openings:
        wall = model.wall(opening.host)
        if wall is None:
            res.add(CRITICAL, "orphan_opening",
                    f"opening {opening.id} has host '{opening.host}', which is "
                    f"not a wall", opening.id)
            continue
        if opening.width <= 0.0:
            res.add(CRITICAL, "opening_width",
                    f"opening {opening.id} has zero width", opening.id)
        if opening.position < -model.tolerances.node or \
                opening.end_position > wall.length + model.tolerances.node:
            res.add(CRITICAL, "opening_outside_wall",
                    f"opening {opening.id} runs from {opening.position:.3f} m to "
                    f"{opening.end_position:.3f} m along {wall.id}, which is "
                    f"{wall.length:.3f} m long", opening.id, wall.id)

    by_wall: dict[str, list] = {}
    for opening in model.openings:
        by_wall.setdefault(opening.host, []).append(opening)
    for wall_id, group in by_wall.items():
        group = sorted(group, key=lambda o: o.position)
        for a, b in zip(group, group[1:]):
            if b.position < a.end_position - model.tolerances.node:
                res.add(WARNING, "openings_overlap",
                        f"openings {a.id} and {b.id} overlap in {wall_id}",
                        a.id, b.id, wall_id)


# -- gravity ------------------------------------------------------------------

def _check_gravity(model: StructuralModel, interp: Interpretation,
                   res: CheckResult) -> None:
    for beam in model.beams:
        mi = interp.beams.get(beam.id)
        if mi is None or len(mi.supports) < 2:
            found = 0 if mi is None else len(mi.supports)
            res.add(CRITICAL, "beam_unsupported",
                    f"beam {beam.id} has {found} support(s); at least 2 are "
                    f"required", beam.id)
        elif len(mi.supports) > 2 and beam.continuity == "simple":
            res.add(WARNING, "beam_continuity",
                    f"beam {beam.id} has {len(mi.supports)} supports but is "
                    f"marked 'simple'. State whether it is continuous over the "
                    f"intermediate support(s) or split into separate beams.",
                    beam.id)
        if mi is not None:
            for note in mi.rejected:
                res.add(WARNING, "support_rejected", note, beam.id)

    for column in model.columns:
        if interp.topology.is_isolated(column.id):
            res.add(WARNING, "column_isolated",
                    f"column {column.id} carries nothing and rests on nothing "
                    f"that was detected", column.id)

    for wall in model.walls:
        if not wall.load_bearing:
            continue
        if not interp.walls[wall.id].supported_by:
            res.add(WARNING, "wall_no_foundation",
                    f"load-bearing wall {wall.id} has no foundation assigned",
                    wall.id)
        if interp.topology.is_isolated(wall.id) and len(model.walls) > 1:
            res.add(WARNING, "wall_isolated",
                    f"wall {wall.id} does not meet any other structural object",
                    wall.id)

    for ri in interp.roofs:
        if not ri.supporting_members:
            res.add(CRITICAL, "roof_unsupported",
                    f"no load-bearing wall or beam was found perpendicular to "
                    f"the span direction of roof {ri.roof}", ri.roof)
        elif len(ri.supporting_members) < 2:
            res.add(WARNING, "roof_one_support",
                    f"roof {ri.roof} was matched to only one supporting member "
                    f"({ri.supporting_members[0].value})", ri.roof)


# -- stability ----------------------------------------------------------------

def _check_stability(model: StructuralModel, res: CheckResult) -> None:
    lengths = {"X": 0.0, "Y": 0.0, "skew": 0.0}
    for wall in model.walls:
        if not wall.stabilising or wall.length == 0.0:
            continue
        d = wall.segment.direction
        angle = math.degrees(math.atan2(abs(d[1]), abs(d[0])))
        axis = "X" if angle < 15 else "Y" if angle > 75 else "skew"
        lengths[axis] += wall.length

    for axis in ("X", "Y"):
        if lengths[axis] == 0.0:
            res.add(WARNING, "no_stabilising_walls",
                    f"no wall is marked as stabilising in the {axis} direction")


# -- data ---------------------------------------------------------------------

def _check_data(model: StructuralModel, res: CheckResult) -> None:
    for beam in model.beams:
        if not beam.section:
            res.add(INFO, "section_missing",
                    f"beam {beam.id} has no section; it will be sized "
                    f"automatically", beam.id)
    for column in model.columns:
        if not column.section:
            res.add(INFO, "section_missing",
                    f"column {column.id} has no section; it will be sized "
                    f"automatically", column.id)
    for wall in model.walls:
        if wall.load_bearing and not wall.wall_type:
            res.add(WARNING, "wall_type_missing",
                    f"load-bearing wall {wall.id} has no wall type assigned",
                    wall.id)
    if not model.foundations:
        res.add(WARNING, "no_foundations",
                "no foundations are defined")


# -- report -------------------------------------------------------------------

def format_report(result: CheckResult) -> str:
    """The model check as the engineer reads it (vision section 8)."""
    lines = ["MODEL CHECK", ""]
    if not result.issues:
        lines.append("- no issues found")
    for issue in result.sorted():
        lines.append(str(issue))
    lines += ["",
              f"{len(result.critical)} critical error(s), "
              f"{len(result.warnings)} warning(s)"]
    return "\n".join(lines)
