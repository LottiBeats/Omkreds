"""
Rettelser efter gennemgangen af træmodulerne, september 2026.

Hvert tal er regnet i hånden i docstringen, så testen ikke bare gentager koden.
"""
import pytest
import forallpeople as si
si.environment('structural', top_level=True)

from timber import timber_beam
from timber_column import timber_column_bending_and_axial
from timber_grades import get_timber_grade


def _row(blocks, name):
    for b in blocks:
        if b.get('type') == 'calc_row' and b.get('name') == name:
            return b
    raise AssertionError(f'ingen raekke {name!r}')


def _check(blocks, frag):
    return next(b for b in blocks if b.get('type') == 'check' and frag.lower() in b['label'].lower())


def _beam(**kw):
    base = dict(label='T', span=4 * m, g_k=3 * kN / m, q_k=2 * kN / m,
                b=90 * mm, h=220 * mm, timber_grade='C24', service_class=1,
                load_duration='medium', check_deflection=False,
                compression_edge_restrained=True)
    base.update(kw)
    return timber_beam(**base)


def test_gamma_M_follows_material_dk_na():
    """Konstruktionstræ 1,35 og limtræ 1,30 efter DS/EN 1995-1-1 DK NA."""
    assert _row(_beam(), 'γ_M')['result'] == '1.35'
    assert _row(_beam(timber_grade='GL24h'), 'γ_M')['result'] == '1.30'
    assert _row(_beam(gamma_M=1.2), 'γ_M')['result'] == '1.20'


def test_shear_uses_k_cr():
    """
    V_Ed = 12 kN. τ_d = 1,5·12000/(0,67·90·220) = 1,357 MPa;
    f_v,d = 0,8·4,0/1,35 = 2,370 MPa → η = 0,572.
    """
    c = _check(_beam(), 'Forskydning')
    assert c['ratio'] == pytest.approx(0.572, abs=0.002)


def test_glulam_values_are_en_14080():
    _, gl24c = get_timber_grade('GL24c')
    assert float(gl24c['f_c0k'] / MPa) == 21.5
    _, gl32h = get_timber_grade('GL32h')
    assert float(gl32h['f_vk'] / MPa) == 3.5
    assert float(gl32h['E_0_mean'] / MPa) == 14200


def test_bearing_effective_length_and_k_c90():
    """
    V_Ed = 12 kN, l = 100 mm, a = 20 mm → l_ef = 100 + 30 + 20 = 150 mm.
    A_ef = 90·150 = 13 500 mm²; σ = 0,889 MPa.
    f_c,90,d = 0,8·2,5/1,35 = 1,481 MPa; k_c,90 = 1,5 → η = 0,889/2,222 = 0,400.
    """
    b = _beam(support_length=100 * mm, end_distance=20 * mm)
    assert _row(b, 'l_ef')['result'].startswith('150')
    c = _check(b, 'Vederlag')
    assert c['ratio'] == pytest.approx(0.400, abs=0.002)
    # uden udhæng: kun de 30 mm ind mod faget
    b0 = _beam(support_length=100 * mm)
    assert _row(b0, 'l_ef')['result'].startswith('130')


def test_bearing_over_400_mm_gets_k_c90_one():
    b = _beam(support_length=450 * mm)
    assert _row(b, 'k_c,90')['result'] == '1.00'


def test_fire_uses_material_charring_and_k_fi():
    """
    C24, 30 min, 3 sider: d_char = 0,8·30 + 7 = 31 mm (ikke 0,7 → 28 mm).
    f_m,d,fi = 1,0·1,25·24/1,0 = 30 MPa.
    """
    b = _beam(b=140 * mm, h=270 * mm, fire_design={'t_fire': 30, 'eta_fi': 0.6,
                                                   'exposed_sides': 2, 'exposed_bottom': True})
    assert _row(b, 'd_char,n')['result'].startswith('31.0')
    assert _row(b, 'f_m,d,fi')['result'].startswith('30.00')


def test_column_gamma_M_follows_material():
    b = timber_column_bending_and_axial(label='S', length=3 * m, N_Ed=50 * kN, M_Ed=0 * kN * m,
                                        b=140 * mm, h=140 * mm, timber_grade='GL28h')
    assert 'γ_M = 1.30' in next(x['content'] for x in b if x.get('type') == 'text')
