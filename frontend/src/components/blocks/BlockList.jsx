/**
 * BlockList.jsx — document canvas with left block-type panel
 *
 * Layout:
 *   [Add-block panel]  |  [White document page]
 *
 * • Blocks render as document content (headings, text, images, calc summaries)
 * • Click a block → editor opens in-place with a ▲ collapse button
 * • Hover between blocks → blue + add button
 * • ⠿ drag handle to reorder
 */
import React, { useState, useRef, useEffect, useCallback, lazy, Suspense } from 'react'
import { maxUtilization, utilColor } from '../../lib/utilization.js'
import { useConfirm } from '../../ui/Dialog.jsx'
import { hashCalcInputs, hasCalcResult, isStaleResult, staleReason, calcRevision } from '../../lib/calcState.js'

// Headings and text are the document itself and render at once. Every other
// editor is loaded when it is first opened, which keeps the calc modules (and
// KaTeX, which the result views need) out of the first download.
import HeadingBlock      from './HeadingBlock.jsx'
const TableBlock = lazy(() => import('./TableBlock.jsx'))
import DocListBlock      from './DocListBlock.jsx'
// The text editor (TipTap) is loaded on demand; until then the same text is
// shown formatted by RichTextStatic, so nothing jumps when it arrives.
const TextBlock = lazy(() => import('./TextBlock.jsx'))
import RichTextStatic    from './RichTextStatic.jsx'
const ImageBlock = lazy(() => import('./ImageBlock.jsx'))
const PythonBlock = lazy(() => import('./PythonBlock.jsx'))
const CustomCalcBlock = lazy(() => import('./CustomCalcBlock.jsx'))
const SteelBeamBlock = lazy(() => import('./SteelBeamBlock.jsx'))
const SteelColumnBlock = lazy(() => import('./SteelColumnBlock.jsx'))
const RCBeamBlock = lazy(() => import('./RCBeamBlock.jsx'))
const RCColumnBlock = lazy(() => import('./RCColumnBlock.jsx'))
const RCSlabBlock = lazy(() => import('./RCSlabBlock.jsx'))
const TimberBeamBlock = lazy(() => import('./TimberBeamBlock.jsx'))
const TimberColumnBlock = lazy(() => import('./TimberColumnBlock.jsx'))
const MasonryWallBlock = lazy(() => import('./MasonryWallBlock.jsx'))
const BeamFemBlock = lazy(() => import('./BeamFemBlock.jsx'))
const FrameFemBlock = lazy(() => import('./FrameFemBlock.jsx'))
const PortalFrameFemBlock = lazy(() => import('./PortalFrameFemBlock.jsx'))
const GeneralFrameFemBlock = lazy(() => import('./GeneralFrameFemBlock.jsx'))
const FrameLoadCasesBlock = lazy(() => import('./FrameLoadCasesBlock.jsx'))
const WindLoadBlock = lazy(() => import('./WindLoadBlock.jsx'))
const FrameLoadsBlock = lazy(() => import('./FrameLoadsBlock.jsx'))
const SnowLoadBlock = lazy(() => import('./SnowLoadBlock.jsx'))
const RoofDeadLoadBlock = lazy(() => import('./RoofDeadLoadBlock.jsx'))
const FoundationBlock = lazy(() => import('./FoundationBlock.jsx'))
const LoadComboBlock = lazy(() => import('./LoadComboBlock.jsx'))
const BeamColumnBlock = lazy(() => import('./BeamColumnBlock.jsx'))
const BoltConnectionBlock = lazy(() => import('./BoltConnectionBlock.jsx'))
const PlateGirderBlock = lazy(() => import('./PlateGirderBlock.jsx'))
const SavedCalcBlock = lazy(() => import('./SavedCalcBlock.jsx'))
const ControlPlanBlock = lazy(() => import('./ControlPlanBlock.jsx'))
const ProjectBasisBlock = lazy(() => import('./ProjectBasisBlock.jsx'))

// ── Block registry ────────────────────────────────────────────────────────────

// icon: short text badge shown in the left panel (max 3 chars, monospace)
const BLOCK_TYPES = [
  { type: 'project_basis', label: 'Projektgrundlag (A1)', icon: 'A1', color: '#0f172a', component: ProjectBasisBlock,
    default: { title: 'Project Basis', consequence_class: 'CC2', wind_zone: 2, terrain_category: 'II',
               gamma_M0: 1.00, gamma_M1: 1.00, gamma_M2: 1.25,
               gamma_c: 1.50, gamma_s: 1.15, gamma_M_timber: 1.30, _exports: null } },
  { type: 'heading',       label: 'Overskrift',        icon: 'H',   color: '#64748b', component: HeadingBlock,
    default: { level: 1, text: '' } },
  { type: 'text',          label: 'Tekstafsnit',       icon: 'TXT', color: '#64748b', component: TextBlock,
    default: { text: '' } },
  { type: 'image',         label: 'Billede',           icon: 'IMG', color: '#64748b', component: ImageBlock,
    default: { image_b64: null, caption: '', width_pct: 100 } },
  { type: 'table',         label: 'Tabel',             icon: 'TBL', color: '#64748b', component: TableBlock,
    default: { caption: '', has_header: true, rows: [['Kolonne 1', 'Kolonne 2'], ['', '']] } },
  // Read-only: content comes from the project, so there is no editor component
  // and no palette entry — it arrives with the B1 template.
  { type: 'doclist',       label: 'Dokumentliste',     icon: 'DOC', color: '#64748b', component: null,
    default: {} },
  { type: 'custom_calc',   label: 'Egen beregning',    icon: 'CLC', color: '#7c3aed', component: CustomCalcBlock,
    default: { title: 'Egen beregning', version: 2, subst: true,
               lines: ['# Forudsætninger', 'L = 4,0 m | spændvidde',
                       'q_d = 5,0 kN/m | regningsmæssig linjelast', 'M_Ed = q_d·L²/8 → kNm'],
               _result: null } },
  { type: 'python_calc',   label: 'Python script',     icon: 'PY',  color: '#0284c7', component: PythonBlock,
    default: { title: 'Python Script',
               code: 'import numpy as np\n\nx = np.linspace(0, 10, 100)\nprint(f"Max x = {x.max():.1f}")',
               _output_text: '', _figs_b64: [], _error: '' } },
  { type: 'steel_beam',    label: 'Stålbjælke',        icon: 'SB',  color: '#1e3a5f', component: SteelBeamBlock,
    default: { title: 'Steel Beam Check', label: 'S1', section: 'IPE300', grade: 'S355',
               span_m: 5.0, load_type: 'udl', trib_width_m: 1.0, g_k_kNm: 5.0, q_k_kNm: 3.0,
               gamma_M0: 1.10, gamma_M1: 1.20, K_FI: 1.0,
               ltb_restrained: false, buck_y_restrained: false, buck_x_restrained: false, _result: null } },
  { type: 'steel_column',  label: 'Stålsøjle',         icon: 'SC',  color: '#1e3a5f', component: SteelColumnBlock,
    default: { title: 'Stålsøjle', label: 'S1', section: 'HEB200', grade: 'S355',
               length_m: 3.0, N_Ed_kN: 500.0, M_y_Ed_kNm: 0.0, M_z_Ed_kNm: 0.0,
               k_y: 1.0, k_z: 1.0, gamma_M0: 1.10, gamma_M1: 1.20,
               ltb_restrained: true, _result: null } },
  { type: 'rc_beam',       label: 'Betonbjælke',       icon: 'RCB', color: '#374151', component: RCBeamBlock,
    default: { title: 'RC Beam Check', label: 'B1', span_m: 5.0, b_mm: 300, h_mm: 500,
               d_mm: 450, g_k_kNm: 10.0, q_k_kNm: 6.0, f_ck_MPa: 30, f_yk_MPa: 500,
               As_prov_mm2: null, gamma_C: 1.5, gamma_S: 1.15, _result: null } },
  { type: 'rc_column',     label: 'Betonsøjle',        icon: 'RCC', color: '#374151', component: RCColumnBlock,
    default: { title: 'RC Column Check', label: 'C1', h_mm: 300, b_mm: 300, c_mm: 40,
               fck_mpa: 30, fyk_mpa: 500, gamma_c: 1.5, gamma_s: 1.15,
               da_c_mm: 16, n_c: 2, da_t_mm: 16, n_t: 2,
               Ls_mm: 3500, beta_eff: 1.0,
               load_cases: [{ label: 'LC1', NEd_kN: 400, M0Ed_kNm: 20 }], _result: null } },
  { type: 'rc_slab',       label: 'Betondæk',          icon: 'RCS', color: '#374151', component: RCSlabBlock,
    default: { title: 'RC Slab Check', label: 'D1', span_m: 5.0, h_mm: 200, d_mm: 165,
               g_k_kNm2: 3.5, q_k_kNm2: 2.5, fck_MPa: 30, fyk_MPa: 500,
               As_prov_mm2m: null, gamma_C: 1.5, gamma_S: 1.15, cover_mm: 35, _result: null } },
  { type: 'timber_beam',   label: 'Træbjælke',         icon: 'TB',  color: '#92400e', component: TimberBeamBlock,
    default: { title: 'Timber Beam Check', label: 'T1', span_m: 4.0, b_mm: 90, h_mm: 220,
               g_k_kNm: 3.0, q_k_kNm: 2.0, timber_grade: 'C24', service_class: 1,
               load_duration: 'medium', gamma_M: null,
               compression_edge_restrained: true, torsional_restraint_at_supports: true, _result: null } },
  { type: 'timber_column', label: 'Træsøjle',          icon: 'TC',  color: '#92400e', component: TimberColumnBlock,
    default: { title: 'Timber Column Check', label: 'C1', length_m: 3.0, N_Ed_kN: 50.0,
               M_Ed_kNm: 0.0, b_mm: 120, h_mm: 120, timber_grade: 'C24', service_class: 1,
               load_duration: 'medium', gamma_M: null, effective_length_factor: 1.0,
               l_ef_ltb_m: null, _result: null } },
  { type: 'masonry_wall',  label: 'Murværksvæg',       icon: 'MSN', color: '#78350f', component: MasonryWallBlock,
    default: { title: 'Masonry Wall Check', label: 'W1',
               calc_type: 'vertical',
               // shared material
               f_b_MPa: 10.0, f_m_MPa: 6.0, K: 0.55, gamma_M: 2.5,
               // vertical check
               height_m: 3.0, thickness_mm: 228, length_m: 5.0, N_k_kN: 100.0, alpha: 0.7, beta: 0.3,
               // ritter single
               b_m: 1.0, t_ef_mm: 228, h_ef_m: 3.0, e_m_mm: 0.0, N_Ed_kN: 135.0, K1: 0.9,
               // bearing
               N_Ed_bear_kN: 50.0, a_plate_mm: 150, b_plate_mm: 200, t_leaf_mm: 108,
               // multi-storey ritter
               wall_width_m: 5.0, unit_weight_kNm2: 5.0, top_moment_kNm: 0.0, Kt: 0.9,
               floors: [{ name: 'Story 1', height_m: 3.0, axial_kN: 100.0, shear_kN: 5.0 }],
               // plan distribution
               x_max_m: 10.0, y_max_m: 10.0, floor_height_m: 3.0,
               D_x: 0.5, E_x: 0.2, D_y: 0.0, E_y: 0.0,
               wall_elements: [{ d_n: 0.228, b_n: 5.0, x: 2.5, y: 0.114 }],
               _result: null } },
  { type: 'beam_fem',      label: 'Beam FEM',          icon: 'FEM', color: '#0f766e', component: BeamFemBlock,
    default: { title: 'Beam FEM Analysis', L: 6.0, E_GPa: 210.0, I_cm4: 3000.0,
               supports: [{ x: 0, type: 'pin' }, { x: 6.0, type: 'roller' }],
               loads: [{ type: 'udl', w_kNm: 10.0, x1: 0, x2: 6.0 }],
               _fig_b64: null, _summary: null, _result: null } },
  { type: 'frame_load_cases', label: 'Frame Load Cases',  icon: 'FLC', color: '#7c3aed', component: FrameLoadCasesBlock,
    default: { title: 'Frame Load Cases', consequence_class: 'CC2', method: '6.10ab',
               cases: [
                 { id: 'G', type: 'permanent', loads: [
                     { load_type: 'udl', elem_id: 1, value_kNm: 5, direction: 'vertical' },
                     { load_type: 'udl', elem_id: 2, value_kNm: 5, direction: 'vertical' },
                     { load_type: 'udl', elem_id: 3, value_kNm: 5, direction: 'vertical' },
                   ] },
                 { id: 'S', type: 'snow', loads: [
                     { load_type: 'udl', elem_id: 2, value_kNm: 1.5, direction: 'projected' },
                   ] },
                 { id: 'W', type: 'wind', loads: [
                     { load_type: 'nodal', node_id: 2, Fx_kN: 10, Fy_kN: 0 },
                   ] },
               ],
               _exports: null, _result: null } },
  { type: 'general_frame_fem', label: 'Rammeberegning (FEM)', icon: 'GF',  color: '#0f766e', component: GeneralFrameFemBlock,
    // Blokken starter tom. Den plejede at komme med en staalportalramme: fire
    // knuder, tre IPE-profiler og 20 kN/m paa rigelen. Det er en bestemt
    // konstruktion, ikke et udgangspunkt -- og et sted at begynde, man skal
    // huske at rydde op i, er vaerre end ingenting. En glemt understoetning
    // eller en glemt last fra en portalramme, man troede man havde slettet,
    // ligner ikke en fejl i dokumentet.
    //
    // Modellen tastes ind: knuder, elementer, understoetninger, laster. Der var
    // en skabelonvaelger ved siden af, men den blev skaaret ned til ét system
    // og derefter taget helt ud -- den var en genvej til noget, der alligevel
    // skulle rettes bagefter. Modulet er generelt; det starter generelt.
    default: { title: '2D Frame FEM',
               nodes: [], elements: [], supports: [], loads: [], equal_dofs: [],
               _figs_b64: null, _summary: null, _result: null } },
  { type: 'portal_frame_fem', label: 'Portal Frame FEM',  icon: 'PF',  color: '#0f766e', component: PortalFrameFemBlock,
    default: { title: 'Portal Frame FEM', n_bays: 1, h_bay_m: 5.0, w_bay_m: 10.0,
               E_GPa: 200.0, A_cm2: 300.0, Iz_cm4: 30000.0,
               rafter_loads: [{ rafter_idx: 0, wy_kNm: -10.0 }],
               lateral_loads: [],
               _figs_b64: null, _summary: null, _result: null } },
  { type: 'frame_fem',     label: '2D Frame FEM',       icon: '2DF', color: '#0f766e', component: FrameFemBlock,
    default: { title: '2D Frame Analysis',
               nodes:    [{ id: 1, x: 0.0, y: 0.0 }, { id: 2, x: 5.0, y: 0.0 }],
               elements: [{ id: 1, ni: 1, nj: 2, type: 'beam', E_GPa: 210, A_cm2: 53.8, I_cm4: 8356, preset: 'IPE 300 (S235)' }],
               supports: [{ node_id: 1, ux: true, uy: true, rz: false }, { node_id: 2, ux: false, uy: true, rz: false }],
               loads:    [{ type: 'udl', elem_id: 1, wy_kNm: 10.0, wx_kNm: 0.0 }],
               _result: null } },
  { type: 'frame_loads',   label: 'Laster på rammen',  icon: 'LR',  color: '#0369a1', component: FrameLoadsBlock,
    default: { title: 'Laster på rammen', s_m: 5.0, placering: 'naeste', g_tag_kNm2: 0,
               med_sne: true, med_vind: true, roller: {}, _result: null } },
  { type: 'wind_load',     label: 'Vindlast',          icon: 'WND', color: '#0369a1', component: WindLoadBlock,
    default: { title: 'Wind Load', label: 'W1', terrain_category: 'II',
               v_b0_ms: 24.0, z_ref_m: 8.0, h_m: 8.0, b_m: 10.0, d_m: 12.0,
               c_dir: 1.0, c_season: 1.0, c_pe_windward: 0.8, c_pe_leeward: -0.5,
               c_pi: 0.2, rho_air: 1.25, _result: null } },
  { type: 'snow_load',     label: 'Snelast',           icon: 'SNW', color: '#0369a1', component: SnowLoadBlock,
    default: { title: 'Snow Load', label: 'SN1', roof_type: 'pitched',
               alpha_deg: 20.0, s_k_kNm2: 1.0, dk_zone: '1',
               C_e: 1.0, C_t: 1.0, roof_span_m: 8.0, eave_height_m: 3.0,
               gamma_s: 1.5, a_m: 0.0, _result: null } },
  { type: 'roof_dead_load', label: 'Tagets egenlast', icon: 'RDL', color: '#0369a1', component: RoofDeadLoadBlock,
    default: { title: 'Tagets egenlast', label: 'G1', alpha_deg: 30.0, a_m: 1.0,
               layers: [
                 { description: 'Tegltagsten (monier)',        g_kNm2: 0.55 },
                 { description: 'Lægte + kontralägte (38 mm)', g_kNm2: 0.04 },
                 { description: 'Undertag (vindspærrepap)',     g_kNm2: 0.03 },
                 { description: 'Krydsfinérsarking 12 mm',     g_kNm2: 0.07 },
                 { description: 'Isolering 200 mm (glasuld)',   g_kNm2: 0.04 },
                 { description: 'Dampspærre',                  g_kNm2: 0.01 },
               ],
               b_mm: 45.0, h_mm: 145.0, rho_kgm3: 380.0, _result: null } },
  { type: 'foundation',    label: 'Fundament',         icon: 'FND', color: '#57534e', component: FoundationBlock,
    default: { title: 'Foundation Bearing Check', label: 'F1',
               B_m: 1.5, L_m: 2.0, D_m: 0.8,
               c_kPa: 5.0, phi_deg: 30.0, gamma_kNm3: 18.0, gamma_b_kNm3: 10.0,
               water_table: false, V_Ed_kN: 300.0, H_Ed_kN: 0.0, M_Ed_kNm: 0.0,
               gamma_phi: 1.0, gamma_c: 1.0, gamma_Rv: 1.4, _result: null } },
  { type: 'load_combo',    label: 'Lastkombinationer', icon: 'LC',  color: '#9333ea', component: LoadComboBlock,
    default: { title: 'Load Combinations', label: 'LC1', unit: 'kN/m',
               G_k: 5.0, G_fav: false, loads: [], method: '6.10ab', _result: null } },
  { type: 'beam_column',   label: 'Bjælkesøjle (N+M)', icon: 'BC',  color: '#1e3a5f', component: BeamColumnBlock,
    default: { title: 'Beam-Column Check', label: 'BC1', section: 'HEB200', grade: 'S355',
               N_Ed_kN: 200, My_Ed_kNm: 50, Mz_Ed_kNm: 0,
               L_y_m: 4.0, L_z_m: 4.0, L_LTB_m: 4.0,
               k_y: 1.0, k_z: 1.0, C_my: 1.0, C_mz: 1.0, C_mLT: 1.0,
               ltb_restrained: false, gamma_M0: 1.0, gamma_M1: 1.0, _result: null } },
  { type: 'bolt_group',    label: 'Boltgruppe',        icon: 'BLT', color: '#1e3a5f', component: BoltConnectionBlock,
    default: { title: 'Connection Check', label: 'BG1', mode: 'bolts',
               n_bolts: 4, bolt_class: '8.8', d_mm: 20, shear_plane: 'thread',
               n_shear_planes: 1, t_plate_mm: 10, f_u_plate_MPa: 510,
               e1_mm: 40, e2_mm: 40, p1_mm: 60, V_Ed_kN: 100, gamma_M2: 1.25,
               _result: null } },
  { type: 'fillet_weld',   label: 'Kantsøm',           icon: 'WLD', color: '#1e3a5f', component: BoltConnectionBlock,
    default: { title: 'Weld Check', label: 'W1', mode: 'weld',
               a_mm: 6, L_mm: 200, F_Ed_kN: 80, steel_grade: 'S355',
               gamma_M2: 1.25, _result: null } },
  { type: 'plate_girder',  label: 'Pladedrager',        icon: 'PG',  color: '#1e3a5f', component: PlateGirderBlock,
    default: { title: 'Plate Girder Check', label: 'PG1', grade: 'S355',
               h_w_mm: 1200, t_w_mm: 12, b_f_mm: 400, t_f_mm: 25,
               a_mm: 2000, eta: 1.0, rigid_end_post: true,
               V_Ed_kN: 0, M_Ed_kNm: 0,
               gamma_M0: 1.0, gamma_M1: 1.0, _result: null } },
  { type: 'saved_calc',    label: 'Min beregning',      icon: 'TPL', color: '#2563eb', component: SavedCalcBlock,
    default: { title: '', template_id: null, params: {}, _result: null } },
  { type: 'control_plan', label: 'Kontrolplan (DS 1140)', icon: 'KP', color: '#1e3a5f', component: ControlPlanBlock,
    default: { title: 'Kontrolplan', mode: 'plan', items: [] } },
]

const TYPE_MAP = Object.fromEntries(BLOCK_TYPES.map(t => [t.type, t]))

// ── Panel groups ──────────────────────────────────────────────────────────────

const PANEL_GROUPS = [
  {
    label: 'Projekt',
    types: ['project_basis'],
  },
  {
    label: 'Indhold',
    types: ['heading', 'text', 'image', 'table'],
  },
  {
    label: 'Laster  (EN 1990)',
    // Egenlast, sne og vind kunne kun komme ind i et dokument via en skabelon.
    // De blokke virker; de stod bare ikke i panelet, så et A2 skrevet i hånden
    // manglede sit lastgrundlag.
    //
    // frame_load_cases er taget UD af panelet, ikke slettet. Eksisterende
    // blokke gengives stadig (TYPE_MAP er urørt) -- en Frame Load Cases ER en
    // blok i et dokument, og fjernes komponenten, brækker ethvert dokument der
    // har en. Samme grund som python_calc længere nede.
    //
    // Hvorfor den ud: den bad om elementnumre i en blok, der ikke viser
    // modellen, så de blev tastet i blinde og blev stående når FEM-blokken
    // omnummererede. Og den kendte ikke til, at vind fra venstre og fra højre
    // er alternativer -- alle fire vindtilfælde havnede i samme kombination,
    // og en symmetrisk ramme blev eftervist for 70 % af sidelasten.
    //
    // Vejen nu: Lastkombinationer -> FEM (Kombi-linjelast). Lasten sidder på
    // modellen, hvor man kan se den, og opdelingen i G og Q følger med, så
    // anvendelsesgrænsetilstanden kan regnes.
    types: ['roof_dead_load', 'snow_load', 'wind_load', 'load_combo'],
  },
  {
    label: 'Stål  (EC3)',
    // beam_column er stadig ude: den dumper sin egen referencetest. EN 1993-1-1
    // lign. 6.61/6.62 giver 0,432 hvor Vayas et al. (Springer 2019, tabel
    // 4.11) siger 0,460 — 6 % for lavt, altså på den forkerte side. Sæt den
    // ind igen når tests/test_beam_column.py er grøn.
    types: ['steel_beam', 'steel_column'],
  },
  {
    label: 'Træ  (EC5)',
    types: ['timber_beam', 'timber_column'],
  },
  // Murværk (EC6) er ude af panelet indtil beregningen er færdig: modulet
  // kører, men skriver "Design parameters" og "Slenderness check" midt i en
  // dansk statisk dokumentation. Sæt 'masonry_wall' ind her igen når teksten
  // er oversat og eftervist. Eksisterende blokke renderes uændret.
  {
    label: 'Analyse',
    // Én rammeberegning, ikke tre. beam_fem og portal_frame_fem er de gamle
    // moduler: de fik aldrig fortegnsrettelsen på lasterne eller
    // validate_model, så de kan stadig regne videre på en mekanisme og
    // returnere grønne tal. De er ude af panelet, ikke ude af TYPE_MAP —
    // eksisterende blokke i gamle dokumenter tegnes og eksporteres som før.
    types: ['frame_loads', 'general_frame_fem'],
  },
  {
    label: 'Brugerdefineret',
    // python_calc is intentionally excluded from the add panel — it runs
    // unrestricted exec() on the server and is an admin/developer tool only.
    // Existing python_calc blocks still render normally (TYPE_MAP is unaffected).
    types: ['custom_calc'],
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function countChecks(result) {
  // Only array-style results (Eurocode calc blocks) contain check entries.
  // frame_fem and beam_fem store plain objects — skip those gracefully.
  if (!result || !Array.isArray(result)) return null
  let pass = 0, fail = 0
  result.forEach(b => b.type === 'check' && (b.passes !== false ? pass++ : fail++))
  return (pass + fail) > 0 ? { pass, fail } : null
}

const mkBadge = ok => ({
  fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 2,
  background: ok ? '#e8f8ef' : '#fdf3f2',
  color:      ok ? '#27ae60' : '#c0392b',
})

// ── Stale-result detection ────────────────────────────────────────────────────
// Lives in lib/calcState.js so the editor shell can read block state without
// importing every block editor. Re-exported here for existing imports.
export { hashCalcInputs, hasCalcResult, isStaleResult, staleReason }

const staleBadgeStyle = {
  fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 2,
  background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa',
}

// ── Block preview (rendered document content) ─────────────────────────────────

function BlockPreview({ block, project }) {
  const d = block.data
  switch (block.type) {

    // Generated from the project, not authored — see DocListBlock.jsx
    case 'doclist':
      return <DocListBlock data={d} project={project} />

    case 'heading': {
      const sz = { 1: 26, 2: 20, 3: 16 }[d.level] || 18
      return (
        <div style={{ fontSize: sz, fontWeight: 700, lineHeight: 1.3, padding: '2px 0',
                      color: d.text ? '#1c1c1e' : '#ccc' }}>
          {d.text || 'Unavngiven overskrift'}
        </div>
      )
    }

    case 'text':
      return <RichTextStatic text={d.text} />

    case 'image':
      return d.image_b64
        ? <div>
            <img src={d.image_b64} alt={d.caption || ''}
                 style={{ maxWidth: (d.width_pct || 100) + '%', display: 'block' }} />
            {d.caption && <p style={{ fontSize: 12, color: '#888', marginTop: 6, fontStyle: 'italic' }}>{d.caption}</p>}
          </div>
        : <div style={{ color: '#bbb', fontSize: 13, padding: '10px 0' }}>🖼 Klik for at tilføje et billede</div>

    case 'table': {
      const rows = d.rows ?? []
      const numCols = rows[0]?.length ?? 0
      return (
        <div>
          {d.caption && <p style={{ fontSize: 11, color: '#888', marginBottom: 4, fontStyle: 'italic' }}>{d.caption}</p>}
          <table style={{ borderCollapse: 'collapse', fontSize: 11, width: '100%' }}>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} style={ri % 2 === 1 && !(d.has_header && ri === 0) ? { background: '#f8fafc' } : {}}>
                  {row.map((cell, ci) => (
                    <td key={ci} style={{
                      padding: '3px 6px',
                      border: '1px solid #d8d8d8',
                      borderBottom: d.has_header && ri === 0 ? '2px solid #999' : '1px solid #d8d8d8',
                      background: d.has_header && ri === 0 ? '#f0f0f0'
                                : ri % 2 === 0 ? '#f9f9f9' : '#fff',
                      color:      '#1c1c1e',
                      fontWeight: d.has_header && ri === 0 ? 700 : undefined,
                    }}>{cell || '—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 10, color: '#aaa', marginTop: 3 }}>
            {rows.length} rækker · {numCols} kolonner
          </p>
        </div>
      )
    }

    case 'project_basis': {
      const cc  = d.consequence_class ?? 'CC2'
      const kfi = { CC1: 0.9, CC2: 1.0, CC3: 1.1 }[cc] ?? 1.0
      const wz  = d.wind_zone ?? 2
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 20px', fontSize: 13, padding: '2px 0' }}>
          <span style={{ fontWeight: 700, color: '#0f172a' }}>{d.title || 'Project Basis'}</span>
          <span style={{ color: '#475569' }}>{cc}</span>
          <span style={{ color: '#475569' }}>K_FI = {kfi.toFixed(1)}</span>
          <span style={{ color: '#475569' }}>Wind Z{wz}</span>
          <span style={{ color: '#475569' }}>Terrain {d.terrain_category ?? 'II'}</span>
          <span style={{ color: '#475569' }}>s_k 1,0 kN/m²</span>
          <span style={{ color: '#475569' }}>γ_M0={d.gamma_M0 ?? 1.00}  γ_M1={d.gamma_M1 ?? 1.00}  γ_c={d.gamma_c ?? 1.50}</span>
        </div>
      )
    }

    case 'control_plan': {
      const isReport = d.mode === 'report'
      const items    = d.items || []
      const done     = isReport ? items.filter(it => it.status === 'OK' || it.status === 'N/A').length : null
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '2px 0' }}>
          <span style={{
            background: isReport ? '#1a7f37' : '#1e3a5f',
            color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 3,
          }}>
            {isReport ? 'B3' : 'B2'}
          </span>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#1c1c1e' }}>
            {d.title || (isReport ? 'Kontrolrapport' : 'Kontrolplan')}
          </span>
          <span style={{ fontSize: 12, color: '#aaa', fontFamily: 'monospace' }}>
            {items.length} punkter{isReport && done !== null ? ` · ${done}/${items.length} afsluttet` : ''}
          </span>
        </div>
      )
    }

    default: {
      // calc blocks — show title + key params + badges
      const checks = countChecks(d._result)
      const done   = (block.type === 'python_calc' && !!(d._output_text || (d._figs_b64||[]).length))
                  || (block.type === 'beam_fem'    && !!d._summary)
                  || (block.type === 'frame_fem'   && !!d._result)
      const err    = (block.type === 'python_calc' && !!d._error)

      let sub = ''
      if (block.type === 'steel_beam')      sub = [d.label, d.section, d.grade, d.span_m && `L=${d.span_m} m`].filter(Boolean).join('  ·  ')
      else if (block.type === 'rc_beam')    sub = [d.label, `${d.b_mm}×${d.h_mm} mm`, d.span_m && `L=${d.span_m} m`].filter(Boolean).join('  ·  ')
      else if (block.type === 'timber_beam')    sub = [d.label, d.timber_grade, `L=${d.span_m} m`].filter(Boolean).join('  ·  ')
      else if (block.type === 'timber_column')  sub = [d.label, d.timber_grade, `H=${d.length_m} m`].filter(Boolean).join('  ·  ')
      else if (block.type === 'masonry_wall')   sub = [d.label, `t=${d.thickness_mm} mm`, `H=${d.height_m} m`].filter(Boolean).join('  ·  ')
      else if (block.type === 'python_calc')    sub = (d.code || '').split('\n').length + ' lines'
      else if (block.type === 'custom_calc')    sub = Array.isArray(d.lines) ? `${d.lines.filter(l => String(l).trim()).length} linjer` : `${(d.items || []).length} rækker`
      else if (block.type === 'beam_fem')        sub = `L=${d.L ?? 6} m  ·  E=${d.E_GPa ?? 210} GPa  ·  I=${d.I_cm4 ?? '?'} cm⁴`
      else if (block.type === 'frame_fem')       sub = `${(d.nodes ?? []).length} nodes  ·  ${(d.elements ?? []).length} elements  ·  ${(d.supports ?? []).length} supports`

      return (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', padding: '2px 0' }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#1c1c1e' }}>
            {d.title || TYPE_MAP[block.type]?.label || block.type}
          </span>
          {sub && <span style={{ fontSize: 12, color: '#aaa', fontFamily: 'monospace' }}>{sub}</span>}
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            {isStaleResult(block) && <span style={staleBadgeStyle} title={staleReason(block)}>⟳ Forældet</span>}
            {(() => {
              const util = maxUtilization(d._result)
              return util !== null && (
                <span title="Største udnyttelsesgrad" style={{
                  fontSize: 11, fontWeight: 700, fontFamily: 'monospace',
                  color: utilColor(util),
                }}>
                  η = {util.toFixed(2)}
                </span>
              )
            })()}
            {checks && checks.pass > 0 && <span style={mkBadge(true)}>✓ {checks.pass}</span>}
            {checks && checks.fail > 0 && <span style={mkBadge(false)}>✗ {checks.fail}</span>}
            {done  && <span style={mkBadge(true)}>✓ Done</span>}
            {err   && <span style={mkBadge(false)}>✗ Error</span>}
          </span>
        </div>
      )
    }
  }
}

// ── + gap button between blocks ───────────────────────────────────────────────

function AddZone({ onAdd, templates = [], onAddTemplate, clipboard, onPaste }) {
  const [hover, setHover] = useState(false)
  const [open,  setOpen]  = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  return (
    <div
      ref={ref}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { if (!open) setHover(false) }}
      style={{ position: 'relative', height: 20, display: 'flex', alignItems: 'center' }}
    >
      {/* Rule */}
      <div style={{
        position: 'absolute', left: -64, right: -64, height: hover || open ? 2 : 1,
        background: hover || open ? '#4a90d9' : 'transparent',
        transition: 'all 0.12s', pointerEvents: 'none',
      }} />

      {/* + button */}
      {(hover || open) && (
        <button
          onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
          style={{
            position: 'relative', zIndex: 2,
            width: 20, height: 20, borderRadius: '50%',
            background: '#4a90d9', color: '#fff', border: 'none',
            fontSize: 16, lineHeight: 1, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginLeft: -10,
          }}
        >+</button>
      )}

      {/* Block type menu — grouped */}
      {open && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', top: 24, left: 0, zIndex: 200,
            background: '#fff', border: '1px solid #e0e0e0',
            boxShadow: '0 6px 20px rgba(0,0,0,0.12)',
            padding: '4px 0 6px', minWidth: 200,
          }}
        >
          {PANEL_GROUPS.map((group, gi) => (
            <div key={group.label}>
              <div style={{
                fontSize: 9, fontWeight: 700, color: '#bbb',
                letterSpacing: '0.1em', textTransform: 'uppercase',
                padding: gi === 0 ? '6px 14px 4px' : '10px 14px 4px',
                borderTop: gi === 0 ? 'none' : '1px solid #f0f0f0',
              }}>
                {group.label}
              </div>
              {group.types.map(type => {
                const def = TYPE_MAP[type]
                if (!def) return null
                return (
                  <button
                    key={def.type}
                    onClick={() => { onAdd(def.type); setOpen(false); setHover(false) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 9,
                      background: 'none', border: 'none',
                      padding: '6px 12px', fontSize: 12, color: '#334155',
                      cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                      width: '100%',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 28, height: 18, flexShrink: 0,
                      background: def.color ?? '#64748b',
                      color: '#fff', fontSize: 9, fontWeight: 700,
                      fontFamily: 'var(--font-mono, monospace)',
                      letterSpacing: '0.04em',
                    }}>
                      {def.icon}
                    </span>
                    {def.label}
                  </button>
                )
              })}
            </div>
          ))}

          {/* Paste from clipboard */}
          {clipboard && (
            <div>
              <div style={{
                fontSize: 9, fontWeight: 700, color: '#4a90d9',
                letterSpacing: '0.1em', textTransform: 'uppercase',
                padding: '10px 14px 4px',
                borderTop: '1px solid #f0f0f0',
              }}>
                Clipboard
              </div>
              <button
                onClick={() => { onPaste?.(); setOpen(false); setHover(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: 'none', border: 'none',
                  padding: '6px 14px', fontSize: 12, color: '#4a90d9',
                  cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                  width: '100%',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#f0f7ff'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <span style={{ width: 18, fontFamily: 'monospace', fontSize: 10, flexShrink: 0 }}>📋</span>
                Indsæt {clipboard.type}
              </button>
            </div>
          )}

          {/* My Calculations — dynamic section */}
          {templates.length > 0 && (
            <div>
              <div style={{
                fontSize: 9, fontWeight: 700, color: '#bbb',
                letterSpacing: '0.1em', textTransform: 'uppercase',
                padding: '10px 14px 4px',
                borderTop: '1px solid #f0f0f0',
              }}>
                Mine beregninger
              </div>
              {templates.map(tmpl => (
                <button
                  key={tmpl.id}
                  onClick={() => { onAddTemplate?.(tmpl); setOpen(false); setHover(false) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: 'none', border: 'none',
                    padding: '6px 14px', fontSize: 12, color: '#333',
                    cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                    width: '100%',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f5f5f7'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  <span style={{ width: 18, fontFamily: 'monospace', fontSize: 10, color: '#999', flexShrink: 0 }}>⚙</span>
                  {tmpl.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BlockList({ blocks, onChange, templates = [], onManageTemplates, onOpenTemplateEditor, clipboard, onCopyBlock, project, focusRequest }) {
  const confirm = useConfirm()
  const [selectedId,  setSelectedId]  = useState(null)
  // IDs of selected blocks where the editor is collapsed (preview only, blue border)
  const [minimised,   setMinimised]   = useState(() => new Set())
  // Id og ikke indeks. Et indeks peger paa en plads i listen, og pladsen
  // betyder noget andet, saa snart listen aendrer sig -- saa var det pludselig
  // en anden blok, der stod og lyste som den, man trak i.
  const [dragId,      setDragId]      = useState(null)
  const [dropId,      setDropId]      = useState(null)
  const pageRef = useRef(null)

  // Click outside page → deselect. Clicks inside dialogs and menus (rendered
  // outside the page) must not count as "outside".
  useEffect(() => {
    const fn = e => {
      if (!pageRef.current || pageRef.current.contains(e.target)) return
      if (e.target.closest?.('.ui-overlay, .ui-menu, .ui-toasts, .fem-ws')) return
      setSelectedId(null)
    }
    document.addEventListener('pointerdown', fn)
    return () => document.removeEventListener('pointerdown', fn)
  }, [])

  // Jump to a block on request (from the export and issue checklists)
  useEffect(() => {
    if (!focusRequest) return
    const id = focusRequest.id
    if (!blocks.some(b => b.id === id)) return
    setSelectedId(id)
    setMinimised(prev => { const s = new Set(prev); s.delete(id); return s })
    requestAnimationFrame(() => {
      const el = pageRef.current?.querySelector(`[data-block-id="${id}"]`)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      el.classList.remove('ed-flash'); void el.offsetWidth; el.classList.add('ed-flash')
    })
  }, [focusRequest])   // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mutations ──────────────────────────────────────────────────────────
  //
  // The rows below are memoised, so the handlers they receive must keep their
  // identity between renders. They live on one stable object and read the
  // current blocks through a ref; reassigning them every render keeps them
  // current without giving the rows a reason to re-render.
  const blocksRef = useRef(blocks)
  blocksRef.current = blocks
  const h = useRef({}).current

  const reveal = (id) => setMinimised(prev => { const s = new Set(prev); s.delete(id); return s })

  h.updateBlock = (id, b) => h.updateBlocks([[id, b]])

  // Several blocks in one change. "Laster på rammen" writes its own result
  // and the loads into the frame analysis together; two separate updates
  // would each start from the same list, and the second would undo the first.
  h.updateBlocks = (pairs) => {
    let n = blocksRef.current
    for (const [id, b] of pairs) n = stampBlock(n, id, b)
    if (n !== blocksRef.current) onChange(n)
  }

  function stampBlock(cur, id, b) {
    const i = cur.findIndex(x => x.id === id)
    if (i < 0) return cur
    const oldD = cur[i]?.data || {}
    const newD = b.data || {}
    // Fresh result arrived → stamp the input hash it was computed from.
    const gotNewResult =
      (newD._result      && newD._result      !== oldD._result) ||
      (newD._summary     && newD._summary     !== oldD._summary) ||
      (newD._output_text && newD._output_text !== oldD._output_text)
    if (gotNewResult) {
      b = { ...b, data: { ...newD,
        _input_hash: hashCalcInputs(newD),
        _calc_rev:   calcRevision(b.type),
      } }
    } else if (newD._input_hash && !newD._result && !newD._summary && !newD._output_text) {
      // Result cleared → drop the hash so the block isn't flagged stale.
      const { _input_hash, _calc_rev, ...rest } = newD
      b = { ...b, data: rest }
    }
    const n = [...cur]; n[i] = b
    return n
  }

  h.insertAt = (atIndex, nb, select = true) => {
    const n = [...blocksRef.current]; n.splice(atIndex, 0, nb); onChange(n)
    if (select) { setSelectedId(nb.id); reveal(nb.id) }
  }

  h.addBlock = (type, atIndex) => {
    const def = TYPE_MAP[type]; if (!def) return
    h.insertAt(atIndex, { id: Date.now(), type, data: { ...def.default } })
  }

  h.duplicateBlock = (id) => {
    const cur = blocksRef.current
    const i = cur.findIndex(x => x.id === id)
    if (i < 0) return
    h.insertAt(i + 1, { ...JSON.parse(JSON.stringify(cur[i])), id: Date.now() })
  }

  h.pasteBlock = (atIndex) => {
    if (!clipboard) return
    h.insertAt(atIndex, { ...JSON.parse(JSON.stringify(clipboard)), id: Date.now() })
  }

  h.addSavedCalcBlock = (template, atIndex) => {
    h.insertAt(atIndex, {
      id: Date.now(),
      type: 'saved_calc',
      data: { title: template.name, template_id: template.id, params: {}, _result: null },
    })
  }

  h.addBlockAfter = (blockId, type, customData = {}) => {
    const def = TYPE_MAP[type]; if (!def) return
    const idx = blocksRef.current.findIndex(b => b.id === blockId)
    h.insertAt(idx >= 0 ? idx + 1 : blocksRef.current.length,
               { id: Date.now(), type, data: { ...def.default, ...customData } })
  }

  h.addBlocksAfter = (blockId, newBlocks) => {
    const cur = blocksRef.current
    const idx = cur.findIndex(b => b.id === blockId)
    const insertAt = idx >= 0 ? idx + 1 : cur.length
    const created = newBlocks.map((b, i) => ({
      id: Date.now() + i + 1,
      type: b.type,
      data: { ...(TYPE_MAP[b.type]?.default ?? {}), ...b.data },
    }))
    const n = [...cur]; n.splice(insertAt, 0, ...created); onChange(n)
    setMinimised(prev => {
      const s = new Set(prev)
      created.forEach(b => s.delete(b.id))
      return s
    })
  }

  h.deleteBlock = async (id) => {
    const b = blocksRef.current.find(x => x.id === id)
    if (!b) return
    const name = b.data?.title || b.data?.text || TYPE_MAP[b.type]?.label || 'blokken'
    const ok = await confirm({
      title: `Slet "${String(name).slice(0, 60)}"?`,
      body: 'Du kan fortryde med Ctrl+Z.',
      confirmLabel: 'Slet blok',
      danger: true,
    })
    if (!ok) return
    if (id === selectedId) setSelectedId(null)
    onChange(blocksRef.current.filter(x => x.id !== id))
  }

  h.move = (id, dir) => {
    const n = [...blocksRef.current]
    const i = n.findIndex(x => x.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= n.length) return
    ;[n[i], n[j]] = [n[j], n[i]]
    onChange(n)
  }

  h.toggleMinimise = (id) => {
    setMinimised(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  h.selectBlock = (id) => {
    setSelectedId(id)
    reveal(id)   // auto-expand when selecting
  }

  h.copyBlock = (id) => {
    const b = blocksRef.current.find(x => x.id === id)
    if (b) onCopyBlock?.(b)
  }

  h.openTemplateEditor = (id) => onOpenTemplateEditor?.(id)

  // ── Drag ──────────────────────────────────────────────────────────────

  // En blok traekkes KUN i haandtaget.
  //
  // Foer stod draggable paa hele blokken, og saa er et tal i et felt ikke til
  // at markere: browseren ser en museknap trykket ned inde i noget, der kan
  // traekkes, og begynder at flytte blokken i stedet for at markere teksten.
  // Det samme gjaldt enhver tekst i blokken -- et resultat kunne ikke kopieres
  // uden at dokumentet skiftede rundt paa sig selv.
  //
  // Haandtaget stod der hele tiden ("Traek for at flytte"); det var bare ikke
  // det eneste sted, der trak. Nu er det.
  // Hvor museknappen gik ned. Ikke hvor dragstart siger, den gik ned:
  // dragstart afgives paa det element, der baerer draggable -- altsaa blokken
  // selv -- saa e.target dér er den samme uanset, hvad man tog fat i. Musen
  // ved det, og mousedown kommer foerst.
  const fraHaandtag = useRef(false)
  const traekId = useRef(null)

  function slutTraek() {
    setDragId(null); setDropId(null); fraHaandtag.current = false; traekId.current = null
  }

  h.onMouseDownBlok = (e) => {
    fraHaandtag.current = !!e.target.closest?.('[data-drag-handle]')
  }
  h.onDragStart = (e, id) => {
    if (!fraHaandtag.current) { e.preventDefault(); return }
    traekId.current = id
    setDragId(id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(id))
  }
  h.onDragOver = (e, id) => { e.preventDefault(); setDropId(d => (d === id ? d : id)) }
  h.onDrop = (e, id) => {
    e.preventDefault()
    const cur = blocksRef.current
    const fra = cur.findIndex(b => b.id === traekId.current)
    const til = cur.findIndex(b => b.id === id)
    if (fra >= 0 && til >= 0 && fra !== til) {
      const n = [...cur]; const [m] = n.splice(fra, 1); n.splice(til, 0, m); onChange(n)
    }
    slutTraek()
  }
  h.onDragEnd = () => slutTraek()

  // Nettet under traekket.
  //
  // Den graa blok var det her: blokken tegnes med opacity 0,3 mens den
  // traekkes, og den tilstand blev ryddet ét sted -- i dragend paa blokkens
  // eget element. Udeblev den begivenhed, blev blokken graa og BLEV det.
  // Hverken et klik, en tast eller en ny beregning kunne faa den tilbage; kun
  // et nyt traek, der lykkedes.
  //
  // Og den udeblev. Et traek, der startede inde i et talfelt -- hvad det
  // gjorde indtil for lidt siden -- har feltets tekst som kilde, og feltet
  // gentegnes under traekket. Saa er kildeelementet vaek, og dragend har ingen
  // at komme til.
  //
  // Derfor: hvert eneste tegn paa at gestussen er slut rydder nu. dragend og
  // drop paa vinduet fanger det normale forloeb uanset hvilket element de
  // rammer; Escape fanger en afbrudt traekning; og et museklik et vilkaarligt
  // sted fanger resten -- for saa er brugeren gaaet videre, og saa er traekket
  // slut, uanset hvad browseren fik sagt.
  useEffect(() => {
    if (dragId === null) return
    const paaTast = e => { if (e.key === 'Escape') slutTraek() }
    window.addEventListener('dragend',   slutTraek)
    window.addEventListener('drop',      slutTraek)
    window.addEventListener('mousedown', slutTraek)
    window.addEventListener('keydown',   paaTast)
    return () => {
      window.removeEventListener('dragend',   slutTraek)
      window.removeEventListener('drop',      slutTraek)
      window.removeEventListener('mousedown', slutTraek)
      window.removeEventListener('keydown',   paaTast)
    }
  }, [dragId])

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div style={s.outer}>

      {/* ── Left block-type panel ── */}
      <aside style={s.panel} aria-label="Tilføj blok">
        {PANEL_GROUPS.map((group, gi) => (
          <div key={group.label}>
            <div style={{ ...s.panelSection, borderTop: gi === 0 ? 'none' : '1px solid var(--line)' }}>
              {group.label}
            </div>
            {group.types.map(type => {
              const def = TYPE_MAP[type]
              if (!def) return null
              return (
                <button
                  key={def.type}
                  className="bl-panel-btn"
                  style={s.panelBtn}
                  onClick={() => h.addBlock(def.type, blocks.length)}
                  title={`Tilføj ${def.label} nederst i dokumentet`}
                >
                  <span style={{ ...s.panelIcon, background: def.color ?? '#64748b' }}>{def.icon}</span>
                  {def.label}
                </button>
              )
            })}
          </div>
        ))}

        {/* ── My Calculations ── */}
        <div>
          <div style={{ ...s.panelSection, borderTop: '1px solid var(--line)' }}>
            Mine beregninger
          </div>

          {templates.length === 0 && (
            <div style={{ padding: '4px 12px 6px', fontSize: 11.5, color: 'var(--faint)' }}>
              Ingen gemte beregninger endnu
            </div>
          )}

          {templates.map(tmpl => (
            <button
              key={tmpl.id}
              className="bl-panel-btn"
              style={s.panelBtn}
              onClick={() => h.addSavedCalcBlock(tmpl, blocks.length)}
            >
              <span style={{ ...s.panelIcon, background: 'var(--sunk)', color: 'var(--ink-2)' }}>⚙</span>
              {tmpl.name}
            </button>
          ))}

          {onManageTemplates && (
            <button className="bl-panel-btn" style={{ ...s.panelBtn, color: 'var(--brand-ink)', marginTop: 2 }} onClick={onManageTemplates}>
              <span style={{ ...s.panelIcon, background: 'var(--brand-wash)', color: 'var(--brand-ink)' }}>✎</span>
              Administrér beregninger
            </button>
          )}
        </div>

      </aside>

      {/* ── Document page ── */}
      <div ref={pageRef} style={s.page} onClick={() => setSelectedId(null)}>

        {blocks.length === 0 && (
          <div style={s.empty}>
            Dokumentet er tomt. Vælg en bloktype i panelet til venstre, start fra en skabelon
            ovenfor, eller hold musen her og brug <strong>+</strong>.
          </div>
        )}

        <AddZone
          onAdd={t => h.addBlock(t, 0)}
          templates={templates}
          onAddTemplate={t => h.addSavedCalcBlock(t, 0)}
          clipboard={clipboard}
          onPaste={() => h.pasteBlock(0)}
        />

        {blocks.map((block, index) => (
          <BlockRow
            key={block.id}
            block={block}
            index={index}
            isFirst={index === 0}
            isLast={index === blocks.length - 1}
            isSelected={selectedId === block.id}
            isMinimised={minimised.has(block.id)}
            isDragging={dragId === block.id}
            isTarget={dropId === block.id && dragId !== block.id}
            // Only the open editor needs the sibling blocks (for its pickers)
            // and only the document list needs the project — passing them to
            // every row would re-render every row on every keystroke.
            blocks={selectedId === block.id ? blocks : null}
            project={block.type === 'doclist' ? project : null}
            templates={templates}
            clipboard={clipboard}
            h={h}
          />
        ))}

      </div>
    </div>
  )
}

// ── One block + the add-zone below it ─────────────────────────────────────────

const BlockRow = React.memo(function BlockRow({
  block, index, isFirst, isLast, isSelected, isMinimised, isDragging, isTarget,
  blocks, project, templates, clipboard, h,
}) {
  const Comp             = TYPE_MAP[block.type]?.component
  const showEditor       = isSelected && !isMinimised && !!Comp
  const isInlineEditable = ['text', 'heading'].includes(block.type)
  const id = block.id
  const onBlockChange = useCallback(b => h.updateBlock(id, b), [h, id])
  const onAddBlock    = useCallback((type, data) => h.addBlockAfter(id, type, data), [h, id])
  const onUpdateBlock = useCallback((pairs) => h.updateBlocks(pairs), [h])
  const onAddBlocks   = useCallback((arr) => h.addBlocksAfter(id, arr), [h, id])

  return (
    <>
      <div
        data-block-id={id}
        draggable
        onMouseDown={h.onMouseDownBlok}
        onDragStart={e => h.onDragStart(e, id)}
        onDragOver={e  => h.onDragOver(e, id)}
        onDrop={e      => h.onDrop(e, id)}
        onDragEnd={h.onDragEnd}
        onClick={e => { e.stopPropagation(); h.selectBlock(id) }}
        style={{
          ...s.block,
          ...(isSelected ? s.blockSelected : {}),
          ...(isTarget   ? { borderTop: '2px solid var(--brand)' } : {}),
          opacity: isDragging ? 0.3 : 1,
        }}
      >
        {/* Floating controls — drag handle always, others when selected */}
        <div style={s.floatControls}>
          {/* Det eneste sted, blokken kan trækkes i. Derfor er den
              tydeligere end før — et håndtag, der er det eneste, der
              virker, må ikke være det svageste på siden. */}
          <span
            data-drag-handle
            style={s.dragHandle}
            onPointerDown={e => e.stopPropagation()}
            title="Træk for at flytte blokken"
          >⠿</span>
          {isSelected && (
            <span style={s.floatBtns} onClick={e => e.stopPropagation()}>
              <button style={s.fb} onClick={() => h.toggleMinimise(id)}
                title={isMinimised ? 'Vis indtastning' : 'Skjul indtastning'}>
                {isMinimised ? '▼' : '▲'}
              </button>
              <button style={s.fb} onClick={() => h.move(id, -1)} disabled={isFirst} title="Flyt op">↑</button>
              <button style={s.fb} onClick={() => h.move(id, +1)} disabled={isLast}  title="Flyt ned">↓</button>
              <button style={s.fb} onClick={() => h.duplicateBlock(id)} title="Duplikér blok">⧉</button>
              <button style={s.fb} onClick={() => h.copyBlock(id)} title="Kopiér blok (kan indsættes i alle dokumenter)">Kopiér</button>
              {clipboard && (
                <button style={s.fb} onClick={() => h.pasteBlock(index + 1)} title="Indsæt kopieret blok efter denne">Indsæt</button>
              )}
              <button style={{ ...s.fb, ...s.fbDel }} onClick={() => h.deleteBlock(id)} title="Slet blok">Slet</button>
            </span>
          )}
        </div>

        {/* Content */}
        <div style={s.blockBody}>
          {isInlineEditable ? (
            /* Text + heading: always render editor inline as the document content */
            <div onClick={e => e.stopPropagation()}>
              <Suspense fallback={<BlockPreview block={block} project={project} />}>
                <Comp block={block} onChange={onBlockChange} isSelected={isSelected} />
              </Suspense>
            </div>
          ) : (
            <>
              {/* Preview is always shown for non-inline blocks */}
              <BlockPreview block={block} project={project} />

              {/* Editor — only when selected AND not minimised */}
              {showEditor && (
                <div style={s.editor} onClick={e => e.stopPropagation()}>
                  {isStaleResult(block) && (
                    <div style={{
                      background: 'var(--warn-wash)', border: '1px solid #f3d3a4',
                      color: 'var(--warn)', fontSize: 12, fontWeight: 600,
                      padding: '7px 12px', marginBottom: 10, borderRadius: 'var(--radius-sm)',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      <span>⟳</span>
                      {staleReason(block)}
                    </div>
                  )}
                  <Suspense fallback={<div style={{ padding: 12, color: 'var(--muted)', fontSize: 12 }}>Indlæser…</div>}>
                    <Comp
                      block={block}
                      onChange={onBlockChange}
                      onOpenTemplateEditor={h.openTemplateEditor}
                      blocks={blocks ?? []}
                      onAddBlock={onAddBlock}
                      onAddBlocks={onAddBlocks}
                      onUpdateBlock={onUpdateBlock}
                    />
                  </Suspense>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <AddZone
        onAdd={t => h.addBlock(t, index + 1)}
        templates={templates}
        onAddTemplate={t => h.addSavedCalcBlock(t, index + 1)}
        clipboard={clipboard}
        onPaste={() => h.pasteBlock(index + 1)}
      />
    </>
  )
})

// ── Styles ────────────────────────────────────────────────────────────────────
// Hover states for the palette live in editor.css (.bl-panel-btn).

const s = {
  outer: {
    display:    'flex',
    gap:        20,
    alignItems: 'flex-start',
    minHeight:  '100%',
  },

  // ── Left panel ────────────────────────────────────────────────────────
  panel: {
    width:        184,
    flexShrink:   0,
    background:   'var(--surface)',
    border:       '1px solid var(--line)',
    borderRadius: 'var(--radius)',
    paddingBottom: 10,
    position:     'sticky',
    top:          0,
    maxHeight:    'calc(100vh - 140px)',
    overflowY:    'auto',
  },
  panelSection: {
    fontSize:      10.5,
    fontWeight:    600,
    fontFamily:    'var(--font-mono)',
    color:         'var(--faint)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    padding:       '12px 12px 4px',
  },
  panelBtn: {
    display:    'flex',
    alignItems: 'center',
    gap:        8,
    width:      '100%',
    border:     'none',
    padding:    '5px 12px',
    fontSize:   12.5,
    color:      'var(--ink-2)',
    textAlign:  'left',
    cursor:     'pointer',
    fontFamily: 'inherit',
  },
  panelIcon: {
    display:        'inline-flex',
    alignItems:     'center',
    justifyContent: 'center',
    width:  28,
    height: 18,
    fontSize:   9,
    fontWeight: 700,
    fontFamily: 'var(--font-mono)',
    letterSpacing: '0.04em',
    flexShrink: 0,
    borderRadius: 3,
    color: '#fff',
  },

  // ── Document page ─────────────────────────────────────────────────────
  page: {
    flex:       1,
    minWidth:   0,
    maxWidth:   760,
    background: 'var(--surface)',
    padding:    '44px 56px 80px',
    boxShadow:  'var(--shadow-doc)',
    borderRadius: 2,
    boxSizing:  'border-box',
  },
  empty: {
    color: 'var(--muted)', fontSize: 13, padding: '32px 0 8px', textAlign: 'center', lineHeight: 1.6,
  },

  // ── Individual block ──────────────────────────────────────────────────
  block: {
    position:    'relative',
    paddingLeft: 12,
    marginLeft:  -15,
    borderLeft:  '3px solid transparent',
    transition:  'border-color 0.1s',
    cursor:      'pointer',
  },
  blockSelected: {
    borderLeft: '3px solid var(--brand)',
    cursor:     'default',
  },

  // Floating control strip (top-right, only visible when selected)
  floatControls: {
    position:   'absolute',
    top:        8,
    right:      -8,
    display:    'flex',
    alignItems: 'center',
    gap:        2,
    zIndex:     10,
  },
  dragHandle: {
    color: 'var(--faint)', cursor: 'grab', fontSize: 14,
    padding: '2px 4px', userSelect: 'none', lineHeight: 1,
  },
  floatBtns: {
    display: 'flex', gap: 2,
  },
  fb: {
    background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 3,
    padding: '2px 7px', fontSize: 11, color: 'var(--ink-2)',
    cursor: 'pointer', lineHeight: 1.5,
  },
  fbDel: {
    color: 'var(--fail)', borderColor: '#f1c5c5',
  },

  blockBody: {
    padding: '10px 0 10px 0',
  },

  // Editor that appears below the preview when expanded
  editor: {
    marginTop:  14,
    paddingTop: 14,
    borderTop:  '1px solid var(--line)',
  },
}
