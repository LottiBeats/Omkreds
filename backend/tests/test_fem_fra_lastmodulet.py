"""
test_fem_fra_lastmodulet.py — rammeberegningen henter kombinationerne i
lastmodulet.

Den model, der proeves, er den fra A2'en: en tofagsbjaelke, 4 + 4 m, C24
140x360, med G_k = 1,0 kN/m og én nyttelast paa 1,5 kN/m i kategori A.

I den A2 stod lastgrundlaget og beregningen i samme dokument uden at roere
hinanden: kombinationsblokken skrev E_d,ULS = 3,250 kN/m, og rammen var
belastet med 10 kN/m tastet i haanden. Det er den forbindelse, der proeves her.
"""
import pytest

import main
from load_combo import kombinationssaet


G_K, Q_K = 1.0, 1.5
_LASTMODUL = [{'label': 'Q1', 'category': 'A', 'Q_k': Q_K}]
_TILFAELDE = [{'nr': -1, 'navn': 'Egenlast', 'permanent': True},
              {'nr': 0,  'navn': 'Q1', 'kategori': 'A', 'permanent': False}]


def _input(situationer=()):
    nodes = [{'id': 1, 'x': 0.0, 'y': 0.0},
             {'id': 2, 'x': 4.0, 'y': 0.0},
             {'id': 3, 'x': 8.0, 'y': 0.0}]
    elements = [{'id': i, 'ni': i, 'nj': i + 1, 'type': 'beam',
                 'release': 'none', 'E_GPa': 11.0, 'A_cm2': 504.0,
                 'Iz_cm4': 54432.0} for i in (1, 2)]
    supports = [{'node_id': i, 'ux': i == 1, 'uy': True, 'rz': False}
                for i in (1, 2, 3)]
    loads = []
    for eid in (1, 2):
        loads.append({'type': 'udl', 'elem_id': eid, 'direction': 'vertical',
                      'value_kNm': G_K, 'lasttilfaelde': -1})
        loads.append({'type': 'udl', 'elem_id': eid, 'direction': 'vertical',
                      'value_kNm': Q_K, 'lasttilfaelde': 0})
    return main.GenFrameFemInput(
        title='A2', nodes=nodes, elements=elements, supports=supports,
        loads=loads,
        lastmodul_kombinationer=kombinationssaet(_LASTMODUL),
        lastmodul_tilfaelde=_TILFAELDE,
        situationer=list(situationer),
    )


@pytest.fixture(scope='module')
def svar():
    return main.calc_general_frame_fem(_input())


def _summary(svar):
    return svar['_summary']


def test_brudgraensen_kommer_af_lastmodulets_egne_tal(svar):
    """
    6.10b giver 1,0·1,0 + 1,5·1,5 = 3,250 kN/m -- det tal, lastgrundlaget selv
    skriver. Stoetningsmomentet paa en tofagsbjaelke er wL²/8.
    """
    env = _summary(svar)['envelope']
    assert env[1]['M_max_kNm'] == pytest.approx(3.25 * 4.0**2 / 8, rel=1e-3)


def test_lastvarigheden_kommer_fra_kombinationen_og_ikke_fra_short(svar):
    """
    Den fejl, der staar i A2'en. Traebjaelken skrev "lastvarighed: kort,
    k_mod = 0,90", fordi FEM'ens laster ikke kom fra en kombination og
    faldbagen er 'short' -- den gunstigste klasse der findes. Nyttelast i
    kategori A er MIDDEL, og k_mod 0,80. Forskellen er 12,5 % kapacitet.
    """
    env = _summary(svar)['envelope']
    assert env[1]['M_duration'] == 'medium'
    assert _summary(svar)['timber_envelope'][1][1]['duration'] == 'medium'


def test_anvendelse_og_ulykke_regnes_med(svar):
    ind = _summary(svar)['indhyldninger']
    assert {'uls', 'als_brand', 'als_oevrig',
            'sls_karakteristisk', 'sls_hyppig', 'sls_kvasi'} <= set(ind)

    # Karakteristisk: 1,0 + 1,5 = 2,5 kN/m
    assert ind['sls_karakteristisk']['envelope'][1]['M_max_kNm'] \
        == pytest.approx(2.5 * 4.0**2 / 8, rel=1e-3)


def test_nedboejningen_findes_og_er_anvendelsens_ikke_brudgraensens(svar):
    """
    A2'en viste 2,31 mm i hovedresultaterne uden at sige hvilken
    graensetilstand det var, og eftervisningen sagde samtidig at nedboejning
    ikke kunne eftervises.

    Den lukkede form for en tofagsbjaelke er 0,0054·w·L⁴/EI. Med w = 2,5 kN/m,
    E = 11 GPa og I = 54432 cm⁴ giver det 0,577 mm.
    """
    nedb = _summary(svar)['nedboejning_pr_situation']
    assert 'sls_karakteristisk' in nedb

    w, L, E, I = 2.5, 4.0, 11e9, 54432e-8
    forventet = 0.0054 * (w * 1000) * L**4 / (E * I) * 1000    # mm
    assert abs(nedb['sls_karakteristisk']['w_mm']) \
        == pytest.approx(forventet, rel=0.02)

    # Brudgraensen er stoerre. Den maa ikke vaere den, der staar som
    # nedboejning -- det var netop fejlen med de 0,55 mm.
    assert abs(nedb['uls']['w_mm']) > abs(nedb['sls_karakteristisk']['w_mm'])


def test_kun_de_valgte_situationer_koeres():
    svar = main.calc_general_frame_fem(_input(situationer=('uls',)))
    assert set(_summary(svar)['indhyldninger']) == {'uls'}
