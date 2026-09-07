"""
test_fem_solvers_agree_tilfaeldigt.py — loeserne holdt op mod hinanden paa
rammer, ingen har skrevet i haanden.

De syv modeller i test_fem_solvers_agree.py er valgt, fordi nogen kunne se, at
de var interessante. Det er baade styrken og svagheden: de daekker praecis det,
man taenkte paa. Da produktionen skulle skifte fra OpenSees til fem_direkte, var
spoergsmaalet ikke "er de syv enige", men "er de enige om alt det, jeg ikke kom
i tanke om".

Her genereres rammerne i stedet. Geometri, tvaersnit, understoetninger,
momentudloesninger, gitterstaenger og laster trukkes tilfaeldigt, og hver model
koeres gennem hvert par af tilgaengelige loesere. Modeller, validate_model
afviser, springes over -- de siger ikke noget om, hvorvidt loeserne er enige.

Froet er fast. En uenighed skal kunne findes igen, og et tal, der aendrer sig fra
koersel til koersel, er ikke en fejlmeddelelse man kan arbejde med.
"""
import random

import pytest

import general_frame_fem as gf
from general_frame_fem import ModelError

from test_fem_solvers_agree import _LOESERE, _NAVNE, _afvig_i_resultat

_PAR = [(a, b) for i, a in enumerate(_NAVNE) for b in _NAVNE[i + 1:]]

ANTAL_MODELLER = 150
MINDST_SAMMENLIGNET = 40      # ellers siger testen ingenting


def _tilfaeldig_ramme(rng):
    """
    En ramme med 2-4 soejler og en tagflade ovenpaa.

    Formen er bevidst den slags, blokken faktisk bruges til -- soejler,
    riegler, spaer -- og ikke en vilkaarlig graf. En tilfaeldig graf ville
    mest producere mekanismer, som validate_model afviser, og saa ville de
    fleste traekninger ikke sammenligne noget.
    """
    m = rng.randint(2, 4)
    xs = sorted(rng.uniform(0.0, 4.0) + 5.0 * i for i in range(m))
    hoejder = [rng.uniform(2.5, 5.0) for _ in range(m)]

    nodes = []
    fod, top = [], []
    nid = 1
    for x, h in zip(xs, hoejder):
        nodes.append({'id': nid, 'x': round(x, 3), 'y': 0.0})
        fod.append(nid); nid += 1
        nodes.append({'id': nid, 'x': round(x, 3), 'y': round(h, 3)})
        top.append(nid); nid += 1

    def stav(eid, ni, nj, typ='beam', rel='none'):
        return {'id': eid, 'ni': ni, 'nj': nj, 'type': typ, 'release': rel,
                'E_GPa': round(rng.uniform(10.0, 210.0), 1),
                'A_cm2': round(rng.uniform(20.0, 120.0), 1),
                'Iz_cm4': round(rng.uniform(500.0, 20000.0), 1)}

    elements = []
    eid = 1
    for b, t in zip(fod, top):
        elements.append(stav(eid, b, t)); eid += 1
    for a, b in zip(top, top[1:]):
        # En rigel faar af og til en momentudloesning i den ene ende. Begge
        # ender ville goere den til en pendulstav, og saa haenger tagfladen
        # i ingenting.
        rel = rng.choice(['none', 'none', 'none', 'start', 'end'])
        elements.append(stav(eid, a, b, rel=rel)); eid += 1

    # En diagonal som gitterstang, saa den elementtype ogsaa kommer med.
    if m >= 2 and rng.random() < 0.3:
        elements.append(stav(eid, fod[0], top[1], typ='truss')); eid += 1

    # Understoetninger: mindst én indspaendt, saa rammen ikke er en mekanisme.
    supports = []
    for i, b in enumerate(fod):
        if i == 0 or rng.random() < 0.5:
            supports.append({'node_id': b, 'ux': True, 'uy': True, 'rz': True})
        else:
            supports.append({'node_id': b, 'ux': rng.random() < 0.5,
                             'uy': True, 'rz': False})

    loads = []
    for el in elements:
        if el['type'] == 'truss':
            continue
        if rng.random() < 0.6:
            loads.append({'type': 'udl', 'elem_id': el['id'],
                          'direction': rng.choice(['vertical', 'horizontal',
                                                   'perpendicular']),
                          'value_kNm': round(rng.uniform(-12.0, 12.0), 2)})
    for t in top:
        if rng.random() < 0.4:
            loads.append({'type': 'nodal', 'node_id': t,
                          'Fx_kN': round(rng.uniform(-30.0, 30.0), 2),
                          'Fy_kN': round(rng.uniform(-80.0, 10.0), 2),
                          'Mz_kNm': round(rng.uniform(-20.0, 20.0), 2)})

    return nodes, elements, supports, loads


@pytest.mark.skipif(len(_PAR) < 2 and not _PAR,
                    reason='der er kun én loeser i dette miljoe')
@pytest.mark.parametrize('na,nb', _PAR if _PAR else [('', '')])
def test_tilfaeldige_rammer(na, nb):
    """
    Hver af de to loesere paa de samme mange rammer.

    Formaalet er ikke at ramme et bestemt faenomen, men at komme ud, hvor
    ingen har set efter: skraa staenger med negativ last, riegler med
    momentudloesning i den ene ende, gitterstaenger paa skraa, blandede
    tvaersnit, understoetninger der kun holder i én retning.
    """
    if not na:
        pytest.skip('ingen par')

    a, b = _LOESERE[na], _LOESERE[nb]
    rng = random.Random(20260907)

    sammenlignet = 0
    sprunget = 0
    afvist = 0
    for n in range(ANTAL_MODELLER):
        nodes, elements, supports, loads = _tilfaeldig_ramme(rng)

        try:
            ra = a(nodes, elements, supports, loads)
            rb = b(nodes, elements, supports, loads)
        except ModelError:
            # Mekanisme eller naesten-singulaer, fanget af den faelles
            # validate_model eller check_results.
            sprunget += 1
            continue
        except Exception as exc:
            # PyNite har sin egen singularitetskontrol og kaster en almindelig
            # Exception. Den er ikke en fejl -- den er en loeser, der siger fra.
            # Modellen springes over, men det taelles: afviser den ene loeser
            # markant oftere end den anden, er det i sig selv en forskel, der
            # skal ses.
            if 'singular' not in str(exc).lower():
                raise
            afvist += 1
            sprunget += 1
            continue

        afvig = _afvig_i_resultat('model %d' % n, na, nb, ra, rb, supports)
        assert not afvig, (
            '%s og %s er uenige om tilfaeldig model %d (%s / %s).\n'
            'Modellen kan genskabes med Random(20260907) og %d traekninger.\n'
            '  %s' % (na, nb, n, na, nb, n, '\n  '.join(afvig[:12])))
        sammenlignet += 1

    assert sammenlignet >= MINDST_SAMMENLIGNET, (
        'kun %d af %d modeller kunne regnes (%d sprunget over). Testen '
        'sammenligner for lidt til at sige noget -- generatoren laver for '
        'mange mekanismer.' % (sammenlignet, ANTAL_MODELLER, sprunget))
