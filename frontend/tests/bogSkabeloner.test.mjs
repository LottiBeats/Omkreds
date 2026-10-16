import test from 'node:test'
import assert from 'node:assert/strict'
import { regnBog, formatVaerdi, omdoebNavnIFormel } from '../src/lib/regneark.js'
import { medArk, indsaetSkabelon, tilpasBlokke, udgange, bogAf } from '../src/lib/regnearksbog.js'
import { BOG_SKABELONER } from '../src/lib/bogSkabeloner.js'
import { anvendKoblinger } from '../src/lib/koblinger.js'
import { isStaleResult } from '../src/lib/calcState.js'
import { makeTraehusRegnearkTemplate, traehusBog } from '../src/templates/a2Regnearksbog.js'

const vis = (v) => formatVaerdi(v)
const fejlI = (bog) => bog.ark.flatMap(a => a._vist.flatMap((r, i) => r.map((c, k) => (/^#/.test(c) ? `${a.navn}!${i + 1}/${k}: ${c}` : null)))).filter(Boolean)

test('tom tekst og "" i formler', () => {
  const r = regnBog([{ navn: 'A', celler: [['', '=HVIS(A1="";"tom";"x")', '="a""b"', '=""&"z"']] }]).A[0].map(vis)
  assert.deepEqual(r, ['', 'tom', 'a"b', 'z'])
})

test('SUMHVIS og ANTAL.HVIS', () => {
  const r = regnBog([{ navn: 'A', celler: [['J1', '2'], ['J2', '3'], ['J1', '4'], ['', '=SUMHVIS(A1:A3;"j1";B1:B3)', '=ANTAL.HVIS(B1:B3;">2")', '=SUMIF(B1:B3;"<>3")']] }]).A[3].map(vis)
  assert.deepEqual(r, ['', '6', '2', '6'])
})

test('omdøb et navn i formler', () => {
  assert.equal(omdoebNavnIFormel('=q_p*2+Ark!q_p+"q_p"+q_pp', 'q_p', 'q_p_2'), '=q_p_2*2+Ark!q_p+"q_p"+q_pp')
})

test('alle bogskabeloner regner uden fejl', () => {
  for (const s of BOG_SKABELONER) {
    const { bog } = indsaetSkabelon({ ark: [] }, s.bog())
    assert.deepEqual(fejlI(bog), [], s.key)
    assert.ok(udgange(bog).every(u => !u.fejl), s.key)
  }
})

test('elementskabelonen regner som Excel-arket (TRa, Tka, J1.D503)', () => {
  const { bog } = indsaetSkabelon({ ark: [] }, BOG_SKABELONER.find(s => s.key === 'elementer').bog())
  const op = bog.ark[0]._vist
  assert.deepEqual(op[1].slice(0, 4), ['TRa', 'Betontrapper, 250 mm — adgang til bolig', '6,00', '6,55'])
  const u = Object.fromEntries(udgange(bog).map(x => [x.navn, x.vaerdi]))
  assert.ok(Math.abs(u.J1_D503_RA_g_inf - 0.5 * 6.25 / 2) < 1e-9)
  assert.ok(Math.abs(u.J1_D503_RA_g_sup - 1.5 * 6.25 / 2) < 1e-9)
  assert.ok(Math.abs(u.J1_D503_RA_s - 0.8 * 6.25 / 2) < 1e-9)
  // Trappen som delvis last på 3,0–4,2 m af 4,2 m: R_B = 6·1,2·3,6/4,2
  const el = bog.ark[1]._vist
  assert.equal(el[3][17], formatVaerdi(6 * 1.2 * 3.6 / 4.2, 2))
})

test('skabelon ind i en bog, der allerede har ark og navne med samme navne', () => {
  const s = traehusBog()
  let { bog } = indsaetSkabelon({ ark: [] }, s)
  const { bog: b2, idFor, navnFor } = indsaetSkabelon(bog, traehusBog())
  assert.equal(b2.ark.length, 2 * s.ark.length)
  assert.equal(b2.ark[s.ark.length].navn, 'Opbygninger (2)')
  assert.equal(b2.ark.at(-2).navn, 'Stabilitet N-S (2)')
  assert.equal(navnFor.get('kip_q_d'), 'kip_q_d_2')
  assert.deepEqual(fejlI(b2), [])
  const u = Object.fromEntries(udgange(b2).map(x => [x.navn, x.vaerdi]))
  assert.ok(Math.abs(u.kip_q_d - u.kip_q_d_2) < 1e-12, 'kopien regner det samme')
  const blokke = tilpasBlokke(makeTraehusRegnearkTemplate(), idFor, navnFor)
  const v = blokke.find(b => b.type === 'ark_visning')
  assert.equal(v.data.ark, idFor.get('Opbygninger'))
  const tb = blokke.find(b => b.type === 'timber_beam')
  assert.deepEqual(tb.data._links, { span_m: 'kip_L_2', g_k_kNm: 'kip_g_sup_2', q_k_kNm: 'kip_s_2' })
  assert.ok(blokke.find(b => b.type === 'custom_calc').data.lines.some(l => l.includes('[kip_q_d_2]')))
})

test('A2-skabelonen: koblede felter og Egen beregning får regnearkets tal', () => {
  const { bog, idFor, navnFor } = indsaetSkabelon({ ark: [] }, traehusBog())
  const blocks = tilpasBlokke(makeTraehusRegnearkTemplate(), idFor, navnFor)
  const p = anvendKoblinger({ documents: { A2: { blocks, subdocs: [] } }, bog })
  const u = Object.fromEntries(udgange(bogAf(p)).map(x => [x.navn, x.vaerdi]))
  const tb = p.documents.A2.blocks.find(b => b.type === 'timber_beam')
  const naer = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`)
  naer(tb.data.span_m, u.kip_L)
  naer(tb.data.g_k_kNm, u.kip_g_sup)
  naer(tb.data.q_k_kNm, u.kip_s)
  const cc = p.documents.A2.blocks.find(b => b.type === 'custom_calc')
  const tekst = JSON.stringify(cc.data._result)
  assert.ok(tekst.includes('Lastnedføring!'), 'kilden står i rapporten')
  assert.ok(!/error|fejl/i.test(tekst), tekst.slice(0, 300))
  assert.equal(isStaleResult(cc), false, 'Egen beregning regnet af koblingerne er ikke forældet')
})
