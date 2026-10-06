// Konstruktionselementer: nummer, hvad der hører til et element, og status.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { naesteNr, elementerI, indsaetPlads, nytElement, beregningFor } from '../src/lib/elementer.js'
import { calcRevision } from '../src/lib/calcState.js'
import { makeTimberRoofTemplate } from '../src/templates/a2TimberRoof.js'

const el = (nr, extra = {}) => ({ id: nr, type: 'element', data: { nr, level: 2, ...extra } })
const h = (level, text) => ({ id: text, type: 'heading', data: { level, text } })
const beregning = (id, ratio, extra = {}) => ({ id, type: 'timber_beam', data: {
  _result: ratio === null ? null : [{ type: 'check', ratio, passes: ratio <= 1 }],
  _calc_rev: calcRevision('timber_beam'), ...extra } })

test('numre følger arten og genbruges ikke', () => {
  assert.equal(naesteNr([], 'bjaelke'), 'B.1')
  const blokke = [el('B.1'), el('B.3'), el('S.1'), el('SP.2')]
  assert.equal(naesteNr(blokke, 'bjaelke'), 'B.4')   // ikke B.2: B.3 står allerede på tegningen
  assert.equal(naesteNr(blokke, 'soejle'), 'S.2')
  assert.equal(naesteNr(blokke, 'spaer'), 'SP.3')
  assert.equal(naesteNr(blokke, 'samling'), 'SA.1')
})

test('et element slutter ved næste element eller en overskrift på samme niveau', () => {
  const blokke = [
    h(1, 'Laster'), beregning('lc', 0.1),
    el('B.1'), beregning('b1', 0.8),
    el('S.1'), { id: 'txt', type: 'text', data: { text: 'note' } }, beregning('s1', 0.5),
    h(2, 'Konklusion'), { id: 'slut', type: 'text', data: { text: '' } },
  ]
  const e = elementerI(blokke)
  assert.deepEqual(e.map(x => x.beregninger.map(b => b.id)), [['b1'], ['s1']])
  assert.equal(indsaetPlads(blokke), 7)   // efter S.1's blokke, før Konklusion
})

test('status: ikke OK → ikke kørt → OK', () => {
  const [a, b, c, d] = elementerI([
    el('B.1'), beregning('1', 1.2),
    el('B.2'), beregning('2', null),
    el('B.3'), beregning('3', 0.7), beregning('4', 0.9),
    el('B.4'),
  ])
  assert.equal(a.status.tone, 'fail')
  assert.equal(b.status.tekst, 'ikke kørt')
  assert.deepEqual([c.status.tone, c.status.eta], ['ok', 0.9])
  assert.equal(d.status.tekst, 'ingen beregning')
})

test('kun efterregnede moduler; resten starter tomt', () => {
  assert.equal(beregningFor('bjaelke', 'trae'), 'timber_beam')
  assert.equal(beregningFor('soejle', 'staal'), 'steel_column')
  assert.equal(beregningFor('vaeg', 'murvaerk'), 'custom_calc')
  assert.equal(beregningFor('fundament', 'beton'), 'custom_calc')
  const [overskrift, calc] = nytElement([], { art: 'samling', materiale: 'staal', navn: 'Fodplade' })
  assert.equal(overskrift.data.nr, 'SA.1')
  assert.equal(calc.type, 'custom_calc')
  assert.ok(!calc.data.lines.some(l => /=/.test(l)), 'ingen eksempeltal i en tom beregning')
})

test('tagskabelonen har spær og hanebånd som elementer', () => {
  const e = elementerI(makeTimberRoofTemplate())
  assert.deepEqual(e.map(x => x.block.data.nr), ['SP.1', 'SP.2', 'HB.1'])
  assert.deepEqual(e.map(x => x.beregninger.map(b => b.type)),
    [['timber_beam'], ['timber_beam'], ['custom_calc']])
})

// ── Rammekonstruktioner ──────────────────────────────────────────────────────
import { rammeStaenger, ledigeStaenger, forslagFor } from '../src/lib/elementer.js'

const RAMME = { id: 9, type: 'general_frame_fem', data: {
  nodes: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 0, y: 4 }, { id: 3, x: 6, y: 6 }, { id: 4, x: 12, y: 4 }, { id: 5, x: 3, y: 5 }, { id: 6, x: 9, y: 5 }],
  elements: [
    { id: 1, ni: 1, nj: 2, member_id: 1, material: 'timber', section: '90x190', grade: 'GL24h' },
    { id: 2, ni: 2, nj: 3, member_id: 2, material: 'timber', section: '45x195', grade: 'C24' },
    { id: 3, ni: 3, nj: 4, member_id: 3, material: 'steel',  section: 'IPE200', grade: 'S355' },
    { id: 4, ni: 5, nj: 6, release: 'both', material: 'timber', section: '45x95', grade: 'C24' },
  ],
  _member_checks: { 1: { eta: 0.64, mode: 'column' }, 2: { eta: 1.08 } },
  _summary: {}, _result: [], _calc_rev: calcRevision('general_frame_fem'),
} }

test('stængerne i rammen og hvad de nok er', () => {
  const st = rammeStaenger([RAMME])
  assert.deepEqual(st.map(s => s.exportId), [1001, 1002, 1003, 4])
  assert.deepEqual(st.map(s => forslagFor(s).art), ['soejle', 'spaer', 'bjaelke', 'hanebaand'])
  assert.deepEqual(st.map(s => forslagFor(s).materiale), ['trae', 'trae', 'staal', 'trae'])
})

test('et element fra en stang er koblet til den', () => {
  const [soejle, spaer, staal, hb] = rammeStaenger([RAMME])
  // Søjlen: ingen blok -- rammen eftervisner den som søjle.
  assert.equal(nytElement([RAMME], { ...forslagFor(soejle), stang: soejle }).length, 1)
  // Spæret: en træbjælke, der henter stangens snitkræfter.
  const [el, tb] = nytElement([RAMME], { ...forslagFor(spaer), stang: spaer })
  assert.deepEqual(el.data.kilde, { fem_block_id: 9, member_id: 2, elem_id: null })
  assert.equal(tb.type, 'timber_beam')
  assert.deepEqual([tb.data.load_source, tb.data.fem_block_id, tb.data.fem_elem_id, tb.data.b_mm, tb.data.h_mm, tb.data.timber_grade],
                   ['fem', 9, 1002, 45, 195, 'C24'])
  assert.equal(nytElement([RAMME], { ...forslagFor(staal), stang: staal })[1].data.section, 'IPE200')
  // Hanebåndet har kun normalkraft: ikke en bjælkeblok med η ≈ 0.
  assert.equal(nytElement([RAMME], { ...forslagFor(hb), stang: hb })[1].type, 'custom_calc')
})

test('status læser rammens eftervisning; en koblet stang er ikke ledig', () => {
  const [soejle, spaer] = rammeStaenger([RAMME])
  const blokke = [RAMME,
    ...nytElement([RAMME], { ...forslagFor(soejle), stang: soejle }).map((b, i) => ({ ...b, id: 100 + i }))]
  const [s1] = elementerI(blokke)
  assert.deepEqual([s1.status.tone, s1.status.eta], ['ok', 0.64])
  assert.equal(ledigeStaenger(blokke).length, 3)
  const med = [...blokke, { id: 200, type: 'element', data: { nr: 'SP.1', kilde: { fem_block_id: 9, member_id: 2, elem_id: null } } }]
  assert.equal(elementerI(med)[1].status.tone, 'fail')   // rammen siger η = 1,08
})

test('tagskabelonens elementer er koblet til rammens stænger', () => {
  const blokke = makeTimberRoofTemplate()
  assert.equal(ledigeStaenger(blokke).length, 0)
  const fem = blokke.find(b => b.type === 'general_frame_fem')
  assert.ok(elementerI(blokke).every(e => e.block.data.kilde.fem_block_id === fem.id))
})
