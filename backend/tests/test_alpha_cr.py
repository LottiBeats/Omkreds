"""
test_alpha_cr.py — sway stability, EN 1993-1-1 § 5.2.1(4)B

compute_alpha_cr() calls solve() to measure how far the frame sways under a
horizontal probe. The solver is OpenSeesPy, a compiled extension that is not
always installable on a development machine, so these substitute a stub that
returns a known sway. That leaves the FEM itself untested here — it is
unchanged — and tests what is new: the probe, the formula, the classification
bands and the geometry helpers.
"""
import math

import pytest

import general_frame_fem as gf


# ── Fixtures ──────────────────────────────────────────────────────────────────

def portal(h=4.0, span=6.0):
    """Pinned-base portal frame: two columns, one rafter."""
    nodes = [{'id': 1, 'x': 0, 'y': 0}, {'id': 2, 'x': 0, 'y': h},
             {'id': 3, 'x': span, 'y': h}, {'id': 4, 'x': span, 'y': 0}]
    elements = [
        {'id': 1, 'ni': 1, 'nj': 2, 'type': 'beam', 'E_GPa': 210, 'A_cm2': 53.8, 'Iz_cm4': 8360},
        {'id': 2, 'ni': 2, 'nj': 3, 'type': 'beam', 'E_GPa': 210, 'A_cm2': 53.8, 'Iz_cm4': 8360},
        {'id': 3, 'ni': 3, 'nj': 4, 'type': 'beam', 'E_GPa': 210, 'A_cm2': 53.8, 'Iz_cm4': 8360},
    ]
    supports = [{'node_id': 1, 'ux': True, 'uy': True, 'rz': False},
                {'node_id': 4, 'ux': True, 'uy': True, 'rz': False}]
    return nodes, elements, supports


def stub_solve(sway_per_kN):
    """
    A linear frame: horizontal top displacement proportional to the probe load.
    Returns a solve() replacement plus a list recording the probes it received.
    """
    seen = []

    def _solve(nodes, elements, supports, loads, equal_dofs=None):
        H = sum(float(l.get('Fx_kN', 0.0)) for l in loads)
        seen.append(H)
        top = sway_per_kN * H
        disps = {}
        sup_ids = {s['node_id'] for s in supports}
        for n in nodes:
            disps[n['id']] = [0.0 if n['id'] in sup_ids else top, 0.0, 0.0]
        return {'node_disps': disps, 'node_reactions': {}, 'ele_forces': {}}

    return _solve, seen


def reactions(V_total_kN, support_ids):
    """Vertical reactions summing to V_total (OpenSees sign: upward positive)."""
    per = V_total_kN / len(support_ids)
    return {i: [0.0, per, 0.0] for i in support_ids}


def run(monkeypatch, sway_per_kN, V_Ed=200.0, h=4.0, span=6.0):
    nodes, elements, supports = portal(h, span)
    _solve, seen = stub_solve(sway_per_kN)
    monkeypatch.setattr(gf, 'solve', _solve)
    monkeypatch.setattr(gf, '_OPS_AVAILABLE', True)
    res = gf.compute_alpha_cr(nodes, elements, supports, {},
                              reactions(V_Ed, [1, 4]))
    return res, seen


# ── Geometry helpers ──────────────────────────────────────────────────────────

def test_columns_are_the_vertical_members_with_their_top_node():
    nodes, elements, supports = portal()
    cols = gf._columns(nodes, elements, supports)
    assert [c['elem']['id'] for c in cols] == [1, 3]
    assert {c['top']['id'] for c in cols} == {2, 3}
    assert {c['bot']['id'] for c in cols} == {1, 4}


def test_roof_slope_ignores_columns():
    nodes, elements, supports = portal()
    assert gf._roof_slope_deg(nodes, elements, supports) == pytest.approx(0.0, abs=1e-9)

    # Duopitch: 6 m half-span rising 3 m → 26.57°
    nodes = [{'id': 1, 'x': 0, 'y': 0}, {'id': 2, 'x': 0, 'y': 4},
             {'id': 3, 'x': 6, 'y': 7}, {'id': 4, 'x': 12, 'y': 4},
             {'id': 5, 'x': 12, 'y': 0}]
    elements = [
        {'id': 1, 'ni': 1, 'nj': 2, 'type': 'beam'},
        {'id': 2, 'ni': 2, 'nj': 3, 'type': 'beam'},
        {'id': 3, 'ni': 3, 'nj': 4, 'type': 'beam'},
        {'id': 4, 'ni': 4, 'nj': 5, 'type': 'beam'},
    ]
    supports = [{'node_id': 1, 'ux': True, 'uy': True, 'rz': False},
                {'node_id': 5, 'ux': True, 'uy': True, 'rz': False}]
    assert gf._roof_slope_deg(nodes, elements, supports) == pytest.approx(26.57, abs=0.05)


# ── The formula ───────────────────────────────────────────────────────────────

def test_alpha_cr_matches_the_hand_calculation(monkeypatch):
    """alpha_cr = (H/V)(h/delta), computed independently here."""
    sway = 0.002        # m per kN of probe
    V_Ed, h = 200.0, 4.0
    res, seen = run(monkeypatch, sway, V_Ed=V_Ed, h=h)

    alpha_h = max(2/3, min(1.0, 2 / math.sqrt(h)))
    alpha_m = math.sqrt(0.5 * (1 + 1/2))          # two columns
    phi = (1/200) * alpha_h * alpha_m
    H = phi * V_Ed
    delta = sway * H
    expected = (H / V_Ed) * (h / delta)

    assert res['alpha_cr'] == pytest.approx(round(expected, 2), rel=1e-6)
    assert res['H_probe_kN'] == pytest.approx(round(H, 3))
    assert res['phi'] == pytest.approx(round(phi, 5))
    assert res['V_Ed_kN'] == pytest.approx(V_Ed)


def test_alpha_cr_is_independent_of_the_probe_size(monkeypatch):
    """
    H/delta is a stiffness, so the probe magnitude cancels: with delta = s x H,
    alpha_cr = (H/V)(h/(s x H)) = h/(V x s). If it did not cancel, the number
    would depend on an arbitrary choice — this is what the method rests on.
    """
    s_sway, V_Ed, h = 0.002, 200.0, 4.0
    res, _ = run(monkeypatch, s_sway, V_Ed=V_Ed, h=h)
    assert res['alpha_cr'] == pytest.approx(round(h / (V_Ed * s_sway), 2), rel=1e-6)


def test_doubling_the_load_halves_alpha_cr(monkeypatch):
    """alpha_cr = F_cr/F_Ed — it is a margin against the applied load."""
    base, _    = run(monkeypatch, 0.002, V_Ed=200.0)
    doubled, _ = run(monkeypatch, 0.002, V_Ed=400.0)
    assert doubled['H_probe_kN'] == pytest.approx(2 * base['H_probe_kN'], rel=1e-9)
    assert doubled['alpha_cr'] == pytest.approx(base['alpha_cr'] / 2, rel=1e-6)


def test_a_stiffer_frame_gives_a_higher_alpha_cr(monkeypatch):
    soft, _ = run(monkeypatch, 0.004)
    stiff, _ = run(monkeypatch, 0.001)
    assert stiff['alpha_cr'] > soft['alpha_cr']
    assert stiff['alpha_cr'] == pytest.approx(4 * soft['alpha_cr'], rel=1e-6)


def test_probe_is_applied_at_the_top_of_the_columns(monkeypatch):
    nodes, elements, supports = portal()
    seen_loads = []

    def _solve(nodes_, elements_, supports_, loads, equal_dofs=None):
        seen_loads.extend(loads)
        return {'node_disps': {n['id']: [0.001, 0, 0] for n in nodes_},
                'node_reactions': {}, 'ele_forces': {}}

    monkeypatch.setattr(gf, 'solve', _solve)
    monkeypatch.setattr(gf, '_OPS_AVAILABLE', True)
    gf.compute_alpha_cr(nodes, elements, supports, {}, reactions(200.0, [1, 4]))

    assert {l['node_id'] for l in seen_loads} == {2, 3}, 'probe belongs at eaves level'
    assert all(l['Fy_kN'] == 0.0 for l in seen_loads), 'probe is horizontal only'


# ── Classification, EN 1993-1-1 § 5.2.1(3) ────────────────────────────────────

@pytest.mark.parametrize('sway, forventet', [
    (0.0005, 'ikke svajfølsom'),      # alpha_cr = 40
    (0.0040, 'svajfølsom'),           # alpha_cr = 5
    (0.0100, 'meget svajfølsom'),     # alpha_cr = 2
])
def test_classification_bands(monkeypatch, sway, forventet):
    res, _ = run(monkeypatch, sway)
    assert res['klasse'] == forventet


def test_amplification_factor_only_offered_between_3_and_10(monkeypatch):
    sway_ok, _ = run(monkeypatch, 0.0040)
    assert '1/(1-1/alpha_cr)' in sway_ok['konsekvens']
    assert 3.0 <= sway_ok['alpha_cr'] < 10.0

    severe, _ = run(monkeypatch, 0.0100)
    assert severe['alpha_cr'] < 3.0
    assert 'må ikke anvendes' in severe['konsekvens']

    stiff, _ = run(monkeypatch, 0.0005)
    assert stiff['alpha_cr'] >= 10.0
    assert 'kan ignoreres' in stiff['konsekvens']


# ── Scope of the method ───────────────────────────────────────────────────────

def test_steep_roof_is_flagged_as_outside_the_method(monkeypatch):
    """§ 5.2.1(4)B is for shallow roof slopes; say so rather than answer anyway."""
    nodes = [{'id': 1, 'x': 0, 'y': 0}, {'id': 2, 'x': 0, 'y': 4},
             {'id': 3, 'x': 4, 'y': 9}, {'id': 4, 'x': 8, 'y': 4},
             {'id': 5, 'x': 8, 'y': 0}]
    elements = [
        {'id': 1, 'ni': 1, 'nj': 2, 'type': 'beam'},
        {'id': 2, 'ni': 2, 'nj': 3, 'type': 'beam'},
        {'id': 3, 'ni': 3, 'nj': 4, 'type': 'beam'},
        {'id': 4, 'ni': 4, 'nj': 5, 'type': 'beam'},
    ]
    supports = [{'node_id': 1, 'ux': True, 'uy': True, 'rz': True},
                {'node_id': 5, 'ux': True, 'uy': True, 'rz': True}]
    _solve, _ = stub_solve(0.001)
    monkeypatch.setattr(gf, 'solve', _solve)
    monkeypatch.setattr(gf, '_OPS_AVAILABLE', True)

    res = gf.compute_alpha_cr(nodes, elements, supports, {}, reactions(200.0, [1, 5]))
    assert res['taghaeldning_deg'] > 26
    assert any('26' in f for f in res['forbehold'])


def test_axial_force_caveat_is_always_stated(monkeypatch):
    res, _ = run(monkeypatch, 0.002)
    assert any('normalkraft' in f.lower() for f in res['forbehold'])


def test_returns_none_when_the_frame_has_no_columns(monkeypatch):
    """A simply supported beam has no sway mode — do not invent a number."""
    nodes = [{'id': 1, 'x': 0, 'y': 0}, {'id': 2, 'x': 6, 'y': 0}]
    elements = [{'id': 1, 'ni': 1, 'nj': 2, 'type': 'beam'}]
    supports = [{'node_id': 1, 'ux': True, 'uy': True, 'rz': False},
                {'node_id': 2, 'ux': False, 'uy': True, 'rz': False}]
    monkeypatch.setattr(gf, '_OPS_AVAILABLE', True)
    assert gf.compute_alpha_cr(nodes, elements, supports, {},
                               reactions(100.0, [1, 2])) is None


def test_returns_none_without_vertical_load(monkeypatch):
    """alpha_cr is a ratio to the applied load; with no load it is undefined."""
    nodes, elements, supports = portal()
    monkeypatch.setattr(gf, '_OPS_AVAILABLE', True)
    assert gf.compute_alpha_cr(nodes, elements, supports, {},
                               reactions(0.0, [1, 4])) is None


def test_returns_none_when_the_solver_is_unavailable():
    nodes, elements, supports = portal()
    assert gf._OPS_AVAILABLE or gf.compute_alpha_cr(
        nodes, elements, supports, {}, reactions(200.0, [1, 4])) is None
