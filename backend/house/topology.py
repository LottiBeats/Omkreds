"""
house.topology - from geometry to connectivity.

The engine must not merely know that two objects are drawn near each other; it
has to know that W01 and B02 are structurally connected at node N01 (vision
section 6).  This module builds that graph, and - just as important - reports
the pairs that are *nearly* connected so the engineer can decide, rather than
the engine guessing (vision section 7).
"""

from __future__ import annotations

from dataclasses import dataclass, field

from . import geometry as g
from .model import StructuralModel


@dataclass(frozen=True)
class Contact:
    """One structural contact between two objects.

    t_a / t_b are arc lengths from each member's start point; for a column the
    value is 0.0.
    """

    a: str
    b: str
    point: g.Pt
    t_a: float
    t_b: float
    kind: str          # "crossing" | "touching" | "overlap" | "point"

    def other(self, member_id: str) -> str:
        return self.b if member_id == self.a else self.a

    def t_on(self, member_id: str) -> float:
        return self.t_a if member_id == self.a else self.t_b


@dataclass(frozen=True)
class NearMiss:
    """Two objects that almost touch: too far to connect, too close to ignore."""

    a: str
    b: str
    gap: float
    point_a: g.Pt
    point_b: g.Pt


@dataclass
class Node:
    id: str
    point: g.Pt
    members: tuple[str, ...] = ()


@dataclass
class Topology:
    nodes: list[Node] = field(default_factory=list)
    contacts: list[Contact] = field(default_factory=list)
    near_misses: list[NearMiss] = field(default_factory=list)
    applied_overrides: list[str] = field(default_factory=list)

    def contacts_of(self, member_id: str) -> list[Contact]:
        return [c for c in self.contacts
                if c.a == member_id or c.b == member_id]

    def neighbours(self, member_id: str) -> list[str]:
        return sorted({c.other(member_id) for c in self.contacts_of(member_id)})

    def node_at(self, point: g.Pt, tol: float) -> Node | None:
        return next((n for n in self.nodes
                     if g.same_point(n.point, point, tol)), None)

    def node_of(self, member_id: str) -> list[Node]:
        return [n for n in self.nodes if member_id in n.members]

    def is_isolated(self, member_id: str) -> bool:
        return not self.contacts_of(member_id)


# -- building -----------------------------------------------------------------

def _linear_members(model: StructuralModel) -> list[tuple[str, g.Segment]]:
    """Walls and beams, in a deterministic order."""
    items = [(w.id, w.segment) for w in model.walls]
    items += [(b.id, b.segment) for b in model.beams]
    return items


def _segment_gap(s1: g.Segment, s2: g.Segment) -> tuple[float, g.Pt, g.Pt]:
    """Smallest endpoint-to-segment distance between two non-touching segments."""
    best = (float("inf"), s1.a, s2.a)
    for p, other, flip in ((s1.a, s2, False), (s1.b, s2, False),
                           (s2.a, s1, True), (s2.b, s1, True)):
        d = other.distance_to(p)
        t = max(0.0, min(other.length, other.project(p)))
        q = other.point_at(t)
        if d < best[0]:
            best = (d, q, p) if flip else (d, p, q)
    return best


def build_topology(model: StructuralModel) -> Topology:
    """Build the structural graph for the model.

    Contacts are found between walls, beams and columns.  Every pair that does
    not touch but lies within Tolerances.max_gap_report is recorded as a near
    miss instead - the engine never bridges a gap it was not told to bridge.
    """
    tol = model.tolerances
    topo = Topology()

    ignored: set[frozenset[str]] = set()
    forced: list[tuple[str, str, str]] = []
    for ov in model.overrides:
        if ov.kind == "ignore" and ov.target:
            ignored.add(frozenset((ov.subject, ov.target)))
        elif ov.kind == "connect" and ov.target:
            forced.append((ov.subject, ov.target, ov.note))

    linear = _linear_members(model)

    # -- linear against linear ------------------------------------------------
    for i in range(len(linear)):
        id_a, seg_a = linear[i]
        for j in range(i + 1, len(linear)):
            id_b, seg_b = linear[j]
            if frozenset((id_a, id_b)) in ignored:
                topo.applied_overrides.append(
                    f"ignore: contact between {id_a} and {id_b} suppressed")
                continue
            hits = g.intersect(seg_a, seg_b, tol.node, tol.angle_deg)
            if hits:
                for h in hits:
                    topo.contacts.append(
                        Contact(id_a, id_b, g.round_pt(h.point),
                                h.t1, h.t2, h.kind))
                continue
            gap, pa, pb = _segment_gap(seg_a, seg_b)
            if tol.node < gap <= tol.max_gap_report:
                topo.near_misses.append(
                    NearMiss(id_a, id_b, gap, g.round_pt(pa), g.round_pt(pb)))

    # -- columns against linear members ---------------------------------------
    for col in model.columns:
        for member_id, seg in linear:
            if frozenset((col.id, member_id)) in ignored:
                topo.applied_overrides.append(
                    f"ignore: contact between {col.id} and {member_id} suppressed")
                continue
            d = seg.distance_to(col.at)
            if d <= tol.vertical_support:
                t = max(0.0, min(seg.length, seg.project(col.at)))
                topo.contacts.append(
                    Contact(col.id, member_id, g.round_pt(col.at), 0.0, t, "point"))
            elif d <= tol.max_gap_report:
                t = max(0.0, min(seg.length, seg.project(col.at)))
                topo.near_misses.append(
                    NearMiss(col.id, member_id, d, g.round_pt(col.at),
                             g.round_pt(seg.point_at(t))))

    # -- overrides that force a connection ------------------------------------
    seg_by_id = dict(linear)
    for a, b, note in forced:
        if any((c.a, c.b) in ((a, b), (b, a)) for c in topo.contacts):
            continue
        placed = _forced_contact(model, seg_by_id, a, b)
        if placed is None:
            continue
        topo.contacts.append(placed)
        topo.near_misses = [nm for nm in topo.near_misses
                            if {nm.a, nm.b} != {a, b}]
        topo.applied_overrides.append(
            f"connect: {a} and {b} connected by engineer's override"
            + (f" ({note})" if note else ""))

    _build_nodes(model, topo)
    return topo


def _forced_contact(model: StructuralModel, seg_by_id: dict,
                    a: str, b: str) -> Contact | None:
    """Place an engineer-ordered connection at the closest point of the pair.

    The override says *that* two objects are connected; where they meet is
    still read from the geometry, so the contact lands at the near end rather
    than at some arbitrary point on the members.
    """
    seg_a, seg_b = seg_by_id.get(a), seg_by_id.get(b)
    col_a = model.column(a)
    col_b = model.column(b)

    if seg_a is not None and seg_b is not None:
        _, pa, pb = _segment_gap(seg_a, seg_b)
        point = g.scale(g.add(pa, pb), 0.5)
    elif seg_a is not None and col_b is not None:
        point = col_b.at
    elif seg_b is not None and col_a is not None:
        point = col_a.at
    elif col_a is not None and col_b is not None:
        point = g.scale(g.add(col_a.at, col_b.at), 0.5)
    else:
        return None

    t_a = max(0.0, min(seg_a.length, seg_a.project(point))) if seg_a else 0.0
    t_b = max(0.0, min(seg_b.length, seg_b.project(point))) if seg_b else 0.0
    kind = "point" if (col_a or col_b) else "touching"
    return Contact(a, b, g.round_pt(point), t_a, t_b, kind)


def _build_nodes(model: StructuralModel, topo: Topology) -> None:
    """Cluster contact points and member ends into named nodes."""
    tol = model.tolerances.node

    raw: list[tuple[g.Pt, str]] = []
    for c in topo.contacts:
        raw.append((c.point, c.a))
        raw.append((c.point, c.b))
    for member_id, seg in _linear_members(model):
        raw.append((seg.a, member_id))
        raw.append((seg.b, member_id))
    for col in model.columns:
        raw.append((col.at, col.id))

    clusters: list[tuple[g.Pt, set[str]]] = []
    for point, member_id in raw:
        for idx, (centre, members) in enumerate(clusters):
            if g.same_point(centre, point, tol):
                members.add(member_id)
                break
        else:
            clusters.append((g.round_pt(point), {member_id}))

    clusters.sort(key=lambda c: (c[0][1], c[0][0]))
    topo.nodes = [Node(f"N{idx + 1:02d}", centre, tuple(sorted(members)))
                  for idx, (centre, members) in enumerate(clusters)]
