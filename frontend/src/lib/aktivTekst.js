/**
 * aktivTekst.js — hvilken tekst markøren står i, til båndet (components/editor/Baand.jsx).
 *
 * Hver tekstblok har sin egen lille editor (TiptapEditor), og hver overskrift
 * sit eget felt. Båndet øverst skal virke på den, markøren står i -- som i
 * Word. Blokken melder sig her, når den får fokus og når markeringen flytter
 * sig, og båndet læser den med useAktivTekst().
 *
 *   { blockId, type: 'text', editor, fokus, afsnitOmMarkoer(), delVedMarkoer() }
 *   { blockId, type: 'heading', level, fokus }
 *
 * Den sidste bliver stående, når fokus forsvinder (fokus: false), så
 * "Indsæt" i båndet ved, hvor i dokumentet den sidst var.
 */
import { useSyncExternalStore } from 'react'

let aktiv = null
let version = 0
const lyttere = new Set()

function meld() {
  version++
  lyttere.forEach(f => f())
}

export function saetAktiv(a) { aktiv = a; meld() }

/** Kun hvis det stadig er den blok, der melder fra (en anden kan have overtaget). */
export function slipAktiv(blockId) {
  if (aktiv?.blockId === blockId) { aktiv = { ...aktiv, fokus: false }; meld() }
}

export function glemAktiv(blockId) {
  if (aktiv?.blockId === blockId) { aktiv = null; meld() }
}

export const hentAktiv = () => aktiv

const abonner = (f) => { lyttere.add(f); return () => lyttere.delete(f) }

/** Den aktive tekst; komponenten tegnes igen, når markeringen flytter sig. */
export function useAktivTekst() {
  useSyncExternalStore(abonner, () => version)
  return aktiv
}

// "/" i et tomt afsnit åbner indsæt-menuen ved markøren (components/editor/SkraaMenu.jsx).
let skraa = null
export function aabnSkraa(s) { skraa = s; meld() }
export function lukSkraa() { if (skraa) { skraa = null; meld() } }
export function useSkraa() {
  useSyncExternalStore(abonner, () => version)
  return skraa
}
