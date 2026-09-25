"""
frame_load_cases.py
===================
EN 1990 load case manager for 2D frame analysis.

Named load cases (G, S, W, Q) are combined into ULS design combinations
per DS/EN 1990 DK NA:2024, Table A1.2(B+C) — STR/GEO limit state.

Danish NA formulation (Table A1.2(B+C), combinations 1 & 2, CC2):
  6.10a : 1.2·K_FI·G                             (permanent loads only)
  6.10b : 1.0·K_FI·G + 1.5·K_FI·Q_lead
          + Σ(1.5·ψ₀·K_FI·Q_companion)           (each variable as lead)

ψ₀ factors — DS/EN 1990 DK NA:2024 Table A1.1:
  Snow  (ellers)                   : ψ₀ = 0.3
  Snow  (when wind leads)          : ψ₀ = 0.0   (explicitly zero per DK NA)
  Wind  (ellers)                   : ψ₀ = 0.3
  Imposed Cat A/B (ellers)         : ψ₀ = 0.7

K_FI per consequence class (Annex B):
  CC1 → 0.9  |  CC2 → 1.0  |  CC3 → 1.1
"""

_KFI = {'CC1': 0.9, 'CC2': 1.0, 'CC3': 1.1}

# DS/EN 1990 DK NA:2024 Table A1.1 — ψ₀ "ellers" (default) values
_PSI0 = {
    'permanent': None,
    'snow':      0.3,   # Table A1.1: "ellers" — 0.3
    'wind':      0.3,   # Table A1.1: "ellers" — 0.3
    'imposed':   0.7,   # Category A/B
}

# DS/EN 1990 DK NA:2024 Table A1.2(B+C) — STR partial factors
_GAMMA_G_A  = 1.2   # 6.10a: γ_G,sup (permanent-only combination)
_GAMMA_G_B  = 1.0   # 6.10b: γ_G,sup (variable-dominated combination)
_GAMMA_Q    = 1.5   # variable load factor

# γ_G,inf -- egenlasten som GUNSTIG. Samme tabel, den anden raekke.
#
# Vaerdien staar bart: 0,9 uden K_FI. Tabellen skriver 1,2·K_FI i den
# ugunstige raekke og et bart 1,0 / 0,9 i den gunstige, og load_combo.py
# regner det praecis saadan -- se tests/test_load_combo.py::
# test_favourable_ignores_k_fi. De to veje ind i huset skal ikke have hver sin
# udgave af den samme tabel.
_GAMMA_G_INF_B = 0.9

# EN 1995-1-1 §2.2.3: governing duration = shortest-duration variable action in combo
_TYPE_DURATION = {
    'permanent': 'permanent',
    'imposed':   'medium',
    'snow':      'short',
    'wind':      'instant',
}
_DURATION_RANK = {
    'permanent': 0, 'long': 1, 'medium': 2, 'short': 3, 'instant': 4,
}

# Varighedsklassernes danske navne. De staar i kombinationsnavnet, saa den der
# laeser rapporten kan se HVORFOR to naesten ens kombinationer begge er med.
_VARIGHED_DK = {
    'permanent': 'permanent', 'long': 'lang', 'medium': 'middel',
    'short': 'kort', 'instant': 'øjeblikkelig',
}

TYPE_LABELS = {
    'permanent': 'G — Permanent',
    'snow':      'S — Snelast',
    'wind':      'W — Vindlast',
    'imposed':   'Q — Nyttelast',
}


# De to veje ind kalder feltet noget forskelligt: lasttilfaeldeblokken bruger
# 'load_type', og FEM-blokkens egne laster bruger 'type'. Derfor skaleres alle
# stoerrelsesfelter, der faktisk er der, i stedet for at gaette lastens art ud
# af det ene navn.
#
# Det gik galt praecis der: en last fra FEM-blokken med type='udl' faldt i
# nodal-grenen, fik skaleret sine Fx/Fy/Mz -- som alle var nul -- og beholdt
# sin value_kNm ukombineret. Egenlasten blev regnet med 3,0 i stedet for 1,2 x
# 3,0, og der stod ikke noget nogen steder om det.
# value_end_kNm er med, fordi en trapezlast har to intensiteter. Uden den
# blev kun startvaerdien ganget, og en trekantlast kom ind i kombinationen
# med 1,5 i den ene ende og 1,0 i den anden -- en anden lastfigur end den,
# der blev tastet, og den ville se helt normal ud i tabellen.
_MAGNITUDER = ('value_kNm', 'value_end_kNm',
               'Fx_kN', 'Fy_kN', 'Mz_kNm', 'wy_kNm', 'wx_kNm')


def _scale_load(ld, factor):
    """Return a copy of load dict with magnitudes scaled by factor."""
    s = dict(ld)
    for felt in _MAGNITUDER:
        if felt in s and s[felt] is not None:
            s[felt] = round(float(s[felt]) * factor, 5)
    return s


def _companion_psi0(lead_type, companion_type):
    """
    Return ψ₀ for a companion action given the leading action type.
    Special rule per DK NA Table A1.1: snow ψ₀ = 0 when wind leads.
    """
    if lead_type == 'wind' and companion_type == 'snow':
        return 0.0
    return _PSI0.get(companion_type, 0.7)


def generate_combinations(cases, method='6.10ab', consequence_class='CC2'):
    """
    Generate ULS load combinations per DS/EN 1990 DK NA:2024.

    Parameters
    ----------
    cases : list of dicts
        {id, type, loads: [...]}
    method : '6.10ab'  DS/EN 1990 DK NA:2024 Table A1.2(B+C) — recommended
             '6.10'    Simplified (1.35G + 1.5Q) — conservative, not DK NA STR
    consequence_class : 'CC1' | 'CC2' | 'CC3'

    Returns
    -------
    list of combination dicts:
        {name, factor_table: {case_id: factor}, loads: [...], governing_duration}
    """
    kfi       = _KFI.get(consequence_class, 1.0)
    g_cases   = [c for c in cases if c['type'] == 'permanent']
    var_cases = [c for c in cases if c['type'] != 'permanent']
    combos    = []

    def _assemble(name, g_fac, var_factors):
        loads = []
        factor_table = {}
        for c in g_cases:
            factor_table[c['id']] = round(g_fac, 4)
            for ld in c.get('loads', []):
                loads.append(_scale_load(ld, g_fac))
        active_durations = []
        for c in var_cases:
            f = var_factors.get(c['id'], 0.0)
            factor_table[c['id']] = round(f, 4)
            if abs(f) > 1e-10:
                for ld in c.get('loads', []):
                    loads.append(_scale_load(ld, f))
                active_durations.append(_TYPE_DURATION.get(c['type'], 'medium'))
        governing = (max(active_durations, key=lambda d: _DURATION_RANK.get(d, 0))
                     if active_durations else 'permanent')
        combos.append({'name': name, 'factor_table': factor_table,
                       'loads': loads, 'governing_duration': governing})

    if method == '6.10ab':
        # ── DS/EN 1990 DK NA:2024 Table A1.2(B+C) ──────────────────────────
        # 6.10a: permanent loads only, γ_G = 1.2·K_FI  (no variable actions)
        g_fac_a = _GAMMA_G_A * kfi
        _assemble(f'6.10a: {g_fac_a:.2f}G', g_fac_a, {})

        if var_cases:
            # 6.10b: γ_G = 1.0·K_FI, each variable case as lead in turn
            g_fac_b = _GAMMA_G_B * kfi
            for i, lead in enumerate(var_cases):
                vf = {}
                parts = []
                for j, c in enumerate(var_cases):
                    if j == i:
                        vf[c['id']] = _GAMMA_Q * kfi
                        parts.append(f'1.5{c["id"]}')
                    else:
                        psi = _companion_psi0(lead['type'], c['type'])
                        vf[c['id']] = round(_GAMMA_Q * psi * kfi, 5)
                        if psi > 0:
                            parts.append(f'{psi:.1f}×1.5{c["id"]}')
                label = f'6.10b ({lead["id"]} led): {g_fac_b:.2f}G + {" + ".join(parts)}'
                _assemble(label, g_fac_b, vf)

    else:  # '6.10' — simplified, conservative (not DK NA STR)
        # Permanent-only case
        _assemble(f'1.35G', 1.35 * kfi, {})
        # Each variable as lead with ψ₀ companions
        for i, lead in enumerate(var_cases):
            vf = {}
            parts = []
            for j, c in enumerate(var_cases):
                if j == i:
                    vf[c['id']] = _GAMMA_Q * kfi
                    parts.append(f'1.5{c["id"]}')
                else:
                    psi = _companion_psi0(lead['type'], c['type'])
                    vf[c['id']] = round(_GAMMA_Q * psi * kfi, 5)
                    if psi > 0:
                        parts.append(f'{psi:.1f}×1.5{c["id"]}')
            _assemble(f'1.35G + {" + ".join(parts)}', 1.35 * kfi, vf)

    return combos


def combinations_to_calc_blocks(cases, combinations, consequence_class, method):
    """Return calc_core blocks for PDF export."""
    try:
        from calc_core import S, T, TBL
    except ImportError:
        return []

    blocks = [
        S('Lastkombinationer (DS/EN 1990 DK NA:2024)'),
        T(f'Konsekvensklasse: {consequence_class}  ·  Metode: {method}'),
    ]

    for c in cases:
        lbl = TYPE_LABELS.get(c['type'], c['type'])
        load_lines = []
        for ld in c.get('loads', []):
            if ld.get('load_type') == 'udl':
                dir_lbl = {
                    'vertical':      'vertikal',
                    'projected':     'projekteret (sne)',
                    'horizontal':    'horisontal',
                    'perpendicular': 'vinkelret på flade',
                }.get(ld.get('direction', 'vertical'), ld.get('direction'))
                if ld.get('member_id') is not None:
                    target = f"Member {ld['member_id']}"
                elif ld.get('elem_ids'):
                    target = f"Elements {', '.join(str(i) for i in ld['elem_ids'])}"
                else:
                    target = f"Element {ld.get('elem_id')}"
                load_lines.append(f"{target}: {ld.get('value_kNm', 0):.2f} kN/m  ({dir_lbl})")
            else:
                load_lines.append(
                    f"Knude {ld.get('node_id')}: "
                    f"Fx={ld.get('Fx_kN',0):.2f} kN  Fy={ld.get('Fy_kN',0):.2f} kN"
                )
        blocks.append(T(f"{c['id']} — {lbl}:\n" + '\n'.join(load_lines)))

    case_ids = [c['id'] for c in cases]
    headers  = ['Kombination'] + [f'γ·{cid}' for cid in case_ids]
    rows = []
    for combo in combinations:
        row = [combo['name']]
        for cid in case_ids:
            f = combo['factor_table'].get(cid, 0.0)
            row.append(f'{f:.3f}' if abs(f) > 1e-10 else '—')
        rows.append(row)
    blocks.append(TBL(headers, rows))

    return blocks


# ── Kombinationer ud af laster, der er paasat modellen ────────────────────────
#
# Den anden vej ind. generate_combinations() ovenfor tager navngivne
# lasttilfaelde, der er defineret i en blok for sig -- og den blok viser ikke
# modellen, saa elementnumrene tastes i blinde og bliver staaende, naar FEM-
# blokken omnummererer.
#
# Her kommer lasterne fra modellen selv. Hver last kan baere to valgfrie felter:
#
#     virkning : 'permanent' | 'snow' | 'wind' | 'imposed'
#     variant  : en tekst, eller None
#
# Virkningen afgoer gamma og psi_0. Varianten afgoer, hvad der udelukker
# hinanden: to laster med samme virkning men forskellig variant kommer aldrig i
# den samme kombination. Det er saadan "vind fra venstre" og "vind fra hoejre"
# holdes fra hinanden -- ikke ved en regel om ordet "vind", men ved noget,
# brugeren selv har skrevet paa lasten og kan se.
#
# Uden virkning paa nogen last er der ingenting at kombinere over, og kaldet
# returnerer en tom liste. Saa koerer FEM-blokken som den altid har gjort: én
# beregning med lasterne som de staar.

_UDEN_VIRKNING = 'permanent'


def _handlinger(loads):
    """
    Grupper lasterne i handlinger.

    En handling er (virkning, variant). Alle permanente laster er én handling
    uanset variant -- egenlasten er der i hver kombination, og en "variant" af
    den ville betyde noget andet, end brugeren tror.
    """
    grupper = {}
    for ld in loads:
        virkning = (ld.get('virkning') or _UDEN_VIRKNING).strip().lower()
        variant = ld.get('variant') or None
        if virkning == 'permanent':
            variant = None
        grupper.setdefault((virkning, variant), []).append(ld)
    return grupper


def _navngiv(virkning, variant):
    kort = {'permanent': 'G', 'snow': 'S', 'wind': 'W', 'imposed': 'Q'}
    n = kort.get(virkning, virkning[:1].upper())
    return f'{n}·{variant}' if variant else n


# ── Lasttilfaelde ────────────────────────────────────────────────────
#
# Et lasttilfaelde er det, ethvert rammeprogram kalder en load case: et navn,
# en handlingskategori og de laster, der hoerer til. Kategorien baerer psi og
# lastvarigheden; navnet er det, der staar i rapporten.
#
# Tilfaelde i samme GRUPPE udelukker hinanden -- det er RFEM's "load case
# relation". Vind fra venstre og vind fra hoejre ligger i gruppen "vind", og
# saa kommer de aldrig i den samme kombination. Uden en gruppe hoerer
# tilfaeldet til sin kategori, saa to vindtilfaelde udelukker hinanden af sig
# selv. Det er det rigtige gaet: to vindretninger er naesten altid
# alternativer, og skal de virke samtidig, skal det siges.

def _normaliser_tilfaelde(load_cases):
    """Tilfaeldene med de felter, resten af koden regner med."""
    ud = []
    for i, t in enumerate(load_cases or []):
        kategori = (t.get('kategori') or t.get('virkning')
                    or _UDEN_VIRKNING).strip().lower()
        nr = t.get('nr', t.get('id', i + 1))
        navn = (t.get('navn') or '').strip() or f'LC{nr}'
        # Permanente tilfaelde grupperes aldrig. Egenlasten er der i hver
        # kombination; et "alternativ" til den ville betyde noget andet, end
        # den der skrev det regnede med.
        gruppe = None if kategori == 'permanent' else (t.get('gruppe') or kategori)
        ud.append({'nr': nr, 'navn': navn, 'kategori': kategori,
                   'gruppe': gruppe})
    return ud


def _tilfaelde_fra_virkning(loads):
    """
    Den gamle vej oversat til tilfaelde.

    Laster baerer virkning og variant direkte. Det er stadig tilladt -- hvert
    dokument, der er lavet paa den maade, skal blive ved med at regne det
    samme -- men der er kun ÉN kombinationsmotor, og den taeller i tilfaelde.
    Saa bliver (virkning, variant) til et tilfaelde med et navn, og resten af
    koden behoever ikke vide, hvilken vej lasterne kom ind ad.
    """
    tilfaelde = []
    noegler = {}
    for noegle in _handlinger(loads):
        virkning, variant = noegle
        nr = len(tilfaelde) + 1
        tilfaelde.append({'nr': nr, 'navn': _navngiv(virkning, variant),
                          'kategori': virkning,
                          'gruppe': None if virkning == 'permanent' else virkning})
        noegler[noegle] = nr

    ud = []
    for ld in loads:
        virkning = (ld.get('virkning') or _UDEN_VIRKNING).strip().lower()
        variant = ld.get('variant') or None
        if virkning == 'permanent':
            variant = None
        ud.append(dict(ld, lc=noegler[(virkning, variant)]))
    return tilfaelde, ud


def kombinationer_fra_laster(loads, method='6.10ab', consequence_class='CC2',
                             gunstig_egenlast=True):
    """
    Byg EN 1990-kombinationer af laster, der baerer virkning og variant.

    Den gamle vej ind. Lasterne oversaettes til tilfaelde og regnes af den
    samme motor som alt andet, saa de to veje ikke kan blive uenige.

    Returnerer [] naar ingen last baerer en virkning -- saa er der ingenting at
    kombinere, og kaldet skal ikke opfinde en kombination af én ting.
    """
    if not any(ld.get('virkning') for ld in loads):
        return []
    tilfaelde, med_lc = _tilfaelde_fra_virkning(loads)
    return kombinationer_af_tilfaelde(tilfaelde, med_lc, method,
                                      consequence_class, gunstig_egenlast)


def kombinationer_af_tilfaelde(load_cases, loads, method='6.10ab',
                               consequence_class='CC2',
                               gunstig_egenlast=True,
                               kmod_varianter=False):
    """
    EN 1990-kombinationer af navngivne lasttilfaelde.

    load_cases  [{nr, navn, kategori, gruppe}]
    loads       modellens laster; hver med 'lc' = tilfaeldets nr. En last uden
                et kendt 'lc' udelades -- den hoerer ikke til nogen handling,
                og at lade den falde ned i en tilfaeldig ville vaere et gaet.

    Returnerer en liste af
        {name, loads, governing_duration, factor_table, aktive}
    hvor factor_table er {tilfaeldets navn: faktor}. Tabellen er det, brugeren
    ser og kan rette; den er ikke et mellemresultat.
    """
    tilfaelde = _normaliser_tilfaelde(load_cases)
    if not tilfaelde:
        return []

    kfi = _KFI.get(consequence_class, 1.0)
    pr_nr = {t['nr']: t for t in tilfaelde}

    laster_pr_tilfaelde = {}
    for ld in loads:
        nr = ld.get('lc')
        if nr in pr_nr:
            laster_pr_tilfaelde.setdefault(nr, []).append(ld)

    permanente = [t for t in tilfaelde if t['kategori'] == 'permanent']
    variable = [t for t in tilfaelde if t['kategori'] != 'permanent']

    # Tilfaelde i samme gruppe udelukker hinanden: ét valg pr. gruppe.
    pr_gruppe = {}
    for t in variable:
        pr_gruppe.setdefault(t['gruppe'], []).append(t)
    valgmuligheder = [sorted(v, key=lambda t: (str(t['navn']), t['nr']))
                      for v in pr_gruppe.values()]

    import itertools
    udvalg = [list(u) for u in itertools.product(*valgmuligheder)] \
        if valgmuligheder else [[]]

    combos = []
    set_navne = set()

    def _saml(navn, g_fac, faktorer):
        """faktorer: {tilfaeldets nr: faktor} for de variable, der indgaar."""
        ud = []
        tabel = {}
        varigheder = []
        for t in permanente:
            tabel[t['navn']] = round(g_fac, 4)
            ud += [_scale_load(l, g_fac)
                   for l in laster_pr_tilfaelde.get(t['nr'], [])]
        for nr, f in faktorer.items():
            tabel[pr_nr[nr]['navn']] = round(f, 4)
            if abs(f) > 1e-10:
                ud += [_scale_load(l, f)
                       for l in laster_pr_tilfaelde.get(nr, [])]
                varigheder.append(
                    _TYPE_DURATION.get(pr_nr[nr]['kategori'], 'medium'))
        governing = (max(varigheder, key=lambda d: _DURATION_RANK.get(d, 0))
                     if varigheder else 'permanent')
        # Samme navn er samme kombination: navnet baerer baade den ledende og
        # hver faktor. To vindvalg falder sammen til én, saa snart vinden
        # skaeres ud af k_mod-hensyn, og saa ville den staa to gange i
        # rapporten og blive regnet to gange.
        if navn in set_navne:
            return
        set_navne.add(navn)
        combos.append({'name': navn, 'loads': ud, 'factor_table': tabel,
                       'governing_duration': governing,
                       'aktive': [pr_nr[nr]['navn'] for nr in faktorer
                                  if abs(faktorer[nr]) > 1e-10]})

    # 6.10a — kun de permanente
    g_a = _GAMMA_G_A * kfi
    _saml(f'6.10a: {g_a:.2f}G', g_a, {})

    # 6.10b — for hvert udvalg, hvert aktivt tilfaelde som ledende
    g_b = _GAMMA_G_B * kfi
    for valg in udvalg:
        for ledende in valg:
            faktorer = {}
            dele = []
            for t in valg:
                if t['nr'] == ledende['nr']:
                    faktorer[t['nr']] = _GAMMA_Q * kfi
                    dele.append(f"1,5·{t['navn']}")
                else:
                    psi = _companion_psi0(ledende['kategori'], t['kategori'])
                    faktorer[t['nr']] = round(_GAMMA_Q * psi * kfi, 5)
                    if psi > 0:
                        dele.append(f"{psi:.1f}·1,5·{t['navn']}")
            navn = (f"6.10b ({ledende['navn']} leder): "
                    f'{g_b:.2f}G + ' + ' + '.join(dele))
            _saml(navn, g_b, faktorer)

            # Den samme kombination med egenlasten som gunstig.
            #
            # Loefter vinden i taget, modvirker egenlasten loeftet, og saa er
            # det den LILLE egenlast, der er farlig. 1,0*G kan skjule et loeft,
            # som 0,9*G viser. Hvilken vej det falder ud, kan ingen se foer
            # modellen er regnet -- derfor regnes begge, og indhyldningen tager
            # den vaerste. Det er ogsaa saadan EN 1990 er skrevet: gunstig og
            # ugunstig er to eftervisninger, ikke et valg mellem to.
            #
            # Kun 6.10b faar en tvilling. 6.10a er de permanente alene, og dér
            # er svaret lineaert i faktoren: 1,2*K_FI er 1,08 / 1,20 / 1,32 og
            # dermed altid stoerre end 1,0, saa en gunstig 6.10a kan ikke blive
            # dimensionsgivende for noget som helst.
            #
            # Uden permanente tilfaelde ville tvillingen vaere en noejagtig
            # kopi -- der er ingen G at saette en anden faktor paa.
            if gunstig_egenlast and permanente:
                navn_g = (f"6.10b gunstig G ({ledende['navn']} leder): "
                          f'{_GAMMA_G_INF_B:.2f}G + ' + ' + '.join(dele))
                _saml(navn_g, _GAMMA_G_INF_B, dict(faktorer))

            # k_mod-varianter (EN 1995-1-1 §3.1.3).
            #
            # k_mod foelger den KORTESTE lastvarighed i kombinationen. En
            # medvirkende vindlast med psi_0 = 0,3 aendrer naesten ingenting
            # ved snitkraften, men loefter k_mod fra 0,90 til 1,10 -- altsaa
            # baereevnen med 22 %. Uden den kombination, hvor vinden IKKE er
            # med, kan den lavere k_mod aldrig blive dimensionsgivende, og
            # eftervisningen er 22 % for gunstig.
            #
            # Maalt paa eksempelrammen: med vind M/k_mod = 18,99, uden vind
            # 23,24. Det er ikke en finesse, det er forskellen paa OK og ikke
            # OK.
            #
            # Derfor: for hver varighedsklasse, der er KORTERE end den
            # ledendes, dannes kombinationen uden de medvirkende af den klasse
            # og alt kortere. Det er ikke alle delmaengder -- kun dem, der
            # faktisk flytter k_mod, og der er højst én pr. klasse.
            if kmod_varianter:
                r_led = _DURATION_RANK.get(
                    _TYPE_DURATION.get(ledende['kategori'], 'medium'), 0)
                kortere = sorted({
                    _DURATION_RANK.get(
                        _TYPE_DURATION.get(pr_nr[nr]['kategori'], 'medium'), 0)
                    for nr, f in faktorer.items()
                    if abs(f) > 1e-10 and _DURATION_RANK.get(
                        _TYPE_DURATION.get(pr_nr[nr]['kategori'], 'medium'), 0) > r_led
                }, reverse=True)

                for graense in kortere:
                    skaaret = {}
                    beholdt_dele = []
                    for nr, f in faktorer.items():
                        rang = _DURATION_RANK.get(
                            _TYPE_DURATION.get(pr_nr[nr]['kategori'], 'medium'), 0)
                        # Den ledende bliver staaende uanset hvad -- den er
                        # det, kombinationen hedder efter.
                        if nr != ledende['nr'] and rang >= graense:
                            skaaret[nr] = 0.0
                            continue
                        skaaret[nr] = f
                        if abs(f) > 1e-10:
                            if nr == ledende['nr']:
                                beholdt_dele.append(f"1,5\u00b7{pr_nr[nr]['navn']}")
                            else:
                                psi = _companion_psi0(ledende['kategori'],
                                                      pr_nr[nr]['kategori'])
                                beholdt_dele.append(
                                    f"{psi:.1f}\u00b71,5\u00b7{pr_nr[nr]['navn']}")

                    # Den resulterende varighed: den korteste af dem, der er
                    # tilbage.
                    rester = [r_led] + [
                        _DURATION_RANK.get(
                            _TYPE_DURATION.get(pr_nr[nr]['kategori'], 'medium'), 0)
                        for nr, f in skaaret.items() if abs(f) > 1e-10]
                    ny_rang = max(rester)
                    ny_varighed = next(k for k, v in _DURATION_RANK.items()
                                       if v == ny_rang)
                    maerkat = _VARIGHED_DK.get(ny_varighed, ny_varighed)

                    navn_k = (f"6.10b ({ledende['navn']} leder, k_mod "
                              f"{maerkat}): {g_b:.2f}G + "
                              + ' + '.join(beholdt_dele))
                    _saml(navn_k, g_b, skaaret)
                    if gunstig_egenlast and permanente:
                        navn_kg = (f"6.10b gunstig G ({ledende['navn']} leder, "
                                   f"k_mod {maerkat}): "
                                   f"{_GAMMA_G_INF_B:.2f}G + "
                                   + ' + '.join(beholdt_dele))
                        _saml(navn_kg, _GAMMA_G_INF_B, dict(skaaret))

    return combos


# ── Kombinationerne fra lastmodulet, paasat modellen ─────────────────────────
def kombinationer_fra_lastmodul(loads, kombinationer, lasttilfaelde,
                                situationer=None):
    """
    Modellens laster ganget med lastmodulets faktorer.

    loads          modellens laster. Hver skal baere 'lasttilfaelde': nr.
                   -1 er den permanente; 0 og opefter peger ind i 'q'.
    kombinationer  fra load_combo.kombinationssaet(), via lastmodulets eksport.
    lasttilfaelde  samme sted -- kun til at skrive navne i faktortabellen.
    situationer    hvilke dimensioneringssituationer der skal med. None = alle.

    Returnerer samme form som solve_combinations allerede tager imod, plus
    'situation', saa en indhyldning kan holdes pr. situation.

    Den danner ikke kombinationer selv. Det er hele aendringen: hver gang to
    steder i programmet har dannet de samme kombinationer, er de blevet
    uenige -- senest psi_0 for nyttelast, 0,50 i lastmodulet og 0,70 her.
    """
    navne = {t['nr']: t['navn'] for t in (lasttilfaelde or [])}

    utagget = [ld for ld in loads if ld.get('lasttilfaelde') is None]
    if utagget:
        hvor = ', '.join(sorted({str(ld.get('elem_id') or ld.get('node_id') or '?')
                                 for ld in utagget}))
        raise ValueError(
            f'{len(utagget)} last(er) hoerer ikke til et lasttilfaelde '
            f'(element/knude {hvor}). Naar modellen kombineres, skal hver last '
            f'vide hvad den er, ellers faar den ingen faktor — og en '
            f'kombination, der mangler en last, giver en for lille '
            f'eftervisning uden at sige noget.')

    ud = []
    for k in kombinationer:
        if situationer is not None and k['situation'] not in situationer:
            continue

        paasat = []
        tabel = {}
        for ld in loads:
            nr = int(ld['lasttilfaelde'])
            if nr < 0:
                faktor = float(k['g'])
            else:
                try:
                    faktor = float(k['q'][nr])
                except (IndexError, TypeError):
                    # Lastmodulet har faerre laster end modellen peger paa.
                    # Det sker, naar en raekke slettes i lastmodulet, mens en
                    # last paa modellen stadig peger paa den. Nul ville vaere
                    # en eftervisning uden den last.
                    raise ValueError(
                        f'Lasttilfaelde {nr} findes ikke i lastmodulet '
                        f'laengere. Kombinationen kan ikke paasaettes.')
            tabel[navne.get(nr, f'#{nr}')] = round(faktor, 4)
            if abs(faktor) > 1e-12:
                paasat.append(_scale_load(ld, faktor))

        ud.append({
            'name':               k['navn'],
            'situation':          k['situation'],
            'loads':              paasat,
            # Varigheden kommer fra kombinationen og ikke fra et felt nogen
            # saetter. Det er den, der afgoer k_mod.
            'governing_duration': k['varighed'],
            'factor_table':       tabel,
            'aktive':             [navne.get(nr, f'#{nr}')
                                   for nr in sorted(navne)
                                   if abs(tabel.get(navne.get(nr, f'#{nr}'), 0)) > 1e-12],
        })
    return ud


# ── Anvendelsesgraensetilstanden ────────────────────────────────────────────
#
# DS/EN 1990 DK NA:2024 tabel A1.1, psi_2. Kun de kategorier, tilfaeldene kan
# have. Vaerdierne er de samme som i load_combo.PSI_DK -- sne og vind har
# psi_2 = 0, og nyttelast kategori A/B har 0,2.
_PSI2 = {
    'permanent': None,
    'snow':      0.0,
    'wind':      0.0,
    'imposed':   0.2,
}


def sls_saet(load_cases, loads):
    """
    Lasterne til anvendelsesgraensetilstanden, delt som EN 1995 kraever det.

    Returnerer (G_laster, [{navn, laster, psi_2}]).

    G_laster er de permanente tilfaeldes laster med faktor 1,0.

    Listen er den KARAKTERISTISKE kombinations variable del -- én post pr.
    ledende variabel: Q_ledende med 1,0 og de medvirkende med psi_0. Og som i
    brudgraensen vaelges der ét tilfaelde pr. gruppe, saa vind fra venstre og
    fra hoejre aldrig staar sammen. Uden den regel ville nedboejningen blive
    regnet med sidelast fra begge sider, og det er ikke en konstruktion, der
    findes.

    psi_2 er den ledendes -- den, der bestemmer krybningens variable del i
    §2.2.3(5).

    Kalderen koerer dem og tager den vaerste. Det er billigt: en lineaer
    loesning er millisekunder, og alternativet er at gaette hvilken der giver
    den stoerste nedboejning.
    """
    tilfaelde = _normaliser_tilfaelde(load_cases)
    if not tilfaelde:
        return [], []

    pr_nr = {t['nr']: t for t in tilfaelde}
    pr_tilfaelde = {}
    for ld in loads:
        nr = ld.get('lc')
        if nr in pr_nr:
            pr_tilfaelde.setdefault(nr, []).append(ld)

    G = []
    for t in tilfaelde:
        if t['kategori'] == 'permanent':
            G += [_scale_load(l, 1.0) for l in pr_tilfaelde.get(t['nr'], [])]

    variable = [t for t in tilfaelde if t['kategori'] != 'permanent']
    pr_gruppe = {}
    for t in variable:
        pr_gruppe.setdefault(t['gruppe'], []).append(t)
    valgmuligheder = [sorted(v, key=lambda t: (str(t['navn']), t['nr']))
                      for v in pr_gruppe.values()]

    import itertools
    udvalg = [list(u) for u in itertools.product(*valgmuligheder)] \
        if valgmuligheder else []

    saet = []
    set_navne = set()
    for valg in udvalg:
        for ledende in valg:
            ud = []
            dele = []
            for t in valg:
                if t['nr'] == ledende['nr']:
                    f = 1.0
                else:
                    f = _companion_psi0(ledende['kategori'], t['kategori'])
                if abs(f) <= 1e-10:
                    continue
                ud += [_scale_load(l, f)
                       for l in pr_tilfaelde.get(t['nr'], [])]
                dele.append(t['navn'] if f == 1.0
                            else f"{f:.1f}·{t['navn']}")
            navn = 'G + ' + ' + '.join(dele) if dele else 'G'
            if navn in set_navne:
                continue
            set_navne.add(navn)
            saet.append({'navn': navn, 'laster': ud,
                         'psi_2': _PSI2.get(ledende['kategori'], 0.0)})
    return G, saet
