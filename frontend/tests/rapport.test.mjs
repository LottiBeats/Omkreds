import test from 'node:test'
import assert from 'node:assert/strict'
import { nyBlok, indsaet, flyt, fjern, pdfBlokke, femIRapport } from '../src/lib/rapport.js'

const FEM_TOM = { id: 'f', type: 'general_frame_fem', data: { nodes: [], elements: [] } }
const FEM = { id: 'f', type: 'general_frame_fem', data: { nodes: [{}, {}], elements: [{ id: 1 }] } }

test('nyBlok giver unikke id og standarddata', () => {
  const a = nyBlok('text'), b = nyBlok('text')
  assert.notEqual(a.id, b.id)
  assert.equal(nyBlok('heading').data.level, 1)
  assert.ok(nyBlok('custom_calc').data.lines.length > 0)
  assert.throws(() => nyBlok('steel_beam'))
})

test('indsæt, flyt og fjern', () => {
  const t = nyBlok('text'), h = nyBlok('heading')
  let bs = indsaet([FEM], 0, h)
  bs = indsaet(bs, 99, t)
  assert.deepEqual(bs.map(b => b.id), [h.id, 'f', t.id])
  assert.deepEqual(flyt(bs, 2, -1).map(b => b.id), [h.id, t.id, 'f'])
  assert.equal(flyt(bs, 0, -1), bs)
  assert.deepEqual(fjern(bs, 0).map(b => b.id), ['f', t.id])
  assert.equal(fjern(bs, 1), bs, 'rammeberegningen kan ikke slettes fra rapporten')
})

test('PDF: tom FEM er ikke med, fravalgt FEM er ikke med', () => {
  const t = { ...nyBlok('text'), data: { text: 'Hej' } }
  assert.equal(pdfBlokke([FEM_TOM]).tom, true)
  assert.deepEqual(pdfBlokke([FEM_TOM, t]).blocks.map(b => b.type), ['text'])
  assert.deepEqual(pdfBlokke([FEM, t]).blocks.map(b => b.type), ['general_frame_fem', 'text'])
  assert.equal(femIRapport({ ...FEM, iRapport: false }), false)
  assert.deepEqual(pdfBlokke([{ ...FEM, iRapport: false }, t]).blocks.map(b => b.type), ['text'])
  assert.equal(pdfBlokke([FEM_TOM, nyBlok('text')]).tom, true, 'tomme afsnit alene er ikke en rapport')
})

test('regnearksbogen i skrivebordsprogrammet: gamle regneark flyttes ind, og en visning tæller i PDF\'en', async () => {
  const { medBog } = await import('../src/lib/rapport.js')
  const gl = [{ id: 'x', type: 'regneark', data: { navn: 'Ark1', celler: [['=2*3']], _vist: [['6']] } }, nyBlok('text')]
  const { blocks, bog, antal } = medBog(gl, undefined)
  assert.equal(antal, 1)
  assert.equal(blocks[0].type, 'ark_visning')
  assert.equal(bog.ark[0]._vist[0][0], '6')
  assert.equal(blocks[0].data.ark, bog.ark[0].id)
  assert.equal(pdfBlokke(blocks, bog).tom, false)
  assert.equal(pdfBlokke(blocks, { ark: [] }).tom, true, 'en visning af et ark, der ikke findes, er ikke indhold')
  assert.equal(medBog(blocks, bog).antal, 0)
  assert.deepEqual(nyBlok('ark_visning').data, { ark: null, omraade: '', titel: '' })
})
