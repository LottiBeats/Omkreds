import test from 'node:test'
import assert from 'node:assert/strict'
import { tal, dk, lagLast, egenvaegt, egenvaegtRapport, mu1, sne, sneRapport, SK_DK } from '../src/lib/rapportModuler.js'
import { nyBlok, pdfBlokke } from '../src/lib/rapport.js'

const naer = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`)

test('tal læser dansk komma og tomme felter', () => {
  assert.equal(tal('2,5'), 2.5)
  assert.equal(tal(' 1 000 '), 1000)
  assert.ok(Number.isNaN(tal('')))
  assert.equal(dk(0.282, 2), '0,28')
})

test('egenvægt: t × γ pr. lag og summen', () => {
  naer(lagLast({ t_mm: '200', rho: '0,3' }), 0.06)
  const r = egenvaegt({ lag: [
    { navn: 'Gips', t_mm: '13', rho: '9' },
    { navn: 'Beton', t_mm: '100', rho: '25' },
    { navn: 'Mangler', t_mm: '', rho: '5' },
  ] })
  naer(r.sum, 0.117 + 2.5)
  assert.equal(r.mangler, 1)
  const rap = egenvaegtRapport({ title: 'Tag', lag: r.lag })
  assert.equal(rap[0].content, 'Tag')
  const tabel = rap.find(b => b.type === 'table')
  assert.deepEqual(tabel.rows.at(-1), ['Sum', '', '', '2,62'])
  assert.equal(rap.find(b => b.type === 'calc_row').result, '2,62 kN/m²')
  assert.ok(rap.some(b => b.type === 'note'))
})

test('sne: μ₁ efter tabel 5.2 og s = μ₁·Ce·Ct·sk med sk = 1,0', () => {
  assert.equal(SK_DK, 1.0)
  assert.equal(mu1(0), 0.8)
  assert.equal(mu1(30), 0.8)
  naer(mu1(45), 0.4)
  assert.equal(mu1(60), 0)
  assert.equal(mu1(75), 0)
  assert.ok(Number.isNaN(mu1(NaN)))
  naer(sne({ alfa: '15', ce: '1,0', ct: '1,0' }).s, 0.8)
  naer(sne({ alfa: '40', ce: '0,8', ct: '1' }).s, 0.8 * 20 / 30 * 0.8)
  const rap = sneRapport({ title: 'Sne på tag', alfa: '45', ce: '1,0', ct: '1,0' })
  const s = rap.find(b => b.name === 's')
  assert.equal(s.result, '0,40 kN/m²')
  assert.equal(rap.find(b => b.name === 'μ_1').formula, '0,8 · (60° − 45,0°) / 30°')
  assert.ok(sneRapport({ alfa: '', ce: '1', ct: '1' }).some(b => b.type === 'note'))
})

test('nye moduler har rapportrækker fra start og tæller i PDF', () => {
  const g = nyBlok('rapport_egenvaegt'), s = nyBlok('rapport_sne')
  assert.ok(g.data._result.length > 0 && s.data._result.length > 0)
  const fem = { id: 'f', type: 'general_frame_fem', data: { elements: [] } }
  assert.equal(pdfBlokke([fem, s]).tom, false)
})
