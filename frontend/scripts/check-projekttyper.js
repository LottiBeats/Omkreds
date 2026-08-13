/**
 * check-projekttyper.js — regression check for the project types
 *
 * A project type generates A1, A2, B1 and B2 from one description of the job.
 * The whole reason to do that is that the documents then agree with each other,
 * so what is checked here is the agreement — not that each template still
 * produces the same prose.
 *
 *     npm run check
 *
 * Runs on plain node, no test framework, same as check-klasser.js.
 */
import { PROJECT_TYPES, optionsFor, makeProjectDocuments } from '../src/templates/projectTypes.js'
import { suggestCC, suggestKK } from '../src/templates/a1.js'
import { makeB2Template } from '../src/templates/b2.js'

let failed = 0
const report = (ok, line) => {
  if (!ok) failed++
  console.log(`  ${ok ? 'ok  ' : 'FEJL'}  ${line}`)
}

/** Every number big enough to be a block id, anywhere in a block's data. */
function referencesIn(blocks) {
  const out = []
  const walk = (v) => {
    if (typeof v === 'number') { if (v > 1e12) out.push(v) }
    else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') Object.values(v).forEach(walk)
  }
  blocks.forEach(b => walk(b.data))
  return out
}

const textOf = (blocks) => blocks.map(b => JSON.stringify(b.data)).join(' ')

let checks = 0

for (const t of PROJECT_TYPES) {
  console.log(`\n${t.label}`)
  const o    = optionsFor(t.key)
  const docs = makeProjectDocuments(t.key, o, { project_name: 'Testprojekt' })
  checks += 6

  // 1 — the documents it promises are the documents it delivers
  const got = Object.keys(docs).sort().join(',')
  const want = [...t.docs].sort().join(',')
  report(got === want, `dokumenter: ${got}${got === want ? '' : `  → lovede ${want}`}`)

  // 2 — every block is a block
  const all = Object.values(docs).flat()
  report(all.every(b => typeof b.type === 'string' && b.data && typeof b.id === 'number'),
    `${all.length} blokke har type, id og data`)

  // 3 — ids are unique across the whole set, not just within a document.
  //     Each template numbers from Date.now(), so this is the check that the
  //     rebase in makeProjectDocuments actually runs.
  const ids = all.map(b => b.id)
  report(new Set(ids).size === ids.length,
    `${ids.length} unikke blok-id'er på tværs af dokumenterne`)

  // 4 — A2's blocks feed each other by id; those must survive the rebase
  let refsOk = true, refsN = 0
  for (const [docId, blocks] of Object.entries(docs)) {
    const own  = new Set(blocks.map(b => b.id))
    const refs = referencesIn(blocks)
    refsN += refs.length
    if (!refs.every(r => own.has(r))) { refsOk = false; console.log(`        ${docId} har referencer uden for dokumentet`) }
  }
  report(refsOk, `${refsN} interne blokreferencer peger på blokke i samme dokument`)

  // 5 — the point of the whole exercise: one description, one set of classes
  const cc = suggestCC(o).cc
  const kk = suggestKK({ ...o, cc }).kk
  const b2 = textOf(docs.B2)
  const statesBoth = b2.includes(`Konstruktionsklasse: ${kk}`) && b2.includes(`Konsekvensklasse: CC${cc}`)
  report(statesBoth, `B2 angiver ${kk} og CC${cc} — samme som A1 og B1 er genereret fra`)

  // 6 — every frame element must name its section, not just carry stiffness.
  //     An element with raw E/A/I has no material, and the check generated from
  //     it falls back to a steel IPE300 — which is how a C24 roof ended up with
  //     two EN 1993-1-1 checks in its A2.
  checks += 1
  const femBlocks = Object.values(docs).flat()
    .filter(b => b.type === 'general_frame_fem')
  const bare = femBlocks.flatMap(b => (b.data.elements ?? [])
    .filter(e => !e.material || !e.section)
    .map(e => `${b.data.title}: element ${e.id}`))
  report(bare.length === 0,
    bare.length === 0
      ? `${femBlocks.reduce((n, b) => n + (b.data.elements?.length ?? 0), 0)} FEM-elementer har tværsnitsreference`
      : `uden tværsnit: ${bare.join(', ')}`)

  // 7 — a control plan that asks for things this project does not contain is
  //     worse than no control plan
  const materialer = o.materialer ?? {}
  const nonsense = []
  if (!materialer.beton && /rmering/i.test(b2))       nonsense.push('armering uden beton')
  if (!o.geoteknisk   && /[Ff]undering/.test(b2))     nonsense.push('fundering uden geoteknik')
  if (materialer.trae && !/træ/i.test(b2))            nonsense.push('træ nævnes ikke selvom projektet er i træ')
  report(nonsense.length === 0,
    nonsense.length === 0
      ? 'B2 indeholder kun kontrolpunkter der er relevante for projektet'
      : `B2: ${nonsense.join(', ')}`)
}

// ── B2 scales with the construction class ────────────────────────────────────
console.log('\nB2 — kontrolomfang følger konstruktionsklassen')
checks += 2

const countItems = (opts) =>
  makeB2Template(opts).filter(b => b.type === 'control_plan')
    .reduce((n, b) => n + b.data.items.length, 0)

const kk1 = { ...optionsFor(PROJECT_TYPES[0].key) }                       // enfamiliehus → KK1
const kk3 = { ...kk1, bygningskategori: 'andet', simpel: false, etager: 3 } // kompleks CC2 → KK3

const n1 = countItems(kk1), n3 = countItems(kk3)
report(n3 > n1, `KK1: ${n1} punkter · KK3: ${n3} punkter — flere krav i højere klasse`)

// The requirement paragraph, not the legend — a KK1 plan may still explain
// what the control column means.
const uvildig = (opts) => makeB2Template(opts).some(b => /Uvildig kontrollant/.test(JSON.stringify(b.data)))
report(!uvildig(kk1) && uvildig(kk3),
  'kravet om uvildig kontrol står kun i KK2 og opefter')

console.log(failed === 0
  ? `\nAlle ${checks} kontroller stemmer.\n`
  : `\n${failed} af ${checks} kontroller fejler.\n`)
process.exit(failed === 0 ? 0 : 1)
