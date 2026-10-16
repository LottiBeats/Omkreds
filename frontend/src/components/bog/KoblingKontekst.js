/**
 * KoblingKontekst.js — regnearksbogens udgange for talfelterne (NumericInput).
 *
 *   udgange          [{ navn, vaerdi, tekst, enhed, arkNavn, celle, fejl }]
 *   forvent(n, v)    "den næste ændring sætter v fra navnet n" — listen, der
 *                    ejer blokkene, gemmer koblingen (lib/koblinger.js)
 *
 * Uden en udbyder er der ingen udgange, og "=" i et talfelt gør ingenting.
 */
import { createContext, useContext } from 'react'

export const KoblingKontekst = createContext({ udgange: [], forvent: null })
export const useKobling = () => useContext(KoblingKontekst)
