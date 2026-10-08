// Afsnitshjælperen: den rigtige tekst anbefales efter konsekvensklassen
// (DS/EN 1990 DK NA, anneks E1 (4)), og overskriften genkendes også i ældre
// sager uden nøgle.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findAfsnit, kontekst, varianterFor, skrivVariant, fingeraftryk } from '../src/templates/a1Afsnit/index.js'
import { afsnitsBlokke } from '../src/lib/indhold.js'
import { makeA1Template } from '../src/templates/a1.js'
import robusthed from '../src/templates/a1Afsnit/robusthed.js'

const tekst = (bs) => bs.map(b => b.data.text ?? '').join('\n')
const anbefalet = (opts) => varianterFor(robusthed, kontekst(opts))[0]

test('overskriften genkendes på nøgle og på titel', () => {
  assert.equal(findAfsnit({ type: 'heading', data: { text: 'Hvad som helst', afsnit: 'a1.robusthed' } }), robusthed)
  assert.equal(findAfsnit({ type: 'heading', data: { text: '4.5 Robusthed' } }), robusthed)
  assert.equal(findAfsnit({ type: 'heading', data: { text: 'Robusthed' } }), robusthed)
  assert.equal(findAfsnit({ type: 'heading', data: { text: '4.6 Levetid' } }), null)
  assert.equal(findAfsnit({ type: 'text', data: { text: 'Robusthed' } }), null)
})

test('anbefalet tekst følger konsekvensklassen', () => {
  assert.equal(anbefalet({ ccValgt: 1, simpel: true }).key, 'simpel')
  assert.equal(anbefalet({ ccValgt: 2, simpel: true, etager: 2 }).key, 'simpel')
  assert.equal(anbefalet({ ccValgt: 2, simpel: true, etager: 4 }).key, 'cc2')
  assert.equal(anbefalet({ ccValgt: 1, simpel: false }).key, 'cc1')
  assert.equal(anbefalet({ ccValgt: 2, simpel: false }).key, 'cc2')
  assert.equal(anbefalet({ ccValgt: 3, simpel: false }).key, 'cc3')
  assert.ok(varianterFor(robusthed, kontekst({ ccValgt: 2 })).filter(v => v.anbefalet).length >= 1)
})

test('CC2 beskriver bygningen og nævner nøgleelementer, når der er nogen', () => {
  const ktx = kontekst({ ccValgt: 2, etager: 3, materialer: { beton: true, trae: false } })
  const v = robusthed.varianter.find(x => x.key === 'cc2')
  const uden = tekst(v.skriv(ktx, { noegle: 'nej' }))
  assert.match(uden, /betonvægge og betondæk/)
  assert.match(uden, /ikke identificeret nøgleelementer/)
  const med = tekst(v.skriv(ktx, { noegle: 'ja', noegleHvilke: 'søjle i akse B', metode: 'ekstra' }))
  assert.match(med, /søjle i akse B/)
  assert.match(med, /1,2/)
})

test('CC3 med bortfald af element nævner det acceptable kollapsomfang', () => {
  const v = robusthed.varianter.find(x => x.key === 'cc3')
  assert.match(tekst(v.skriv(kontekst({ ccValgt: 3 }), { metode: 'bortfald' })), /240 m² pr\. etage og 360 m²/)
})

test('A1 fra skabelonen: afsnittet kan findes og erstattes', () => {
  const bs = makeA1Template({}, {})
  const h = bs.find(b => findAfsnit(b) === robusthed)
  assert.equal(h.data.afsnit, 'a1.robusthed')
  const r = afsnitsBlokke(bs, h.id)
  assert.equal(bs[r.til].data.text, '4.6 Levetid')
  const nye = skrivVariant(robusthed.varianter.find(v => v.key === 'cc3'), kontekst({}), robusthed.standardSvar(), 1)
  assert.notEqual(fingeraftryk(nye), fingeraftryk(bs.slice(r.fra, r.til)))
  assert.equal(fingeraftryk(nye), fingeraftryk(nye.map(b => ({ ...b, id: 99 }))))
})

// ── Nyt A1: den anbefalede tekst, og hjælperens valg huskes ────────────────
const afsnitTekst = (bs, key) => {
  const i = bs.findIndex(b => b.data?.afsnit === key)
  const r = afsnitsBlokke(bs, bs[i].id)
  return tekst(bs.slice(r.fra, r.til))
}

test('nyt A1 skriver robusthed efter konsekvensklassen, uden den gamle tabel', () => {
  const simpel = makeA1Template({ simpel: true }, {})
  assert.match(afsnitTekst(simpel, 'a1.robusthed'), /CC2, og robustheden vurderes[\s\S]*progressivt kollaps vurderes derfor ikke/)
  assert.ok(!simpel.some(b => b.type === 'table' && /robusthed/i.test(b.data.caption ?? '')))
  const stor = makeA1Template({ etager: 4, spaendvidde: 10, simpel: false, materialer: { beton: true, trae: false } }, {})
  assert.match(afsnitTekst(stor, 'a1.robusthed'), /CC2/)
})

test('A1 skrevet forfra bruger hjælperens valg fra metadata._afsnit', () => {
  const meta = { _afsnit: { 'a1.robusthed': { variant: 'ombygning', svar: {} },
                            'a1.udfoerelse': { variant: 'nybyggeri', svar: { tilsyn: 'kontrolplan' } } } }
  const bs = makeA1Template({}, meta)
  assert.equal(afsnitTekst(bs, 'a1.robusthed'), 'Bygværkets robusthed påvirkes ikke af ombygningen.')
  assert.match(afsnitTekst(bs, 'a1.udfoerelse'), /kontrolplanen \(B2\)/)
})

test('vandret lastføring: hal med rammer og træhus med skiver', () => {
  const hal = makeA1Template({ stabilisering: { skiver: false, rammer: true, kryds: true }, materialer: { staal: true, trae: false } }, {})
  assert.match(afsnitTekst(hal, 'a1.vandret'), /momentstive rammer/)
  const hus = makeA1Template({}, {})
  assert.match(afsnitTekst(hus, 'a1.vandret'), /virker som skive ved pladebeklædning/)
})

test('geoteknik og udførelse følger beskrivelsen', async () => {
  const geo = (await import('../src/templates/a1Afsnit/geoteknik.js')).default
  const ktx = kontekst({ geoteknisk: true })
  assert.equal(anbefaletKey(geo, ktx), 'rapport')
  const t = tekst(geo.varianter.find(x => x.key === 'rapport').skriv(ktx, { rapport: 'GEO 123', sigma: '150', kote: '', grundvand: '' }))
  assert.match(t, /GEO 123/); assert.match(t, /150 kN\/m²/); assert.match(t, /i …/)
  assert.equal(anbefaletKey(geo, kontekst({ fundering: 'eksisterende' })), 'eksisterende')
  const udf = (await import('../src/templates/a1Afsnit/udfoerelse.js')).default
  assert.equal(anbefaletKey(udf, kontekst({ konstruktionstype: 'Ombygning' })), 'ombygning')
})

function anbefaletKey(afsnit, ktx) { return varianterFor(afsnit, ktx)[0].key }
