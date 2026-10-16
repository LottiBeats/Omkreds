import test from 'node:test'
import assert from 'node:assert/strict'
import { omdoebHenvisninger, arkIFormel, arkPrefiks } from '../src/lib/regneark.js'
import {
  bogAf, nytArk, medArk, omdoebArk, arkDerBruger, sletArk, dupliker, flytArk, udsnit, laesOmraade,
  flytRegnearkTilBog, harGamleRegneark, visningerAf,
} from '../src/lib/regnearksbog.js'
import { laesImport, anvendImport } from '../src/lib/importDokumenter.js'

const ark = (id, navn, celler, ekstra = {}) => ({ id, navn, celler, titel: '', overskrift: true, bredder: [], dec: {}, fed: {}, _vist: [], ...ekstra })
const bog2 = () => medArk({ ark: [] }, [
  ark('a', 'Laster', [['q_p', '1,36'], ['c_pe', '0,8']]),
  ark('b', 'Stabilitet V1', [['F', '=Laster!B1*Laster!B2*10'], ['dobbelt', '=B1*2']]),
])

test('arknavne foran henvisninger', () => {
  assert.equal(arkPrefiks('Laster'), 'Laster!')
  assert.equal(arkPrefiks('Stabilitet V1'), "'Stabilitet V1'!")
  assert.equal(arkPrefiks("Ole's"), "'Ole''s'!")
})

test('omdøb henvisninger: kun til det ark, og tekst i anførselstegn røres ikke', () => {
  assert.equal(omdoebHenvisninger('=Laster!B1*2+B1', 'Laster', 'Vind'), '=Vind!B1*2+B1')
  assert.equal(omdoebHenvisninger("='Laster'!$B$1:B3", 'laster', 'Vind og sne'), "='Vind og sne'!$B$1:B3")
  assert.equal(omdoebHenvisninger('=Opbygning!B1+"Laster!B1"', 'Laster', 'Vind'), '=Opbygning!B1+"Laster!B1"')
  assert.equal(omdoebHenvisninger('tekst', 'Laster', 'Vind'), 'tekst')
  assert.deepEqual(arkIFormel("=Laster!B1+'Stabilitet V1'!A1+C3"), ['laster', 'stabilitet v1'])
})

test('bogen regner på tværs af ark og gemmer de viste tekster', () => {
  const b = bog2()
  assert.equal(b.ark[1]._vist[0][1], '10,88')
  assert.equal(b.ark[1]._vist[1][1], '21,76')
})

test('omdøbning af et ark skriver formlerne om og regner det samme', () => {
  const { bog, fejl } = omdoebArk(bog2(), 'a', 'Vind og sne')
  assert.equal(fejl, null)
  assert.equal(bog.ark[1].celler[0][1], "='Vind og sne'!B1*'Vind og sne'!B2*10")
  assert.equal(bog.ark[1]._vist[0][1], '10,88')
  assert.match(omdoebArk(bog2(), 'a', 'stabilitet v1').fejl, /allerede/)
  assert.match(omdoebArk(bog2(), 'a', '').fejl, /navn/)
  assert.match(omdoebArk(bog2(), 'a', 'A!B').fejl, /må ikke/)
})

test('slet, dupliker, flyt og hvem bruger arket', () => {
  const b = bog2()
  assert.deepEqual(arkDerBruger(b, 'a'), ['Stabilitet V1'])
  assert.deepEqual(arkDerBruger(b, 'b'), [])
  const s = sletArk(b, 'a')
  assert.equal(s.ark.length, 1)
  assert.equal(s.ark[0]._vist[0][1], '#REF!')
  const { bog: d, id } = dupliker(b, 'b')
  assert.equal(d.ark.length, 3)
  assert.equal(d.ark[2].id, id)
  assert.equal(d.ark[2].navn, 'Stabilitet V2')
  assert.deepEqual(flytArk(b, 1, 0).ark.map(a => a.id), ['b', 'a'])
  const n = nytArk(b, 'Laster')
  assert.equal(n.navn, 'Laster2')
})

test('område og udsnit', () => {
  assert.deepEqual(laesOmraade('B2:A1'), { r0: 0, k0: 0, r1: 1, k1: 1 })
  assert.equal(laesOmraade(''), null)
  assert.equal(laesOmraade('x'), null)
  const b = medArk({ ark: [] }, [ark('a', 'A', [['Navn', 'Værdi', ''], ['x', '=1/3', ''], ['', '', '']], { fed: { B2: true }, dec: { B2: 2 } })])
  const hele = udsnit(b.ark[0], '')
  assert.deepEqual(hele.raekker, [['Navn', 'Værdi'], ['x', '0,33']])
  assert.equal(hele.overskrift, true)
  assert.equal(hele.fed[1][1], true)
  const del = udsnit(b.ark[0], 'B2')
  assert.deepEqual(del.raekker, [['0,33']])
  assert.equal(del.overskrift, false)
})

test('regneark-blokke flyttes ind i bogen; ens navne i to dokumenter får hvert sit', () => {
  const blok = (id, navn, celler) => ({ id, type: 'regneark', data: { navn, titel: 'T' + id, celler, _vist: [] } })
  const projekt = { documents: {
    A2: { blocks: [], subdocs: [{ name: 'Laster', blocks: [
      { id: 1, type: 'text', data: { text: 'x' } },
      blok(2, 'Opbygning', [['G', '2']]),
      blok(3, 'Ln', [['=Opbygning!A1', '=Opbygning!B1*3']]),
    ] }] },
    A3: { blocks: [blok(4, 'Opbygning', [['G', '5']]), blok(5, 'Ln2', [['', '=Opbygning!B1*3']])], subdocs: [] },
  } }
  assert.equal(harGamleRegneark(projekt), true)
  const { project: p, antal } = flytRegnearkTilBog(projekt)
  assert.equal(antal, 4)
  assert.equal(harGamleRegneark(p), false)
  const b = bogAf(p)
  assert.deepEqual(b.ark.map(a => a.navn), ['Opbygning', 'Ln', 'Opbygning2', 'Ln2'])
  assert.equal(b.ark[1]._vist[0][1], '6', 'A2.1 regner stadig med sin egen opbygning')
  assert.equal(b.ark[3].celler[0][1], '=Opbygning2!B1*3')
  assert.equal(b.ark[3]._vist[0][1], '15', 'A3 regner med sin egen opbygning, nu Opbygning2')
  const v = p.documents.A2.subdocs[0].blocks[1]
  assert.deepEqual(v, { id: 2, type: 'ark_visning', data: { ark: b.ark[0].id, omraade: '', titel: 'T2' } })
  assert.equal(p.documents.A2.subdocs[0].blocks[0].type, 'text')
  assert.equal(visningerAf(p, b.ark[2].id)[0].doc, 'A3')
  // Igen: intet at flytte
  assert.equal(flytRegnearkTilBog(p).antal, 0)
})

test('import af en bog: ark ved navn, erstatter ved samme navn og bevarer id', () => {
  const projekt = { metadata: {}, documents: { A2: { blocks: [], subdocs: [] } },
    bog: medArk({ ark: [] }, [ark('gl', 'Laster', [['1']])]) }
  const fil = JSON.stringify({
    bog: { ark: [{ navn: 'Laster', celler: [['5']] }, { navn: 'Fundament', celler: [['=Laster!A1*2']] }] },
    docs: { A2: { subdocs: [{ name: 'Fundament', blocks: [{ type: 'ark_visning', data: { ark: 'Fundament', omraade: '' } }] }] } },
  })
  const imp = laesImport(fil)
  assert.equal(imp.ok, true, imp.fejl)
  const p = anvendImport(projekt, imp)
  assert.equal(p.bog.ark.length, 2)
  assert.equal(p.bog.ark[0].id, 'gl')
  assert.equal(p.bog.ark[1]._vist[0][0], '10')
  assert.equal(p.documents.A2.subdocs[0].blocks[0].data.ark, p.bog.ark[1].id)
  assert.equal(laesImport(JSON.stringify({ docs: {}, bog: { ark: [{ navn: 'x', celler: [[1]] }] } })).ok, false)
  assert.equal(laesImport(JSON.stringify({ docs: {}, bog: { ark: [{ navn: 'x', celler: [['1']] }, { navn: 'X', celler: [] }] } })).ok, false)
  assert.equal(laesImport(JSON.stringify({ docs: {}, bog: { ark: [{ navn: 'x', celler: [['1']] }] } })).ok, true)
})
