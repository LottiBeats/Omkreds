// Røgtest af alle skabeloner: hver skabelon og hver projekttype skal give
// blokke, editoren kan åbne, og FEM-modeller, hvis laster peger på noget, der
// findes.
//
// Skabelonen "Generel ramme — 2D FEM" havde en linjelast i et format, blokken
// ikke længere læste (elem_ids: [2]). Den viste "Elem 1" og blev sendt uden
// element, og modellen kunne ikke regnes -- på omkreds.dk, uden at nogen test
// sagde noget. Det er den slags, denne fil fanger.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DOC_TEMPLATES } from '../src/templates/docTemplates.js'
import { PROJECT_TYPES, makeProjectDocuments, optionsFor } from '../src/templates/projectTypes.js'
import { DEFAULT_OPTIONS } from '../src/templates/a1.js'

const FEM = new Set(['general_frame_fem', 'frame_fem', 'portal_frame_fem'])
// Laster på en stang: målrettes enten et element eller en stang (member).
const STANGLAST = new Set(['udl', 'combo_udl', 'vind_udl', 'point'])

/** Alle fejl i én skabelons blokke, som tekst. */
function fejlI(navn, blokke) {
  const fejl = []
  if (!Array.isArray(blokke)) return [`${navn}: gav ikke en liste af blokke`]
  const ids = new Set()
  for (const b of blokke) {
    const hvor = `${navn}, blok ${b?.id} (${b?.type})`
    if (typeof b?.type !== 'string' || !b.data || typeof b.data !== 'object') { fejl.push(`${hvor}: mangler type eller data`); continue }
    if (b.id == null || ids.has(b.id)) fejl.push(`${hvor}: id mangler eller er brugt før`)
    ids.add(b.id)
  }
  for (const b of blokke) {
    const hvor = `${navn}, blok ${b.id} (${b.type})`
    // Interne referencer (lastkombination → FEM osv.) skal pege inden for dokumentet.
    for (const [k, v] of Object.entries(b.data)) {
      if (k.endsWith('_block_id') && v != null && !ids.has(v)) fejl.push(`${hvor}: ${k} = ${v} findes ikke`)
    }
    if (FEM.has(b.type)) fejl.push(...femFejl(hvor, b.data))
  }
  return fejl
}

function femFejl(hvor, d) {
  const fejl = []
  const knuder = new Set((d.nodes ?? []).map(n => n.id))
  const elementer = d.elements ?? []
  const elIds = new Set(elementer.map(e => e.id))
  const stangIds = new Set(elementer.map(e => e.member_id).filter(x => x != null))
  for (const e of elementer) {
    if (!knuder.has(e.ni) || !knuder.has(e.nj)) fejl.push(`${hvor}: element ${e.id} går til en knude, der ikke findes`)
  }
  for (const s of d.supports ?? []) {
    if (!knuder.has(s.node_id)) fejl.push(`${hvor}: understøtning på knude ${s.node_id}, som ikke findes`)
  }
  const laster = [...(d.loads ?? []), ...(d.load_cases ?? []).flatMap(c => c.loads ?? [])]
  for (const l of laster) {
    if (l.type === 'nodal') {
      if (!knuder.has(l.node_id)) fejl.push(`${hvor}: punktlast på knude ${l.node_id}, som ikke findes`)
    } else if (STANGLAST.has(l.type)) {
      if (l.elem_ids != null) fejl.push(`${hvor}: ${l.type} bruger det gamle elem_ids-format, som blokken ikke læser`)
      if ((l.target ?? 'elem') === 'member') {
        if (!stangIds.has(l.member_id)) fejl.push(`${hvor}: ${l.type} på stang ${l.member_id}, som ikke findes`)
      } else if (!elIds.has(l.elem_id)) {
        fejl.push(`${hvor}: ${l.type} på element ${l.elem_id}, som ikke findes`)
      }
    }
  }
  return fejl
}

test('alle dokumentskabeloner giver blokke, der kan åbnes og regnes', () => {
  const fejl = []
  for (const [doc, liste] of Object.entries(DOC_TEMPLATES)) {
    for (const t of liste) {
      let blokke
      try { blokke = t.needsOptions ? t.make(DEFAULT_OPTIONS, {}) : t.make() }
      catch (e) { fejl.push(`${doc} "${t.label}": kaster ${e.message}`); continue }
      fejl.push(...fejlI(`${doc} "${t.label}"`, blokke))
    }
  }
  assert.deepEqual(fejl, [])
})

test('alle projekttyper giver dokumenter, der kan åbnes og regnes', () => {
  const fejl = []
  for (const t of PROJECT_TYPES) {
    const docs = makeProjectDocuments(t.key, optionsFor(t.key), {})
    assert.ok(docs, t.key)
    for (const [doc, blokke] of Object.entries(docs)) fejl.push(...fejlI(`${t.key} ${doc}`, blokke))
  }
  assert.deepEqual(fejl, [])
})

test('røgtesten fanger det gamle lastformat', () => {
  const d = { nodes: [{ id: 1 }, { id: 2 }], elements: [{ id: 1, ni: 1, nj: 2 }], supports: [],
              loads: [{ type: 'udl', elem_ids: [2], wy_kNm: 20 }] }
  const f = femFejl('x', d)
  assert.ok(f.some(s => /elem_ids/.test(s)) && f.some(s => /element undefined/.test(s)), f.join('\n'))
})
