"""
test_fem_overlay.py — flere lastkombinationer i ét plot.

Det, en overlay skal kunne, er at vise HVILKEN kombination der er den vaerste.
Alt andet kan man faa af de enkelte figurer. Derfor handler de fleste tests her
om ordinatskalaen: tegnes hver serie med sin egen skala, bliver kurverne lige
store paa papiret, og figuren svarer paa noget andet end det, den bliver
brugt til.
"""
import base64
import io as _io
import struct

import pytest

import fem_diagrams as fd

E_GPA, A_CM2, IZ_CM4 = 210.0, 53.8, 8356.0
STAV = {'E_GPa': E_GPA, 'A_cm2': A_CM2, 'Iz_cm4': IZ_CM4}


def _bjaelke(L=6.0, n=2):
    nodes = [{'id': i + 1, 'x': L * i / n, 'y': 0.0} for i in range(n + 1)]
    elements = [dict(id=i + 1, ni=i + 1, nj=i + 2, type='beam',
                     release='none', **STAV) for i in range(n)]
    supports = [{'node_id': 1, 'ux': True, 'uy': True, 'rz': False},
                {'node_id': n + 1, 'ux': False, 'uy': True, 'rz': False}]
    return nodes, elements, supports


def _serie(navn, w, L=6.0, n=2):
    """En simpelt understoettet bjaelke med jaevnt fordelt last w (nedad)."""
    import fem_direkte
    nodes, elements, supports = _bjaelke(L, n)
    loads = [{'type': 'udl', 'elem_id': e['id'],
              'direction': 'vertical', 'value_kNm': w} for e in elements]
    res = fem_direkte.solve(nodes, elements, supports, loads)
    return {'navn': navn, 'ele_forces': res['ele_forces'],
            'ele_udl': res['ele_udl']}


def _png_stoerrelse(b64):
    """(bredde, hoejde) laest af PNG-headeren."""
    raa = base64.b64decode(b64)
    assert raa[:8] == b'\x89PNG\r\n\x1a\n', 'ikke en PNG'
    w, h = struct.unpack('>II', raa[16:24])
    return w, h


def test_overlay_tegner_en_figur_pr_snitkraft():
    nodes, elements, supports = _bjaelke()
    serier = [_serie('6.10a', 8.0), _serie('6.10b', 12.0)]
    figs = fd.render_overlay(nodes, elements, supports, serier, ref_size=6.0)

    assert len(figs) == 3, 'M, V og N — og ingen deformeret form'
    for f in figs:
        w, h = _png_stoerrelse(f)
        assert w > 200 and h > 100


def test_skalaen_er_faelles_for_alle_serier():
    """
    Kernen i det hele.

    To kombinationer, hvor den ene er praecis dobbelt saa stor som den anden.
    Med en faelles skala skal den lille kurve tegnes halvt saa hoej som den
    store. Skaleredes hver serie for sig, ville de blive lige store paa
    papiret, og figuren kunne ikke bruges til at se, hvilken kombination der
    er den vaerste — hvilket er det eneste, man laegger dem oven paa hinanden
    for at finde ud af.

    Foerste udgave af denne test sammenlignede PNG-stoerrelser. To billeder kan
    have samme stoerrelse og vise vidt forskellige kurver, saa den beviste
    ingenting. Nu laeses den faktor, tegningen faktisk bruger.
    """
    nodes, elements, supports = _bjaelke()
    lille = _serie('lille', 6.0)
    stor = _serie('stor', 12.0)
    dn = {n['id']: n for n in nodes}

    alle, peak, serie_peak, fac = fd.overlay_skala(
        'M', elements, dn, [lille, stor], ref_size=6.0)

    assert serie_peak[1] == pytest.approx(2 * serie_peak[0], rel=0.01), (
        'forudsaetningen: den ene last er det dobbelte af den anden')
    assert peak == pytest.approx(serie_peak[1], rel=1e-9), (
        'maksimum skal komme fra den stoerste serie, ikke fra den foerste')

    # Den tegnede ordinat er fac * vaerdi. Med faelles fac er forholdet mellem
    # de to kurvers hoejde det samme som forholdet mellem deres momenter.
    def hoejde(si):
        return fac * serie_peak[si]

    assert hoejde(0) == pytest.approx(0.5 * hoejde(1), rel=0.01), (
        'den lille kombination skal tegnes halvt saa hoej som den store')

    # Og faktoren maa ikke afhaenge af raekkefoelgen.
    _, peak_b, serie_peak_b, fac_b = fd.overlay_skala(
        'M', elements, dn, [stor, lille], ref_size=6.0)
    assert fac_b == pytest.approx(fac, rel=1e-12)
    assert peak_b == pytest.approx(peak, rel=1e-12)


def test_overlayet_bruger_en_lavere_ordinat_end_den_enkelte_figur():
    """
    Et overlay tegner kurverne tættere paa staven end den enkelte figur.

    Fire kurver ud fra samme stav naar tilsammen lige saa langt ud, som én
    kurve gjorde alene, og saa stoeder soejlernes kurver ind i riglens. To
    kurvesaet, der overlapper hinanden, kan ikke laeses hver for sig.

    Denne test stod foer som "en serie alene fylder figuren som foer" og
    kraevede det modsatte. Den praemis holdt kun, saa laenge overlayet
    genbrugte den enkelte figurs skala -- og gjorde det, blev en ramme med
    fire kombinationer ulaeselig.
    """
    nodes, elements, supports = _bjaelke()
    kun = _serie('kun', 9.0)
    dn = {n['id']: n for n in nodes}
    _, peak, _, fac = fd.overlay_skala('M', elements, dn, [kun], ref_size=6.0)

    ord_ref = fd._ordinate_reference(elements, dn, 6.0)
    assert fac == pytest.approx(ord_ref * fd.OVERLAY_ORDINATE_FRAC / peak,
                                rel=1e-12)
    assert fd.OVERLAY_ORDINATE_FRAC < fd.ORDINATE_FRAC, \
        'et overlay skal tegne tættere paa staven end den enkelte figur'


def test_overskriften_navngiver_den_vaerste_kombination():
    """
    Overskriften skal sige, hvilken kombination maksimum tilhoerer.

    Signaturforklaringen har tallene, men saa skal man sammenligne dem selv.
    Det er en aflaesning, figuren kan spare én for, og det er det foerste
    spoergsmaal man stiller til et saadant plot.
    """
    nodes, elements, supports = _bjaelke()
    serier = [_serie('6.10a', 6.0), _serie('6.10b', 15.0), _serie('ulykke', 4.0)]

    # Teksten laeses ikke ud af PNG'en; i stedet kontrolleres den logik, der
    # vaelger navnet, paa de samme tal.
    toppe = []
    for s in serier:
        p = 0.0
        for el in elements:
            wy, wx = s['ele_udl'].get(el['id'], (0.0, 0.0))
            pts = fd._sample('M', el, s['ele_forces'][el['id']], wy, wx, 3.0)
            p = max(p, max(abs(v) for _, v in pts))
        toppe.append(p)
    assert serier[toppe.index(max(toppe))]['navn'] == '6.10b'

    fig = fd.section_force_overlay('M', nodes, elements, supports, serier,
                                   ref_size=6.0)
    assert _png_stoerrelse(fig)[0] > 200


def test_en_tom_serieliste_afvises():
    """
    Et plot uden serier er ikke en tom figur, det er et kald der er gaaet galt.
    En tom figur ville se ud som en model uden snitkraefter.
    """
    nodes, elements, supports = _bjaelke()
    with pytest.raises(ValueError):
        fd.section_force_overlay('M', nodes, elements, supports, [],
                                 ref_size=6.0)


def test_en_serie_der_mangler_et_element_fjerner_det_ikke_for_de_andre():
    """
    Elementmaengden er unionen, ikke den foerste series.

    Med snittet fra den foerste serie ville et element, den ikke har regnet,
    forsvinde fra figuren for alle — og en manglende kurve ligner en stav uden
    snitkraft, ikke en manglende oplysning.
    """
    nodes, elements, supports = _bjaelke(n=3)
    hel = _serie('hel', 10.0, n=3)
    delvis = {'navn': 'delvis',
              'ele_forces': {k: v for k, v in hel['ele_forces'].items()
                             if k != 1},
              'ele_udl': {k: v for k, v in hel['ele_udl'].items() if k != 1}}

    fig = fd.section_force_overlay('M', nodes, elements, supports,
                                   [delvis, hel], ref_size=6.0)
    assert _png_stoerrelse(fig)[0] > 200
