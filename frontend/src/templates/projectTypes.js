/**
 * projectTypes.js — a whole project from one description of the job
 *
 * The document templates each answer "what goes in this document". A project
 * type answers the question before that: what kind of job is this, and which
 * documents does it therefore consist of.
 *
 * One set of answers feeds A1, A2, B1 and B2, which is the point — the
 * consequence class in A1, the document list in B1 and the konstruktionsklasse
 * in B2 are then derived from the same description and cannot contradict each
 * other. The engineer still reviews and edits every document; this decides
 * where they start, not what they conclude.
 */
import { makeA1Template, DEFAULT_OPTIONS } from './a1.js'
import { makeB1Template } from './b1.js'
import { makeB2Template } from './b2.js'
import { makeTimberRoofTemplate } from './a2TimberRoof.js'

export const PROJECT_TYPES = [
  {
    key:   'tag_enfamiliehus',
    label: 'Tagkonstruktion — enfamiliehus',
    summary: 'Hanebåndsspær i C24 · 6 m spænd · 34° taghældning',
    detail:
      'A2 indeholder hele kæden forudkoblet: egenlast, sne og vind efter ' +
      'EN 1991-1-3/4, lastkombinationer efter EN 1990, FEM-envelope og ' +
      'EN 1995-1-1-eftervisning af spær og hanebånd.',
    docs: ['A1', 'A2', 'B1', 'B2'],
    // The starting point for the project description. Everything here is
    // editable in the dialog before anything is generated — a 6 m span and a
    // single storey match the A2 model, so they agree until the engineer
    // changes them.
    options: {
      konstruktionstype: 'Nybyggeri',
      anvendelseNr:      1,               // længere ophold — beboelse
      bygningskategori:  'enfamiliehus',
      simpel:            true,
      traditionel:       true,
      etager:            1,
      kaelder:           false,
      spaendvidde:       6,
      hoejdeOver:        5,
      hoejdeUnder:       0,
      materialer:        { beton: false, staal: false, murvaerk: false, trae: true },
      geoteknisk:        false,
      eksisterende:      false,
      naboer:            false,
    },
    makeA2: makeTimberRoofTemplate,
  },
]

export function findProjectType(key) {
  return PROJECT_TYPES.find(t => t.key === key) ?? null
}

/** The options a project type starts from, merged over the plain defaults. */
export function optionsFor(key) {
  const t = findProjectType(key)
  return {
    ...DEFAULT_OPTIONS,
    ...(t?.options ?? {}),
    materialer: { ...DEFAULT_OPTIONS.materialer, ...(t?.options?.materialer ?? {}) },
  }
}

/**
 * Build the documents a project type covers.
 *
 * Returns { docId: blocks }, so the caller writes them all in a single save —
 * a half-applied project type would be worse than none, because the documents
 * would then disagree about the project.
 */
export function makeProjectDocuments(key, options, metadata = {}) {
  const t = findProjectType(key)
  if (!t) return null
  const docs = {
    A1: makeA1Template(options, metadata),
    B1: makeB1Template(options, metadata),
    B2: makeB2Template(options, metadata),
  }
  if (t.makeA2) docs.A2 = t.makeA2(options, metadata)
  return rebaseIds(docs)
}

/**
 * Give every block in the set its own id.
 *
 * Each template numbers its blocks from Date.now(), so four of them generated
 * in the same millisecond hand out the same ids. Within one document that is
 * harmless, but A2's blocks refer to each other by id — the member checks read
 * their actions from the FEM block, and the FEM block reads its combinations
 * from the load-case block — so ids that repeat across documents are a
 * collision waiting to be looked up by the wrong one.
 *
 * References are remapped along with the ids. Only values above 1e12 are
 * treated as references: block ids are timestamps, and no span, modulus or
 * section dimension in a template comes anywhere near that.
 */
function rebaseIds(docs) {
  let next = Date.now()
  const out = {}

  // One map per document, because an id only ever means something inside the
  // document that issued it — a shared map would hand two colliding blocks the
  // same new id and preserve the very collision this removes.
  for (const [docId, blocks] of Object.entries(docs)) {
    const map = new Map()
    for (const b of blocks) if (!map.has(b.id)) map.set(b.id, next++)

    const remap = (v) => {
      if (typeof v === 'number') return (v > 1e12 && map.has(v)) ? map.get(v) : v
      if (Array.isArray(v)) return v.map(remap)
      if (v && typeof v === 'object') {
        return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, remap(x)]))
      }
      return v
    }

    out[docId] = blocks.map(b => ({ ...b, id: map.get(b.id), data: remap(b.data) }))
  }
  return out
}
