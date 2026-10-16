/**
 * importDokumenter.js — læg færdige dokumenter ind i et projekt fra en fil.
 *
 * Til sager, hvor A1, B1 osv. allerede findes som Word/PDF og er omskrevet til
 * blokke uden for appen. Filen ser sådan ud:
 *
 *   {
 *     "metadata": { "matrikel": "15ie", ... },          valgfri, kun tekst
 *     "projektbeskrivelse": { "etager": 1, ... },       valgfri: A1's beskrivelse
 *     "docs": {
 *       "A1": { "title": "Konstruktionsgrundlag", "blocks": [ ... ] },
 *       "B2": { "blocks": [ ... ] },
 *       "A2": { "subdocs": [ { "name": "Laster", "blocks": [ ... ] } ] }
 *     }
 *   }
 *
 * Et dokument i filen erstatter dokumentets egne blokke. Har det "subdocs"
 * (A2.1, A2.2 …), erstatter de dokumentets underdokumenter; ellers røres
 * underdokumenterne ikke. Dokumenter, der ikke står i filen, røres heller
 * ikke. Filen læses her og kontrolleres helt, før noget bliver ændret: en fil
 * med én fejl ændrer ingenting.
 *
 * "bog" er ark til projektets regnearksbog: { "ark": [ { "navn", "celler", … } ] }.
 * Et ark med samme navn som et eksisterende erstatter det (og beholder dets
 * id, så rapportens visninger af det virker videre); nye navne lægges til.
 * En "ark_visning"-blok i filen kan pege på et ark ved navn: { "ark": "Laster" }.
 *
 * "projektbeskrivelse" er det samme som beskrivelsen under Projektbeskrivelse
 * (metadata._doc_options): konsekvensklasse, materialer, fundering osv. Med den
 * ved A1-hjælperen og "skriv A1 forfra", hvad det er for en sag.
 */
import { DOC_TITLES } from '../templates/docs.js'
import { bogAf, medArk, nyArkId } from './regnearksbog.js'

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
  const blokFejl = (sted, blocks) => {
    for (const [i, b] of blocks.entries()) {
      if (!erObjekt(b) || typeof b.type !== 'string' || !erObjekt(b.data)) {
        return `${sted}, blok ${i + 1}: en blok skal have "type" og "data".`
      }
    }
    return null
  }
  for (const [docId, d] of Object.entries(fil.docs)) {
    if (!(docId in DOC_TITLES)) return { ok: false, fejl: `"${docId}" er ikke et dokument i projektet.` }
    if (!erObjekt(d)) return { ok: false, fejl: `${docId} mangler en liste med blokke.` }
    if (d.subdocs !== undefined) {
      if (!Array.isArray(d.subdocs)) return { ok: false, fejl: `${docId}: "subdocs" skal være en liste.` }
      for (const [j, sd] of d.subdocs.entries()) {
        const sted = `${docId}.${j + 1}`
        if (!erObjekt(sd) || typeof sd.name !== 'string' || !Array.isArray(sd.blocks)) {
          return { ok: false, fejl: `${sted}: et underdokument skal have "name" og en liste med blokke.` }
        }
        const f = blokFejl(sted, sd.blocks)
        if (f) return { ok: false, fejl: f }
      }
    }
    if (!Array.isArray(d.blocks) && d.subdocs === undefined) return { ok: false, fejl: `${docId} mangler en liste med blokke.` }
    const f = Array.isArray(d.blocks) ? blokFejl(docId, d.blocks) : null
    if (f) return { ok: false, fejl: f }
    if (d.title !== undefined && typeof d.title !== 'string') {
      return { ok: false, fejl: `${docId}: titlen skal være tekst.` }
    }
    docs[docId] = d
  }
  let ark = null
  if (fil.bog !== undefined) {
    if (!erObjekt(fil.bog) || !Array.isArray(fil.bog.ark)) return { ok: false, fejl: '"bog" skal have en liste "ark".' }
    const navne = new Set()
    for (const [i, a] of fil.bog.ark.entries()) {
      const sted = `Regneark ${i + 1}`
      if (!erObjekt(a) || typeof a.navn !== 'string' || !a.navn.trim()) return { ok: false, fejl: `${sted}: et ark skal have et "navn".` }
      if (navne.has(a.navn.trim().toLowerCase())) return { ok: false, fejl: `To ark i filen hedder "${a.navn}".` }
      navne.add(a.navn.trim().toLowerCase())
      if (!Array.isArray(a.celler) || !a.celler.every(r => Array.isArray(r) && r.every(c => typeof c === 'string'))) {
        return { ok: false, fejl: `Arket "${a.navn}": "celler" skal være en liste af rækker med tekst.` }
      }
    }
    ark = fil.bog.ark
  }
  if (Object.keys(docs).length === 0 && !ark?.length) return { ok: false, fejl: 'Filen indeholder ingen dokumenter.' }

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
  let beskrivelse = null
  if (fil.projektbeskrivelse !== undefined) {
    if (!erObjekt(fil.projektbeskrivelse)) return { ok: false, fejl: '"projektbeskrivelse" skal være et objekt.' }
    beskrivelse = fil.projektbeskrivelse
  }
  return { ok: true, metadata, docs, beskrivelse, ark }
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

  // Arkene først, så visningerne kan slå navnene op.
  let bog = bogAf(project)
  if (imp.ark?.length) {
    const ark = [...bog.ark]
    for (const a of imp.ark) {
      const i = ark.findIndex(x => x.navn.trim().toLowerCase() === a.navn.trim().toLowerCase())
      const nyt = { titel: '', overskrift: true, bredder: [], dec: {}, fed: {}, ...a, navn: a.navn.trim(), id: i >= 0 ? ark[i].id : nyArkId() }
      if (i >= 0) ark[i] = nyt; else ark.push(nyt)
    }
    bog = medArk(bog, ark)
  }
  const arkId = (v) => bog.ark.find(a => a.id === v)?.id ?? bog.ark.find(a => a.navn.toLowerCase() === String(v ?? '').trim().toLowerCase())?.id ?? v

  const medId = (bs) => bs.map(b => {
    let id = b.id
    if (id === undefined || id === null || brugt.has(id)) id = naeste++
    brugt.add(id)
    return b.type === 'ark_visning' ? { ...b, id, data: { ...b.data, ark: arkId(b.data.ark) } } : { ...b, id }
  })
  for (const [docId, d] of Object.entries(imp.docs)) {
    const eksisterende = documents[docId] ?? { title: DOC_TITLES[docId], blocks: [], subdocs: [] }
    documents[docId] = {
      ...eksisterende,
      ...(d.title ? { title: d.title } : {}),
      ...(Array.isArray(d.blocks) ? { blocks: medId(d.blocks) } : {}),
      ...(Array.isArray(d.subdocs) ? { subdocs: d.subdocs.map(sd => ({ name: sd.name, blocks: medId(sd.blocks) })) } : {}),
    }
  }
  const metadata = { ...(project.metadata ?? {}), ...imp.metadata }
  if (imp.beskrivelse) metadata._doc_options = imp.beskrivelse
  return { ...project, metadata, documents, ...(imp.ark?.length ? { bog } : {}) }
}

/** "A1 (231 blokke), B2 (36 blokke)" til bekræftelsen. */
export function beskrivImport(imp) {
  return Object.keys(imp.docs).sort().flatMap(id => {
    const d = imp.docs[id]
    return [
      ...(Array.isArray(d.blocks) ? [`${id} (${d.blocks.length} blokke)`] : []),
      ...(d.subdocs ?? []).map((sd, j) => `${id}.${j + 1} ${sd.name} (${sd.blocks.length} blokke)`),
    ]
  }).concat(imp.ark?.length ? [`regnearksbogen (${imp.ark.length} ark)`] : []).join(', ')
}
