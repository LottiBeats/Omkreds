/**
 * BogKontekst.js — projektets regnearksbog for blokkene i rapporten.
 *
 *   bog          project.bog ({ ark: [...] })
 *   aabn(id, c)  åbn bogen i fuld skærm på arket id (og cellen c, fx "B17")
 *   nytArk()     opret et tomt ark og returnér dets id
 *   standard()   sæt standardbogen ind og returnér id'et på det ark, en visning skal vise
 *
 * Uden en udbyder (fx i forhåndsvisninger) er bogen tom, og intet kan åbnes.
 */
import { createContext, useContext } from 'react'

export const BogKontekst = createContext({ bog: { ark: [] }, aabn: null, nytArk: null, standard: null })
export const useBog = () => useContext(BogKontekst)
