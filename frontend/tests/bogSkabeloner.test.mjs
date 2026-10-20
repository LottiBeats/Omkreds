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

// ── Standardbogen ────────────────────────────────────────────────────────────
import { makeStandardLastnedfoeringTemplate, standardBog } from '../src/templates/a2Standard.js'
import { STANDARD_OMRAADER } from '../src/lib/bogSkabeloner.js'
import { gyldigtOmraade } from '../src/lib/regnearksbog.js'

const naer = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, `${a} ≠ ${b}`)
const uds = (bog) => Object.fromEntries(udgange(bog).map(x => [x.navn, x.vaerdi]))
/** Sæt en celle i arket med det navn og regn bogen igennem. */
function saet(bog, arkNavn, adresse, vaerdi) {
  const k = adresse.charCodeAt(0) - 65, r = Number(adresse.slice(1)) - 1
  return medArk(bog, bog.ark.map(a => {
    if (a.navn !== arkNavn) return a
    const celler = a.celler.map(x => [...x])
    while (celler[r].length <= k) celler[r].push('')
    celler[r][k] = vaerdi
    return { ...a, celler }
  }))
}
const find = (bog, arkNavn, tekst) => bog.ark.find(a => a.navn === arkNavn).celler.findIndex(r => r[0] === tekst) + 1

test('standardbogen er den første skabelon og regner som håndregningen', () => {
  assert.equal(BOG_SKABELONER[0].key, 'standard')
  const { bog } = indsaetSkabelon({ ark: [] }, standardBog())
  assert.deepEqual(bog.ark.map(a => a.navn),
    ['Forudsætninger', 'Materialer', 'Opbygninger', 'Lastoversigt', 'Lodret lastnedføring', 'Vandret lastnedføring'])
  assert.deepEqual(fejlI(bog), [])
  const u = uds(bog)
  naer(u.KFI, 1)
  naer(u.s_0, 1)
  // q_p(3,5 m), terrænkategori II: k_r = 0,19; c_r = 0,19·ln(3,5/0,05); I_v = 1/ln(3,5/0,05)
  const ln = Math.log(3.5 / 0.05)
  naer(u.q_p, (1 + 7 / ln) * 0.5 * 1.25 * (0.19 * ln * 24) ** 2 / 1000)

  // Spær T1: tag 25°, pr. m² vandret = lagene / cos α; last −0,5 … 4,0 m på understøtninger 0 og 4,0 m
  const gTag = (0.08 + 5 * 0.018 + 4.2 * 0.045 * 0.22 / 0.6 + 0.5 * 0.25 + 0.01 + 0.05 + 9 * 0.013) / Math.cos(25 * Math.PI / 180)
  const fA = 4.5 * (4 - 1.75) / 4, fB = 4.5 * 1.75 / 4
  const s = 0.8, wNed = 0.3 * u.q_p, wOp = -0.8 * u.q_p
  // 6.10b: sne dominerer (0,7·s > 0,7·w), vind med ψ0 = 0,3
  naer(u.T1_RA_d, gTag * fA + 1.5 * (s * fA + 0.3 * wNed * fA), 1e-9)
  naer(u.T1_RB_d, gTag * fB + 1.5 * (s * fB + 0.3 * wNed * fB), 1e-9)
  // Løft: 0,9·G_inf + 1,5·W_op; gipsen er fri og tæller ikke i G_inf
  naer(u.T1_RA_loeft, 0.9 * (gTag - 9 * 0.013 / Math.cos(25 * Math.PI / 180)) * fA + 1.5 * wOp * fA, 1e-9)

  // Kipbjælke B1: begge tagsider (R_B fra T1 to gange) og egenvægten over 6 m
  const kip = 4.6 * 0.115 * 0.405
  naer(u.B1_RB_d, (2 * gTag * fB + kip) * 3 + 1.5 * (2 * s * fB + 0.3 * 2 * wNed * fB) * 3, 1e-9)
  // Midterstolpe S1 får B1 fra begge sider; punktfundamentet F3 får stolpen og sin egen vægt
  const pf = 24 * 0.6 * 0.6 * 0.9, st = 4.6 * 0.115 * 0.115 * 4.4
  const GS1 = 2 * (2 * gTag * fB + kip) * 3 + st, SS1 = 2 * 2 * s * fB * 3, WS1 = 2 * 2 * wNed * fB * 3
  naer(u.S1_N_d, GS1 + 1.5 * (SS1 + 0.3 * WS1), 1e-9)
  naer(u.F3_N_d, GS1 + pf + 1.5 * (SS1 + 0.3 * WS1), 1e-9)

  // Ydervæg V1: ΣN og M om midten giver den plastiske fordeling (her for g_k,inf)
  const vist = bog.ark.find(a => a.navn === 'Lodret lastnedføring')._vist
  const raekke = (noegle) => vist.find(r => r[20] === noegle)
  const tal = (t) => Number(String(t).replace(',', '.'))
  const N = tal(raekke('V1/N')[7]), M = tal(raekke('V1/M')[7])
  const xr = 6 + M / N
  naer(u.V1_q_ginf, N / (2 * xr), 0.01)
  // Vinden: langfacaden 12 m, tagskiven 2,6/2 + 0,9 m
  const hd = 3.5 / 8
  const w = 0.85 * ((0.7 + (hd - 0.25) / 0.75 * 0.1) - (-0.3 - (hd - 0.25) / 0.75 * 0.2)) * u.q_p
  naer(u.V_y, w * 12 * (1.3 + 0.9))
})

test('lastnedføringen: konsekvensklasse, nyttelastkategori og en ukendt kilde', () => {
  let { bog } = indsaetSkabelon({ ark: [] }, standardBog())
  const u0 = uds(bog)
  const cc = find(bog, 'Forudsætninger', 'Konsekvensklasse')
  bog = saet(bog, 'Forudsætninger', `B${cc}`, 'CC3')
  const u1 = uds(bog)
  naer(u1.KFI, 1.1)
  // 6.10b = G + K_FI·1,5·(…): kun de variable laster ganges med K_FI
  const fA = 4.5 * (4 - 1.75) / 4
  const gTag = (0.08 + 5 * 0.018 + 4.2 * 0.045 * 0.22 / 0.6 + 0.5 * 0.25 + 0.01 + 0.05 + 9 * 0.013) / Math.cos(25 * Math.PI / 180)
  naer(u1.T1_RA_d - gTag * fA, 1.1 * (u0.T1_RA_d - gTag * fA), 1e-9)
  // Hemsen som kontor (kategori B): q_k = 2,5, og lasten lander i kolonnen q_k,B
  const ops = bog.ark.find(a => a.navn === 'Opbygninger').celler
  const hems = ops.findIndex(r => r[0] === 'HEMS')
  const kat = ops.findIndex((r, i) => i > hems && r[2] === 'A1 Bolig og interne adgangsveje') + 1
  bog = saet(bog, 'Opbygninger', `C${kat}`, 'B Kontor')
  const d1 = bog.ark.find(a => a.navn === 'Lodret lastnedføring')._vist.find(r => r[20] === 'D1/A')
  assert.deepEqual([d1[9], d1[10]], ['–', formatVaerdi(2.5 * 1.5, 2)])   // 0 vises som –
  // En stavefejl i kilden giver en fejl hele vejen ned i stedet for et stille nul
  const ln = bog.ark.find(a => a.navn === 'Lodret lastnedføring').celler
  const r = ln.findIndex(x => x[0] === 'HEMS') + 1
  bog = saet(bog, 'Lodret lastnedføring', `A${r}`, 'HEMSS')
  const vist = bog.ark.find(a => a.navn === 'Lodret lastnedføring')._vist
  assert.equal(vist[r - 1][20], '? ukendt kilde')
  assert.ok(fejlI(bog).some(f => f.startsWith('Lodret lastnedføring')))
})

test('A2-skabelonen til nyt byggeri: visningerne har gyldige områder og Egen beregning regner', () => {
  for (const o of Object.values(STANDARD_OMRAADER)) assert.ok(gyldigtOmraade(o), o)
  const { bog, idFor, navnFor } = indsaetSkabelon({ ark: [] }, standardBog())
  const blocks = tilpasBlokke(makeStandardLastnedfoeringTemplate(), idFor, navnFor)
  assert.ok(blocks.filter(b => b.type === 'ark_visning').every(b => [...idFor.values()].includes(b.data.ark)))
  const p = anvendKoblinger({ documents: { A2: { blocks, subdocs: [] } }, bog })
  const cc = p.documents.A2.blocks.find(b => b.type === 'custom_calc')
  const tekst = JSON.stringify(cc.data._result)
  assert.ok(tekst.includes('Lodret lastnedføring'), tekst.slice(0, 300))
  assert.ok(!/error|fejl/i.test(tekst), tekst.slice(0, 300))
})

test('medStandardbog: visningen får Lodret lastnedføring, også i en bog med ark i forvejen', async () => {
  const { medStandardbog } = await import('../src/lib/bogSkabeloner.js')
  const { bog, id } = medStandardbog({ ark: [], navne: {} })
  assert.equal(bog.ark.find(a => a.id === id).navn, 'Lodret lastnedføring')
  const igen = medStandardbog(bog)
  assert.equal(igen.bog.ark.find(a => a.id === igen.id).navn, 'Lodret lastnedføring (2)')
  assert.deepEqual(fejlI(igen.bog), [])
})
