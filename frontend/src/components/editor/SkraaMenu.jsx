/**
 * SkraaMenu.jsx — "/" i et tomt tekstafsnit: indsæt noget lige her.
 *
 * Man skriver videre for at søge ("/vind", "/træbj"), vælger med pilene og
 * Enter, og blokken kommer ind ved markøren -- teksten deles om den. Esc
 * fortryder og skriver skråstregen alligevel.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useSkraa, lukSkraa, hentAktiv } from '../../lib/aktivTekst.js'

const norm = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ')

export default function SkraaMenu({ h, grupper, typer, templates = [] }) {
  const sk = useSkraa()
  if (!sk) return null
  return <Liste key={sk.blockId + ':' + sk.x + ':' + sk.y} sk={sk} h={h} grupper={grupper} typer={typer} templates={templates} />
}

function Liste({ sk, h, grupper, typer, templates }) {
  const [q, setQ] = useState('')
  const [valgt, setValgt] = useState(0)
  const listRef = useRef(null)

  const alle = useMemo(() => {
    const ud = []
    for (const g of grupper) {
      for (const t of g.types) if (typer[t]) ud.push({ key: t, gruppe: g.label, label: typer[t].label, icon: typer[t].icon, color: typer[t].color, type: t })
    }
    for (const t of templates) ud.push({ key: 'tmpl:' + t.id, gruppe: 'Mine beregninger', label: t.name, icon: '★', color: '#a16207', template: t })
    return ud
  }, [grupper, typer, templates])

  const vist = useMemo(() => {
    const n = norm(q.trim())
    if (!n) return alle
    return alle.filter(x => norm(x.label + ' ' + x.gruppe).includes(n))
  }, [alle, q])

  useEffect(() => { setValgt(0) }, [q])
  useEffect(() => {
    listRef.current?.querySelector('.sk-item.on')?.scrollIntoView({ block: 'nearest' })
  }, [valgt])

  function vaelg(x) {
    lukSkraa()
    const a = hentAktiv()
    h.indsaet(a?.blockId === sk.blockId ? a : { blockId: sk.blockId }, x.type, x.template)
  }
  function fortryd(skriv) {
    lukSkraa()
    if (skriv) sk.skrivSkraa()
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setValgt(v => Math.min(vist.length - 1, v + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setValgt(v => Math.max(0, v - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (vist[valgt]) vaelg(vist[valgt]) }
    else if (e.key === 'Escape') { e.preventDefault(); fortryd(true) }
    else if (e.key === 'Backspace' && !q) { e.preventDefault(); fortryd(false); hentAktiv()?.editor?.commands.focus() }
  }

  // Under markøren, eller over den, hvis der ikke er plads nedenunder.
  const hoejde = 320
  const top = sk.y + 6 + hoejde > window.innerHeight ? Math.max(8, sk.y - hoejde - 28) : sk.y + 6
  const left = Math.min(sk.x, window.innerWidth - 300)

  let sidsteGruppe = null
  return (
    <>
      <div className="sk-bag" onMouseDown={() => fortryd(false)} />
      <div className="sk" style={{ top, left }} role="dialog" aria-label="Indsæt">
        <div className="sk-soeg">
          <span className="sk-slash">/</span>
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKeyDown}
                 placeholder="Søg: vind, træbjælke, tabel …" aria-label="Søg efter det, der skal indsættes" />
        </div>
        <div className="sk-liste" ref={listRef} role="listbox">
          {vist.length === 0 && <div className="sk-tom">Intet hedder sådan. Esc skriver en skråstreg.</div>}
          {vist.map((x, i) => {
            const ny = x.gruppe !== sidsteGruppe; sidsteGruppe = x.gruppe
            return (
              <React.Fragment key={x.key}>
                {ny && <div className="sk-gruppe">{x.gruppe.replace(/\s+/g, ' ')}</div>}
                <div className={'sk-item' + (i === valgt ? ' on' : '')} role="option" aria-selected={i === valgt}
                     onMouseEnter={() => setValgt(i)} onMouseDown={e => { e.preventDefault(); vaelg(x) }}>
                  <span className="sk-ikon" style={{ background: x.color }}>{x.icon}</span>{x.label}
                </div>
              </React.Fragment>
            )
          })}
        </div>
      </div>
    </>
  )
}
