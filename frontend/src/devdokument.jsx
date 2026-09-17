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
const START = [
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
