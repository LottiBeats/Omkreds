/**
 * wordDokument.js — Word-delen af tilføjelsesprogrammet (Office.js).
 *
 * En indsat beregning ligger i en indholdskontrol med mærket
 * "omkreds-calc:<id>". Linjerne gemmes i dokumentets indstillinger under samme
 * nøgle, så beregningen kan åbnes og rettes igen, også efter dokumentet er
 * lukket og åbnet. Tallene i dokumentet er dem, der blev regnet ved indsættelsen.
 */
import { wordDele, ooxmlPakke } from '../lib/calcWord.js'

export const MAERKE = 'omkreds-calc'
const noegle = (id) => `${MAERKE}:${id}`
const nytId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`)

/** Kører vi inde i Word? (efter Office.onReady) */
export function iWord() {
  return typeof Office !== 'undefined' && typeof Word !== 'undefined' && Office.context?.host === Office.HostType.Word
}

function gemIndstilling(id, data) {
  const s = Office.context.document.settings
  s.set(noegle(id), data)
  return new Promise((ok, fejl) => s.saveAsync(r => (r.status === Office.AsyncResultStatus.Succeeded ? ok() : fejl(r.error))))
}

/** Beregningen, markøren står i, eller null: { id, title, lines, subst } */
export async function valgtBeregning() {
  return Word.run(async (ctx) => {
    const cc = ctx.document.getSelection().parentContentControlOrNullObject
    cc.load('tag,title')
    await ctx.sync()
    if (cc.isNullObject || !String(cc.tag ?? '').startsWith(MAERKE + ':')) return null
    const id = cc.tag.slice(MAERKE.length + 1)
    const data = Office.context.document.settings.get(noegle(id))
    if (!data) return { id, mangler: true, title: cc.title?.replace(/^Omkreds:\s*/, '') ?? '' }
    return { id, ...data }
  })
}

// Delene sættes ind én for én i rækkefølge: overskrifter som afsnit med Words
// egne overskriftstypografier (så de kommer med i indholdsfortegnelsen og
// følger dokumentets udseende), resten som WordprocessingML.
function fyld(cc, dele) {
  for (const d of dele) {
    if (d.type === 'heading') {
      const p = cc.insertParagraph(d.text, 'End')
      p.styleBuiltIn = d.level === 2 ? 'Heading2' : 'Heading3'
    } else {
      cc.insertOoxml(ooxmlPakke(d.xml), 'End')
    }
  }
}

/**
 * Sætter beregningen ind ved markøren -- eller erstatter den, hvis den har
 * et id, der står i dokumentet. Giver id'et tilbage.
 */
export async function indsaetBeregning({ id, title, lines, subst = true }) {
  const dele = wordDele(title, lines, { subst })
  const bid = id ?? nytId()
  await Word.run(async (ctx) => {
    let cc = null
    if (id) {
      const fundne = ctx.document.contentControls.getByTag(noegle(id))
      fundne.load('items')
      await ctx.sync()
      cc = fundne.items[0] ?? null
    }
    if (!cc) {
      // Ny: i det tomme afsnit, markøren står i, ellers i et nyt afsnit efter det.
      const p = ctx.document.getSelection().paragraphs.getFirst()
      p.load('text')
      await ctx.sync()
      const maal = p.text.trim() === '' ? p : p.insertParagraph('', 'After')
      cc = maal.insertContentControl()
      cc.tag = noegle(bid)
      cc.appearance = 'BoundingBox'
    }
    cc.title = `Omkreds: ${title || 'Beregning'}`
    cc.clear()
    fyld(cc, dele)
    await ctx.sync()
    // Indholdskontrollen begynder med et tomt afsnit; det skal ikke stå over overskriften.
    const ps = cc.paragraphs
    ps.load('items/text,items/tableNestingLevel')
    await ctx.sync()
    if (ps.items.length > 1 && ps.items[0].text === '' && !ps.items[0].tableNestingLevel) ps.items[0].delete()
    await ctx.sync()
  })
  await gemIndstilling(bid, { title, lines, subst })
  return bid
}

/** Følger markøren: kaldes, når den flytter sig i dokumentet. */
export function foelgMarkoer(kald) {
  Office.context.document.addHandlerAsync(Office.EventType.DocumentSelectionChanged, () => { kald() })
}
