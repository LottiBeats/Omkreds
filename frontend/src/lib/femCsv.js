/**
 * femCsv.js — rammeberegningens resultater som én CSV-fil til Excel.
 *
 * Semikolon og decimalkomma, som dansk Excel læser det direkte. Filen er delt
 * i afsnit med en overskriftslinje hver: udnyttelse pr. led, reaktioner,
 * snitkræfter, knudeflytninger, laster og kombinationer.
 */
const tal = (v, d = 3) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : (v ?? ''))
const felt = (v) => {
  const t = String(v ?? '')
  return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}
const linje = (arr) => arr.map(felt).join(';')

export function resultaterSomCsv(data, meta = {}) {
  const s = data?._summary ?? {}
  const ud = []
  const afsnit = (titel, hoved, raekker) => {
    if (!raekker?.length) return
    ud.push('', linje([titel]), linje(hoved), ...raekker.map(linje))
  }
  ud.push(linje(['Omkreds FEM', data?.title ?? 'Rammeberegning']))
  if (meta.project_name) ud.push(linje(['Sag', meta.project_name]))
  ud.push(linje(['Konsekvensklasse', data?.consequence_class ?? 'CC2']))

  const checks = data?._member_checks ?? {}
  afsnit('Udnyttelse pr. led',
    ['Led', 'η', 'Eftervist som', 'Kombination', 'N_Ed [kN]', 'M_Ed [kNm]', 'L_cr,y [m]', 'L_cr,z [m]', 'L_LT [m]', 'Bemærkning'],
    Object.entries(checks).map(([id, c]) => [
      id, tal(c?.eta, 3), c?.mode === 'column' ? 'søjle (N+M)' : c?.mode === 'beam' ? 'bjælke' : '',
      c?.combo ?? '', tal(c?.N_Ed_kN, 2), tal(c?.M_Ed_kNm, 2), tal(c?.L_cr_m, 3), tal(c?.L_cr_z_m, 3), tal(c?.L_LT_m, 3),
      c?.error ? `fejl: ${c.error}` : c?.skipped ?? '',
    ]))
  afsnit('Reaktioner (dimensionsgivende kombination)', ['Knude', 'R_x [kN]', 'R_y [kN]', 'M [kNm]'],
    Object.entries(s.reactions ?? {}).map(([n, R]) => [n, tal(R.Fx_kN), tal(R.Fy_kN), tal(R.Mz_kNm)]))
  afsnit('Snitkræfter i elementerne (lokale akser)',
    ['Element', 'Type', 'L [m]', 'N_i [kN]', 'V_i [kN]', 'M_i [kNm]', 'N_j [kN]', 'V_j [kN]', 'M_j [kNm]', 'M_max [kNm]', 'x ved M_max [m]'],
    (s.ele_force_table ?? []).map(e => [e.id, e.type === 'truss' ? 'gitterstang' : 'bjælke', tal(e.L_m),
      tal(e.N_i_kN), tal(e.V_i_kN), tal(e.M_i_kNm), tal(e.N_j_kN), tal(e.V_j_kN), tal(e.M_j_kNm),
      tal(e.M_max_kNm), tal(e.x_M_max_m)]))
  if (s.envelope && Object.keys(s.envelope).length) {
    afsnit('Indhyldning pr. element (brud)', ['Element', 'M_max [kNm]', 'Kombination', 'V_max [kN]', 'N_max [kN]'],
      Object.entries(s.envelope).map(([id, e]) => [id, tal(e.M_max_kNm), e.M_combo ?? '', tal(e.V_max_kN), tal(e.N_max_kN)]))
  }
  afsnit('Knudeflytninger', ['Knude', 'x [m]', 'y [m]', 'u_x [mm]', 'u_y [mm]', 'φ [mrad]'],
    (s.node_disp_table ?? []).map(n => [n.id, tal(n.x_m), tal(n.y_m), tal(n.ux_mm), tal(n.uy_mm), tal(n.rz_mrad)]))
  afsnit('Påførte laster', ['Type', 'Hvor', 'Lasttilfælde', 'Retning', 'Størrelse'],
    (s.loads_table ?? []).filter(l => l.vaerdi != null).map(l => [l.type, l.target, l.lasttilfaelde, l.retning, l.vaerdi]))
  if (s.sls) {
    afsnit('Anvendelse', ['Størrelse', 'Værdi'], [
      ['w_inst [mm]', tal(s.sls.w_inst_mm, 2)], ['w_fin [mm]', tal(s.sls.w_fin_mm, 2)],
      ['k_def', tal(s.sls.k_def, 2)], ['ψ₂', tal(s.sls.psi_2, 2)],
    ])
  }
  afsnit('Kombinationer', ['Navn'], (s.combinations ?? []).map(n => [n]))
  return ud.join('\r\n') + '\r\n'
}
