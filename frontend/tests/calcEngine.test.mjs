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

test('indsatte tal står, som deres egen linje viste dem', () => {
  // Før: W stod som "285 188 mm·mm²", V_Ed som "6,412 kNm/m" og A som "mm·mm".
  const r = evaluate(['q = 2,85 kN/m', 'L = 4,5 m', 'V = q·L/2', 'W = 45 mm·(195 mm)²/6',
    'A = 45 mm·195 mm', 'σ = V/A', 'M = 7,2 kNm', 's = M/W'])
  const mel = (t) => t.replace(/[\u00a0\u202f]/g, ' ')
  assert.equal(mel(r[5].subst), '(6,412 kN)/(8775 mm²)')
  assert.equal(mel(r[7].subst), '(7,2 kNm)/(285 188 mm³)')
})

test('grader står uden mellemrum', () => {
  const r = evaluate(['a = 30°', 'F = 10 kN·cos(a)'])
  assert.equal(chip(r[0])[1], '= 30°')
  assert.equal(r[1].subst, '10 kN·cos(30°)')
})

test('min er minut, når der ikke står en parentes efter', () => {
  // Før: "0,65 mm/min" kunne ikke læses, fordi min blev læst som funktionen min(a; b).
  assert.deepEqual(run(['β_0 = 0,65 mm/min', 't = 30 min', 'd = β_0·t', 'a = min(3; 4)', 't_h = t → h']),
    ['= 0,65 mm/min', '= 30 min', '= 19,5 mm', '= 3', '= 0,5 h'])
})

test('enheder: stivhed, tierpotenser, høje potenser, promille og °C', () => {
  // kNm² er kN·m² (EI), ikke (kNm)²; 10⁸ og mm⁶ kan skrives, som appen viser dem.
  assert.deepEqual(run(['E = 11 000 MPa', 'I = 1,0·10⁸ mm⁴', 'EI = E·I → kNm²', 'EI_2 = 2 kNm²·5']).slice(1),
    ['= 1,00·10⁸ mm⁴', '= 1100 kNm²', '= 10 kNm²'])
  assert.deepEqual(run(['I_w = 3,2·10⁹ mm⁶', 'n = 10⁻³', 'eps = 2,5 ‰', 'M = 2 MNm', 'T = 20 °C']),
    ['= 3,20·10⁹ mm⁶', '= 0,001', '= 0,0025', '= 2 MNm', '= 20 °C'])
  const r = evaluate(['I = 1,0·10⁸ mm⁴', 'k = 0,8·1,2', 'L = 4 m', 'x = L⁵/2'])
  assert.equal(r[0].input, true)                  // et tal med tierpotens er et input
  assert.equal(r[1].input, false)                 // 0,8·1,2 er stadig en formel
  assert.equal(r[3].formula, 'L⁵ / 2')
})

test('flere enheder under brøkstregen står i parentes', () => {
  assert.deepEqual(run(['u = 2 kN/m/m', 'λ = 0,13 W/(m·K)', 'U = 0,2 W/m²K']),
    ['= 2 kN/(m·m)', '= 0,13 W/(m·K)', '= 0,2 W/(m²·K)'])
})

test('tyngdeacceleration: g som værdi og 9,81 m/s² efter en variabel', () => {
  assert.deepEqual(run(['g = 9,81 m/s²', 'm_1 = 1200 kg', 'F = m_1·g', 'ρ = 2400 kg/m³', 'γ = ρ·g → kN/m³']),
    ['= 9,81 m/s²', '= 1200 kg', '= 11,77 kN', '= 2400 kg/m³', '= 23,54 kN/m³'])
  // Før: "s er ikke defineret" -- mathjs læser det som (m_1·(9,81 m))/s².
  const r = evaluate(['m_1 = 1200 kg', 'F = m_1·9,81 m/s²', 'L_1 = 4 m', 'q = L_1·2,5 kN/m²'])
  assert.deepEqual(r.map(chip).map(([, t]) => t), ['= 1200 kg', '= 11,77 kN', '= 4 m', '= 10 kN/m'])
  assert.equal(r[1].formula, 'm_1·9,81 m/s²')
})
