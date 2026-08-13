/**
 * check-femsystemer.js — de parametriske statiske systemer
 *
 * Systemerne genererer det, brugeren ellers skulle taste: knude-id'er,
 * elementreferencer, understøtninger og charnierer. Går noget af det galt, er
 * det ikke en skæv figur — det er en model, solveren afviser, eller værre, en
 * den regner på uden at opdage det. Så de bliver bygget igennem her, ved deres
 * defaults og ved yderpunkterne af hver parameter.
 *
 *     npm run check
 */
import { FEM_SYSTEMS, defaultParams, buildSystem, validateParams } from '../src/templates/femSystems.js'

let failed = 0, checks = 0
const report = (ok, line) => {
  if (!ok) failed++
  console.log(`  ${ok ? 'ok  ' : 'FEJL'}  ${line}`)
}

const SEC = { material: 'timber', section: '45x145', grade: 'C24' }

/** Everything validate_model() in the backend would reject. */
function faults(m) {
  const out = []
  const ids = new Set(m.nodes.map(n => n.id))
  if (ids.size !== m.nodes.length)                      out.push('knude-id går igen')
  if (new Set(m.elements.map(e => e.id)).size !== m.elements.length) out.push('element-id går igen')

  const at = id => m.nodes.find(n => n.id === id)
  for (const e of m.elements) {
    if (!ids.has(e.ni) || !ids.has(e.nj)) { out.push(`element ${e.id} peger på en knude der ikke findes`); continue }
    const a = at(e.ni), b = at(e.nj)
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-9) out.push(`element ${e.id} har længden 0`)
    if (!e.material || !e.section) out.push(`element ${e.id} mangler tværsnit`)
  }
  for (const s of m.supports) if (!ids.has(s.node_id)) out.push(`understøtning på knude ${s.node_id}, som ikke findes`)
  for (const q of (m.equal_dofs ?? [])) {
    if (!ids.has(q.r_node) || !ids.has(q.c_node)) out.push('equalDOF peger på en knude der ikke findes')
    if (q.r_node === q.c_node) out.push('equalDOF binder en knude til sig selv')
  }

  // Every node must be attached to something, or the stiffness matrix is singular
  const used = new Set()
  for (const e of m.elements) { used.add(e.ni); used.add(e.nj) }
  for (const q of (m.equal_dofs ?? [])) { used.add(q.r_node); used.add(q.c_node) }
  for (const n of m.nodes) if (!used.has(n.id)) out.push(`knude ${n.id} hænger løst`)

  // Rank of the support constraints against the three rigid-body modes
  const rows = []
  for (const s of m.supports) {
    const n = at(s.node_id); if (!n) continue
    if (s.ux) rows.push([1, 0, -n.y])
    if (s.uy) rows.push([0, 1,  n.x])
    if (s.rz) rows.push([0, 0,  1])
  }
  if (rank3(rows) < 3) out.push('understøtningerne efterlader en mekanisme')
  return out
}

/** Rank of an n×3 matrix by Gaussian elimination. */
function rank3(rows) {
  const m = rows.map(r => [...r])
  let rank = 0
  for (let col = 0; col < 3 && rank < m.length; col++) {
    let piv = -1
    for (let r = rank; r < m.length; r++) if (Math.abs(m[r][col]) > 1e-9) { piv = r; break }
    if (piv < 0) continue
    ;[m[rank], m[piv]] = [m[piv], m[rank]]
    for (let r = rank + 1; r < m.length; r++) {
      const f = m[r][col] / m[rank][col]
      for (let c = col; c < 3; c++) m[r][c] -= f * m[rank][c]
    }
    rank++
  }
  return rank
}

/** Defaults, plus each numeric parameter at its ends and each flag both ways. */
function cases(sys) {
  const base = defaultParams(sys.key)
  const out = [['defaults', base]]
  for (const p of sys.params) {
    if (p.type === 'bool') {
      out.push([`${p.key}=true`,  { ...base, [p.key]: true  }])
      out.push([`${p.key}=false`, { ...base, [p.key]: false }])
    } else {
      out.push([`${p.key} min`, { ...base, [p.key]: p.min }])
      if (p.max != null) out.push([`${p.key} max`, { ...base, [p.key]: p.max }])
      else out.push([`${p.key} stor`, { ...base, [p.key]: p.value * 4 }])
    }
  }
  return out
}

for (const sys of FEM_SYSTEMS) {
  console.log(`\n${sys.label}`)
  const sections = Object.fromEntries(sys.groups.map(g => [g.key, SEC]))
  for (const [name, params] of cases(sys)) {
    checks++
    // Measures the system refuses are the modal's business, not a fault here
    const refused = validateParams(sys.key, params)
    if (refused && refused.startsWith('Hanebåndet skal')) {
      report(true, `${name.padEnd(16)} afvist — ${refused}`)
      continue
    }
    const m = buildSystem(sys.key, params, sections)
    const bad = m ? faults(m) : ['systemet kunne ikke bygges']
    report(bad.length === 0,
      bad.length === 0
        ? `${name.padEnd(16)} ${String(m.nodes.length).padStart(3)} knuder ${String(m.elements.length).padStart(3)} elementer`
        : `${name}: ${bad.slice(0, 3).join('; ')}`)
  }
}

// The collar roof replaces a template that was written out by hand; the
// geometry it produced is the reference.
console.log('\nHanebåndsramme — mod den håndskrevne skabelon')
checks++
const roof = buildSystem('collar_roof', { L: 6, rise: 2, collar: 1.2, ridgeHinge: true }, {})
const has = (x, y) => roof.nodes.some(n => Math.abs(n.x - x) < 1e-6 && Math.abs(n.y - y) < 1e-6)
const ridge = roof.nodes.filter(n => Math.abs(n.x - 3) < 1e-6 && Math.abs(n.y - 2) < 1e-6)
report(has(0, 0) && has(6, 0) && has(1.8, 1.2) && has(4.2, 1.2) && ridge.length === 2 &&
       roof.equal_dofs.length === 1,
  'murplade (0,0) og (6,0) · hanebånd (1,8 · 1,2) og (4,2 · 1,2) · to knuder i rygningen + equalDOF')

checks++
const noHinge = buildSystem('collar_roof', { ridgeHinge: false }, {})
report(noHinge.equal_dofs.length === 0 && noHinge.nodes.length === roof.nodes.length - 1,
  'uden charnier forsvinder både den ekstra knude og bindingen')

console.log('\nHanebåndsramme — umulige mål afvises')
checks++
report(!!validateParams('collar_roof', { rise: 2, collar: 2.5 }),
  'hanebånd over rygningen giver en indsigelse')
checks++
report(!validateParams('collar_roof', { rise: 2, collar: 1.2 }),
  'almindelige mål giver ingen indsigelse')

console.log(failed === 0
  ? `\nAlle ${checks} kontroller stemmer.\n`
  : `\n${failed} af ${checks} kontroller fejler.\n`)
process.exit(failed === 0 ? 0 : 1)
