/**
 * regnearkFormat.js — cellernes formatering i regnearksbogen.
 *
 * ark.fmt = { A1: { fyld: '#fff2cc', ramme: { t, b, l, r }, kursiv, graa, just: 'v'|'c'|'h' } }
 * graa = grå skrift (mellemregninger).
 * ramme-kanterne er 1 (tynd) eller 2 (tyk). Bruges af editoren, rapportens
 * visning og (samme felter) af backend/pdf_builder.py og regneark_xlsx.py.
 */

// Fyldfarver som i Excel-arkene: gul til inddata, grøn til resultater.
export const FYLD = [
  ['#fff2cc', 'Gul (inddata)'], ['#e2efda', 'Grøn (resultat)'], ['#ddebf7', 'Blå'],
  ['#fce4d6', 'Orange'], ['#ededed', 'Grå'], ['ingen', 'Ingen fyld'],
]

/** Cellens formatering som style på <td>. */
export function fmtStil(f) {
  if (!f) return undefined
  const st = {}
  if (f.fyld) st.background = f.fyld
  if (f.kursiv) st.fontStyle = 'italic'
  if (f.graa) st.color = '#8a8a8a'
  if (f.just) st.textAlign = { v: 'left', c: 'center', h: 'right' }[f.just]
  // Bredere end gitterlinjerne (1 px): ved lige brede kanter vinder cellen til
  // venstre/over, og så ville en tynd ramme forsvinde i gitteret.
  const kant = (n) => (n === 2 ? '3px solid #1f2937' : '2px solid #4b5563')
  if (f.ramme?.t) st.borderTop = kant(f.ramme.t)
  if (f.ramme?.b) st.borderBottom = kant(f.ramme.b)
  if (f.ramme?.l) st.borderLeft = kant(f.ramme.l)
  if (f.ramme?.r) st.borderRight = kant(f.ramme.r)
  return st
}
