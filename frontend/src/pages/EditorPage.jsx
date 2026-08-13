/**
 * EditorPage.jsx — document editor for one project
 *
 * Shows the A1–B3 document tabs on the left.
 * When no document is selected → shows the project metadata form.
 * When a document is open     → shows the block editor.
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getProject, saveProject, generatePdf, generatePdfZip, generateWord, getCalcTemplates, saveProjectAsTemplate, createVersion, issueDocument } from '../api/client.js'
import VersionHistoryModal from '../components/VersionHistoryModal.jsx'
import IssueDocumentModal from '../components/IssueDocumentModal.jsx'
import A1OptionsModal from '../components/A1OptionsModal.jsx'
import { makeA1Template } from '../templates/a1.js'
import { makeB1Template } from '../templates/b1.js'
import BlockList, { isStaleResult, hasCalcResult } from '../components/blocks/BlockList.jsx'
import MetadataPanel        from '../components/MetadataPanel.jsx'
import TemplateEditorModal  from '../components/TemplateEditorModal.jsx'

// Official BR18 / DS 1140 document names
const DOC_DEFS = {
  A1: 'Konstruktionsgrundlag',
  A2: 'Statiske beregninger',
  A3: 'Konstruktionstegninger og modeller',
  A4: 'Konstruktionsændringer',
  A5: 'Konstruktion som udført',
  B1: 'Statisk projektredegørelse',
  B2: 'Statisk kontrolplan',
  B3: 'Statisk kontrolrapport',
}

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

// ── A2: Timber collar-beam roof (hanebåndsramme) ─────────────────────────────
// Symmetric saddle roof · 6 m span · 2 m rise (α = 33.7°) · hanebånd at 1.2 m
// Full documentation: EN 1991-1-3/4 loads · FEM envelope · EN 1995-1-1 checks
function makeTimberRoofTemplate() {
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

  // ── Section properties ──────────────────────────────────────────────────
  // 45×145 C24  A = 65.25 cm²  Iz = 1143 cm⁴  E₀,mean = 11 GPa
  // 45×95  C24  A = 42.75 cm²  Iz =  322 cm⁴  E₀,mean = 11 GPa
  const RAF_A = 65.25, RAF_I = 1143
  const HAN_A = 42.75, HAN_I = 322

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
        { id: 1, ni: 1, nj: 3, type: 'beam', release: 'none', member_id: 1, E_GPa: 11, A_cm2: RAF_A, Iz_cm4: RAF_I },
        { id: 2, ni: 3, nj: 5, type: 'beam', release: 'none', member_id: 1, E_GPa: 11, A_cm2: RAF_A, Iz_cm4: RAF_I },
        { id: 3, ni: 6, nj: 4, type: 'beam', release: 'none', member_id: 2, E_GPa: 11, A_cm2: RAF_A, Iz_cm4: RAF_I },
        { id: 4, ni: 4, nj: 2, type: 'beam', release: 'none', member_id: 2, E_GPa: 11, A_cm2: RAF_A, Iz_cm4: RAF_I },
        { id: 5, ni: 3, nj: 4, type: 'beam', release: 'both',               E_GPa: 11, A_cm2: HAN_A, Iz_cm4: HAN_I },
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

function makeB2Template() {
  let id = Date.now()
  return [
    { id: id++, type: 'heading', data: { level: 1, text: 'Statisk kontrolplan' } },

    { id: id++, type: 'text',    data: { text: 'Udarbejdet i henhold til DS 1140 og DS/EN 1990.\nKontrolklasse: KK… · Projekt: …' } },

    { id: id++, type: 'heading', data: { level: 2, text: 'Projekteringskontrol' } },
    { id: id++, type: 'control_plan', data: {
      title: 'Projekteringskontrol',
      mode: 'plan',
      items: [
        { pos: '1',  description: 'Konstruktionsgrundlag (A1) er gennemgået og godkendt', kk: 'KK1', control: 'E', responsible: '', reference: 'A1' },
        { pos: '2',  description: 'Gældende normer og nationale annekser er identificeret', kk: 'KK1', control: 'E', responsible: '', reference: 'A1' },
        { pos: '3',  description: 'Laster og lastkombinationer er korrekte', kk: 'KK1', control: 'E', responsible: '', reference: 'A2' },
        { pos: '4',  description: 'Geometriske mål og tværsnitsparametre er korrekte', kk: 'KK1', control: 'E', responsible: '', reference: 'A2, A3' },
        { pos: '5',  description: 'Materialeparametre er korrekte og dokumenterede', kk: 'KK1', control: 'E', responsible: '', reference: 'A1, A2' },
        { pos: '6',  description: 'Beregningsmodeller er repræsentative for den faktiske konstruktion', kk: 'KK2', control: 'E', responsible: '', reference: 'A2' },
        { pos: '7',  description: 'Brudgrænsetilstand (STR/GEO) er kontrolleret', kk: 'KK1', control: 'E', responsible: '', reference: 'A2' },
        { pos: '8',  description: 'Anvendelsesgrænsetilstand (SLS – nedbøjning, revnedannelse) er kontrolleret', kk: 'KK2', control: 'E', responsible: '', reference: 'A2' },
        { pos: '9',  description: 'Stabiliteten (lodret og vandret) er sikret', kk: 'KK1', control: 'E', responsible: '', reference: 'A2, B1' },
        { pos: '10', description: 'Funderingen er kontrolleret (EC7/DS 415)', kk: 'KK1', control: 'E', responsible: '', reference: 'A2' },
        { pos: '11', description: 'Konstruktionstegninger er i overensstemmelse med beregningerne', kk: 'KK2', control: 'E', responsible: '', reference: 'A3' },
        { pos: '12', description: 'Uvildig kontrol udført (kræves ved KK2+)', kk: 'KK2', control: 'U', responsible: '', reference: '' },
      ]
    }},

    { id: id++, type: 'heading', data: { level: 2, text: 'Udførelseskontrol' } },
    { id: id++, type: 'control_plan', data: {
      title: 'Udførelseskontrol',
      mode: 'plan',
      items: [
        { pos: '1', description: 'Materialer kontrolleret (leverandørattester, CE-mærkning)', kk: 'KK1', control: 'E', responsible: '', reference: '' },
        { pos: '2', description: 'Geometriske afvigelser er inden for tolerancer (DS/ISO 4463)', kk: 'KK1', control: 'E', responsible: '', reference: '' },
        { pos: '3', description: 'Samlinger og forbindelser er udført korrekt', kk: 'KK1', control: 'E', responsible: '', reference: 'A3' },
        { pos: '4', description: 'Fundering og jordarbejder er udført og godkendt', kk: 'KK1', control: 'E', responsible: '', reference: 'A3' },
        { pos: '5', description: 'Armeringsplacering kontrolleret inden støbning', kk: 'KK2', control: 'E', responsible: '', reference: 'A3' },
        { pos: '6', description: 'Konstruktionen er i overensstemmelse med tegningerne', kk: 'KK1', control: 'E', responsible: '', reference: 'A3' },
      ]
    }},
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

const DOC_GROUPS = [
  { label: 'Konstruktionsdokumentation', docs: ['A1', 'A2', 'A3', 'A4', 'A5'] },
  { label: 'Projektdokumentation',       docs: ['B1', 'B2', 'B3'] },
]

// ── Available templates per document ─────────────────────────────────────────
// Each entry: { label, description, make: () => blocks[] }
// Add new templates here as the app grows.

const DOC_TEMPLATES = {
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
      description: 'Projekteringskontrol + udførelseskontrol med KK-krav og kontroltype (E/U/T)',
      make:        makeB2Template,
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

const BRAND    = '#d94a2b'   // Omkreds orange-red
const BRAND_LT = '#e05a3a'   // lighter variant

const styles = {
  layout: {
    display:  'flex',
    height:   '100vh',
    overflow: 'hidden',
  },
  sidebar: {
    width:         248,
    background:    '#fff',
    borderRight:   '1px solid #e2e8f0',
    display:       'flex',
    flexDirection: 'column',
    flexShrink:    0,
  },
  sidebarHeader: {
    padding:      '0 0 12px',
    borderBottom: '1px solid #e2e8f0',
  },
  // Logo stripe at top of sidebar
  sidebarBrand: {
    display:    'flex',
    alignItems: 'center',
    padding:    '0 16px',
    height:     46,
    overflow:   'hidden',
    background: '#fff',
    borderBottom: '1px solid #e8e4e0',
  },
  backBtn: {
    background:   'none',
    border:       'none',
    fontSize:     11,
    color:        '#94a3b8',
    padding:      '8px 16px 0',
    marginBottom: 2,
    display:      'flex',
    alignItems:   'center',
    gap:          4,
    cursor:       'pointer',
    fontFamily:   'inherit',
    transition:   'color 0.15s',
  },
  projectName: {
    fontWeight: 700,
    fontSize:   13,
    color:      '#0f172a',
    padding:    '0 16px',
    lineHeight: 1.3,
  },
  projectRef: {
    fontSize:      11,
    color:         '#94a3b8',
    letterSpacing: '0.03em',
    padding:       '2px 16px 0',
    fontFamily:    'var(--font-mono, monospace)',
  },
  sidebarNav: {
    flex:      1,
    overflowY: 'auto',
    padding:   '8px 0',
  },
  sidebarFooter: {
    borderTop: '1px solid #e2e8f0',
    padding:   '6px 0',
  },
  groupLabel: {
    fontSize:      9,
    fontWeight:    700,
    color:         '#94a3b8',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    padding:       '12px 16px 3px',
  },
  docBtn: (active) => ({
    display:     'flex',
    alignItems:  'center',
    width:       '100%',
    textAlign:   'left',
    background:  active ? '#eff6ff' : 'none',
    border:      'none',
    borderLeft:  active ? `3px solid ${BRAND}` : '3px solid transparent',
    padding:     '7px 16px',
    fontSize:    12,
    color:       active ? BRAND : '#475569',
    fontWeight:  active ? 600 : 400,
    cursor:      'pointer',
    fontFamily:  'inherit',
    transition:  'background 0.12s, color 0.12s',
  }),
  metaBtn: (active) => ({
    display:     'flex',
    alignItems:  'center',
    width:       '100%',
    textAlign:   'left',
    background:  active ? '#eff6ff' : 'none',
    border:      'none',
    borderLeft:  active ? `3px solid ${BRAND}` : '3px solid transparent',
    padding:     '8px 16px',
    fontSize:    11,
    color:       active ? BRAND : '#94a3b8',
    fontWeight:  active ? 600 : 400,
    cursor:      'pointer',
    fontFamily:  'inherit',
    transition:  'background 0.12s, color 0.12s',
    gap:         6,
  }),
  docId: {
    fontFamily:    'var(--font-mono, monospace)',
    marginRight:   8,
    fontSize:      10,
    fontWeight:    700,
    color:         '#94a3b8',
    background:    '#f1f5f9',
    padding:       '1px 5px',
    borderRadius:  2,
    letterSpacing: '0.04em',
  },
  main: {
    flex:          1,
    display:       'flex',
    flexDirection: 'column',
    overflow:      'hidden',
    background:    '#eef2f7',
  },
  toolbar: {
    background:   '#fff',
    borderBottom: '1px solid #e2e8f0',
    padding:      '9px 24px',
    display:      'flex',
    alignItems:   'center',
    gap:          10,
    minHeight:    48,
  },
  docTitle: {
    flex:       1,
    fontWeight: 600,
    fontSize:   13,
    color:      '#0f172a',
  },
  tplBtn: {
    background:    '#fff',
    color:         '#475569',
    border:        '1px solid #e2e8f0',
    padding:       '6px 12px',
    fontSize:      11,
    fontWeight:    600,
    cursor:        'pointer',
    fontFamily:    'inherit',
    borderRadius:  0,
    transition:    'background 0.12s, color 0.12s',
    whiteSpace:    'nowrap',
  },
  tplDropdown: {
    position:   'absolute',
    top:        'calc(100% + 4px)',
    right:      0,
    zIndex:     400,
    background: '#fff',
    border:     '1px solid #e0e0e0',
    boxShadow:  '0 6px 20px rgba(0,0,0,0.12)',
    minWidth:   260,
    padding:    '4px 0',
  },
  tplItem: {
    display:    'block',
    width:      '100%',
    background: '#fff',
    border:     'none',
    padding:    '10px 16px',
    textAlign:  'left',
    cursor:     'pointer',
    fontFamily: 'inherit',
  },
  tplItemLabel: {
    fontSize:   13,
    fontWeight: 600,
    color:      '#1c1c1e',
    marginBottom: 2,
  },
  tplItemDesc: {
    fontSize:   11,
    color:      '#aaa',
    lineHeight: 1.4,
  },
  tplEmpty: {
    fontSize:  12,
    color:     '#bbb',
    padding:   '10px 16px',
    fontStyle: 'italic',
  },
  pdfBtn: {
    background:    BRAND,
    color:         '#fff',
    border:        'none',
    padding:       '7px 18px',
    fontSize:      11,
    fontWeight:    700,
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    cursor:        'pointer',
    fontFamily:    'inherit',
    transition:    'background 0.15s',
  },
  content: {
    flex:       1,
    overflowY:  'auto',
    padding:    '28px 32px 40px',
    background: '#eef2f7',
  },
  saving: {
    fontSize:   10,
    color:      '#94a3b8',
    fontFamily: 'var(--font-mono, monospace)',
    letterSpacing: '0.04em',
  },
  error: {
    color:      '#dc2626',
    background: '#fef2f2',
    border:     '1px solid #fecaca',
    padding:    '10px 16px',
    fontSize:   12,
    margin:     '0 0 16px',
    borderLeft: '3px solid #dc2626',
  },

  // ── Save conflict ───────────────────────────────────────────────────────────
  conflictOverlay: {
    position:       'fixed',
    inset:          0,
    background:     'rgba(0,0,0,0.55)',
    zIndex:         2400,
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
  },
  conflictModal: {
    width:      'min(520px, 92vw)',
    background: '#fff',
    padding:    '22px 24px 18px',
    boxShadow:  '0 24px 80px rgba(0,0,0,0.35)',
    borderTop:  `3px solid ${BRAND}`,
  },
  conflictTitle: {
    fontSize:   15,
    fontWeight: 700,
    color:      '#1c1c1e',
    marginBottom: 10,
  },
  conflictBody: {
    fontSize:   12.5,
    lineHeight: 1.6,
    color:      '#475569',
    margin:     '0 0 18px',
  },
  conflictActions: {
    display:  'flex',
    gap:      8,
    flexWrap: 'wrap',
  },
  conflictPrimary: {
    background:    BRAND,
    color:         '#fff',
    border:        'none',
    padding:       '9px 16px',
    fontSize:      11,
    fontWeight:    700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    cursor:        'pointer',
    fontFamily:    'inherit',
  },
  conflictGhost: {
    background: '#fff',
    color:      '#475569',
    border:     '1px solid #d1d5db',
    padding:    '9px 14px',
    fontSize:   11,
    fontWeight: 600,
    cursor:     'pointer',
    fontFamily: 'inherit',
  },
  conflictNote: {
    fontSize:   11,
    color:      '#94a3b8',
    lineHeight: 1.5,
    margin:     '16px 0 0',
  },

  // ── PDF preview modal ───────────────────────────────────────────────────────
  pdfOverlay: {
    position:       'fixed',
    inset:          0,
    background:     'rgba(0,0,0,0.6)',
    zIndex:         2000,
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
  },
  pdfModal: {
    width:          '90vw',
    height:         '92vh',
    background:     '#fff',
    display:        'flex',
    flexDirection:  'column',
    boxShadow:      '0 24px 80px rgba(0,0,0,0.35)',
    overflow:       'hidden',
  },
  pdfModalHeader: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'space-between',
    padding:        '10px 16px',
    borderBottom:   '1px solid #e8e8e8',
    background:     '#fafafa',
    flexShrink:     0,
  },
  pdfIframe: {
    flex:           1,
    border:         'none',
    width:          '100%',
  },
  pdfDownloadBtn: {
    background:     BRAND,
    color:          '#fff',
    border:         'none',
    padding:        '6px 14px',
    fontSize:       11,
    fontWeight:     700,
    cursor:         'pointer',
    fontFamily:     'inherit',
    letterSpacing:  '0.05em',
  },
  pdfCloseBtn: {
    background:     'none',
    border:         '1px solid #ddd',
    padding:        '5px 10px',
    fontSize:       14,
    cursor:         'pointer',
    color:          '#666',
    fontFamily:     'inherit',
  },
}

export default function EditorPage() {
  const { id: projectId } = useParams()
  const navigate = useNavigate()

  const [project,         setProject]         = useState(null)
  const [activeDoc,       setActiveDoc]       = useState(null)   // e.g. "A2", or null = show metadata
  const [activeSubdoc,    setActiveSubdoc]    = useState(null)   // index into subdocs[], or null
  const [loading,         setLoading]         = useState(true)
  const [saving,          setSaving]          = useState(false)
  const [error,           setError]           = useState(null)
  const [tplOpen,         setTplOpen]         = useState(false)
  const [templates,       setTemplates]       = useState([])
  const [tmplEditorOpen,  setTmplEditorOpen]  = useState(false)
  const [tmplEditorInitId,setTmplEditorInitId]= useState(null)
  const [clipboard,       setClipboard]       = useState(null)   // copied block
  const [canUndo,         setCanUndo]         = useState(false)
  const [canRedo,         setCanRedo]         = useState(false)
  const [pdfPreviewUrl,   setPdfPreviewUrl]   = useState(null)   // blob URL for preview modal
  const [pdfGenerating,   setPdfGenerating]   = useState(false)  // shared spinner for both buttons
  const [pdfZipGenerating,    setPdfZipGenerating]    = useState(false)  // spinner for separate-PDFs ZIP
  const [wordGenerating,      setWordGenerating]      = useState(false)  // spinner for Word export
  const [savingTemplate,      setSavingTemplate]      = useState(false)  // spinner for save-as-template
  const [tplNamePrompt,       setTplNamePrompt]       = useState(false)  // show name input
  const [tplNameInput,        setTplNameInput]        = useState('')     // template name
  // Adding sub-document: which parent doc is being expanded
  const [addingSubdocFor, setAddingSubdocFor] = useState(null)
  const [newSubdocName,   setNewSubdocName]   = useState('')
  const undoStack      = useRef([])   // past block arrays
  const redoStack      = useRef([])   // future block arrays
  const tplRef         = useRef(null)
  const subdocInputRef = useRef(null)
  const autoSaveTimer  = useRef(null)  // debounce handle for block saves
  const revRef         = useRef(null)  // server revision we last saw
  const saveQueue      = useRef(Promise.resolve())  // serialises writes
  const conflictRef    = useRef(false) // writes frozen while a conflict is open
  const [conflict,     setConflict]     = useState(null)  // unresolved save conflict
  const [historyOpen,  setHistoryOpen]  = useState(false)
  const [issueOpen,    setIssueOpen]    = useState(false)
  const [issuing,      setIssuing]      = useState(false)
  // Template awaiting its options dialog (currently only A1)
  const [pendingTemplate, setPendingTemplate] = useState(null)

  // Close template dropdown on outside click
  useEffect(() => {
    if (!tplOpen) return
    const close = e => { if (tplRef.current && !tplRef.current.contains(e.target)) setTplOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [tplOpen])

  useEffect(() => {
    loadProject()
    loadTemplates()
  }, [projectId])

  async function loadProject() {
    try {
      setLoading(true)
      const data = await getProject(projectId)
      // Older projects may predate newer document categories (e.g. A5) —
      // fill in any missing ones so the sidebar always shows the full set.
      const docs = { ...(data.documents || {}) }
      for (const [docId, title] of Object.entries(DOC_DEFS)) {
        if (!docs[docId]) docs[docId] = { title, blocks: [], subdocs: [] }
      }
      revRef.current = typeof data._rev === 'number' ? data._rev : null
      setProject({ ...data, documents: docs })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function loadTemplates() {
    try {
      const data = await getCalcTemplates()
      setTemplates(data)
    } catch (err) {
      // Non-fatal — templates panel will just be empty
      console.warn('Could not load calc templates:', err)
    }
  }

  /**
   * Persist a project to the backend — the single write path for the editor.
   *
   * Two things every caller gets for free:
   *
   *   Serialised writes.  Saves are chained, so two in-flight requests can
   *   never reach the server out of order (which would look like a conflict
   *   against ourselves and could resurrect older content).
   *
   *   Revision tracking.  We send the rev we last saw and store the rev the
   *   server hands back.  If somebody else saved in between, the backend
   *   answers 409 and we stop writing until the user has chosen what to keep —
   *   rather than silently overwriting their work.
   */
  const persist = useCallback((updatedProject, { silent = false } = {}) => {
    const run = async () => {
      if (conflictRef.current) return { ok: false, conflict: true }
      try {
        setSaving(true)
        const payload = revRef.current == null
          ? updatedProject
          : { ...updatedProject, _rev: revRef.current }
        const res = await saveProject(payload)
        if (typeof res?._rev === 'number') revRef.current = res._rev
        return { ok: true }
      } catch (err) {
        if (err?.status === 409) {
          conflictRef.current = true
          setConflict({
            updatedBy: err.detail?.updated_by || '',
            updatedAt: err.detail?.updated_at || '',
            local:     updatedProject,
          })
          return { ok: false, conflict: true, error: err }
        }
        if (!silent) setError(err.message)
        return { ok: false, error: err }
      } finally {
        setSaving(false)
      }
    }
    saveQueue.current = saveQueue.current.then(run, run)
    return saveQueue.current
  }, [])

  /**
   * Save the full project to the backend.
   */
  const save = useCallback((updatedProject) => {
    // Optimistic update first — state is correct immediately, no overwrite race
    setProject(updatedProject)
    return persist(updatedProject)
  }, [persist])

  /** Read the currently active blocks (parent doc OR active subdoc) */
  function _currentBlocks(p = project) {
    if (!activeDoc || !p) return []
    const doc = p.documents[activeDoc]
    if (activeSubdoc !== null) return doc?.subdocs?.[activeSubdoc]?.blocks ?? []
    return doc?.blocks ?? []
  }

  /** Low-level: write blocks to the active location without touching undo/redo */
  function _applyBlocks(newBlocks) {
    if (!activeDoc || !project) return
    const doc = project.documents[activeDoc]
    let updated
    if (activeSubdoc !== null) {
      const newSubdocs = (doc.subdocs ?? []).map((sd, i) =>
        i === activeSubdoc ? { ...sd, blocks: newBlocks } : sd
      )
      updated = {
        ...project,
        documents: { ...project.documents, [activeDoc]: { ...doc, subdocs: newSubdocs } },
      }
    } else {
      updated = {
        ...project,
        documents: { ...project.documents, [activeDoc]: { ...doc, blocks: newBlocks } },
      }
    }
    // Update state immediately so UI never lags or reverts while typing
    setProject(updated)
    // Debounce the API save — one request per typing pause, not per keystroke
    clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => persist(updated), 800)
  }

  /** Called by BlockList when blocks change — pushes to undo stack */
  function updateBlocks(newBlocks) {
    if (!activeDoc || !project) return
    const current = _currentBlocks()
    undoStack.current = [...undoStack.current.slice(-49), current]
    redoStack.current = []
    setCanUndo(true)
    setCanRedo(false)
    _applyBlocks(newBlocks)
  }

  function _writeBlocks(p, newBlocks) {
    /** Pure helper: return updated project with newBlocks at the active location */
    const doc = p.documents[activeDoc]
    if (activeSubdoc !== null) {
      const newSubdocs = (doc.subdocs ?? []).map((sd, i) =>
        i === activeSubdoc ? { ...sd, blocks: newBlocks } : sd
      )
      return { ...p, documents: { ...p.documents, [activeDoc]: { ...doc, subdocs: newSubdocs } } }
    }
    return { ...p, documents: { ...p.documents, [activeDoc]: { ...doc, blocks: newBlocks } } }
  }

  function _readBlocks(p) {
    /** Pure helper: read blocks from active location in a given project snapshot */
    const doc = p.documents[activeDoc]
    if (activeSubdoc !== null) return doc?.subdocs?.[activeSubdoc]?.blocks ?? []
    return doc?.blocks ?? []
  }

  const handleUndo = useCallback(() => {
    if (undoStack.current.length === 0) return
    const prev = undoStack.current[undoStack.current.length - 1]
    undoStack.current = undoStack.current.slice(0, -1)
    setProject(p => {
      if (!p || !activeDoc) return p
      redoStack.current = [...redoStack.current.slice(-49), _readBlocks(p)]
      setCanUndo(undoStack.current.length > 0)
      setCanRedo(true)
      const updated = _writeBlocks(p, prev)
      persist(updated)
      return updated
    })
  }, [activeDoc, activeSubdoc, persist])

  const handleRedo = useCallback(() => {
    if (redoStack.current.length === 0) return
    const next = redoStack.current[redoStack.current.length - 1]
    redoStack.current = redoStack.current.slice(0, -1)
    setProject(p => {
      if (!p || !activeDoc) return p
      undoStack.current = [...undoStack.current.slice(-49), _readBlocks(p)]
      setCanUndo(true)
      setCanRedo(redoStack.current.length > 0)
      const updated = _writeBlocks(p, next)
      persist(updated)
      return updated
    })
  }, [activeDoc, activeSubdoc, persist])

  // Reset undo/redo stacks when switching documents or sub-documents
  useEffect(() => {
    undoStack.current = []
    redoStack.current = []
    setCanUndo(false)
    setCanRedo(false)
  }, [activeDoc, activeSubdoc])

  // Keyboard shortcuts: Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z
  useEffect(() => {
    function onKey(e) {
      const ctrl = e.ctrlKey || e.metaKey
      if (!ctrl) return
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo() }
      if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); handleRedo() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [handleUndo, handleRedo])

  // ── Save conflict resolution ───────────────────────────────────────────────
  // Reached when somebody else (or another tab) saved the project while this
  // editor had it open.  Writes stay frozen until the user picks a side — the
  // one thing we must never do is guess.

  /** Discard our unsaved changes and load the version that is on the server. */
  async function resolveConflictReload() {
    conflictRef.current = false
    setConflict(null)
    await loadProject()
    setError('Projektet er genindlæst med den nyeste version fra serveren.')
  }

  /** Keep our version. The other version is snapshotted first, never lost. */
  async function resolveConflictOverwrite() {
    const local = conflict?.local ?? project
    try {
      setSaving(true)
      // Snapshot what is currently on the server, so their work is recoverable
      // from the version history even though we are about to replace it.
      await createVersion(projectId, 'Før overskrivning', 'manual')
      const server = await getProject(projectId)
      revRef.current = typeof server._rev === 'number' ? server._rev : null
      conflictRef.current = false
      setConflict(null)
      setProject(local)
      const res = await persist(local)
      if (res?.ok) {
        setError('✓ Dine ændringer er gemt. Den anden version ligger i versionshistorikken.')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  /** Escape hatch: keep a local copy on disk before deciding anything. */
  function downloadLocalCopy() {
    const local = conflict?.local ?? project
    if (!local) return
    const blob = new Blob([JSON.stringify(local, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    const name = (local.metadata?.project_name || 'projekt').replace(/[^\wæøåÆØÅ-]+/g, '_')
    a.href = url
    a.download = `${name}-lokal-kopi.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  /** Called by MetadataPanel when any metadata field is committed */
  function updateMeta(newMeta) {
    if (!project) return
    const updated = { ...project, metadata: newMeta }
    save(updated)
  }

  // ── Sub-document management ────────────────────────────────────────────────

  function openAddSubdoc(docId) {
    setAddingSubdocFor(docId)
    setNewSubdocName('')
    // Focus the input on next tick
    setTimeout(() => subdocInputRef.current?.focus(), 50)
  }

  function confirmAddSubdoc() {
    const docId = addingSubdocFor
    const name  = newSubdocName.trim()
    if (!name || !docId || !project) { setAddingSubdocFor(null); return }
    const doc          = project.documents[docId]
    const existingBlocks = doc.blocks ?? []
    const currentSubdocs = doc.subdocs ?? []
    // If this is the first subdoc and there are existing blocks, adopt them
    const newSubdoc = { name, blocks: currentSubdocs.length === 0 ? existingBlocks : [] }
    const newSubdocs = [...currentSubdocs, newSubdoc]
    const updated = {
      ...project,
      documents: {
        ...project.documents,
        [docId]: {
          ...doc,
          blocks:  currentSubdocs.length === 0 ? [] : existingBlocks, // clear parent only on first
          subdocs: newSubdocs,
        },
      },
    }
    save(updated)
    setAddingSubdocFor(null)
    setNewSubdocName('')
    // Navigate into the new subdoc
    setActiveDoc(docId)
    setActiveSubdoc(newSubdocs.length - 1)
  }

  function deleteSubdoc(docId, idx) {
    const doc  = project.documents[docId]
    const sd   = doc.subdocs?.[idx]
    if (!sd) return
    if (!window.confirm(`Slet underdokument "${sd.name}"? Dette kan ikke fortrydes.`)) return
    const newSubdocs = (doc.subdocs ?? []).filter((_, i) => i !== idx)
    const updated = {
      ...project,
      documents: {
        ...project.documents,
        [docId]: { ...doc, subdocs: newSubdocs },
      },
    }
    save(updated)
    // If we were inside the deleted subdoc, go back to parent
    if (activeDoc === docId && activeSubdoc === idx) {
      setActiveSubdoc(null)
    } else if (activeDoc === docId && activeSubdoc > idx) {
      setActiveSubdoc(activeSubdoc - 1)
    }
  }

  function renameSubdoc(docId, idx, newName) {
    const doc = project.documents[docId]
    const newSubdocs = (doc.subdocs ?? []).map((sd, i) =>
      i === idx ? { ...sd, name: newName } : sd
    )
    const updated = {
      ...project,
      documents: { ...project.documents, [docId]: { ...doc, subdocs: newSubdocs } },
    }
    save(updated)
  }

  /**
   * Flush the pending debounced auto-save and wait for the explicit save to
   * complete.  Call this before any PDF/Word export so the backend always reads
   * the latest _result values from the database.
   */
  // Re-compress every image block in a project to JPEG 85% / 1920px max.
  // Returns a new project object — does not mutate the original.
  async function _recompressProjectImages(proj) {
    function recompressB64(dataUrl) {
      return new Promise((resolve) => {
        if (!dataUrl || dataUrl.includes('data:image/svg+xml')) {
          resolve(dataUrl)
          return
        }
        const img = new window.Image()
        img.onload = () => {
          let { width, height } = img
          const maxDim = 1920
          if (width > maxDim || height > maxDim) {
            if (width >= height) { height = Math.round(height * maxDim / width); width = maxDim }
            else { width = Math.round(width * maxDim / height); height = maxDim }
          }
          const canvas = document.createElement('canvas')
          canvas.width = width; canvas.height = height
          const ctx = canvas.getContext('2d')
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, width, height)
          ctx.drawImage(img, 0, 0, width, height)
          resolve(canvas.toDataURL('image/jpeg', 0.85))
        }
        img.onerror = () => resolve(dataUrl)
        img.src = dataUrl
      })
    }

    // Deep clone so we never mutate React state in place
    const clone = JSON.parse(JSON.stringify(proj))

    // Compress cover image
    if (clone.metadata?.cover_image_b64) {
      clone.metadata.cover_image_b64 = await recompressB64(clone.metadata.cover_image_b64)
    }

    // Compress image blocks in every document and sub-document
    for (const doc of Object.values(clone.documents || {})) {
      for (const block of doc.blocks || []) {
        if (block.type === 'image' && block.data?.image_b64) {
          block.data.image_b64 = await recompressB64(block.data.image_b64)
        }
      }
      for (const subdoc of doc.subdocs || []) {
        for (const block of subdoc.blocks || []) {
          if (block.type === 'image' && block.data?.image_b64) {
            block.data.image_b64 = await recompressB64(block.data.image_b64)
          }
        }
      }
    }

    return clone
  }

  // Flush pending auto-save before export.
  // Returns true if the save succeeded, false if it ultimately failed.
  // On 413 (project too large) it automatically recompresses all images
  // and retries — so the image actually makes it into the database.
  async function _flushSave() {
    clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = null
    if (!project) return true

    const res = await persist(project, { silent: true })
    if (res?.ok) return true
    if (res?.conflict) return false   // the conflict dialog now owns the decision

    const msg = res?.error?.message ?? ''
    const is413 = res?.error?.status === 413 ||
                  msg.includes('413') || msg.toLowerCase().includes('too large')
    if (!is413) {
      console.warn('Pre-export save failed:', msg)
      setError(msg)
      return false
    }
    // 413: recompress every image in the project and retry
    console.warn('Project too large — recompressing images and retrying save…')
    try {
      const compressed = await _recompressProjectImages(project)
      const retry = await persist(compressed, { silent: true })
      if (!retry?.ok) throw retry?.error ?? new Error('save failed')
      // Update React state so future saves also use compressed images
      setProject(compressed)
      return true
    } catch (err2) {
      console.warn('Recompressed save also failed — proceeding with DB state:', err2.message)
      return false
    }
  }

  /**
   * Calc health for one document (incl. sub-documents):
   * how many calc blocks have failing checks, and how many are stale.
   * Drives the status dots in the sidebar and the export warning.
   */
  function docCalcStatus(doc) {
    const all = [
      ...(doc?.blocks ?? []),
      ...(doc?.subdocs ?? []).flatMap(sd => sd.blocks ?? []),
    ]
    let stale = 0, fail = 0
    for (const b of all) {
      const d = b?.data || {}
      if (!('_result' in d)) continue
      if (isStaleResult(b)) stale++
      if (Array.isArray(d._result) &&
          d._result.some(r => r?.type === 'check' && r.passes === false)) fail++
    }
    return { stale, fail }
  }

  /**
   * Documentation-integrity gate before export: warn if any calc block in the
   * document (incl. sub-documents) has stale results (inputs changed since the
   * last run) or has never been run.  Returns true to proceed.
   */
  /**
   * Count calculations in a document (incl. sub-documents) that would make the
   * report untrustworthy: results computed from inputs that have since changed,
   * and calculations never run at all.
   */
  function docIntegrity(doc) {
    const all = [
      ...(doc?.blocks ?? []),
      ...(doc?.subdocs ?? []).flatMap(sd => sd.blocks ?? []),
    ]
    let stale = 0, unrun = 0
    for (const b of all) {
      const d = b?.data || {}
      if (!('_result' in d)) continue          // not a calc block
      if (isStaleResult(b)) stale++
      else if (!hasCalcResult(b)) unrun++
    }
    return { stale, unrun }
  }

  function confirmExportIntegrity() {
    if (!activeDoc || !project) return true
    const { stale, unrun } = docIntegrity(project.documents[activeDoc])
    if (!stale && !unrun) return true
    const lines = []
    if (stale) lines.push(`• ${stale} beregning${stale > 1 ? 'er' : ''} har ændrede input siden sidste kørsel (forældet resultat)`)
    if (unrun) lines.push(`• ${unrun} beregning${unrun > 1 ? 'er' : ''} er ikke kørt endnu`)
    return window.confirm(
      `Advarsel — ${activeDoc} indeholder beregninger, der ikke er opdaterede:\n\n` +
      lines.join('\n') +
      '\n\nRapporten kan vise resultater, der ikke svarer til de angivne input.\nEksportér alligevel?'
    )
  }

  /**
   * Issue the active document: record the revision, snapshot the project, then
   * download the PDF.  The order matters — the snapshot must be taken from the
   * state the PDF is generated from, or the revision row points at the wrong
   * thing.
   */
  async function handleIssue(entry) {
    if (!activeDoc || !project) return
    setIssuing(true)
    setError(null)
    try {
      const saved = await _flushSave()
      if (!saved) {
        setError('Kunne ikke gemme de seneste ændringer — udstedelsen er afbrudt. ' +
                 'Et udstedt dokument skal svare til det, der er gemt.')
        return
      }
      const { revision } = await issueDocument(projectId, activeDoc, entry)
      await loadProject()          // pick up the new revision row and rev counter
      setIssueOpen(false)

      const blob     = await generatePdf(projectId, activeDoc)
      const url      = URL.createObjectURL(blob)
      const anchor   = document.createElement('a')
      anchor.href    = url
      anchor.download = `${project.metadata.project_ref || projectId}_${activeDoc}_rev${revision.rev}.pdf`
      anchor.click()
      URL.revokeObjectURL(url)
      setError(`✓ ${activeDoc} udstedt som revision ${revision.rev}. ` +
               'Projektet er gemt i versionshistorikken.')
    } catch (err) {
      setError(`Udstedelse fejlede: ${err.message}`)
    } finally {
      setIssuing(false)
    }
  }

  async function handleGeneratePdf() {
    if (!activeDoc) return
    if (!confirmExportIntegrity()) return
    setPdfGenerating(true)
    setError(null)
    try {
      const saved = await _flushSave()
      if (!saved) {
        setError('Bemærk: de seneste ændringer kunne ikke gemmes (projektet er muligvis for stort). ' +
                 'PDF genereres fra den senest gemte version.')
      }
      const blob     = await generatePdf(projectId, activeDoc)
      const url      = URL.createObjectURL(blob)
      const anchor   = document.createElement('a')
      anchor.href    = url
      anchor.download = `${project.metadata.project_ref || projectId}_${activeDoc}.pdf`
      anchor.click()
      URL.revokeObjectURL(url)
      if (saved) setError(null)
    } catch (err) {
      setError(`PDF-generering fejlede: ${err.message}`)
    } finally {
      setPdfGenerating(false)
    }
  }

  async function handleGeneratePdfZip() {
    if (!activeDoc) return
    if (!confirmExportIntegrity()) return
    setPdfZipGenerating(true)
    setError(null)
    try {
      const saved = await _flushSave()
      if (!saved) {
        setError('Bemærk: de seneste ændringer kunne ikke gemmes (projektet er muligvis for stort). ' +
                 'PDF’erne genereres fra den senest gemte version.')
      }
      const blob   = await generatePdfZip(projectId, activeDoc)
      const url    = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href  = url
      anchor.download = `${project.metadata.project_ref || projectId}_${activeDoc}_separate.zip`
      anchor.click()
      URL.revokeObjectURL(url)
      if (saved) setError(null)
    } catch (err) {
      setError(`PDF-generering fejlede: ${err.message}`)
    } finally {
      setPdfZipGenerating(false)
    }
  }

  async function handleGenerateWord() {
    if (!activeDoc) return
    if (!confirmExportIntegrity()) return
    setWordGenerating(true)
    setError(null)
    try {
      const saved = await _flushSave()
      if (!saved) {
        setError('Note: latest changes could not be saved (project may be too large). ' +
                 'Word-eksporten genereres fra den senest gemte version.')
      }
      const blob   = await generateWord(projectId, activeDoc)
      const url    = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href  = url
      anchor.download = `${project.metadata.project_ref || projectId}_${activeDoc}.docx`
      anchor.click()
      URL.revokeObjectURL(url)
      if (saved) setError(null)
    } catch (err) {
      setError(`Word-eksport fejlede: ${err.message}`)
    } finally {
      setWordGenerating(false)
    }
  }

  async function handlePreviewPdf() {
    if (!activeDoc) return
    setPdfGenerating(true)
    setError(null)
    try {
      const saved = await _flushSave()
      if (!saved) {
        setError('Bemærk: de seneste ændringer kunne ikke gemmes (projektet er muligvis for stort). ' +
                 'Forhåndsvisningen viser den senest gemte version.')
      }
      const blob = await generatePdf(projectId, activeDoc)
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl)
      setPdfPreviewUrl(URL.createObjectURL(blob))
      if (saved) setError(null)
    } catch (err) {
      setError(`PDF-forhåndsvisning fejlede: ${err.message}`)
    } finally {
      setPdfGenerating(false)
    }
  }

  function handleClosePdfPreview() {
    if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl)
    setPdfPreviewUrl(null)
  }

  function handleApplyTemplate(tpl) {
    setTplOpen(false)
    const existing = _currentBlocks()
    if (existing.length > 0) {
      if (!window.confirm(`Anvend skabelonen "${tpl.label}"? Dette erstatter det eksisterende indhold.`)) return
    }
    // Some templates are generated from a description of the project rather
    // than emitted whole — ask first, apply when the dialog returns.
    if (tpl.needsOptions) {
      setPendingTemplate(tpl)
      return
    }
    updateBlocks(tpl.make())
  }

  /**
   * Apply a template that was configured through an options dialog.
   *
   * The answers are stored on the project, so the sibling documents generated
   * from the same description (A1 and B1) don't ask twice — and, more to the
   * point, cannot end up stating different consequence classes.  Blocks and
   * metadata are written in one save so the two can't get out of step.
   */
  function applyTemplateWithOptions(opts) {
    const tpl = pendingTemplate
    setPendingTemplate(null)
    if (!tpl || !project || !activeDoc) return

    const metadata = { ...(project.metadata ?? {}), _doc_options: opts }
    const blocks   = tpl.make(opts, metadata)

    undoStack.current = [...undoStack.current.slice(-49), _currentBlocks()]
    redoStack.current = []
    setCanUndo(true)
    setCanRedo(false)

    const doc = project.documents[activeDoc]
    const documents = activeSubdoc !== null
      ? { ...project.documents, [activeDoc]: {
          ...doc,
          subdocs: (doc.subdocs ?? []).map((sd, i) => i === activeSubdoc ? { ...sd, blocks } : sd),
        } }
      : { ...project.documents, [activeDoc]: { ...doc, blocks } }

    save({ ...project, metadata, documents })
  }

  async function handleSaveAsTemplate() {
    if (!project || !tplNameInput.trim()) return
    setSavingTemplate(true)
    setError(null)
    try {
      await _flushSave()
      await saveProjectAsTemplate(projectId, {
        name:       tplNameInput.trim(),
        description: '',
        visibility:  project.visibility || 'team',
      })
      setTplNamePrompt(false)
      setTplNameInput('')
      // Small confirmation without a blocking dialog
      setError('✓ Gemt som skabelon "' + tplNameInput.trim() + '". Find den på forsiden → Skabeloner.')
      setTimeout(() => setError(null), 4000)
    } catch (err) {
      setError('Skabelonen kunne ikke gemmes: ' + err.message)
    } finally {
      setSavingTemplate(false)
    }
  }

  if (loading) return <div style={{ padding: 40 }}>Indlæser…</div>
  if (!project) return <div style={{ padding: 40 }}>Projektet blev ikke fundet.</div>

  const currentDoc    = activeDoc ? project.documents[activeDoc] : null
  const currentBlocks = activeDoc
    ? (activeSubdoc !== null
        ? (currentDoc?.subdocs?.[activeSubdoc]?.blocks ?? [])
        : (currentDoc?.blocks ?? []))
    : []

  // Toolbar title
  const toolbarTitle = !activeDoc
    ? 'Projektinformation'
    : activeSubdoc !== null
      ? `${activeDoc}.${activeSubdoc + 1} — ${currentDoc?.subdocs?.[activeSubdoc]?.name || 'Underdokument'}`
      : `${activeDoc} — ${DOC_DEFS[activeDoc]}`

  return (
    <>
    <div style={styles.layout}>

      {/* ── Left sidebar ── */}
      <aside style={styles.sidebar}>

        {/* Brand stripe + project header */}
        <div style={styles.sidebarHeader}>
          {/* Logo row */}
          <div style={styles.sidebarBrand}>
            <img src="/logo.png" alt="Omkreds" style={{ height: 90, width: 'auto', marginTop: -22, marginBottom: -22 }} />
          </div>

          {/* Back link + project info */}
          <button
            style={styles.backBtn}
            onClick={() => navigate('/')}
            onMouseEnter={e => e.currentTarget.style.color = '#475569'}
            onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
          >
            ← Alle projekter
          </button>
          <div style={styles.projectName}>
            {project.metadata.project_name}
          </div>
          <div style={styles.projectRef}>
            {project.metadata.project_ref
              ? `${project.metadata.project_ref} · Rev ${project.metadata.revision}`
              : `Rev ${project.metadata.revision}`}
          </div>
        </div>

        {/* Document navigation */}
        <nav style={styles.sidebarNav}>
          {DOC_GROUPS.map(group => (
            <div key={group.label}>
              <div style={styles.groupLabel}>{group.label}</div>
              {group.docs.map(docId => {
                const doc     = project.documents[docId]
                const subdocs = doc?.subdocs ?? []
                const blocks  = doc?.blocks  ?? []
                const isParentActive = activeDoc === docId && activeSubdoc === null
                const calcStatus = docCalcStatus(doc)
                return (
                  <React.Fragment key={docId}>

                    {/* Parent doc button */}
                    <button
                      style={styles.docBtn(isParentActive)}
                      onClick={() => { setActiveDoc(docId); setActiveSubdoc(null) }}
                    >
                      <span style={styles.docId}>{docId}</span>
                      {DOC_DEFS[docId]}
                      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
                        {calcStatus.fail > 0 && (
                          <span
                            title={`${calcStatus.fail} beregning${calcStatus.fail > 1 ? 'er' : ''} med fejlede eftervisninger`}
                            style={{ width: 7, height: 7, borderRadius: '50%', background: '#dc2626', flexShrink: 0 }}
                          />
                        )}
                        {calcStatus.stale > 0 && (
                          <span
                            title={`${calcStatus.stale} beregning${calcStatus.stale > 1 ? 'er' : ''} med forældede resultater`}
                            style={{ width: 7, height: 7, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }}
                          />
                        )}
                        {subdocs.length > 0
                          ? <span style={{ fontSize: 10, color: '#aaa' }}>{subdocs.length} sub</span>
                          : blocks.length > 0
                            ? <span style={{ fontSize: 10, color: '#aaa' }}>({blocks.length})</span>
                            : null
                        }
                      </span>
                    </button>

                    {/* Sub-documents */}
                    {subdocs.map((sd, si) => (
                      <div key={si} style={{ display: 'flex', alignItems: 'center' }}>
                        <button
                          style={{
                            ...styles.docBtn(activeDoc === docId && activeSubdoc === si),
                            flex: 1,
                            paddingLeft: 28,
                            fontSize: 11,
                          }}
                          onClick={() => { setActiveDoc(docId); setActiveSubdoc(si) }}
                        >
                          <span style={{ ...styles.docId, fontSize: 9 }}>{docId}.{si + 1}</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {sd.name || `Underdokument ${si + 1}`}
                          </span>
                        </button>
                        <button
                          title="Slet underdokument"
                          onClick={() => deleteSubdoc(docId, si)}
                          style={{
                            flexShrink: 0, background: 'none', border: 'none',
                            color: '#ccc', cursor: 'pointer', padding: '0 6px',
                            fontSize: 12, lineHeight: 1,
                          }}
                          onMouseEnter={e => e.currentTarget.style.color = '#dc2626'}
                          onMouseLeave={e => e.currentTarget.style.color = '#ccc'}
                        >✕</button>
                      </div>
                    ))}

                    {/* Add sub-document row */}
                    {addingSubdocFor === docId ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px 4px 28px' }}>
                        <input
                          ref={subdocInputRef}
                          value={newSubdocName}
                          onChange={e => setNewSubdocName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') confirmAddSubdoc()
                            if (e.key === 'Escape') setAddingSubdocFor(null)
                          }}
                          placeholder="Name…"
                          style={{
                            flex: 1, minWidth: 0, fontSize: 11, padding: '3px 6px',
                            border: '1px solid #cbd5e1', borderRadius: 3, outline: 'none',
                          }}
                        />
                        <button
                          onClick={confirmAddSubdoc}
                          style={{ fontSize: 11, padding: '3px 7px', background: BRAND, color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer' }}
                        >✓</button>
                        <button
                          onClick={() => setAddingSubdocFor(null)}
                          style={{ fontSize: 11, padding: '3px 6px', background: 'none', border: '1px solid #e2e8f0', borderRadius: 3, cursor: 'pointer', color: '#94a3b8' }}
                        >✕</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => openAddSubdoc(docId)}
                        style={{
                          display: 'block', width: '100%', background: 'none', border: 'none',
                          textAlign: 'left', paddingLeft: 28, paddingTop: 3, paddingBottom: 5,
                          fontSize: 11, color: '#94a3b8', cursor: 'pointer', fontFamily: 'inherit',
                        }}
                        onMouseEnter={e => e.currentTarget.style.color = BRAND}
                        onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
                      >
                        + Tilføj underdokument
                      </button>
                    )}

                  </React.Fragment>
                )
              })}
            </div>
          ))}
        </nav>

        {/* Footer: project info + save-as-template */}
        <div style={styles.sidebarFooter}>
          <button
            style={styles.metaBtn(activeDoc === null)}
            onClick={() => setActiveDoc(null)}
          >
            ⚙ Projektinformation
          </button>

          {/* ── Save as template ── */}
          {tplNamePrompt ? (
            <div style={{ padding: '6px 10px 8px', display: 'flex', flexDirection: 'column', gap: 5 }}>
              <input
                value={tplNameInput}
                onChange={e => setTplNameInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleSaveAsTemplate()
                  if (e.key === 'Escape') { setTplNamePrompt(false); setTplNameInput('') }
                }}
                placeholder="Skabelonnavn…"
                autoFocus
                style={{
                  fontSize: 11, padding: '5px 7px', fontFamily: 'inherit',
                  border: '1px solid #cbd5e1', outline: 'none', color: '#1c1c1e',
                }}
              />
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={handleSaveAsTemplate}
                  disabled={savingTemplate || !tplNameInput.trim()}
                  style={{
                    flex: 1, background: '#6366f1', color: '#fff', border: 'none',
                    padding: '5px 0', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    fontFamily: 'inherit', opacity: savingTemplate || !tplNameInput.trim() ? 0.5 : 1,
                  }}
                >
                  {savingTemplate ? 'Gemmer…' : 'Gem'}
                </button>
                <button
                  onClick={() => { setTplNamePrompt(false); setTplNameInput('') }}
                  style={{
                    background: 'none', border: '1px solid #e2e8f0', color: '#94a3b8',
                    padding: '5px 8px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >✕</button>
              </div>
            </div>
          ) : (
            <button
              style={{ ...styles.metaBtn(false), color: '#6366f1' }}
              onClick={() => {
                setTplNameInput(project?.metadata?.project_name || '')
                setTplNamePrompt(true)
              }}
            >
              📋 Gem som skabelon
            </button>
          )}
        </div>

      </aside>

      {/* ── Main area ── */}
      <main style={styles.main}>

        {/* Toolbar */}
        <div style={styles.toolbar}>
          {/* Back button when inside a sub-document */}
          {activeSubdoc !== null && (
            <button
              style={{ ...styles.tplBtn, marginRight: 4, color: BRAND, borderColor: '#c7d2fe' }}
              onClick={() => setActiveSubdoc(null)}
              title={`Tilbage til ${activeDoc}`}
            >
              ← {activeDoc}
            </button>
          )}
          <span style={styles.docTitle}>{toolbarTitle}</span>
          {saving && <span style={styles.saving}>Gemmer…</span>}

          <button
            style={{ ...styles.tplBtn, padding: '6px 10px' }}
            onClick={() => setHistoryOpen(true)}
            title="Versionshistorik — se og gendan tidligere versioner"
          >
            🕘
          </button>

          {/* Undo / Redo */}
          {activeDoc && (
            <span style={{ display: 'flex', gap: 2 }}>
              <button
                style={{ ...styles.tplBtn, padding: '6px 10px', opacity: canUndo ? 1 : 0.35 }}
                onClick={handleUndo} disabled={!canUndo} title="Fortryd  (Ctrl+Z)"
              >↩</button>
              <button
                style={{ ...styles.tplBtn, padding: '6px 10px', opacity: canRedo ? 1 : 0.35 }}
                onClick={handleRedo} disabled={!canRedo} title="Annullér fortryd  (Ctrl+Y)"
              >↪</button>
            </span>
          )}

          {/* Clipboard paste indicator */}
          {clipboard && activeDoc && (
            <span style={{ fontSize: 11, color: '#4a90d9' }}>
              📋 {clipboard.type} kopieret
            </span>
          )}

          {/* Template dropdown — shown whenever a document is open */}
          {activeDoc && (
            <div ref={tplRef} style={{ position: 'relative' }}>
              <button
                style={styles.tplBtn}
                onClick={() => setTplOpen(o => !o)}
              >
                📋 Skabelon ▾
              </button>

              {tplOpen && (
                <div style={styles.tplDropdown}>
                  {(DOC_TEMPLATES[activeDoc] ?? []).length > 0 ? (
                    (DOC_TEMPLATES[activeDoc]).map((tpl, i) => (
                      <button
                        key={i}
                        style={styles.tplItem}
                        onClick={() => handleApplyTemplate(tpl)}
                        onMouseEnter={e => e.currentTarget.style.background = '#f5f5f7'}
                        onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                      >
                        <div style={styles.tplItemLabel}>{tpl.label}</div>
                        <div style={styles.tplItemDesc}>{tpl.description}</div>
                      </button>
                    ))
                  ) : (
                    <div style={styles.tplEmpty}>
                      Ingen skabeloner til {activeDoc}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeDoc && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                style={{ ...styles.pdfBtn, background: '#4a5568' }}
                onClick={handlePreviewPdf}
                disabled={pdfGenerating}
                onMouseEnter={e => { if (!pdfGenerating) e.currentTarget.style.background = '#2d3748' }}
                onMouseLeave={e => { if (!pdfGenerating) e.currentTarget.style.background = '#4a5568' }}
                title="Forhåndsvis PDF i browseren"
              >
                {pdfGenerating ? '⏳' : '👁 Forhåndsvisning'}
              </button>
              <button
                style={{ ...styles.pdfBtn, background: '#fff', color: '#475569', border: '1px solid #cbd5e1', opacity: pdfGenerating ? 0.6 : 1 }}
                onClick={handleGeneratePdf}
                disabled={pdfGenerating}
                title="Eksportér et udkast — ingen revision registreres"
              >
                ↓ Eksportér PDF
              </button>
              <button
                style={{ ...styles.pdfBtn, opacity: issuing ? 0.6 : 1 }}
                onClick={() => setIssueOpen(true)}
                disabled={issuing}
                onMouseEnter={e => { if (!issuing) e.currentTarget.style.background = BRAND_LT }}
                onMouseLeave={e => { if (!issuing) e.currentTarget.style.background = BRAND }}
                title="Registrér revision, gem et permanent øjebliksbillede og hent PDF"
              >
                {issuing ? '⏳' : '✓ Udsted'}
              </button>
              {/* Separate PDFs button — only when the document has sub-documents */}
              {(project?.documents?.[activeDoc]?.subdocs?.length > 0) && (
                <button
                  style={{ ...styles.pdfBtn, background: '#6d4c9e', opacity: pdfZipGenerating ? 0.6 : 1 }}
                  onClick={handleGeneratePdfZip}
                  disabled={pdfZipGenerating}
                  onMouseEnter={e => { if (!pdfZipGenerating) e.currentTarget.style.background = '#4c2d72' }}
                  onMouseLeave={e => { if (!pdfZipGenerating) e.currentTarget.style.background = '#6d4c9e' }}
                  title="Download hvert underdokument som separat PDF (ZIP-arkiv)"
                >
                  {pdfZipGenerating ? '⏳' : '↓ Separate PDF’er'}
                </button>
              )}
              <button
                style={{ ...styles.pdfBtn, background: '#2d6a4f', opacity: wordGenerating ? 0.6 : 1 }}
                onClick={handleGenerateWord}
                disabled={wordGenerating}
                onMouseEnter={e => { if (!wordGenerating) e.currentTarget.style.background = '#1b4332' }}
                onMouseLeave={e => { if (!wordGenerating) e.currentTarget.style.background = '#2d6a4f' }}
                title="Eksportér som Word-dokument (.docx)"
              >
                {wordGenerating ? '⏳' : '↓ Eksportér Word'}
              </button>
            </div>
          )}
        </div>

        {/* Content */}
        <div style={styles.content}>
          {error && (
            <div style={error.startsWith('✓')
              ? { ...styles.error, color: '#15803d', background: '#f0fdf4', border: '1px solid #bbf7d0', borderLeft: '3px solid #16a34a' }
              : styles.error
            }>{error}</div>
          )}

          {activeDoc === null ? (
            // No document selected — show project metadata form
            <MetadataPanel
              project={project}
              onSave={updateMeta}
            />
          ) : (
            // Document selected — show block editor
            <BlockList
              blocks={currentBlocks}
              onChange={updateBlocks}
              project={project}
              templates={templates}
              onManageTemplates={() => { setTmplEditorInitId(null); setTmplEditorOpen(true) }}
              onOpenTemplateEditor={(id) => { setTmplEditorInitId(id); setTmplEditorOpen(true) }}
              clipboard={clipboard}
              onCopyBlock={(b) => setClipboard(JSON.parse(JSON.stringify(b)))}
            />
          )}
        </div>

      </main>

    </div>

    {/* ── Save conflict ── */}
    {conflict && (
      <div style={styles.conflictOverlay}>
        <div style={styles.conflictModal}>
          <div style={styles.conflictTitle}>Projektet er ændret af en anden</div>
          <p style={styles.conflictBody}>
            {conflict.updatedBy
              ? <>En anden bruger gemte projektet, mens du havde det åbent
                  {conflict.updatedAt ? ` (${new Date(conflict.updatedAt).toLocaleString('da-DK')})` : ''}.</>
              : <>Projektet blev gemt et andet sted — sandsynligvis i en anden fane —
                  mens du havde det åbent.</>}
            {' '}Dine ændringer er <strong>ikke</strong> gemt endnu. Vælg hvad der skal ske:
          </p>
          <div style={styles.conflictActions}>
            <button style={styles.conflictPrimary} onClick={resolveConflictOverwrite}>
              Behold mine ændringer
            </button>
            <button style={styles.conflictGhost} onClick={resolveConflictReload}>
              Hent serverens version
            </button>
            <button style={styles.conflictGhost} onClick={downloadLocalCopy}>
              ↓ Gem min version som fil
            </button>
          </div>
          <p style={styles.conflictNote}>
            Uanset hvad du vælger, gemmes den anden version i versionshistorikken —
            intet arbejde går tabt.
          </p>
        </div>
      </div>
    )}

    {/* ── Project description (A1 / B1) ── */}
    {pendingTemplate?.needsOptions === 'a1' && (
      <A1OptionsModal
        metadata={project?.metadata ?? {}}
        initial={project?.metadata?._doc_options}
        docId={activeDoc}
        onGenerate={applyTemplateWithOptions}
        onClose={() => setPendingTemplate(null)}
      />
    )}

    {/* ── Issue document ── */}
    {issueOpen && activeDoc && project && (
      <IssueDocumentModal
        docId={activeDoc}
        docTitle={project.documents[activeDoc]?.title ?? DOC_DEFS[activeDoc] ?? ''}
        metadata={project.metadata ?? {}}
        revisions={project.documents[activeDoc]?.revisions ?? []}
        integrity={docIntegrity(project.documents[activeDoc])}
        busy={issuing}
        onIssue={handleIssue}
        onClose={() => { if (!issuing) setIssueOpen(false) }}
      />
    )}

    {/* ── Version history ── */}
    {historyOpen && (
      <VersionHistoryModal
        projectId={projectId}
        onClose={() => setHistoryOpen(false)}
        onRestored={(restored) => {
          revRef.current = typeof restored?._rev === 'number' ? restored._rev : null
          loadProject()
          setError('✓ Projektet er gendannet til en tidligere version.')
        }}
      />
    )}

    {/* ── Template editor modal ── */}
    {tmplEditorOpen && (
      <TemplateEditorModal
        initialTemplateId={tmplEditorInitId}
        onClose={() => { setTmplEditorOpen(false); setTmplEditorInitId(null) }}
        onTemplatesChanged={loadTemplates}
      />
    )}

    {/* ── PDF preview modal ── */}
    {pdfPreviewUrl && (
      <div style={styles.pdfOverlay} onClick={e => e.target === e.currentTarget && handleClosePdfPreview()}>
        <div style={styles.pdfModal}>
          {/* Header */}
          <div style={styles.pdfModalHeader}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>
              PDF-forhåndsvisning — {activeDoc}
            </span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                style={styles.pdfDownloadBtn}
                onClick={handleGeneratePdf}
              >
                ↓ Download
              </button>
              <button style={styles.pdfCloseBtn} onClick={handleClosePdfPreview}>✕</button>
            </div>
          </div>
          {/* PDF iframe — browsers render PDFs natively */}
          <iframe
            src={pdfPreviewUrl}
            style={styles.pdfIframe}
            title="PDF Preview"
          />
        </div>
      </div>
    )}
    </>
  )
}
