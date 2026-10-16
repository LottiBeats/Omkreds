/**
 * bogSkabeloner.js — skabeloner med flere ark til regnearksbogen.
 *
 * En skabelon er { key, titel, beskrivelse, bog: () => ({ ark, navne }) }.
 * Den første (standard) er den, en tom bog tilbyder at starte med.
 * Den sættes ind med indsaetSkabelon (lib/regnearksbog.js), der giver ark og
 * navne nye navne, hvis de allerede er brugt i bogen.
 *
 *   standard    Til nye byggerier: forudsætninger (K_FI, sne, q_p) → materialer
 *               → opbygninger → lastoversigt → lodret lastnedføring plan for
 *               plan → vandret lastnedføring (vind fordelt på væggene).
 *   elementer   Lastopbygninger med ID (TRa, Tka …) og elementlaster: last-
 *               områder x₁–x₂ på et element, laster slået op på ID'et, og
 *               reaktionerne R_A og R_B pr. lasttype — som Excel-arkene.
 *   traehus     Træhus med sadeltag: opbygninger → laster → lastnedføring →
 *               stabilitet nord–syd → fundament (fra Sommerhus H+H).
 */
import traehus from '../templates/bog/traehus.js'
import standard from '../templates/bog/standard.js'

const T = (rows) => rows.map(r => r.map(c => (c === undefined || c === null ? '' : String(c))))

function elementer() {
  // ── Lastopbygninger: oversigt pr. ID øverst, lagene for hvert ID nedenunder ──
  const lag = [
    ['TRa', 'Betontrapper, 250 mm — adgang til bolig', [['Trappeelement/-repos, 250 mm', '6', '6,25'], ['Loftbeklædning', '0', '0,30']]],
    ['Tka', 'Tag, tegl på træspær', [['Tegl inkl. lægter', '0', '0,60'], ['Spær og undertag', '0,25', '0,35'], ['Isolering', '0,15', '0,20'], ['Loft', '0,10', '0,35']]],
    ['Dk', 'Etagedæk, træbjælkelag', [['Gulv', '0', '0,30'], ['Bjælkelag 45×220 c/c 600', '0,40', '0,45'], ['Isolering', '0,05', '0,05'], ['Loft', '0', '0,20']]],
  ]
  const ovr = [  // q_k, Q_k, kategori, ψ0, ψ1, ψ2, s_k, ψ0,s
    ['3,00', '2,00', 'A4 Adgangsveje, boliger', '0,5', '0,3', '0,2', '0', '0'],
    ['0', '0', 'H Tage', '0', '0', '0', '0,8', '0,3'],
    ['1,50', '2,00', 'A1 Boliger', '0,5', '0,3', '0,2', '0', '0'],
  ]
  const op = [['ID', 'Navn', 'g_k,inf [kN/m²]', 'g_k,sup [kN/m²]', 'q_k [kN/m²]', 'Q_k [kN]', 'Kategori', 'ψ0', 'ψ1', 'ψ2', 's_k [kN/m²]', 'ψ0,s']]
  const fed = {}
  for (const k of 'ABCDEFGHIJKL') fed[`${k}1`] = true
  // Lagblokkene starter i række 2 + antal ID'er + 6 (plads til flere ID'er i oversigten)
  const forste = 2 + lag.length + 6
  const blok = []
  let r = forste + 1   // efter oversigten, noten og en tom række
  const sumRaekke = {}
  for (const [id, navn, lagListe] of lag) {
    blok.push([id, navn, 'g_k,inf [kN/m²]', 'g_k,sup [kN/m²]']); fed[`A${r}`] = fed[`B${r}`] = true; r++
    const r0 = r
    for (const [l, inf, sup] of lagListe) { blok.push(['', l, inf, sup]); r++ }
    blok.push(['', 'Σ', `=SUM(C${r0}:C${r - 1})`, `=SUM(D${r0}:D${r - 1})`]); fed[`B${r}`] = fed[`C${r}`] = fed[`D${r}`] = true
    sumRaekke[id] = r; r++
    blok.push([]); r++
  }
  lag.forEach(([id, navn], i) => op.push([id, navn, `=C${sumRaekke[id]}`, `=D${sumRaekke[id]}`, ...ovr[i]]))
  while (op.length < forste - 2) op.push([])   // plads til flere ID'er
  op.push(['Lagene for hvert ID står herunder. Et nyt ID: tilføj en række i oversigten og en lagblok.'])
  op.push([])
  const lastopbygninger = {
    navn: 'Lastopbygninger', titel: 'Lastopbygninger — karakteristiske laster pr. ID', overskrift: true,
    celler: T([...op, ...blok]), bredder: [70, 250, 96, 96, 86, 70, 170, 46, 46, 46, 86, 50], fed,
    dec: { C: 2, D: 2, E: 2, F: 2, K: 2 },
  }

  // ── Elementer: lastområder → laster (LOPSLAG på ID) → reaktioner pr. m ──
  const N = 12           // rækker til lastområder (2 … N+1)
  const OMR = `Lastopbygninger!$A$2:$L$${1 + lag.length + 6}`
  const el = [['Element', 'x_RA [m]', 'x_RB [m]', 'Opbygning (ID)', 'x₁ [m]', 'x₂ [m]', 'L [m]',
    'g_inf [kN/m²]', 'g_sup [kN/m²]', 'q_k [kN/m²]', 's_k [kN/m²]', 'w_k [kN/m²]',
    'R_A g_inf [kN/m]', 'R_A g_sup [kN/m]', 'R_A q [kN/m]', 'R_A s [kN/m]', 'R_A w [kN/m]',
    'R_B g_inf [kN/m]', 'R_B g_sup [kN/m]', 'R_B q [kN/m]', 'R_B s [kN/m]', 'R_B w [kN/m]']]
  const eksempel = [
    ['J1.D503', '0', '6,25', 'Tka', '0', '6,25', '0'],
    ['J1.D504', '0', '4,2', 'Dk', '0', '4,2', ''],
    ['J1.D504', '0', '4,2', 'TRa', '3,0', '4,2', ''],
  ]
  for (let i = 0; i < N; i++) {
    const n = i + 2
    const [e = '', a = '', b = '', id = '', x1 = '', x2 = '', w = ''] = eksempel[i] ?? []
    const hent = (kol) => `=HVIS($D${n}="";"";LOPSLAG($D${n};${OMR};${kol};FALSK))`
    // Jævnt fordelt last q på x₁–x₂: R_B = q·(x₂−x₁)·((x₁+x₂)/2 − x_RA)/L, R_A = q·(x₂−x₁) − R_B
    const rb = (k) => `=HVIS($D${n}="";"";${k}${n}*($F${n}-$E${n})*(($E${n}+$F${n})/2-$B${n})/$G${n})`
    const ra = (k, kb) => `=HVIS($D${n}="";"";${k}${n}*($F${n}-$E${n})-${kb}${n})`
    el.push([e, a, b, id, x1, x2, `=HVIS($D${n}="";"";$C${n}-$B${n})`,
      hent(3), hent(4), hent(5), hent(11), w,
      ra('H', 'R'), ra('I', 'S'), ra('J', 'T'), ra('K', 'U'), ra('L', 'V'),
      rb('H'), rb('I'), rb('J'), rb('K'), rb('L')])
  }
  el.push([])
  const s0 = el.length + 1
  el.push(['Reaktioner pr. element (sum af lastområderne)', '', '', '', '', '', '', '', '', '', '', '',
    'R_A g_inf', 'R_A g_sup', 'R_A q', 'R_A s', 'R_A w', 'R_B g_inf', 'R_B g_sup', 'R_B q', 'R_B s', 'R_B w'])
  const elFed = { [`A${s0}`]: true }
  for (const k of 'ABCDEFGHIJKLMNOPQRSTUV') elFed[`${k}1`] = true
  const ider = ['J1.D503', 'J1.D504']
  ider.forEach((id, i) => {
    const n = s0 + 1 + i
    const sum = (k) => `=SUMHVIS($A$2:$A$${N + 1};$A${n};${k}$2:${k}$${N + 1})`
    el.push([id, '', '', '', '', '', '', '', '', '', '', '', ...'MNOPQRSTUV'.split('').map(sum)])
  })
  const elementerArk = {
    navn: 'Elementer', titel: 'Elementlaster — lastområder og reaktioner pr. m', overskrift: true,
    celler: T(el), bredder: [80, 56, 56, 80, 50, 50, 50, 64, 64, 64, 64, 64, 70, 70, 64, 64, 64, 70, 70, 64, 64, 64],
    fed: elFed, dec: { G: 2, H: 2, I: 2, J: 2, K: 2, M: 2, N: 2, O: 2, P: 2, Q: 2, R: 2, S: 2, T: 2, U: 2, V: 2 },
  }
  const r1 = s0 + 1
  return {
    ark: [lastopbygninger, elementerArk],
    navne: {
      J1_D503_RA_g_inf: { ark: 'Elementer', celle: `M${r1}`, enhed: 'kN/m' },
      J1_D503_RA_g_sup: { ark: 'Elementer', celle: `N${r1}`, enhed: 'kN/m' },
      J1_D503_RA_s: { ark: 'Elementer', celle: `P${r1}`, enhed: 'kN/m' },
    },
  }
}

export const BOG_SKABELONER = [
  {
    key: 'standard', titel: 'Standard — lodret og vandret lastnedføring',
    beskrivelse: 'Forudsætninger → materialer → opbygninger → lastoversigt → lodret lastnedføring plan for plan → vandret lastnedføring på de stabiliserende vægge',
    bog: () => structuredClone({ ark: standard.ark, navne: standard.navne }),
  },
  {
    key: 'elementer', titel: 'Lastopbygninger og elementlaster',
    beskrivelse: 'Opbygninger med ID (TRa, Tka …), lastområder på hvert element og reaktionerne R_A og R_B pr. lasttype',
    bog: elementer,
  },
  {
    key: 'traehus', titel: 'Træhus med sadeltag',
    beskrivelse: 'Opbygninger → laster → lastnedføring (spær, rem, kipbjælke, gavlrammer) → stabilitet nord–syd → fundament',
    bog: () => structuredClone({ ark: traehus.ark, navne: traehus.navne }),
  },
]

/** Områder i standardbogen, som rapportskabelonen viser (fx oversigten i Lodret lastnedføring). */
export const STANDARD_OMRAADER = standard.omraader
