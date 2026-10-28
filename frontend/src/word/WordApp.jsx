/**
 * WordApp.jsx — Omkreds-beregning som panel i Word.
 *
 * Panelet er "Egen beregning" fra Omkreds: linjerne skrives og regnes med det
 * samme (lib/calcEngine.js), og "Indsæt i dokumentet" sætter beregningen ind
 * ved markøren som overskrifter og Word-ligninger (lib/calcWord.js). Står
 * markøren i en beregning, der allerede er sat ind, kan den åbnes og rettes;
 * "Opdater i dokumentet" erstatter den så, hvor den står.
 *
 * Uden for Word (en almindelig browser) kan panelet bruges til at prøve
 * linjerne af; knapperne til dokumentet er slået fra.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CustomCalcEditor, { EXAMPLE_LINES } from '../components/blocks/CustomCalcEditor.jsx'
import { evaluate } from '../lib/calcEngine.js'
import { iWord, indsaetBeregning, valgtBeregning, foelgMarkoer } from './wordDokument.js'
import './WordApp.css'

const KLADDE = 'omkreds-word-kladde'
const tom = () => ({ id: null, title: '', lines: EXAMPLE_LINES, subst: true })

function laesKladde() {
  try { const k = JSON.parse(localStorage.getItem(KLADDE) ?? 'null'); return k && Array.isArray(k.lines) ? k : null } catch { return null }
}

export default function WordApp() {
  const [b, setB] = useState(() => laesKladde() ?? tom())
  const [noegle, setNoegle] = useState(0)          // ny editor, når en anden beregning åbnes
  const [valgt, setValgt] = useState(null)         // beregningen, markøren står i
  const [besked, setBesked] = useState(null)       // { tone: 'ok'|'fejl', tekst }
  const [arbejder, setArbejder] = useState(false)
  const word = iWord()

  useEffect(() => { try { localStorage.setItem(KLADDE, JSON.stringify(b)) } catch {} }, [b])

  // Står markøren i en indsat beregning?
  const tjek = useRef(0)
  const tjekMarkoer = useCallback(() => {
    const n = ++tjek.current
    setTimeout(async () => {
      if (n !== tjek.current) return
      try { setValgt(await valgtBeregning()) } catch { setValgt(null) }
    }, 250)
  }, [])
  useEffect(() => { if (word) { foelgMarkoer(tjekMarkoer); tjekMarkoer() } }, [word, tjekMarkoer])

  const block = useMemo(() => ({ id: 'word', type: 'custom_calc', data: { title: b.title, lines: b.lines, subst: b.subst, version: 2 } }), [b])
  const onChange = (nb) => {
    const d = nb.data
    setB(x => ({ ...x, title: d.title ?? '', lines: d.lines ?? x.lines, subst: d.subst ?? true }))
    setBesked(null)
  }

  const fejl = useMemo(() => evaluate(b.lines).filter(r => r.error).length, [b.lines])

  async function saetInd() {
    setArbejder(true); setBesked(null)
    try {
      const id = await indsaetBeregning(b)
      setB(x => ({ ...x, id }))
      setBesked({ tone: 'ok', tekst: b.id ? 'Beregningen er opdateret i dokumentet.' : 'Beregningen er sat ind i dokumentet.' })
      tjekMarkoer()
    } catch (e) {
      setBesked({ tone: 'fejl', tekst: `Kunne ikke skrive i dokumentet: ${e?.message ?? e}` })
    } finally { setArbejder(false) }
  }

  function aabn(v) {
    if (v.mangler) { setBesked({ tone: 'fejl', tekst: 'Linjerne til den beregning findes ikke i dette dokument (den er nok kopieret fra et andet).' }); return }
    setB({ id: v.id, title: v.title ?? '', lines: v.lines ?? [''], subst: v.subst ?? true })
    setNoegle(k => k + 1); setBesked(null)
  }

  function ny() {
    setB({ ...tom(), lines: ['# Forudsætninger', ''] })
    setNoegle(k => k + 1); setBesked(null)
  }

  const redigerer = !!b.id
  const andenValgt = valgt && valgt.id !== b.id

  return (
    <div className="wa">
      <header className="wa-top">
        <img src="/logo.png" alt="" className="wa-logo" />
        <div>
          <div className="wa-navn">Omkreds-beregning</div>
          <div className="wa-sub">{redigerer ? 'Retter en beregning i dokumentet' : 'Ny beregning'}</div>
        </div>
        <span className="wa-sp" />
        {redigerer && <button type="button" className="wa-link" onClick={ny}>Ny</button>}
      </header>

      {!word && (
        <div className="wa-info">
          Panelet er åbnet uden for Word. Du kan skrive og regne her, men beregningen sættes kun ind,
          når panelet åbnes fra Word (Hjem → <b>Omkreds</b>).
        </div>
      )}

      {andenValgt && (
        <div className="wa-valgt">
          <span>Markøren står i <b>{valgt.title || 'en beregning'}</b>.</span>
          <button type="button" className="wa-btn" onClick={() => aabn(valgt)}>Ret den</button>
        </div>
      )}

      <CustomCalcEditor key={noegle} block={block} onChange={onChange} rapport={false} />

      <footer className="wa-bund">
        {fejl > 0 && <div className="wa-advar">{fejl} linje{fejl > 1 ? 'r' : ''} kan ikke regnes; de står som en rød note i dokumentet.</div>}
        {besked && <div className={`wa-besked ${besked.tone}`}>{besked.tekst}</div>}
        <button type="button" className="wa-primaer" disabled={!word || arbejder} onClick={saetInd}>
          {arbejder ? 'Skriver …' : redigerer ? 'Opdater i dokumentet' : 'Indsæt i dokumentet'}
        </button>
      </footer>
    </div>
  )
}
