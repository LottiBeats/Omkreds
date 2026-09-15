"""
test_kombinationssaet.py — kombinationerne som faktorer.

En lastkombination er ikke et tal. Det er et saet faktorer, og tallet er hvad
de giver, naar de rammer nogle laster. Blokken har hidtil kun kunnet det
sidste, og derfor kunne en rammeberegning ikke kombinere laster paa en model
uden at danne kombinationerne igen et andet sted -- og saa er der to svar paa
det samme, som begge ser rigtige ud.

Proeverne her holder to ting fast: at faktorerne giver de tal, dokumentet
allerede viser, og at de er uafhaengige af lasternes stoerrelse. Det sidste er
hele pointen -- kan et saet ikke flyttes fra 1,5 kN/m til en hel model, er det
ikke faktorer, det er stadig tal.
"""
import pytest

from load_combo import (kombinationssaet, vaerdi, load_combos,
                        ULS, ALS_BRAND, ALS_OEVRIG,
                        SLS_KAR, SLS_HYP, SLS_KVASI)


def _q(label, category, Q_k):
    return {'label': label, 'category': category, 'Q_k': Q_k}


# Det hus, der staar i A2'en: G_k = 1,0 kN/m og én nyttelast paa 1,5, kat. A.
_HUS = [_q('Q1', 'A', 1.5)]
_G = 1.0


def _tal(saet, situation, G_k=_G, Q=(1.5,), A_d=0.0):
    return [round(vaerdi(k, G_k, Q, A_d), 4)
            for k in saet if k['situation'] == situation]


def test_faktorerne_giver_de_tal_dokumentet_viser():
    """
    De syv tal fra A2'en, regnet af faktorerne i stedet.

    ψ for kategori A er (0,50 / 0,30 / 0,20) efter DK NA tabel A1.1. De staar
    her som tal og ikke som opslag: en proeve, der slaar den samme tabel op som
    koden, kan ikke se en aendring i tabellen.
    """
    s = kombinationssaet(_HUS)

    assert _tal(s, ULS) == [1.200, 3.250]          # 6.10a, 6.10b
    assert _tal(s, ALS_BRAND) == [1.450]           # 1 + 0,3·1,5
    assert _tal(s, ALS_OEVRIG) == [1.300]          # 1 + 0,2·1,5
    assert _tal(s, SLS_KAR) == [2.500]             # 1 + 1,5
    assert _tal(s, SLS_HYP) == [1.450]
    assert _tal(s, SLS_KVASI) == [1.300]


def test_faktorerne_afhaenger_ikke_af_lasternes_stoerrelse():
    """
    Samme saet for 1,5 kN/m og for 15 kN/m.

    Det er betingelsen for at kunne bruge dem paa en model: faktorerne hoerer
    til handlingerne, ikke til tallene. Gik lasternes stoerrelse ind i
    faktoren, kunne saettet kun bruges paa de laster, det blev dannet af.
    """
    lille = kombinationssaet([_q('Q1', 'A', 1.5)])
    stor  = kombinationssaet([_q('Q1', 'A', 15.0)])

    for a, b in zip(lille, stor):
        assert a['g'] == b['g']
        assert a['q'] == b['q']
        assert a['situation'] == b['situation']


@pytest.mark.parametrize('acc_type,noegle', [('fire', ALS_BRAND),
                                             ('other', ALS_OEVRIG)])
def test_blokkens_egne_tal_kommer_fra_de_samme_faktorer(acc_type, noegle):
    """
    Det, blokken eksporterer, og det, faktorerne giver, skal vaere ét tal.

    Her ligger vaerdien i proeven. Bliver kombinationerne en dag regnet to
    steder igen -- én gang til tabellen og én gang til modellen -- faelder den
    her det, og den goer det paa en model med fire handlinger, hvor en
    fortegns- eller psi-fejl ikke gaar ud med sig selv.
    """
    laster = [_q('Nyttelast', 'A', 2.0),
              _q('Sne',       'S', 1.2),
              _q('Vind',      'W', 0.8),
              _q('Lager',     'E', 3.0)]
    G_k, A_d = 4.0, 0.0
    Q = [l['Q_k'] for l in laster]

    _, eksport = load_combos('LC', 'kN/m', G_k, laster,
                             A_d=A_d, accidental_type=acc_type)
    s = kombinationssaet(laster)

    assert eksport['E_d_uls'] == pytest.approx(
        max(vaerdi(k, G_k, Q, A_d) for k in s if k['situation'] == ULS), rel=1e-9)
    assert eksport['E_d_acc'] == pytest.approx(
        max(vaerdi(k, G_k, Q, A_d) for k in s if k['situation'] == noegle), rel=1e-9)
    assert eksport['E_d_sls_char'] == pytest.approx(
        max(vaerdi(k, G_k, Q) for k in s if k['situation'] == SLS_KAR), rel=1e-9)
    assert eksport['E_d_sls_freq'] == pytest.approx(
        max(vaerdi(k, G_k, Q) for k in s if k['situation'] == SLS_HYP), rel=1e-9)
    assert eksport['E_d_sls_qp'] == pytest.approx(
        max(vaerdi(k, G_k, Q) for k in s if k['situation'] == SLS_KVASI), rel=1e-9)


def test_ulykke_regnes_med_1_0_og_oejeblikkelig_varighed():
    """
    DK NA tabel A1.3: hverken partialkoefficienter eller K_FI.

    Varigheden foelger med i saettet, fordi det er den, der afgoer k_mod. Sad
    den ikke paa kombinationen, skulle eftervisningen gaette -- og saa gaetter
    den paa den gunstigste.
    """
    s = kombinationssaet(_HUS, consequence_class='CC3')
    for k in s:
        if k['situation'] in (ALS_BRAND, ALS_OEVRIG):
            assert k['g'] == 1.0
            assert k['a'] == 1.0
            assert k['varighed'] == 'instant'
        if k['situation'] == ULS:
            assert k['a'] == 0.0, 'en ulykkeslast hoerer ikke til brudgraensen'


def test_anvendelse_har_ingen_lastvarighed():
    """
    k_mod hoerer til brudgraensen.

    Stod der et varighedsnavn paa en SLS-kombination, ville nogen bruge det, og
    en nedboejning regnet med k_mod er ikke en nedboejning.
    """
    for k in kombinationssaet(_HUS):
        if k['situation'].startswith('sls'):
            assert k['varighed'] is None


def test_gunstig_egenlast_slaar_igennem_paa_begge_uls_kombinationer():
    """1,0 i 6.10a og 0,9 i 6.10b — DK NA tabel A1.2(B+C), γ_G,inf."""
    s = [k for k in kombinationssaet(_HUS, G_fav=True) if k['situation'] == ULS]
    assert [k['g'] for k in s] == [1.0, 0.9]


def test_sne_faar_psi0_nul_naar_vinden_leder():
    """
    DK NA tabel A1.1. Reglen er nem at tabe, naar faktorerne flyttes, fordi
    den kun gaelder den ene vej: vind som medvirkende til sne er 0,3.
    """
    laster = [_q('Sne', 'S', 1.0), _q('Vind', 'W', 1.0)]
    s = kombinationssaet(laster)
    uls = [k for k in s if k['situation'] == ULS]

    vind_leder = next(k for k in uls if k['ledende'] == 1)
    sne_leder  = next(k for k in uls if k['ledende'] == 0)

    assert vind_leder['q'][0] == 0.0, 'sne som medvirkende til vind er nul'
    assert sne_leder['q'][1] == pytest.approx(1.5 * 0.3)


def test_hver_variabel_last_bliver_ledende_i_sin_egen_kombination():
    """
    Ellers er der en lastfigur, der aldrig bliver eftervist. Det er den slags,
    ingen opdager: alle de kombinationer, der ER der, ser rigtige ud.
    """
    laster = [_q('A', 'A', 1.0), _q('B', 'S', 1.0), _q('C', 'W', 1.0)]
    s = kombinationssaet(laster)
    ledende = {k['ledende'] for k in s if k['situation'] == ULS}
    assert ledende == {-1, 0, 1, 2}     # -1 er 6.10a, kun permanent
