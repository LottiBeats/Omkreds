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
  assert.deepEqual(r, ['= 2,4 m', '= 5 kN/m', '= 3,6 kNm', '= 24 N/mm²', '= 285 188 mm³',
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

// ── 2026-10-08: input med potens-enheder, π, °, tusindtal, æøå ──────────────
test('et tal med en enhed i potens er et input, vist i sin egen enhed', () => {
  const r = evaluate(['I = 8356 cm⁴', 'A = 3 m²', 'q = 5 kN/m²', 'W = 628 cm^3'])
  for (const x of r) { assert.equal(x.input, true, x.raw); assert.equal(x.formula, null) }
  assert.deepEqual(chip(r[0]), ['', '= 8356 cm⁴'])
  assert.deepEqual(chip(r[1]), ['', '= 3 m²'])
  const f = evaluate(['l = 0,7·3 m'])[0]
  assert.equal(f.input, false)
})

test('π, grader og tusindtal kan skrives, som appen selv skriver dem', () => {
  const r = evaluate(['n = 2', 'A_s = n·π·(12 mm)²/4', 'c = cos(60°)', 'F = 1 000 kN'])
  assert.ok(!r.some(x => x.error), JSON.stringify(r.map(x => x.error)))
  assert.match(chip(r[1])[1], /226,2 mm²/)
  assert.ok(Math.abs(r[2].value - 0.5) < 1e-12)
  assert.match(chip(r[3])[1], /1000 kN/)
})

test('navne med æ, ø og å er navne, ikke brødtekst', () => {
  const r = evaluate(['Ø = 12 mm', 'A_Ø = π·Ø²/4'])
  assert.equal(r[0].kind, 'assign')
  assert.match(chip(r[1])[1], /113,1 mm²/)
})

test('et indsat tal i en funktion får ikke dobbelte parenteser', () => {
  const r = evaluate(['a = -5 kN', 'b = abs(a)'])
  assert.equal(r[1].subst, 'abs(−5 kN)')
})
