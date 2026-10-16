import test from 'node:test'
import assert from 'node:assert/strict'
import { regnBog, formatVaerdi, gyldigtCellenavn } from '../src/lib/regneark.js'
import { medArk, navngiv, fjernNavn, flytNavne, udgange, navneFor } from '../src/lib/regnearksbog.js'
import {
  aendredeTal, opdaterLinks, anvendPaaBlok, anvendKoblinger, udfoldUdgange, evaluerMedUdgange, saet, hent, koblingerTil,
} from '../src/lib/koblinger.js'
import { laesImport, anvendImport } from '../src/lib/importDokumenter.js'

const vis = (v) => formatVaerdi(v)

test('opslag på ID som i Excel: LOPSLAG, XOPSLAG, INDEKS, SAMMENLIGN, HVIS.FEJL', () => {
  const op = [['ID', 'g_inf', 'g_sup'], ['TRa', '6', '6,55'], ['Tka', '0,5', '1,5']]
  const r = regnBog([
    { navn: 'Opbygninger', celler: op },
    { navn: 'E', celler: [[
      '=LOPSLAG("tka";Opbygninger!A2:C3;3;FALSK)', '=XOPSLAG("TRa";Opbygninger!A2:A3;Opbygninger!C2:C3)',
      '=INDEKS(Opbygninger!A1:C3;2;3)', '=SAMMENLIGN("Tka";Opbygninger!A1:A3;0)', '=LOPSLAG("X";Opbygninger!A2:C3;2;FALSK)',
      '=HVIS.FEJL(LOPSLAG("X";Opbygninger!A2:C3;2;FALSK);0)', '=VLOOKUP("TRa";Opbygninger!A2:C3;2;FALSE)',
      '=XOPSLAG("X";Opbygninger!A2:A3;Opbygninger!C2:C3;"ingen")', '=LOPSLAG(5;Opbygninger!B2:C3;2)',
    ]] },
  ]).E[0].map(vis)
  assert.deepEqual(r, ['1,5', '6,55', '6,55', '3', '#I/T', '0', '6', 'ingen', '1,5'])
})

test('navngivne celler i formler', () => {
  const r = regnBog([{ navn: 'Laster', celler: [['1,36']] }, { navn: 'B', celler: [['=q_p*2', '=Q_P+ukendt']] }],
    { q_p: { ark: 'Laster', r: 0, k: 0 } })
  assert.equal(r.B[0][0], 2.72)
  assert.equal(vis(r.B[0][1]), '#NAVN?')
  assert.equal(gyldigtCellenavn('w_kip_V4'), true)
  for (const n of ['B12', 'AB3', 'SUM', 'pi', '2x', 'a-b', '', 'sand']) assert.equal(gyldigtCellenavn(n), false, n)
})

const bog = () => medArk({ ark: [] }, [
  { id: 'L', navn: 'Lastnedføring', celler: [['w', '=2*3,5', 'kN/m'], ['tekst', 'abc', '']], dec: { B1: 2 } },
  { id: 'S', navn: 'Stab', celler: [['=w_kip*10']] },
])

test('navngiv, udgange, navne følger indsatte rækker', () => {
  let { bog: b, fejl } = navngiv(bog(), 'w_kip', 'L', 'B1', 'kN/m')
  assert.equal(fejl, null)
  assert.equal(b.ark[1]._vist[0][0], '70', 'navnet bruges i en formel i et andet ark')
  assert.deepEqual(navneFor(b, 'L', 'B1'), ['w_kip'])
  ;({ bog: b } = navngiv(b, 'tekst', 'L', 'B2'))
  const u = udgange(b)
  assert.equal(u.find(x => x.navn === 'w_kip').vaerdi, 7)
  assert.equal(u.find(x => x.navn === 'w_kip').tekst, '7,00')
  assert.equal(u.find(x => x.navn === 'tekst').fejl, 'cellen er ikke et tal')
  assert.match(navngiv(b, 'w_kip', 'L', 'B2').fejl, /allerede/)
  assert.match(navngiv(b, 'B7', 'L', 'B2').fejl, /navn/i)
  const flyttet = flytNavne(b.navne, 'L', 'r', 0, 2)
  assert.equal(flyttet.w_kip.celle, 'B3')
  assert.equal(flytNavne(b.navne, 'L', 'r', 0, -1).w_kip.celle, null)
  assert.equal(flytNavne(b.navne, 'S', 'r', 0, 2).w_kip.celle, 'B1', 'andre ark rører ikke navnet')
  assert.equal(udgange(fjernNavn(b, 'tekst')).length, 1)
})

test('stier og ændrede tal', () => {
  const d = { L: 6, loads: [{ type: 'udl', w_kNm: 10 }, { type: 'p', P: 5 }], _result: [1] }
  assert.deepEqual(aendredeTal(d, saet(d, ['loads', 0, 'w_kNm'], 7)), [['loads', 0, 'w_kNm']])
  assert.deepEqual(aendredeTal(d, { ...d, _result: [2] }), [])
  assert.equal(hent(saet(d, ['loads', 1, 'P'], 3), ['loads', 1, 'P']), 3)
  assert.equal(saet(d, ['loads', 1, 'P'], 3).loads[0], d.loads[0], 'resten deles')
})

test('kobling gemmes, følger bogen og forsvinder, når feltet rettes i hånden', () => {
  let { bog: b } = navngiv(bog(), 'w_kip', 'L', 'B1', 'kN/m')
  const udg = new Map(udgange(b).map(u => [u.navn, u]))
  const gl = { L: 6, loads: [{ type: 'udl', w_kNm: 10 }] }
  // "=" i feltet: blokken sætter 7, og koblingen gemmes på stien
  const ny = opdaterLinks(gl, saet(gl, ['loads', 0, 'w_kNm'], 7), { navn: 'w_kip', vaerdi: 7 }, udg)
  assert.deepEqual(ny._links, { 'loads.0.w_kNm': 'w_kip' })
  // En anden ændring (L) rører ikke koblingen
  assert.deepEqual(opdaterLinks(ny, { ...ny, L: 7 }, null, udg)._links, { 'loads.0.w_kNm': 'w_kip' })
  // Rettet i hånden → koblingen er væk
  assert.equal(opdaterLinks(ny, saet(ny, ['loads', 0, 'w_kNm'], 12), null, udg)._links, undefined)
  // Lasten slettet → koblingen er væk
  assert.equal(opdaterLinks(ny, { ...ny, loads: [] }, null, udg)._links, undefined)
  // Bogen ændres: 2*3,5 → 2*4
  b = medArk(b, b.ark.map(a => (a.id === 'L' ? { ...a, celler: [['w', '=2*4', 'kN/m']] } : a)))
  const blok = anvendPaaBlok({ id: 1, type: 'beam_fem', data: ny }, new Map(udgange(b).map(u => [u.navn, u])))
  assert.equal(blok.data.loads[0].w_kNm, 8)
  const igen = anvendPaaBlok(blok, new Map(udgange(b).map(u => [u.navn, u])))
  assert.equal(igen, blok, 'intet ændret → samme objekt')
})

test('Egen beregning: [navn] bliver værdi med enhed og kilde', () => {
  const { bog: b } = navngiv(bog(), 'w_kip', 'L', 'B1', 'kN/m')
  const udg = new Map(udgange(b).map(u => [u.navn, u]))
  const { lines, fejl } = udfoldUdgange(['q_d = [w_kip]', 'M = 1,5·[w_kip]·(6 m)²/8 → kNm | moment', 'x = [findes_ikke]'], udg)
  assert.equal(lines[0], 'q_d = 7 kN/m | fra regnearket: Lastnedføring!B1')
  assert.equal(lines[1], 'M = 1,5·(7 kN/m)·(6 m)²/8 → kNm | moment (fra regnearket: Lastnedføring!B1)')
  assert.match(fejl.get(2), /findes_ikke/)
  const rows = evaluerMedUdgange(['q_d = [w_kip]', 'M = q_d·(6 m)²/8 → kNm', 'x = [findes_ikke]'], udg)
  assert.equal(rows[0].input, true)
  assert.ok(Math.abs(rows[1].value.toNumber('kN m') - 31.5) < 1e-9)
  assert.match(rows[2].error, /findes_ikke/)
})

test('hele projektet følger bogen: koblede felter og Egen beregnings rapport', () => {
  let { bog: b } = navngiv(bog(), 'w_kip', 'L', 'B1', 'kN/m')
  const cc = { id: 2, type: 'custom_calc', data: { title: 'Kip', lines: ['q = [w_kip]'], _result: null } }
  const bj = { id: 3, type: 'beam_fem', data: { loads: [{ w_kNm: 1 }], _links: { 'loads.0.w_kNm': 'w_kip' } } }
  const p = anvendKoblinger({ documents: { A2: { blocks: [], subdocs: [{ name: 'x', blocks: [cc, bj] }] } }, bog: b })
  const [c2, b2] = p.documents.A2.subdocs[0].blocks
  assert.equal(b2.data.loads[0].w_kNm, 7)
  assert.ok(JSON.stringify(c2.data._result).includes('Lastnedføring!B1'))
  assert.equal(anvendKoblinger(p), p, 'intet at ændre → samme projekt')
  assert.deepEqual(koblingerTil(p, 'w_kip').map(x => x.blok.id), [2, 3])
})

test('import af navne', () => {
  const fil = JSON.stringify({
    docs: {},
    bog: { ark: [{ navn: 'Laster', celler: [['q', '1,36']] }], navne: { q_p: { ark: 'Laster', celle: '$B$1', enhed: 'kN/m²' } } },
  })
  const imp = laesImport(fil)
  assert.equal(imp.ok, true, imp.fejl)
  const p = anvendImport({ metadata: {}, documents: {} }, imp)
  assert.deepEqual(p.bog.navne.q_p, { ark: p.bog.ark[0].id, celle: 'B1', enhed: 'kN/m²' })
  assert.equal(laesImport(JSON.stringify({ docs: {}, bog: { ark: [{ navn: 'a', celler: [] }], navne: { x: { ark: 'a' } } } })).ok, false)
})
