// Indholdsfortegnelsen: samme numre som editoren og eksporten, og underafsnit
// hænger på det afsnit, de står under.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { indholdsfortegnelse, overskriftsnumre, sti } from '../src/lib/indhold.js'
import { makeA1Template } from '../src/templates/a1.js'

const H = (id, level, text) => ({ id, type: 'heading', data: { level, text } })
const T = (id, text) => ({ id, type: 'text', data: { text } })

test('numre som eksporten: egne numre tæller ikke med', () => {
  const b = [H(1, 1, 'Indledning'), H(2, 2, 'Formål'), H(3, 2, '4.5 Robusthed'), H(4, 2, 'Levetid'), H(5, 1, 'Laster')]
  assert.deepEqual([...overskriftsnumre(b)], [[1, '1'], [2, '1.1'], [4, '1.2'], [5, '2']])
  const p = indholdsfortegnelse(b)
  assert.deepEqual(p.map(x => [x.nr, x.titel]),
    [['1', 'Indledning'], ['1.1', 'Formål'], ['4.5', 'Robusthed'], ['1.2', 'Levetid'], ['2', 'Laster']])
})

test('forælder, sti og tomme felter pr. afsnit', () => {
  const b = [H(1, 2, '4. Konstruktioner'), H(2, 3, '4.1 Statisk virkemåde'), T(3, 'Beliggende [adresse].'),
             H(4, 3, '4.5 Robusthed'), H(5, 2, '5. Materialer')]
  const p = indholdsfortegnelse(b)
  assert.deepEqual(p.map(x => x.forælder), [null, 1, 1, null])
  assert.deepEqual(p.map(x => x.huller), [0, 1, 0, 0])
  assert.deepEqual([...sti(p, 4)].sort(), [1, 4])
})

test('A1 fra skabelonen har Robusthed under Konstruktioner', () => {
  const p = indholdsfortegnelse(makeA1Template({}, {}))
  const rob = p.find(x => x.titel === 'Robusthed')
  assert.equal(rob.nr, '4.5')
  assert.equal(p.find(x => x.id === rob.forælder).titel, 'Konstruktioner')
})
