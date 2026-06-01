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
import React, { useState, useRef, useEffect } from 'react'

import HeadingBlock      from './HeadingBlock.jsx'
import TableBlock        from './TableBlock.jsx'
import TextBlock         from './TextBlock.jsx'
import ImageBlock        from './ImageBlock.jsx'
import PythonBlock       from './PythonBlock.jsx'
import CustomCalcBlock   from './CustomCalcBlock.jsx'
import SteelBeamBlock    from './SteelBeamBlock.jsx'
import RCBeamBlock       from './RCBeamBlock.jsx'
import RCColumnBlock     from './RCColumnBlock.jsx'
import RCSlabBlock       from './RCSlabBlock.jsx'
import TimberBeamBlock   from './TimberBeamBlock.jsx'
import TimberColumnBlock from './TimberColumnBlock.jsx'
import MasonryWallBlock  from './MasonryWallBlock.jsx'
import BeamFemBlock      from './BeamFemBlock.jsx'
import FrameFemBlock          from './FrameFemBlock.jsx'
import PortalFrameFemBlock    from './PortalFrameFemBlock.jsx'
import GeneralFrameFemBlock  from './GeneralFrameFemBlock.jsx'
import FrameLoadCasesBlock  from './FrameLoadCasesBlock.jsx'
import WindLoadBlock       from './WindLoadBlock.jsx'
import SnowLoadBlock       from './SnowLoadBlock.jsx'
import RoofDeadLoadBlock   from './RoofDeadLoadBlock.jsx'
import FoundationBlock     from './FoundationBlock.jsx'
import LoadComboBlock      from './LoadComboBlock.jsx'
import BeamColumnBlock     from './BeamColumnBlock.jsx'
import BoltConnectionBlock from './BoltConnectionBlock.jsx'
import PlateGirderBlock    from './PlateGirderBlock.jsx'
import SavedCalcBlock      from './SavedCalcBlock.jsx'
import ControlPlanBlock    from './ControlPlanBlock.jsx'
import ProjectBasisBlock   from './ProjectBasisBlock.jsx'

// ── Block registry ────────────────────────────────────────────────────────────

// icon: short text badge shown in the left panel (max 3 chars, monospace)
const BLOCK_TYPES = [
  { type: 'project_basis', label: 'Project Basis (A1)', icon: 'A1', color: '#0f172a', component: ProjectBasisBlock,
    default: { title: 'Project Basis', consequence_class: 'CC2', wind_zone: 2, terrain_category: 'II',
               snow_zone: 1, gamma_M0: 1.00, gamma_M1: 1.00, gamma_M2: 1.25,
               gamma_c: 1.50, gamma_s: 1.15, gamma_M_timber: 1.30, _exports: null } },
  { type: 'heading',       label: 'Heading',           icon: 'H',   color: '#64748b', component: HeadingBlock,
    default: { level: 1, text: '' } },
  { type: 'text',          label: 'Paragraph',         icon: 'TXT', color: '#64748b', component: TextBlock,
    default: { text: '' } },
  { type: 'image',         label: 'Image',             icon: 'IMG', color: '#64748b', component: ImageBlock,
    default: { image_b64: null, caption: '', width_pct: 100 } },
  { type: 'table',         label: 'Table',             icon: 'TBL', color: '#64748b', component: TableBlock,
    default: { caption: '', has_header: true, rows: [['Kolonne 1', 'Kolonne 2'], ['', '']] } },
  { type: 'custom_calc',   label: 'Custom calc',       icon: 'CLC', color: '#7c3aed', component: CustomCalcBlock,
    default: { title: 'Custom Calculation', items: [], _result: null } },
  { type: 'python_calc',   label: 'Python script',     icon: 'PY',  color: '#0284c7', component: PythonBlock,
    default: { title: 'Python Script',
               code: 'import numpy as np\n\nx = np.linspace(0, 10, 100)\nprint(f"Max x = {x.max():.1f}")',
               _output_text: '', _figs_b64: [], _error: '' } },
  { type: 'steel_beam',    label: 'Steel beam',        icon: 'SB',  color: '#1e3a5f', component: SteelBeamBlock,
    default: { title: 'Steel Beam Check', label: 'S1', section: 'IPE300', grade: 'S355',
               span_m: 5.0, load_type: 'udl', trib_width_m: 1.0, g_k_kNm: 5.0, q_k_kNm: 3.0,
               gamma_M0: 1.0, gamma_M1: 1.0,
               ltb_restrained: false, buck_y_restrained: false, buck_x_restrained: false, _result: null } },
  { type: 'rc_beam',       label: 'RC beam',           icon: 'RCB', color: '#374151', component: RCBeamBlock,
    default: { title: 'RC Beam Check', label: 'B1', span_m: 5.0, b_mm: 300, h_mm: 500,
               d_mm: 450, g_k_kNm: 10.0, q_k_kNm: 6.0, f_ck_MPa: 30, f_yk_MPa: 500,
               As_prov_mm2: null, gamma_C: 1.5, gamma_S: 1.15, _result: null } },
  { type: 'rc_column',     label: 'RC column',         icon: 'RCC', color: '#374151', component: RCColumnBlock,
    default: { title: 'RC Column Check', label: 'C1', h_mm: 300, b_mm: 300, c_mm: 40,
               fck_mpa: 30, fyk_mpa: 500, gamma_c: 1.5, gamma_s: 1.15,
               da_c_mm: 16, n_c: 2, da_t_mm: 16, n_t: 2,
               Ls_mm: 3500, beta_eff: 1.0,
               load_cases: [{ label: 'LC1', NEd_kN: 400, M0Ed_kNm: 20 }], _result: null } },
  { type: 'rc_slab',       label: 'RC slab',           icon: 'RCS', color: '#374151', component: RCSlabBlock,
    default: { title: 'RC Slab Check', label: 'D1', span_m: 5.0, h_mm: 200, d_mm: 165,
               g_k_kNm2: 3.5, q_k_kNm2: 2.5, fck_MPa: 30, fyk_MPa: 500,
               As_prov_mm2m: null, gamma_C: 1.5, gamma_S: 1.15, cover_mm: 35, _result: null } },
  { type: 'timber_beam',   label: 'Timber beam',       icon: 'TB',  color: '#92400e', component: TimberBeamBlock,
    default: { title: 'Timber Beam Check', label: 'T1', span_m: 4.0, b_mm: 90, h_mm: 220,
               g_k_kNm: 3.0, q_k_kNm: 2.0, timber_grade: 'C24', service_class: 1,
               load_duration: 'medium', gamma_M: 1.3,
               compression_edge_restrained: true, torsional_restraint_at_supports: true, _result: null } },
  { type: 'timber_column', label: 'Timber column',     icon: 'TC',  color: '#92400e', component: TimberColumnBlock,
    default: { title: 'Timber Column Check', label: 'C1', length_m: 3.0, N_Ed_kN: 50.0,
               M_Ed_kNm: 0.0, b_mm: 120, h_mm: 120, timber_grade: 'C24', service_class: 1,
               load_duration: 'medium', gamma_M: 1.3, effective_length_factor: 1.0,
               l_ef_ltb_m: null, _result: null } },
  { type: 'masonry_wall',  label: 'Masonry wall',      icon: 'MSN', color: '#78350f', component: MasonryWallBlock,
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
  { type: 'general_frame_fem', label: 'General Frame FEM', icon: 'GF',  color: '#0f766e', component: GeneralFrameFemBlock,
    default: { title: '2D Frame FEM',
               nodes:    [{ id: 1, x: 0, y: 0 }, { id: 2, x: 0, y: 4 }, { id: 3, x: 6, y: 4 }, { id: 4, x: 6, y: 0 }],
               elements: [
                 { id: 1, ni: 1, nj: 2, type: 'beam', release: 'none', E_GPa: 210, A_cm2: 39.1, Iz_cm4: 3892 },
                 { id: 2, ni: 2, nj: 3, type: 'beam', release: 'none', E_GPa: 210, A_cm2: 53.8, Iz_cm4: 8356 },
                 { id: 3, ni: 4, nj: 3, type: 'beam', release: 'none', E_GPa: 210, A_cm2: 39.1, Iz_cm4: 3892 },
               ],
               supports: [{ node_id: 1, ux: true, uy: true, rz: true }, { node_id: 4, ux: true, uy: true, rz: true }],
               loads:    [{ type: 'udl', elem_id: 2, wy_kNm: 20, wx_kNm: 0 }],
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
  { type: 'wind_load',     label: 'Wind load',         icon: 'WND', color: '#0369a1', component: WindLoadBlock,
    default: { title: 'Wind Load', label: 'W1', terrain_category: 'II',
               v_b0_ms: 24.0, z_ref_m: 8.0, h_m: 8.0, b_m: 10.0, d_m: 12.0,
               c_dir: 1.0, c_season: 1.0, c_pe_windward: 0.8, c_pe_leeward: -0.5,
               c_pi: 0.2, rho_air: 1.25, _result: null } },
  { type: 'snow_load',     label: 'Snow load',         icon: 'SNW', color: '#0369a1', component: SnowLoadBlock,
    default: { title: 'Snow Load', label: 'SN1', roof_type: 'pitched',
               alpha_deg: 20.0, s_k_kNm2: 1.0, dk_zone: '1',
               C_e: 1.0, C_t: 1.0, roof_span_m: 8.0, eave_height_m: 3.0,
               gamma_s: 1.5, a_m: 0.0, _result: null } },
  { type: 'roof_dead_load', label: 'Roof dead load',  icon: 'RDL', color: '#0369a1', component: RoofDeadLoadBlock,
    default: { title: 'Roof Dead Load', label: 'G1', alpha_deg: 30.0, a_m: 1.0,
               layers: [
                 { description: 'Tegltagsten (monier)',        g_kNm2: 0.55 },
                 { description: 'Lægte + kontralägte (38 mm)', g_kNm2: 0.04 },
                 { description: 'Undertag (vindspærrepap)',     g_kNm2: 0.03 },
                 { description: 'Krydsfinérsarking 12 mm',     g_kNm2: 0.07 },
                 { description: 'Isolering 200 mm (glasuld)',   g_kNm2: 0.04 },
                 { description: 'Dampspærre',                  g_kNm2: 0.01 },
               ],
               b_mm: 45.0, h_mm: 145.0, rho_kgm3: 380.0, _result: null } },
  { type: 'foundation',    label: 'Foundation',        icon: 'FND', color: '#57534e', component: FoundationBlock,
    default: { title: 'Foundation Bearing Check', label: 'F1',
               B_m: 1.5, L_m: 2.0, D_m: 0.8,
               c_kPa: 5.0, phi_deg: 30.0, gamma_kNm3: 18.0, gamma_b_kNm3: 10.0,
               water_table: false, V_Ed_kN: 300.0, H_Ed_kN: 0.0, M_Ed_kNm: 0.0,
               gamma_phi: 1.0, gamma_c: 1.0, gamma_Rv: 1.4, _result: null } },
  { type: 'load_combo',    label: 'Load combinations', icon: 'LC',  color: '#9333ea', component: LoadComboBlock,
    default: { title: 'Load Combinations', label: 'LC1', unit: 'kN/m',
               G_k: 5.0, G_fav: false, loads: [], method: '6.10ab', _result: null } },
  { type: 'beam_column',   label: 'Beam-column (N+M)', icon: 'BC',  color: '#1e3a5f', component: BeamColumnBlock,
    default: { title: 'Beam-Column Check', label: 'BC1', section: 'HEB200', grade: 'S355',
               N_Ed_kN: 200, My_Ed_kNm: 50, Mz_Ed_kNm: 0,
               L_y_m: 4.0, L_z_m: 4.0, L_LTB_m: 4.0,
               k_y: 1.0, k_z: 1.0, C_my: 1.0, C_mz: 1.0, C_mLT: 1.0,
               ltb_restrained: false, gamma_M0: 1.0, gamma_M1: 1.0, _result: null } },
  { type: 'bolt_group',    label: 'Bolt group',        icon: 'BLT', color: '#1e3a5f', component: BoltConnectionBlock,
    default: { title: 'Connection Check', label: 'BG1', mode: 'bolts',
               n_bolts: 4, bolt_class: '8.8', d_mm: 20, shear_plane: 'thread',
               n_shear_planes: 1, t_plate_mm: 10, f_u_plate_MPa: 510,
               e1_mm: 40, e2_mm: 40, p1_mm: 60, V_Ed_kN: 100, gamma_M2: 1.25,
               _result: null } },
  { type: 'fillet_weld',   label: 'Fillet weld',       icon: 'WLD', color: '#1e3a5f', component: BoltConnectionBlock,
    default: { title: 'Weld Check', label: 'W1', mode: 'weld',
               a_mm: 6, L_mm: 200, F_Ed_kN: 80, steel_grade: 'S355',
               gamma_M2: 1.25, _result: null } },
  { type: 'plate_girder',  label: 'Plate girder',       icon: 'PG',  color: '#1e3a5f', component: PlateGirderBlock,
    default: { title: 'Plate Girder Check', label: 'PG1', grade: 'S355',
               h_w_mm: 1200, t_w_mm: 12, b_f_mm: 400, t_f_mm: 25,
               a_mm: 2000, eta: 1.0, rigid_end_post: true,
               V_Ed_kN: 0, M_Ed_kNm: 0,
               gamma_M0: 1.0, gamma_M1: 1.0, _result: null } },
  { type: 'saved_calc',    label: 'My Calculation',     icon: 'TPL', color: '#2563eb', component: SavedCalcBlock,
    default: { title: '', template_id: null, params: {}, _result: null } },
  { type: 'control_plan', label: 'Kontrolplan (DS 1140)', icon: 'KP', color: '#1e3a5f', component: ControlPlanBlock,
    default: { title: 'Kontrolplan', mode: 'plan', items: [] } },
]

const TYPE_MAP = Object.fromEntries(BLOCK_TYPES.map(t => [t.type, t]))

// ── Panel groups ──────────────────────────────────────────────────────────────

const PANEL_GROUPS = [
  {
    label: 'Project',
    types: ['project_basis'],
  },
  {
    label: 'Content',
    types: ['heading', 'text', 'image', 'table'],
  },
  {
    label: 'Loads  (EN 1990)',
    types: ['load_combo', 'frame_load_cases'],
  },
  {
    label: 'Steel  (EC3)',
    types: ['steel_beam', 'beam_column'],
  },
  {
    label: 'Timber  (EC5)',
    types: ['timber_beam', 'timber_column'],
  },
  {
    label: 'Masonry  (EC6)',
    types: ['masonry_wall'],
  },
  {
    label: 'Analysis',
    types: ['beam_fem', 'general_frame_fem', 'portal_frame_fem'],
  },
  {
    label: 'Custom',
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

// ── Block preview (rendered document content) ─────────────────────────────────

function BlockPreview({ block }) {
  const d = block.data
  switch (block.type) {

    case 'heading': {
      const sz = { 1: 26, 2: 20, 3: 16 }[d.level] || 18
      return (
        <div style={{ fontSize: sz, fontWeight: 700, lineHeight: 1.3, padding: '2px 0',
                      color: d.text ? '#1c1c1e' : '#ccc' }}>
          {d.text || 'Untitled heading'}
        </div>
      )
    }

    case 'text':
      return (
        <p style={{ fontSize: 14, lineHeight: 1.75, margin: 0, whiteSpace: 'pre-wrap',
                    color: d.text ? '#333' : '#bbb' }}>
          {d.text || 'Empty paragraph — click to edit'}
        </p>
      )

    case 'image':
      return d.image_b64
        ? <div>
            <img src={d.image_b64} alt={d.caption || ''}
                 style={{ maxWidth: (d.width_pct || 100) + '%', display: 'block' }} />
            {d.caption && <p style={{ fontSize: 12, color: '#888', marginTop: 6, fontStyle: 'italic' }}>{d.caption}</p>}
          </div>
        : <div style={{ color: '#bbb', fontSize: 13, padding: '10px 0' }}>🖼 Click to add an image</div>

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
      const sz  = d.snow_zone ?? 1
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 20px', fontSize: 13, padding: '2px 0' }}>
          <span style={{ fontWeight: 700, color: '#0f172a' }}>{d.title || 'Project Basis'}</span>
          <span style={{ color: '#475569' }}>{cc}</span>
          <span style={{ color: '#475569' }}>K_FI = {kfi.toFixed(1)}</span>
          <span style={{ color: '#475569' }}>Wind Z{wz}</span>
          <span style={{ color: '#475569' }}>Terrain {d.terrain_category ?? 'II'}</span>
          <span style={{ color: '#475569' }}>Snow Z{sz}</span>
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
      else if (block.type === 'custom_calc')    sub = (d.items || []).length + ' items'
      else if (block.type === 'beam_fem')        sub = `L=${d.L ?? 6} m  ·  E=${d.E_GPa ?? 210} GPa  ·  I=${d.I_cm4 ?? '?'} cm⁴`
      else if (block.type === 'frame_fem')       sub = `${(d.nodes ?? []).length} nodes  ·  ${(d.elements ?? []).length} elements  ·  ${(d.supports ?? []).length} supports`

      return (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', padding: '2px 0' }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#1c1c1e' }}>
            {d.title || TYPE_MAP[block.type]?.label || block.type}
          </span>
          {sub && <span style={{ fontSize: 12, color: '#aaa', fontFamily: 'monospace' }}>{sub}</span>}
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
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
                Paste {clipboard.type}
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
                My Calculations
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

export default function BlockList({ blocks, onChange, templates = [], onManageTemplates, onOpenTemplateEditor, clipboard, onCopyBlock }) {
  const [selectedId,  setSelectedId]  = useState(null)
  // IDs of selected blocks where the editor is collapsed (preview only, blue border)
  const [minimised,   setMinimised]   = useState(() => new Set())
  const [dragIdx,     setDragIdx]     = useState(null)
  const [dropIdx,     setDropIdx]     = useState(null)
  const pageRef = useRef(null)

  // Click outside page → deselect
  useEffect(() => {
    const fn = e => { if (pageRef.current && !pageRef.current.contains(e.target)) setSelectedId(null) }
    document.addEventListener('pointerdown', fn)
    return () => document.removeEventListener('pointerdown', fn)
  }, [])

  // ── Mutations ──────────────────────────────────────────────────────────

  function updateBlock(i, b) { const n = [...blocks]; n[i] = b; onChange(n) }

  function addBlock(type, atIndex) {
    const def = TYPE_MAP[type]; if (!def) return
    const nb = { id: Date.now(), type, data: { ...def.default } }
    const n  = [...blocks]; n.splice(atIndex, 0, nb); onChange(n)
    setSelectedId(nb.id)
    setMinimised(prev => { const s = new Set(prev); s.delete(nb.id); return s })
  }

  function duplicateBlock(i) {
    const src = blocks[i]
    const nb  = { ...JSON.parse(JSON.stringify(src)), id: Date.now() }
    const n   = [...blocks]; n.splice(i + 1, 0, nb); onChange(n)
    setSelectedId(nb.id)
    setMinimised(prev => { const s = new Set(prev); s.delete(nb.id); return s })
  }

  function pasteBlock(atIndex) {
    if (!clipboard) return
    const nb = { ...JSON.parse(JSON.stringify(clipboard)), id: Date.now() }
    const n  = [...blocks]; n.splice(atIndex, 0, nb); onChange(n)
    setSelectedId(nb.id)
    setMinimised(prev => { const s = new Set(prev); s.delete(nb.id); return s })
  }

  function addSavedCalcBlock(template, atIndex) {
    const nb = {
      id: Date.now(),
      type: 'saved_calc',
      data: { title: template.name, template_id: template.id, params: {}, _result: null },
    }
    const n = [...blocks]; n.splice(atIndex, 0, nb); onChange(n)
    setSelectedId(nb.id)
    setMinimised(prev => { const s = new Set(prev); s.delete(nb.id); return s })
  }

  function addBlockAfter(blockId, type, customData = {}) {
    const def = TYPE_MAP[type]; if (!def) return
    const idx = blocks.findIndex(b => b.id === blockId)
    const insertAt = idx >= 0 ? idx + 1 : blocks.length
    const nb = { id: Date.now(), type, data: { ...def.default, ...customData } }
    const n = [...blocks]; n.splice(insertAt, 0, nb); onChange(n)
    setSelectedId(nb.id)
    setMinimised(prev => { const s = new Set(prev); s.delete(nb.id); return s })
  }

  function addBlocksAfter(blockId, newBlocks) {
    const idx = blocks.findIndex(b => b.id === blockId)
    const insertAt = idx >= 0 ? idx + 1 : blocks.length
    const created = newBlocks.map((b, i) => ({
      id: Date.now() + i + 1,
      type: b.type,
      data: { ...(TYPE_MAP[b.type]?.default ?? {}), ...b.data },
    }))
    const n = [...blocks]; n.splice(insertAt, 0, ...created); onChange(n)
    setMinimised(prev => {
      const s = new Set(prev)
      created.forEach(b => s.delete(b.id))
      return s
    })
  }

  function deleteBlock(i, e) {
    e.stopPropagation()
    if (!window.confirm('Delete this block?')) return
    if (blocks[i].id === selectedId) setSelectedId(null)
    onChange(blocks.filter((_, j) => j !== i))
  }

  function moveUp(i)   { if (i === 0) return; const n = [...blocks]; [n[i-1],n[i]]=[n[i],n[i-1]]; onChange(n) }
  function moveDown(i) { if (i === blocks.length-1) return; const n = [...blocks]; [n[i],n[i+1]]=[n[i+1],n[i]]; onChange(n) }

  function toggleMinimise(id, e) {
    e.stopPropagation()
    setMinimised(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  function selectBlock(id) {
    setSelectedId(id)
    // Auto-expand when selecting
    setMinimised(prev => { const s = new Set(prev); s.delete(id); return s })
  }

  // ── Drag ──────────────────────────────────────────────────────────────

  function onDragStart(e, i) { setDragIdx(i); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', i) }
  function onDragOver(e, i)  { e.preventDefault(); if (i !== dragIdx) setDropIdx(i) }
  function onDrop(e, i) {
    e.preventDefault()
    if (dragIdx !== null && dragIdx !== i) {
      const n = [...blocks]; const [m] = n.splice(dragIdx, 1); n.splice(i, 0, m); onChange(n)
    }
    setDragIdx(null); setDropIdx(null)
  }
  function onDragEnd() { setDragIdx(null); setDropIdx(null) }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div style={s.outer}>

      {/* ── Left block-type panel ── */}
      <aside style={s.panel}>
        {PANEL_GROUPS.map((group, gi) => (
          <div key={group.label}>
            <div style={{ ...s.panelSection, borderTop: gi === 0 ? 'none' : '1px solid #f0f0f0' }}>
              {group.label}
            </div>
            {group.types.map(type => {
              const def = TYPE_MAP[type]
              if (!def) return null
              return (
                <button
                  key={def.type}
                  style={s.panelBtn}
                  onClick={() => addBlock(def.type, blocks.length)}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = '#f1f5f9'
                    e.currentTarget.style.borderLeftColor = def.color ?? '#1e3a5f'
                    e.currentTarget.style.color = '#0f172a'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'none'
                    e.currentTarget.style.borderLeftColor = 'transparent'
                    e.currentTarget.style.color = '#475569'
                  }}
                >
                  <span style={{
                    ...s.panelIcon,
                    background: def.color ?? '#64748b',
                    color: '#fff',
                  }}>{def.icon}</span>
                  {def.label}
                </button>
              )
            })}
          </div>
        ))}

        {/* ── My Calculations ── */}
        <div>
          <div style={{ ...s.panelSection, borderTop: '1px solid #f0f0f0' }}>
            My Calculations
          </div>

          {templates.length === 0 && (
            <div style={{ padding: '4px 12px 6px', fontSize: 11, color: '#bbb', fontStyle: 'italic' }}>
              No templates yet
            </div>
          )}

          {templates.map(tmpl => (
            <button
              key={tmpl.id}
              style={s.panelBtn}
              onClick={() => addSavedCalcBlock(tmpl, blocks.length)}
              onMouseEnter={e => {
                e.currentTarget.style.background = '#f5f5f7'
                e.currentTarget.style.borderLeftColor = '#4a90d9'
                e.currentTarget.style.color = '#1c1c1e'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'none'
                e.currentTarget.style.borderLeftColor = 'transparent'
                e.currentTarget.style.color = '#555'
              }}
            >
              <span style={{ ...s.panelIcon, background: '#eef2ff', color: '#4a90d9' }}>⚙</span>
              {tmpl.name}
            </button>
          ))}

          {onManageTemplates && (
            <button
              style={{ ...s.panelBtn, color: '#4a90d9', marginTop: 2 }}
              onClick={onManageTemplates}
              onMouseEnter={e => {
                e.currentTarget.style.background = '#f0f7ff'
                e.currentTarget.style.borderLeftColor = '#4a90d9'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'none'
                e.currentTarget.style.borderLeftColor = 'transparent'
              }}
            >
              <span style={{ ...s.panelIcon, background: '#e8f0fe', color: '#4a90d9' }}>✎</span>
              Manage templates
            </button>
          )}
        </div>

      </aside>

      {/* ── Document page ── */}
      <div ref={pageRef} style={s.page} onClick={() => setSelectedId(null)}>

        {blocks.length === 0 && (
          <div style={s.empty}>
            Click a block type on the left, or hover here to use <strong>+</strong>
          </div>
        )}

        <AddZone
          onAdd={t => addBlock(t, 0)}
          templates={templates}
          onAddTemplate={t => addSavedCalcBlock(t, 0)}
          clipboard={clipboard}
          onPaste={() => pasteBlock(0)}
        />

        {blocks.map((block, index) => {
          const Comp            = TYPE_MAP[block.type]?.component
          const isSelected      = selectedId === block.id
          const isMinimised     = minimised.has(block.id)
          const showEditor      = isSelected && !isMinimised && !!Comp
          const isInlineEditable = ['text', 'heading'].includes(block.type)
          const isDragging      = dragIdx === index
          const isTarget        = dropIdx === index && dragIdx !== index

          return (
            <React.Fragment key={block.id}>
              <div
                draggable
                onDragStart={e => onDragStart(e, index)}
                onDragOver={e  => onDragOver(e, index)}
                onDrop={e      => onDrop(e, index)}
                onDragEnd={onDragEnd}
                onClick={e => { e.stopPropagation(); selectBlock(block.id) }}
                style={{
                  ...s.block,
                  ...(isSelected ? s.blockSelected : {}),
                  ...(isTarget   ? { borderTop: '2px solid #4a90d9' } : {}),
                  opacity: isDragging ? 0.3 : 1,
                }}
              >
                {/* Floating controls — drag handle always, others when selected */}
                <div style={s.floatControls}>
                  <span
                    style={s.dragHandle}
                    onPointerDown={e => e.stopPropagation()}
                    title="Drag to reorder"
                  >⠿</span>
                  {isSelected && (
                    <span style={s.floatBtns} onClick={e => e.stopPropagation()}>
                      <button style={s.fb} onClick={e => toggleMinimise(block.id, e)}
                        title={isMinimised ? 'Expand' : 'Minimise'}>
                        {isMinimised ? '▼' : '▲'}
                      </button>
                      <button style={s.fb} onClick={e => { e.stopPropagation(); moveUp(index) }}   disabled={index === 0}                title="Move up">↑</button>
                      <button style={s.fb} onClick={e => { e.stopPropagation(); moveDown(index) }} disabled={index === blocks.length-1} title="Move down">↓</button>
                      <button style={s.fb} onClick={e => { e.stopPropagation(); duplicateBlock(index) }} title="Duplicate block">⧉</button>
                      <button style={s.fb} onClick={e => { e.stopPropagation(); onCopyBlock?.(blocks[index]) }} title="Copy block (paste in any document)">📋</button>
                      {clipboard && (
                        <button style={{ ...s.fb, color: '#4a90d9' }}
                          onClick={e => { e.stopPropagation(); pasteBlock(index + 1) }}
                          title="Paste copied block after this one">📋+</button>
                      )}
                      <button style={{ ...s.fb, ...s.fbDel }} onClick={e => deleteBlock(index, e)} title="Delete">✕</button>
                    </span>
                  )}
                </div>

                {/* Content */}
                <div style={s.blockBody}>
                  {isInlineEditable ? (
                    /* Text + heading: always render editor inline as the document content */
                    <div onClick={e => e.stopPropagation()}>
                      <Comp
                        block={block}
                        onChange={b => updateBlock(index, b)}
                        isSelected={isSelected}
                      />
                    </div>
                  ) : (
                    <>
                      {/* Preview is always shown for non-inline blocks */}
                      <BlockPreview block={block} />

                      {/* Editor — only when selected AND not minimised */}
                      {showEditor && (
                        <div
                          style={s.editor}
                          onClick={e => e.stopPropagation()}
                        >
                          <Comp
                            block={block}
                            onChange={b => updateBlock(index, b)}
                            onOpenTemplateEditor={onOpenTemplateEditor}
                            blocks={blocks}
                            onAddBlock={(type, data) => addBlockAfter(block.id, type, data)}
                            onAddBlocks={(arr) => addBlocksAfter(block.id, arr)}
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>

              </div>

              <AddZone
                onAdd={t => addBlock(t, index + 1)}
                templates={templates}
                onAddTemplate={t => addSavedCalcBlock(t, index + 1)}
                clipboard={clipboard}
                onPaste={() => pasteBlock(index + 1)}
              />
            </React.Fragment>
          )
        })}

      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  outer: {
    display:    'flex',
    gap:        24,
    alignItems: 'flex-start',
    minHeight:  '100%',
  },

  // ── Left panel ────────────────────────────────────────────────────────
  panel: {
    width:      172,
    flexShrink: 0,
    background: '#fff',
    border:     '1px solid #e2e8f0',
    paddingBottom: 12,
    position:   'sticky',
    top:        0,
    maxHeight:  'calc(100vh - 48px)',
    overflowY:  'auto',
  },
  panelSection: {
    fontSize:      9,
    fontWeight:    700,
    color:         '#94a3b8',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    padding:       '12px 12px 4px',
  },
  panelBtn: {
    display:    'flex',
    alignItems: 'center',
    gap:        8,
    width:      '100%',
    background: 'none',
    border:     'none',
    borderLeft: '3px solid transparent',
    padding:    '5px 12px',
    fontSize:   11,
    color:      '#475569',
    textAlign:  'left',
    cursor:     'pointer',
    fontFamily: 'inherit',
    transition: 'background 0.12s, border-color 0.12s, color 0.12s',
  },
  panelIcon: {
    display:        'inline-flex',
    alignItems:     'center',
    justifyContent: 'center',
    width:  28,
    height: 18,
    fontSize:   9,
    fontWeight: 700,
    fontFamily: 'var(--font-mono, monospace)',
    letterSpacing: '0.04em',
    flexShrink: 0,
    color: '#fff',
  },

  // ── Document page ─────────────────────────────────────────────────────
  page: {
    flex:       1,
    minWidth:   0,
    maxWidth:   720,
    background: '#fff',
    padding:    '48px 64px 80px',
    boxShadow:  '0 1px 4px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)',
    boxSizing:  'border-box',
  },
  empty: {
    color: '#bbb', fontSize: 13, padding: '32px 0 8px', textAlign: 'center',
  },

  // ── Individual block ──────────────────────────────────────────────────
  block: {
    position:    'relative',
    paddingLeft: 12,
    marginLeft:  -12,
    borderLeft:  '3px solid transparent',
    transition:  'border-color 0.1s',
    cursor:      'pointer',
  },
  blockSelected: {
    borderLeft: '3px solid #4a90d9',
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
    color: '#ccc', cursor: 'grab', fontSize: 13,
    padding: '2px 3px', userSelect: 'none', lineHeight: 1,
  },
  floatBtns: {
    display: 'flex', gap: 2,
  },
  fb: {
    background: '#f5f5f7', border: '1px solid #e0e0e0',
    padding: '2px 6px', fontSize: 10, color: '#666',
    cursor: 'pointer', lineHeight: 1.5,
  },
  fbDel: {
    color: '#c0392b', background: '#fdf3f2', border: '1px solid #f5c6c6',
  },

  blockBody: {
    padding: '10px 0 10px 0',
  },

  // Editor that appears below the preview when expanded
  editor: {
    marginTop:  14,
    paddingTop: 14,
    borderTop:  '1px solid #eef2f8',
  },
}
