/**
 * femSystems.js — statiske systemer som parametre i stedet for koordinater
 *
 * Næsten alt virkeligt arbejde har en kendt topologi. At bede ingeniøren om at
 * taste knude 3 ind på (1,8 · 1,2) er ikke modellering, det er bogholderi — og
 * det er dér den generelle FEM-blok holder op med at ligne værktøj og begynder
 * at ligne en formular.
 *
 * Hvert system her leverer geometri, understøtninger og led ud fra et par mål.
 * Tre ting bliver holdt væk fra brugerfladen med vilje:
 *
 *   Opdeling. Elementerne inddeles automatisk. Det er ikke længere nødvendigt
 *   for momentet — det bestemmes langs elementet — men knudeflytningerne findes
 *   kun i knuderne, så et enkelt element ville rapportere nedbøjningen 0 midt i
 *   et fag. Ingen grund til at gøre det til brugerens problem.
 *
 *   Charnierer. Et charnier i rygningen laves i OpenSees med to sammenfaldende
 *   knuder bundet i flytning men ikke rotation. Det er en solver-idiom, ikke et
 *   konstruktionsbegreb, og den bliver genereret her i stedet for at stå i en
 *   equalDOF-liste som brugeren selv skal finde på.
 *
 *   Led kontra elementer. Et spær er ét led. At det regnes som to elementer med
 *   samme member_id er en detalje ved beregningen.
 */

// Elements per span. Enough for a smooth diagram and a deflection read at the
// quarter points; the design moment no longer depends on it.
const SUBDIV = 4

const round = (v, d = 4) => Number(v.toFixed(d))

/**
 * Build a chain of elements between two points, subdivided, sharing a member.
 * Returns { nodes, elements } and continues from the ids it is given.
 */
function chain(from, to, { nid, eid, member, group, n = SUBDIV, release = 'none' }) {
  const nodes = [], elements = []
  let prev = from.id

  for (let i = 1; i <= n; i++) {
    const t = i / n
    const isLast = i === n
    let here
    if (isLast && to.id != null) {
      here = to.id
    } else {
      here = nid.next()
      nodes.push({
        id: here,
        x: round(from.x + t * (to.x - from.x)),
        y: round(from.y + t * (to.y - from.y)),
      })
    }
    elements.push({
      id: eid.next(), ni: prev, nj: here, type: 'beam',
      // A release belongs to the member's ends, not to every slice of it
      release: n === 1 ? release
             : i === 1 && (release === 'start' || release === 'both') ? 'start'
             : isLast && (release === 'end' || release === 'both')   ? 'end'
             : 'none',
      member_id: member,
      group,
    })
    prev = here
  }
  return { nodes, elements }
}

function counter(start) {
  let v = start
  return { next: () => v++, peek: () => v }
}


// ── Systems ───────────────────────────────────────────────────────────────────

export const FEM_SYSTEMS = [
  {
    key:   'simple_beam',
    label: 'Simpelt understøttet bjælke',
    hint:  'Ét fag · charnier og rulle',
    groups: [{ key: 'beam', label: 'Bjælke' }],
    params: [
      { key: 'L', label: 'Spænd', unit: 'm', value: 6, min: 0.5, step: 0.5 },
    ],
    build: ({ L }) => {
      const nid = counter(2), eid = counter(1)
      const nodes = [{ id: 1, x: 0, y: 0 }]
      const end   = { id: null, x: L, y: 0 }
      const c = chain({ id: 1, x: 0, y: 0 }, end, { nid, eid, member: 1, group: 'beam' })
      nodes.push(...c.nodes)
      const last = nodes[nodes.length - 1].id
      return {
        nodes, elements: c.elements, equal_dofs: [],
        supports: [
          { node_id: 1,    ux: true,  uy: true, rz: false },
          { node_id: last, ux: false, uy: true, rz: false },
        ],
      }
    },
  },

  {
    key:   'cantilever',
    label: 'Udkraget bjælke',
    hint:  'Indspændt i den ene ende, fri i den anden',
    groups: [{ key: 'beam', label: 'Bjælke' }],
    params: [
      { key: 'L', label: 'Udkragning', unit: 'm', value: 2.5, min: 0.3, step: 0.25 },
    ],
    build: ({ L }) => {
      const nid = counter(2), eid = counter(1)
      const nodes = [{ id: 1, x: 0, y: 0 }]
      const c = chain({ id: 1, x: 0, y: 0 }, { id: null, x: L, y: 0 },
                      { nid, eid, member: 1, group: 'beam' })
      nodes.push(...c.nodes)
      return {
        nodes, elements: c.elements, equal_dofs: [],
        supports: [{ node_id: 1, ux: true, uy: true, rz: true }],
      }
    },
  },

  {
    key:   'continuous_beam',
    label: 'Kontinuerlig bjælke',
    hint:  'Flere lige store fag over mellemunderstøtninger',
    groups: [{ key: 'beam', label: 'Bjælke' }],
    params: [
      { key: 'L',     label: 'Fagspænd',   unit: 'm', value: 4, min: 0.5, step: 0.5 },
      { key: 'spans', label: 'Antal fag',  unit: '',  value: 3, min: 2, max: 12, step: 1, int: true },
    ],
    build: ({ L, spans }) => {
      const nid = counter(2), eid = counter(1)
      const nodes = [{ id: 1, x: 0, y: 0 }]
      const elements = []
      const supportIds = [1]
      let from = { id: 1, x: 0, y: 0 }

      for (let s = 0; s < spans; s++) {
        const to = { id: null, x: round(L * (s + 1)), y: 0 }
        const c = chain(from, to, { nid, eid, member: 1, group: 'beam' })
        nodes.push(...c.nodes)
        elements.push(...c.elements)
        const endId = nodes[nodes.length - 1].id
        supportIds.push(endId)
        from = { id: endId, x: to.x, y: 0 }
      }

      return {
        nodes, elements, equal_dofs: [],
        // One pin holds the beam in place; the rest are rollers, so thermal
        // movement is not restrained at every support.
        supports: supportIds.map((id, i) => ({
          node_id: id, ux: i === 0, uy: true, rz: false,
        })),
      }
    },
  },

  {
    key:   'portal',
    label: 'Portalramme',
    hint:  'To søjler og en rigel · charnier- eller indspændt fod',
    groups: [
      { key: 'columns', label: 'Søjler' },
      { key: 'beam',    label: 'Rigel'  },
    ],
    params: [
      { key: 'L', label: 'Spænd', unit: 'm', value: 6, min: 1, step: 0.5 },
      { key: 'H', label: 'Søjlehøjde', unit: 'm', value: 4, min: 1, step: 0.5 },
      { key: 'fixedBase', label: 'Indspændt fod', type: 'bool', value: false,
        hint: 'Slået fra giver charnierfod — normalt for en fundamentsbolt' },
    ],
    build: ({ L, H, fixedBase }) => {
      const nid = counter(3), eid = counter(1)
      const nodes = [{ id: 1, x: 0, y: 0 }, { id: 2, x: round(L), y: 0 }]
      const elements = []

      const left  = chain({ id: 1, x: 0, y: 0 }, { id: null, x: 0, y: H },
                          { nid, eid, member: 1, group: 'columns' })
      nodes.push(...left.nodes); elements.push(...left.elements)
      const topLeft = nodes[nodes.length - 1].id

      const right = chain({ id: 2, x: L, y: 0 }, { id: null, x: L, y: H },
                          { nid, eid, member: 2, group: 'columns' })
      nodes.push(...right.nodes); elements.push(...right.elements)
      const topRight = nodes[nodes.length - 1].id

      const beam = chain({ id: topLeft, x: 0, y: H },
                         { id: topRight, x: L, y: H },
                         { nid, eid, member: 3, group: 'beam' })
      nodes.push(...beam.nodes); elements.push(...beam.elements)

      return {
        nodes, elements, equal_dofs: [],
        supports: [1, 2].map(id => ({ node_id: id, ux: true, uy: true, rz: !!fixedBase })),
      }
    },
  },

  {
    key:   'collar_roof',
    label: 'Hanebåndsramme',
    hint:  'Symmetrisk saddeltag med hanebånd',
    groups: [
      { key: 'rafters', label: 'Spær'     },
      { key: 'collar',  label: 'Hanebånd' },
    ],
    params: [
      { key: 'L',      label: 'Spænd',            unit: 'm', value: 6,   min: 2,   step: 0.5 },
      { key: 'rise',   label: 'Rejsning',         unit: 'm', value: 2,   min: 0.3, step: 0.1,
        hint: 'Højde fra murplade til rygning' },
      { key: 'collar', label: 'Hanebånd o. murplade', unit: 'm', value: 1.2, min: 0.1, step: 0.1 },
      { key: 'ridgeHinge', label: 'Charnier i rygningen', type: 'bool', value: true,
        hint: 'Spærene støder mod hinanden uden at overføre moment' },
    ],
    // A collar at or above the ridge is not a steeper roof, it is a different
    // structure — and the generator would happily emit it, because nothing
    // about it is structurally invalid. Caught here rather than in the solver.
    validate: ({ rise, collar }) =>
      collar >= rise ? 'Hanebåndet skal sidde under rygningen.'
      : collar > 0.9 * rise ? 'Hanebåndet sidder næsten i rygningen — kontrollér målene.'
      : null,
    build: ({ L, rise, collar, ridgeHinge }) => {
      const nid = counter(3), eid = counter(1)
      // Where the collar meets the rafter, from similar triangles
      const xc = round(collar * (L / 2) / rise)
      const nodes = [{ id: 1, x: 0, y: 0 }, { id: 2, x: round(L), y: 0 }]
      const elements = []

      const collarLeft  = nid.next()
      const collarRight = nid.next()
      nodes.push({ id: collarLeft,  x: xc,            y: round(collar) })
      nodes.push({ id: collarRight, x: round(L - xc), y: round(collar) })

      const ridgeL = nid.next()
      nodes.push({ id: ridgeL, x: round(L / 2), y: round(rise) })
      // A hinge at the ridge is two nodes in the same place, tied in
      // translation only. Generated here so it never reaches the UI.
      const ridgeR = ridgeHinge ? nid.next() : ridgeL
      if (ridgeHinge) nodes.push({ id: ridgeR, x: round(L / 2), y: round(rise) })

      const seg = (from, to, member) => {
        const c = chain(from, to, { nid, eid, member, group: 'rafters', n: 2 })
        nodes.push(...c.nodes); elements.push(...c.elements)
      }
      seg({ id: 1, x: 0, y: 0 },            { id: collarLeft,  x: xc,     y: collar }, 1)
      seg({ id: collarLeft, x: xc, y: collar }, { id: ridgeL,   x: L / 2,  y: rise   }, 1)
      seg({ id: ridgeR, x: L / 2, y: rise },    { id: collarRight, x: L - xc, y: collar }, 2)
      seg({ id: collarRight, x: L - xc, y: collar }, { id: 2, x: L, y: 0 },             2)

      elements.push({
        id: eid.next(), ni: collarLeft, nj: collarRight, type: 'beam',
        // The collar is one piece of timber like the rafters are, so it gets a
        // member of its own — otherwise it shows up as an element belonging to
        // nothing, and its section cannot be set where the others' are.
        release: 'both', member_id: 3, group: 'collar',
      })

      return {
        nodes, elements,
        equal_dofs: ridgeHinge
          ? [{ r_node: ridgeL, c_node: ridgeR, dofs: [1, 2] }]
          : [],
        supports: [
          { node_id: 1, ux: true,  uy: true, rz: false },
          { node_id: 2, ux: false, uy: true, rz: false },
        ],
      }
    },
  },
]

/** A message when the measures do not describe a structure, otherwise null. */
export function validateParams(key, params) {
  const s = findSystem(key)
  if (!s?.validate) return null
  return s.validate({ ...defaultParams(key), ...params })
}

export function findSystem(key) {
  return FEM_SYSTEMS.find(s => s.key === key) ?? null
}

/** The parameter defaults for a system, as a plain object. */
export function defaultParams(key) {
  const s = findSystem(key)
  return Object.fromEntries((s?.params ?? []).map(p => [p.key, p.value]))
}

/**
 * Build a system and stamp the chosen section onto each element group.
 *
 * The section is a *reference*, so the analysis and the member check generated
 * from an element describe the same thing — an element carrying only raw E/A/I
 * has no material, and the check falls back to steel.
 */
export function buildSystem(key, params, sections = {}) {
  const s = findSystem(key)
  if (!s) return null
  const model = s.build({ ...defaultParams(key), ...params })
  model.elements = model.elements.map(el => {
    const sec = sections[el.group]
    const { group, ...rest } = el
    return sec?.section ? { ...rest, ...sec } : rest
  })
  return model
}
