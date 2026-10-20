// Elementerne i standardbogens Lodret lastnedføring: nyt, kopiér, fjern og ny last.
import test from 'node:test'
import assert from 'node:assert/strict'
import { indsaetSkabelon, medArk, udgange } from '../src/lib/regnearksbog.js'
import { BOG_SKABELONER } from '../src/lib/bogSkabeloner.js'
import {
  erLastnedfoering, elementer, oversigt, nytElement, kopierElement, fjernElement, nyLast, brugere, ledigtId, tjekId,
} from '../src/lib/lastnedfoering.js'

const LN = 'Lodret lastnedføring'
const ny = () => indsaetSkabelon({ ark: [] }, BOG_SKABELONER[0].bog()).bog
const ln = (bog) => bog.ark.find(a => a.navn === LN)
const fejlI = (bog) => bog.ark.flatMap(a => a._vist.flatMap((r, i) => r.map((c, k) => (/^#/.test(c) ? `${a.navn}!${i + 1}/${k}: ${c}` : null)))).filter(Boolean)
const vaerdi = (bog, noegle, kol = 23) => {   // kolonne X = Dim.
  const a = ln(bog)
  const r = a._vist.findIndex(x => x[20] === noegle)
  return r < 0 ? null : a._vist[r][kol]
}
const ovVaerdi = (bog, noegle, kol = 23) => {
  const a = ln(bog), o = oversigt(a)
  const x = o.raekker.find(y => y.noegle === noegle)
  return x ? a._vist[x.r][kol] : null
}
/** Sæt celler (0-baseret) i arket og regn bogen. */
function saet(bog, aendringer) {
  return medArk(bog, bog.ark.map(a => {
    if (a.navn !== LN) return a
    const celler = a.celler.map(x => [...x])
    for (const [r, k, v] of aendringer) { while (celler[r].length <= k) celler[r].push(''); celler[r][k] = v }
    return { ...a, celler }
  }))
}

test('arket kendes, og elementerne læses ud af blokkene', () => {
  const bog = ny()
  assert.ok(erLastnedfoering(ln(bog)))
  const els = elementer(ln(bog))
  assert.deepEqual(els.map(e => e.id), ['T1', 'D1', 'B1', 'B2', 'S1', 'V1', 'V2', 'F1', 'F2', 'F3'])
  const v1 = els.find(e => e.id === 'V1')
  assert.deepEqual(v1.resultater.map(x => x.del), ['N', 'M', 'xs', 'xe', 'q'])
  assert.equal(v1.laster.length, 8)   // 7 laster + den tomme række
  assert.equal(oversigt(ln(bog)).raekker.filter(x => x.noegle).length, 14)
})

test('nyt element: ID, blok, laster og oversigt — og de samme tal som et håndlavet', () => {
  let bog = ny()
  const id = ann => ledigtId(bog, ln(bog).id, ann)
  assert.equal(id('Væg'), 'V3')
  assert.equal(id('Bjælke'), 'B3')
  assert.match(tjekId(bog, ln(bog).id, 'V1'), /findes allerede/)
  assert.match(tjekId(bog, ln(bog).id, 'TAG1'), /opbygning/)
  // Nordfacaden V3 efter V2: tagets R_A over hele længden og væggens egenvægt
  const r = nytElement(bog, ln(bog).id, { art: 'Væg', id: 'V3', xa: '0', xb: '12,0', beskrivelse: 'Ydervæg nord', efter: 'V2' })
  assert.ok(!r.fejl, r.fejl)
  bog = r.bog
  assert.deepEqual(fejlI(bog), [])
  const v3 = elementer(ln(bog)).find(e => e.id === 'V3')
  assert.equal(v3.r, r.r)
  assert.equal(ln(bog).celler[v3.r - 1].every(c => !c), true, 'tom skillerække før blokken')
  // To laster: den første i den tomme række, den næste med "+ Last"
  bog = saet(bog, [[v3.ledig, 0, 'T1'], [v3.ledig, 1, 'A'], [v3.ledig, 2, '0'], [v3.ledig, 3, '12,0']])
  const l = nyLast(bog, ln(bog).id, v3.r)
  assert.ok(!l.fejl)
  assert.equal(ln(l.bog).celler[l.r - 1][0], 'T1', 'den udfyldte række står over den nye')
  assert.equal(elementer(ln(l.bog)).find(e => e.id === 'V3').ledig, l.r, 'den nye række er den nederste')
  bog = saet(l.bog, [[l.r, 0, 'YV1'], [l.r, 2, '0'], [l.r, 3, '12,0'], [l.r, 4, '2,6']])
  assert.deepEqual(fejlI(bog), [])
  // V3 får tagets R_A og væggens egenvægt; q = N/L, da lasten ligger midt på væggen
  const t1a = Number(vaerdi(bog, 'T1/A', 8).replace(',', '.'))
  const yv1 = ln(bog)._vist[l.r]
  const q = Number(vaerdi(bog, 'V3/q', 8).replace(',', '.'))
  assert.ok(Math.abs(q - (t1a + Number(yv1[8].replace(',', '.')))) < 0.02, `${q}`)
  // Oversigten har fået V3/N og V3/q med de samme tal som blokken
  assert.equal(ovVaerdi(bog, 'V3/q'), vaerdi(bog, 'V3/q'))
  assert.equal(ovVaerdi(bog, 'V3/N'), vaerdi(bog, 'V3/N'))
  // De gamle tal er de samme
  assert.equal(ovVaerdi(bog, 'F1/q'), ovVaerdi(ny(), 'F1/q'))
  assert.deepEqual(udgange(bog).map(u => u.tekst), udgange(ny()).map(u => u.tekst))
})

test('nyt sidste element havner inden for oversigtens områder', () => {
  let bog = ny()
  const r = nytElement(bog, ln(bog).id, { art: 'Punktfundament', id: 'F4', xa: '0' })
  bog = r.bog
  const els = elementer(ln(bog))
  assert.equal(els.at(-1).id, 'F4')
  bog = saet(bog, [[els.at(-1).ledig, 0, 'PF1']])
  assert.equal(ovVaerdi(bog, 'F4/N', 8), vaerdi(bog, 'F4/N', 8))
  assert.equal(vaerdi(bog, 'F4/N', 8), '7,78')
  assert.match(nytElement(bog, ln(bog).id, { art: 'Fundament', id: 'F5', ovenover: 'V9' }).fejl, /Ovenover/)
})

test('kopiér et element: samme laster, nyt ID, egne nøgler', () => {
  let bog = ny()
  const r = kopierElement(bog, ln(bog).id, 'V1', 'V3')
  assert.ok(!r.fejl, r.fejl)
  bog = r.bog
  assert.deepEqual(fejlI(bog), [])
  assert.equal(vaerdi(bog, 'V3/q'), vaerdi(bog, 'V1/q'))
  assert.equal(ovVaerdi(bog, 'V3/q'), vaerdi(bog, 'V1/q'))
  assert.equal(elementer(ln(bog)).find(e => e.id === 'V3').laster.length, 8)
  // Kopien bruges af intet; V1 bruges stadig af F1
  assert.deepEqual(brugere(bog, ln(bog).id, 'V3'), ['Oversigten: V3/N, V3/q (fjernes med)'])
})

test('fjern et element: hvem bruger det, og så er det væk', () => {
  let bog = ny()
  const b = brugere(bog, ln(bog).id, 'B2')
  assert.ok(b.some(t => t.startsWith('V1 har 2 laster fra B2')), b.join(' | '))
  assert.ok(b.some(t => t.startsWith('Oversigten: B2/A, B2/B')))
  assert.ok(brugere(bog, ln(bog).id, 'V1').some(t => t.includes('F1 har V1 som "ovenover"')))
  assert.ok(brugere(bog, ln(bog).id, 'V1').some(t => t.startsWith('Vandret lastnedføring:')))
  // Et element, ingen bruger, går rent væk
  const f2 = fjernElement(bog, ln(bog).id, 'F2')
  assert.ok(!f2.fejl)
  assert.deepEqual(fejlI(f2.bog), [])
  assert.ok(!elementer(ln(f2.bog)).some(e => e.id === 'F2'))
  assert.ok(!oversigt(ln(f2.bog)).raekker.some(x => x.noegle.startsWith('F2/')))
  assert.equal(ovVaerdi(f2.bog, 'F1/q'), ovVaerdi(bog, 'F1/q'))
  // Fjernes B2, peger V1's laster på intet — det ses som fejl, ikke som et stille nul
  bog = fjernElement(bog, ln(bog).id, 'B2').bog
  assert.ok(fejlI(bog).length > 0)
  assert.ok(ln(bog)._vist.some(r => r[20] === '? ukendt kilde'))
  // Det sidste element kan fjernes, og et nyt kan sættes ind bagefter
  const b0 = ny()
  bog = fjernElement(b0, ln(b0).id, 'F3').bog
  assert.deepEqual(fejlI(bog), [])
  const r = nytElement(bog, ln(bog).id, { art: 'Søjle', id: 'S2', xa: '3' })
  assert.ok(!r.fejl)
  assert.deepEqual(fejlI(r.bog), [])
})
