// A1 fra beskrivelsen: det, programmet ved, skal stå der. Kun det, der er
// unikt for sagen (adresse, matrikel, bygherre), må mangle -- og kun når det
// ikke står i projektoplysningerne.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeA1Template, DEFAULT_OPTIONS, mu1 } from '../src/templates/a1.js'
import { optionsFor } from '../src/templates/projectTypes.js'
import { blockPlaceholders, isPlaceholderLabel } from '../src/lib/placeholders.js'

const META = { project_name: 'Hus', address: 'Vej 1, 8000 Aarhus', client: 'Bygherre',
               matrikel: '12a Aarhus Bygrunde', firm_name: 'Omkreds' }
const huller = (blokke) => blokke.flatMap(b => blockPlaceholders(b).map(h => h.label))
const tekst = (blokke) => blokke.map(b => b.data?.text ?? (b.data?.rows ?? []).flat().join(' ')).join('\n')

test('tagprojektet: intet at udfylde, når projektoplysningerne er der', () => {
  assert.deepEqual(huller(makeA1Template(optionsFor('tag_enfamiliehus'), META)), [])
})

test('uden projektoplysninger mangler kun det, der hører til dem', () => {
  const h = new Set(huller(makeA1Template(optionsFor('tag_enfamiliehus'), {})))
  assert.deepEqual([...h].sort(), ['[Firma]', '[adresse]', '[bygherre]', '[matrikelnummer]'])
})

test('μ₁ efter DS/EN 1991-1-3 Tabel 5.2', () => {
  assert.equal(mu1(0), 0.8)
  assert.equal(mu1(30), 0.8)
  assert.ok(Math.abs(mu1(45) - 0.4) < 1e-12)
  assert.equal(mu1(60), 0)
  const t = tekst(makeA1Template({ ...optionsFor('tag_enfamiliehus'), taghaeldning: 45 }, META))
  assert.match(t, /μ₁ = 0,40/)
  assert.match(t, /0,20 kN\/m² \(0,5·μ₁\)/)   // skæv fordeling på saddeltaget
})

test('svarene skriver teksten', () => {
  const t = tekst(makeA1Template({ ...DEFAULT_OPTIONS, fundering: 'punkt',
    stabilisering: { skiver: false, rammer: true, kryds: true, kerne: false },
    terraenkategori: 'III', geoteknisk: false }, META))
  assert.match(t, /funderet på punktfundamenter/)
  assert.match(t, /momentstive rammer og vindkryds/)
  assert.match(t, /Terrænkategori: III/)
  assert.match(t, /matr\. 12a Aarhus Bygrunde/)
})

test('nyttelasttabellen følger bygningen', () => {
  const rows = (o) => makeA1Template(o, META).find(b => b.data?.caption?.startsWith('Tabel 6.3')).data.rows.slice(1).map(r => r[1])
  assert.deepEqual(rows(optionsFor('tag_enfamiliehus')), ['Loftsrum (ikke til beboelse)', 'Tag — ikke tilgængeligt'])
  assert.deepEqual(rows({ ...DEFAULT_OPTIONS, bygningskategori: 'etagebyggeri', etager: 4 }),
    ['Boliger', 'Altaner', 'Trapper, gange og fællesarealer', 'Tag — ikke tilgængeligt'])
})

test('enheder i en tabeloverskrift er ikke huller', () => {
  for (const u of ['Hz', '% g', 'm/s²']) assert.equal(isPlaceholderLabel(u), false, u)
  assert.equal(isPlaceholderLabel('matrikelnummer'), true)
})

test('B1 fra samme svar: intet at udfylde, og samme ord som A1', async () => {
  const { makeB1Template } = await import('../src/templates/b1.js')
  const meta = { ...META, engineer: 'NJ', checker: 'XY' }
  const b1 = makeB1Template(optionsFor('tag_enfamiliehus'), meta)
  assert.deepEqual(huller(b1), [])
  const t = tekst(b1)
  assert.match(t, /Vandret stabilisering: vægge, der virker som skiver/)
  assert.match(t, /Fundamenttype: stribefundamenter/)
})
