/**
 * femSystems.js — statiske systemer som parametre i stedet for koordinater
 *
 * At bede ingeniøren om at taste knude 3 ind på (1,8 · 1,2) er ikke
 * modellering, det er bogholderi — og det er dér den generelle FEM-blok holder
 * op med at ligne værktøj og begynder at ligne en formular. Systemet her
 * leverer geometri og understøtninger ud fra et par mål.
 *
 * Der var fem systemer: udkraget, kontinuerlig, portalramme og hanebåndsramme
 * ved siden af den simple bjælke. De er taget ud igen. Det er ikke, fordi de
 * ikke virkede — de var afprøvet — men fordi en menu med fem valg, hvoraf det
 * ene bliver brugt, koster mere at holde rigtig end den giver.
 *
 * Skabelonerne er rene generatorer: modalen skriver de færdige knuder og
 * elementer ind i blokken, og systemnøglen gemmes ikke. Et projekt, der blev
 * bygget med en portalramme, bliver derfor stående uændret — det kan bare ikke
 * genskabes med et klik. Geometrien kan altid tastes i hånden.
 *
 * Opdelingen holdes væk fra brugerfladen med vilje: elementerne inddeles
 * automatisk. Det er ikke nødvendigt for momentet — det bestemmes langs
 * elementet — men knudeflytningerne findes kun i knuderne, så ét enkelt
 * element ville rapportere nedbøjningen 0 midt i et fag.
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
