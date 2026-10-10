/**
 * Indholdsfortegnelse — det åbne dokuments afsnit i venstremenuen.
 *
 *   INDHOLD · A1
 *   1   Konstruktionsafsnit
 *   4   Konstruktioner
 *       4.5  Robusthed        ●     ← det afsnit, man står i
 *   5   Konstruktionsmaterialer  2 ← tomme felter i afsnittet
 *
 * Overskrift 1 og 2 står altid der. Overskrift 3 foldes kun ud under det
 * afsnit, man står i, så et langt dokument ikke giver en lang liste. Numrene
 * er de samme som i editoren og eksporten (lib/indhold.js).
 *
 * Hvilket afsnit man står i, følger rullepositionen i hovedspalten: det er
 * den sidste overskrift, der er rullet forbi toppen.
 */
import React, { useEffect, useMemo, useState } from 'react'
import { indholdsfortegnelse, sti } from '../../lib/indhold.js'
import './editor.css'

// Så langt under hovedspaltens top tæller en overskrift som "nået".
const TOP_MARGEN = 96

export default function Indholdsfortegnelse({ blocks, docLabel, scrollRef, onGaaTil }) {
  const punkter = useMemo(() => indholdsfortegnelse(blocks), [blocks])
  const [aktiv, setAktiv] = useState(null)

  useEffect(() => {
    const main = scrollRef.current
    if (!main || punkter.length === 0) { setAktiv(null); return }
    let ramme = 0
    function maal() {
      ramme = 0
      const top = main.getBoundingClientRect().top + TOP_MARGEN
      let fundet = punkter[0].id
      for (const p of punkter) {
        const el = main.querySelector(`[data-block-id="${p.id}"]`)
        if (!el) continue
        if (el.getBoundingClientRect().top <= top) fundet = p.id
        else break
      }
      setAktiv(fundet)
    }
    const paaScroll = () => { if (!ramme) ramme = requestAnimationFrame(maal) }
    maal()
    main.addEventListener('scroll', paaScroll, { passive: true })
    return () => { main.removeEventListener('scroll', paaScroll); if (ramme) cancelAnimationFrame(ramme) }
  }, [punkter, scrollRef])

  if (punkter.length === 0) return null

  const aaben = sti(punkter, aktiv)
  const vises = (p) => p.level <= 2 || aaben.has(p.forælder)
  const synlige = punkter.filter(vises)
  // Et afsnit, hvis underafsnit er foldet ind, tæller også deres tomme felter
  // med, så intet forsvinder ud af syne.
  const huller = new Map(punkter.map(p => [p.id, p.huller]))
  for (const p of [...punkter].reverse()) {
    if (p.forælder !== null && !vises(p)) huller.set(p.forælder, huller.get(p.forælder) + huller.get(p.id))
  }

  return (
    <div className="ed-toc">
      <div className="ed-rail-grp">Indhold · {docLabel}</div>
      {synlige.map(p => {
        const on = p.id === aktiv
        return (
          <button
            key={p.id}
            className={`ed-toc-item ed-toc-l${p.level}` + (on ? ' is-on' : '')}
            aria-current={on ? 'location' : undefined}
            title={`${p.nr} ${p.titel}`.trim()}
            onClick={() => { setAktiv(p.id); onGaaTil(p.id) }}
          >
            <span className="ed-toc-nr">{p.nr}</span>
            <span className="ed-toc-titel">{p.titel}</span>
            {huller.get(p.id) > 0 && (
              <span className="ed-toc-huller" title={`${huller.get(p.id)} felt${huller.get(p.id) === 1 ? '' : 'er'} at udfylde`}>{huller.get(p.id)}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
