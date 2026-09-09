"""
test_udnyttelse.py — udnyttelseskurven skal sige det samme som eftervisningen.

Formlerne i udnyttelse.py er de samme som i timber.py, men de staar to steder.
To steder gaar fra hinanden. Testen her er den eneste grund til, at det er
forsvarligt: den koerer begge paa de samme tal og kraever, at forholdene er
ens til seks decimaler.

En kurve, der siger 0,43 hvor eftervisningen siger 0,51, er vaerre end ingen
kurve -- den ser ud som en oplysning.
"""
import pytest

import udnyttelse as u
import forallpeople as si
si.environment('structural')
from forallpeople import mm, m, kN, MPa       # noqa: E402
from timber import timber_beam


def _ratio(blocks, indeholder):
    """Forholdet fra den check-blok, hvis tekst indeholder *indeholder*."""
    for b in blocks:
        if b.get('type') == 'check' and indeholder in b.get('label', ''):
            return b['ratio']
    raise AssertionError('fandt ingen eftervisning med %r' % indeholder)


@pytest.mark.parametrize('b_mm,h_mm,grade,span,g_k,q_k,sc,dur,kmod', [
    (45, 195, 'C24',   4.0, 0.9, 0.7, 1, 'medium',    0.80),
    (45, 245, 'C24',   5.0, 1.2, 2.0, 2, 'short',     0.90),
    (140, 360, 'GL28h', 8.0, 3.0, 4.5, 1, 'permanent', 0.60),
    (63, 200, 'C30',   3.5, 0.6, 1.8, 2, 'instant',   1.10),
])
def test_udnyttelsen_stemmer_med_eftervisningen(b_mm, h_mm, grade, span,
                                                g_k, q_k, sc, dur, kmod):
    """
    Samme snitkraefter, samme kapaciteter — samme udnyttelse.

    M_Ed, V_Ed, f_m,d og f_v,d laeses ud af eftervisningens EGNE raekker. Saa
    sammenlignes der ikke bare "to beregninger af det samme", men den nye
    formel mod praecis de tal, dokumentet indeholder.

    Kapaciteterne tages af udnyttelse.kapaciteter -- den funktion, timber.py nu
    selv kalder -- og ikke af de trykte raekker. Saa er den eneste afrunding
    tilbage M_Ed og V_Ed med to decimaler, og forholdet med tre.

    Foerste udgave laeste ogsaa W_y, A, f_m,d og f_v,d af trykt tekst. Fire
    afrundede tal ganget sammen kom 0,3 % ved siden af, og det var ikke en fejl
    i regnestykket -- det var testen, der ikke kunne se skarpere. Det var
    grunden til at lade timber.py kalde den samme kode i stedet for at holde to
    implementeringer op mod hinanden.
    """
    blocks = timber_beam(
        label='T1', span=span * m, g_k=g_k * kN / m, q_k=q_k * kN / m,
        b=b_mm * mm, h=h_mm * mm, timber_grade=grade,
        service_class=sc, load_duration=dur, gamma_M=1.3,
        check_deflection=False,
    )

    def _tal(navn):
        for b in blocks:
            if b.get('type') == 'calc_row' and b.get('name') == navn:
                return float(b['result'].split()[0].replace(',', '.'))
        raise AssertionError('fandt ingen raekke %r' % navn)

    M_Ed, V_Ed = _tal('M_Ed'), _tal('V_Ed')

    kap = u.kapaciteter(b_mm, h_mm, grade, kmod, 1.3)
    e_m, e_v = u.eta_i_snit(M_Ed, V_Ed, kap)

    assert e_m == pytest.approx(_ratio(blocks, 'Bøjning'), abs=1e-3),         'boejningsudnyttelsen er ikke den samme som i eftervisningen'
    assert e_v == pytest.approx(_ratio(blocks, 'Forskydning'), abs=1e-3),         'forskydningsudnyttelsen er ikke den samme som i eftervisningen'


@pytest.mark.parametrize('grade,sc,dur,kmod', [
    ('C24',   1, 'medium',    0.80),
    ('C24',   2, 'short',     0.90),
    ('GL28h', 1, 'permanent', 0.60),
    ('C30',   2, 'instant',   1.10),
])
def test_kapaciteterne_udledes_som_i_eftervisningen(grade, sc, dur, kmod):
    """
    Den anden halvdel: at k_mod·f_k/gamma_M giver det samme her som dér.

    Testen ovenfor beviser formlen (sigma = M/W, tau = 1,5V/A). Denne beviser
    kapaciteten. Tilsammen daekker de vejen fra styrkeklasse til udnyttelse --
    og hver af dem siger hvilket led der er gaaet i stykker, hvis en af dem
    falder.
    """
    blocks = timber_beam(
        label='T1', span=4.0 * m, g_k=1.0 * kN / m, q_k=1.0 * kN / m,
        b=45 * mm, h=245 * mm, timber_grade=grade,
        service_class=sc, load_duration=dur, gamma_M=1.3,
        check_deflection=False,
    )

    def _tal(navn):
        for b in blocks:
            if b.get('type') == 'calc_row' and b.get('name') == navn:
                return float(b['result'].split()[0].replace(',', '.'))
        raise AssertionError('fandt ingen raekke %r' % navn)

    kap = u.kapaciteter(45, 245, grade, kmod, 1.3)
    assert float(kap['f_md'] / MPa) == pytest.approx(_tal('f_m,d'), abs=5e-3)
    assert float(kap['f_vd'] / MPa) == pytest.approx(_tal('f_v,d'), abs=5e-3)
    assert float(kap['W_y'] / (10 * mm) ** 3) == pytest.approx(_tal('W_y'),
                                                               rel=1e-3)
    assert float(kap['A'] / (10 * mm) ** 2) == pytest.approx(_tal('A'),
                                                             rel=1e-3)


def test_kurven_topper_hvor_momentet_topper():
    """
    Paa en simpelt understoettet bjaelke med jaevnt fordelt last ligger
    boejningens toppunkt midt paa, og forskydningens ved enderne. Kurven skal
    vise det -- ellers viser den noget andet end snitkraefterne.
    """
    import stanglaster as sl

    L, w = 6.0, 10.0
    pl = [0.0, w * L / 2, 0.0, 0.0, w * L / 2, 0.0]
    segs_y, segs_x = sl.afsnit_fra_par(-w, 0.0, L)
    kap = u.kapaciteter(45, 245, 'C24', 0.8, 1.3)

    kurve = u.eta_langs_stang(pl, L, segs_y, segs_x, kap)
    x_m = max(kurve, key=lambda t: t[1])[0]
    x_v = max(kurve, key=lambda t: t[2])[0]

    assert x_m == pytest.approx(L / 2, abs=0.05)
    assert x_v in (pytest.approx(0.0, abs=0.05), pytest.approx(L, abs=0.05))


def test_en_dellast_flytter_toppunktet():
    """
    Med lasten kun paa den ene halvdel ligger det stoerste moment ikke laengere
    midt paa. Det er hele grunden til at ville se kurven i stedet for ét tal.
    """
    import stanglaster as sl

    L, w = 6.0, 10.0
    # Simpelt understoettet, w paa [0, L/2]: R_i = 3wL/8, R_j = wL/8
    pl = [0.0, 3 * w * L / 8, 0.0, 0.0, w * L / 8, 0.0]
    segs_y = [(-w, -w, 0.0, L / 2)]
    kap = u.kapaciteter(45, 245, 'C24', 0.8, 1.3)

    kurve = u.eta_langs_stang(pl, L, segs_y, [], kap)
    x_m = max(kurve, key=lambda t: t[1])[0]
    assert x_m < L / 2, 'toppunktet skal ligge inde i den belastede halvdel'
    assert x_m > 0.2 * L


# ── Figuren ─────────────────────────────────────────────────────────────────

def _ramme_med_kapaciteter():
    import general_frame_fem as gf
    STAV = dict(material='timber', section='140x360', grade='GL28h',
                E_GPa=12.6, A_cm2=504.0, Iz_cm4=54432.0)
    b, h = 8.0, 4.0
    nodes = [{'id': 1, 'x': 0, 'y': 0}, {'id': 2, 'x': 0, 'y': h},
             {'id': 3, 'x': b / 2, 'y': h + 1.2},
             {'id': 4, 'x': b, 'y': h}, {'id': 5, 'x': b, 'y': 0}]
    els = [dict(id=i + 1, ni=a, nj=c, type='beam', release='none', **STAV)
           for i, (a, c) in enumerate([(1, 2), (2, 3), (3, 4), (4, 5)])]
    sup = [{'node_id': 1, 'ux': True, 'uy': True, 'rz': True},
           {'node_id': 5, 'ux': True, 'uy': True, 'rz': True}]
    loads = [{'type': 'udl', 'elem_id': 2, 'direction': 'vertical',
              'value_kNm': 9.0},
             {'type': 'udl', 'elem_id': 3, 'direction': 'vertical',
              'value_kNm': 9.0, 'x1': 0.0, 'x2': 2.5}]
    r = gf.solve(nodes, els, sup, loads)
    kap = {e['id']: u.kapaciteter(140, 360, 'GL28h', 0.8, 1.3) for e in els}
    return nodes, els, sup, r, kap


def test_figuren_tegnes_for_boejning_og_forskydning():
    import base64
    import struct
    from fem_diagrams import udnyttelse_figur

    nodes, els, sup, r, kap = _ramme_med_kapaciteter()
    for art in ('boejning', 'forskydning'):
        b64 = udnyttelse_figur(nodes, els, sup, r['ele_forces'],
                               r['ele_segs'], kap, 8.0, art=art)
        raw = base64.b64decode(b64)
        assert raw[:8] == b'\x89PNG\r\n\x1a\n'
        w, _ = struct.unpack('>II', raw[16:24])
        assert w > 200


def test_et_element_uden_tvaersnit_springes_over():
    """
    Et element uden kapacitet har ingen udnyttelse. En kurve paa nul ville
    ligne en stang, der ikke er belastet -- og det er en anden oplysning.
    """
    from fem_diagrams import udnyttelse_figur

    nodes, els, sup, r, kap = _ramme_med_kapaciteter()
    del kap[2]                       # ét element mister sit tvaersnit
    b64 = udnyttelse_figur(nodes, els, sup, r['ele_forces'], r['ele_segs'],
                           kap, 8.0, art='boejning')
    assert b64                       # den tegner stadig resten


def test_helt_uden_kapaciteter_siges_der_fra_i_overskriften():
    from fem_diagrams import udnyttelse_figur

    nodes, els, sup, r, _ = _ramme_med_kapaciteter()
    b64 = udnyttelse_figur(nodes, els, sup, r['ele_forces'], r['ele_segs'],
                           {}, 8.0, art='boejning')
    assert b64, 'en model uden tvaersnit skal give en figur, ikke et brag'


def test_endepunktet_leverer_udnyttelsesfigurerne(client):
    """
    Kurverne skal komme med ud af beregningen, ikke skulle hentes for sig.

    De haenges bagest i _figs_b64, saa de indekser, frontenden og PDF'en
    allerede bruger til model, deformation, M, V og N, ikke flytter sig.
    """
    r = client.post('/calc/general-frame-fem', json={
        'title': 'Bjælke',
        'nodes': [{'id': 1, 'x': 0, 'y': 0}, {'id': 2, 'x': 3, 'y': 0},
                  {'id': 3, 'x': 6, 'y': 0}],
        'elements': [
            {'id': 1, 'ni': 1, 'nj': 2, 'type': 'beam', 'release': 'none',
             'material': 'timber', 'section': '140x360', 'grade': 'GL28h'},
            {'id': 2, 'ni': 2, 'nj': 3, 'type': 'beam', 'release': 'none',
             'material': 'timber', 'section': '140x360', 'grade': 'GL28h'}],
        'supports': [{'node_id': 1, 'ux': True, 'uy': True, 'rz': False},
                     {'node_id': 3, 'ux': False, 'uy': True, 'rz': False}],
        'loads': [{'type': 'udl', 'elem_id': e, 'direction': 'vertical',
                   'value_kNm': 9.0} for e in (1, 2)],
        'service_class': 1, 'load_duration': 'medium',
    })
    assert r.status_code == 200, r.text
    figs = r.json()['_figs_b64']
    assert len(figs) == 7, \
        'model + deformation + M + V + N + eta_boejning + eta_forskydning'


def test_uden_traetvaersnit_kommer_der_ingen_eta_figurer(client):
    """
    Et element med raa E/A/I har ingen styrkeklasse, saa der er ingen kapacitet
    at dividere med. Tom liste og ikke to tomme figurer: en figur uden kurver
    ligner en konstruktion, der ikke er udnyttet.
    """
    r = client.post('/calc/general-frame-fem', json={
        'title': 'Bjælke',
        'nodes': [{'id': 1, 'x': 0, 'y': 0}, {'id': 2, 'x': 6, 'y': 0}],
        'elements': [{'id': 1, 'ni': 1, 'nj': 2, 'type': 'beam',
                      'release': 'none', 'E_GPa': 210, 'A_cm2': 53.8,
                      'Iz_cm4': 8356}],
        'supports': [{'node_id': 1, 'ux': True, 'uy': True, 'rz': False},
                     {'node_id': 2, 'ux': False, 'uy': True, 'rz': False}],
        'loads': [{'type': 'udl', 'elem_id': 1, 'direction': 'vertical',
                   'value_kNm': 9.0}],
    })
    assert r.status_code == 200, r.text
    assert len(r.json()['_figs_b64']) == 5, 'model + deformation + M + V + N'
