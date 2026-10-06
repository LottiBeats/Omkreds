// Egen beregning: et navn er enten en enhed eller en værdi -- aldrig stille
// det ene, når der var skrevet det andet. Kør: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluate, chip } from '../src/lib/calcEngine.js'

const run = (lines) => evaluate(lines).map(chip).map(([, t]) => t)

test('almindelige linjer regner med enheder', () => {
  const r = run([
    'L = 2,4 m', 'q_d = 5,0 kN/m', 'M_Ed = q_d·L²/8 → kNm',
    'f_m_k = 24 N/mm²', 'W = 45 mm·(195 mm)²/6', 'σ = M_Ed/W',
    'M2 = 10 kN·m', 'p = (1,6 kN)/m', 'a = 5 kN/m²·4 m', 'z = 2·L', 'y = -5 kN',
  ])
  assert.deepEqual(r, ['= 2,4 m', '= 5 kN/m', '= 3,6 kNm', '= 24 MPa', '= 285 188 mm³',
    '= 12,62 MPa', '= 10 kNm', '= 1,6 kN/m', '= 20 kN/m', '= 4,8 m', '= −5 kN'])
})

test('en værdi med en enheds navn spiser ikke enheden', () => {
  // Før: L = 3 m gav 6 (uden enhed), og 3 N/mm² gav 150 000 MPa.
  assert.match(run(['m = 2', 'L = 3 m'])[1], /m står som enhed/)
  assert.match(run(['m = 2', 'q = 2 kN/m'])[1], /m står som enhed/)
  assert.match(run(['N = 50 kN', 'f_v = 3 N/mm²'])[1], /N står som enhed/)
  assert.match(run(['s = 0,8 kN/m²', 't = 2 s'])[1], /s står som enhed/)
  assert.match(run(['N = 50 kN', 'x = 1 kN', 'x ≤ 3 N'])[2], /N står som enhed/)
})

test('en værdi med en enheds navn kan stadig bruges som værdi', () => {
  assert.deepEqual(run(['W = 1000 mm³', 'M = 2 kNm', 'σ = M/W']).at(-1), '= 2000 MPa')
  assert.deepEqual(run(['t = 45 mm', 'A = t·100 mm']).at(-1), '= 4500 mm²')
  assert.deepEqual(run(['h = 195 mm', 'b = 45 mm', 'A = b·h']).at(-1), '= 8775 mm²')
})

test('et udefineret navn bliver ikke stille til en enhed eller konstant', () => {
  // Før: b·h uden h gav "45 mm·h" (timer), L blev liter, phi 1,618, e 2,718.
  assert.match(run(['b = 45 mm', 'A = b·h'])[1], /h er ikke defineret/)
  assert.match(run(['q = 5 kN/m', 'M = q·L²/8'])[1], /L er ikke defineret/)
  assert.match(run(['x = 2·phi'])[0], /φ er ikke defineret/)
  assert.match(run(['x = 2·e'])[0], /e er ikke defineret/)
  assert.deepEqual(run(['x = 2·pi']), ['= 6,283'])
})
