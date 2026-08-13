/**
 * check-klasser.js — regression check for the classification rules
 *
 * Consequence class (DS/INF 1990:2024 Tabel 2) and construction class
 * (BR18 § 489) decide how much control a building legally needs. Getting them
 * wrong costs the user either an independent check they do not need, or one
 * they do — so the rules get a check that runs without a test framework.
 *
 *     npm run check
 *
 * Each case below is read off the standard, not off the implementation.
 */
import { suggestCC, suggestKK } from '../src/templates/a1.js'

// ── DS/INF 1990:2024 Tabel 2 ──────────────────────────────────────────────────
const CC_CASES = [
  ['Parcelhus 1 etage, 5 m spænd, 4 m højt (række 1)',
    { anvendelseNr: 1, etager: 1, spaendvidde: 5, hoejdeOver: 4, hoejdeUnder: 0 }, 2],
  ['Etageboliger 5 etager, 16 m spænd, 12 m — øvre CC2-grænse',
    { anvendelseNr: 1, etager: 5, spaendvidde: 16, hoejdeOver: 12, hoejdeUnder: 0 }, 2],
  ['Etageboliger 6 etager — over CC2-grænsen på 5',
    { anvendelseNr: 1, etager: 6, spaendvidde: 8, hoejdeOver: 18, hoejdeUnder: 0 }, 3],
  ['Boliger 17 m spænd — over CC2-grænsen på 16',
    { anvendelseNr: 1, etager: 3, spaendvidde: 17, hoejdeOver: 10, hoejdeUnder: 0 }, 3],
  ['Hospital 2 etager (række 2)',
    { anvendelseNr: 2, etager: 2, spaendvidde: 12, hoejdeOver: 9, hoejdeUnder: 0 }, 2],
  ['Hospital 3 etager — over CC2-grænsen på 2',
    { anvendelseNr: 2, etager: 3, spaendvidde: 12, hoejdeOver: 9, hoejdeUnder: 0 }, 3],
  ['Landbrugslade 30 m spænd, 12 m (række 10)',
    { anvendelseNr: 10, etager: 1, spaendvidde: 30, hoejdeOver: 12, hoejdeUnder: 0 }, 1],
  ['Landbrugslade 45 m spænd — over CC1-grænsen på 40',
    { anvendelseNr: 10, etager: 1, spaendvidde: 45, hoejdeOver: 12, hoejdeUnder: 0 }, 2],
  ['P-hus 6 etager, 18 m spænd (række 12)',
    { anvendelseNr: 12, etager: 6, spaendvidde: 18, hoejdeOver: 18, hoejdeUnder: 0 }, 2],
  ['Bolig med kælder 8 m under terræn — over CC2-grænsen på 6',
    { anvendelseNr: 1, etager: 3, spaendvidde: 10, hoejdeOver: 10, hoejdeUnder: 8 }, 3],
]

// ── BR18 § 489 ────────────────────────────────────────────────────────────────
// The construction class does NOT follow the consequence class. These are the
// cases where that matters.
const KK_CASES = [
  ['Parcelhus 1 etage — CC2, men KK1',
    { anvendelseNr: 1, etager: 1, spaendvidde: 5, hoejdeOver: 4, bygningskategori: 'enfamiliehus' }, 'KK1'],
  ['Rækkehus 2 etager — stadig KK1',
    { anvendelseNr: 1, etager: 2, spaendvidde: 6, hoejdeOver: 7, bygningskategori: 'enfamiliehus' }, 'KK1'],
  ['Enfamiliehus 3 etager — over grænsen på 2',
    { anvendelseNr: 1, etager: 3, spaendvidde: 6, hoejdeOver: 10, bygningskategori: 'enfamiliehus' }, 'KK2'],
  ['Etageboliger 4 etager',
    { anvendelseNr: 1, etager: 4, spaendvidde: 7, hoejdeOver: 12, bygningskategori: 'etagebyggeri' }, 'KK2'],
  ['Landbrugshal 1 etage, 35 m spænd',
    { anvendelseNr: 10, etager: 1, spaendvidde: 35, hoejdeOver: 9, bygningskategori: 'landbrug' }, 'KK1'],
  ['Landbrugshal 45 m spænd — over grænsen på 40',
    { anvendelseNr: 10, etager: 1, spaendvidde: 45, hoejdeOver: 9, bygningskategori: 'landbrug' }, 'KK2'],
  ['Kontorhus, kompleks konstruktion — CC2 rykker OP til KK3',
    { anvendelseNr: 1, etager: 4, spaendvidde: 7, hoejdeOver: 12, bygningskategori: 'etagebyggeri', simpel: false }, 'KK3'],
  ['Kontorhus, utraditionel konstruktion — CC2 rykker OP til KK3',
    { anvendelseNr: 1, etager: 4, spaendvidde: 7, hoejdeOver: 12, bygningskategori: 'etagebyggeri', traditionel: false }, 'KK3'],
  ['Parcelhus, men kompleks — kompleksitet slår boligtypen',
    { anvendelseNr: 1, etager: 1, spaendvidde: 5, hoejdeOver: 4, bygningskategori: 'enfamiliehus', simpel: false }, 'KK3'],
  ['CC2-ombygning, simpel og traditionel — § 489 stk. 2',
    { anvendelseNr: 1, etager: 3, spaendvidde: 6, hoejdeOver: 10, bygningskategori: 'etagebyggeri', konstruktionstype: 'Ombygning' }, 'KK1', true],
  ['CC3-ombygning, 6 etager, 7 m spænd — § 489 stk. 2',
    { anvendelseNr: 1, etager: 6, spaendvidde: 7, hoejdeOver: 18, bygningskategori: 'etagebyggeri', konstruktionstype: 'Ombygning' }, 'KK2', true],
  ['CC3-ombygning, 9 m spænd — over grænsen på 8',
    { anvendelseNr: 1, etager: 6, spaendvidde: 9, hoejdeOver: 18, bygningskategori: 'etagebyggeri', konstruktionstype: 'Ombygning' }, 'KK3'],
  ['CC3 nybyggeri, 8 etager',
    { anvendelseNr: 1, etager: 8, spaendvidde: 7, hoejdeOver: 24, bygningskategori: 'etagebyggeri' }, 'KK3'],
]

let failed = 0
const report = (ok, line) => {
  if (!ok) failed++
  console.log(`  ${ok ? 'ok  ' : 'FEJL'}  ${line}`)
}

console.log('\nKonsekvensklasse — DS/INF 1990:2024 Tabel 2')
for (const [navn, o, want] of CC_CASES) {
  const { cc } = suggestCC(o)
  report(cc === want, `CC${cc}  ${navn}${cc === want ? '' : `  → forventet CC${want}`}`)
}

console.log('\nKonstruktionsklasse — BR18 § 489')
for (const [navn, o, want, ventetDokKrav] of KK_CASES) {
  const { cc } = suggestCC(o)
  const r = suggestKK({ ...o, cc })
  const dokOk = !ventetDokKrav || !!r.dokumentationskrav
  const ok = r.kk === want && dokOk
  report(ok,
    `CC${cc} ${r.kk.padEnd(4)} ${r.dokumentationskrav ? '[dok=KK2]' : '         '} ${navn}` +
    (r.kk === want ? '' : `  → forventet ${want}`) +
    (dokOk ? '' : '  → manglede kravet om dokumentationskontrol svarende til KK2'))
}

const total = CC_CASES.length + KK_CASES.length
console.log(failed === 0
  ? `\nAlle ${total} tilfælde stemmer.\n`
  : `\n${failed} af ${total} tilfælde fejler.\n`)
process.exit(failed === 0 ? 0 : 1)
