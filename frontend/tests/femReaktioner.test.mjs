// Reaktionstabellen: lasttilfælde først, så kombinationer (brud før
// anvendelse), og største/mindste over brudkombinationerne med navn.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reaktionsRaekker, reaktionsEkstremer, reaktionerSomTsv } from '../src/components/fem/femReaktioner.js'

const SUMMARY = {
  reaktioner_tilfaelde: [
    { nr: 1, navn: 'LC1 Egenlast', reactions: { 1: [2.367, 7.5, -2.323], 4: [-2.367, 7.5, 2.323] } },
  ],
  combo_figs: [
    { name: 'SLS kar.', situation: 'sls_karakteristisk', state: { reactions: { 1: [1, 2, 3], 4: [4, 5, 6] } } },
    { name: '6.10a', situation: 'uls', state: { reactions: { 1: [2.84, 9.0, -2.788], 4: [-2.84, 9.0, 2.788] } } },
    { name: '6.10b', situation: 'uls', state: { reactions: { 1: [3.0, 12.0, -3.1], 4: [-3.0, 12.0, 3.1] } } },
  ],
}

test('rækkefølge: lasttilfælde, brud, anvendelse', () => {
  const r = reaktionsRaekker(SUMMARY)
  assert.deepEqual([...new Set(r.map(x => x.gruppe))],
    ['Lasttilfælde (karakteristisk)', 'Brudgrænsetilstand', 'Anvendelse, karakteristisk'])
  assert.equal(r.length, 2 + 4 + 2)
})

test('største og mindste over brud, med kombinationens navn', () => {
  const e = reaktionsEkstremer(SUMMARY)
  assert.equal(e[1][1].max, 12.0); assert.equal(e[1][1].maxNavn, '6.10b')
  assert.equal(e[1][1].min, 9.0);  assert.equal(e[1][1].minNavn, '6.10a')
  assert.equal(e[4][0].min, -3.0)
})

test('Excel-tekst med komma som decimaltegn', () => {
  const t = reaktionerSomTsv(reaktionsRaekker(SUMMARY).slice(0, 1))
  assert.match(t, /LC1 Egenlast\t1\t2,37\t7,50\t-2,32/)
})

test('uden kombinationer: den ene beregning', () => {
  const r = reaktionsRaekker({ reactions: { 2: { Fx_kN: 1, Fy_kN: 2, Mz_kNm: 0 } } })
  assert.deepEqual(r, [{ gruppe: 'Beregning', navn: 'Beregning', knude: 2, R: [1, 2, 0] }])
})
