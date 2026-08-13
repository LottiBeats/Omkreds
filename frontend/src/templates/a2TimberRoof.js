/**
 * a2TimberRoof.js — A2 content for a collar-beam roof (hanebåndsramme)
 *
 * Symmetric saddle roof · 6 m span · 2 m rise (alpha = 33.7 deg) · collar at 1.2 m.
 * Emits the whole chain in the order it must be run: dead load, snow and wind
 * per EN 1991-1-3/4, load combinations per EN 1990, a FEM envelope, and the
 * EN 1995-1-1 member checks fed from it.
 *
 * Lifted out of EditorPage.jsx unchanged so a project type can reference it
 * without importing the editor.
 */

// ── A2: Timber collar-beam roof (hanebåndsramme) ─────────────────────────────
// Symmetric saddle roof · 6 m span · 2 m rise (α = 33.7°) · hanebånd at 1.2 m
// Full documentation: EN 1991-1-3/4 loads · FEM envelope · EN 1995-1-1 checks
export function makeTimberRoofTemplate() {
  const base = Date.now()
  let n = 0
  const nid = () => base + n++

  const ids = {
    h1:           nid(),
    intro:        nid(),
    hLoads:       nid(),
    hDead:        nid(),   deadBlock:  nid(),
    hSnow:        nid(),   snowBlock:  nid(),
    hWind:        nid(),   windBlock:  nid(),   txtWind:  nid(),
    hCombos:      nid(),   loadCases:  nid(),
    hTimberCombos: nid(),  timberCases: nid(),
    hFem:         nid(),   fem:        nid(),
    hChecks:        nid(),
    hSpærVenstre:   nid(),   txtSpærNote: nid(),   chkSpærV: nid(),
    hSpærHøjre:     nid(),                          chkSpærH: nid(),
    hHane:          nid(),   chkHane:    nid(),
    hConclusion:    nid(),   conclusion: nid(),
  }

  // ── Sections ────────────────────────────────────────────────────────────
  //
  // Given as a *reference*, not as numbers. The backend derives E, A and I from
  // it — 45x145 C24 resolves to A = 65.25 cm², Iz = 1143 cm⁴, E₀,mean = 11.04
  // GPa, the values this template used to carry by hand — and the member check
  // generated from an element inherits the same reference. Elements that only
  // carry raw stiffness have no material, so "Opret eftervisning" fell back to
  // the steel template: a C24 roof came out of A2 with two IPE300 checks to
  // EN 1993-1-1, importing the timber members' actions.
  const SPAER    = { material: 'timber', section: '45x145', grade: 'C24' }
  const HANEBAND = { material: 'timber', section: '45x95',  grade: 'C24' }

  // ── Geometry ────────────────────────────────────────────────────────────
  // α = arctan(2/3) = 33.69°  cos α = 0.832  sin α = 0.555
  // Elem 1: (0,0)→(1.8,1.2)  L = √(1.8²+1.2²) = 2.163 m  (nedre venstre)
  // Elem 2: (1.8,1.2)→(3,2)  L = √(1.2²+0.8²) = 1.442 m  (øvre venstre)
  // Elem 3: (3,2)→(4.2,1.2)  L = 1.442 m                  (øvre højre)
  // Elem 4: (4.2,1.2)→(6,0)  L = 2.163 m                  (nedre højre)
  // Elem 5: (1.8,1.2)→(4.2,1.2) L = 2.400 m               (hanebånd)

  // ── Loads (derived below) ────────────────────────────────────────────────
  // g_k = 0.90 kN/m  (pr. spær, vandret projektion)
  // s   = 0.63 kN/m  (pr. spær, vandret projektion, μ₁ = 0.70, s_k = 0.90 kN/m²)
  // W+  = +0.31 kN/m ⊥  (vindtryk på venstre spær,  c_net = +0.47)
  // W−  = −0.20 kN/m ⊥  (vindsug  på højre spær,    c_net = −0.30)

  return [

    // ═══════════════════════════════════════════════════════════════════════
    { id: ids.h1, type: 'heading', data: { level: 1,
      text: 'A2 — Tagkonstruktion: Hanebåndsramme 6,0 m' } },

    { id: ids.intro, type: 'text', data: { text:
      'Statisk system:  Symmetrisk hanebåndsramme (saddeltag)\n' +
      'Spænd:           L = 6,0 m   ·   Tværafstand: a = 1,0 m\n' +
      'Rejsning:        h = 2,0 m   →   Taghældning: α = arctan(2/3) = 33,7°\n' +
      'Hanebånd:        h_h = 1,2 m over murplade (60 % af rejsning)\n' +
      'Profiler:        Spær 45×145 C24   ·   Hanebånd 45×95 C24\n' +
      'Serviceklasse:   SK2 — ventileret konstruktion, udsat for vejr (DS/EN 1995-1-1)\n' +
      'Konsekvensklasse: CC2   KFI = 1,0\n\n' +
      'Beregningsgang:\n' +
      '  1. Lastgrundlag — egenlast, snelast (EN 1991-1-3 DK NA), vindlast (EN 1991-1-4 DK NA)\n' +
      '  2. Lastkombinationer — EN 1990 lign. 6.10a/b (CC2)\n' +
      '  3. FEM-analyse — alle kombinationer enveloperes\n' +
      '  4. Kapacitetskontrol — alle spær + hanebånd (EN 1995-1-1)' } },

    // ═══════════════════════════════════════════════════════════════════════
    { id: ids.hLoads, type: 'heading', data: { level: 2, text: '1. Lastgrundlag' } },

    // ── Dead load ─────────────────────────────────────────────────────────
    { id: ids.hDead, type: 'heading', data: { level: 3, text: '1.1 Egenlast (G)' } },
    { id: ids.deadBlock, type: 'roof_dead_load', data: {
      title:     'Egenlast — tagopbygning + spær',
      label:     'G1',
      alpha_deg: 33.69,
      a_m:       1.0,
      layers: [
        { description: 'Tegltagsten (monier)',        g_kNm2: 0.55 },
        { description: 'Lægte + kontralägte (38 mm)', g_kNm2: 0.04 },
        { description: 'Undertag (vindspærrepap)',     g_kNm2: 0.03 },
        { description: 'Krydsfinérsarking 12 mm',     g_kNm2: 0.07 },
        { description: 'Isolering 200 mm (glasuld)',   g_kNm2: 0.04 },
        { description: 'Dampspærre',                  g_kNm2: 0.01 },
      ],
      b_mm: 45, h_mm: 145, rho_kgm3: 380,
      _result: null,
    }},

    // ── Snow load ─────────────────────────────────────────────────────────
    { id: ids.hSnow, type: 'heading', data: { level: 3, text: '1.2 Snelast (S) — DS/EN 1991-1-3 DK NA' } },
    { id: ids.snowBlock, type: 'snow_load', data: {
      title:         'Snelast — saddeltag 33,7°',
      label:         'SN1',
      roof_type:     'pitched',
      alpha_deg:     33.69,
      s_k_kNm2:      0.9,
      dk_zone:       '1',
      C_e:           1.0,
      C_t:           1.0,
      roof_span_m:   6.0,
      eave_height_m: 0.0,
      gamma_s:       1.5,
      a_m:           1.0,
      _result:       null,
    }},

    // ── Wind load ─────────────────────────────────────────────────────────
    { id: ids.hWind, type: 'heading', data: { level: 3, text: '1.3 Vindlast (W) — DS/EN 1991-1-4 DK NA' } },
    { id: ids.windBlock, type: 'wind_load', data: {
      title:          'Vindlast — referencetryk',
      label:          'W1',
      terrain_category: 'II',
      v_b0_ms:        24.0,
      z_ref_m:        5.0,
      h_m:            5.0,
      b_m:            6.0,
      d_m:            8.0,
      c_dir:          1.0,
      c_season:       1.0,
      c_pe_windward:  0.27,
      c_pe_leeward:   -0.50,
      c_pi:           0.20,
      rho_air:        1.25,
      _result:        null,
    }},
    { id: ids.txtWind, type: 'text', data: { text:
      'Terrænkategori II · Vindzone 2 · v_b,0 = 24 m/s · z_ref = 5,0 m\n\n' +
      'Beregnet peakhastighedstryk: q_p ≈ 0,65 kN/m²  (fra vindlastblok ovenfor)\n\n' +
      'Formfaktorer for saddeltag α = 33,7° (DS/EN 1991-1-4 Tabel 7.4a, θ = 0°):\n' +
      '  Vindsiden (zone H):   c_pe = +0,27  (interpoleret 30°→45°: 0,20→0,50)\n' +
      '  Læsiden  (zone I):    c_pe = −0,50\n' +
      '  Indvendig overtryk:   c_pi = +0,20  (mest ugunstig for netto vindtryk)\n\n' +
      'Netto vindtryk pr. spær a = 1,0 m (vinkelret på tagflade):\n' +
      '  Vindside (venstre):  w₊ = (c_pe + c_pi) × q_p × a = (0,27 + 0,20) × 0,65 × 1,0 = +0,31 kN/m\n' +
      '  Læside  (højre):     w₋ = (c_pe + c_pi) × q_p × a = (−0,50 + 0,20) × 0,65 × 1,0 = −0,20 kN/m\n\n' +
      'Fortegn: positiv w = tryk MOD overfladen · negativ w = sug FRA overfladen\n' +
      'Belastningen appliceres vinkelret på spærfladen (direction = perpendicular).' } },

    // ── Load combinations ─────────────────────────────────────────────────
    { id: ids.hCombos, type: 'heading', data: { level: 3, text: '1.4 Lastkombinationer — DS/EN 1990 DK NA lign. 6.10a/b (CC2)' } },
    { id: ids.loadCases, type: 'frame_load_cases', data: {
      title: 'Lastkombinationer — Hanebåndsramme (G+S+W)',
      consequence_class: 'CC2',
      method: '6.10ab',
      cases: [
        // G — egenlast: spær (vandret projektion) + hanebånd egenvægt (lodret)
        // g_hane = 0.045 × 0.095 × 380 × 9.81/1000 = 0.016 kN/m (vertikal, elem 5)
        { id: 'G', type: 'permanent', loads: [
          { load_type: 'udl', member_id: 1, value_kNm: 0.90, direction: 'projected' },
          { load_type: 'udl', member_id: 2, value_kNm: 0.90, direction: 'projected' },
          { load_type: 'udl', elem_id: 5,   value_kNm: 0.016, direction: 'vertical' },
        ]},
        // S — snelast på vandret projektion (μ₁ = 0.70, s_k = 0.90 kN/m²)
        { id: 'S', type: 'snow', loads: [
          { load_type: 'udl', member_id: 1, value_kNm: 0.63, direction: 'projected' },
          { load_type: 'udl', member_id: 2, value_kNm: 0.63, direction: 'projected' },
        ]},
        // W — vind fra venstre, vinkelret på tagflade
        // Vindside (venstre spær, member 1): tryk +0.31 kN/m
        // Læside  (højre  spær, member 2): sug  −0.20 kN/m
        { id: 'W', type: 'wind', loads: [
          { load_type: 'udl', member_id: 1, value_kNm:  0.31, direction: 'perpendicular' },
          { load_type: 'udl', member_id: 2, value_kNm: -0.20, direction: 'perpendicular' },
        ]},
      ],
      _exports: null, _result: null,
    }},

    // ── Timber load combinations (G + S only — wind excluded) ────────────
    { id: ids.hTimberCombos, type: 'heading', data: { level: 3,
      text: '1.5 Lastkombinationer til trækontrol (G + S — vind udeladt)' } },
    { id: ids.timberCases, type: 'frame_load_cases', data: {
      title: 'Lastkombinationer til træ — G + S (DS/EN 1990 DK NA lign. 6.10a/b, CC2)',
      consequence_class: 'CC2',
      method: '6.10ab',
      cases: [
        { id: 'G', type: 'permanent', loads: [
          { load_type: 'udl', member_id: 1, value_kNm: 0.90,  direction: 'projected' },
          { load_type: 'udl', member_id: 2, value_kNm: 0.90,  direction: 'projected' },
          { load_type: 'udl', elem_id: 5,   value_kNm: 0.016, direction: 'vertical' },
        ]},
        { id: 'S', type: 'snow', loads: [
          { load_type: 'udl', member_id: 1, value_kNm: 0.63, direction: 'projected' },
          { load_type: 'udl', member_id: 2, value_kNm: 0.63, direction: 'projected' },
        ]},
      ],
      _exports: null, _result: null,
    }},

    // ═══════════════════════════════════════════════════════════════════════
    { id: ids.hFem, type: 'heading', data: { level: 2, text: '2. FEM-analyse' } },

    { id: ids.fem, type: 'general_frame_fem', data: {
      title: 'Hanebåndsramme — FEM (OpenSeesPy)',
      nodes: [
        { id: 1, x: 0.0, y: 0.0 },
        { id: 2, x: 6.0, y: 0.0 },
        { id: 3, x: 1.8, y: 1.2 },
        { id: 4, x: 4.2, y: 1.2 },
        { id: 5, x: 3.0, y: 2.0 },
        { id: 6, x: 3.0, y: 2.0 },
      ],
      elements: [
        { id: 1, ni: 1, nj: 3, type: 'beam', release: 'none', member_id: 1, ...SPAER },
        { id: 2, ni: 3, nj: 5, type: 'beam', release: 'none', member_id: 1, ...SPAER },
        { id: 3, ni: 6, nj: 4, type: 'beam', release: 'none', member_id: 2, ...SPAER },
        { id: 4, ni: 4, nj: 2, type: 'beam', release: 'none', member_id: 2, ...SPAER },
        { id: 5, ni: 3, nj: 4, type: 'beam', release: 'both',               ...HANEBAND },
      ],
      equal_dofs: [{ r_node: 5, c_node: 6, dofs: [1, 2] }],
      supports: [
        { node_id: 1, ux: true,  uy: true,  rz: false },
        { node_id: 2, ux: false, uy: true,  rz: false },
      ],
      loads: [],
      load_mode: 'load_cases',
      load_cases_block_id: ids.timberCases,
      _figs_b64: null, _summary: null, _result: null, _exports: null,
    }},

    // ═══════════════════════════════════════════════════════════════════════
    { id: ids.hChecks, type: 'heading', data: { level: 2,
      text: '3. Kapacitetskontrol (DS/EN 1995-1-1)' } },

    // ── Venstre spær — member 1 (elem 1 + 2, samlet) ─────────────────────
    { id: ids.hSpærVenstre, type: 'heading', data: { level: 3,
      text: 'Venstre spær — 45×145 C24 (member 1: elem 1+2, L_total = 3,61 m)' } },
    { id: ids.txtSpærNote, type: 'text', data: { text:
      'Spæret er i FEM-modellen opdelt i to elementer ved hanebåndssamlingen (node 3):\n' +
      '  Nedre del: elem 1 — L₁ = 2,163 m  (murplade → hanebåndssamling)\n' +
      '  Øvre del:  elem 2 — L₂ = 1,442 m  (hanebåndssamling → rygning)\n\n' +
      'Checket anvender member-niveau snitkræfter (id = 1001) — worst-case M/V/N\n' +
      'på tværs af begge elementer i memberen.\n\n' +
      'Effektiv knæklængde for sideudknækning (LTB):\n' +
      '  Lateral afstivning ved: murplade (node 1), hanebåndssamling (node 3) og rygning (node 5)\n' +
      '  Længste uafstivede del: L_ef = L₁ = 2,163 m (nedre del — dimensionerende for LTB)\n' +
      '  "span_m" er sat til 2,163 m da denne er bestemmende for sideudknækning.' } },
    { id: ids.chkSpærV, type: 'timber_beam', data: {
      title: 'Venstre spær 45×145 C24 — member 1 (worst-case M/V/N)', label: 'S1',
      span_m: 2.163, b_mm: 45, h_mm: 145,
      timber_grade: 'C24', service_class: 2, load_duration: 'short', gamma_M: 1.3,
      load_source: 'fem', fem_block_id: ids.fem, fem_elem_id: 1001, fem_end: 'max',
      compression_edge_restrained: false, torsional_restraint_at_supports: true,
      _result: null,
    }},

    // ── Højre spær — member 2 (elem 3 + 4, samlet) ───────────────────────
    { id: ids.hSpærHøjre, type: 'heading', data: { level: 3,
      text: 'Højre spær — 45×145 C24 (member 2: elem 3+4, L_total = 3,61 m)' } },
    { id: ids.chkSpærH, type: 'timber_beam', data: {
      title: 'Højre spær 45×145 C24 — member 2 (worst-case M/V/N)', label: 'S2',
      span_m: 2.163, b_mm: 45, h_mm: 145,
      timber_grade: 'C24', service_class: 2, load_duration: 'short', gamma_M: 1.3,
      load_source: 'fem', fem_block_id: ids.fem, fem_elem_id: 1002, fem_end: 'max',
      compression_edge_restrained: false, torsional_restraint_at_supports: true,
      _result: null,
    }},

    // ── Hanebånd — trækcheck (elem 5) ────────────────────────────────────
    { id: ids.hHane, type: 'heading', data: { level: 3,
      text: 'Hanebånd — 45×95 C24 (elem 5, L = 2,40 m) — Trækcheck EN 1995-1-1 §6.1.2' } },
    { id: ids.chkHane, type: 'custom_calc', data: {
      title: 'Hanebånd 45×95 C24 — Trækcheck',
      items: [
        { type: 'section', text: 'Materialeparametre — C24 (DS/EN 338)' },
        { type: 'variable', symbol: 'f_{t,0,k}',  expression: '14',  unit: 'MPa', description: 'Karakteristisk trækstyrke C24' },
        { type: 'variable', symbol: '\\gamma_M',   expression: '1.3', unit: '—',  description: 'Partialkoefficient træ (KK2)' },
        { type: 'variable', symbol: 'k_{mod}',     expression: '0.9', unit: '—',  description: 'Modifikationsfaktor (SK2, kortvarig last — sne)' },
        { type: 'formula',  symbol: 'f_{t,0,d}',   expression: 'k_mod * f_t0k / gamma_M', variables: { k_mod: 0.9, f_t0k: 14, gamma_M: 1.3 }, unit: 'MPa', description: 'Dimensionerende trækstyrke' },
        { type: 'section', text: 'Tværsnit' },
        { type: 'variable', symbol: 'b',   expression: '45',  unit: 'mm', description: 'Bredde' },
        { type: 'variable', symbol: 'h',   expression: '95',  unit: 'mm', description: 'Højde' },
        { type: 'formula',  symbol: 'A',   expression: 'b * h', variables: { b: 45, h: 95 }, unit: 'mm²', description: 'Nettoareal (ingen udsparinger antaget)' },
        { type: 'section', text: 'Kapacitet' },
        { type: 'formula',  symbol: 'N_{t,Rd}', expression: 'f_t0d * A / 1000', variables: { f_t0d: 0.9*14/1.3, A: 45*95 }, unit: 'kN', description: 'Dimensionerende trækkapacitet' },
        { type: 'section', text: 'Påvirkning — aflæses fra FEM (element 5)' },
        { type: 'variable', symbol: 'N_{Ed}', expression: '0', unit: 'kN', description: 'Dimensionerende trækraft — OPDATER fra FEM-resultat (element 5, N_i/N_j)' },
        { type: 'check',    symbol: '\\eta_t', expression: 'N_Ed / N_t_Rd', variables: { N_Ed: 0, N_t_Rd: 0.9*14/1.3*45*95/1000 }, limit: 1.0, description: 'Udnyttelsesgrad trækcheck §6.1.2' },
      ],
      _result: null,
    }},

    // ═══════════════════════════════════════════════════════════════════════
    { id: ids.hConclusion, type: 'heading', data: { level: 2, text: '4. Konklusion' } },
    { id: ids.conclusion, type: 'text', data: { text:
      '[Udfyld udnyttelsesgrader efter kørsel af alle blokke]\n\n' +
      'Lastkombinationer (kør "Frame Load Cases" blokken):\n' +
      '  Kombinationer genereret iht. EN 1990 lign. 6.10a/b · CC2 · KFI = 1,0\n\n' +
      'FEM-analyse (kør "General Frame FEM" blokken):\n' +
      '  Alle kombinationer enveloperet · Snitkræfter M/V/N pr. element\n\n' +
      'Kapacitetskontrol:\n' +
      '  S1 — Venstre spær (member 1, L_ef=2,16 m, worst-case M/V/N):  η = … %   ✓/✗\n' +
      '  S2 — Højre spær   (member 2, L_ef=2,16 m, worst-case M/V/N):  η = … %   ✓/✗\n' +
      '  H1 — Hanebånd (elem 5, L=2,40 m): N_Ed = … kN  ≤  N_Rd = 41,4 kN   ✓/✗\n\n' +
      'Bemærkninger:\n' +
      '  • Hvert spær udgøres af 2 FEM-elementer (nedre + øvre) — checket bruger member-niveau worst-case\n' +
      '  • Effektiv LTB-længde = 2,163 m (nedre del — bestemmende afstivningsafstand)\n' +
      '  • Vindlast beregnet for vind fra venstre (W+/W−) — symmetrisk ved modsat vind\n' +
      '  • Samlinger (murplade, hanebåndssamling, rygningstappe) er ikke kontrolleret' } },
  ]
}
