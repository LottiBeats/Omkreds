// Import af færdige dokumenter fra en fil.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { laesImport, anvendImport, beskrivImport } from '../src/lib/importDokumenter.js'

const blok = (id, text = 'x') => ({ id, type: 'text', data: { text } })
const projekt = () => ({
  id: 'p1', _rev: 7,
  metadata: { project_name: 'Sag', cover_image_b64: 'data:...' },
  documents: {
    A1: { title: 'Konstruktionsgrundlag', blocks: [blok(1, 'gammel')], subdocs: [] },
    A2: { title: 'Statiske beregninger', blocks: [blok(2)], subdocs: [{ name: 'A2.2', blocks: [blok(3, 'beholdes')] }] },
    B1: { title: 'Statisk projektredegørelse', blocks: [blok(4, 'urørt')], subdocs: [] },
  },
})

test('en gyldig fil læses', () => {
  const r = laesImport(JSON.stringify({ metadata: { matrikel: '15ie' }, docs: { A1: { blocks: [blok(10)] } } }))
  assert.equal(r.ok, true)
  assert.deepEqual(r.metadata, { matrikel: '15ie' })
  assert.equal(beskrivImport(r), 'A1 (1 blokke)')
})

test('en fil med fejl afvises med en forklaring', () => {
  assert.match(laesImport('ikke json').fejl, /JSON/)
  assert.match(laesImport('{}').fejl, /docs/)
  assert.match(laesImport(JSON.stringify({ docs: { C9: { blocks: [] } } })).fejl, /C9/)
  assert.match(laesImport(JSON.stringify({ docs: { A1: {} } })).fejl, /blokke/)
  assert.match(laesImport(JSON.stringify({ docs: { A1: { blocks: [{ type: 'text' }] } } })).fejl, /blok 1/)
  assert.match(laesImport(JSON.stringify({ docs: {} })).fejl, /ingen dokumenter/)
})

test('interne felter og ikke-tekst i metadata springes over', () => {
  const r = laesImport(JSON.stringify({ metadata: { _rev: '1', fase: 'Udførelse', antal: 3 }, docs: { A1: { blocks: [] } } }))
  assert.deepEqual(r.metadata, { fase: 'Udførelse' })
})

test('importen erstatter kun de dokumenter, der står i filen', () => {
  const imp = laesImport(JSON.stringify({
    metadata: { matrikel: '15ie' },
    docs: { A1: { title: 'Nyt grundlag', blocks: [blok(10, 'ny')] }, A2: { blocks: [blok(11)] } },
  }))
  const p = anvendImport(projekt(), imp)
  assert.equal(p.documents.A1.title, 'Nyt grundlag')
  assert.equal(p.documents.A1.blocks[0].data.text, 'ny')
  assert.equal(p.documents.A2.title, 'Statiske beregninger')          // ingen titel i filen
  assert.equal(p.documents.A2.subdocs[0].blocks[0].data.text, 'beholdes')
  assert.equal(p.documents.B1.blocks[0].data.text, 'urørt')
  assert.equal(p.metadata.matrikel, '15ie')
  assert.equal(p.metadata.cover_image_b64, 'data:...')                 // stamdata bevares
  assert.equal(p._rev, 7)
})

test('manglende og dobbelte id får nye', () => {
  const imp = laesImport(JSON.stringify({ docs: { A1: { blocks: [blok(5), blok(5), { type: 'text', data: {} }] } } }))
  const ids = anvendImport(projekt(), imp, 1000).documents.A1.blocks.map(b => b.id)
  assert.equal(new Set(ids).size, 3)
  assert.equal(ids[0], 5)
})
