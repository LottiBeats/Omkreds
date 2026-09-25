/**
 * devdokument.jsx — hele dokumentet uden login.
 *
 * Søskende til devblocks.jsx, som viser én blokeditor ad gangen. Den her
 * viser BlockList: siden, blokkene ligger på, med markering, træk-og-slip,
 * minimering og rækkefølge.
 *
 * Findes fordi de fejl, brugeren faktisk render ind i, ikke sidder inde i en
 * beregning. De sidder i dokumentet: en blok, der bliver grå og bliver ved med
 * at være det, eller et talfelt, man ikke kan markere i, fordi hele blokken
 * begynder at flytte sig. Den slags kan hverken ses i en blokeditor for sig
 * eller argumenteres frem — den skal trækkes i.
 *
 * Bygges ikke ind i appen. Nås kun via `npm run dev` på /dokument.html.
 */
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'

import BlockList from './components/blocks/BlockList.jsx'

// Fire blokke, der dækker de tilstande, siden kan være i: en med felter at
// taste i, en ren tekst, en uden resultat endnu, og en med et resultat.
// En færdigregnet vindlast, som FEM-blokken kan hente zonetryk fra. Uden en
// søskende med _exports er den sti aldrig blevet set — og det var præcis dér,
// træbjælken kaldte en variabel, der ikke fandtes.
const VIND = {
  id: 'w1', type: 'wind_load', data: {
    title: 'Vindlast', label: 'W1',
    _exports: {
      label: 'W1', q_p_kNm2: 0.7334, e_m: 12.0, kantzone_m: 1.2,
      h_m: 6, b_m: 30, d_m: 12,
      zoner: [
        { zone: 'D', c_pe: 0.75, c_pi: 0.2, w_kNm2: 0.403, w_kNm: 1.613 },
        { zone: 'E', c_pe: -0.40, c_pi: 0.2, w_kNm2: -0.440, w_kNm: -1.760 },
        { zone: 'G', c_pe: -0.50, c_pi: 0.2, w_kNm2: -0.513, w_kNm: -2.054 },
        { zone: 'H', c_pe: -0.20, c_pi: 0.2, w_kNm2: -0.293, w_kNm: -1.173 },
        { zone: 'I', c_pe: -0.40, c_pi: 0.2, w_kNm2: -0.440, w_kNm: -1.760 },
        { zone: 'J', c_pe: -0.50, c_pi: 0.2, w_kNm2: -0.513, w_kNm: -2.054 },
        { zone: 'D', c_pe: 0.75, c_pi: -0.3, w_kNm2: 0.770, w_kNm: 3.080 },
        { zone: 'G', c_pe: -0.50, c_pi: -0.3, w_kNm2: -0.147, w_kNm: -0.587 },
      ],
    },
  },
}

const RAMME = {
  id: 'fem1', type: 'general_frame_fem', data: {
    title: 'Portalramme',
    nodes: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 0, y: 4 },
            { id: 3, x: 6, y: 6 }, { id: 4, x: 12, y: 4 },
            { id: 5, x: 12, y: 0 }],
    elements: [{ id: 1, ni: 1, nj: 2 }, { id: 2, ni: 2, nj: 3 },
               { id: 3, ni: 3, nj: 4 }, { id: 4, ni: 4, nj: 5 }],
    supports: [{ node_id: 1, ux: true, uy: true, rz: true },
               { node_id: 5, ux: true, uy: true, rz: true }],
    loads: [], load_cases: [], equal_dofs: [],
  },
}

const START = [
  VIND, RAMME,
  { id: 'b1', type: 'heading', data: { text: 'Eftervisning af spær' } },
  { id: 'b2', type: 'text',    data: { text:
      'Denne tekst er her for at kunne markeres med musen. Kan den ikke det, ' +
      'er det fejlen.' } },
  { id: 'b3', type: 'custom_calc', data: {
      title: 'Egen beregning',
      items: [
        { type: 'var', name: 'b', value: 200, unit: 'mm', description: 'bredde' },
        { type: 'var', name: 'h', value: 400, unit: 'mm', description: 'højde' },
        { type: 'formula', expr: 'W = b*h**2/6', unit: 'mm**3' },
      ],
    } },
  { id: 'b4', type: 'table', data: {
      has_header: true,
      rows: [['Element', 'M (kNm)'], ['1', '15,6'], ['2', '9,2']],
    } },
]

function Harness() {
  const [blocks, setBlocks] = useState(START)
  const [clipboard, setClipboard] = useState(null)

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ padding: '8px 14px', background: '#1e3a5f', color: '#fff',
                    fontSize: 12 }}>
        Dokumentet uden login · {blocks.length} blokke ·
        rækkefølge: {blocks.map(b => b.id).join(' ')}
      </div>
      <BlockList
        blocks={blocks}
        onChange={setBlocks}
        clipboard={clipboard}
        onCopyBlock={setClipboard}
        project={{ name: 'Udvikling', consequence_class: 'CC2' }}
      />
    </div>
  )
}

createRoot(document.getElementById('root')).render(<Harness />)
