"""
Rettelser efter gennemgangen af stålbjælke og stålsøjle, september 2026.
"""
import math
import pytest
from steel_ec3 import chi_ltb, ltb_curve_hot_rolled
from steel_column import steel_column_check
from section_catalog import column_properties


def test_modified_ltb_uses_table_6_5():
    """
    IPE300 (h/b = 2,0) → kurve b i den modificerede metode.
    λ̄_LT = 1,0: φ = 0,5·(1 + 0,34·0,6 + 0,75) = 0,977
    χ_LT = 1/(0,977 + √(0,977² − 0,75)) = 0,700   (kurve a gav 0,770)
    """
    assert ltb_curve_hot_rolled(300, 150) == 'b'
    assert chi_ltb(1.0, 'b') == pytest.approx(0.700, abs=0.002)


def test_hea200_s355_is_class_2_with_root_radius():
    """
    HEA200, r = 18 mm: c_f = (200 − 6,5 − 36)/2 = 78,75 mm, c/t = 7,88
    ε = 0,814: 9ε = 7,32 < 7,88 ≤ 10ε = 8,14 → flange klasse 2.
    Uden r var c/t = 9,68 og profilet klasse 3.
    """
    p = column_properties('HEA200')
    blocks = steel_column_check(
        label='S', section='HEA200', grade='S355', length_m=4, N_Ed_kN=100,
        A_cm2=p['A_cm2'], Iy_cm4=p['Iy_cm4'], Iz_cm4=p['Iz_cm4'],
        h_mm=p['h_mm'], b_mm=p['b_mm'], tf_mm=p['tf_mm'], tw_mm=p['tw_mm'],
        r_mm=p['r_mm'], W_pl_y_cm3=p['Wply_cm3'], M_y_Ed_kNm=20)
    cls = next(b for b in blocks if b.get('name') == 'Section class')
    assert cls['result'] == 'Class 2'


def test_class_3_never_uses_plastic_modulus():
    """
    Uden r er HEA200 i S355 klasse 3. M_y,Rd skal så regnes med W_el,y =
    I_y/(h/2) = 3692/9,5 = 388,6 cm³: 388,6·355/1,10/1000 = 125,4 kNm.
    Før blev W_pl (429 cm³) brugt og kaldt konservativt.
    """
    p = column_properties('HEA200')
    blocks = steel_column_check(
        label='S', section='HEA200', grade='S355', length_m=4, N_Ed_kN=100,
        A_cm2=p['A_cm2'], Iy_cm4=p['Iy_cm4'], Iz_cm4=p['Iz_cm4'],
        h_mm=p['h_mm'], b_mm=p['b_mm'], tf_mm=p['tf_mm'], tw_mm=p['tw_mm'],
        r_mm=0.0, W_pl_y_cm3=p['Wply_cm3'], M_y_Ed_kNm=20)
    row = next(b for b in blocks if b.get('name') == 'M_y,Rd')
    assert float(row['result'].split()[0]) == pytest.approx(125.4, abs=0.2)


def test_steel_column_defaults_are_dk_na(client):
    r = client.post('/calc/steel-column', json={'section': 'HEA200', 'length_m': 4, 'N_Ed_kN': 100})
    assert r.status_code == 200
    g0 = next(b for b in r.json() if b.get('name') == 'γ_M0')
    assert g0['result'] == '1.1'


def test_steel_beam_top_flange_load_lowers_M_cr(client):
    base = {'label': 'B', 'section': 'IPE300', 'grade': 'S355', 'span_m': 6,
            'g_k_kNm': 4, 'q_k_kNm': 3, 'ltb_length_m': 6, 'C1': 1.13}
    def mcr(top):
        blocks = client.post('/calc/steel-beam', json={**base, 'last_paa_overflange': top}).json()
        row = next(b for b in blocks if b.get('name') == 'M_cr')
        return float(row['result'].split()[0])
    assert mcr(True) < mcr(False)


def test_steel_beam_k_fi_scales_the_load(client):
    base = {'label': 'B', 'section': 'IPE300', 'grade': 'S355', 'span_m': 6,
            'g_k_kNm': 4, 'q_k_kNm': 3, 'ltb_restrained': True}
    def eta(kfi):
        blocks = client.post('/calc/steel-beam', json={**base, 'K_FI': kfi}).json()
        return next(b for b in blocks if b.get('type') == 'check')['ratio']
    assert eta(1.1) == pytest.approx(1.1 * eta(1.0), rel=0.01)
