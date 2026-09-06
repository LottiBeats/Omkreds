"""
house.geometry — 2D plan geometry primitives for the structural model.

Pure standard library.  All coordinates are metres in the project plan
coordinate system (x to the right, y up when seen in plan).

Real CAD geometry is never mathematically exact, so every predicate here takes
an explicit tolerance.  Nothing in this module has a hidden default tolerance:
the caller supplies it, and the caller gets it from Tolerances on the model.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

Pt = tuple[float, float]


# ── vector helpers ────────────────────────────────────────────────────────────

def add(a: Pt, b: Pt) -> Pt:
    return (a[0] + b[0], a[1] + b[1])


def sub(a: Pt, b: Pt) -> Pt:
    return (a[0] - b[0], a[1] - b[1])


def scale(a: Pt, f: float) -> Pt:
    return (a[0] * f, a[1] * f)


def dot(a: Pt, b: Pt) -> float:
    return a[0] * b[0] + a[1] * b[1]


def cross(a: Pt, b: Pt) -> float:
    """z-component of the 3D cross product — positive when b is left of a."""
    return a[0] * b[1] - a[1] * b[0]


def length(a: Pt) -> float:
    return math.hypot(a[0], a[1])


def distance(a: Pt, b: Pt) -> float:
    return math.hypot(b[0] - a[0], b[1] - a[1])


def normalise(a: Pt) -> Pt:
    n = length(a)
    if n == 0.0:
        raise ValueError("cannot normalise a zero-length vector")
    return (a[0] / n, a[1] / n)


def same_point(a: Pt, b: Pt, tol: float) -> bool:
    return distance(a, b) <= tol


def round_pt(p: Pt, decimals: int = 6) -> Pt:
    return (round(p[0], decimals), round(p[1], decimals))


# ── segments ──────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Segment:
    """A straight plan segment from a to b."""

    a: Pt
    b: Pt

    @property
    def length(self) -> float:
        return distance(self.a, self.b)

    @property
    def vector(self) -> Pt:
        return sub(self.b, self.a)

    @property
    def direction(self) -> Pt:
        return normalise(self.vector)

    def point_at(self, t: float) -> Pt:
        """Point at arc length t from a (metres, not normalised)."""
        d = self.direction
        return (self.a[0] + d[0] * t, self.a[1] + d[1] * t)

    def project(self, p: Pt) -> float:
        """Arc length from a of the projection of p onto the infinite line."""
        v = self.vector
        L = self.length
        if L == 0.0:
            return 0.0
        return dot(sub(p, self.a), v) / L

    def distance_to(self, p: Pt) -> float:
        """Perpendicular distance to the segment (clamped to its ends)."""
        L = self.length
        if L == 0.0:
            return distance(self.a, p)
        t = max(0.0, min(L, self.project(p)))
        return distance(self.point_at(t), p)

    def contains(self, p: Pt, tol: float) -> bool:
        """True when p lies on the segment, endpoints included."""
        if self.distance_to(p) > tol:
            return False
        t = self.project(p)
        return -tol <= t <= self.length + tol

    def is_parallel_to(self, other: "Segment", angle_tol_deg: float) -> bool:
        try:
            u, v = self.direction, other.direction
        except ValueError:
            return False
        c = max(-1.0, min(1.0, abs(dot(u, v))))
        return math.degrees(math.acos(c)) <= angle_tol_deg


@dataclass(frozen=True)
class Hit:
    """One geometric contact between two segments.

    t1 / t2 are arc lengths from the respective start points, so
    ``seg1.point_at(hit.t1)`` reproduces the point.
    """

    point: Pt
    t1: float
    t2: float
    kind: str  # "crossing" | "touching" | "overlap"


def intersect(s1: Segment, s2: Segment, tol: float,
              angle_tol_deg: float = 0.5) -> list[Hit]:
    """Contacts between two segments.

    Returns crossings, endpoint contacts (T- and L-junctions) and, for
    collinear segments, the endpoints of the overlapping stretch.  An empty
    list means the segments do not touch within the tolerance.
    """
    if s1.length == 0.0 or s2.length == 0.0:
        return []

    v1, v2 = s1.vector, s2.vector
    denom = cross(v1, v2)

    if not s1.is_parallel_to(s2, angle_tol_deg):
        # Non-parallel: solve for the single intersection of the infinite lines,
        # then accept it only if it lies on both segments within tolerance.
        w = sub(s2.a, s1.a)
        u = cross(w, v2) / denom          # parametric position on s1 in [0, 1]
        p = (s1.a[0] + v1[0] * u, s1.a[1] + v1[1] * u)
        if s1.distance_to(p) > tol or s2.distance_to(p) > tol:
            return []
        t1 = max(0.0, min(s1.length, s1.project(p)))
        t2 = max(0.0, min(s2.length, s2.project(p)))
        at_end1 = t1 <= tol or t1 >= s1.length - tol
        at_end2 = t2 <= tol or t2 >= s2.length - tol
        kind = "touching" if (at_end1 or at_end2) else "crossing"
        return [Hit(s1.point_at(t1), t1, t2, kind)]

    # Parallel: only collinear pairs can touch.
    if s1.distance_to(s2.a) > tol and s1.distance_to(s2.b) > tol:
        return []
    ta, tb = sorted((s1.project(s2.a), s1.project(s2.b)))
    lo = max(0.0, ta)
    hi = min(s1.length, tb)
    if hi < lo - tol:
        return []
    if hi - lo <= tol:                     # collinear, meeting end to end
        p = s1.point_at(lo)
        return [Hit(p, lo, s2.project(p), "touching")]
    hits = []
    for t1 in (lo, hi):
        p = s1.point_at(t1)
        hits.append(Hit(p, t1, max(0.0, min(s2.length, s2.project(p))), "overlap"))
    return hits


# ── polygons ──────────────────────────────────────────────────────────────────

def polygon_area(pts: list[Pt]) -> float:
    """Unsigned area by the shoelace formula.  The ring may be open or closed."""
    ring = list(pts)
    if len(ring) >= 2 and same_point(ring[0], ring[-1], 1e-9):
        ring = ring[:-1]
    if len(ring) < 3:
        return 0.0
    s = 0.0
    for i in range(len(ring)):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % len(ring)]
        s += x1 * y2 - x2 * y1
    return abs(s) / 2.0


def polygon_is_closed(pts: list[Pt], tol: float) -> bool:
    return len(pts) >= 3 and same_point(pts[0], pts[-1], tol)


def point_in_polygon(p: Pt, ring: list[Pt], tol: float) -> bool:
    """True when p is inside the ring or on its boundary within tol."""
    pts = list(ring)
    if len(pts) >= 2 and same_point(pts[0], pts[-1], 1e-9):
        pts = pts[:-1]
    if len(pts) < 3:
        return False
    for i in range(len(pts)):
        if Segment(pts[i], pts[(i + 1) % len(pts)]).distance_to(p) <= tol:
            return True
    inside = False
    x, y = p
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        if (y1 > y) != (y2 > y):
            x_cross = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
            if x_cross > x:
                inside = not inside
    return inside


def bounding_box(pts: list[Pt]) -> tuple[Pt, Pt]:
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return (min(xs), min(ys)), (max(xs), max(ys))
