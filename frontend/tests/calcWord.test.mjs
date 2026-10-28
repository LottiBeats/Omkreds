// Egen beregning som Word-ligninger (Word-tilføjelsesprogrammet). Kør: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { wordDele, wordRaekker, ooxmlPakke, tabelXml } from '../src/lib/calcWord.js'

// Hver start-tag har sin slut-tag (selvlukkende tæller ikke).
function velformet(xml) {
  const stak = []
  for (const m of xml.matchAll(/<(\/?)([\w:]+)[^>]*?(\/?)>/g)) {
    const [, slut, navn, selv] = m
    if (selv) continue
    if (!slut) stak.push(navn)
    else if (stak.pop() !== navn) return false
  }
  return stak.length === 0
}
// Ligningens tekst uden opsætning (brøkstreger og parenteser er ikke tekst), mellemrum som ' '.
const tekster = (xml) => [...xml.matchAll(/<m:t[^>]*>([^<]*)<\/m:t>/g)].map(m => m[1]).join('').replace(/[\u00a0\u202f]/g, ' ')

const LINJER = [
  '# Forudsætninger', 'L = 4,5 m | Spændvidde', 'q_d = 2,85 kN/m', 'Tekst om lasten',
  'M_Ed = q_d·L²/8 → kNm | Moment', 'W = 90 mm·(270 mm)²/6',
  'sigma_m_d = M_Ed/W', 'f_m_d = 17,78 MPa', 'sigma_m_d ≤ f_m_d | Bøjning (6.11)',
]

test('delene kommer i linjernes rækkefølge', () => {
  const d = wordDele('Bjælke B1', LINJER)
  assert.deepEqual(d.map(x => x.type), ['heading', 'heading', 'tabel', 'text', 'tabel'])
  assert.deepEqual(d.slice(0, 2).map(x => [x.level, x.text]), [[2, 'Bjælke B1'], [3, 'Forudsætninger']])
  for (const x of d.filter(x => x.xml)) assert.ok(velformet(x.xml), x.type)
  assert.ok(velformet(ooxmlPakke(d[2].xml)))
})

test('formlen er en ligning med brøk, indeks og potens', () => {
  const r = wordRaekker(LINJER)
  const m = r[4]
  assert.equal(m.kind, 'calc'); assert.equal(m.a, 'Moment')
  assert.match(m.b, /<m:f><m:num>/)                       // q_d·L²/8 som brøk
  assert.match(m.b, /<m:sSub><m:e><m:r><w:rPr>[^]*?>M<\/m:t><\/m:r><\/m:e><m:sub><m:r><m:rPr><m:nor\/>/)  // M med opret "Ed"
  assert.match(m.b, /<m:sSup><m:e><m:r><w:rPr>[^]*?>L<\/m:t>/)   // L² er L opløftet -- ikke enheden liter
  assert.equal(tekster(m.b), 'MEd=qd·L28=2,85 kN/m·4,5 m28=')
  assert.match(m.b, /<m:d><m:e><m:r><m:rPr><m:nor\/>[^]*?2,85/)     // (2,85 kN/m) i parentes
  assert.equal(tekster(m.c), '7,214 kNm')
  assert.match(m.c, /<w:b\/>/)
})

test('indsatte tal har deres egne enheder, ikke mm·mm²', () => {
  const r = wordRaekker(LINJER)
  assert.ok(tekster(r[6].b).includes('1 093 500 mm³'), tekster(r[6].b))
  assert.ok(!tekster(r[6].b).includes('mm·mm'))
})

test('eftervisningen viser η med farve', () => {
  const ok = wordRaekker(LINJER).at(-1)
  assert.equal(ok.kind, 'check'); assert.equal(ok.ok, true); assert.equal(ok.a, 'Bøjning (6.11)')
  assert.match(tekster(ok.c), /^0,37 {2}OK$/)
  assert.match(ok.c, /15803D/)
  const ikke = wordRaekker(['a = 30 kN', 'b = 20 kN', 'a ≤ b'])[2]
  assert.match(tekster(ikke.c), /1,50 {2}IKKE OK/)
  assert.match(ikke.c, /B91C1C/)
})

test('ved ≥ er højre side virkningen: η = højre/venstre', () => {
  const r = wordRaekker(['R = 50 kN', 'F = 20 kN', 'R ≥ F | Bæreevne'])[2]
  assert.match(tekster(r.c), /^0,40/)
  assert.ok(tekster(r.b).startsWith('η=FR='), tekster(r.b))
})

test('en linje, der ikke kan regnes, bliver en note', () => {
  const d = wordDele('', ['a = 3 kN + 2 m'])
  assert.equal(d[0].type, 'note')
  assert.match(d[0].xml, /Enhederne passer ikke sammen/)
})

test('tabellen følger sidebredden og har kun vandrette streger', () => {
  const x = tabelXml(wordRaekker(['L = 4 m']).filter(r => r.kind === 'calc'))
  assert.match(x, /<w:tblW w:w="5000" w:type="pct"\/><w:tblBorders><w:top w:val="nil"\/><w:left w:val="nil"\/><w:bottom /)
  assert.match(x, /<w:insideV w:val="nil"\/><\/w:tblBorders><w:tblLayout/)
})
