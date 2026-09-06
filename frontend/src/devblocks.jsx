/**
 * devblocks.jsx — blokeditorerne uden login.
 *
 * Findes fordi Clerk-noeglen i .env.local er en pk_live laast til omkreds.dk:
 * intet indlogget flow kan koeres lokalt, og derfor er hver eneste aendring i
 * en blokeditor hidtil blevet argumenteret i stedet for set. Det gik galt med
 * materialevaelgeren i tagets egenlast, som blev saa bred at
 * beskrivelsesfeltet viste ét tegn.
 *
 * Siden bygges ikke ind i appen -- den er et selvstaendigt Vite-indgangspunkt
 * og naas kun via `npm run dev` paa /blokke.html.
 *
 * Blokkene kalder API'et naar man trykker Kør. Det virker kun hvis backend
 * koerer lokalt paa 8000; ellers kan alt undtagen selve beregningen bruges,
 * hvilket er nok til at se paa layoutet.
 */
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'

import RoofDeadLoadBlock from './components/blocks/RoofDeadLoadBlock.jsx'
import SnowLoadBlock     from './components/blocks/SnowLoadBlock.jsx'
import WindLoadBlock     from './components/blocks/WindLoadBlock.jsx'
import LoadComboBlock    from './components/blocks/LoadComboBlock.jsx'
import TimberBeamBlock   from './components/blocks/TimberBeamBlock.jsx'
import TimberColumnBlock from './components/blocks/TimberColumnBlock.jsx'
import SteelBeamBlock    from './components/blocks/SteelBeamBlock.jsx'
import SteelColumnBlock  from './components/blocks/SteelColumnBlock.jsx'
import CustomCalcBlock   from './components/blocks/CustomCalcBlock.jsx'

const KATALOG = [
  ['Tagets egenlast', RoofDeadLoadBlock, 'roof_dead_load',
    { title: 'Tagets egenlast', label: 'G1', alpha_deg: 30, a_m: 0.9,
      b_mm: 45, h_mm: 195, rho_kgm3: 420 }],
  ['Snelast', SnowLoadBlock, 'snow_load',
    { title: 'Snelast', label: 'S1', roof_type: 'pitched', alpha_deg: 30,
      s_k_kNm2: 1.0, roof_span_m: 8, eave_height_m: 2.5, a_m: 0.9 }],
  ['Vindlast', WindLoadBlock, 'wind_load',
    { title: 'Vindlast', label: 'W1', terrain_category: 'II', v_b0_ms: 24 }],
  ['Lastkombinationer', LoadComboBlock, 'load_combo',
    { title: 'Lastkombinationer', label: 'LC1', unit: 'kN/m', G_k: 5,
      loads: [{ label: 'Sne', Q_k: 2, category: 'S' }], method: '6.10ab',
      consequence_class: 'CC2' }],
  ['Træbjælke', TimberBeamBlock, 'timber_beam',
    { title: 'Træbjælke', label: 'T1', span_m: 4, b_mm: 45, h_mm: 195,
      timber_grade: 'C24', g_k_kNm: 0.9, q_k_kNm: 0.7 }],
  ['Træsøjle', TimberColumnBlock, 'timber_column',
    { title: 'Træsøjle', label: 'C1', length_m: 3, N_Ed_kN: 50,
      b_mm: 140, h_mm: 140, timber_grade: 'GL28h' }],
  ['Stålbjælke', SteelBeamBlock, 'steel_beam',
    { title: 'Stålbjælke', label: 'S1', section: 'IPE300', grade: 'S355',
      span_m: 5, g_k_kNm: 5, q_k_kNm: 3 }],
  ['Stålsøjle', SteelColumnBlock, 'steel_column',
    { title: 'Stålsøjle', label: 'SC1', section: 'HEB200', grade: 'S355',
      length_m: 3, N_Ed_kN: 500, gamma_M1: 1.2 }],
  ['Egen beregning', CustomCalcBlock, 'custom_calc',
    { title: 'Egen beregning', items: [] }],
]

function Vaerksted() {
  const [valgt, setValgt] = useState(0)
  const [bredde, setBredde] = useState(320)
  const [navn, Comp, type, start] = KATALOG[valgt]
  const [data, setData] = useState(start)

  React.useEffect(() => { setData(KATALOG[valgt][3]) }, [valgt])

  const block = { id: 'dev', type, data }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 16 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center',
                    marginBottom: 12, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 13 }}>Blokvisning</strong>
        <select value={valgt} onChange={e => setValgt(Number(e.target.value))}
                style={{ padding: 4 }}>
          {KATALOG.map(([n], i) => <option key={n} value={i}>{n}</option>)}
        </select>
        <label style={{ fontSize: 12 }}>
          Panelbredde{' '}
          <input type="range" min="260" max="900" value={bredde}
                 onChange={e => setBredde(Number(e.target.value))} />
          {' '}{bredde} px
        </label>
        <span style={{ fontSize: 11, color: '#6b7280' }}>
          Editoren i appen er omkring 320 px bred — det er dér, tingene brækker.
        </span>
      </div>

      <div style={{ width: bredde, border: '1px solid #ddd', borderRadius: 6,
                    padding: 10, background: '#fff', resize: 'horizontal',
                    overflow: 'auto' }}>
        <Comp block={block} blocks={[block]}
              onChange={b => setData(b.data)} />
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<Vaerksted />)
