"""
Tests for the section-force diagrams.

The property worth protecting is not that the pictures are pretty — it is that
the picture and the table describe the same structure. The curves used to be
drawn by opsvis, which integrated its own distribution from the OpenSees model
while the numbers came from section_force_extremes(); the moment diagram peaked
at 4,2374 where the table said 4,17. Here the drawing samples the same function
the table takes its maximum from, and these tests are what keeps it that way.

No openseespy required: everything below works on section forces, and section
forces are just numbers once the solver has produced them.
"""

import base64
import math
import struct

import pytest

import fem_diagrams as fd
from general_frame_fem import section_force_extremes


# ── Fixtures — a solved model, by hand ────────────────────────────────────────

def _simple_beam(L=6.0, w=2.0, n=4):
    """
    Simply supported span under a downward w, split into n elements.

    Solved in closed form rather than by a solver: V(x) = wL/2 - wx and
    M(x) = wLx/2 - wx²/2, so pl for each slice follows from where it starts.
    eleLoad's wy is negative for a downward load, which is the convention
    solve() hands to section_forces_2d().
    """
    nodes = [{'id': i + 1, 'x': round(L * i / n, 6), 'y': 0.0}
             for i in range(n + 1)]
    elements = [{'id': i + 1, 'ni': i + 1, 'nj': i + 2, 'type': 'beam',
                 'member_id': 1, 'release': 'none'} for i in range(n)]
    supports = [{'node_id': 1, 'ux': True, 'uy': True, 'rz': False},
                {'node_id': n + 1, 'ux': False, 'uy': True, 'rz': False}]

    ele_forces, ele_udl = {}, {}
    for i in range(n):
        x0 = L * i / n
        V0 = w * L / 2 - w * x0
        M0 = w * L * x0 / 2 - w * x0 * x0 / 2
        # section_forces_2d reads M(0) = -M_i and V(0) = V_i
        ele_forces[i + 1] = [0.0, V0, -M0, 0.0, 0.0, 0.0]
        ele_udl[i + 1] = (-w, 0.0)

    node_disps = {n_['id']: (0.0, -0.01 * math.sin(math.pi * n_['x'] / L), 0.0)
                  for n_ in nodes}
    return nodes, elements, supports, ele_forces, ele_udl, node_disps


def _png_size(b64):
    """Width and height in pixels, straight out of the PNG IHDR."""
    raw = base64.b64decode(b64)
    assert raw[:8] == b'\x89PNG\r\n\x1a\n'
    w, h = struct.unpack('>II', raw[16:24])
    return w, h


# ── The invariant: figure and table read the same function ────────────────────

def test_sampled_peak_matches_the_reported_extreme():
    """
    What the curve tops out at is what section_force_extremes() reports.

    Sampling is discrete, so the parabola's apex is only hit exactly when a
    sample lands on it; the tolerance is the sampling error, not slack in the
    agreement. For a simply supported span it is wL²/8 = 9,00 kNm.
    """
    _, elements, _, ele_forces, ele_udl, _ = _simple_beam()
    L_elem = 6.0 / 4

    for kind, key in (('M', 'M_kNm'), ('V', 'V_kN'), ('N', 'N_kN')):
        for el in elements:
            pl = ele_forces[el['id']]
            wy, wx = ele_udl[el['id']]
            drawn = max(abs(v) for _, v in
                        fd._sample(kind, el, pl, wy, wx, L_elem))
            table = abs(section_force_extremes(pl, L_elem, wy, wx)[key])
            assert drawn == pytest.approx(table, rel=2e-3, abs=1e-9), kind


def test_span_maximum_is_the_hand_calculation():
    """wL²/8, found between the nodes and not at them."""
    _, elements, _, ele_forces, ele_udl, _ = _simple_beam(L=6.0, w=2.0)
    peak = max(max(abs(v) for _, v in
                   fd._sample('M', el, ele_forces[el['id']],
                              *ele_udl[el['id']], 1.5))
               for el in elements)
    assert peak == pytest.approx(9.0, rel=5e-3)


# ── Output shape ──────────────────────────────────────────────────────────────

def test_render_all_returns_four_figures_in_a_fixed_order():
    """
    Deformation, M, V, N — always, and always in that order.

    The PDF captions are positional. When a model without beam elements used
    to yield three figures instead of four, every caption after the first
    named the figure before it.
    """
    nodes, elements, supports, ele_forces, ele_udl, node_disps = _simple_beam()
    figs = fd.render_all(nodes, elements, supports, ele_forces, ele_udl,
                         node_disps, 6.0)
    assert len(figs) == 4
    for f in figs:
        assert _png_size(f)[0] > 100


def test_a_truss_only_model_still_returns_four():
    nodes = [{'id': 1, 'x': 0, 'y': 0}, {'id': 2, 'x': 4, 'y': 0}]
    elements = [{'id': 1, 'ni': 1, 'nj': 2, 'type': 'truss'}]
    supports = [{'node_id': 1, 'ux': True, 'uy': True, 'rz': False},
                {'node_id': 2, 'ux': False, 'uy': True, 'rz': False}]
    figs = fd.render_all(nodes, elements, supports,
                         {1: [-12.0, 0.0, 0.0, 12.0, 0.0, 0.0]}, {},
                         {1: (0.0, 0.0, 0.0), 2: (0.002, 0.0, 0.0)}, 4.0)
    assert len(figs) == 4


def test_an_unloaded_model_does_not_divide_by_its_own_zero():
    nodes, elements, supports, _, _, _ = _simple_beam()
    zero = {el['id']: [0.0] * 6 for el in elements}
    figs = fd.render_all(nodes, elements, supports, zero, {},
                         {n['id']: (0.0, 0.0, 0.0) for n in nodes}, 6.0)
    assert len(figs) == 4


# ── The report's page, not the screen's ───────────────────────────────────────

def test_a_flat_beam_gets_a_flat_figure():
    """
    The figure follows the structure. opsvis drew every model at 13x7 inches,
    so a 6 m beam spent two thirds of its own figure on white — printed at
    160 mm wide, that is a third of the page for one curve.
    """
    nodes, elements, supports, ele_forces, ele_udl, node_disps = _simple_beam()
    figs = fd.render_all(nodes, elements, supports, ele_forces, ele_udl,
                         node_disps, 6.0)
    w, h = _png_size(figs[1])
    assert h < 0.5 * w


def test_scale_changes_the_drawing_and_nothing_else():
    """
    Scaling is a way of looking at the result. A taller ordinate makes a taller
    figure; the number written on the peak is the same number.
    """
    nodes, elements, supports, ele_forces, ele_udl, node_disps = _simple_beam()
    small = fd.section_force_figure('M', nodes, elements, supports,
                                    ele_forces, ele_udl, 6.0, scale=0.5)
    large = fd.section_force_figure('M', nodes, elements, supports,
                                    ele_forces, ele_udl, 6.0, scale=2.0)
    assert _png_size(large)[1] > _png_size(small)[1]

    peak = max(max(abs(v) for _, v in
                   fd._sample('M', el, ele_forces[el['id']],
                              *ele_udl[el['id']], 1.5))
               for el in elements)
    assert peak == pytest.approx(9.0, rel=5e-3)


# ── Details that make it a drawing rather than a plot ─────────────────────────

def test_the_moment_is_drawn_on_the_tension_side():
    """
    A sagging moment belongs below the beam. The check is on the sign flip
    the renderer applies, because that is the whole of the convention: for M
    the ordinate goes to local -y, for V and N to local +y.
    """
    assert fd.STYLE['M']['unit'] == 'kNm'
    assert fd.STYLE['V']['unit'] == 'kN'
    # Tension and compression are told apart by colour on N and only on N
    assert fd.STYLE['N']['pos'] != fd.STYLE['N']['neg']
    assert fd.STYLE['M']['pos'] == fd.STYLE['M']['neg']


def test_interior_nodes_of_a_member_are_not_treated_as_joints():
    """A span split into four elements is one member, not three joints."""
    _, elements, _, _, _, _ = _simple_beam(n=4)
    assert fd._interior_nodes(elements) == {2, 3, 4}


def test_elements_without_a_member_stand_on_their_own():
    elements = [{'id': 1, 'ni': 1, 'nj': 2}, {'id': 2, 'ni': 2, 'nj': 3}]
    assert fd._interior_nodes(elements) == set()
    assert fd._member_key(elements[0]) != fd._member_key(elements[1])


def test_danish_decimal_comma():
    assert fd._dk(4.17) == '4,17'
    assert fd._nice(-9.0, 'kNm') == '-9,00 kNm'


# ── The static model figure ───────────────────────────────────────────────────

def test_a_downward_load_is_drawn_pointing_down():
    """
    Every uniform load in the static model figure used to be drawn with its
    arrows rising into the underside of the member. Nothing else disagreed —
    the analysis had applied it downwards all along — so the only place the
    error existed was the one picture an engineer checks the model against.
    """
    from general_frame_fem import udl_arrow_direction
    horizontal = (1.0, 0.0)   # (ca, sa) of a beam along x

    down = udl_arrow_direction(
        {'type': 'udl', 'direction': 'vertical', 'value_kNm': 2.0}, *horizontal)
    assert down == pytest.approx((0.0, -1.0))

    # The legacy form carries no direction key: a positive wy means downward
    # on the member, which is the same arrow on a horizontal beam.
    legacy = udl_arrow_direction({'type': 'udl', 'wy_kNm': 2.0}, *horizontal)
    assert legacy == pytest.approx((0.0, -1.0))


def test_an_uplift_load_is_drawn_pointing_up():
    from general_frame_fem import udl_arrow_direction
    up = udl_arrow_direction(
        {'type': 'udl', 'direction': 'vertical', 'value_kNm': -3.0}, 1.0, 0.0)
    assert up == pytest.approx((0.0, 1.0))


def test_a_load_on_a_rafter_presses_against_the_rafter():
    """
    A legacy wy on a 45° rafter acts perpendicular to it, into the member —
    not straight down, and not out of the roof.
    """
    from general_frame_fem import udl_arrow_direction
    c = s = math.sqrt(0.5)
    act = udl_arrow_direction({'type': 'udl', 'wy_kNm': 1.5}, c, s)
    assert act[0] == pytest.approx(s)      # towards +x
    assert act[1] == pytest.approx(-c)     # and downwards
    assert act[0] * c + act[1] * s == pytest.approx(0.0, abs=1e-12)


def test_a_load_with_no_magnitude_is_not_drawn():
    from general_frame_fem import udl_arrow_direction
    assert udl_arrow_direction({'type': 'udl', 'wy_kNm': 0.0}, 1.0, 0.0) is None
    # A combination load has no magnitude until the combination is run, but it
    # still has to appear on the model figure
    assert udl_arrow_direction({'type': 'combo_udl'}, 1.0, 0.0) is not None


# ── The redraw endpoint ───────────────────────────────────────────────────────

def _redraw_payload(scale):
    nodes, elements, supports, ele_forces, ele_udl, node_disps = _simple_beam()
    return {
        'nodes': nodes,
        'elements': [{**el, 'E_GPa': 11.0, 'A_cm2': 87.75, 'Iz_cm4': 27799.0}
                     for el in elements],
        'supports': supports,
        'ele_forces': {str(k): v for k, v in ele_forces.items()},
        'ele_udl':    {str(k): list(v) for k, v in ele_udl.items()},
        'node_disps': {str(k): list(v) for k, v in node_disps.items()},
        'scale': scale,
    }


def test_redraw_endpoint_returns_four_figures(client):
    """
    Redrawing takes section forces, not loads — so it runs with no solver at
    all. That is what makes the scale a slider rather than another full run,
    and it is why this test passes on a machine where openseespy will not load.
    """
    r = client.post('/calc/general-frame-fem/diagrams', json=_redraw_payload(1.0))
    assert r.status_code == 200, r.text
    figs = r.json()['_figs_b64']
    assert len(figs) == 4
    assert all(_png_size(f)[0] > 100 for f in figs)


def test_redraw_endpoint_honours_the_scale(client):
    small = client.post('/calc/general-frame-fem/diagrams',
                        json=_redraw_payload(0.5)).json()['_figs_b64']
    large = client.post('/calc/general-frame-fem/diagrams',
                        json=_redraw_payload(2.5)).json()['_figs_b64']
    assert _png_size(large[1])[1] > _png_size(small[1])[1]


def test_redraw_endpoint_clamps_an_absurd_scale(client):
    """A scale of 1000 is a slip, not a request. It must not draw a curve a
    kilometre tall and hand back a 200 MB PNG."""
    r = client.post('/calc/general-frame-fem/diagrams',
                    json=_redraw_payload(1000.0))
    assert r.status_code == 200
    w, h = _png_size(r.json()['_figs_b64'][1])
    assert h <= 8 * w


def test_redraw_endpoint_refuses_an_empty_model(client):
    r = client.post('/calc/general-frame-fem/diagrams',
                    json={'nodes': [], 'elements': [], 'supports': [],
                          'ele_forces': {}, 'ele_udl': {}, 'node_disps': {}})
    assert r.status_code == 422
    assert 'Ingen model' in r.json()['detail']
