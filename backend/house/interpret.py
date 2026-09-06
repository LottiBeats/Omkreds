"""
house.interpret - what the engine works out from the model.

interpret(model) is a pure function.  It never writes back to the model, so the
authored input and the engine's reading of it can always be shown side by side
(vision section 9), and re-running it is free.

Everything derived carries the sentence that explains it, because "why does this
beam have this span?" has to be answerable from the data alone (section 34).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from . import geometry as g
from .derive import Derived, Trace, derived
from .model import Opening, StructuralModel, Wall
from .topology import Topology, build_topology

#: a member is taken to support a roof or floor when it runs within this angle
#: of the perpendicular to the span direction
SUPPORT_ANGLE_TOL_DEG = 15.0


# -- results ------------------------------------------------------------------

@dataclass(frozen=True)
class SupportPoint:
    at: g.Pt
    t: float           # arc length along the supported member
    by: str            # id of the supporting object
    kind: str          # "wall" | "column"
    reason: str


@dataclass
class MemberInterpretation:
    member: str
    supports: list[SupportPoint] = field(default_factory=list)
    spans: list[Derived[float]] = field(default_factory=list)
    cantilevers: list[Derived[float]] = field(default_factory=list)
    continuity: str = "simple"
    rejected: list[str] = field(default_factory=list)

    @property
    def total_span(self) -> float:
        return sum(s.value for s in self.spans)


@dataclass(frozen=True)
class Jamb:
    id: str
    at: g.Pt
    opening: str
    side: str          # "left" | "right"
    reason: str


@dataclass
class Lintel:
    id: str
    host: str
    opening: str
    clear_width: float
    bearing: float
    span: Derived[float]
    jambs: list[Jamb]
    reason: str


@dataclass
class RoofInterpretation:
    roof: str
    area: Derived[float]
    span_direction: g.Pt
    span_axis: str                                   # "X" | "Y" | "skew"
    supporting_members: list[Derived[str]] = field(default_factory=list)


@dataclass
class WallInterpretation:
    wall: str
    carries: list[str] = field(default_factory=list)     # ids resting on it
    supported_by: list[str] = field(default_factory=list)  # foundations below
    openings: list[str] = field(default_factory=list)


@dataclass
class Interpretation:
    model_name: str
    topology: Topology
    beams: dict[str, MemberInterpretation] = field(default_factory=dict)
    walls: dict[str, WallInterpretation] = field(default_factory=dict)
    lintels: list[Lintel] = field(default_factory=list)
    roofs: list[RoofInterpretation] = field(default_factory=list)
    trace: Trace = field(default_factory=Trace)

    def lintel_for(self, opening_id: str) -> Lintel | None:
        return next((l for l in self.lintels if l.opening == opening_id), None)


# -- interpretation -----------------------------------------------------------

def interpret(model: StructuralModel) -> Interpretation:
    """Read the authored model and derive the structural information."""
    topo = build_topology(model)
    interp = Interpretation(model_name=model.name, topology=topo)

    for note in topo.applied_overrides:
        interp.trace.add(f"Override applied - {note}")

    _interpret_walls(model, interp)
    _interpret_beams(model, interp)
    _interpret_openings(model, interp)
    _interpret_roofs(model, interp)
    return interp


# -- walls --------------------------------------------------------------------

def _interpret_walls(model: StructuralModel, interp: Interpretation) -> None:
    for wall in model.walls:
        wi = WallInterpretation(wall=wall.id)
        wi.openings = [o.id for o in model.openings_in(wall.id)]
        wi.supported_by = [f.id for f in model.foundations
                           if f.supports == wall.id]
        for contact in interp.topology.contacts_of(wall.id):
            other = contact.other(wall.id)
            if model.beam(other) is not None and wall.load_bearing:
                wi.carries.append(other)
        interp.walls[wall.id] = wi


# -- beams --------------------------------------------------------------------

def _opening_at(model: StructuralModel, wall: Wall, t: float) -> Opening | None:
    """The opening a wall is interrupted by at arc length t, if any."""
    for o in model.openings_in(wall.id):
        if o.position <= t <= o.end_position:
            return o
    return None


def _interpret_beams(model: StructuralModel, interp: Interpretation) -> None:
    tol = model.tolerances

    for beam in model.beams:
        mi = MemberInterpretation(member=beam.id, continuity=beam.continuity)
        seg = beam.segment

        for contact in interp.topology.contacts_of(beam.id):
            other_id = contact.other(beam.id)
            t = contact.t_on(beam.id)
            wall = model.wall(other_id)
            column = model.column(other_id)

            if wall is not None:
                if not wall.load_bearing:
                    mi.rejected.append(
                        f"{other_id} touches {beam.id} at {t:.3f} m but is not "
                        f"load-bearing, so it is not treated as a support")
                    continue
                blocked = _opening_at(model, wall, contact.t_on(other_id))
                if blocked is not None:
                    mi.rejected.append(
                        f"{other_id} meets {beam.id} at {t:.3f} m inside opening "
                        f"{blocked.id}, so it cannot act as a support there")
                    continue
                mi.supports.append(SupportPoint(
                    at=contact.point, t=t, by=other_id, kind="wall",
                    reason=f"load-bearing wall {other_id} meets {beam.id} at "
                           f"{t:.3f} m from its start"))
            elif column is not None:
                mi.supports.append(SupportPoint(
                    at=contact.point, t=t, by=other_id, kind="column",
                    reason=f"column {other_id} stands under {beam.id} at "
                           f"{t:.3f} m from its start"))
            elif model.beam(other_id) is not None:
                mi.rejected.append(
                    f"{beam.id} meets beam {other_id} at {t:.3f} m; beam-on-beam "
                    f"support is outside the scope of this version and must be "
                    f"stated with a 'support' override")

        # Merge supports that land on the same point, keeping the first.
        merged: list[SupportPoint] = []
        for sp in sorted(mi.supports, key=lambda s: s.t):
            if merged and abs(merged[-1].t - sp.t) <= tol.node:
                continue
            merged.append(sp)
        mi.supports = merged

        for first, second in zip(merged, merged[1:]):
            mi.spans.append(derived(
                round(second.t - first.t, 4),
                f"between {first.by} (t = {first.t:.3f} m) and "
                f"{second.by} (t = {second.t:.3f} m)",
                beam.id, first.by, second.by))

        if merged:
            if merged[0].t > tol.node:
                mi.cantilevers.append(derived(
                    round(merged[0].t, 4),
                    f"{beam.id} extends {merged[0].t:.3f} m beyond its first "
                    f"support {merged[0].by}", beam.id, merged[0].by))
            tail = seg.length - merged[-1].t
            if tail > tol.node:
                mi.cantilevers.append(derived(
                    round(tail, 4),
                    f"{beam.id} extends {tail:.3f} m beyond its last support "
                    f"{merged[-1].by}", beam.id, merged[-1].by))

        interp.beams[beam.id] = mi
        if mi.spans:
            interp.trace.add(
                f"{beam.id}: {len(mi.spans)} span(s), "
                + ", ".join(f"{s.value:.3f} m" for s in mi.spans)
                + f" - supports {', '.join(s.by for s in merged)}")


# -- openings and lintels -----------------------------------------------------

def _interpret_openings(model: StructuralModel, interp: Interpretation) -> None:
    bearing = model.assumptions.lintel_bearing
    counter = 0

    for opening in model.openings:
        wall = model.wall(opening.host)
        if wall is None:
            continue
        if not wall.load_bearing:
            interp.trace.add(
                f"{opening.id}: no lintel generated - host wall {wall.id} is "
                f"not load-bearing")
            continue

        counter += 1
        lintel_id = f"L{counter:02d}"
        span = opening.width + 2 * bearing
        seg = wall.segment
        left = seg.point_at(opening.position)
        right = seg.point_at(opening.end_position)

        jambs = [
            Jamb(f"{lintel_id}-J1", g.round_pt(left), opening.id, "left",
                 f"jamb under the left end of {lintel_id} at the edge of "
                 f"{opening.id}"),
            Jamb(f"{lintel_id}-J2", g.round_pt(right), opening.id, "right",
                 f"jamb under the right end of {lintel_id} at the edge of "
                 f"{opening.id}"),
        ]

        interp.lintels.append(Lintel(
            id=lintel_id,
            host=wall.id,
            opening=opening.id,
            clear_width=opening.width,
            bearing=bearing,
            span=derived(
                round(span, 4),
                f"clear opening {opening.width:.3f} m plus {bearing:.3f} m "
                f"bearing at each end (model assumption)",
                opening.id, wall.id),
            jambs=jambs,
            reason=f"{opening.id} interrupts load-bearing wall {wall.id}, so the "
                   f"wall load above it is carried by {lintel_id}",
        ))
        interp.trace.add(
            f"{lintel_id}: generated over {opening.id} in {wall.id}, "
            f"span {span:.3f} m")


# -- roofs --------------------------------------------------------------------

def _span_axis(direction: g.Pt) -> str:
    try:
        d = g.normalise(direction)
    except ValueError:
        return "skew"
    if abs(abs(d[0]) - 1.0) < 1e-3:
        return "X"
    if abs(abs(d[1]) - 1.0) < 1e-3:
        return "Y"
    return "skew"


def _interpret_roofs(model: StructuralModel, interp: Interpretation) -> None:
    for roof in model.roofs:
        area = roof.plan_area
        ri = RoofInterpretation(
            roof=roof.id,
            area=derived(round(area, 3),
                         f"plan area of the outline of {roof.id} "
                         f"({len(roof.outline)} points)", roof.id),
            span_direction=roof.span_direction,
            span_axis=_span_axis(roof.span_direction),
        )

        try:
            d = g.normalise(roof.span_direction)
        except ValueError:
            interp.roofs.append(ri)
            continue

        # Both walls and beams can carry a roof: the internal bearing line of
        # a house is often a wall for part of its length and a beam for the
        # rest, and leaving the beam out would under-report what it carries.
        candidates = [(w.id, w.segment, w.level, "load-bearing wall")
                      for w in model.walls if w.load_bearing]
        candidates += [(b.id, b.segment, b.level, "beam") for b in model.beams]

        for member_id, seg, level, label in candidates:
            if level != roof.level or seg.length == 0.0:
                continue
            mid = seg.point_at(seg.length / 2)
            if not g.point_in_polygon(mid, roof.outline,
                                      model.tolerances.wall_alignment):
                continue
            angle = math.degrees(math.acos(
                max(0.0, min(1.0, abs(g.dot(seg.direction, d))))))
            if abs(90.0 - angle) <= SUPPORT_ANGLE_TOL_DEG:
                ri.supporting_members.append(derived(
                    member_id,
                    f"{label} {member_id} runs perpendicular to the span "
                    f"direction of {roof.id} and lies within its outline",
                    roof.id, member_id))

        interp.roofs.append(ri)
        interp.trace.add(
            f"{roof.id}: {area:.2f} m2 in plan, spans {ri.span_axis}, carried by "
            + (", ".join(w.value for w in ri.supporting_members)
               or "no supporting member found"))
