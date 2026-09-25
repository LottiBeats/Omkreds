/**
 * femGenerators.js — the usual systems, as a starting model.
 *
 * Shortcuts, not limits: a generated model is an ordinary model and can be
 * edited, extended or combined with anything drawn by hand.
 *
 * Every generator returns { nodes, elements, supports, equal_dofs } and leaves
 * loads and load cases alone — the loads belong to the job, not to the shape.
 */

const rad = (deg) => (deg * Math.PI) / 180
const r4 = (v) => Math.round(v * 1e4) / 1e4

function timber(section, grade = 'C24') { return { material: 'timber', section, grade } }
function steel(section, grade = 'S355') { return { material: 'steel', section, grade } }

export const GENERATORS = [
  {
    key: 'hanebaand',
    label: 'Hanebåndstag',
    hint: 'To spær med kip-charnier og et hanebånd i begge ender charnierforbundet.',
    params: [
      { key: 'L',     label: 'Spænd L',             unit: 'm', def: 6.0 },
      { key: 'alpha', label: 'Taghældning α',       unit: '°', def: 35 },
      { key: 'hh',    label: 'Hanebånd i højde',    unit: 'm', def: 1.2 },
      { key: 'spaer', label: 'Spær (b×h)',          unit: 'mm', def: '45x195', text: true },
      { key: 'hane',  label: 'Hanebånd (b×h)',      unit: 'mm', def: '45x95',  text: true },
    ],
    make: ({ L, alpha, hh, spaer, hane }) => {
      const H = (L / 2) * Math.tan(rad(alpha))
      const h = Math.min(Math.max(hh, 0.05 * H), 0.95 * H)
      const xL = (h / H) * (L / 2)
      const nodes = [
        { id: 1, x: 0, y: 0 }, { id: 2, x: L, y: 0 },
        { id: 3, x: r4(xL), y: r4(h) }, { id: 4, x: r4(L - xL), y: r4(h) },
        { id: 5, x: r4(L / 2), y: r4(H) },
      ]
      const S = timber(spaer), T = timber(hane)
      const elements = [
        { id: 1, ni: 1, nj: 3, type: 'beam', release: 'none',  member_id: 1, ...S },
        // Kip-charnier: udløsningen sidder på den ene stang. Udløses begge,
        // har knuden ingen rotationsstivhed, og modellen kan ikke regnes.
        { id: 2, ni: 3, nj: 5, type: 'beam', release: 'none',  member_id: 1, ...S },
        { id: 3, ni: 5, nj: 4, type: 'beam', release: 'start', member_id: 2, ...S },
        { id: 4, ni: 4, nj: 2, type: 'beam', release: 'none',  member_id: 2, ...S },
        { id: 5, ni: 3, nj: 4, type: 'beam', release: 'both',  member_id: 3, ...T },
      ]
      const supports = [
        { node_id: 1, ux: true, uy: true, rz: false },
        { node_id: 2, ux: false, uy: true, rz: false },
      ]
      return { nodes, elements, supports, equal_dofs: [] }
    },
  },
  {
    key: 'sadeltag',
    label: 'Sadeltag (spærfag)',
    hint: 'To spær med kip-charnier. Med bindbjælke bliver det et trekantsfag på to ruller/charnier.',
    params: [
      { key: 'L',     label: 'Spænd L',        unit: 'm', def: 8.0 },
      { key: 'alpha', label: 'Taghældning α',  unit: '°', def: 25 },
      { key: 'bind',  label: 'Bindbjælke',     unit: '',  def: true, bool: true },
      { key: 'spaer', label: 'Spær (b×h)',     unit: 'mm', def: '45x220', text: true },
      { key: 'bb',    label: 'Bindbjælke (b×h)', unit: 'mm', def: '45x145', text: true },
    ],
    make: ({ L, alpha, bind, spaer, bb }) => {
      const H = (L / 2) * Math.tan(rad(alpha))
      const nodes = [{ id: 1, x: 0, y: 0 }, { id: 2, x: L, y: 0 }, { id: 3, x: r4(L / 2), y: r4(H) }]
      const S = timber(spaer)
      const elements = [
        { id: 1, ni: 1, nj: 3, type: 'beam', release: 'none',  member_id: 1, ...S },
        { id: 2, ni: 3, nj: 2, type: 'beam', release: 'start', member_id: 2, ...S },   // kip-charnier
      ]
      if (bind) elements.push({ id: 3, ni: 1, nj: 2, type: 'beam', release: 'both', member_id: 3, ...timber(bb) })
      const supports = bind
        ? [{ node_id: 1, ux: true, uy: true, rz: false }, { node_id: 2, ux: false, uy: true, rz: false }]
        : [{ node_id: 1, ux: true, uy: true, rz: false }, { node_id: 2, ux: true, uy: true, rz: false }]
      return { nodes, elements, supports, equal_dofs: [] }
    },
  },
  {
    key: 'portal',
    label: 'Portalramme',
    hint: 'To søjler og en rigel, evt. med taghældning og kip. Stive hjørner.',
    params: [
      { key: 'L',     label: 'Spænd L',          unit: 'm', def: 12.0 },
      { key: 'h',     label: 'Søjlehøjde h',     unit: 'm', def: 5.0 },
      { key: 'alpha', label: 'Taghældning α',    unit: '°', def: 6 },
      { key: 'fod',   label: 'Søjlefod indspændt', unit: '', def: false, bool: true },
      { key: 'sojle', label: 'Søjle',            unit: '',  def: 'HEA200', steel: true },
      { key: 'rigel', label: 'Rigel',            unit: '',  def: 'IPE300', steel: true },
    ],
    make: ({ L, h, alpha, fod, sojle, rigel }) => {
      const H = h + (L / 2) * Math.tan(rad(alpha))
      const withRidge = alpha > 0.01
      const nodes = [
        { id: 1, x: 0, y: 0 }, { id: 2, x: 0, y: h },
        { id: 3, x: L, y: h }, { id: 4, x: L, y: 0 },
      ]
      if (withRidge) nodes.push({ id: 5, x: r4(L / 2), y: r4(H) })
      const C = steel(sojle), R = steel(rigel)
      const elements = [{ id: 1, ni: 1, nj: 2, type: 'beam', release: 'none', member_id: 1, ...C }]
      if (withRidge) {
        elements.push({ id: 2, ni: 2, nj: 5, type: 'beam', release: 'none', member_id: 2, ...R })
        elements.push({ id: 3, ni: 5, nj: 3, type: 'beam', release: 'none', member_id: 3, ...R })
      } else {
        elements.push({ id: 2, ni: 2, nj: 3, type: 'beam', release: 'none', member_id: 2, ...R })
      }
      elements.push({ id: withRidge ? 4 : 3, ni: 4, nj: 3, type: 'beam', release: 'none', member_id: withRidge ? 4 : 3, ...C })
      const s = { ux: true, uy: true, rz: !!fod }
      return { nodes, elements, supports: [{ node_id: 1, ...s }, { node_id: 4, ...s }], equal_dofs: [] }
    },
  },
  {
    key: 'kontinuert',
    label: 'Bjælke over flere fag',
    hint: 'Én gennemgående bjælke. Fagene skrives adskilt af semikolon.',
    params: [
      { key: 'fag',   label: 'Fag',        unit: 'm', def: '4,5; 5,0; 4,5', text: true },
      { key: 'mat',   label: 'Materiale',  unit: '',  def: 'timber', choice: [['timber', 'Træ'], ['steel', 'Stål']] },
      { key: 'sec',   label: 'Tværsnit',   unit: '',  def: '90x270', text: true },
    ],
    make: ({ fag, mat, sec }) => {
      const spans = String(fag).split(/[;\s]+/).map(s => parseFloat(s.replace(',', '.'))).filter(v => v > 0)
      if (!spans.length) return null
      const P = mat === 'steel' ? steel(sec || 'IPE300') : timber(sec || '90x270', 'GL24h')
      let x = 0
      const nodes = [{ id: 1, x: 0, y: 0 }]
      spans.forEach((l, i) => { x += l; nodes.push({ id: i + 2, x: r4(x), y: 0 }) })
      const elements = spans.map((_, i) => ({ id: i + 1, ni: i + 1, nj: i + 2, type: 'beam', release: 'none', member_id: 1, ...P }))
      const supports = nodes.map((n, i) => ({ node_id: n.id, ux: i === 0, uy: true, rz: false }))
      return { nodes, elements, supports, equal_dofs: [] }
    },
  },
]
