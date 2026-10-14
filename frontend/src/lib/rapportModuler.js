/**
 * rapportModuler.js — de små beregninger i rapporten (skrivebordsprogrammet).
 *
 *   Egenvægt  lagopbygning: tykkelse × rumvægt = g pr. lag og summen
 *   Sne       s = μ₁ · C_e · C_t · s_k   (DS/EN 1991-1-3 med DK NA)
 *
 * Regningen sker her, uden server, og resultatet bliver til de samme
 * rapportrækker (section, table, calc_row, note) som de andre beregninger,
 * så PDF'en tegner dem ens. Rene funktioner, så de kan testes for sig.
 */

/** Tal med dansk decimalkomma og et fast antal decimaler. */
export const dk = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '–')

/** Et tal fra et felt; dansk komma er tilladt. Tomt eller ugyldigt → NaN. */
export const tal = (s) => {
  if (typeof s === 'number') return s
  const t = String(s ?? '').trim().replace(/\s/g, '').replace(',', '.')
  return t === '' ? NaN : Number(t)
}

// ── Egenvægt ─────────────────────────────────────────────────────────────────

// Rumvægte [kN/m³] til at vælge fra, når man skriver lagets navn. Typiske
// regningsværdier for egenlast (DS/EN 1991-1-1, anneks A, og producenternes
// data); de kan altid rettes i feltet.
export const MATERIALER = [
  { navn: 'Konstruktionstræ C24', rho: 4.2 },
  { navn: 'Limtræ GL30', rho: 4.3 },
  { navn: 'Krydsfiner', rho: 5.0 },
  { navn: 'OSB-plade', rho: 6.5 },
  { navn: 'Gipsplade', rho: 9.0 },
  { navn: 'Mineraluld', rho: 0.3 },
  { navn: 'Beton, armeret', rho: 25.0 },
  { navn: 'Letbeton', rho: 6.0 },
  { navn: 'Tegl, massiv', rho: 18.0 },
  { navn: 'Tagsten, tegl', rho: 18.0 },
  { navn: 'Stål', rho: 78.5 },
  { navn: 'Afretningslag', rho: 22.0 },
]

export const EGENVAEGT_STANDARD = () => ({
  title: 'Egenvægt',
  lag: [
    { navn: 'Gipsplade', t_mm: '13', rho: '9,0' },
    { navn: 'Mineraluld', t_mm: '200', rho: '0,3' },
    { navn: 'Krydsfiner', t_mm: '21', rho: '5,0' },
  ],
})

/** g [kN/m²] for et lag: tykkelse [mm] × rumvægt [kN/m³]. NaN, hvis et felt mangler. */
export const lagLast = (l) => (tal(l.t_mm) / 1000) * tal(l.rho)

/** { lag: [{ ...l, g }], sum, mangler } — `mangler` er antallet af lag, der ikke kan regnes. */
export function egenvaegt(data) {
  const lag = (data?.lag ?? []).map(l => ({ ...l, g: lagLast(l) }))
  const ok = lag.filter(l => Number.isFinite(l.g))
  return { lag, sum: ok.reduce((s, l) => s + l.g, 0), mangler: lag.length - ok.length }
}

export function egenvaegtRapport(data) {
  const r = egenvaegt(data)
  const ud = [{ type: 'section', content: data?.title || 'Egenvægt' }]
  ud.push({
    type: 'table',
    headers: ['Lag', 't [mm]', 'γ [kN/m³]', 'g [kN/m²]'],
    rows: [
      ...r.lag.map(l => [l.navn || '–', dk(tal(l.t_mm), 0), dk(tal(l.rho), 1), dk(l.g, 3)]),
      ['Sum', '', '', dk(r.sum, 2)],
    ],
  })
  ud.push({ type: 'calc_row', name: 'g_k', formula: 'Σ t · γ', result: `${dk(r.sum, 2)} kN/m²`,
            label: 'Karakteristisk egenlast' })
  if (r.mangler) ud.push({ type: 'note', content: `${r.mangler} lag mangler tykkelse eller rumvægt og er ikke regnet med.` })
  return ud
}

// ── Sne ──────────────────────────────────────────────────────────────────────

/** s_k i Danmark: 1,0 kN/m² (DS/EN 1991-1-3 DK NA). */
export const SK_DK = 1.0

export const SNE_STANDARD = () => ({ title: 'Snelast', alfa: '15', ce: '1,0', ct: '1,0' })

/** Formfaktor μ₁ for et taghældning α [°] (DS/EN 1991-1-3, tabel 5.2). */
export function mu1(alfa) {
  if (!Number.isFinite(alfa) || alfa < 0) return NaN
  if (alfa <= 30) return 0.8
  if (alfa < 60) return 0.8 * (60 - alfa) / 30
  return 0
}

/** μ₁'s udtryk til rapporten: formlen ved interpolation, ellers tom. */
export function mu1Udtryk(alfa) {
  return Number.isFinite(alfa) && alfa > 30 && alfa < 60 ? `0,8 · (60° − ${dk(alfa, 1)}°) / 30°` : ''
}

/** Hvilket interval i tabel 5.2, α ligger i. */
const mu1Interval = (alfa) => (!Number.isFinite(alfa) || alfa < 0 ? ''
  : alfa <= 30 ? '0° ≤ α ≤ 30°' : alfa < 60 ? '30° < α < 60°' : 'α ≥ 60°')

export function sne(data) {
  const alfa = tal(data?.alfa), ce = tal(data?.ce), ct = tal(data?.ct)
  const m = mu1(alfa)
  return { alfa, ce, ct, mu1: m, sk: SK_DK, s: m * ce * ct * SK_DK }
}

export function sneRapport(data) {
  const r = sne(data)
  const ud = [{ type: 'section', content: data?.title || 'Snelast' }]
  // Indgangsværdier: navn = værdi med forklaringen over. Formler: navn = formel = værdi.
  const ind = (name, result, label) => ud.push({ type: 'calc_row', name, formula: '', result, label })
  ind('s_k', `${dk(r.sk, 1)} kN/m²`, 'Sneens terrænværdi (DS/EN 1991-1-3 DK NA)')
  ind('α', `${dk(r.alfa, 1)}°`, 'Taghældning')
  ud.push({ type: 'calc_row', name: 'μ_1', formula: mu1Udtryk(r.alfa), result: dk(r.mu1, 2),
            label: `Formfaktor, tabel 5.2 (${mu1Interval(r.alfa)})` })
  ind('C_e', dk(r.ce, 1), 'Eksponeringskoefficient')
  ind('C_t', dk(r.ct, 1), 'Termisk koefficient')
  ud.push({ type: 'calc_row', name: 's', formula: `μ_1 · C_e · C_t · s_k = ${dk(r.mu1, 2)} · ${dk(r.ce, 1)} · ${dk(r.ct, 1)} · ${dk(r.sk, 1)} kN/m²`,
            result: `${dk(r.s, 2)} kN/m²`, label: 'Snelast på taget' })
  if (!Number.isFinite(r.s)) ud.push({ type: 'note', content: 'Taghældning, C_e eller C_t mangler — snelasten er ikke regnet.' })
  return ud
}
