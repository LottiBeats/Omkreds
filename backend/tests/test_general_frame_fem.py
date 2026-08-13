"""
test_general_frame_fem.py — general 2D frame FEM

Three groups:

1. Load projection. Pure trigonometry, no solver needed. Each case is checked
   by reconstructing the global load vector that OpenSees will end up applying
   and comparing it with the load the engineer asked for — so the test states
   the physics rather than restating the implementation.

2. Model validation. Also solver-free: the point of validate_model() is to
   reject models before they reach OpenSees.

3. Closed-form solutions. These need openseespy, which is a compiled extension
   that will not load on every development machine, so they skip when it is
   missing and run in the deployed environment.

References for group 3: Teknisk Ståbi, bjælkeformler (simply supported and
cantilever beams under full-span UDL).
"""
import math

import pytest

import general_frame_fem as gf
from general_frame_fem import ModelError, section_forces_2d


# ══════════════════════════════════════════════════════════════════════════════
# 1. Load projection
# ══════════════════════════════════════════════════════════════════════════════

def _global_load(proj, ca, sa):
    """
    The load OpenSees actually applies, in global axes, for a projected load.

    solve() passes  Wy = -proj['wy_kNm']  and  Wx = +proj['wx_kNm']  to
    eleLoad -beamUniform. With a Linear transformation the element's local axes
    are  x = (ca, sa)  and  y = (-sa, ca), so the applied load per unit length is

        Wx * (ca, sa) + Wy * (-sa, ca)
    """
    Wy = -proj['wy_kNm']
    Wx = +proj['wx_kNm']
    return (Wx * ca + Wy * -sa,
            Wx * sa + Wy * ca)


def _project(direction, p, angle_deg, L=4.0):
    """Project load p onto an element inclined angle_deg from horizontal."""
    a  = math.radians(angle_deg)
    ca, sa = math.cos(a), math.sin(a)
    nodes = {1: {'id': 1, 'x': 0.0, 'y': 0.0},
             2: {'id': 2, 'x': L * ca, 'y': L * sa}}
    elements = [{'id': 1, 'ni': 1, 'nj': 2, 'type': 'beam'}]
    proj = gf._project_load(
        {'load_type': 'udl', 'elem_id': 1, 'direction': direction, 'value_kNm': p},
        elements, nodes,
    )
    return _global_load(proj, ca, sa), (ca, sa)


@pytest.mark.parametrize('angle', [0.0, 15.0, 30.0, 45.0, 90.0, -20.0])
def test_vertical_load_acts_downwards(angle):
    """
    A positive 'vertical' load is gravity: it must act in global -Y whatever
    the element orientation, with its full magnitude per unit element length.

    This is the regression test for the double negation that made downward
    loads act upwards — the engineer had to type a negative number to get
    gravity, and every moment diagram came out mirrored.
    """
    (gx, gy), _ = _project('vertical', 6.0, angle)
    assert gx == pytest.approx(0.0, abs=1e-12)
    assert gy == pytest.approx(-6.0, abs=1e-12)


@pytest.mark.parametrize('angle', [0.0, 20.0, 40.0])
def test_projected_load_is_per_horizontal_length(angle):
    """
    Snow is given per metre of horizontal projection, so per metre of a rafter
    it is p*cos(alpha) — still straight down.
    """
    (gx, gy), (ca, _) = _project('projected', 2.5, angle)
    assert gx == pytest.approx(0.0, abs=1e-12)
    assert gy == pytest.approx(-2.5 * ca, abs=1e-12)


@pytest.mark.parametrize('angle', [0.0, 30.0, 90.0])
def test_horizontal_load_acts_along_plus_x(angle):
    """Wind given as positive must blow towards +X, not against it."""
    (gx, gy), _ = _project('horizontal', 3.0, angle)
    assert gx == pytest.approx(3.0, abs=1e-12)
    assert gy == pytest.approx(0.0, abs=1e-12)


@pytest.mark.parametrize('angle', [0.0, 35.0, 90.0])
def test_perpendicular_load_presses_into_the_surface(angle):
    """
    Positive perpendicular pressure acts along the inward normal, which is
    minus the local y axis: (sin a, -cos a).
    """
    (gx, gy), (ca, sa) = _project('perpendicular', 4.0, angle)
    assert gx == pytest.approx(4.0 * sa, abs=1e-12)
    assert gy == pytest.approx(-4.0 * ca, abs=1e-12)


def test_negative_vertical_load_acts_upwards():
    """The sign still means something — uplift must be expressible."""
    (gx, gy), _ = _project('vertical', -2.0, 0.0)
    assert gy == pytest.approx(+2.0, abs=1e-12)


# ══════════════════════════════════════════════════════════════════════════════
# 1b. Section forces between the ends
# ══════════════════════════════════════════════════════════════════════════════
#
# The end forces below are not copied from the solver — they are derived from
# the boundary conditions of the case, so the test states the statics rather
# than the implementation. For a simply supported span under w downwards,
# eleLoad takes Wy = -w, and M(0) = M(L) = 0 forces V_i = wL/2, M_i = 0.

def test_simply_supported_span_reaches_wl2_over_8_between_the_ends():
    w, L = 10.0, 6.0
    pl = [0.0, w * L / 2, 0.0, 0.0, 0.0, 0.0]     # N_i, V_i, M_i, ...

    # Both ends carry no moment at all
    assert section_forces_2d(pl, 0.0, wy=-w)[2] == pytest.approx(0.0, abs=1e-9)
    assert section_forces_2d(pl, L,   wy=-w)[2] == pytest.approx(0.0, abs=1e-9)

    ext = gf.section_force_extremes(pl, L, wy=-w)
    assert ext['M_kNm'] == pytest.approx(w * L**2 / 8, rel=1e-9)
    assert ext['x_M_m'] == pytest.approx(L / 2, rel=1e-9)


def test_cantilever_moment_peaks_at_the_fixed_end():
    """No stationary point inside the element — the extreme is at an end."""
    w, L = 5.0, 3.0
    # Fixed at i, free at j. M(L) = 0 and |M(0)| = wL²/2 together give
    # V_i = wL and M_i = +wL²/2.
    pl = [0.0, w * L, w * L**2 / 2, 0.0, 0.0, 0.0]

    assert section_forces_2d(pl, L, wy=-w)[2] == pytest.approx(0.0, abs=1e-9)

    ext = gf.section_force_extremes(pl, L, wy=-w)
    assert abs(ext['M_kNm']) == pytest.approx(w * L**2 / 2, rel=1e-9)
    assert ext['x_M_m'] == pytest.approx(0.0, abs=1e-9)


def test_shear_is_linear_and_extreme_at_an_end():
    w, L = 10.0, 6.0
    pl = [0.0, w * L / 2, 0.0, 0.0, 0.0, 0.0]
    ext = gf.section_force_extremes(pl, L, wy=-w)
    assert abs(ext['V_kN']) == pytest.approx(w * L / 2, rel=1e-9)
    assert section_forces_2d(pl, L / 2, wy=-w)[1] == pytest.approx(0.0, abs=1e-9)


def test_axial_varies_with_a_longitudinal_load():
    L, wx = 4.0, 2.0
    pl = [-8.0, 0.0, 0.0, 0.0, 0.0, 0.0]
    assert section_forces_2d(pl, 0.0, wx=wx)[0] == pytest.approx(8.0)
    assert section_forces_2d(pl, L,   wx=wx)[0] == pytest.approx(8.0 - wx * L)


def test_no_element_load_leaves_the_moment_linear():
    """Without a distributed load the extreme is always at an end."""
    L = 4.0
    pl = [0.0, 3.0, -2.0, 0.0, 0.0, 0.0]
    ext = gf.section_force_extremes(pl, L)
    assert ext['M_kNm'] == pytest.approx(2.0 + 3.0 * L)
    assert ext['x_M_m'] == pytest.approx(L)


# ══════════════════════════════════════════════════════════════════════════════
# 2. Model validation
# ══════════════════════════════════════════════════════════════════════════════

def simple_beam(n_elem=2, L=6.0):
    """Pin/roller beam split into n_elem elements — a valid reference model."""
    xs = [L * i / n_elem for i in range(n_elem + 1)]
    nodes = [{'id': i + 1, 'x': x, 'y': 0.0} for i, x in enumerate(xs)]
    elements = [{'id': i + 1, 'ni': i + 1, 'nj': i + 2, 'type': 'beam',
                 'release': 'none', 'E_GPa': 210, 'A_cm2': 53.8, 'Iz_cm4': 8356}
                for i in range(n_elem)]
    supports = [{'node_id': 1,           'ux': True,  'uy': True, 'rz': False},
                {'node_id': n_elem + 1,  'ux': False, 'uy': True, 'rz': False}]
    return nodes, elements, supports


def test_valid_model_passes():
    nodes, elements, supports = simple_beam()
    gf.validate_model(nodes, elements, supports, loads=[], equal_dofs=[])


def test_cantilever_passes():
    nodes = [{'id': 1, 'x': 0, 'y': 0}, {'id': 2, 'x': 3, 'y': 0}]
    elements = [{'id': 1, 'ni': 1, 'nj': 2, 'type': 'beam', 'release': 'none',
                 'E_GPa': 210, 'A_cm2': 53.8, 'Iz_cm4': 8356}]
    supports = [{'node_id': 1, 'ux': True, 'uy': True, 'rz': True}]
    gf.validate_model(nodes, elements, supports)


def test_single_pinned_support_is_a_mechanism():
    """Pin at one end only: the beam can still rotate about it."""
    nodes, elements, _ = simple_beam()
    supports = [{'node_id': 1, 'ux': True, 'uy': True, 'rz': False}]
    with pytest.raises(ModelError) as exc:
        gf.validate_model(nodes, elements, supports)
    assert 'mekanisme' in str(exc.value)


def test_two_rollers_leave_the_structure_free_to_slide():
    """Vertical restraint twice over, nothing holding x."""
    nodes, elements, _ = simple_beam()
    supports = [{'node_id': 1, 'ux': False, 'uy': True, 'rz': False},
                {'node_id': 3, 'ux': False, 'uy': True, 'rz': False}]
    with pytest.raises(ModelError) as exc:
        gf.validate_model(nodes, elements, supports)
    assert 'mekanisme' in str(exc.value)


def test_two_pins_at_different_points_are_enough():
    nodes, elements, supports = simple_beam()
    gf.validate_model(nodes, elements, supports)   # pin + roller, rank 3


def test_truss_only_node_has_no_rotational_stiffness():
    """
    The model is built with ndf=3, and a Truss element contributes nothing to
    rz. Without this check OpenSees factors the singular matrix and reports
    metres of displacement as if they were a result.
    """
    nodes = [{'id': 1, 'x': 0, 'y': 0}, {'id': 2, 'x': 3, 'y': 0},
             {'id': 3, 'x': 1.5, 'y': 2}]
    elements = [
        {'id': 1, 'ni': 1, 'nj': 3, 'type': 'truss', 'E_GPa': 210, 'A_cm2': 20},
        {'id': 2, 'ni': 3, 'nj': 2, 'type': 'truss', 'E_GPa': 210, 'A_cm2': 20},
    ]
    supports = [{'node_id': 1, 'ux': True, 'uy': True, 'rz': True},
                {'node_id': 2, 'ux': True, 'uy': True, 'rz': True}]
    with pytest.raises(ModelError) as exc:
        gf.validate_model(nodes, elements, supports)
    assert 'rotationsstivhed' in str(exc.value)
    assert '3' in str(exc.value)          # names the offending node


def test_truss_node_with_rz_fixed_is_accepted():
    nodes = [{'id': 1, 'x': 0, 'y': 0}, {'id': 2, 'x': 3, 'y': 0},
             {'id': 3, 'x': 1.5, 'y': 2}]
    elements = [
        {'id': 1, 'ni': 1, 'nj': 3, 'type': 'truss', 'E_GPa': 210, 'A_cm2': 20},
        {'id': 2, 'ni': 3, 'nj': 2, 'type': 'truss', 'E_GPa': 210, 'A_cm2': 20},
    ]
    supports = [{'node_id': 1, 'ux': True, 'uy': True, 'rz': True},
                {'node_id': 2, 'ux': True, 'uy': True, 'rz': True},
                {'node_id': 3, 'ux': False, 'uy': False, 'rz': True}]
    gf.validate_model(nodes, elements, supports)


def test_beam_released_at_both_ends_has_no_rotational_stiffness():
    nodes = [{'id': 1, 'x': 0, 'y': 0}, {'id': 2, 'x': 3, 'y': 0},
             {'id': 3, 'x': 6, 'y': 0}]
    elements = [
        {'id': 1, 'ni': 1, 'nj': 2, 'type': 'beam', 'release': 'both',
         'E_GPa': 210, 'A_cm2': 53.8, 'Iz_cm4': 8356},
        {'id': 2, 'ni': 2, 'nj': 3, 'type': 'beam', 'release': 'both',
         'E_GPa': 210, 'A_cm2': 53.8, 'Iz_cm4': 8356},
    ]
    supports = [{'node_id': 1, 'ux': True, 'uy': True, 'rz': True},
                {'node_id': 3, 'ux': True, 'uy': True, 'rz': True}]
    with pytest.raises(ModelError) as exc:
        gf.validate_model(nodes, elements, supports)
    assert 'rotationsstivhed' in str(exc.value)


def test_floating_node_is_rejected():
    nodes, elements, supports = simple_beam()
    nodes.append({'id': 99, 'x': 10.0, 'y': 4.0})
    with pytest.raises(ModelError) as exc:
        gf.validate_model(nodes, elements, supports)
    assert 'ikke forbundet' in str(exc.value)


def test_element_referring_to_a_missing_node_is_rejected():
    nodes, elements, supports = simple_beam()
    elements[0]['nj'] = 42
    with pytest.raises(ModelError) as exc:
        gf.validate_model(nodes, elements, supports)
    assert '42' in str(exc.value)


def test_zero_length_element_is_rejected():
    nodes = [{'id': 1, 'x': 0, 'y': 0}, {'id': 2, 'x': 0, 'y': 0},
             {'id': 3, 'x': 3, 'y': 0}]
    elements = [
        {'id': 1, 'ni': 1, 'nj': 2, 'type': 'beam', 'E_GPa': 210, 'A_cm2': 50, 'Iz_cm4': 8356},
        {'id': 2, 'ni': 2, 'nj': 3, 'type': 'beam', 'E_GPa': 210, 'A_cm2': 50, 'Iz_cm4': 8356},
    ]
    supports = [{'node_id': 1, 'ux': True, 'uy': True, 'rz': True}]
    with pytest.raises(ModelError) as exc:
        gf.validate_model(nodes, elements, supports)
    assert 'længden 0' in str(exc.value)


def test_zero_section_property_is_rejected():
    nodes, elements, supports = simple_beam()
    elements[0]['Iz_cm4'] = 0
    with pytest.raises(ModelError) as exc:
        gf.validate_model(nodes, elements, supports)
    assert 'I = 0' in str(exc.value)


def test_missing_section_property_uses_the_solver_default():
    """solve() has always defaulted these — validation must not disagree."""
    nodes, elements, supports = simple_beam()
    del elements[0]['Iz_cm4']
    gf.validate_model(nodes, elements, supports)


def test_load_on_a_missing_element_is_rejected():
    nodes, elements, supports = simple_beam()
    loads = [{'type': 'udl', 'elem_id': 77, 'direction': 'vertical', 'value_kNm': 5}]
    with pytest.raises(ModelError) as exc:
        gf.validate_model(nodes, elements, supports, loads)
    assert '77' in str(exc.value)


def test_all_faults_are_reported_in_one_pass():
    """One run should list everything wrong, not stop at the first fault."""
    nodes, elements, supports = simple_beam()
    nodes.append({'id': 99, 'x': 10.0, 'y': 4.0})
    elements[0]['A_cm2'] = 0
    with pytest.raises(ModelError) as exc:
        gf.validate_model(nodes, elements, supports)
    msg = str(exc.value)
    assert 'ikke forbundet' in msg and 'A = 0' in msg


# ── Result sanity ─────────────────────────────────────────────────────────────

def test_absurd_displacement_is_rejected():
    """
    The 60 m deflection from a 2 kN/m load: linear small-displacement theory
    cannot describe that, so it must not be reported as a deflection.
    """
    nodes = [{'id': 1, 'x': 0, 'y': 0}, {'id': 2, 'x': 6, 'y': 0}]
    disps = {1: [0.0, 0.0, 0.0], 2: [0.0, -60.0, 0.0]}
    forces = {1: [0.0] * 6}
    with pytest.raises(ModelError) as exc:
        gf.check_results(nodes, disps, forces, ref_size=6.0)
    assert 'singulær' in str(exc.value)


def test_realistic_displacement_is_accepted():
    nodes = [{'id': 1, 'x': 0, 'y': 0}, {'id': 2, 'x': 6, 'y': 0}]
    disps = {1: [0.0, 0.0, 0.0], 2: [0.0, -0.012, 0.0]}   # 12 mm over 6 m
    gf.check_results(nodes, disps, {1: [0.0] * 6}, ref_size=6.0)


def test_non_finite_result_is_rejected():
    nodes = [{'id': 1, 'x': 0, 'y': 0}, {'id': 2, 'x': 6, 'y': 0}]
    disps = {1: [0.0, 0.0, 0.0], 2: [float('nan'), 0.0, 0.0]}
    with pytest.raises(ModelError):
        gf.check_results(nodes, disps, {1: [0.0] * 6}, ref_size=6.0)


# ══════════════════════════════════════════════════════════════════════════════
# 3. Closed-form solutions  (needs the compiled solver)
# ══════════════════════════════════════════════════════════════════════════════

ops_required = pytest.mark.skipif(
    not gf._OPS_AVAILABLE,
    reason='openseespy is not importable in this environment',
)

E_GPA, A_CM2, IZ_CM4 = 210.0, 53.8, 8356.0     # IPE 300, S355
EI = (E_GPA * 1e6) * (IZ_CM4 * 1e-8)           # kN·m²


@ops_required
def test_simply_supported_beam_matches_the_closed_form():
    """delta = 5wL^4/384EI at midspan, M = wL^2/8, reactions wL/2 each."""
    L, w = 6.0, 10.0
    nodes, elements, supports = simple_beam(n_elem=2, L=L)
    loads = [{'type': 'udl', 'elem_id': e['id'],
              'direction': 'vertical', 'value_kNm': w} for e in elements]

    res = gf.solve(nodes, elements, supports, loads)

    delta = -res['node_disps'][2][1]            # node 2 is midspan
    assert delta == pytest.approx(5 * w * L**4 / (384 * EI), rel=0.01)
    assert delta > 0, 'a downward load must deflect the beam downwards'

    M = max(abs(res['ele_forces'][e['id']][2]) for e in elements)
    M = max(M, max(abs(res['ele_forces'][e['id']][5]) for e in elements))
    assert M == pytest.approx(w * L**2 / 8, rel=0.01)

    assert res['node_reactions'][1][1] == pytest.approx(w * L / 2, rel=0.01)
    assert res['node_reactions'][3][1] == pytest.approx(w * L / 2, rel=0.01)


@ops_required
def test_cantilever_matches_the_closed_form():
    """delta = wL^4/8EI at the tip, M = wL^2/2 at the support."""
    L, w = 3.0, 5.0
    nodes = [{'id': 1, 'x': 0, 'y': 0}, {'id': 2, 'x': L, 'y': 0}]
    elements = [{'id': 1, 'ni': 1, 'nj': 2, 'type': 'beam', 'release': 'none',
                 'E_GPa': E_GPA, 'A_cm2': A_CM2, 'Iz_cm4': IZ_CM4}]
    supports = [{'node_id': 1, 'ux': True, 'uy': True, 'rz': True}]
    loads = [{'type': 'udl', 'elem_id': 1, 'direction': 'vertical', 'value_kNm': w}]

    res = gf.solve(nodes, elements, supports, loads)

    delta = -res['node_disps'][2][1]
    assert delta == pytest.approx(w * L**4 / (8 * EI), rel=0.01)
    assert abs(res['ele_forces'][1][2]) == pytest.approx(w * L**2 / 2, rel=0.01)


@ops_required
def test_design_moment_is_the_span_maximum_not_the_end_value():
    """
    One element, simply supported, full-span UDL. Both ends carry zero moment
    and midspan carries wL²/8 — so anything reading the end forces reports a
    design moment of zero for a beam that is fully loaded.

    This is the case the two-element beam above cannot catch: splitting the
    span puts a node at midspan, which turns the span maximum into an end value
    and hides the defect.
    """
    L, w = 6.0, 10.0
    nodes = [{'id': 1, 'x': 0, 'y': 0}, {'id': 2, 'x': L, 'y': 0}]
    elements = [{'id': 1, 'ni': 1, 'nj': 2, 'type': 'beam', 'release': 'none',
                 'E_GPa': E_GPA, 'A_cm2': A_CM2, 'Iz_cm4': IZ_CM4}]
    supports = [{'node_id': 1, 'ux': True,  'uy': True, 'rz': False},
                {'node_id': 2, 'ux': False, 'uy': True, 'rz': False}]
    loads = [{'type': 'udl', 'elem_id': 1, 'direction': 'vertical', 'value_kNm': w}]

    res = gf.solve(nodes, elements, supports, loads)

    f = res['ele_forces'][1]
    assert abs(f[2]) == pytest.approx(0.0, abs=1e-6), 'end i carries no moment'
    assert abs(f[5]) == pytest.approx(0.0, abs=1e-6), 'end j carries no moment'

    ext = res['ele_extremes'][1]
    assert abs(ext['M_kNm']) == pytest.approx(w * L**2 / 8, rel=0.001)
    assert ext['x_M_m']      == pytest.approx(L / 2,        rel=0.001)
    assert abs(ext['V_kN'])  == pytest.approx(w * L / 2,    rel=0.001)

    summary = gf.summarise(nodes, elements, res['node_disps'],
                           res['node_reactions'], res['ele_forces'],
                           supports, loads, res['ele_extremes'])
    assert summary['max_moment_kNm'] == pytest.approx(w * L**2 / 8, rel=0.001)
    assert summary['ele_force_table'][0]['M_max_kNm'] == pytest.approx(w * L**2 / 8, rel=0.001)


@ops_required
def test_element_forces_are_local_not_global():
    """
    A rafter carrying a vertical load. In global axes the end force is almost
    all vertical; resolved into the member's own axes it is part axial, part
    shear. eleForce reports the global set, which is what made a rafter's
    "axial force" the vertical reaction — so the checks were handed the wrong
    N and V. localForces is what N and V are supposed to mean.
    """
    L, angle, w = 4.0, 30.0, 6.0
    a = math.radians(angle)
    nodes = [{'id': 1, 'x': 0, 'y': 0},
             {'id': 2, 'x': L * math.cos(a), 'y': L * math.sin(a)}]
    elements = [{'id': 1, 'ni': 1, 'nj': 2, 'type': 'beam', 'release': 'none',
                 'E_GPa': E_GPA, 'A_cm2': A_CM2, 'Iz_cm4': IZ_CM4}]
    supports = [{'node_id': 1, 'ux': True, 'uy': True, 'rz': True}]
    loads = [{'type': 'udl', 'elem_id': 1, 'direction': 'vertical', 'value_kNm': w}]

    res = gf.solve(nodes, elements, supports, loads)
    N_i, V_i = res['ele_forces'][1][0], res['ele_forces'][1][1]

    # Total load on the member, resolved into its own axes
    W = w * L
    assert abs(N_i) == pytest.approx(W * math.sin(a), rel=0.01)
    assert abs(V_i) == pytest.approx(W * math.cos(a), rel=0.01)


@ops_required
def test_buckling_table_reports_the_real_axial_force():
    """
    A column carrying a point load. N_Ed in the buckling-length table was the
    average of the two end forces, which are equal and opposite on a member
    with no longitudinal load — so it read zero for every column in the frame.
    """
    h, P = 4.0, 120.0
    nodes = [{'id': 1, 'x': 0, 'y': 0}, {'id': 2, 'x': 0, 'y': h}]
    elements = [{'id': 1, 'ni': 1, 'nj': 2, 'type': 'beam', 'release': 'none',
                 'E_GPa': E_GPA, 'A_cm2': A_CM2, 'Iz_cm4': IZ_CM4}]
    supports = [{'node_id': 1, 'ux': True, 'uy': True, 'rz': True}]
    loads = [{'type': 'nodal', 'node_id': 2, 'Fx_kN': 0.0, 'Fy_kN': -P, 'Mz_kNm': 0.0}]

    res = gf.solve(nodes, elements, supports, loads)
    buck = gf.compute_buckling_lengths(nodes, elements, supports,
                                       res['ele_forces'], res['ele_extremes'])

    assert abs(buck[1]['N_Ed_kN']) == pytest.approx(P, rel=0.01)


@ops_required
def test_wind_pushes_the_column_downwind():
    """A positive 'horizontal' load must displace the column towards +X."""
    h, p = 4.0, 2.0
    nodes = [{'id': 1, 'x': 0, 'y': 0}, {'id': 2, 'x': 0, 'y': h}]
    elements = [{'id': 1, 'ni': 1, 'nj': 2, 'type': 'beam', 'release': 'none',
                 'E_GPa': E_GPA, 'A_cm2': A_CM2, 'Iz_cm4': IZ_CM4}]
    supports = [{'node_id': 1, 'ux': True, 'uy': True, 'rz': True}]
    loads = [{'type': 'udl', 'elem_id': 1, 'direction': 'horizontal', 'value_kNm': p}]

    res = gf.solve(nodes, elements, supports, loads)

    assert res['node_disps'][2][0] == pytest.approx(p * h**4 / (8 * EI), rel=0.01)
    assert res['node_disps'][2][0] > 0


@ops_required
def test_solver_refuses_a_mechanism():
    """End to end: the model that produced 60 m of deflection is now rejected."""
    nodes, elements, _ = simple_beam()
    supports = [{'node_id': 1, 'ux': True, 'uy': True, 'rz': False}]
    loads = [{'type': 'udl', 'elem_id': 1, 'direction': 'vertical', 'value_kNm': 2}]
    with pytest.raises(ModelError):
        gf.solve(nodes, elements, supports, loads)


# ══════════════════════════════════════════════════════════════════════════════
# 4. Endpoint wiring
# ══════════════════════════════════════════════════════════════════════════════

def test_endpoint_returns_the_explanation_not_a_traceback(client, monkeypatch):
    """
    A rejected model must come back as a 422 whose detail is the message the
    engineer needs. The endpoint imports ModelError inside its own try block,
    so this also guards the except-clause ordering that makes that safe.
    """
    def boom(*args, **kwargs):
        raise ModelError('Modellen kan ikke regnes:\n· Knude 3 er ikke forbundet '
                         'til noget element. Fjern den, eller forbind den.')
    monkeypatch.setattr(gf, 'solve', boom)

    nodes, elements, supports = simple_beam()
    r = client.post('/calc/general-frame-fem', json={
        'title': 'Test', 'nodes': nodes, 'elements': elements,
        'supports': supports,
        'loads': [{'type': 'udl', 'elem_id': 1,
                   'direction': 'vertical', 'value_kNm': 2}],
    })

    assert r.status_code == 422
    detail = r.json()['detail']
    assert 'Knude 3 er ikke forbundet' in detail
    assert 'Traceback' not in detail
