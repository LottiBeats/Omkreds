// Find og erstat (Ctrl+F / Ctrl+H) og understregning i tekstens gemte format.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findAlle, erstatI } from '../src/lib/findErstat.js'
import { parseText, serializeDoc } from '../src/lib/richText.js'

const blocks = [
  { id: 1, type: 'heading', data: { text: 'Rammer' } },
  { id: 2, type: 'text', data: { text: 'To rammer og **rammerne** pr. 3 m (c/c).' } },
  { id: 3, type: 'steel_beam', data: { text: 'rammer' } },
]

test('finder i tekst og overskrifter, ikke i beregninger', () => {
  assert.deepEqual(findAlle(blocks, 'rammer', false), [
    { blockId: 1, k: 0 }, { blockId: 2, k: 0 }, { blockId: 2, k: 1 },
  ])
  assert.equal(findAlle(blocks, 'Rammer', true).length, 1)
  assert.equal(findAlle(blocks, '', false).length, 0)
})

test('specialtegn søges som de står', () => {
  assert.equal(findAlle(blocks, '(c/c)', false).length, 1)
  assert.equal(findAlle(blocks, '3 m.', false).length, 0)
})

test('erstat én eller alle', () => {
  const t = blocks[1].data.text
  assert.equal(erstatI(t, 'rammer', 'buer', false, 1), 'To rammer og **buerne** pr. 3 m (c/c).')
  assert.equal(erstatI(t, 'RAMMER', 'buer', false), 'To buer og **buerne** pr. 3 m (c/c).')
  assert.equal(erstatI('a $1 b', '$1', '$&x', false), 'a $&x b')
})

test('understregning gemmes som ++…++ og kommer tilbage', () => {
  for (const t of ['Et ++vigtigt++ ord', '++**fed og understreget**++', 'a ++b *c* d++ e', '++a++ ++b++']) {
    assert.equal(serializeDoc(parseText(t)), t)
  }
})
