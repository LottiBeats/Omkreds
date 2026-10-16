import test from 'node:test'
import assert from 'node:assert/strict'
import { regnBog, formatVaerdi, laesTal, kolNavn, kolNr, flytHenvisninger, laesTsv, skrivTsv, erFejl } from '../src/lib/regneark.js'

const regn = (celler, navn = 'Ark1', andre = []) => regnBog([{ navn, celler }, ...andre])[navn]
const vis = (v) => formatVaerdi(v)

test('kolonnenavne', () => {
  assert.equal(kolNavn(0), 'A'); assert.equal(kolNavn(25), 'Z'); assert.equal(kolNavn(26), 'AA'); assert.equal(kolNavn(27), 'AB')
  assert.equal(kolNr('A'), 0); assert.equal(kolNr('AA'), 26); assert.equal(kolNr('ab'), 27)
})

test('danske tal', () => {
  assert.equal(laesTal('1,5'), 1.5); assert.equal(laesTal('-7,4'), -7.4); assert.equal(laesTal('1 000'), 1000)
  assert.equal(laesTal('1.000,5'), 1000.5); assert.equal(laesTal('1.5'), 1.5); assert.equal(laesTal('abc'), null)
  assert.equal(laesTal(''), null); assert.equal(formatVaerdi(0.1 + 0.2), '0,3'); assert.equal(formatVaerdi(2.5, 2), '2,50')
  assert.equal(formatVaerdi(-0.0001, 2), '0,00')
})

test('formler, områder og funktioner', () => {
  const v = regn([
    ['1,5', '2', '=A1*B1'],
    ['3', '4', '=SUM(A1:B2)'],
    ['=AFRUND(10/3;2)', '=MAKS(A1:B2)', '=MIDDEL(A1:B2)'],
    ['=HVIS(A1>1;"tryk";"træk")', '=A1^2+B1', '=-A2+KVROD(16)'],
  ])
  assert.equal(v[0][2], 3)
  assert.equal(v[1][2], 10.5)
  assert.equal(v[2][0], 3.33)
  assert.equal(v[2][1], 4)
  assert.equal(v[2][2], 2.625)
  assert.equal(v[3][0], 'tryk')
  assert.equal(v[3][1], 4.25)
  assert.equal(v[3][2], 1)
})

test('engelske navne, små bogstaver og decimalkomma i formler', () => {
  const v = regn([['2', '=max(A1;3,5)', '=round(A1*1,234;2)', '=Sum(A1;1)']])
  assert.deepEqual(v[0].slice(1), [3.5, 2.47, 3])
})

test('tomme celler er 0, tekst giver #VÆRDI!, deling med 0 giver #DIV/0!', () => {
  const v = regn([['', 'abc', '=A1+1', '=B1+1', '=1/A1', '=C1/0', '=SUM(A1:B1)']])
  assert.equal(v[0][2], 1)
  assert.equal(vis(v[0][3]), '#VÆRDI!')
  assert.equal(vis(v[0][4]), '#DIV/0!')
  assert.equal(vis(v[0][5]), '#DIV/0!')
  assert.equal(v[0][6], 0, 'SUM springer tekst over som Excel')
})

test('fejl føres videre, ukendte navne og cykler', () => {
  const v = regn([['=1/0', '=A1*2', '=FOO(1)', '=C1+1', '=D1', '=E1']])
  assert.equal(vis(v[0][1]), '#DIV/0!')
  assert.equal(vis(v[0][2]), '#NAVN?')
  assert.equal(vis(v[0][3]), '#NAVN?')
  const c = regn([['=B1', '=A1']])
  assert.ok(erFejl(c[0][0]) && c[0][0].kode === '#CYKLUS!')
})

test('henvisninger til andre ark', () => {
  const bog = regnBog([
    { navn: 'Opbygning', celler: [['Tag', '1,5'], ['Væg', '0,66']] },
    { navn: 'Tag og vægge', celler: [['=Opbygning!B1*4', "=SUM(Opbygning!B1:B2)"]] },
    { navn: 'Last', celler: [["='Tag og vægge'!A1+1", '=Mangler!A1', '=opbygning!B2']] },
  ])
  assert.equal(bog['Tag og vægge'][0][0], 6)
  assert.equal(bog['Tag og vægge'][0][1], 2.16)
  assert.equal(bog.Last[0][0], 7)
  assert.equal(vis(bog.Last[0][1]), '#REF!')
  assert.equal(bog.Last[0][2], 0.66, 'arknavne er uafhængige af store/små bogstaver')
})

test('sammenligninger og tekst', () => {
  const v = regn([['5', '=A1>=5', '=A1<>5', '=A1=5', '="L = "&A1&" m"', '=HVIS(OG(A1>1;A1<10);1;0)']])
  assert.deepEqual(v[0].slice(1), [true, false, true, 'L = 5 m', 1])
})

test('lastnedføring som i Excel: opland × last, summer ned gennem elementerne', () => {
  const v = regn([
    ['Element', 'Opland', 'G_k', 'S_k', '1,0G+1,5S'],
    ['Tag', '2,7', '=B2*1,385', '=B2*0,4', '=C2+1,5*D2'],
    ['Rem', '1', '=C2+B3*0,661*3,1', '=D2', '=C3+1,5*D3'],
  ])
  assert.ok(Math.abs(v[1][2] - 3.7395) < 1e-9)
  assert.ok(Math.abs(v[2][4] - (3.7395 + 2.0491 + 1.5 * 1.08)) < 1e-9)
})

test('flyt henvisninger ved indsæt/slet af rækker og kolonner', () => {
  assert.equal(flytHenvisninger('=A1+B3', 'Ark1', 'Ark1', 'r', 1, 1), '=A1+B4')
  assert.equal(flytHenvisninger('=SUM(A1:A5)', 'Ark1', 'Ark1', 'r', 2, 2), '=SUM(A1:A7)')
  assert.equal(flytHenvisninger('=B2*2', 'Ark1', 'Ark1', 'r', 1, -1), '=#REF!*2')
  assert.equal(flytHenvisninger('=C1+Andet!C1', 'Ark1', 'Ark1', 'k', 1, 1), '=D1+Andet!C1')
  assert.equal(flytHenvisninger('=Ark1!C1', 'Andet', 'Ark1', 'k', 0, -1), '=Ark1!B1')
  assert.equal(flytHenvisninger('tekst', 'Ark1', 'Ark1', 'r', 0, 1), 'tekst')
})

test('tsv til og fra Excel', () => {
  assert.deepEqual(laesTsv('a\tb\r\n1,5\t2\r\n'), [['a', 'b'], ['1,5', '2']])
  assert.equal(skrivTsv([['a', 'b'], ['1', '2']]), 'a\tb\n1\t2')
})

test('kopiér formel: relative henvisninger flytter, $ låser', async () => {
  const { forskydFormel, flytNoegler } = await import('../src/lib/regneark.js')
  assert.equal(forskydFormel('=A1*$B$1+C$2+$D3', 1, 1), '=B2*$B$1+D$2+$D4')
  assert.equal(forskydFormel('=SUM(A1:A3)', 2, 0), '=SUM(A3:A5)')
  assert.equal(forskydFormel('=Opbygning!G5', 1, 0), '=Opbygning!G6')
  assert.equal(forskydFormel('=A1', -1, 0), '=#REF!')
  assert.equal(forskydFormel('="A1"&A1', 1, 0), '="A1"&A2')
  assert.deepEqual(flytNoegler({ A1: 1, B3: 2, C5: 3 }, 'r', 2, 1), { A1: 1, B4: 2, C6: 3 })
  assert.deepEqual(flytNoegler({ A1: 1, B3: 2 }, 'r', 2, -1), { A1: 1 })
})

test('skabeloner: vægskiven giver samme tal som Excel-arket', async () => {
  const { SKABELONER } = await import('../src/lib/regnearkSkabeloner.js')
  const vs = SKABELONER.find(s => s.key === 'vaegskive').data()
  const v = regnBog([{ navn: 'Vægskive', celler: vs.celler }]).Vægskive
  const naer = (a, b) => assert.ok(Math.abs(a - b) < 1e-3, `${a} ≠ ${b}`)
  naer(v[7][2], -26.8527); naer(v[8][2], -20.8676); naer(v[9][2], -11.9243); naer(v[10][2], -17.8865)
  naer(v[7][3], -48.2291); naer(v[8][3], -39.2514); naer(v[9][3], -25.8365); naer(v[10][3], -34.7798)
  naer(v[7][4], -59.1903); naer(v[10][4], -42.6843)
})

test('skabeloner: lastnedføringen henter fra opbygningen og regner om, når den ændres', async () => {
  const { SKABELONER } = await import('../src/lib/regnearkSkabeloner.js')
  const op = SKABELONER.find(s => s.key === 'opbygning').data()
  const ln = SKABELONER.find(s => s.key === 'lastnedfoering').data()
  const regnBeggge = (opCeller) => regnBog([{ navn: 'Opbygning', celler: opCeller }, { navn: 'Lastnedføring', celler: ln.celler }])
  const b1 = regnBeggge(op.celler)
  for (const ark of Object.values(b1)) for (const r of ark) for (const c of r) assert.ok(!erFejl(c), `fejl i skabelon: ${c}`)
  const gsup = b1.Opbygning[11][1]
  assert.ok(Math.abs(gsup - (0.5 + 0.03 + 0.126 + 0.08 + 0.144 + 0.075) / Math.cos(Math.PI / 4)) < 1e-9)
  assert.ok(Math.abs(b1.Opbygning[10][1] - (0.03 + 0.126 + 0.08 + 0.144) / Math.cos(Math.PI / 4)) < 1e-9, 'G inf uden de frie lag')
  const sumTag1 = b1.Lastnedføring[4][8]
  assert.ok(Math.abs(sumTag1 - 2.7 * gsup) < 1e-9)
  // Ret tagstenen: alt nedenunder følger med.
  const op2 = op.celler.map(r => [...r]); op2[1][4] = '0,6'
  const b2 = regnBeggge(op2)
  assert.ok(b2.Lastnedføring[11][13] > b1.Lastnedføring[11][13], 'fundamentet får mere last, når tagstenen bliver tungere')
})
