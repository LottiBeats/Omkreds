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

    uls_vals: list[tuple] = []   # (name, formula, value, lead_idx)

    if n == 0:
        if method == '6.10ab':
            gamma_G_a = 1.0 if G_fav else 1.2 * KFI
            uls_vals.append(("6.10a", f"{gamma_G_a:.2f} · G_k", gamma_G_a * G_k, -1))
        else:
            gamma_G_a = 1.0 if G_fav else 1.35 * KFI
            uls_vals.append(("6.10", f"{gamma_G_a:.2f} · G_k", gamma_G_a * G_k, -1))

    elif method == '6.10':
        gamma_G = 1.0 if G_fav else 1.35 * KFI
        gamma_Q = 1.50 * KFI
        for lead in range(n):
            others  = [i for i in range(n) if i != lead]
            lcat    = loads[lead]['category'].upper()
            p0_oth  = [_psi0(loads[i]['category'], lcat) for i in others]
            Ed = (gamma_G * G_k
                  + gamma_Q * Q[lead]
                  + sum(gamma_Q * p0_oth[j] * Q[others[j]] for j in range(len(others))))
            uls_vals.append((f"6.10 — {loads[lead]['label']}",
                             f"1.35·K_FI·G + 1.5·K_FI·Q₁ + Σ…", Ed, lead))

    else:  # 6.10a / 6.10b
        # 6.10a — permanent only (one row, regardless of number of variable loads)
        gamma_G_a = 1.0 if G_fav else 1.2 * KFI
        Ed_a = gamma_G_a * G_k
        uls_vals.append(("6.10a", f"{gamma_G_a:.2f} · G_k", Ed_a, -1))

        # 6.10b — one row per possible leading action
        gamma_G = 0.9 if G_fav else 1.0 * KFI
        gamma_Q = 1.5 * KFI
        for lead in range(n):
            others  = [i for i in range(n) if i != lead]
            lcat    = loads[lead]['category'].upper()
            p0_oth  = [_psi0(loads[i]['category'], lcat) for i in others]
            Ed_b = (gamma_G * G_k
                    + gamma_Q * Q[lead]
                    + sum(gamma_Q * p0_oth[j] * Q[others[j]] for j in range(len(others))))
            uls_vals.append((f"6.10b — {loads[lead]['label']}",
                             f"{gamma_G:.2f}·G + 1.5·K_FI·Q₁ + Σ1.5·K_FI·ψ₀·Qᵢ",
                             Ed_b, lead))

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
    def _ulykke(kind: str) -> list[tuple]:
        vals: list[tuple] = []
        if n == 0:
            vals.append(("Ulykke", "G_k + A_d", G_k + A_d, -1))
        elif kind == 'fire':
            for lead in range(n):
                others = [i for i in range(n) if i != lead]
                Ed = (G_k + A_d + psi1[lead] * Q[lead]
                      + sum(psi2[i] * Q[i] for i in others))
                vals.append((f"Brand — {loads[lead]['label']}",
                             "G_k + A_d + ψ₁·Q₁ + Σ ψ₂·Qᵢ", Ed, lead))
        else:
            Ed = G_k + A_d + sum(psi2[i] * Q[i] for i in range(n))
            vals.append(("Øvrig ulykke", "G_k + A_d + Σ ψ₂·Qᵢ", Ed, -1))
        return vals

    _brand  = _ulykke('fire')
    _oevrig = _ulykke('other')
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

    if n == 0:
        E_d_sls_char = E_d_sls_freq = G_k
    else:
        char_vals, freq_vals = [], []
        for lead in range(n):
            others  = [i for i in range(n) if i != lead]
            lcat    = loads[lead]['category'].upper()
            p0_oth  = [_psi0(loads[i]['category'], lcat) for i in others]
            char_vals.append(G_k + Q[lead]
                             + sum(p0_oth[j] * Q[others[j]] for j in range(len(others))))
            freq_vals.append(G_k + psi1[lead] * Q[lead]
                             + sum(psi2[i] * Q[i] for i in others))
        E_d_sls_char = max(char_vals)
        E_d_sls_freq = max(freq_vals)

    E_d_sls_qp = G_k + sum(psi2[i] * Q[i] for i in range(n))

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
