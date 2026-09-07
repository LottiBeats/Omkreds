"""
test_fem_solvers_agree.py — loeserne skal svare det samme.

Der er tre af dem nu:

    opensees   general_frame_fem.solve  -- den, produktionen bruger
    pynite     fem_pynite.solve         -- ren Python, 3D bag en oversaettelse
    direkte    fem_direkte.solve        -- stivhedsmatricerne regnet her

De parametriserede tests i test_general_frame_fem.py holder hver loeser op mod
en lukket form. Det fanger, om et svar er rigtigt, men ikke om loeserne er enige
om alt det, en lukket form ikke naevner: fortegn paa reaktioner, drejninger,
normalkraft i j-enden, snitkraefter i en ramme der ikke staar i Teknisk Staabi.

Det er ikke en teoretisk bekymring. Foerste koersel af denne fil fandt praecis
saadan en fejl: N_j havde modsat fortegn i PyNite-vejen, i alle fem modeller, og
ingen af de syv lukkede former kunne se det -- N_j indgaar hverken i en
nedboejning eller i et moment.

Hvert par af tilgaengelige loesere sammenlignes. Lokalt findes pynite og
direkte, saa filen siger noget der; paa serveren findes alle tre, og saa er
OpenSees med i sammenligningen.
"""
import math

import pytest

import fem_direkte
import fem_pynite
import general_frame_fem as gf

_LOESERE = {}
if gf._OPS_AVAILABLE:
    _LOESERE['opensees'] = gf.solve
if fem_pynite._PYNITE_AVAILABLE:
    _LOESERE['pynite'] = fem_pynite.solve
_LOESERE['direkte'] = fem_direkte.solve

_NAVNE = sorted(_LOESERE)
_PAR = [(a, b) for i, a in enumerate(_NAVNE) for b in _NAVNE[i + 1:]]

if not _PAR:
    _PAR = [pytest.param(
        (None, None), id='ingen-par',
        marks=pytest.mark.skip(reason='der er kun én loeser i dette miljoe'))]


@pytest.fixture(params=_PAR, ids=lambda p: '%s-%s' % p if isinstance(p, tuple)
                else None)
def par(request):
    """Et par loesere, der skal vise sig at vaere den samme beregning."""
    a, b = request.param
    return a, b, _LOESERE[a], _LOESERE[b]


E_GPA, A_CM2, IZ_CM4 = 210.0, 53.8, 8356.0
STAV = {'E_GPa': E_GPA, 'A_cm2': A_CM2, 'Iz_cm4': IZ_CM4}


# ---------------------------------------------------------------------------
# Sammenligning
# ---------------------------------------------------------------------------

def _naer(a, b, rel=1e-4, gulv=1e-6):
    """Er to tal ens, naar man ser bort fra numerisk stoej?

    Gulvet er der, fordi de fleste interessante stoerrelser er nul et eller
    andet sted -- en momentfri ende, en vandret reaktion uden vandret last --
    og et relativt afvig paa nul er meningsloest.
    """
    if abs(a) < gulv and abs(b) < gulv:
        return True
    return abs(a - b) <= rel * max(abs(a), abs(b))


def _afvig_i_resultat(navn, na, nb, ra, rb, supports, equal_dofs=None):
    """Alle steder to resultat-dicts er uenige, som laesbare linjer."""
    ud = []
    bundne = {int(e['c_node']) for e in (equal_dofs or [])}

    for nid in sorted(ra['node_disps']):
        for i, m in enumerate(('ux', 'uy', 'rz')):
            # Charnierknudens drejning er ikke defineret i de loesere, der
            # skriver knuden sammen med sin partner. Flytningerne er bundet og
            # skal stemme; drejningen er ikke et tal, de kan vaere uenige om.
            if m == 'rz' and nid in bundne:
                continue
            va, vb = ra['node_disps'][nid][i], rb['node_disps'][nid][i]
            if not _naer(va, vb, gulv=1e-12):
                ud.append('%s: flytning %s i knude %d: %.6g / %.6g'
                          % (navn, m, nid, va, vb))

    sup_ids = {int(s['node_id']) for s in supports}
    for nid in sorted(ra['node_reactions']):
        if nid not in sup_ids:
            continue
        for i, m in enumerate(('Rx', 'Ry', 'Mz')):
            va, vb = ra['node_reactions'][nid][i], rb['node_reactions'][nid][i]
            if not _naer(va, vb):
                ud.append('%s: reaktion %s i knude %d: %.6g / %.6g'
                          % (navn, m, nid, va, vb))

    for eid in sorted(ra['ele_forces']):
        for i, m in enumerate(('N_i', 'V_i', 'M_i', 'N_j', 'V_j', 'M_j')):
            va, vb = ra['ele_forces'][eid][i], rb['ele_forces'][eid][i]
            if not _naer(va, vb):
                ud.append('%s: %s i element %s: %.6g / %.6g'
                          % (navn, m, eid, va, vb))

    for eid in sorted(ra.get('ele_extremes', {})):
        ea, eb = ra['ele_extremes'][eid], rb['ele_extremes'].get(eid)
        if ea is None or eb is None:
            continue
        for m in ('N_kN', 'V_kN', 'M_kNm'):
            if not _naer(ea[m], eb[m]):
                ud.append('%s: %s i element %s: %.6g / %.6g'
                          % (navn, m, eid, ea[m], eb[m]))
    return ud


def _sammenlign(par, navn, nodes, elements, supports, loads, equal_dofs=None):
    na, nb, a, b = par
    ra = a(nodes, elements, supports, loads, equal_dofs)
    rb = b(nodes, elements, supports, loads, equal_dofs)
    afvig = _afvig_i_resultat(navn, na, nb, ra, rb, supports, equal_dofs)
    assert not afvig, ('%s og %s er uenige (%s / %s):\n  %s'
                       % (na, nb, na, nb, '\n  '.join(afvig)))


# ---------------------------------------------------------------------------
# Modellerne
# ---------------------------------------------------------------------------

def test_simpelt_understoettet_bjaelke(par):
    L, w = 6.0, 10.0
    nodes = [{'id': 1, 'x': 0, 'y': 0}, {'id': 2, 'x': L / 2, 'y': 0},
             {'id': 3, 'x': L, 'y': 0}]
    elements = [dict(id=1, ni=1, nj=2, type='beam', release='none', **STAV),
                dict(id=2, ni=2, nj=3, type='beam', release='none', **STAV)]
    supports = [{'node_id': 1, 'ux': True, 'uy': True, 'rz': False},
                {'node_id': 3, 'ux': False, 'uy': True, 'rz': False}]
    loads = [{'type': 'udl', 'elem_id': e['id'],
              'direction': 'vertical', 'value_kNm': w} for e in elements]
    _sammenlign(par, 'bjaelke', nodes, elements, supports, loads)


def test_udkraget_bjaelke(par):
    L, w = 3.0, 5.0
    nodes = [{'id': 1, 'x': 0, 'y': 0}, {'id': 2, 'x': L, 'y': 0}]
    elements = [dict(id=1, ni=1, nj=2, type='beam', release='none', **STAV)]
    supports = [{'node_id': 1, 'ux': True, 'uy': True, 'rz': True}]
    loads = [{'type': 'udl', 'elem_id': 1,
              'direction': 'vertical', 'value_kNm': w}]
    _sammenlign(par, 'udkrag', nodes, elements, supports, loads)


def test_spaer_med_skraa_element(par):
    """En skraa stav: her skiller lokale og globale akser sig ad."""
    L, a, w = 4.0, math.radians(30.0), 6.0
    nodes = [{'id': 1, 'x': 0, 'y': 0},
             {'id': 2, 'x': L * math.cos(a), 'y': L * math.sin(a)}]
    elements = [dict(id=1, ni=1, nj=2, type='beam', release='none', **STAV)]
    supports = [{'node_id': 1, 'ux': True, 'uy': True, 'rz': True}]
    loads = [{'type': 'udl', 'elem_id': 1,
              'direction': 'vertical', 'value_kNm': w}]
    _sammenlign(par, 'spaer', nodes, elements, supports, loads)


def test_soejle_i_tryk_og_i_traek(par):
    """Fortegnet paa normalkraften — det, ingen lukket form fastholdt."""
    h, P = 4.0, 120.0
    nodes = [{'id': 1, 'x': 0, 'y': 0}, {'id': 2, 'x': 0, 'y': h}]
    elements = [dict(id=1, ni=1, nj=2, type='beam', release='none', **STAV)]
    supports = [{'node_id': 1, 'ux': True, 'uy': True, 'rz': True}]
    for fortegn, navn in ((-1, 'tryk'), (+1, 'traek')):
        loads = [{'type': 'nodal', 'node_id': 2,
                  'Fx_kN': 0.0, 'Fy_kN': fortegn * P, 'Mz_kNm': 0.0}]
        _sammenlign(par, 'soejle ' + navn, nodes, elements, supports, loads)


def test_ramme_med_vandret_og_lodret_last(par):
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
    _sammenlign(par, 'ramme', nodes, elements, supports, loads)


def test_momentudloesning_i_elementende(par):
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
    _sammenlign(par, 'udloesning', nodes, elements, supports, loads)


def test_gitterstang(par):
    """
    type='truss' — det eneste elementtype, der ikke er en bjaelke.

    Manglede i foerste udgave af filen, saa gitterstangen var den ene del af
    kontrakten, ingen sammenligning roerte. rz fastholdes i begge knuder: en
    gitterstang har ingen boejningsstivhed at holde en drejning med, og
    validate_model afviser modellen uden.
    """
    L, P = 4.0, 100.0
    nodes = [{'id': 1, 'x': 0, 'y': 0}, {'id': 2, 'x': L, 'y': 0}]
    elements = [dict(id=1, ni=1, nj=2, type='truss', release='none', **STAV)]
    supports = [{'node_id': 1, 'ux': True, 'uy': True, 'rz': True},
                {'node_id': 2, 'ux': False, 'uy': True, 'rz': True}]
    for fortegn, navn in ((+1, 'traek'), (-1, 'tryk')):
        loads = [{'type': 'nodal', 'node_id': 2,
                  'Fx_kN': fortegn * P, 'Fy_kN': 0.0, 'Mz_kNm': 0.0}]
        _sammenlign(par, 'gitterstang ' + navn, nodes, elements, supports, loads)


def test_kipcharnier_med_equal_dof(par):
    """
    Den anden maade: to sammenfaldende knuder bundet paa flytningerne.

    Det er den konstruktion, PyNite ikke har, og som _kollaps_charnierer()
    skriver om til én knude med en momentudloesning. fem_direkte loeser det i
    nummereringen i stedet. Om de to omskrivninger er den samme mekanik som
    OpenSees' equalDOF, kan kun afgoeres ved at spoerge.
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
    _sammenlign(par, 'kipcharnier', nodes, elements, supports, loads, equal_dofs)


# ---------------------------------------------------------------------------
# De to veje, de rigtige beregninger gaar
# ---------------------------------------------------------------------------
# solve() bliver kaldt tre steder, ikke ét: fra endepunktet, fra
# solve_combinations() én gang pr. lastkombination, og fra compute_alpha_cr()
# med proevelaster. De to sidste er dem, en rigtig beregning gaar igennem, og de
# var ikke sammenlignet af noget. Begge kalder modulets globale solve, saa de
# kan proeves ved at skifte den ud.

def _ramme():
    b, h = 6.0, 4.0
    nodes = [{'id': 1, 'x': 0, 'y': 0}, {'id': 2, 'x': 0, 'y': h},
             {'id': 3, 'x': b, 'y': h}, {'id': 4, 'x': b, 'y': 0}]
    elements = [dict(id=1, ni=1, nj=2, type='beam', release='none', **STAV),
                dict(id=2, ni=2, nj=3, type='beam', release='none', **STAV),
                dict(id=3, ni=3, nj=4, type='beam', release='none', **STAV)]
    supports = [{'node_id': 1, 'ux': True, 'uy': True, 'rz': True},
                {'node_id': 4, 'ux': True, 'uy': True, 'rz': True}]
    return nodes, elements, supports


def test_solve_combinations_giver_samme_indhyldning(par, monkeypatch):
    """
    Hele vejen gennem lastkombinationerne, ikke bare én beregning.

    Det er den vej, en eftervisning faktisk gaar: FEM'en koeres én gang pr.
    kombination, og indhyldningen af M, V og N er det, traeet og staalet
    efterfoelgende regnes for. Er loeserne uenige et sted, er det her, det faar
    konsekvenser.
    """
    na, nb, a, b = par
    nodes, elements, supports = _ramme()
    kombinationer = [
        {'name': '6.10a', 'governing_duration': 'permanent', 'loads': [
            {'load_type': 'udl', 'elem_id': 2, 'direction': 'vertical',
             'value_kNm': 7.2}]},
        {'name': '6.10b', 'governing_duration': 'short', 'loads': [
            {'load_type': 'udl', 'elem_id': 2, 'direction': 'vertical',
             'value_kNm': 12.0},
            {'load_type': 'udl', 'elem_id': 1, 'direction': 'horizontal',
             'value_kNm': 3.5}]},
    ]

    monkeypatch.setattr(gf, 'solve', a)
    env_a, tim_a, alle_a = gf.solve_combinations(
        nodes, elements, supports, kombinationer)
    monkeypatch.setattr(gf, 'solve', b)
    env_b, tim_b, alle_b = gf.solve_combinations(
        nodes, elements, supports, kombinationer)

    afvig = []
    for eid in sorted(env_a):
        for m in ('M_max_kNm', 'V_max_kN', 'N_max_kN'):
            if not _naer(env_a[eid][m], env_b[eid][m], rel=1e-3):
                afvig.append('indhyldning %s i element %s: %.6g / %.6g'
                             % (m, eid, env_a[eid][m], env_b[eid][m]))
        for m in ('M_combo', 'V_combo', 'N_combo'):
            if env_a[eid][m] != env_b[eid][m]:
                afvig.append('indhyldning %s i element %s: %r / %r'
                             % (m, eid, env_a[eid][m], env_b[eid][m]))

    for ra, rb in zip(alle_a, alle_b):
        afvig += _afvig_i_resultat(ra['name'], na, nb, ra, rb, supports)

    assert not afvig, ('%s og %s er uenige (%s / %s):\n  %s'
                       % (na, nb, na, nb, '\n  '.join(afvig)))


def test_alpha_cr_giver_samme_svar(par, monkeypatch):
    """
    Rammens sidestivhed, EN 1993-1-1 § 5.2.1(4)B.

    compute_alpha_cr koerer sin egen beregning med proevelaster for at maale
    flytningen. Den beregning gik ikke gennem nogen sammenligning foer, og den
    afgoer, om rammen overhovedet maa regnes efter foerste orden.
    """
    na, nb, a, b = par
    nodes, elements, supports = _ramme()
    loads = [{'type': 'udl', 'elem_id': 2,
              'direction': 'vertical', 'value_kNm': 12.0}]

    svar = []
    for loeser in (a, b):
        monkeypatch.setattr(gf, 'solve', loeser)
        res = loeser(nodes, elements, supports, loads)
        svar.append(gf.compute_alpha_cr(
            nodes, elements, supports,
            res['ele_forces'], res['node_reactions']))

    sa, sb = svar
    # Ingen af dem maa vaere None. compute_alpha_cr svarer None paa enhver fejl
    # -- den swelger sin proeveberegning i et "except Exception" -- saa to None
    # ville faa denne test til at passere uden at sammenligne noget. Det var
    # praecis, hvad der skete, mens spaerren "if not _OPS_AVAILABLE" stod i
    # funktionen: testen var groen og tom paa samme tid.
    assert sa is not None, '%s fik intet alpha_cr — testen ville vaere tom' % na
    assert sb is not None, '%s fik intet alpha_cr — testen ville vaere tom' % nb

    afvig = []
    for noegle in sorted(set(sa) | set(sb)):
        va, vb = sa.get(noegle), sb.get(noegle)
        if isinstance(va, (int, float)) and isinstance(vb, (int, float)) \
                and not isinstance(va, bool):
            if not _naer(float(va), float(vb), rel=1e-3):
                afvig.append('alpha_cr %s: %.6g / %.6g' % (noegle, va, vb))
        elif va != vb:
            afvig.append('alpha_cr %s: %r / %r' % (noegle, va, vb))

    assert not afvig, ('%s og %s er uenige (%s / %s):\n  %s'
                       % (na, nb, na, nb, '\n  '.join(afvig)))
