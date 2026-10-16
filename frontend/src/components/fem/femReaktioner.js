/**
 * femReaktioner.js — reaktionerne i understøtningerne, som en tabel.
 *
 * Kørslen gemmer reaktionerne for hvert lasttilfælde alene (karakteristisk,
 * faktor 1,0: summary.reaktioner_tilfaelde) og for hver lastkombination
 * (state.reactions i summary.combo_figs). Før kom kun den dimensionerende med,
 * og den stod kun ved udnyttelsen; en fundaments- eller leverandørberegning
 * skal bruge dem alle.
 *
 * Reaktionerne er [R_x, R_y, M] i kN og kNm i globale akser, som løseren
 * giver dem.
 */
import { isUls, SITUATION_LABEL } from './femDiagrams.js'

/**
 * Rækkerne: { gruppe, navn, knude, R: [Rx, Ry, M] } — lasttilfældene først,
 * så kombinationerne grupperet efter situation (brud først).
 */
export function reaktionsRaekker(summary) {
  if (!summary) return []
  const ud = []
  for (const t of summary.reaktioner_tilfaelde ?? []) {
    for (const [knude, R] of Object.entries(t.reactions ?? {})) {
      ud.push({ gruppe: 'Lasttilfælde (karakteristisk)', navn: t.navn, knude: Number(knude), R })
    }
  }
  const kombi = (summary.combo_figs ?? []).filter(c => c.state?.reactions)
  const gruppe = (c) => (isUls(c) ? 'Brudgrænsetilstand'
    : (SITUATION_LABEL[c.situation] ?? ({ als_brand: 'Ulykke (brand)' })[c.situation] ?? c.situation ?? 'Kombinationer'))
  const sorteret = [...kombi.filter(isUls), ...kombi.filter(c => !isUls(c))]
  for (const c of sorteret) {
    for (const [knude, R] of Object.entries(c.state.reactions)) {
      ud.push({ gruppe: gruppe(c), navn: c.name, knude: Number(knude), R })
    }
  }
  // Uden kombinationer: én beregning, den dimensionerende.
  if (!kombi.length && summary.reactions) {
    for (const [knude, R] of Object.entries(summary.reactions)) {
      ud.push({ gruppe: 'Beregning', navn: 'Beregning', knude: Number(knude), R: [R.Fx_kN, R.Fy_kN, R.Mz_kNm] })
    }
  }
  return ud
}

/**
 * Største og mindste værdi pr. knude og komposant over brudkombinationerne,
 * med navnet på den kombination, der giver den: { knude: [{ max, maxNavn,
 * min, minNavn } × 3] }.
 */
export function reaktionsEkstremer(summary) {
  const ud = {}
  for (const c of (summary?.combo_figs ?? []).filter(c => c.state?.reactions && isUls(c))) {
    for (const [k, R] of Object.entries(c.state.reactions)) {
      const knude = Number(k)
      ud[knude] ??= [0, 1, 2].map(() => ({ max: -Infinity, maxNavn: '', min: Infinity, minNavn: '' }))
      R.forEach((v, i) => {
        const e = ud[knude][i]
        if (v > e.max) { e.max = v; e.maxNavn = c.name }
        if (v < e.min) { e.min = v; e.minNavn = c.name }
      })
    }
  }
  return ud
}

/** Tabellen som tabulatorsepareret tekst, til Excel. Decimaltegn er komma. */
export function reaktionerSomTsv(raekker) {
  const tal = (v) => (Number.isFinite(v) ? v.toFixed(2).replace('.', ',') : '')
  return [['Gruppe', 'Tilfælde/kombination', 'Knude', 'R_x [kN]', 'R_y [kN]', 'M [kNm]'].join('\t'),
    ...raekker.map(r => [r.gruppe, r.navn, r.knude, ...r.R.map(tal)].join('\t'))].join('\n')
}
