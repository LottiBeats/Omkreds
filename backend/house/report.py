"""
house.report - the interpreted model as the engineer reads it.

This is the first checkpoint of the vision document (section 27): before any
load, any calculation and any drawing, Omkreds must be able to say back
"this is the structural model I believe you defined".

The text form here is the reference rendering.  The dict form is what the API
and the UI use, so the two can never drift apart.
"""

from __future__ import annotations

from .interpret import Interpretation
from .model import StructuralModel


def describe(model: StructuralModel, interp: Interpretation) -> str:
    """Plain-text summary of the interpreted structural model."""
    out: list[str] = ["STRUCTURAL MODEL", model.name, ""]

    for ri in interp.roofs:
        out.append(f"Roof {ri.roof}")
        out.append(f"  Area:           {ri.area.value:.2f} m2")
        out.append(f"  Span direction: {ri.span_axis}")
        carried = ", ".join(w.value for w in ri.supporting_members) or "-"
        out.append(f"  Supported by:   {carried}")
        out.append("")

    for beam in model.beams:
        mi = interp.beams.get(beam.id)
        if mi is None:
            continue
        out.append(f"Beam {beam.id}")
        if mi.spans:
            spans = " + ".join(f"{s.value:.3f}" for s in mi.spans)
            out.append(f"  Span:           {spans} m")
        else:
            out.append("  Span:           not determined")
        out.append(f"  Supports:       "
                   + (" / ".join(s.by for s in mi.supports) or "none found"))
        out.append(f"  Continuity:     {mi.continuity}")
        for c in mi.cantilevers:
            out.append(f"  Cantilever:     {c.value:.3f} m")
        out.append("")

    for lintel in interp.lintels:
        out.append(f"Lintel {lintel.id}")
        out.append(f"  Host wall:      {lintel.host}")
        out.append(f"  Opening:        {lintel.opening}, "
                   f"clear width {lintel.clear_width:.3f} m")
        out.append(f"  Span:           {lintel.span.value:.3f} m")
        out.append(f"  Jambs:          "
                   + ", ".join(j.id for j in lintel.jambs))
        out.append("")

    return "\n".join(out).rstrip() + "\n"


def explain(interp: Interpretation, subject: str) -> list[str]:
    """Every reason the engine recorded that mentions `subject`.

    Answers "why does this beam have this span?" for one object at a time.
    """
    lines: list[str] = []

    mi = interp.beams.get(subject)
    if mi is not None:
        for sp in mi.supports:
            lines.append(sp.reason)
        for span in mi.spans:
            lines.append(f"span {span.value:.3f} m - {span.reason}")
        for c in mi.cantilevers:
            lines.append(f"cantilever {c.value:.3f} m - {c.reason}")
        lines.extend(mi.rejected)

    for lintel in interp.lintels:
        if subject in (lintel.id, lintel.opening, lintel.host):
            lines.append(lintel.reason)
            lines.append(f"span {lintel.span.value:.3f} m - {lintel.span.reason}")
            lines.extend(j.reason for j in lintel.jambs)

    for ri in interp.roofs:
        if ri.roof == subject:
            lines.append(f"area {ri.area.value:.2f} m2 - {ri.area.reason}")
            lines.extend(f"{w.value} - {w.reason}"
                         for w in ri.supporting_members)
        else:
            lines.extend(w.reason for w in ri.supporting_members
                         if w.value == subject)

    for entry in interp.trace:
        if subject in entry and entry not in lines:
            lines.append(entry)

    return lines


def to_dict(model: StructuralModel, interp: Interpretation) -> dict:
    """The interpreted model as JSON, for the API and the review views."""
    return {
        "project": model.name,
        "roofs": [
            {
                "id": ri.roof,
                "area_m2": ri.area.value,
                "area_reason": ri.area.reason,
                "span_axis": ri.span_axis,
                "span_direction": list(ri.span_direction),
                "supporting_members": [
                    {"member": w.value, "reason": w.reason}
                    for w in ri.supporting_members
                ],
            }
            for ri in interp.roofs
        ],
        "beams": [
            {
                "id": mi.member,
                "continuity": mi.continuity,
                "supports": [
                    {"by": s.by, "kind": s.kind, "t_m": round(s.t, 4),
                     "at": list(s.at), "reason": s.reason}
                    for s in mi.supports
                ],
                "spans_m": [s.value for s in mi.spans],
                "span_reasons": [s.reason for s in mi.spans],
                "cantilevers_m": [c.value for c in mi.cantilevers],
                "rejected_supports": list(mi.rejected),
            }
            for mi in interp.beams.values()
        ],
        "lintels": [
            {
                "id": lintel.id,
                "host": lintel.host,
                "opening": lintel.opening,
                "clear_width_m": lintel.clear_width,
                "bearing_m": lintel.bearing,
                "span_m": lintel.span.value,
                "span_reason": lintel.span.reason,
                "reason": lintel.reason,
                "jambs": [{"id": j.id, "at": list(j.at), "side": j.side}
                          for j in lintel.jambs],
            }
            for lintel in interp.lintels
        ],
        "walls": [
            {
                "id": wi.wall,
                "carries": wi.carries,
                "openings": wi.openings,
                "foundations": wi.supported_by,
            }
            for wi in interp.walls.values()
        ],
        "nodes": [
            {"id": n.id, "at": list(n.point), "members": list(n.members)}
            for n in interp.topology.nodes
        ],
        "near_misses": [
            {"a": nm.a, "b": nm.b, "gap_mm": round(nm.gap * 1000, 1)}
            for nm in interp.topology.near_misses
        ],
        "trace": list(interp.trace),
    }
