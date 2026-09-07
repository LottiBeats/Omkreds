/**
 * check-blokvariabler.js — fanger en variabel, der bruges uden at være erklæret
 * i en blokkomponent.
 *
 * Findes fordi en sådan fejl slap ud: TimberBeamBlock byggede sin payload med
 *
 *     design_situation: (source === 'combo' && exports_?.design_situation) || …
 *
 * hvor blokken kalder sin variabel `comboExp`. Navnet var kopieret fra
 * søjleblokken. Optional chaining redder ikke en udefineret VARIABEL — den
 * kaster ReferenceError — og fordi udtrykket står efter `source === 'combo'`,
 * skete det kun, når man faktisk brugte en lastkombination. Byggeriet var
 * grønt, alle 469 backend-tests var grønne, og fejlen blev fundet af Niels.
 *
 * Kontrollen er bevidst snæver: den kigger kun efter de håndfulde navne,
 * blokkene deler om laster og eksporter. Et fuldt scope-tjek hører til i en
 * linter, ikke her.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BLOKKE = path.join(__dirname, '..', 'src', 'components', 'blocks')

// Navne der bæres fra blok til blok ved kopiering, og som er lette at ramme
// forkert fordi de betyder det samme men hedder noget forskelligt.
const NAVNE = [
  'exports_', 'comboExp', 'genExports', 'selCombo', 'selFem',
  'comboBlocks', 'femBlocks', 'source',
]

let checks = 0
let failed = 0

function report(ok, tekst) {
  if (ok) {
    console.log(`  ok    ${tekst}`)
  } else {
    failed++
    console.log(`  FEJL  ${tekst}`)
  }
}

console.log('\nBlokkomponenter — variabler der bruges uden at være erklæret')

for (const fil of fs.readdirSync(BLOKKE).filter(f => f.endsWith('.jsx')).sort()) {
  const src = fs.readFileSync(path.join(BLOKKE, fil), 'utf8')

  const manglende = NAVNE.filter(navn => {
    const brugt = new RegExp(`\\b${navn}\\b`).test(src)
    if (!brugt) return false
    // Erklæret som const/let/var, som funktionsparameter, eller destructureret.
    const erklaeret = new RegExp(
      `(const|let|var)\\s+${navn}\\b`
      + `|(const|let|var)\\s*\\{[^}]*\\b${navn}\\b[^}]*\\}`
      + `|\\(\\s*\\{[^}]*\\b${navn}\\b[^}]*\\}`
      + `|function\\s+\\w*\\s*\\([^)]*\\b${navn}\\b`,
    ).test(src)
    return !erklaeret
  })

  checks++
  report(manglende.length === 0,
    manglende.length === 0
      ? fil
      : `${fil} bruger ${manglende.join(', ')} uden at erklære den`)
}

console.log(failed === 0
  ? `\nAlle ${checks} blokke er rene.\n`
  : `\n${failed} af ${checks} blokke har en udefineret variabel.\n`)
process.exit(failed === 0 ? 0 : 1)
