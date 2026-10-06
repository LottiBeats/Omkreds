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
