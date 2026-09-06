"""
house.model - the Structural Model.

This is the source of truth of the vision document: the one place where a wall
is a wall.  It holds only what the engineer *authored*.  Everything the engine
works out from it (nodes, supports, spans, lintels) lives in Interpretation and
is never written back here.

Units: metres, kN, kN/m, kN/m2, degrees.  Plan angles are measured from +x.

The MVP scope is deliberately narrow (vision section 2): one storey, timber
frame, mostly orthogonal walls, simple roof.  Fields a later milestone needs are
present only where leaving them out would force a schema break.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .geometry import Pt, Segment, polygon_area

# Load duration classes, EN 1995-1-1 Table 2.1 - kept as plain strings so the
# model stays free of the calculation modules' vocabulary.
LOAD_DURATIONS = ("permanent", "long", "medium", "short", "instant")


# -- project frame ------------------------------------------------------------

@dataclass
class Tolerances:
    """Geometric tolerances, in metres.

    These are model data, not module constants: two projects may legitimately
    need different tolerances, and the value used has to be reportable next to
    any connection the engine inferred from it.
    """

    node: float = 0.005              # 5 mm - points merged into one node
    wall_alignment: float = 0.010    # 10 mm - walls treated as collinear
    vertical_support: float = 0.020  # 20 mm - member accepted as supported
    angle_deg: float = 0.5           # directions treated as parallel

    #: contacts further apart than this are never guessed at, only reported
    max_gap_report: float = 0.100    # 100 mm


@dataclass
class Assumptions:
    """Model assumptions as first-class data (vision section 19).

    Every one of these is printed in the static documentation and shown in the
    model review, so that no engineering assumption is a hidden default.
    """

    roof_diaphragm: str = "rigid"           # "rigid" | "flexible"
    beam_joints: str = "pinned"             # "pinned" | "continuous"
    wall_load_distribution: str = "tributary"
    default_timber_grade: str = "C24"
    service_class: int = 1
    consequence_class: str = "CC2"
    lintel_bearing: float = 0.10            # m each side of the opening
    notes: list[str] = field(default_factory=list)


@dataclass
class Level:
    id: str
    elevation: float = 0.0      # top of floor structure, m
    height: float = 2.5         # storey height, m
    name: str = ""


# -- members ------------------------------------------------------------------

@dataclass
class Wall:
    id: str
    start: Pt
    end: Pt
    level: str = "GF"
    height: float | None = None      # None -> take the level height
    thickness: float = 0.20
    wall_type: str = ""
    load_bearing: bool = True
    stabilising: bool = False
    exterior: bool = True

    @property
    def segment(self) -> Segment:
        return Segment(self.start, self.end)

    @property
    def length(self) -> float:
        return self.segment.length


@dataclass
class Opening:
    id: str
    host: str                    # wall id
    position: float              # m along the wall to the opening's near edge
    width: float
    height: float = 1.2
    sill_height: float = 0.9
    kind: str = "window"         # "window" | "door"

    @property
    def end_position(self) -> float:
        return self.position + self.width


@dataclass
class Beam:
    id: str
    start: Pt
    end: Pt
    level: str = "GF"
    material: str = "timber"
    grade: str = ""              # "" -> assumptions.default_timber_grade
    section: str = ""            # e.g. "45x220"; "" -> to be sized
    continuity: str = "simple"   # "simple" | "continuous" - never guessed
    role: str = "main_beam"

    @property
    def segment(self) -> Segment:
        return Segment(self.start, self.end)

    @property
    def length(self) -> float:
        return self.segment.length


@dataclass
class Column:
    id: str
    at: Pt
    level: str = "GF"
    height: float | None = None
    material: str = "timber"
    grade: str = ""
    section: str = ""
    role: str = "column"         # "column" | "jamb"


@dataclass
class Roof:
    id: str
    outline: list[Pt]                        # plan outline, open or closed ring
    kind: str = "pitched"                    # "pitched" | "flat"
    pitch: float = 25.0                      # degrees
    span_direction: Pt = (0.0, 1.0)          # authored, not derived
    level: str = "GF"
    g_k: float = 0.8                         # kN/m2 on plan
    q_k: float = 0.0                         # kN/m2 imposed, maintenance
    s_k: float = 0.0                         # kN/m2 snow on plan

    @property
    def plan_area(self) -> float:
        return polygon_area(self.outline)


@dataclass
class Floor:
    id: str
    outline: list[Pt]
    level: str = "GF"
    kind: str = "slab_on_grade"              # "slab_on_grade" | "joists"
    span_direction: Pt | None = None         # None for a ground-bearing slab
    g_k: float = 1.0
    q_k: float = 2.0

    @property
    def plan_area(self) -> float:
        return polygon_area(self.outline)


@dataclass
class Foundation:
    id: str
    kind: str = "strip"                      # "strip" | "pad"
    supports: str = ""                       # id of the wall or column carried
    width: float = 0.4
    depth: float = 0.9


# -- overrides ----------------------------------------------------------------

@dataclass
class Override:
    """An engineer's correction of the engine's interpretation.

    Overrides are authored input, so a corrected model stays reproducible: the
    interpretation remains a pure function of the model.  Every override that
    was applied is reported, so a corrected model never looks like a clean one.
    """

    kind: str                    # "connect" | "ignore" | "support" | "set"
    subject: str                 # id the override acts on
    target: str = ""             # second id, for connect/support
    value: str = ""              # for "set"
    note: str = ""


# -- the model ----------------------------------------------------------------

@dataclass
class StructuralModel:
    name: str = "Untitled"
    levels: list[Level] = field(default_factory=lambda: [Level("GF")])
    walls: list[Wall] = field(default_factory=list)
    openings: list[Opening] = field(default_factory=list)
    beams: list[Beam] = field(default_factory=list)
    columns: list[Column] = field(default_factory=list)
    roofs: list[Roof] = field(default_factory=list)
    floors: list[Floor] = field(default_factory=list)
    foundations: list[Foundation] = field(default_factory=list)
    assumptions: Assumptions = field(default_factory=Assumptions)
    tolerances: Tolerances = field(default_factory=Tolerances)
    overrides: list[Override] = field(default_factory=list)

    # -- lookup ---------------------------------------------------------------

    def wall(self, wid: str) -> Wall | None:
        return next((w for w in self.walls if w.id == wid), None)

    def beam(self, bid: str) -> Beam | None:
        return next((b for b in self.beams if b.id == bid), None)

    def column(self, cid: str) -> Column | None:
        return next((c for c in self.columns if c.id == cid), None)

    def level(self, lid: str) -> Level | None:
        return next((lv for lv in self.levels if lv.id == lid), None)

    def openings_in(self, wall_id: str) -> list[Opening]:
        return [o for o in self.openings if o.host == wall_id]

    def member(self, mid: str):
        """Any load-carrying object by id."""
        for group in (self.walls, self.beams, self.columns, self.roofs,
                      self.floors, self.foundations, self.openings):
            hit = next((x for x in group if x.id == mid), None)
            if hit is not None:
                return hit
        return None

    @property
    def member_ids(self) -> list[str]:
        return ([w.id for w in self.walls] + [b.id for b in self.beams]
                + [c.id for c in self.columns] + [r.id for r in self.roofs]
                + [f.id for f in self.floors] + [f.id for f in self.foundations])

    def wall_height(self, wall: Wall) -> float:
        if wall.height is not None:
            return wall.height
        lvl = self.level(wall.level)
        return lvl.height if lvl else 2.5

    def grade_of(self, member) -> str:
        grade = getattr(member, "grade", "")
        return grade or self.assumptions.default_timber_grade
