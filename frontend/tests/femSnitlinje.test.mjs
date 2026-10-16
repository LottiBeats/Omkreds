// Snitlinje: knuder, hvor en linje skærer stængerne.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { skaeringer, skaerLinje } from '../src/components/fem/femModel.js'

// Et saddeltag: to søjler (0→3 m), to spær til kip i (3, 5).
const HUS = {
  nodes: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 0, y: 3 }, { id: 3, x: 3, y: 5 }, { id: 4, x: 6, y: 3 }, { id: 5, x: 6, y: 0 }],
  elements: [
    { id: 1, ni: 1, nj: 2, type: 'beam', release: 'none', member_id: 1 },
    { id: 2, ni: 2, nj: 3, type: 'beam', release: 'none', member_id: 2 },
    { id: 3, ni: 3, nj: 4, type: 'beam', release: 'none', member_id: 3 },
    { id: 4, ni: 5, nj: 4, type: 'beam', release: 'none', member_id: 4 },
  ],
  supports: [], loads: [{ type: 'udl', target: 'elem', elem_id: 2, direction: 'vertical', value_kNm: 1 }],
  load_cases: [], equal_dofs: [],
}
const vandret = (y) => [{ x: 0, y }, { x: 1, y }]

test('en vandret linje i 4 m skærer de to spær', () => {
  const p = skaeringer(HUS, ...vandret(4))
  assert.deepEqual(p.map(q => [q.x, q.y]), [[1.5, 4], [4.5, 4]])
})

test('knuder i skæringerne, spærene deles og beholder deres stang og last', () => {
  const r = skaerLinje(HUS, ...vandret(4))
  assert.equal(r.nye, 2)
  assert.equal(r.model.nodes.length, 7)
  assert.equal(r.model.elements.length, 6)
  // Begge halvdele af venstre spær hører stadig til stang 2 og har lasten.
  const spaer = r.model.elements.filter(e => e.member_id === 2)
  assert.equal(spaer.length, 2)
  assert.equal(r.model.loads.filter(l => spaer.some(e => e.id === l.elem_id)).length, 2)
})

test('en linje gennem en knude genbruger den', () => {
  const r = skaerLinje(HUS, ...vandret(3))
  assert.equal(r.nye, 0)
  assert.deepEqual(r.nodeIds, [2, 4])
})

test('med stang: ét hanebånd langs linjen mellem skæringerne', () => {
  const r = skaerLinje(HUS, ...vandret(4), { stang: true, props: { section: '45x145' } })
  const hb = r.model.elements.filter(e => e.section === '45x145')
  assert.equal(hb.length, 1)
  const [a, b] = [hb[0].ni, hb[0].nj].map(id => r.model.nodes.find(n => n.id === id))
  assert.deepEqual([a.y, b.y], [4, 4])
  assert.equal(Math.abs(b.x - a.x), 3)
})

test('lodret linje og en endelig linje', () => {
  assert.equal(skaeringer(HUS, { x: 3, y: 0 }, { x: 3, y: 1 }).length, 1)          // gennem kippen
  assert.equal(skaeringer(HUS, { x: -1, y: 4 }, { x: 2, y: 4 }, { uendelig: false }).length, 1)
})
