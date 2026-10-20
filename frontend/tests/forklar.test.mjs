import test from 'node:test'
import assert from 'node:assert/strict'
import { regnBog, erstatHenvisninger } from '../src/lib/regneark.js'
import { medArk, navneOpslag, udsnit } from '../src/lib/regnearksbog.js'
import { forklar, brugtAf, etiket } from '../src/lib/forklar.js'
import { fmtStil } from '../src/lib/regnearkFormat.js'

const bog = () => medArk({ ark: [] }, [
  { id: 'L', navn: 'Laster', overskrift: true, celler: [['Størrelse', 'Værdi', 'Enhed'], ['Spænd L', '4,4', 'm'], ['Egenvægt', '0,2', 'kN/m']], fed: { A1: true, B1: true, C1: true } },
  { id: 'K', navn: 'Kip', overskrift: false, celler: [
    ['Kipbjælke V1', ''], ['Last', 'w [kN/m]', 'R [kN]'], ['G sup', '2,97', '=B3*Laster!B2/2'], ['Σ', '', '=SUM(C3:C3)']],
    fed: { A1: true, A2: true, B2: true, C2: true } },
])
const regn = (b) => regnBog(b.ark.map(a => ({ navn: a.navn, celler: a.celler })), navneOpslag(b))

test('henvisninger byttet ud (fx med værdier)', () => {
  assert.equal(erstatHenvisninger('=B3*Laster!B2/2+SUM(A1:A2)+"B3"', ({ fra, til }) => (til ? null : `[${fra.r},${fra.k}]`)),
    '=[2,1]*[1,1]/2+SUM(A1:A2)+"B3"')
})

test('Forklar celle: etiket af række, kolonne og sektion; regnestykket med tal', () => {
  const b = bog()
  const v = regn(b)
  const f = forklar(b, b.ark[1], 2, 2, v)
  assert.equal(f.art, 'formel')
  assert.equal(f.etiket, 'R [kN] · G sup · Kipbjælke V1')
  assert.equal(f.vaerdi, '6,534')
  assert.equal(f.medTal, '= 2,97·4,4/2')
  assert.deepEqual(f.henvisninger.map(h => [h.tekst, h.vaerdi, h.etiket]), [
    ['B3', '2,97', 'w [kN/m] · G sup · Kipbjælke V1'],
    ['Laster!B2', '4,4', 'Spænd L'],
  ])
  assert.equal(forklar(b, b.ark[0], 1, 1, v).art, 'inddata')
  assert.equal(etiket(b.ark[0], v.Laster, 2, 1).tekst, 'Egenvægt', '"Værdi" som kolonne siger intet og udelades')
  assert.deepEqual(brugtAf(b, 'Laster', 1, 1, v).map(x => x.tekst), ['Kip!C3'])
  assert.deepEqual(brugtAf(b, 'Kip', 2, 2, v).map(x => x.tekst), ['C4'])
})

test('formatering: style og udsnit', () => {
  assert.equal(fmtStil(undefined), undefined)
  assert.deepEqual(fmtStil({ fyld: '#fff2cc', kursiv: true, just: 'c', ramme: { b: 2, t: 1 } }), {
    background: '#fff2cc', fontStyle: 'italic', textAlign: 'center', borderTop: '2px solid #4b5563', borderBottom: '3px solid #1f2937',
  })
  const b = medArk({ ark: [] }, [{ id: 'a', navn: 'A', celler: [['x', '1'], ['y', '2']], fmt: { B2: { fyld: '#e2efda' } } }])
  assert.deepEqual(udsnit(b.ark[0], 'B1:B2').fmt, [[null], [{ fyld: '#e2efda' }]])
})

test('en fed tekstrække over tal er en overskrift, også midt i arket', async () => {
  const { raekkeTyper, celleArt } = await import('../src/lib/regnearksbog.js')
  const r = [['Rem', ''], ['Bredde B', '4'], ['Last', 'q'], ['G sup', '1,38']]
  const fed = [[true], [], [true, true], []]
  assert.deepEqual(raekkeTyper(r, fed, r.map(x => x.map(celleArt)), false), ['sektion', '', 'hoved', ''])
})
