"""
test_eksempelprojekt.py — et helt lille projekt, hele vejen igennem

Et testprojekt, der gør det, en bruger gør: en portalramme med fire
lasttilfælde, laster lagt i dem, kombinationerne dannet af tilfældene, FEM'en
kørt — og til sidst en PDF, hvor sagsoplysningerne står på siden efter
forsiden.

Prøverne her er bredere end de øvrige med vilje. De enkelte dele har hver
deres prøve; det her er den, der fanger, når to dele, som hver for sig
virker, ikke passer sammen.

Modellen er en portalramme, 6 × 3 m, i limtræ:

        LC2 sne  ↓↓↓↓↓↓↓↓↓
    2 ──────────────────── 3      element 1  (riegel)
      │                  │
LC3 → │ 2                │ 3      element 2, 3  (søjler)  ← LC4
      │                  │
    ═ 1 ═              ═ 4 ═      indspændte fodpunkter
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from frame_load_cases import kombinationer_af_tilfaelde
from pdf_builder import build_pdf


# ── Projektet ───────────────────────────────────────────────────────────────

LASTTILFAELDE = [
    {'nr': 1, 'navn': 'Egenlast',         'kategori': 'permanent'},
    {'nr': 2, 'navn': 'Snelast',          'kategori': 'snow'},
    {'nr': 3, 'navn': 'Vind fra venstre', 'kategori': 'wind'},
    {'nr': 4, 'navn': 'Vind fra højre',   'kategori': 'wind'},
]

LASTER = [
    # Egenlast på rieglen
    {'type': 'udl', 'elem_id': 1, 'direction': 'vertical', 'value_kNm': 2.4, 'lc': 1},
    # Sne, vandret projektion
    {'type': 'udl', 'elem_id': 1, 'direction': 'projected', 'value_kNm': 4.0, 'lc': 2},
    # Vind fra venstre: tryk på venstre søjle, sug på højre
    {'type': 'udl', 'elem_id': 2, 'direction': 'horizontal', 'value_kNm': 1.2, 'lc': 3},
    {'type': 'udl', 'elem_id': 3, 'direction': 'horizontal', 'value_kNm': 0.6, 'lc': 3},
    # Vind fra højre: spejlvendt
    {'type': 'udl', 'elem_id': 3, 'direction': 'horizontal', 'value_kNm': -1.2, 'lc': 4},
    {'type': 'udl', 'elem_id': 2, 'direction': 'horizontal', 'value_kNm': -0.6, 'lc': 4},
]

MODEL = {
    'nodes': [{'id': 1, 'x': 0.0, 'y': 0.0}, {'id': 2, 'x': 0.0, 'y': 3.0},
              {'id': 3, 'x': 6.0, 'y': 3.0}, {'id': 4, 'x': 6.0, 'y': 0.0}],
    'elements': [
        {'id': 1, 'ni': 2, 'nj': 3, 'material': 'timber', 'section': '140x450',
         'grade': 'GL28h'},
        {'id': 2, 'ni': 1, 'nj': 2, 'material': 'timber', 'section': '140x360',
         'grade': 'GL28h'},
        {'id': 3, 'ni': 4, 'nj': 3, 'material': 'timber', 'section': '140x360',
         'grade': 'GL28h'},
    ],
    'supports': [{'node_id': 1, 'ux': True, 'uy': True, 'rz': True},
                 {'node_id': 4, 'ux': True, 'uy': True, 'rz': True}],
}

METADATA = {
    'project_name': 'Stejlepladsen',
    'emne': 'Nybyg boliger',
    'address': 'Flyndervej 10, 2450 København SV',
    'matrikel': '566a Kongens Enghave, København',
    'project_ref': '202515',
    'fase': 'Myndighedsprojekt',
    'certificeret': 'Ian Hobson (IHO)',
    'konstruktionsklasse': 'KK2',
    'konsekvensklasse': 'CC2',
    'dato_starterklaering': '2026-03-02',
    'engineer': 'Bjørn Wismann (BW)',
    'checker': 'Ian Hobson (IHO)',
    'approver': 'Rasmus Kristian Holst (RKH)',
    'engineer_title': 'Msc. Konstruktionsingeniør',
    'checker_title': 'Certificeret Statiker KK2',
    'approver_title': 'Msc. Konstruktionsingeniør',
    'date': '2026-09-23',
    'revision': 'A',
    'firm_name': 'Holst Engineering ApS',
}


def eksempelprojekt(fem_resultat=None):
    """Projektet, som appen ville have gemt det."""
    a2_blokke = [
        {'type': 'heading', 'data': {'level': 1, 'text': 'Portalramme i limtræ'}},
        {'type': 'text', 'data': {'text':
            'Rammen er 6,0 m bred og 3,0 m høj, indspændt i begge fodpunkter. '
            'Riegel og søjler er limtræ GL28h.'}},
    ]
    if fem_resultat is not None:
        a2_blokke.append({'type': 'general_frame_fem', 'data': dict(
            fem_resultat, title='Portalramme — rammeberegning')})

    return {
        'id': 'eksempel',
        'metadata': dict(METADATA),
        'documents': {
            'A1': {'title': 'Konstruktionsgrundlag',
                   'blocks': [{'type': 'text', 'data': {'text': 'Grundlag.'}}],
                   'revisions': [{'rev': '1', 'date': '2026-09-01',
                                  'by': 'BW', 'checked': 'IHO',
                                  'desc': 'Første udgave'}]},
            'A2': {'title': 'Statiske beregninger', 'blocks': a2_blokke},
            'B1': {'title': 'Statisk projektredegørelse',
                   'blocks': [{'type': 'text', 'data': {'text': 'Redegørelse.'}}]},
        },
    }


# ── 1. Lasttilfældene giver de kombinationer, de skal ───────────────────────

def test_fire_tilfaelde_giver_ni_kombinationer():
    """6.10a + fire 6.10b + fire gunstige tvillinger.

    De fire 6.10b er to vindvalg gange to ledende (sne, vind). Vind fra
    venstre og fra højre er alternativer, så de tæller ikke som to samtidige.
    """
    combos = kombinationer_af_tilfaelde(LASTTILFAELDE, LASTER)
    assert len(combos) == 9
    assert len([c for c in combos if 'gunstig G' in c['name']]) == 4


def test_de_to_vindretninger_moedes_aldrig():
    for c in kombinationer_af_tilfaelde(LASTTILFAELDE, LASTER):
        assert not ({'Vind fra venstre', 'Vind fra højre'} <= set(c['aktive'])), \
            c['name']


def test_sneen_falder_ud_naar_vinden_leder():
    """DK NA tabel A1.1: ψ₀ for sne er 0, når vind er ledende."""
    combos = kombinationer_af_tilfaelde(LASTTILFAELDE, LASTER)
    vindledet = [c for c in combos if c['name'].startswith('6.10b (Vind')]
    assert vindledet
    for c in vindledet:
        assert c['factor_table'].get('Snelast', 0) == pytest.approx(0.0)


def test_tilfaeldenes_navne_staar_i_kombinationerne():
    tekst = ' '.join(c['name'] for c in kombinationer_af_tilfaelde(
        LASTTILFAELDE, LASTER))
    for navn in ('Snelast', 'Vind fra venstre', 'Vind fra højre'):
        assert navn in tekst


# ── 2. Modellen regnes ──────────────────────────────────────────────────────

@pytest.fixture(scope='module')
def koersel(client):
    r = client.post('/calc/general-frame-fem', json=dict(
        MODEL, title='Portalramme', loads=LASTER, load_cases=LASTTILFAELDE,
        consequence_class='CC2', service_class=1))
    assert r.status_code == 200, r.text
    return r.json()


def test_rammen_regnes_igennem(koersel):
    s = koersel['_summary']
    # Ni af EN 1990 og to k_mod-varianter: rammen er af træ, så
    # kombinationen uden de kortvarige medvirkende hører med (§3.1.3).
    assert len(s['combinations']) == 11
    assert s['envelope'], 'ingen indhyldning'
    # Tre elementer, hver med et dimensionsgivende moment
    assert set(s['envelope']) == {'1', '2', '3'}


def test_hvert_element_faar_sin_dimensionsgivende_kombination(koersel):
    for eid, v in koersel['_summary']['envelope'].items():
        assert v['M_combo'], f'element {eid} har ingen dimensionsgivende kombination'
        assert abs(v['M_max_kNm']) > 0


def test_ligevaegt_lodret(koersel, client):
    """Summen af de lodrette reaktioner er den lodrette last i kombinationen.

    Den er regnet i hånden: 6.10a er 1,20·G alene, altså 1,20 · 2,4 kN/m ·
    6,0 m = 17,28 kN, fordelt på to fodpunkter.
    """
    r = client.post('/calc/general-frame-fem', json=dict(
        MODEL, title='Kun egenlast',
        loads=[l for l in LASTER if l['lc'] == 1],
        load_cases=[LASTTILFAELDE[0]]))
    assert r.status_code == 200, r.text
    reaktioner = r.json()['_summary']['reactions']
    lodret = sum(float(v['Fy_kN']) for v in reaktioner.values())
    assert lodret == pytest.approx(1.20 * 2.4 * 6.0, rel=1e-3)


# ── 3. Hele dokumentet ──────────────────────────────────────────────────────

def _forsidetekst(pdf_bytes):
    pdfium = pytest.importorskip('pypdfium2')
    doc = pdfium.PdfDocument(pdf_bytes)
    # Side 2 er siden efter forsiden.
    return doc[1].get_textpage().get_text_range()


@pytest.mark.parametrize('doc_id', ['A1', 'A2', 'B1'])
def test_sagsoplysningerne_staar_i_hvert_dokument(doc_id):
    """Ikke kun i B1. Den, der læser ét afsnit, skal kunne se hvad det hører
    til uden at have resten af sagen liggende."""
    projekt = eksempelprojekt()
    pdf = build_pdf(projekt, projekt['documents'][doc_id]['blocks'],
                    doc_id=doc_id)
    assert pdf[:4] == b'%PDF'

    tekst = _forsidetekst(pdf)
    for forventet in ('Sagsoplysninger', 'Stejlepladsen', 'Nybyg boliger',
                      '202515', 'Myndighedsprojekt',
                      'Certificeringsoplysninger', 'KK2', 'CC2',
                      'Revisioner', 'Underskrifter'):
        assert forventet in tekst, f'{forventet!r} mangler i {doc_id}'


def test_dokumentlisten_peger_paa_det_dokument_man_sidder_med():
    projekt = eksempelprojekt()
    pdf = build_pdf(projekt, projekt['documents']['A2']['blocks'], doc_id='A2')
    tekst = _forsidetekst(pdf)
    assert 'Den statiske dokumentation' in tekst
    # A1 er udstedt, A2 er under udarbejdelse, resten indgår ikke.
    assert 'Rev. 1' in tekst
    assert 'Under udarbejdelse' in tekst
    assert 'Indgår ikke' in tekst


def test_revisionstabellen_er_dokumentets_egen():
    """A1 er udstedt én gang; A2 er ikke udstedt. De to sider skal sige
    hver sit, ikke det samme."""
    projekt = eksempelprojekt()
    a1 = _forsidetekst(build_pdf(projekt, projekt['documents']['A1']['blocks'],
                                 doc_id='A1'))
    a2 = _forsidetekst(build_pdf(projekt, projekt['documents']['A2']['blocks'],
                                 doc_id='A2'))
    assert 'Første udgave' in a1
    assert 'ikke udstedt endnu' in a2


def test_et_tomt_felt_staar_som_en_streg_og_ikke_som_ingenting():
    """En manglende oplysning skal kunne ses. Et tomt felt i en tabel kan
    lige så godt betyde, at rubrikken ikke findes."""
    projekt = eksempelprojekt()
    projekt['metadata'].pop('matrikel')
    tekst = _forsidetekst(build_pdf(
        projekt, projekt['documents']['A1']['blocks'], doc_id='A1'))
    assert 'Matrikel' in tekst


def test_hele_projektet_kan_bygges_med_fem_resultatet(koersel):
    """Ende til ende: rammen regnet, resultatet lagt i A2, PDF'en bygget."""
    projekt = eksempelprojekt(fem_resultat=koersel)
    pdf = build_pdf(projekt, projekt['documents']['A2']['blocks'], doc_id='A2')
    assert pdf[:4] == b'%PDF'
    assert len(pdf) > 20000, 'dokumentet er for lille til at indeholde figurerne'


# ── 4. Lastbillederne ───────────────────────────────────────────────────────
#
# Den samlede model viser alle laster oven på hinanden, og med fire tilfælde
# er det ikke en tegning, det er et virvar. Som i RFEM tegnes hvert tilfælde
# for sig — og det er det, en kontrollant skal bruge: en eftervisning kan kun
# kontrolleres, hvis lasterne kan ses.

def test_der_er_en_figur_pr_lasttilfaelde(koersel):
    figurer = koersel['_summary'].get('lastfigurer') or []
    assert [f['navn'] for f in figurer] == [
        'LC1 Egenlast', 'LC2 Snelast',
        'LC3 Vind fra venstre', 'LC4 Vind fra højre']
    for f in figurer:
        assert f['b64'], f"{f['navn']} har ingen tegning"


def test_et_tomt_lasttilfaelde_faar_ingen_figur(client):
    """En tegning af en model uden laster siger ingenting om tilfældet."""
    tilfaelde = LASTTILFAELDE + [
        {'nr': 9, 'navn': 'Ubrugt', 'kategori': 'imposed'}]
    r = client.post('/calc/general-frame-fem', json=dict(
        MODEL, title='Portalramme', loads=LASTER, load_cases=tilfaelde))
    assert r.status_code == 200, r.text
    navne = [f['navn'] for f in r.json()['_summary']['lastfigurer']]
    assert 'LC9 Ubrugt' not in navne


def test_lastbillederne_staar_i_rapporten(koersel):
    projekt = eksempelprojekt(fem_resultat=koersel)
    pdf = build_pdf(projekt, projekt['documents']['A2']['blocks'], doc_id='A2')

    pdfium = pytest.importorskip('pypdfium2')
    doc = pdfium.PdfDocument(pdf)
    tekst = '\n'.join(doc[i].get_textpage().get_text_range()
                      for i in range(len(doc)))
    assert 'Lasttilfælde' in tekst
    for navn in ('LC1 Egenlast', 'LC3 Vind fra venstre'):
        assert navn in tekst, f'{navn} mangler i rapporten'


def test_uden_lasttilfaelde_er_der_ingen_lastbilleder(client):
    """Et gammelt dokument skal ikke pludselig have et afsnit mere."""
    gamle = [dict(l, lc=None, virkning='permanent') for l in LASTER[:1]]
    r = client.post('/calc/general-frame-fem', json=dict(
        MODEL, title='Portalramme', loads=gamle))
    assert r.status_code == 200, r.text
    assert (r.json()['_summary'].get('lastfigurer') or []) == []


# ── 5. Der tegnes ikke mere, end der bliver set på ──────────────────────────
#
# Selve beregningen er 1 ms pr. kombination; de fire matplotlib-figurer er
# 516. Med ni kombinationer var 99,8 % af ventetiden tegning af billeder,
# ingen havde bedt om — og da de gunstige tvillinger fordoblede antallet, gik
# en kørsel fra under tre sekunder til over otte.

def test_kun_den_dimensionsgivende_kombination_tegnes(koersel):
    figurer = koersel['_summary']['combo_figs']
    med = [c for c in figurer if c['figs']]
    assert len(med) == 1, \
        'der tegnes mere end den ene kombination, rapporten skal bruge'

    # Og det er den rigtige: den med det største moment.
    dimensionsgivende = max(
        koersel['_summary']['envelope'].values(),
        key=lambda v: v['M_max_kNm'])['M_combo']
    assert med[0]['name'] == dimensionsgivende


def test_de_oevrige_baerer_deres_snitkraefter(koersel):
    """Uden dem kunne de ikke tegnes bagefter, og så var det ikke en udskydelse
    men en udeladelse."""
    for c in koersel['_summary']['combo_figs']:
        assert c['state'], f"{c['name']} har ingen snitkræfter at tegne af"
        assert c['state'].get('ele_forces')


def test_tallene_er_de_samme_som_da_alt_blev_tegnet(koersel):
    """Indhyldningen må ikke afhænge af, hvad der blev tegnet.

    Det er den egentlige risiko ved at holde op med at tegne: at figurerne var
    det, der udregnede noget. De skal være en gengivelse, ikke et led.
    """
    s = koersel['_summary']
    assert len(s['combinations']) == 11
    assert s['envelope']['1']['M_max_kNm'] == pytest.approx(20.92, abs=0.05)
    assert s['envelope']['2']['N_max_kN'] == pytest.approx(25.37, abs=0.05)


# ── 6. k_mod-varianterne (EN 1995-1-1 §3.1.3) ───────────────────────────────
#
# k_mod følger den KORTESTE lastvarighed i kombinationen. En medvirkende
# vindlast med ψ₀ = 0,3 ændrer næsten ingenting ved snitkraften, men løfter
# k_mod fra 0,90 til 1,10 — altså bæreevnen med 22 %.
#
# Målt på denne ramme: med vind er M = 20,88 kNm og M/k_mod = 18,99. Uden vind
# er M = 20,92 og M/k_mod = 23,24. Uden den kombination er eftervisningen 22 %
# for gunstig, og alle tallene i den ser normale ud.

_KMOD_AK1 = {'permanent': 0.60, 'long': 0.70, 'medium': 0.80,
             'short': 0.90, 'instant': 1.10}


def test_der_dannes_en_kombination_uden_de_kortvarige():
    combos = kombinationer_af_tilfaelde(LASTTILFAELDE, LASTER,
                                        kmod_varianter=True)
    uden = [c for c in combos if 'k_mod kort' in c['name']]
    assert uden, 'kombinationen uden vind mangler'
    for c in uden:
        assert c['governing_duration'] == 'short'
        assert 'Vind' not in ' '.join(c['aktive'])
        assert 'Snelast' in c['aktive']


def test_den_ledende_bliver_staaende_selv_om_den_er_kortvarig():
    """Vind som ledende kan ikke skæres væk — så var det ikke den kombination."""
    combos = kombinationer_af_tilfaelde(LASTTILFAELDE, LASTER,
                                        kmod_varianter=True)
    for c in combos:
        if c['name'].startswith('6.10b (Vind'):
            assert any('Vind' in a for a in c['aktive']), c['name']


def test_de_to_vindvalg_falder_sammen_til_en():
    """Skæres vinden ud, er de to vindvalg den samme kombination.

    Uden sammenlægningen stod den to gange i rapporten og blev regnet to
    gange.
    """
    combos = kombinationer_af_tilfaelde(LASTTILFAELDE, LASTER,
                                        kmod_varianter=True)
    navne = [c['name'] for c in combos]
    assert len(navne) == len(set(navne)), 'samme kombination står to gange'
    assert len([n for n in navne if 'k_mod kort' in n]) == 2   # med og uden gunstig G


def test_varianten_bliver_dimensionsgivende_for_trae(client):
    """Prøven på, at det ikke bare er en ekstra række.

    Den dimensionsgivende for træ er den med størst M/k_mod, og det skal være
    den nye kombination.
    """
    r = client.post('/calc/general-frame-fem', json=dict(
        MODEL, title='Portalramme', loads=LASTER, load_cases=LASTTILFAELDE,
        service_class=1, kmod_varianter=True))
    assert r.status_code == 200, r.text
    trae = r.json()['_summary']['timber_envelope']['1']['1']
    assert 'k_mod kort' in trae['combo'], trae['combo']
    assert trae['duration'] == 'short'


def test_uden_varianterne_vaelges_den_gunstigere_kombination(client):
    """Det, der var galt: den med vind vinder, fordi k_mod er 1,10."""
    r = client.post('/calc/general-frame-fem', json=dict(
        MODEL, title='Portalramme', loads=LASTER, load_cases=LASTTILFAELDE,
        service_class=1, kmod_varianter=False))
    trae = r.json()['_summary']['timber_envelope']['1']['1']
    assert trae['duration'] == 'instant'


def test_forskellen_er_de_22_procent(client):
    """M/k_mod med og uden varianterne — forskellen skal være reel."""
    ud = {}
    for flag in (False, True):
        r = client.post('/calc/general-frame-fem', json=dict(
            MODEL, title='Portalramme', loads=LASTER,
            load_cases=LASTTILFAELDE, service_class=1, kmod_varianter=flag))
        t = r.json()['_summary']['timber_envelope']['1']['1']
        ud[flag] = abs(t['M_Ed_kNm']) / _KMOD_AK1[t['duration']]

    assert ud[True] > ud[False] * 1.15, ud
    assert ud[True] == pytest.approx(23.2, abs=0.3)
    assert ud[False] == pytest.approx(19.0, abs=0.3)


# ── 7. Anvendelsesgrænsetilstanden fra lasttilfældene ───────────────────────
#
# Hullet: en ramme med lasttilfælde blev regnet til brudgrænsen og fik INGEN
# nedbøjning. SLS kendte kun vejen fra en lastkombinationsblok, hvor G_k og
# Q_k kom hver for sig — men med lasttilfælde står den opdeling allerede på
# tilfældet.
#
# En trækonstruktion uden nedbøjningseftervisning er ikke eftervist.

def test_der_regnes_sls_naar_der_er_lasttilfaelde(koersel):
    sls = koersel['_summary'].get('sls')
    assert sls, 'ingen nedbøjning regnet'
    for n in ('w_inst_G_mm', 'w_inst_Q_mm', 'w_inst_mm', 'w_fin_mm',
              'k_def', 'psi_2'):
        assert n in sls, n
    assert sls['w_inst_mm'] > 0


def test_w_inst_er_summen_af_de_to_dele(koersel):
    """§2.2.3(5) kræver delingen: G kryber fuldt, Q kun med sin ψ₂-andel."""
    sls = koersel['_summary']['sls']
    assert sls['w_inst_mm'] == pytest.approx(
        sls['w_inst_G_mm'] + sls['w_inst_Q_mm'], abs=0.01)


def test_w_fin_er_stoerre_end_w_inst(koersel):
    """Krybning kan ikke gøre en bjælke rankere."""
    sls = koersel['_summary']['sls']
    assert sls['w_fin_mm'] > sls['w_inst_mm']


def test_krybningen_er_haandregnet(koersel):
    """w_fin = w_G·(1 + k_def) + w_Q·(1 + ψ₂·k_def)."""
    sls = koersel['_summary']['sls']
    forventet = (sls['w_inst_G_mm'] * (1 + sls['k_def'])
                 + sls['w_inst_Q_mm'] * (1 + sls['psi_2'] * sls['k_def']))
    assert sls['w_fin_mm'] == pytest.approx(forventet, abs=0.01)


def test_psi2_er_nul_naar_sne_leder():
    """DK NA tabel A1.1: ψ₂ for sne og vind er 0."""
    from frame_load_cases import sls_saet
    _, saet = sls_saet(LASTTILFAELDE, LASTER)
    for post in saet:
        assert post['psi_2'] == pytest.approx(0.0), post['navn']


def test_de_to_vindretninger_moedes_heller_ikke_i_sls():
    """Nedbøjning regnet med sidelast fra begge sider er ikke en
    konstruktion, der findes."""
    from frame_load_cases import sls_saet
    _, saet = sls_saet(LASTTILFAELDE, LASTER)
    assert saet
    for post in saet:
        assert not ('Vind fra venstre' in post['navn']
                    and 'Vind fra højre' in post['navn']), post['navn']


def test_den_permanente_del_er_de_permanente_tilfaelde():
    from frame_load_cases import sls_saet
    G, _ = sls_saet(LASTTILFAELDE, LASTER)
    # LC1 er den eneste permanente, og lasten står ukombineret: faktor 1,0
    # — altså egenlastens 2,4 kN/m, ikke ganget med noget.
    assert len(G) == 1
    assert G[0]['value_kNm'] == pytest.approx(2.4)


def test_den_dimensionsgivende_kombination_staar_i_dokumentet(koersel):
    tekst = ' '.join(str(b.get('content', '')) for b in koersel['_result'])
    assert 'Dimensionsgivende karakteristisk kombination' in tekst


def test_uden_lasttilfaelde_er_der_stadig_ingen_sls(client):
    """Den gamle vej er uændret: uden en kilde til G_k og Q_k hver for sig
    er der ingenting at regne, og så skal der ikke opfindes noget."""
    gamle = [dict(l, lc=None, virkning='permanent') for l in LASTER[:1]]
    r = client.post('/calc/general-frame-fem', json=dict(
        MODEL, title='R', loads=gamle))
    assert r.status_code == 200, r.text
    assert r.json()['_summary'].get('sls') is None


# ── 8. Fire vindtilfælde ────────────────────────────────────────────────────
#
# En saddeltagsramme har fire: to retninger gange c_pi = +0,2 og −0,3.
# Alle fire ligger i gruppen 'vind', så der er præcis ét vindtilfælde i hver
# kombination — aldrig to. Det er hele grunden til, at grupper findes.

FIRE_VIND = [
    {'nr': 1, 'navn': 'Egenlast', 'kategori': 'permanent'},
    {'nr': 2, 'navn': 'Snelast',  'kategori': 'snow'},
    {'nr': 3, 'navn': 'Vind venstre, c_pi +0,2', 'kategori': 'wind', 'gruppe': 'vind'},
    {'nr': 4, 'navn': 'Vind venstre, c_pi −0,3', 'kategori': 'wind', 'gruppe': 'vind'},
    {'nr': 5, 'navn': 'Vind højre, c_pi +0,2',   'kategori': 'wind', 'gruppe': 'vind'},
    {'nr': 6, 'navn': 'Vind højre, c_pi −0,3',   'kategori': 'wind', 'gruppe': 'vind'},
]
FIRE_LASTER = [{'type': 'udl', 'elem_id': 1, 'direction': 'vertical',
                'value_kNm': 1.0, 'lc': t['nr']} for t in FIRE_VIND]


def _vind_i(combo):
    return [a for a in combo['aktive'] if a.startswith('Vind')]


def test_fire_vindtilfaelde_giver_nitten_kombinationer():
    """6.10a + 8 stk. 6.10b + 8 gunstige + 2 k_mod-varianter.

    De otte er fire vindvalg gange to ledende (sne, vind). k_mod-varianten
    falder sammen til én, fordi vinden skæres ud — og så er de fire vindvalg
    den samme kombination.
    """
    c = kombinationer_af_tilfaelde(FIRE_VIND, FIRE_LASTER, kmod_varianter=True)
    assert len(c) == 19
    assert len([k for k in c if 'k_mod kort' in k['name']]) == 2


def test_der_er_hoejst_ét_vindtilfaelde_i_hver_kombination():
    """Det dyre at tage fejl af. To vindretninger lagt sammen er 70 % for
    meget sidelast, og det ser helt normalt ud i en tabel.
    """
    for k in kombinationer_af_tilfaelde(FIRE_VIND, FIRE_LASTER,
                                        kmod_varianter=True):
        assert len(_vind_i(k)) <= 1, k['name']


def test_alle_fire_kommer_med_som_ledende():
    """Falder ét ud, er der en lastretning eller et indvendigt tryk, rammen
    aldrig blev eftervist for."""
    c = kombinationer_af_tilfaelde(FIRE_VIND, FIRE_LASTER)
    ledende = {k['name'].split(' leder')[0].split('(')[-1]
               for k in c if ' leder' in k['name']}
    for t in FIRE_VIND[2:]:
        assert t['navn'] in ledende, t['navn']


def test_ogsaa_i_sls_er_der_hoejst_ét():
    from frame_load_cases import sls_saet
    _, saet = sls_saet(FIRE_VIND, FIRE_LASTER)
    assert saet
    for post in saet:
        assert post['navn'].count('Vind') <= 1, post['navn']
