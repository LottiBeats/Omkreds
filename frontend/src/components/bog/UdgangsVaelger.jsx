/**
 * UdgangsVaelger.jsx — "=" i et talfelt henter en navngiven celle fra
 * regnearksbogen. Bruges af NumericInput (blokkenes felter) og af FEM-
 * modelvinduets felter.
 *
 *   const v = useUdgangsVaelger({ tekst, inputRef, onVaelg })
 *   v.soeger       feltet starter med "=", og der er navne at vælge imellem
 *   v.tast(e)      piletaster/Enter/Tab i listen — true, hvis tasten er brugt
 *   v.vedBlur()    et præcist navn skrevet ud vælges — true, hvis det skete
 *   v.liste        listen under feltet (portal), eller null
 *
 * onVaelg(vaerdi) kaldes med cellens tal; koblingen gemmes af den liste, der
 * ejer blokken (forvent i KoblingKontekst, lib/koblinger.js).
 */
import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { useKobling } from './KoblingKontekst.js'
import '../blocks/NumericInput.css'

export function useUdgangsVaelger({ tekst, inputRef, onVaelg }) {
  const { udgange, forvent } = useKobling()
  const [idx, setIdx] = useState(0)
  const kanKoble = !!forvent && udgange.length > 0
  const soeger = kanKoble && String(tekst ?? '').startsWith('=')
  const filter = soeger ? tekst.slice(1).trim().toLowerCase() : ''
  const forslag = soeger
    ? udgange.filter(u => !filter || u.navn.toLowerCase().includes(filter) || u.arkNavn.toLowerCase().includes(filter))
    : []

  function vaelg(u) {
    if (!u || u.vaerdi === null) return false
    forvent(u.navn, u.vaerdi)
    onVaelg(u.vaerdi)
    return true
  }

  function tast(e) {
    if (!soeger || !forslag.length) return false
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(forslag.length - 1, i + 1)); return true }
    if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(0, i - 1)); return true }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); vaelg(forslag[Math.min(idx, forslag.length - 1)]); return true }
    return false
  }

  const vedBlur = () => soeger && vaelg(udgange.find(u => u.navn.toLowerCase() === filter))

  const boks = soeger ? inputRef.current?.getBoundingClientRect() : null
  const liste = boks ? createPortal(
    <div className="ni-udgange" style={{ left: boks.left, top: boks.bottom + 2, minWidth: Math.max(260, boks.width) }}
         onMouseDown={e => e.preventDefault()}>
      <div className="ni-udg-top">Fra regnearket</div>
      {forslag.length ? forslag.slice(0, 40).map((u, i) => (
        <button key={u.navn} type="button" disabled={u.vaerdi === null}
                className={'ni-udg' + (i === idx ? ' ni-udg-valgt' : '')}
                onMouseEnter={() => setIdx(i)} onClick={() => vaelg(u)}>
          <span className="ni-udg-navn">{u.navn}</span>
          <span className="ni-udg-v">{u.fejl ?? `${u.tekst} ${u.enhed}`}</span>
          <span className="ni-udg-sted">{u.arkNavn}!{u.celle}</span>
        </button>
      )) : <div className="ni-udg-ingen">Ingen navne passer. Navngiv en celle i regnearket (højreklik → Navngiv).</div>}
    </div>,
    document.body,
  ) : null

  return { soeger, kanKoble, tast, vedBlur, liste, nulstil: () => setIdx(0) }
}
