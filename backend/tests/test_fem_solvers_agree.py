"""
test_fem_solvers_agree.py — OpenSees og PyNite skal svare det samme.

De parametriserede tests i test_general_frame_fem.py holder hver loeser op mod
en lukket form. Det fanger, om et svar er rigtigt, men ikke om de to loesere er
enige om alt det, en lukket form ikke naevner: fortegn paa reaktioner, drejning
i knuderne, normalkraft i en stav der naesten ingen har, snitkraefter i en ramme
der ikke staar i Teknisk Staabi.

Denne fil koerer de samme modeller gennem begge og sammenligner tal for tal.
Den springes over, naar kun den ene loeser kan importeres -- paa Windows er det
altid tilfaeldet, fordi openseespy er en kompileret udvidelse, der ikke loader
der. Den siger altsaa foerst noget paa serveren, og det er meningen: det er
praecis der, de to skal vise sig at vaere den samme beregning, foer den ene kan
erstatte den anden.
"""
import math

import pytest

import fem_pynite
import general_frame_fem as gf

begge_loesere = pytest.mark.skipif(
    not (gf._OPS_AVAILABLE and fem_pynite._PYNITE_AVAILABLE),
    reason='kraever baade openseespy og PyNite',
)

E_GPA, A_CM2, IZ_CM4 = 210.0, 53.8, 8356.0
STAV = {'E_GPa': E_GPA, 'A_cm2': A_CM2, 'Iz_cm4': IZ_CM4}


# ---------------------------------------------------------------------------
# Sammenligning
# ---------------------------------------------------------------------------

def _naer(a, b, rel=1e-6, gulv=1e-9):
    """Er to tal ens, naar man ser bort fra numerisk stoej?

    Gulvet er der, fordi de fleste af de interessante stoerrelser er nul et
    eller andet sted -- en momentfri ende, en vandret reaktion uden vandret
    last -- og et relativt afvig paa nul er meningsloest.
    """
    if abs(a) < gulv and abs(b) < gulv:
        return True
    naevner = max(abs(a), abs(b))
    return abs(a - b) <= rel * naevner


def _sammenlign(navn, nodes, elements, supports, loads, equal_dofs=None):
    a = gf.solve(nodes, elements, supports, loads, equal_dofs)
    b = fem_pynite.solve(nodes, elements, supports, loads, equal_dofs)

    afvig = []

    for nid in sorted(a['node_disps']):
        for i, m in enumerate(('ux', 'uy', 'rz')):
            va, vb = a['node_disps'][nid][i], b['node_disps'][nid][i]
            # Charnierknudens drejning er ikke defineret i PyNite-vejen: den
            # knude findes ikke i modellen, den er skrevet sammen med sin
            # partner. Flytningerne er bundet og skal stemme; drejningen er
            # ikke et tal, de to loesere kan vaere uenige om.
            if m == 'rz' and any(int(e['c_node']) == nid
                                 for e in (equal_dofs or [])):
                continue
            if not _naer(va, vb, rel=1e-4, gulv=1e-12):
                afvig.append('%s: flytning %s i knude %d: %.6g / %.6g'
                             % (navn, m, nid, va, vb))

    for nid in sorted(a['node_reactions']):
        if not any(int(s['node_id']) == nid for s in supports):
            continue
        for i, m in enumerate(('Rx', 'Ry', 'Mz')):
            va, vb = a['node_reactions'][nid][i], b['node_reactions'][nid][i]
            if not _naer(va, vb, rel=1e-4, gulv=1e-6):
                afvig.append('%s: reaktion %s i knude %d: %.6g / %.6g'
                             % (navn, m, nid, va, vb))

    for eid in sorted(a['ele_forces']):
        for i, m in enumerate(('N_i', 'V_i', 'M_i', 'N_j', 'V_j', 'M_j')):
            va, vb = a['ele_forces'][eid][i], b['ele_forces'][eid][i]
            if not _naer(va, vb, rel=1e-4, gulv=1e-6):
                afvig.append('%s: %s i element %s: %.6g / %.6g'
                             % (navn, m, eid, va, vb))

    for eid in sorted(a['ele_extremes']):
        ea, eb = a['ele_extremes'][eid], b['ele_extremes'][eid]
        if ea is None or eb is None:
            continue
        for m in ('N_kN', 'V_kN', 'M_kNm'):
            if not _naer(ea[m], eb[m], rel=1e-4, gulv=1e-6):
                afvig.append('%s: %s i element %s: %.6g / %.6g'
                             % (navn, m, eid, ea[m], eb[m]))

    assert not afvig, ('OpenSees og PyNite er uenige (OpenSees / PyNite):\n  '
                       + '\n  '.join(afvig))


# ---------------------------------------------------------------------------
# Modellerne
# ---------------------------------------------------------------------------

@begge_loesere
def test_simpelt_understoettet_bjaelke():
    L, w = 6.0, 10.0
    nodes = [{'id': 1, 'x': 0, 'y': 0}, {'id': 2, 'x': L / 2, 'y': 0},
             {'id': 3, 'x': L, 'y': 0}]
    elements = [dict(id=1, ni=1, nj=2, type='beam', release='none', **STAV),
                dict(id=2, ni=2, nj=3, type='beam', release='none', **STAV)]
    supports = [{'node_id': 1, 'ux': True, 'uy': True, 'rz': False},
                {'node_id': 3, 'ux': False, 'uy': True, 'rz': False}]
    loads = [{'type': 'udl', 'elem_id': e['id'],
              'direction': 'vertical', 'value_kNm': w} for e in elements]
    _sammenlign('bjaelke', nodes, elements, supports, loads)


@begge_loesere
def test_udkraget_bjaelke():
    L, w = 3.0, 5.0
    nodes = [{'id': 1, 'x': 0, 'y': 0}, {'id': 2, 'x': L, 'y': 0}]
    elements = [dict(id=1, ni=1, nj=2, type='beam', release='none', **STAV)]
    supports = [{'node_id': 1, 'ux': True, 'uy': True, 'rz': True}]
    loads = [{'type': 'udl', 'elem_id': 1,
              'direction': 'vertical', 'value_kNm': w}]
    _sammenlign('udkrag', nodes, elements, supports, loads)


@begge_loesere
def test_spaer_med_skraa_element():
    """En skraa stav: her skiller lokale og globale akser sig ad."""
    L, a, w = 4.0, math.radians(30.0), 6.0
    nodes = [{'id': 1, 'x': 0, 'y': 0},
             {'id': 2, 'x': L * math.cos(a), 'y': L * math.sin(a)}]
    elements = [dict(id=1, ni=1, nj=2, type='beam', release='none', **STAV)]
    supports = [{'node_id': 1, 'ux': True, 'uy': True, 'rz': True}]
    loads = [{'type': 'udl', 'elem_id': 1,
              'direction': 'vertical', 'value_kNm': w}]
    _sammenlign('spaer', nodes, elements, supports, loads)


@begge_loesere
def test_soejle_i_tryk_og_i_traek():
    """Fortegnet paa normalkraften — det, ingen lukket form fastholdt."""
    h, P = 4.0, 120.0
    nodes = [{'id': 1, 'x': 0, 'y': 0}, {'id': 2, 'x': 0, 'y': h}]
    elements = [dict(id=1, ni=1, nj=2, type='beam', release='none', **STAV)]
    supports = [{'node_id': 1, 'ux': True, 'uy': True, 'rz': True}]
    for fortegn, navn in ((-1, 'tryk'), (+1, 'traek')):
        loads = [{'type': 'nodal', 'node_id': 2,
                  'Fx_kN': 0.0, 'Fy_kN': fortegn * P, 'Mz_kNm': 0.0}]
        _sammenlign('soejle ' + navn, nodes, elements, supports, loads)


@begge_loesere
def test_ramme_med_vandret_og_lodret_last():
    """To søjler og en rigel — et system uden en formel i Teknisk Staabi."""
    b, h, w, p = 6.0, 4.0, 8.0, 3.0
    nodes = [{'id': 1, 'x': 0, 'y': 0}, {'id': 2, 'x': 0, 'y': h},
             {'id': 3, 'x': b, 'y': h}, {'id': 4, 'x': b, 'y': 0}]
    elements = [dict(id=1, ni=1, nj=2, type='beam', release='none', **STAV),
                dict(id=2, ni=2, nj=3, type='beam', release='none', **STAV),
                dict(id=3, ni=3, nj=4, type='beam', release='none', **STAV)]
    supports = [{'node_id': 1, 'ux': True, 'uy': True, 'rz': True},
                {'node_id': 4, 'ux': True, 'uy': True, 'rz': True}]
    loads = [{'type': 'udl', 'elem_id': 2,
              'direction': 'vertical', 'value_kNm': w},
             {'type': 'udl', 'elem_id': 1,
              'direction': 'horizontal', 'value_kNm': p}]
    _sammenlign('ramme', nodes, elements, supports, loads)


@begge_loesere
def test_momentudloesning_i_elementende():
    """
    release='end' — den ene af de to maader, et charnier kan angives paa.

    Knude 2 fastholdes i rz. Uden det er der ingenting, der optager en drejning
    der: elementet kan ikke overfoere moment til knuden, og der sidder ikke
    andet i den. Foerste udgave af testen glemte det, og validate_model afviste
    modellen med det samme -- med rette.
    """
    L, w = 6.0, 10.0
    nodes = [{'id': 1, 'x': 0, 'y': 0}, {'id': 2, 'x': L, 'y': 0}]
    elements = [dict(id=1, ni=1, nj=2, type='beam', release='end', **STAV)]
    supports = [{'node_id': 1, 'ux': True, 'uy': True, 'rz': True},
                {'node_id': 2, 'ux': False, 'uy': True, 'rz': True}]
    loads = [{'type': 'udl', 'elem_id': 1,
              'direction': 'vertical', 'value_kNm': w}]
    _sammenlign('udloesning', nodes, elements, supports, loads)


@begge_loesere
def test_kipcharnier_med_equal_dof():
    """
    Den anden maade: to sammenfaldende knuder bundet paa flytningerne.

    Det er den konstruktion, PyNite ikke har, og som _kollaps_charnierer()
    skriver om til én knude med en momentudloesning. Om omskrivningen er den
    samme mekanik, kan kun afgoeres ved at spoerge begge loesere.
    """
    b, h, w = 8.0, 2.0, 5.0
    nodes = [{'id': 1, 'x': 0,     'y': 0},
             {'id': 2, 'x': b / 2, 'y': h},
             {'id': 3, 'x': b / 2, 'y': h},
             {'id': 4, 'x': b,     'y': 0}]
    elements = [dict(id=1, ni=1, nj=2, type='beam', release='none', **STAV),
                dict(id=2, ni=3, nj=4, type='beam', release='none', **STAV)]
    supports = [{'node_id': 1, 'ux': True, 'uy': True, 'rz': False},
                {'node_id': 4, 'ux': True, 'uy': True, 'rz': False}]
    loads = [{'type': 'udl', 'elem_id': e['id'],
              'direction': 'vertical', 'value_kNm': w} for e in elements]
    equal_dofs = [{'r_node': 2, 'c_node': 3, 'dofs': [1, 2]}]
    _sammenlign('kipcharnier', nodes, elements, supports, loads, equal_dofs)
