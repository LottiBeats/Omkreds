"""
Geometry, model and schema tests for the House Engine.

These are the deterministic foundations: if segment intersection or the JSON
reader is wrong, every interpretation built on top of them is wrong too.
"""

import json

import pytest

from house import geometry as g
from house.model import Beam, StructuralModel, Wall
from house.schema import (
    SchemaError, dumps_model, load_model, loads_model, model_to_dict,
)

TOL = 0.005


# -- segments -----------------------------------------------------------------

def test_crossing_is_found_with_parameters():
    hit, = g.intersect(g.Segment((0, 0), (4, 0)), g.Segment((2, -1), (2, 1)), TOL)
    assert hit.kind == "crossing"
    assert hit.point == pytest.approx((2.0, 0.0))
    assert hit.t1 == pytest.approx(2.0)
    assert hit.t2 == pytest.approx(1.0)


def test_endpoint_contact_is_touching_not_crossing():
    hit, = g.intersect(g.Segment((0, 0), (4, 0)), g.Segment((4, 0), (4, 3)), TOL)
    assert hit.kind == "touching"
    assert hit.t1 == pytest.approx(4.0)


def test_t_junction_is_touching():
    hit, = g.intersect(g.Segment((0, 0), (6, 0)), g.Segment((3, 0), (3, 2)), TOL)
    assert hit.kind == "touching"
    assert hit.t1 == pytest.approx(3.0)


def test_gap_larger_than_tolerance_is_not_a_contact():
    assert g.intersect(g.Segment((0, 0), (4, 0)),
                       g.Segment((4.047, 0), (4.047, 3)), TOL) == []


def test_gap_inside_tolerance_is_a_contact():
    hits = g.intersect(g.Segment((0, 0), (4, 0)),
                       g.Segment((4.003, 0), (4.003, 3)), TOL)
    assert len(hits) == 1


def test_collinear_overlap_returns_both_ends():
    hits = g.intersect(g.Segment((0, 0), (6, 0)), g.Segment((2, 0), (9, 0)), TOL)
    assert [h.kind for h in hits] == ["overlap", "overlap"]
    assert [round(h.t1, 3) for h in hits] == [2.0, 6.0]


def test_parallel_but_offset_segments_do_not_touch():
    assert g.intersect(g.Segment((0, 0), (6, 0)),
                       g.Segment((0, 0.5), (6, 0.5)), TOL) == []


def test_intersection_beyond_the_segment_ends_is_rejected():
    # The infinite lines cross at (8, 0), which is past the end of both.
    assert g.intersect(g.Segment((0, 0), (4, 0)),
                       g.Segment((8, 1), (8, 5)), TOL) == []


# -- polygons -----------------------------------------------------------------

def test_polygon_area_handles_open_and_closed_rings():
    open_ring = [(0, 0), (8.4, 0), (8.4, 6), (0, 6)]
    assert g.polygon_area(open_ring) == pytest.approx(50.4)
    assert g.polygon_area(open_ring + [(0, 0)]) == pytest.approx(50.4)


def test_point_in_polygon_includes_the_boundary():
    ring = [(0, 0), (6, 0), (6, 4), (0, 4)]
    assert g.point_in_polygon((3, 2), ring, TOL)
    assert g.point_in_polygon((0, 2), ring, TOL)      # on the edge
    assert not g.point_in_polygon((6.5, 2), ring, TOL)


# -- model --------------------------------------------------------------------

def test_wall_height_falls_back_to_the_level_height():
    model = StructuralModel(walls=[Wall("W01", (0, 0), (6, 0))])
    assert model.wall_height(model.wall("W01")) == 2.5
    model.walls[0].height = 3.2
    assert model.wall_height(model.wall("W01")) == 3.2


def test_grade_falls_back_to_the_model_assumption():
    model = StructuralModel(beams=[Beam("B01", (0, 0), (4, 0))])
    assert model.grade_of(model.beam("B01")) == "C24"


# -- schema -------------------------------------------------------------------

def test_reference_house_round_trips_through_json():
    model = load_model("house/examples/test_house_001.json")
    again = loads_model(dumps_model(model))
    assert model_to_dict(model) == model_to_dict(again)


def test_reference_house_reads_the_expected_objects():
    model = load_model("house/examples/test_house_001.json")
    assert [w.id for w in model.walls] == ["W01", "W02", "W03", "W04", "W05"]
    assert len(model.openings) == 3
    assert model.beam("B01").length == pytest.approx(4.8)
    assert model.roofs[0].plan_area == pytest.approx(50.4)


def test_unknown_field_is_rejected_rather_than_ignored():
    # A typo that silently turned a load-bearing wall non-structural would be
    # the worst possible failure mode, so unknown keys are an error.
    raw = {"schema_version": 1,
           "walls": [{"id": "W01", "start": [0, 0], "end": [6, 0],
                      "loadbearing": True}]}
    with pytest.raises(SchemaError, match="unknown field"):
        loads_model(json.dumps(raw))


def test_missing_required_field_is_reported_with_its_location():
    raw = {"schema_version": 1, "walls": [{"id": "W01", "start": [0, 0]}]}
    with pytest.raises(SchemaError, match=r"walls\[0\].*missing"):
        loads_model(json.dumps(raw))


def test_future_schema_version_is_refused():
    with pytest.raises(SchemaError, match="schema_version"):
        loads_model(json.dumps({"schema_version": 99}))


def test_malformed_point_is_reported():
    raw = {"schema_version": 1,
           "walls": [{"id": "W01", "start": [0], "end": [6, 0]}]}
    with pytest.raises(SchemaError, match="expected a point"):
        loads_model(json.dumps(raw))
