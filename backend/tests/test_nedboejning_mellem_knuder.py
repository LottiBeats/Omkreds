"""
test_nedboejning_mellem_knuder.py — nedboejningen sker mellem knuderne.

Fejlen der gav anledning til filen
----------------------------------
En totalfags bjaelke med 3,25 kN/m paa begge fag viste

    delta_y = 0.00 mm      og      "Deformation  max 0,0 mm"

Modellen havde tre understoetninger og ét element pr. fag, saa HVER knude var
en understoetning. Knudeflytningerne var rigtigt nul -- der var bare ingen
knude midt i faget at aflaese nedhaenget paa.

M_max og V_max var samtidig rigtige, saa beregningen fejlede ikke. Kun
aflaesningen gjorde.

Loesningen er at integrere EI*w'' = M langs stangen i stedet for at kigge paa
knuderne. Det gaelder for enhver lastfigur, ogsaa dellaster, og det goer
opdelingen i flere elementer pr. fag unoedvendig.
"""
import pytest

import general_frame_fem as gf

STAV = dict(E_GPa=210.0, A_cm2=53.8, Iz_cm4=8356.0)


def _totalfag(w=3.25, L=4.0):
    nodes = [{'id': i + 1, 'x': L * i, 'y': 0} for i in range(3)]
    els = [dict(id=1, ni=1, nj=2, type='beam', release='none', **STAV),
           dict(id=2, ni=2, nj=3, type='beam', release='none', **STAV)]
    sup = [{'node_id': i, 'ux': i == 1, 'uy': True, 'rz': False}
           for i in (1, 2, 3)]
    loads = [{'type': 'udl', 'elem_id': e, 'direction': 'vertical',
              'value_kNm': w} for e in (1, 2)]
    return nodes, els, sup, loads


def test_alle_knuder_er_understoetninger_og_flytningerne_er_nul():
    """Forudsaetningen: det er ikke loeseren, der er gal."""
    nodes, els, sup, loads = _totalfag()
    r = gf.solve(nodes, els, sup, loads)
    for v in r['node_disps'].values():
        assert abs(v[1]) < 1e-12


def test_nedhaenget_findes_alligevel():
    """
    Totalfags bjaelke, jaevn last: max nedboejning er 0,0054*w*L^4/EI ved
    x = 0,4215*L fra den ydre understoetning (Teknisk Staabi).
    """
    L, w = 4.0, 3.25
    nodes, els, sup, loads = _totalfag(w, L)
    r = gf.solve(nodes, els, sup, loads)
    v, eid, x = gf.stoerste_nedboejning(nodes, els, r['ele_forces'],
                                        r['ele_segs'], r['node_disps'])

    EI = 210e6 * 8356e-8
    assert abs(v) == pytest.approx(0.0054 * w * L**4 / EI, rel=0.03)
    assert eid in (1, 2)
    # x maales fra elementets i-ende; den ydre understoetning er den fjerne
    # ende af element 2.
    fra_ydre = min(x, L - x, abs(L - x))
    assert fra_ydre == pytest.approx(0.4215 * L, abs=0.15)


def test_sammenfatningen_rapporterer_det():
    nodes, els, sup, loads = _totalfag()
    r = gf.solve(nodes, els, sup, loads)
    s = gf.summarise(nodes, els, r['node_disps'], r['node_reactions'],
                     r['ele_forces'], sup, loads, r.get('ele_extremes'),
                     ele_segs=r['ele_segs'])
    assert s['max_uy_mm'] > 0.1, 'sammenfatningen viser stadig nul'
    assert s['max_uy_elem'] in (1, 2)
    assert s['max_uy_x_m'] is not None


def test_en_simpel_bjaelke_med_ét_element_rammer_den_lukkede_form():
    """
    Det simpleste tilfaelde, og det der er lettest at have en mening om:
    5wL^4/384EI. Med ét element er der ingen knude i midten.
    """
    L, w = 6.0, 10.0
    nodes = [{'id': 1, 'x': 0, 'y': 0}, {'id': 2, 'x': L, 'y': 0}]
    els = [dict(id=1, ni=1, nj=2, type='beam', release='none', **STAV)]
    sup = [{'node_id': 1, 'ux': True, 'uy': True, 'rz': False},
           {'node_id': 2, 'ux': False, 'uy': True, 'rz': False}]
    loads = [{'type': 'udl', 'elem_id': 1, 'direction': 'vertical',
              'value_kNm': w}]
    r = gf.solve(nodes, els, sup, loads)
    v, _, x = gf.stoerste_nedboejning(nodes, els, r['ele_forces'],
                                      r['ele_segs'], r['node_disps'])
    EI = 210e6 * 8356e-8
    assert abs(v) == pytest.approx(5 * w * L**4 / (384 * EI), rel=0.01)
    assert x == pytest.approx(L / 2, abs=0.1)


# ── Anvendelsesgrænsetilstand fra påsatte laster ────────────────────────────

def test_sls_regnes_naar_lasterne_paasaettes_igen(client):
    """
    Alt hvad SLS kraever ligger i lastkombinationen: G_k, Q_k og psi_2. Lasterne
    skal bare paasaettes igen med de karakteristiske vaerdier.

    Foer koerte FEM'en kun brudgraensen, og de 0,55 mm i dokumentet var derfor
    ULS-nedboejningen -- ikke en vaerdi, man maa eftervise imod.

    Analysen er lineaer, saa to koersler (G alene, Q alene) giver baade w_inst
    og krybningen efter §2.2.3(5).
    """
    L = 4.0
    nodes = [{'id': i + 1, 'x': L * i, 'y': 0} for i in range(3)]
    els = [{'id': 1, 'ni': 1, 'nj': 2, 'type': 'beam', 'release': 'none',
            'E_GPa': 210, 'A_cm2': 39.1, 'Iz_cm4': 3892},
           {'id': 2, 'ni': 2, 'nj': 3, 'type': 'beam', 'release': 'none',
            'E_GPa': 210, 'A_cm2': 39.1, 'Iz_cm4': 3892}]
    sup = [{'node_id': i, 'ux': i == 1, 'uy': True, 'rz': False}
           for i in (1, 2, 3)]
    udl = lambda e, w: {'type': 'udl', 'elem_id': e, 'wy_kNm': w, 'wx_kNm': 0}

    r = client.post('/calc/general-frame-fem', json={
        'title': 'Bjælke',
        'nodes': nodes, 'elements': els, 'supports': sup,
        'loads':       [udl(1, 3.25), udl(2, 3.25)],   # ULS
        'loads_sls_G': [udl(1, 1.00), udl(2, 1.00)],   # G_k
        'loads_sls_Q': [udl(1, 1.50), udl(2, 1.50)],   # Q_k
        'psi_2': 0.20, 'service_class': 1,
    })
    assert r.status_code == 200, r.text
    sls = r.json()['_summary'].get('sls')
    assert sls is not None, 'SLS blev ikke regnet, selvom lasterne var påsat'

    # w_inst skal vaere summen af de to, og MINDRE end ULS-nedboejningen:
    # 2,5 mod 3,25 kN/m.
    assert sls['w_inst_mm'] == pytest.approx(
        sls['w_inst_G_mm'] + sls['w_inst_Q_mm'], abs=1e-3)
    assert sls['w_inst_mm'] < r.json()['_summary']['max_uy_mm']

    # Krybningen goer langtidsvaerdien stoerre end den oejeblikkelige.
    assert sls['w_fin_mm'] > sls['w_inst_mm']
    # G kryber fuldt, Q kun med psi_2 -- saa forholdet ligger fast.
    ventet = (sls['w_inst_G_mm'] * (1 + sls['k_def'])
              + sls['w_inst_Q_mm'] * (1 + 0.20 * sls['k_def']))
    assert sls['w_fin_mm'] == pytest.approx(ventet, abs=1e-3)


def test_uden_sls_laster_regnes_der_ikke_sls(client):
    """
    Blokken sender kun SLS-lasterne, naar ALLE linjelaster kommer fra en
    lastkombination. Er der en haandtastet iblandt, kender vi ikke dens
    opdeling -- og et ufuldstaendigt saet giver en for LILLE nedboejning.
    """
    nodes = [{'id': 1, 'x': 0, 'y': 0}, {'id': 2, 'x': 4, 'y': 0}]
    els = [{'id': 1, 'ni': 1, 'nj': 2, 'type': 'beam', 'release': 'none',
            'E_GPa': 210, 'A_cm2': 39.1, 'Iz_cm4': 3892}]
    sup = [{'node_id': 1, 'ux': True, 'uy': True, 'rz': False},
           {'node_id': 2, 'ux': False, 'uy': True, 'rz': False}]
    r = client.post('/calc/general-frame-fem', json={
        'title': 'B', 'nodes': nodes, 'elements': els, 'supports': sup,
        'loads': [{'type': 'udl', 'elem_id': 1, 'wy_kNm': 3.25}],
    })
    assert r.status_code == 200, r.text
    assert r.json()['_summary'].get('sls') is None
