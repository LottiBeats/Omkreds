/**
 * importDokumenter.js — læg færdige dokumenter ind i et projekt fra en fil.
 *
 * Til sager, hvor A1, B1 osv. allerede findes som Word/PDF og er omskrevet til
 * blokke uden for appen. Filen ser sådan ud:
 *
 *   {
 *     "metadata": { "matrikel": "15ie", ... },          valgfri, kun tekst
 *     "docs": {
 *       "A1": { "title": "Konstruktionsgrundlag", "blocks": [ ... ] },
 *       "B2": { "blocks": [ ... ] }
 *     }
 *   }
 *
 * Et dokument i filen erstatter dokumentets egne blokke. Underdokumenter
 * (A2.2 osv.) røres ikke, og dokumenter, der ikke står i filen, røres heller
 * ikke. Filen læses her og kontrolleres helt, før noget bliver ændret: en fil
 * med én fejl ændrer ingenting.
 */
import { DOC_TITLES } from '../templates/docs.js'

const erObjekt = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/**
 * Læs og kontrollér en importfil.
 * @returns {{ ok: true, metadata: object, docs: object } | { ok: false, fejl: string }}
 */
export function laesImport(tekst) {
  let fil
  try { fil = JSON.parse(tekst) } catch { return { ok: false, fejl: 'Filen er ikke gyldig JSON.' } }
  if (!erObjekt(fil) || !erObjekt(fil.docs)) {
    return { ok: false, fejl: 'Filen mangler "docs" med de dokumenter, der skal importeres.' }
  }

  const docs = {}
  for (const [docId, d] of Object.entries(fil.docs)) {
    if (!(docId in DOC_TITLES)) return { ok: false, fejl: `"${docId}" er ikke et dokument i projektet.` }
    if (!erObjekt(d) || !Array.isArray(d.blocks)) return { ok: false, fejl: `${docId} mangler en liste med blokke.` }
    for (const [i, b] of d.blocks.entries()) {
      if (!erObjekt(b) || typeof b.type !== 'string' || !erObjekt(b.data)) {
        return { ok: false, fejl: `${docId}, blok ${i + 1}: en blok skal have "type" og "data".` }
      }
    }
    if (d.title !== undefined && typeof d.title !== 'string') {
      return { ok: false, fejl: `${docId}: titlen skal være tekst.` }
    }
    docs[docId] = d
  }
  if (Object.keys(docs).length === 0) return { ok: false, fejl: 'Filen indeholder ingen dokumenter.' }

  // Kun tekstfelter, og ingen interne felter (_rev, _doc_options …): de hører
  // til projektet, ikke til et dokument, der flyttes ind udefra.
  const metadata = {}
  if (fil.metadata !== undefined) {
    if (!erObjekt(fil.metadata)) return { ok: false, fejl: '"metadata" skal være et objekt.' }
    for (const [k, v] of Object.entries(fil.metadata)) {
      if (k.startsWith('_') || typeof v !== 'string') continue
      metadata[k] = v
    }
  }
  return { ok: true, metadata, docs }
}

/**
 * Projektet med de importerede dokumenter lagt ind. Blokke uden id får et,
 * og et id, der allerede er brugt i filen, får et nyt -- to blokke med samme
 * id ville flytte og slette hinanden i editoren.
 */
export function anvendImport(project, imp, nu = Date.now()) {
  let naeste = nu
  const brugt = new Set()
  const documents = { ...project.documents }
  for (const [docId, d] of Object.entries(imp.docs)) {
    const blocks = d.blocks.map(b => {
      let id = b.id
      if (id === undefined || id === null || brugt.has(id)) id = naeste++
      brugt.add(id)
      return { ...b, id }
    })
    const eksisterende = documents[docId] ?? { title: DOC_TITLES[docId], subdocs: [] }
    documents[docId] = { ...eksisterende, ...(d.title ? { title: d.title } : {}), blocks }
  }
  return { ...project, metadata: { ...(project.metadata ?? {}), ...imp.metadata }, documents }
}

/** "A1 (231 blokke), B2 (36 blokke)" til bekræftelsen. */
export function beskrivImport(imp) {
  return Object.keys(imp.docs).sort()
    .map(id => `${id} (${imp.docs[id].blocks.length} blokke)`).join(', ')
}
