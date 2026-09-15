"""
load_combo.py — EN 1990 load combination calculator (Danish NA)

Computes ULS, ALS and SLS design action effects.

Reference: DS/EN 1990 DK NA:2024, rev. 2023-12-19
  (Social- og Boligstyrelsen. Tabel A1.1, A1.2(B+C) og A1.3 er
   efterproevet mod selve standarden -- se tests/test_dk_na_2024.py.
   Vaerdierne er uaendrede fra 2019-udgaven, men det er kontrolleret
   og ikke antaget.)
  • Table A1.1 DK NA  — ψ-factors for buildings
  • Table A1.2(B+C) DK NA  — partial factors STR/GEO (set B+C)
  • Table A1.3 DK NA  — accidental / fire combinations

Key Danish NA rules
────────────────────
Partial factors (Table A1.2(B+C), Combinations 1 + 2):
  6.10a  →  E_d = 1.2·K_FI·G_k             (permanent loads ONLY)
  6.10b  →  E_d = 1.0·K_FI·G_k
                + 1.5·K_FI·Q₁
                + Σ 1.5·K_FI·ψ₀·Qᵢ

  K_FI  :  CC1 = 0.9  |  CC2 = 1.0  |  CC3 = 1.1

Gunstig egenlast (γ_G,inf, samme tabel):
  6.10a  →  1.0·G_k        6.10b  →  0.9·G_k
Bemærk at γ_G,inf IKKE ganges med K_FI — tabellen skriver 1,2·K_FI i den
ugunstige række og et bart 1,0 / 0,9 i den gunstige.

ψ₀ for Snow (S) is context-dependent on the leading action:
  0.6 if lead is Cat. E or Temperature
  0.0 if lead is Wind
  0.3 otherwise
Wind (W) ψ₀:
  0.6 if lead is Cat. E
  0.3 otherwise

Accidental combinations (Table A1.3 DK NA, Eq. 6.11a/b):
  Fire     :  G_k + A_d + ψ₁,₁·Q_k,₁ + Σ ψ₂,ᵢ·Q_k,ᵢ
  Other    :  G_k + A_d + ψ₂,₁·Q_k,₁ + Σ ψ₂,ᵢ·Q_k,ᵢ
  (γ = 1.0 for all loads in ALS)
"""
from calc_core import S, T, N, TBL, CALC_ROW, MH, CheckContext


# ── ψ-factors per load category (Table A1.1 DK NA) ───────────────────────────
# (ψ₀, ψ₁, ψ₂)  — ψ₀ for S and W may be overridden per combination
PSI_DK = {
    'A': (0.5, 0.3, 0.2),
    'B': (0.6, 0.4, 0.2),
    'C': (0.6, 0.6, 0.5),
    'D': (0.6, 0.6, 0.5),
    'E': (0.8, 0.8, 0.7),
    'F': (0.6, 0.6, 0.5),
    'G': (0.6, 0.4, 0.2),
    'H': (0.0, 0.0, 0.0),
    'S': (0.3, 0.2, 0.0),   # default ψ₀ — may increase/decrease per combination
    'W': (0.3, 0.2, 0.0),   # default ψ₀ — may increase per combination
    'T': (0.6, 0.5, 0.0),
}

K_FI_MAP = {'CC1': 0.9, 'CC2': 1.0, 'CC3': 1.1}

_DURATION_MAP = {
    'A': 'medium', 'B': 'medium', 'C': 'medium', 'D': 'medium',
    'E': 'long',   'F': 'short',  'G': 'short',  'H': 'short',
    'S': 'short',  'W': 'instant','T': 'short',
}

_DEFAULT_PSI = (0.6, 0.4, 0.2)


# Lastvarighedsklasserne som de hedder paa dansk. KMOD-opslaget bruger de
# engelske noegler, men dokumentet skal ikke.
_VARIGHED_DK = {
    'permanent': 'permanent', 'long': 'lang', 'medium': 'middel',
    'short': 'kort', 'instant': 'øjeblikkelig',
}

_ULYKKE_DK = {'fire': 'brand', 'other': 'øvrig ulykke'}


def _psi0(category: str, lead_category: str) -> float:
    """Context-dependent ψ₀ for a non-leading action (DK NA Table A1.1)."""
    c, lead = category.upper(), lead_category.upper()
    if c == 'S':
        return 0.6 if lead in ('E', 'T') else (0.0 if lead == 'W' else 0.3)
    if c == 'W':
        return 0.6 if lead == 'E' else 0.3
    return PSI_DK.get(c, _DEFAULT_PSI)[0]


# ── Kombinationerne som faktorer ─────────────────────────────────────────────
# Situationsnoeglerne. De staar her, fordi baade den, der danner
# kombinationerne, og den, der bruger dem, skal stave dem ens.
ULS        = 'uls'
ALS_BRAND  = 'als_brand'
ALS_OEVRIG = 'als_oevrig'
SLS_KAR    = 'sls_karakteristisk'
SLS_HYP    = 'sls_hyppig'
SLS_KVASI  = 'sls_kvasi'


def kombinationssaet(loads, method='6.10ab', G_fav=False,
                     consequence_class='CC2'):
    """
    Alle EN 1990-kombinationer som FAKTORER i stedet for tal.

    Hver post:

        {'navn', 'situation', 'formel', 'ledende', 'varighed',
         'g': faktor paa G_k,
         'q': [faktor pr. variabel last, i lasternes egen raekkefoelge],
         'a': faktor paa A_d}

    saa at

        E_d = g·G_k + Σ q[i]·Q_k[i] + a·A_d

    Det er meningen med formen. En lastkombination er ikke et tal -- det er et
    saet faktorer, og tallet er hvad de giver, naar de rammer nogle laster.
    Skal en rammeberegning kombinere laster paa en model, er det faktorerne,
    den skal bruge; skal blokken skrive en tabel, er det tallene. Begge dele
    kommer nu fra den her funktion, saa tabellen i dokumentet og den
    eftervisning, der faktisk blev regnet, ikke kan vaere to forskellige ting.

    A_d staar som en faktor og ikke som en vaerdi, fordi ulykken er en
    kombination og ikke en last, man paasaetter -- den er nul ved brand, hvor
    branden virker gennem det reducerede tvaersnit.
    """
    KFI = K_FI_MAP.get(consequence_class.upper(), 1.0)
    n = len(loads)
    kat = [l['category'].upper() for l in loads]
    psi1 = [PSI_DK.get(c, _DEFAULT_PSI)[1] for c in kat]
    psi2 = [PSI_DK.get(c, _DEFAULT_PSI)[2] for c in kat]
    navne = [l.get('label') or f'Q{i + 1}' for i, l in enumerate(loads)]

    ud = []

    def _tilfoej(navn, situation, formel, g, q, a=0.0, ledende=-1, varighed=None):
        ud.append({
            'navn': navn, 'situation': situation, 'formel': formel,
            'g': round(float(g), 6),
            'q': [round(float(f), 6) for f in q],
            'a': round(float(a), 6),
            'ledende': ledende, 'varighed': varighed,
        })

    def _ledende_varighed(lead):
        return _DURATION_MAP.get(kat[lead], 'medium')

    # ── Brudgraense ──────────────────────────────────────────────────────────
    if n == 0:
        # Uden variable laster er der kun den permanente kombination.
        if method == '6.10ab':
            g_a = 1.0 if G_fav else 1.2 * KFI
            _tilfoej('6.10a', ULS, f'{g_a:.2f} · G_k', g_a, [],
                     varighed='permanent')
        else:
            g_a = 1.0 if G_fav else 1.35 * KFI
            _tilfoej('6.10', ULS, f'{g_a:.2f} · G_k', g_a, [],
                     varighed='permanent')
    elif method == '6.10':
        g = 1.0 if G_fav else 1.35 * KFI
        gQ = 1.50 * KFI
        for lead in range(n):
            q = [gQ * (1.0 if i == lead else _psi0(kat[i], kat[lead]))
                 for i in range(n)]
            _tilfoej(f'6.10 — {navne[lead]}', ULS,
                     '1.35·K_FI·G + 1.5·K_FI·Q₁ + Σ…',
                     g, q, ledende=lead, varighed=_ledende_varighed(lead))
    else:
        g_a = 1.0 if G_fav else 1.2 * KFI
        _tilfoej('6.10a', ULS, f'{g_a:.2f} · G_k', g_a, [0.0] * n,
                 varighed='permanent')
        g_b = 0.9 if G_fav else 1.0 * KFI
        gQ = 1.5 * KFI
        for lead in range(n):
            q = [gQ * (1.0 if i == lead else _psi0(kat[i], kat[lead]))
                 for i in range(n)]
            _tilfoej(f'6.10b — {navne[lead]}', ULS,
                     f'{g_b:.2f}·G + 1.5·K_FI·Q₁ + Σ1.5·K_FI·ψ₀·Qᵢ',
                     g_b, q, ledende=lead, varighed=_ledende_varighed(lead))

    # ── Ulykke, tabel A1.3 ───────────────────────────────────────────────────
    # Ingen partialkoefficienter og intet K_FI: alt regnes med 1,0. Varigheden
    # er oejeblikkelig (EN 1995-1-1 tabel 3.1) uanset hvad der leder.
    if n == 0:
        _tilfoej('Ulykke', ALS_BRAND,  'G_k + A_d', 1.0, [], a=1.0,
                 varighed='instant')
        _tilfoej('Ulykke', ALS_OEVRIG, 'G_k + A_d', 1.0, [], a=1.0,
                 varighed='instant')
    else:
        for lead in range(n):
            q = [psi1[lead] if i == lead else psi2[i] for i in range(n)]
            _tilfoej(f'Brand — {navne[lead]}', ALS_BRAND,
                     'G_k + A_d + ψ₁·Q₁ + Σ ψ₂·Qᵢ',
                     1.0, q, a=1.0, ledende=lead, varighed='instant')
        _tilfoej('Øvrig ulykke', ALS_OEVRIG, 'G_k + A_d + Σ ψ₂·Qᵢ',
                 1.0, list(psi2), a=1.0, varighed='instant')

    # ── Anvendelse ───────────────────────────────────────────────────────────
    # Varigheden staar som None med vilje. k_mod hoerer til brudgraensen; i
    # anvendelsesgraensetilstanden er det k_def og opdelingen i permanent og
    # variabel, der afgoer noget, og et varighedsnavn her ville blive brugt.
    if n == 0:
        _tilfoej('Karakteristisk', SLS_KAR, 'G_k', 1.0, [])
        _tilfoej('Hyppig',         SLS_HYP, 'G_k', 1.0, [])
    else:
        for lead in range(n):
            q = [1.0 if i == lead else _psi0(kat[i], kat[lead])
                 for i in range(n)]
            _tilfoej(f'Karakteristisk — {navne[lead]}', SLS_KAR,
                     'G_k + Q_1 + Σ ψ_0·Q_i', 1.0, q, ledende=lead)
            q = [psi1[lead] if i == lead else psi2[i] for i in range(n)]
            _tilfoej(f'Hyppig — {navne[lead]}', SLS_HYP,
                     'G_k + ψ_1·Q_1 + Σ ψ_2·Q_i', 1.0, q, ledende=lead)
    _tilfoej('Kvasi-permanent', SLS_KVASI, 'G_k + Σ ψ_2·Q_i',
             1.0, list(psi2))

    return ud


def vaerdi(komb, G_k, Q_k, A_d=0.0):
    """E_d for én kombination fra kombinationssaet(): g·G_k + Σ q·Q_k + a·A_d."""
    return (komb['g'] * float(G_k)
            + sum(f * float(q) for f, q in zip(komb['q'], Q_k))
            + komb['a'] * float(A_d))


def load_combos(
    label:             str,
    unit:              str,
    G_k:               float,
    loads:             list,
    method:            str  = '6.10ab',
    G_fav:             bool = False,
    consequence_class: str  = 'CC2',
    A_d:               float = 0.0,   # valgfri ulykkeslast; 0 ved brand
    accidental_type:   str  = 'none',   # 'none' | 'fire' | 'other'
) -> tuple:
    """
    Returns (blocks, exports).

    exports contains:
      E_d_uls, E_d_acc (naar accidental_type != 'none'), E_d_sls_char,
      E_d_sls_freq, E_d_sls_qp,
      governing_duration, unit, K_FI, consequence_class
    """
    blocks = []
    n   = len(loads)
    KFI = K_FI_MAP.get(consequence_class.upper(), 1.0)

    psi1 = [PSI_DK.get(l['category'].upper(), _DEFAULT_PSI)[1] for l in loads]
    psi2 = [PSI_DK.get(l['category'].upper(), _DEFAULT_PSI)[2] for l in loads]
    Q    = [l['Q_k'] for l in loads]

    # Subtitle: method + consequence class
    method_str  = "6.10a / 6.10b" if method == '6.10ab' else "Eq. 6.10"
    blocks.append(MH(
        f"{label} — Load Combinations",
        f"EN 1990 DK NA:2019  ·  {method_str}  ·  {consequence_class}  (K_FI = {KFI:.1f})",
        "general",
    ))

    # ── Characteristic actions table ───────────────────────────────────────────
    blocks.append(S("Karakteristiske laster"))
    psi0_base = [PSI_DK.get(l['category'].upper(), _DEFAULT_PSI)[0] for l in loads]
    has_ctx   = any(l['category'].upper() in ('S', 'W') for l in loads)

    rows = [['G_k  (permanent)', '—', f'{G_k:.3g}', '—', '—', '—']]
    for i, l in enumerate(loads):
        c = l['category'].upper()
        p0_str = f'{psi0_base[i]:.2f}*' if c in ('S', 'W') else f'{psi0_base[i]:.2f}'
        rows.append([l['label'], c, f"{Q[i]:.3g}", p0_str,
                     f"{psi1[i]:.2f}", f"{psi2[i]:.2f}"])
    if A_d > 0:
        rows.append([f'A_d  ({accidental_type})', '—', f'{A_d:.3g}', '—', '—', '—'])

    blocks.append(TBL(['Last', 'Kat.', f'Q_k  ({unit})', 'ψ₀', 'ψ₁', 'ψ₂'], rows))

    if has_ctx:
        blocks.append(N(
            "* Snow (S) ψ₀: 0.6 when lead is Cat. E/T, 0.0 when lead is Wind, 0.3 otherwise.  "
            "Wind (W) ψ₀: 0.6 when lead is Cat. E, 0.3 otherwise.  (Table A1.1 DK NA)"
        ))

    # ── ULS ───────────────────────────────────────────────────────────────────
    blocks.append(S("Brudgrænsetilstand — STR/GEO  (tabel A1.2(B+C) DK NA)"))

    # Kombinationerne dannes ét sted -- som faktorer -- og tallene her er
    # hvad de giver. Regnede tabellen og eftervisningen hver sit sted, kunne
    # de vise to forskellige ting, og begge ville se rigtige ud.
    _saet = kombinationssaet(loads, method, G_fav, consequence_class)

    def _raekker(situation):
        return [(k['navn'], k['formel'], vaerdi(k, G_k, Q, A_d), k['ledende'])
                for k in _saet if k['situation'] == situation]

    uls_vals: list[tuple] = _raekker(ULS)   # (name, formula, value, lead_idx)

    for name, formula, val, _ in uls_vals:
        blocks.append(CALC_ROW(name, formula, f"{val:.3f}  {unit}"))

    gov_entry = max(uls_vals, key=lambda x: x[2])
    E_d_uls   = gov_entry[2]
    gov_lead  = gov_entry[3]

    governing_duration = (
        'permanent' if (gov_lead < 0 or not loads)
        else _DURATION_MAP.get(loads[gov_lead]['category'].upper(), 'medium')
    )

    blocks.append(CALC_ROW("E_d,ULS", "= største af ovenstående", f"{E_d_uls:.3f}  {unit}"))

    if loads and gov_lead >= 0:
        gov_lbl = loads[gov_lead]['label']
        gov_cat = loads[gov_lead]['category'].upper()
        blocks.append(N(
            f"Dimensionsgivende: {gov_entry[0]} — dominerende last er {gov_lbl} "
            f"(kategori {gov_cat}) → lastvarighed: "
            f"{_VARIGHED_DK.get(governing_duration, governing_duration)}"
        ))
    else:
        blocks.append(N("Dimensionsgivende: 6.10a (kun permanent last) → lastvarighed: permanent"))

    # ── Ulykke — 6.11a/b ──────────────────────────────────────────────────────
    # Begge ulykkessituationer regnes ALTID. De koster ingenting: lasterne er
    # de samme som ovenfor, og psi-tabellen er allerede slaaet op. Foer var det
    # et tilvalg, og saa staar der "ikke eftervist" i et dokument, hvor tallet
    # bare aldrig blev regnet -- det er ikke til at skelne fra en forglemmelse.
    # SLS-kombinationerne regnes heller ikke efter tilvalg.
    #
    # Valget i blokken afgoer nu kun HVILKEN situation der eksporteres til
    # eftervisningerne, altsaa hvad man dimensionerer for. Tallene staar der
    # uanset hvad.
    #
    # DK NA tabel A1.3: ingen partialkoefficienter og intet K_FI -- alt regnes
    # med 1,0. Brand tager psi_1 paa den dominerende last, oevrig ulykke tager
    # psi_2 paa alle.
    _brand  = _raekker(ALS_BRAND)
    _oevrig = _raekker(ALS_OEVRIG)

    E_d_brand  = max(v[2] for v in _brand)
    E_d_oevrig = max(v[2] for v in _oevrig)

    blocks.append(S("Ulykke — formel 6.11a/b (DK NA tabel A1.3)"))
    for navn, formel, val, _ in _brand + _oevrig:
        blocks.append(CALC_ROW(navn, formel, f"{val:.3f}  {unit}"))

    if accidental_type in ('fire', 'other'):
        E_d_acc = E_d_brand if accidental_type == 'fire' else E_d_oevrig
        _valgt = "brand" if accidental_type == 'fire' else "øvrig ulykke"
        blocks.append(CALC_ROW("E_d,ulykke", f"= {_valgt} (valgt)",
                               f"{E_d_acc:.3f}  {unit}"))
        blocks.append(N(
            f"Der dimensioneres for {_valgt}. Alle laster regnes med 1,0 — "
            "tabel A1.3 har hverken partialkoefficienter eller K_FI — og "
            "materialesiden følger med: γ_M = 1,0 (anneks F, punkt 10) og "
            "øjeblikkelig lastvarighed (EN 1995-1-1 tabel 3.1)."
            + (" A_d er nul ved brand: branden virker gennem det reducerede "
               "tværsnit, ikke som en ydre kraft." if accidental_type == 'fire'
               and A_d == 0 else "")))
    else:
        E_d_acc = None
        blocks.append(N(
            "Tallene ovenfor er regnet, men der dimensioneres ikke for en "
            "ulykke: situationen står på vedvarende. Vælg brand eller øvrig "
            "ulykke i blokken, hvis eftervisningerne skal bruge dem — så "
            "følger γ_M = 1,0 og øjeblikkelig lastvarighed med af sig selv."))

    # ── SLS ───────────────────────────────────────────────────────────────────
    blocks.append(S("Anvendelsesgrænsetilstand"))

    E_d_sls_char = max(v[2] for v in _raekker(SLS_KAR))
    E_d_sls_freq = max(v[2] for v in _raekker(SLS_HYP))
    E_d_sls_qp   = max(v[2] for v in _raekker(SLS_KVASI))

    blocks.append(CALC_ROW("Karakteristisk",    "G_k + Q_1 + Σ ψ_0·Q_i",      f"{E_d_sls_char:.3f}  {unit}"))
    blocks.append(CALC_ROW("Hyppig",            "G_k + ψ_1·Q_1 + Σ ψ_2·Q_i",  f"{E_d_sls_freq:.3f}  {unit}"))
    blocks.append(CALC_ROW("Kvasi-permanent",   "G_k + Σ ψ_2·Q_i",            f"{E_d_sls_qp:.3f}   {unit}"))

    # ── Summary ───────────────────────────────────────────────────────────────
    blocks.append(S("Sammenfatning"))
    summary_rows = [
        ['Brudgrænse (dimensionsgivende)', f'{E_d_uls:.3f}', unit],
    ]
    summary_rows.append([
        'Ulykke — brand' + ('  (valgt)' if accidental_type == 'fire' else ''),
        f'{E_d_brand:.3f}', unit,
    ])
    summary_rows.append([
        'Ulykke — øvrig' + ('  (valgt)' if accidental_type == 'other' else ''),
        f'{E_d_oevrig:.3f}', unit,
    ])
    summary_rows += [
        ['Anvendelse — karakteristisk',  f'{E_d_sls_char:.3f}', unit],
        ['Anvendelse — hyppig',          f'{E_d_sls_freq:.3f}', unit],
        ['Anvendelse — kvasi-permanent', f'{E_d_sls_qp:.3f}',  unit],
    ]
    blocks.append(TBL(['Dimensioneringssituation', 'E_d', 'Enhed'], summary_rows))

    # Export every individual ULS combination with its load-duration class.
    # Timber checks must find the governing combination by comparing E_d / k_mod,
    # NOT simply by maximum E_d — a smaller load with lower k_mod often governs.
    uls_combinations = []
    for name, formula, val, lead_idx in uls_vals:
        dur = (
            'permanent' if (lead_idx < 0 or not loads)
            else _DURATION_MAP.get(loads[lead_idx]['category'].upper(), 'medium')
        )
        uls_combinations.append({
            'name':     name,
            'E_d':      round(val, 4),
            'duration': dur,
        })

    exports = {
        # Saa en eftervisningsblok kan saette gamma_M = 1,0 af sig selv i
        # stedet for at brugeren skal vide det.
        'accidental_type':    accidental_type,
        'design_situation':   'accidental' if accidental_type in ('fire', 'other')
                              else 'persistent',
        'E_d_brand':          round(E_d_brand,     4),
        'E_d_oevrig':         round(E_d_oevrig,    4),
        'E_d_uls':            round(E_d_uls,       4),
        # Opdelingen i permanent og variabel. Den skal med, fordi krybningen
        # efter EN 1995-1-1 §2.2.3(5) holder de to dele hver for sig: den
        # permanente kryber fuldt, den variable kun med sin kvasi-permanente
        # andel. Uden opdelingen sprang traebjaelken hele nedboejningsafsnittet
        # over og skrev at den ikke fulgte med -- men den staar jo i tabellen
        # over karakteristiske laster to afsnit laengere oppe.
        'G_k':                round(float(G_k), 4),
        # psi_2 for den dominerende variable last. Den skal med, fordi
        # krybningen efter EN 1995-1-1 §2.2.3(5) ganger den variable dels
        # nedboejning med (1 + psi_2*k_def). Uden den maatte en eftervisning
        # gaette paa 0,0 og faa en for lille langtidsnedboejning.
        'psi_2':              round(float(psi2[0]) if psi2 else 0.0, 3),
        'Q_k_sum':            round(float(sum(Q)), 4),
        'E_d_sls_char':       round(E_d_sls_char,  4),
        'E_d_sls_freq':       round(E_d_sls_freq,  4),
        'E_d_sls_qp':         round(E_d_sls_qp,   4),
        # Er situationen en ulykke, er lasten oejeblikkelig (EN 1995-1-1
        # tabel 3.1), og en traeeftervisning skal bruge den varighed og ikke
        # den normale kombinations.
        'governing_duration': ('instant'
                               if accidental_type in ('fire', 'other')
                               else governing_duration),
        'uls_combinations':   uls_combinations,   # all combos + durations for timber
        'unit':               unit,
        'K_FI':               KFI,
        'consequence_class':  consequence_class.upper(),
    }
    if E_d_acc is not None:
        exports['E_d_acc'] = round(E_d_acc, 4)

    return blocks, exports
