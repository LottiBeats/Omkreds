/**
 * Baand.jsx — båndet over dokumentet, som i Word.
 *
 *   Typografi        Brødtekst · Overskrift 1 · Overskrift 2 · Overskrift 3
 *   Skrifttype       Fed (Ctrl+B) · Kursiv (Ctrl+I) · Understreget (Ctrl+U)
 *   Afsnit           Punktliste · Nummereret liste
 *   Indsæt           Billede · Tabel · Regneark · Beregning ▾
 *
 * Båndet virker på den tekst, markøren står i (lib/aktivTekst.js). Knapperne
 * reagerer på mousedown og forhindrer, at markøren forlader teksten -- ellers
 * ville markeringen være væk, når knappen bliver trykket. Indsæt sætter den
 * nye blok ved markøren (teksten deles om den), eller efter den blok,
 * markøren sidst stod i. "/" i et tomt afsnit gør det samme (SkraaMenu.jsx).
 */
import React from 'react'
import { useAktivTekst } from '../../lib/aktivTekst.js'
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '../../ui/index.js'
import SkraaMenu from './SkraaMenu.jsx'
import './Baand.css'

const TYPOGRAFIER = [
  { level: 0, label: 'Brødtekst' },
  { level: 1, label: 'Overskrift 1' },
  { level: 2, label: 'Overskrift 2' },
  { level: 3, label: 'Overskrift 3' },
]

function Knap({ on, title, disabled, onRun, children, className = '' }) {
  return (
    <button
      type="button"
      className={'bd-knap ' + className + (on ? ' on' : '')}
      title={title}
      aria-label={title}
      aria-pressed={on === undefined ? undefined : !!on}
      disabled={disabled}
      onMouseDown={e => { e.preventDefault(); if (!disabled) onRun() }}
    >{children}</button>
  )
}

function Gruppe({ navn, children }) {
  return (
    <div className="bd-gruppe" role="group" aria-label={navn}>
      <div className="bd-indhold">{children}</div>
      <div className="bd-navn">{navn}</div>
    </div>
  )
}

const BilledIkon = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
    <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" /><circle cx="5.5" cy="6.5" r="1.2" /><path d="m2.5 12 3.5-3.5 2.5 2.5 2-2 3 3" />
  </svg>
)

export default function Baand({ h, grupper, typer, templates = [], onManageTemplates, visPalet, onPalet, zoom = 100, onZoom, ord, onFind, children }) {
  const a = useAktivTekst()
  const ed = a?.type === 'text' ? a.editor : null
  const tekst = !!ed && !ed.isDestroyed
  const niveau = a?.type === 'heading' ? a.level : a?.type === 'text' ? 0 : null

  function typografi(level) {
    if (!a) return
    if (a.type === 'heading') {
      if (level === 0) h.overskriftTilTekst(a.blockId)
      else if (level !== a.level) h.saetNiveau(a.blockId, level)
    } else if (a.type === 'text' && level > 0) {
      const [foer, afsnit, eft] = a.afsnitOmMarkoer()
      h.tekstTilOverskrift(a.blockId, foer, afsnit, eft, level)
    }
  }

  const kald = (fn) => () => fn(ed.chain().focus()).run()
  // Beregningerne fra paletten, uden "Indhold" (dem har båndet selv).
  const beregninger = grupper.filter(g => g.label !== 'Indhold')

  return (
    <div className="bd" role="toolbar" aria-label="Bånd">
      <Gruppe navn="Typografi">
        <div className="bd-typografier">
          {TYPOGRAFIER.map(t => (
            <Knap key={t.level} className={`bd-typo bd-typo-${t.level}`} on={niveau === t.level}
              title={t.level ? `${t.label} (afsnittet, markøren står i; Tab/Shift+Tab i en overskrift skifter niveau)` : 'Brødtekst'}
              disabled={niveau === null}
              onRun={() => typografi(t.level)}>
              {t.level ? <><span className="bd-lang">Overskrift </span>{t.level}</> : t.label}
            </Knap>
          ))}
        </div>
      </Gruppe>

      <Gruppe navn="Skrifttype">
        <Knap title="Fed (Ctrl+B)" on={tekst && ed.isActive('bold')} disabled={!tekst} onRun={kald(c => c.toggleBold())}><b>F</b></Knap>
        <Knap title="Kursiv (Ctrl+I)" on={tekst && ed.isActive('italic')} disabled={!tekst} onRun={kald(c => c.toggleItalic())}><i>K</i></Knap>
        <Knap title="Understreget (Ctrl+U)" on={tekst && ed.isActive('underline')} disabled={!tekst} onRun={kald(c => c.toggleUnderline())}><u>U</u></Knap>
      </Gruppe>

      <Gruppe navn="Afsnit">
        <Knap title="Punktliste (eller skriv '- ' i starten af en linje)" on={tekst && ed.isActive('bulletList')} disabled={!tekst}
          onRun={kald(c => c.toggleBulletList())}>
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="3" cy="4" r="1.3" /><circle cx="3" cy="8" r="1.3" /><circle cx="3" cy="12" r="1.3" />
            <path d="M6 4h8M6 8h8M6 12h8" stroke="currentColor" strokeWidth="1.3" /></svg>
        </Knap>
        <Knap title="Nummereret liste (eller skriv '1. ' i starten af en linje)" on={tekst && ed.isActive('orderedList')} disabled={!tekst}
          onRun={kald(c => c.toggleOrderedList())}>
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><text x="0.5" y="5.5" fontSize="5" fontFamily="sans-serif">1</text>
            <text x="0.5" y="13.5" fontSize="5" fontFamily="sans-serif">2</text><path d="M6 4h8M6 12h8" stroke="currentColor" strokeWidth="1.3" /></svg>
        </Knap>
      </Gruppe>

      <Gruppe navn="Indsæt">
        <Knap className="bd-bred" title="Billede — ved markøren, hvis den står i en tekst (eller Ctrl+V et skærmklip)"
          onRun={() => (a?.type === 'text' && a.vaelgBillede ? a.vaelgBillede() : h.indsaet(a, 'image'))}>
          <BilledIkon /><span className="bd-tekst">Billede</span>
        </Knap>
        <Knap className="bd-bred" title="Tabel" onRun={() => h.indsaet(a, 'table')}>
          <span className="bd-ikon">▦</span><span className="bd-tekst">Tabel</span>
        </Knap>
        <Knap className="bd-bred" title="Ark fra regnearksbogen" onRun={() => h.indsaet(a, 'ark_visning')}>
          <span className="bd-ikon bd-xl">XL</span><span className="bd-tekst">Regneark</span>
        </Knap>
        <Menu align="left" width={260} trigger={() => (
          <button type="button" className="bd-knap bd-bred" onMouseDown={e => e.preventDefault()} title="Indsæt en beregning">
            <span className="bd-ikon">∑</span><span>Beregning ▾</span>
          </button>
        )}>
          {beregninger.map((g, gi) => (
            <React.Fragment key={g.label}>
              {gi > 0 && <MenuSeparator />}
              <MenuLabel>{g.label.replace(/\s+/g, ' ')}</MenuLabel>
              {g.types.filter(t => typer[t]).map(t => (
                <MenuItem key={t} onSelect={() => h.indsaet(a, t)}>{typer[t].label}</MenuItem>
              ))}
            </React.Fragment>
          ))}
          {templates.length > 0 && <>
            <MenuSeparator />
            <MenuLabel>Mine beregninger</MenuLabel>
            {templates.map(t => <MenuItem key={t.id} onSelect={() => h.indsaet(a, null, t)}>{t.name}</MenuItem>)}
          </>}
          {onManageTemplates && <>
            <MenuSeparator />
            <MenuItem onSelect={onManageTemplates}>Administrér beregninger…</MenuItem>
          </>}
        </Menu>
      </Gruppe>

      {onFind && (
        <Gruppe navn="Redigér">
          <Knap className="bd-bred" title="Find og erstat (Ctrl+F / Ctrl+H)" onRun={onFind}>
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <circle cx="6.5" cy="6.5" r="4.2" /><path d="m9.7 9.7 4.3 4.3" /></svg>
            <span className="bd-tekst">Find</span>
          </Knap>
        </Gruppe>
      )}

      {onPalet && (
        <Gruppe navn="Vis">
          <Knap className="bd-bred" on={visPalet} title={visPalet ? 'Skjul paletten til venstre -- skriv "/" i et tomt afsnit for at indsætte' : 'Vis paletten med alle beregninger'}
            onRun={onPalet}>
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
              <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" /><path d="M6 2.5v11" /></svg>
            <span className="bd-tekst">Palet</span>
          </Knap>
          {onZoom && <>
            <Knap title="Zoom ud" disabled={zoom <= 50} onRun={() => onZoom(zoom - 10)}>−</Knap>
            <Knap className="bd-zoom" title="Zoom: tilbage til 100 %" onRun={() => onZoom(100)}>{zoom} %</Knap>
            <Knap title="Zoom ind" disabled={zoom >= 200} onRun={() => onZoom(zoom + 10)}>+</Knap>
          </>}
        </Gruppe>
      )}
      {ord != null && <div className="bd-ord" title="Ord i dokumentets tekst og overskrifter">{ord.toLocaleString('da-DK')} ord</div>}
      {children}
      <SkraaMenu h={h} grupper={grupper} typer={typer} templates={templates} />
    </div>
  )
}
