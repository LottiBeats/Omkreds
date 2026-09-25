/**
 * docTemplates.js — starting points per document (the "Start fra skabelon" menu).
 *
 * Each entry: { label, description, make(opts?, metadata?) → blocks[], needsOptions? }.
 * `needsOptions: 'a1'` means the template is generated from the project
 * description, and the editor asks for it before applying.
 *
 * Moved out of EditorPage unchanged; the block content is exactly as before.
 */
import { makeA1Template } from './a1.js'
import { makeB1Template } from './b1.js'
import { makeTimberRoofTemplate } from './a2TimberRoof.js'
import { makeB2Template } from './b2.js'

// ── Document templates ────────────────────────────────────────────────────────



// ── A2: Portal frame ──────────────────────────────────────────────────────────
function makePortalFrameTemplate() {
  let id = Date.now()
  return [
    { id: id++, type: 'heading', data: { level: 1, text: 'Portalstel — 2D FEM-analyse' } },

    { id: id++, type: 'heading', data: { level: 2, text: 'Forudsætninger' } },
    { id: id++, type: 'text', data: { text:
      'Statisk system: Portalstel med 2 søjler og 1 bjælke.\n' +
      'Profiler: IPE 240 (S235) — alle elementer\n' +
      'Spændvidde: L = 6,0 m   Søjlehøjde: h = 4,0 m\n' +
      'Understøtning: Begge søjlebaser indspændt (fixed)\n' +
      'Laster (karakteristiske):\n' +
      '  Nyttelast (UDL): q = 20 kN/m nedad på bjælke\n' +
      '  Vindlast (horisontal): H = 10 kN ved venstre søjletop' } },

    { id: id++, type: 'heading', data: { level: 2, text: 'FEM-model' } },
    {
      id: id++, type: 'portal_frame_fem', data: {
        title:         'Portalstel — IPE 240 S235',
        n_bays:        1,
        h_bay_m:       4.0,
        w_bay_m:       6.0,
        E_GPa:         210.0,
        A_cm2:         39.1,   // IPE 240
        Iz_cm4:        3892.0, // IPE 240
        rafter_loads:  [{ rafter_idx: 0, wy_kNm: -20.0 }],
        lateral_loads: [{ col_idx: 0, Fx_kN: 10.0 }],
        _figs_b64: null, _summary: null, _result: null,
      }
    },

    { id: id++, type: 'heading', data: { level: 2, text: 'Konklusion' } },
    { id: id++, type: 'text', data: { text: '[Indsæt konklusion med maks. moment, reaktioner og udnyttelsesgrad — udfyld efter kørsel af analysen ovenfor]' } },
  ]
}

// ── A2: Pratt truss ───────────────────────────────────────────────────────────
// Correct 4-panel Pratt truss: 10 nodes, 17 members (all truss).
// ── A2: Full portal frame workflow (combo → FEM → checks) ─────────────────────
// Block IDs are pre-assigned so FEM + capacity check blocks are linked out of the box.
function makeFullPortalFrameWorkflowTemplate() {
  const base = Date.now()
  let n = 0
  const nid = () => base + n++

  // Assign IDs up front so we can cross-reference them
  const ids = {
    h1:         nid(),
    intro:      nid(),
    hCombo:     nid(),
    combo:      nid(),   // ← load_combo block (label 'LC1')
    hFem:       nid(),
    fem:        nid(),   // ← general_frame_fem block
    hChecks:    nid(),
    hRafter:    nid(),
    chkRafter:  nid(),   // ← steel_beam: element 2 (rafter)
    hColLeft:   nid(),
    chkColLeft: nid(),   // ← steel_beam: element 1 (left column)
    hColRight:  nid(),
    chkColRight:nid(),   // ← steel_beam: element 3 (right column)
    hConclusion:nid(),
    conclusion: nid(),
  }

  return [
    // ── Title ──────────────────────────────────────────────────────────────
    { id: ids.h1, type: 'heading', data: { level: 1, text: 'Portalstel — Komplet rammeanalyse' } },
    { id: ids.intro, type: 'text', data: { text:
      'Statisk system: Portalstel · 1 fag · L = 6,0 m · h = 4,0 m\n' +
      'Profiler: Søjler IPE 240 S235  |  Rafter IPE 300 S235\n' +
      'Understøtning: Begge søjlebaser indspændt (fixed)\n\n' +
      'Beregningsgang:\n' +
      '  1. Lastkombination (EN 1990 lign. 6.10a/b) → designlast w_Ed\n' +
      '  2. FEM-analyse (OpenSeesPy) → snitkræfter og flytninger\n' +
      '  3. Kapacitetskontrol (EN 1993-1-1) → udnyttelsesgrad per element\n\n' +
      'Kør blokkene i rækkefølge: Lastkombination → FEM → Kapacitetskontrol' } },

    // ── Load combination ───────────────────────────────────────────────────
    { id: ids.hCombo, type: 'heading', data: { level: 2, text: '1. Lastkombination' } },
    { id: ids.combo, type: 'load_combo', data: {
      title:             'Lastkombinationer — Portalstel',
      label:             'LC1',
      unit:              'kN/m',
      G_k:               5.0,     // permanent: self-weight + cladding
      G_fav:             false,
      loads:             [
        { label: 'Nyttelast', Q_k: 3.0, category: 'B' },
      ],
      method:            '6.10ab',
      consequence_class: 'CC2',
      _result:           null,
      _exports:          null,
    }},

    // ── FEM model ──────────────────────────────────────────────────────────
    { id: ids.hFem, type: 'heading', data: { level: 2, text: '2. FEM-analyse' } },
    { id: ids.fem, type: 'general_frame_fem', data: {
      title:    'Portalstel — IPE 240/300 S235',
      nodes: [
        { id: 1, x: 0, y: 0 },   // left base
        { id: 2, x: 0, y: 4 },   // left eave
        { id: 3, x: 6, y: 4 },   // right eave
        { id: 4, x: 6, y: 0 },   // right base
      ],
      elements: [
        { id: 1, ni: 1, nj: 2, type: 'beam', release: 'none', member_id: 1, E_GPa: 210, A_cm2: 39.1, Iz_cm4: 3892 },  // IPE 240 venstre søjle
        { id: 2, ni: 2, nj: 3, type: 'beam', release: 'none', member_id: 2, E_GPa: 210, A_cm2: 53.8, Iz_cm4: 8356 },  // IPE 300 bjælke
        { id: 3, ni: 4, nj: 3, type: 'beam', release: 'none', member_id: 3, E_GPa: 210, A_cm2: 39.1, Iz_cm4: 3892 },  // IPE 240 højre søjle
      ],
      supports: [
        { node_id: 1, ux: true, uy: true, rz: true },
        { node_id: 4, ux: true, uy: true, rz: true },
      ],
      loads: [
        { type: 'combo_udl', elem_id: 2, combo_label: 'LC1' },          // design UDL on rafter from combo
        { type: 'nodal', node_id: 2, Fx_kN: 10, Fy_kN: 0, Mz_kNm: 0 }, // wind 10 kN at left eave
      ],
      _figs_b64: null, _summary: null, _result: null, _exports: null,
    }},

    // ── Capacity checks ────────────────────────────────────────────────────
    { id: ids.hChecks, type: 'heading', data: { level: 2, text: '3. Kapacitetskontrol (EN 1993-1-1)' } },

    // Rafter
    { id: ids.hRafter, type: 'heading', data: { level: 3, text: 'Rafter — IPE 300 S235 (element 2)' } },
    { id: ids.chkRafter, type: 'steel_beam', data: {
      title:             'Rafter IPE 300 — Bjælkecheck',
      label:             'B1',
      section:           'IPE300',
      grade:             'S235',
      span_m:            6.0,
      load_source:       'fem',
      fem_block_id:      ids.fem,   // ← pre-wired to the FEM block above
      fem_elem_id:       2,         // rafter element
      fem_end:           'max',
      load_type:         'udl',
      trib_width_m:      1.0,
      g_k_kNm:           5.0,
      q_k_kNm:           3.0,
      gamma_M0:          1.0,
      gamma_M1:          1.0,
      ltb_restrained:    false,
      buck_y_restrained: true,
      buck_x_restrained: true,
      deflection_limit:  200,
      _result:           null,
    }},

    // Left column
    { id: ids.hColLeft, type: 'heading', data: { level: 3, text: 'Venstre søjle — IPE 240 S235 (element 1)' } },
    { id: ids.chkColLeft, type: 'steel_beam', data: {
      title:             'Søjle IPE 240 — Bjælkecheck (venstre)',
      label:             'S1',
      section:           'IPE240',
      grade:             'S235',
      span_m:            4.0,
      load_source:       'fem',
      fem_block_id:      ids.fem,
      fem_elem_id:       1,         // left column element
      fem_end:           'max',
      load_type:         'udl',
      trib_width_m:      1.0,
      g_k_kNm:           5.0,
      q_k_kNm:           3.0,
      gamma_M0:          1.0,
      gamma_M1:          1.0,
      ltb_restrained:    true,
      buck_y_restrained: true,
      buck_x_restrained: false,
      deflection_limit:  200,
      _result:           null,
    }},

    // Right column
    { id: ids.hColRight, type: 'heading', data: { level: 3, text: 'Højre søjle — IPE 240 S235 (element 3)' } },
    { id: ids.chkColRight, type: 'steel_beam', data: {
      title:             'Søjle IPE 240 — Bjælkecheck (højre)',
      label:             'S2',
      section:           'IPE240',
      grade:             'S235',
      span_m:            4.0,
      load_source:       'fem',
      fem_block_id:      ids.fem,
      fem_elem_id:       3,         // right column element
      fem_end:           'max',
      load_type:         'udl',
      trib_width_m:      1.0,
      g_k_kNm:           5.0,
      q_k_kNm:           3.0,
      gamma_M0:          1.0,
      gamma_M1:          1.0,
      ltb_restrained:    true,
      buck_y_restrained: true,
      buck_x_restrained: false,
      deflection_limit:  200,
      _result:           null,
    }},

    // ── Conclusion ─────────────────────────────────────────────────────────
    { id: ids.hConclusion, type: 'heading', data: { level: 2, text: '4. Konklusion' } },
    { id: ids.conclusion, type: 'text', data: { text:
      '[Udfyld efter kørsel af alle blokke]\n\n' +
      'Rafter IPE 300:  Udnyttelsesgrad = … %  ✓/✗\n' +
      'Søjle IPE 240 (venstre):  Udnyttelsesgrad = … %  ✓/✗\n' +
      'Søjle IPE 240 (højre):  Udnyttelsesgrad = … %  ✓/✗\n\n' +
      'Bemærkning: Søjlerne er her kontrolleret for bøjning og forskydning (EN 1993-1-1 §6.2).\n' +
      'For kombineret tryk + bøjning (§6.3.3) bør en bjælke-søjle-kontrol udføres.' } },
  ]
}

// ── A2: General Frame FEM ─────────────────────────────────────────────────────
function makeGeneralFrameFemTemplate() {
  let id = Date.now()
  return [
    { id: id++, type: 'heading', data: { level: 1, text: 'Rammeanalyse — Generel 2D FEM' } },

    { id: id++, type: 'heading', data: { level: 2, text: 'Forudsætninger' } },
    { id: id++, type: 'text', data: { text:
      'Statisk system: Portalstel med 2 søjler og 1 bjælke.\n' +
      'Profiler: Søjler IPE 240 (S235), Bjælke IPE 300 (S235)\n' +
      'Spændvidde: L = 6,0 m   Søjlehøjde: h = 4,0 m\n' +
      'Understøtning: Begge søjlebaser indspændt\n' +
      'Laster: q = 20 kN/m nedad på bjælke  |  H = 10 kN vandret ved venstre søjletop' } },

    { id: id++, type: 'heading', data: { level: 2, text: 'FEM-model' } },
    {
      id: id++, type: 'general_frame_fem', data: {
        title: 'Portalstel — IPE 240/300 S235',
        nodes: [
          { id: 1, x: 0, y: 0 },
          { id: 2, x: 0, y: 4 },
          { id: 3, x: 6, y: 4 },
          { id: 4, x: 6, y: 0 },
        ],
        elements: [
          { id: 1, ni: 1, nj: 2, type: 'beam', release: 'none', member_id: 1, E_GPa: 210, A_cm2: 39.1,  Iz_cm4: 3892  },  // venstre søjle
          { id: 2, ni: 2, nj: 3, type: 'beam', release: 'none', member_id: 2, E_GPa: 210, A_cm2: 53.8,  Iz_cm4: 8356  },  // bjælke
          { id: 3, ni: 4, nj: 3, type: 'beam', release: 'none', member_id: 3, E_GPa: 210, A_cm2: 39.1,  Iz_cm4: 3892  },  // højre søjle
        ],
        supports: [
          { node_id: 1, ux: true, uy: true, rz: true },
          { node_id: 4, ux: true, uy: true, rz: true },
        ],
        loads: [
          { type: 'udl',   elem_ids: [2], wy_kNm: 20, wx_kNm: 0 },
          { type: 'nodal', node_id: 2, Fx_kN: 10, Fy_kN: 0, Mz_kNm: 0 },
        ],
        _figs_b64: null, _summary: null, _result: null,
      }
    },

    { id: id++, type: 'heading', data: { level: 2, text: 'Konklusion' } },
    { id: id++, type: 'text', data: { text: '[Indsæt konklusion med maks. moment, reaktioner og udnyttelsesgrad]' } },
  ]
}


// Statically determinate: m = 2n − 3  →  17 = 2×10 − 3  ✓
// Loads at top chord (purlin loads from roof).
// Supports at bottom chord ends.
// Diagonals all in tension under gravity (Pratt pattern).
function makePrattTrussTemplate() {
  let id = Date.now()
  return [
    { id: id++, type: 'heading', data: { level: 1, text: 'Pratt-fagvark — 2D FEM-analyse' } },

    { id: id++, type: 'heading', data: { level: 2, text: 'Forudsætninger' } },
    { id: id++, type: 'text', data: { text:
      'Statisk system: Pratt-fagvark, 4 felter, simpelt understøttet.\n' +
      'Spændvidde: L = 10,0 m   Konstruktionshøjde: h = 2,0 m\n' +
      'Profil (alle stænger): IPE 200 (S235)  E = 210 GPa  A = 28,5 cm²\n' +
      'Topkorde og bundkorde: 4 bjælker hver  |  Vertikaler: 5 (inkl. enderne)  |  Diagonaler: 4\n' +
      'Statisk bestemt: m = 2n − 3 = 17  ✓  (alle elementer er truss-type = leddet samling)\n' +
      'Understøtning: Venstre ende pin (N6), højre ende rulle (N10)\n' +
      'Laster (karakteristiske, fra spær/beklædning):\n' +
      '  Endepunkter N1, N5: P = 10 kN nedad   (halvt felt)\n' +
      '  Indre punkter N2, N3, N4: P = 20 kN nedad   (fuldt felt)\n' +
      '  Total last: 80 kN  →  reaktioner: 40 kN pr. understøtning' } },

    { id: id++, type: 'heading', data: { level: 2, text: 'FEM-model' } },
    {
      id: id++, type: 'frame_fem', data: {
        title: 'Pratt-fagvark 4-felt — IPE 200 S235',
        nodes: [
          // Top chord (y = 2 m) — lastpåføringspunkter fra tagbeklædning
          { id: 1,  x: 0.0,  y: 2.0 },  // top-left  (end)
          { id: 2,  x: 2.5,  y: 2.0 },  // top 1/4
          { id: 3,  x: 5.0,  y: 2.0 },  // top center
          { id: 4,  x: 7.5,  y: 2.0 },  // top 3/4
          { id: 5,  x: 10.0, y: 2.0 },  // top-right (end)
          // Bottom chord (y = 0 m) — understøttet i enderne
          { id: 6,  x: 0.0,  y: 0.0 },  // bottom-left  (PIN support)
          { id: 7,  x: 2.5,  y: 0.0 },  // bottom 1/4
          { id: 8,  x: 5.0,  y: 0.0 },  // bottom center
          { id: 9,  x: 7.5,  y: 0.0 },  // bottom 3/4
          { id: 10, x: 10.0, y: 0.0 },  // bottom-right (ROLLER support)
        ],
        elements: [
          // Top chord — truss (compression under gravity)
          { id: 1,  ni: 1,  nj: 2,  type: 'truss', E_GPa: 210, A_cm2: 28.5, I_cm4: 1943, preset: 'IPE 200 (S235)' },
          { id: 2,  ni: 2,  nj: 3,  type: 'truss', E_GPa: 210, A_cm2: 28.5, I_cm4: 1943, preset: 'IPE 200 (S235)' },
          { id: 3,  ni: 3,  nj: 4,  type: 'truss', E_GPa: 210, A_cm2: 28.5, I_cm4: 1943, preset: 'IPE 200 (S235)' },
          { id: 4,  ni: 4,  nj: 5,  type: 'truss', E_GPa: 210, A_cm2: 28.5, I_cm4: 1943, preset: 'IPE 200 (S235)' },
          // Bottom chord — truss (tension under gravity)
          { id: 5,  ni: 6,  nj: 7,  type: 'truss', E_GPa: 210, A_cm2: 28.5, I_cm4: 1943, preset: 'IPE 200 (S235)' },
          { id: 6,  ni: 7,  nj: 8,  type: 'truss', E_GPa: 210, A_cm2: 28.5, I_cm4: 1943, preset: 'IPE 200 (S235)' },
          { id: 7,  ni: 8,  nj: 9,  type: 'truss', E_GPa: 210, A_cm2: 28.5, I_cm4: 1943, preset: 'IPE 200 (S235)' },
          { id: 8,  ni: 9,  nj: 10, type: 'truss', E_GPa: 210, A_cm2: 28.5, I_cm4: 1943, preset: 'IPE 200 (S235)' },
          // Verticals — truss (compression under gravity; ends carry reaction only)
          { id: 9,  ni: 1,  nj: 6,  type: 'truss', E_GPa: 210, A_cm2: 28.5, I_cm4: 1943, preset: 'IPE 200 (S235)' },
          { id: 10, ni: 2,  nj: 7,  type: 'truss', E_GPa: 210, A_cm2: 28.5, I_cm4: 1943, preset: 'IPE 200 (S235)' },
          { id: 11, ni: 3,  nj: 8,  type: 'truss', E_GPa: 210, A_cm2: 28.5, I_cm4: 1943, preset: 'IPE 200 (S235)' },
          { id: 12, ni: 4,  nj: 9,  type: 'truss', E_GPa: 210, A_cm2: 28.5, I_cm4: 1943, preset: 'IPE 200 (S235)' },
          { id: 13, ni: 5,  nj: 10, type: 'truss', E_GPa: 210, A_cm2: 28.5, I_cm4: 1943, preset: 'IPE 200 (S235)' },
          // Diagonals — Pratt pattern (all in TENSION under gravity).
          // Left half: top outer → bottom inner  (╲ direction)
          { id: 14, ni: 1,  nj: 7,  type: 'truss', E_GPa: 210, A_cm2: 28.5, I_cm4: 1943, preset: 'IPE 200 (S235)' },
          { id: 15, ni: 2,  nj: 8,  type: 'truss', E_GPa: 210, A_cm2: 28.5, I_cm4: 1943, preset: 'IPE 200 (S235)' },
          // Right half: top outer → bottom inner  (╱ direction, symmetric)
          { id: 16, ni: 4,  nj: 8,  type: 'truss', E_GPa: 210, A_cm2: 28.5, I_cm4: 1943, preset: 'IPE 200 (S235)' },
          { id: 17, ni: 5,  nj: 9,  type: 'truss', E_GPa: 210, A_cm2: 28.5, I_cm4: 1943, preset: 'IPE 200 (S235)' },
        ],
        supports: [
          { node_id: 6,  ux: true,  uy: true,  rz: false },   // pin
          { node_id: 10, ux: false, uy: true,  rz: false },   // roller
        ],
        loads: [
          // Half-field load at end nodes, full-field load at interior nodes
          { type: 'nodal', node_id: 1,  Fx_kN: 0, Fy_kN: -10.0, Mz_kNm: 0 },
          { type: 'nodal', node_id: 2,  Fx_kN: 0, Fy_kN: -20.0, Mz_kNm: 0 },
          { type: 'nodal', node_id: 3,  Fx_kN: 0, Fy_kN: -20.0, Mz_kNm: 0 },
          { type: 'nodal', node_id: 4,  Fx_kN: 0, Fy_kN: -20.0, Mz_kNm: 0 },
          { type: 'nodal', node_id: 5,  Fx_kN: 0, Fy_kN: -10.0, Mz_kNm: 0 },
        ],
      }
    },

    { id: id++, type: 'heading', data: { level: 2, text: 'Konklusion' } },
    { id: id++, type: 'text', data: { text:
      'Pratt-fagvark 4-felt, statisk bestemt (m = 2n − 3 = 17).\n\n' +
      'Forventede resultater:\n' +
      '  Topkorde: Trykstænger (N < 0)  — maks. tryk i midterfeltet\n' +
      '  Bundkorde: Trækstænger (N > 0) — maks. træk i midterfeltet\n' +
      '  Diagonaler: Trækstænger (N > 0) — Pratt-princip\n' +
      '  Vertikaler: Trykstænger (N < 0) — bortset fra enderne\n\n' +
      '[Udfyld maks. stangkraft og kritisk stang efter kørsel af analysen]' } },
  ]
}

function makeA3Template() {
  let id = Date.now()
  return [
    { id: id++, type: 'heading', data: { level: 1, text: 'Konstruktionstegninger og modeller' } },

    { id: id++, type: 'heading', data: { level: 2, text: 'Tegneliste' } },
    { id: id++, type: 'text',    data: { text: 'Nedenstående tegninger indgår i det statiske projektmateriale.\n\nTegn.nr. | Emne                          | Mål   | Rev. | Dato\n---------|-------------------------------|-------|------|----------\n001      | Planer – etage 1              | 1:100 | A    | …\n002      | Snit A-A og B-B               | 1:50  | A    | …\n003      | Fundering – plan og detaljer  | 1:100 | A    | …\n004      | Bjælkeplaner                  | 1:100 | A    | …\n005      | Armeringsplaner – dæk         | 1:50  | A    | …\n006      | Detaljetegninger – samlinger  | 1:10  | A    | …' } },

    { id: id++, type: 'heading', data: { level: 2, text: 'Beregningsmodeller' } },
    { id: id++, type: 'text',    data: { text: 'Software og modeller anvendt i projekteringen:\n\nProgram       | Version | Formål              | Fil\n--------------|---------|---------------------|--------\nRevit         | 2024    | BIM-model           | …\nRFEM / Robot  | …       | FEM-analyse         | …\nOther         | …       | …                   | …' } },

    { id: id++, type: 'heading', data: { level: 2, text: 'Tegningsstatus' } },
    { id: id++, type: 'text',    data: { text: 'Tegningsstatus ved projektaflevering:\n□ Tegningerne er godkendt til udførelse\n□ Tegningerne er godkendt som bygget (A5)' } },
  ]
}

function makeA4Template() {
  let id = Date.now()
  return [
    { id: id++, type: 'heading', data: { level: 1, text: 'Konstruktionsændringer' } },

    { id: id++, type: 'text',    data: { text: 'Dette afsnit dokumenterer alle godkendte ændringer til det statiske projektmateriale efter første udgivelse. Ændringerne er nummeret fortløbende og beskriver baggrund, omfang og konsekvenser for de øvrige dokumenter.' } },

    { id: id++, type: 'heading', data: { level: 2, text: 'Ændringslog' } },
    { id: id++, type: 'text',    data: { text: 'Æ-nr. | Dato       | Beskrivelse                     | Årsag              | Godkendt af | Berørte dokumenter\n------|------------|---------------------------------|--------------------|-------------|-------------------\nÆ-01  | …          | Ændring af søjle S3 fra IPE300  | Ændret last        | …           | A2, A3/003\n      |            | til IPE360 pga. øget last       | fra bygherre       |             |\nÆ-02  | …          | …                               | …                  | …           | …' } },

    { id: id++, type: 'heading', data: { level: 2, text: 'Ændringsbeskrivelse' } },
    { id: id++, type: 'heading', data: { level: 3, text: 'Æ-01 — [Emne]' } },
    { id: id++, type: 'text',    data: { text: 'Dato: …\nBaggrund: …\nÆndringens omfang: …\nStatisk vurdering: …\nBerørte dokumenter opdateres med revision …\nGodkendt af: …' } },
  ]
}

function makeA5Template() {
  let id = Date.now()
  return [
    { id: id++, type: 'heading', data: { level: 1, text: 'Konstruktion som udført' } },

    { id: id++, type: 'text',    data: { text: 'Dette afsnit dokumenterer, at den udførte konstruktion er i overensstemmelse med det statiske projektmateriale (A1–A4), samt eventuelle afvigelser konstateret under udførelsen.' } },

    { id: id++, type: 'heading', data: { level: 2, text: 'Grundlag' } },
    { id: id++, type: 'text',    data: { text: 'Som udført-dokumentationen er baseret på:\n• Konstruktionstegninger rev. … (A3)\n• Ændringslog (A4)\n• Udførelseskontrol (B3)\n• Tilsynsnotater: …' } },

    { id: id++, type: 'heading', data: { level: 2, text: 'Afvigelser fra projektmaterialet' } },
    { id: id++, type: 'text',    data: { text: 'Nr. | Lokalitet         | Afvigelse                        | Statisk vurdering      | Reference\n----|-------------------|----------------------------------|------------------------|----------\n1   | …                 | …                                | Uden betydning / Æ-nr… | A4\n2   | …                 | …                                | …                      | …\n\nHvis ingen afvigelser: "Der er ikke konstateret afvigelser fra det statiske projektmateriale."' } },

    { id: id++, type: 'heading', data: { level: 2, text: 'Erklæring' } },
    { id: id++, type: 'text',    data: { text: 'Det erklæres hermed, at konstruktionen er udført i overensstemmelse med det statiske projektmateriale med de ovenfor anførte afvigelser, og at tegningsmaterialet er ajourført som udført.\n\nProjekterende:  ________________  Dato: ________\n\nUdførende:      ________________  Dato: ________' } },
  ]
}

function makeB3Template() {
  let id = Date.now()
  return [
    { id: id++, type: 'heading', data: { level: 1, text: 'Statisk kontrolrapport' } },

    { id: id++, type: 'text',    data: { text: 'Udarbejdet i henhold til DS 1140.\nKontrolplan reference: B2 · Projekt: …\nKontrolperiode: … til …' } },

    { id: id++, type: 'heading', data: { level: 2, text: 'Projekteringskontrol — rapportering' } },
    { id: id++, type: 'control_plan', data: {
      title: 'Projekteringskontrol',
      mode: 'report',
      items: [
        { pos: '1',  description: 'Konstruktionsgrundlag (A1) er gennemgået og godkendt', kk: 'KK1', control: 'E', responsible: '', reference: 'A1',    status: '', date: '', performed_by: '', remarks: '' },
        { pos: '2',  description: 'Gældende normer og nationale annekser er identificeret', kk: 'KK1', control: 'E', responsible: '', reference: 'A1',    status: '', date: '', performed_by: '', remarks: '' },
        { pos: '3',  description: 'Laster og lastkombinationer er korrekte', kk: 'KK1', control: 'E', responsible: '', reference: 'A2',    status: '', date: '', performed_by: '', remarks: '' },
        { pos: '4',  description: 'Geometriske mål og tværsnitsparametre er korrekte', kk: 'KK1', control: 'E', responsible: '', reference: 'A2, A3', status: '', date: '', performed_by: '', remarks: '' },
        { pos: '5',  description: 'Materialeparametre er korrekte og dokumenterede', kk: 'KK1', control: 'E', responsible: '', reference: 'A1, A2', status: '', date: '', performed_by: '', remarks: '' },
        { pos: '6',  description: 'Beregningsmodeller er repræsentative for den faktiske konstruktion', kk: 'KK2', control: 'E', responsible: '', reference: 'A2',    status: '', date: '', performed_by: '', remarks: '' },
        { pos: '7',  description: 'Brudgrænsetilstand (STR/GEO) er kontrolleret', kk: 'KK1', control: 'E', responsible: '', reference: 'A2',    status: '', date: '', performed_by: '', remarks: '' },
        { pos: '8',  description: 'Anvendelsesgrænsetilstand (SLS) er kontrolleret', kk: 'KK2', control: 'E', responsible: '', reference: 'A2',    status: '', date: '', performed_by: '', remarks: '' },
        { pos: '9',  description: 'Stabiliteten (lodret og vandret) er sikret', kk: 'KK1', control: 'E', responsible: '', reference: 'A2, B1', status: '', date: '', performed_by: '', remarks: '' },
        { pos: '10', description: 'Funderingen er kontrolleret', kk: 'KK1', control: 'E', responsible: '', reference: 'A2',    status: '', date: '', performed_by: '', remarks: '' },
        { pos: '11', description: 'Konstruktionstegninger er i overensstemmelse med beregningerne', kk: 'KK2', control: 'E', responsible: '', reference: 'A3',    status: '', date: '', performed_by: '', remarks: '' },
        { pos: '12', description: 'Uvildig kontrol udført', kk: 'KK2', control: 'U', responsible: '', reference: '',      status: '', date: '', performed_by: '', remarks: '' },
      ]
    }},

    { id: id++, type: 'heading', data: { level: 2, text: 'Udførelseskontrol — rapportering' } },
    { id: id++, type: 'control_plan', data: {
      title: 'Udførelseskontrol',
      mode: 'report',
      items: [
        { pos: '1', description: 'Materialer kontrolleret (leverandørattester, CE-mærkning)', kk: 'KK1', control: 'E', responsible: '', reference: '',  status: '', date: '', performed_by: '', remarks: '' },
        { pos: '2', description: 'Geometriske afvigelser inden for tolerancer', kk: 'KK1', control: 'E', responsible: '', reference: '',  status: '', date: '', performed_by: '', remarks: '' },
        { pos: '3', description: 'Samlinger og forbindelser udført korrekt', kk: 'KK1', control: 'E', responsible: '', reference: 'A3', status: '', date: '', performed_by: '', remarks: '' },
        { pos: '4', description: 'Fundering og jordarbejder udført og godkendt', kk: 'KK1', control: 'E', responsible: '', reference: 'A3', status: '', date: '', performed_by: '', remarks: '' },
        { pos: '5', description: 'Armeringsplacering kontrolleret inden støbning', kk: 'KK2', control: 'E', responsible: '', reference: 'A3', status: '', date: '', performed_by: '', remarks: '' },
        { pos: '6', description: 'Konstruktionen er i overensstemmelse med tegningerne', kk: 'KK1', control: 'E', responsible: '', reference: 'A3', status: '', date: '', performed_by: '', remarks: '' },
      ]
    }},

    { id: id++, type: 'heading', data: { level: 2, text: 'Konklusion og underskrifter' } },
    { id: id++, type: 'text',    data: { text: 'Det er hermed bekræftet, at kontrollen er gennemført i henhold til kontrolplanen (B2) og at det statiske projektmateriale er i overensstemmelse med de gældende normer og standarder.\n\nProjekterende:  ________________  Dato: ________\n\nKontrollant:    ________________  Dato: ________' } },
  ]
}

// ── Available templates per document ─────────────────────────────────────────
// Each entry: { label, description, make: () => blocks[] }
// Add new templates here as the app grows.

export const DOC_TEMPLATES = {
  A1: [
    {
      label:       'Konstruktionsgrundlag',
      description: 'Tilpasses projektet — bygningsanvendelse, materialer og CC-klasse',
      // A1 is generated from a description of the project rather than emitted
      // whole; `needsOptions` makes the editor ask before applying it.
      needsOptions: 'a1',
      make:        (opts, metadata) => makeA1Template(opts, metadata),
    },
  ],
  A2: [
    {
      label:       'Portalstel — 2D FEM',
      description: 'IPE 240/300 · 6m spænd · 4m søjler · 2 indspændte baser · UDL + vandret last',
      make:        makePortalFrameTemplate,
    },
    {
      label:       'Portalstel — Komplet workflow',
      description: 'Lastkombination (EN 1990) → FEM-analyse (OpenSeesPy) → kapacitetskontrol (EN 1993-1-1) · Alle blokke forudkoblet · Kør i rækkefølge',
      make:        makeFullPortalFrameWorkflowTemplate,
    },
    {
      label:       'Generel ramme — 2D FEM',
      description: 'Frit definerede knudepunkter og stænger · IPE 240/300 · UDL + vandret last · OpsVis figurer',
      make:        makeGeneralFrameFemTemplate,
    },
    {
      label:       'Hanebåndsramme — Komplet tagberegning',
      description: 'C24 · 6m spænd · 34° · sneprojektion · EN 1990 6.10a/b → FEM-envelope → EN 1995-1-1 spær + hanebånd · Alle blokke forudkoblet',
      make:        makeTimberRoofTemplate,
    },
    {
      label:       'Pratt-fagvark — 2D FEM',
      description: 'IPE 200 · 10m spænd · 4 felter · 17 stænger · statisk bestemt · m=2n-3 ✓',
      make:        makePrattTrussTemplate,
    },
  ],
  A3: [
    {
      label:       'Tegneliste og modeller',
      description: 'Tegneliste med tegningsnumre · Beregningsmodeller og software · Tegningsstatus',
      make:        makeA3Template,
    },
  ],
  A4: [
    {
      label:       'Ændringslog',
      description: 'Fortløbende log over godkendte konstruktionsændringer med baggrund og konsekvenser',
      make:        makeA4Template,
    },
  ],
  A5: [
    {
      label:       'Konstruktion som udført',
      description: 'Grundlag · Afvigelsesliste · Som udført-erklæring med underskrifter',
      make:        makeA5Template,
    },
  ],
  B1: [
    {
      label:       'Statisk projektredegørelse',
      description: 'Samme projektbeskrivelse som A1 · levende dokumentliste (BR18 § 501)',
      // Shares A1's answers so the two documents cannot state different classes
      needsOptions: 'a1',
      make:        (opts, metadata) => makeB1Template(opts, metadata),
    },
  ],
  B2: [
    {
      label:       'Statisk kontrolplan (DS 1140)',
      description: 'Konstruktionsklassen udledes af projektbeskrivelsen · kun de kontrolpunkter der gælder',
      // Same answers as A1 and B1, so the plan cannot name a different class
      // than the documents it controls.
      needsOptions: 'a1',
      make:        (opts, metadata) => makeB2Template(opts, metadata),
    },
  ],
  B3: [
    {
      label:       'Statisk kontrolrapport (DS 1140)',
      description: 'Udfyldes efter kontrol: status, dato, udøver og bemærkninger pr. kontrolpunkt',
      make:        makeB3Template,
    },
  ],
}
