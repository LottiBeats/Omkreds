"""
The reference building library (vision document section 30).

Ten very small buildings whose answers are known in advance, plus the full
reference house.  A hundred small deterministic tests are worth more than five
large houses where it is hard to tell what went wrong, so each building here
isolates one behaviour of the interpreter.
"""

import pytest

from house import check_model, interpret, load_model
from house.model import (
    Beam, Column, Foundation, Opening, Override, Roof, StructuralModel, Wall,
)
from house.report import describe, explain, to_dict

REFERENCE = "house/examples/test_house_001.json"


# -- helpers ------------------------------------------------------------------

def rect_walls(width: float, depth: float, **kw) -> list[Wall]:
    """Four exterior walls around a rectangle, W01 (south) counter-clockwise."""
    corners = [(0.0, 0.0), (width, 0.0), (width, depth), (0.0, depth)]
    return [Wall(f"W{i + 1:02d}", corners[i], corners[(i + 1) % 4], **kw)
            for i in range(4)]


def codes(result) -> list[str]:
    return [i.code for i in result.issues]


def run(model):
    interp = interpret(model)
    return interp, check_model(model, interp)


# -- TEST 001 - simple rectangle ----------------------------------------------

def test_001_rectangle_closes_into_four_corner_nodes():
    model = StructuralModel(name="TEST 001", walls=rect_walls(8.0, 5.0))
    interp, result = run(model)

    corners = [n for n in interp.topology.nodes if len(n.members) == 2]
    assert len(corners) == 4
    assert {n.members for n in corners} == {
        ("W01", "W02"), ("W02", "W03"), ("W03", "W04"), ("W01", "W04")}
    assert "wall_isolated" not in codes(result)
    assert not result.blocks_calculation


# -- TEST 002 - rectangle + internal bearing wall ------------------------------

def test_002_internal_wall_connects_to_both_side_walls():
    model = StructuralModel(name="TEST 002", walls=rect_walls(8.0, 6.0))
    model.walls.append(Wall("W05", (0.0, 3.0), (8.0, 3.0), exterior=False))
    interp, result = run(model)

    assert set(interp.topology.neighbours("W05")) == {"W02", "W04"}
    assert not result.blocks_calculation


# -- TEST 003 - one window -----------------------------------------------------

def test_003_one_window_generates_one_lintel():
    model = StructuralModel(name="TEST 003", walls=rect_walls(8.0, 5.0))
    model.openings.append(Opening("O01", "W01", position=2.1, width=1.8))
    interp, _ = run(model)

    lintel, = interp.lintels
    assert lintel.id == "L01"
    assert lintel.host == "W01"
    # clear opening + 0.10 m bearing at each end (model assumption)
    assert lintel.span.value == pytest.approx(2.0)
    assert [j.at for j in lintel.jambs] == [(2.1, 0.0), (3.9, 0.0)]
    assert "bearing" in lintel.span.reason


def test_003_no_lintel_over_a_non_load_bearing_wall():
    model = StructuralModel(name="TEST 003b", walls=rect_walls(8.0, 5.0))
    model.walls[0].load_bearing = False
    model.openings.append(Opening("O01", "W01", position=2.1, width=1.8))
    interp, _ = run(model)

    assert interp.lintels == []
    assert any("not load-bearing" in t for t in interp.trace)


def test_003_opening_outside_the_wall_is_a_critical_error():
    model = StructuralModel(name="TEST 003c", walls=rect_walls(8.0, 5.0))
    model.openings.append(Opening("O01", "W01", position=7.5, width=1.8))
    _, result = run(model)

    assert "opening_outside_wall" in [i.code for i in result.critical]


# -- TEST 004 - multiple windows ----------------------------------------------

def test_004_lintels_are_numbered_in_order():
    model = StructuralModel(name="TEST 004", walls=rect_walls(9.0, 5.0))
    model.openings += [
        Opening("O01", "W01", position=1.2, width=1.8),
        Opening("O02", "W01", position=5.4, width=1.2),
        Opening("O03", "W03", position=3.0, width=0.9),
    ]
    interp, _ = run(model)

    assert [l.id for l in interp.lintels] == ["L01", "L02", "L03"]
    assert [round(l.span.value, 3) for l in interp.lintels] == [2.0, 1.4, 1.1]


def test_004_overlapping_openings_are_reported():
    model = StructuralModel(name="TEST 004b", walls=rect_walls(9.0, 5.0))
    model.openings += [
        Opening("O01", "W01", position=1.0, width=2.0),
        Opening("O02", "W01", position=2.5, width=1.0),
    ]
    _, result = run(model)

    assert "openings_overlap" in codes(result)


# -- TEST 005 - main beam + column --------------------------------------------

def test_005_column_splits_the_beam_into_two_spans():
    model = StructuralModel(name="TEST 005", walls=rect_walls(8.0, 6.0))
    model.beams.append(Beam("B01", (0.0, 3.0), (8.0, 3.0)))
    model.columns.append(Column("C01", (4.0, 3.0)))
    interp, result = run(model)

    mi = interp.beams["B01"]
    assert [s.by for s in mi.supports] == ["W04", "C01", "W02"]
    assert [round(s.value, 3) for s in mi.spans] == [4.0, 4.0]
    # Three supports on a beam declared 'simple' must not be resolved silently.
    assert "beam_continuity" in codes(result)


def test_005_declaring_continuity_removes_the_warning():
    model = StructuralModel(name="TEST 005b", walls=rect_walls(8.0, 6.0))
    model.beams.append(Beam("B01", (0.0, 3.0), (8.0, 3.0),
                            continuity="continuous"))
    model.columns.append(Column("C01", (4.0, 3.0)))
    _, result = run(model)

    assert "beam_continuity" not in codes(result)


# -- TEST 006 - asymmetric supports -------------------------------------------

def test_006_overhang_beyond_the_last_support_is_a_cantilever():
    model = StructuralModel(name="TEST 006", walls=rect_walls(8.0, 6.0))
    model.walls.append(Wall("W05", (5.0, 3.0), (5.0, 6.0), exterior=False))
    model.beams.append(Beam("B01", (0.0, 3.0), (8.0, 3.0)))
    interp, _ = run(model)

    mi = interp.beams["B01"]
    assert [s.by for s in mi.supports] == ["W04", "W05", "W02"]
    assert [round(s.value, 3) for s in mi.spans] == [5.0, 3.0]
    assert mi.cantilevers == []


def test_006_beam_running_past_its_last_support_reports_the_overhang():
    model = StructuralModel(name="TEST 006b", walls=rect_walls(8.0, 6.0))
    model.walls.append(Wall("W05", (5.0, 3.0), (5.0, 6.0), exterior=False))
    model.walls[1].load_bearing = False           # W02 no longer supports
    model.beams.append(Beam("B01", (0.0, 3.0), (8.0, 3.0)))
    interp, result = run(model)

    mi = interp.beams["B01"]
    assert [s.by for s in mi.supports] == ["W04", "W05"]
    assert round(mi.cantilevers[0].value, 3) == 3.0
    assert "support_rejected" in codes(result)
    assert any("not load-bearing" in i.message for i in result.warnings)


# -- TEST 007 - roof span direction -------------------------------------------

def test_007_span_direction_decides_which_walls_carry_the_roof():
    outline = [(0.0, 0.0), (8.0, 0.0), (8.0, 6.0), (0.0, 6.0)]

    north_south = StructuralModel(name="TEST 007a", walls=rect_walls(8.0, 6.0),
                                  roofs=[Roof("R01", outline,
                                              span_direction=(0.0, 1.0))])
    east_west = StructuralModel(name="TEST 007b", walls=rect_walls(8.0, 6.0),
                                roofs=[Roof("R01", outline,
                                            span_direction=(1.0, 0.0))])

    ns, _ = run(north_south)
    ew, _ = run(east_west)

    assert [m.value for m in ns.roofs[0].supporting_members] == ["W01", "W03"]
    assert [m.value for m in ew.roofs[0].supporting_members] == ["W02", "W04"]
    assert ns.roofs[0].span_axis == "Y"
    assert ew.roofs[0].span_axis == "X"
    assert ns.roofs[0].area.value == pytest.approx(48.0)


def test_007_roof_with_no_perpendicular_wall_is_critical():
    model = StructuralModel(
        name="TEST 007c",
        walls=[Wall("W01", (0.0, 0.0), (8.0, 0.0)),
               Wall("W03", (8.0, 6.0), (0.0, 6.0))],
        roofs=[Roof("R01", [(0.0, 0.0), (8.0, 0.0), (8.0, 6.0), (0.0, 6.0)],
                    span_direction=(1.0, 0.0))],
    )
    _, result = run(model)

    assert "roof_unsupported" in [i.code for i in result.critical]


# -- TEST 008 - stability walls -----------------------------------------------

def test_008_missing_stabilising_walls_in_one_direction_is_reported():
    walls = rect_walls(8.0, 6.0)
    walls[0].stabilising = True          # W01 runs in X
    walls[2].stabilising = True          # W03 runs in X
    _, result = run(StructuralModel(name="TEST 008", walls=walls))

    messages = [i.message for i in result.warnings if i.code == "no_stabilising_walls"]
    assert len(messages) == 1
    assert "Y direction" in messages[0]


# -- TEST 009 - unsupported objects -------------------------------------------

def test_009_floating_wall_and_half_supported_beam_are_caught():
    model = StructuralModel(name="TEST 009", walls=rect_walls(8.0, 6.0))
    model.walls.append(Wall("W07", (20.0, 20.0), (23.0, 20.0)))
    model.beams.append(Beam("B01", (0.0, 3.0), (4.0, 3.0)))
    _, result = run(model)

    assert "wall_isolated" in codes(result)
    assert "beam_unsupported" in [i.code for i in result.critical]
    assert result.blocks_calculation


def test_009_beam_bearing_inside_an_opening_is_not_a_support():
    model = StructuralModel(name="TEST 009b", walls=rect_walls(8.0, 6.0))
    # The beam lands on W02 exactly where a door interrupts it.
    model.openings.append(Opening("O01", "W02", position=2.4, width=1.2,
                                  kind="door"))
    model.beams.append(Beam("B01", (0.0, 3.0), (8.0, 3.0)))
    interp, result = run(model)

    mi = interp.beams["B01"]
    assert [s.by for s in mi.supports] == ["W04"]
    assert any("inside opening O01" in r for r in mi.rejected)
    assert "beam_unsupported" in [i.code for i in result.critical]


# -- TEST 010 - small geometry gap --------------------------------------------

def test_010_small_gap_is_reported_and_never_bridged_silently():
    model = StructuralModel(name="TEST 010", walls=rect_walls(8.0, 6.0))
    model.beams.append(Beam("B01", (0.0, 3.0), (7.953, 3.0)))   # 47 mm short
    interp, result = run(model)

    near, = [nm for nm in interp.topology.near_misses if nm.b == "W02"
             or nm.a == "W02"]
    assert round(near.gap * 1000) == 47
    assert "near_miss" in codes(result)
    assert [s.by for s in interp.beams["B01"].supports] == ["W04"]


def test_010_connect_override_resolves_the_gap_and_is_reported():
    model = StructuralModel(name="TEST 010b", walls=rect_walls(8.0, 6.0))
    model.beams.append(Beam("B01", (0.0, 3.0), (7.953, 3.0)))
    model.overrides.append(Override(kind="connect", subject="B01", target="W02",
                                    note="47 mm modelling gap accepted"))
    interp, result = run(model)

    mi = interp.beams["B01"]
    assert [s.by for s in mi.supports] == ["W04", "W02"]
    assert round(mi.spans[0].value, 3) == 7.953
    assert "near_miss" not in codes(result)
    # A corrected model must never look like a clean one.
    assert any("override" in t for t in interp.trace)


def test_010_ignore_override_suppresses_a_contact():
    model = StructuralModel(name="TEST 010c", walls=rect_walls(8.0, 6.0))
    model.beams.append(Beam("B01", (0.0, 3.0), (8.0, 3.0)))
    model.overrides.append(Override(kind="ignore", subject="B01", target="W02"))
    interp, _ = run(model)

    assert [s.by for s in interp.beams["B01"].supports] == ["W04"]


# -- the reference house -------------------------------------------------------

def test_reference_house_reaches_the_first_checkpoint():
    model = load_model(REFERENCE)
    interp, result = run(model)

    assert not result.blocks_calculation

    beam = interp.beams["B01"]
    assert [s.by for s in beam.supports] == ["W05", "W02"]
    assert round(beam.spans[0].value, 3) == 4.8

    assert [(l.id, round(l.clear_width, 2)) for l in interp.lintels] == [
        ("L01", 1.8), ("L02", 1.2), ("L03", 0.9)]

    roof = interp.roofs[0]
    assert roof.area.value == pytest.approx(50.4)
    assert roof.span_axis == "Y"
    assert [m.value for m in roof.supporting_members] == \
        ["W01", "W03", "W05", "B01"]


def test_reference_house_description_matches_the_checkpoint_format():
    model = load_model(REFERENCE)
    interp = interpret(model)
    text = describe(model, interp)

    assert "Roof R01" in text
    assert "Span direction: Y" in text
    assert "Supports:       W05 / W02" in text
    assert "Lintel L03" in text


def test_every_derived_number_can_explain_itself():
    model = load_model(REFERENCE)
    interp = interpret(model)

    why_span = explain(interp, "B01")
    assert any("W05" in line and "4.800" in line for line in why_span)

    why_lintel = explain(interp, "L01")
    assert any("interrupts load-bearing wall W01" in line for line in why_lintel)
    assert any("bearing at each end" in line for line in why_lintel)


def test_interpretation_serialises_with_its_reasons():
    model = load_model(REFERENCE)
    data = to_dict(model, interpret(model))

    assert data["beams"][0]["spans_m"] == [4.8]
    assert data["beams"][0]["span_reasons"][0].startswith("between W05")
    assert data["lintels"][0]["span_m"] == pytest.approx(2.0)
    assert data["near_misses"] == []


def test_interpretation_does_not_mutate_the_model():
    model = load_model(REFERENCE)
    before = (len(model.walls), len(model.beams), len(model.columns),
              len(model.openings))
    interpret(model)
    interpret(model)
    after = (len(model.walls), len(model.beams), len(model.columns),
             len(model.openings))
    assert before == after


def test_foundation_missing_under_a_load_bearing_wall_is_a_warning():
    model = load_model(REFERENCE)
    model.foundations = [f for f in model.foundations if f.supports != "W05"]
    _, result = run(model)

    assert any(i.code == "wall_no_foundation" and "W05" in i.message
               for i in result.warnings)


def test_duplicate_ids_are_critical():
    model = StructuralModel(name="dup", walls=rect_walls(8.0, 6.0))
    model.walls.append(Wall("W01", (2.0, 0.0), (2.0, 6.0)))
    _, result = run(model)

    assert "duplicate_id" in [i.code for i in result.critical]


def test_unknown_level_reference_is_critical():
    model = StructuralModel(name="lvl", walls=rect_walls(8.0, 6.0))
    model.walls[0].level = "1ST"
    _, result = run(model)

    assert "unknown_level" in [i.code for i in result.critical]


def test_foundation_ids_do_not_collide_with_wall_ids():
    model = StructuralModel(
        name="ids",
        walls=rect_walls(8.0, 6.0),
        foundations=[Foundation("W01", supports="W01")],
    )
    _, result = run(model)

    assert "duplicate_id" in [i.code for i in result.critical]
