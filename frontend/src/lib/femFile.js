/**
 * femFile.js — FEM-modeller som filer på computeren (.omkfem)
 *
 * En model er det samme som et dokument i omkreds.dk: en liste af blokke
 * (rammeberegning, laster, kombinationer, eftervisninger, tekst) plus lidt
 * sagsinformation til PDF'ens sidehoved. Filen er JSON, så den kan åbnes igen
 * her og senere importeres i et projekt på omkreds.dk.
 *
 * Tre måder at gemme på, i den rækkefølge de prøves:
 *   1. Tauri (skrivebordsprogrammet): native gem/åbn-dialog via window.__TAURI__
 *   2. File System Access API (Chrome/Edge/WebView2): rigtig "Gem" til samme fil
 *   3. Ellers: download og <input type=file>
 */

export const FORMAT = 'omkreds-fem'
export const VERSION = 1
export const FILTYPE = 'omkfem'

export function lavModel(metadata, blocks) {
  return { format: FORMAT, version: VERSION, gemt: new Date().toISOString(), metadata, blocks }
}

export function laesModel(tekst) {
  let m
  try {
    m = JSON.parse(tekst)
  } catch {
    throw new Error('Filen er ikke en Omkreds FEM-model (ikke gyldig JSON).')
  }
  if (m?.format !== FORMAT || !Array.isArray(m.blocks))
    throw new Error('Filen er ikke en Omkreds FEM-model.')
  if ((m.version ?? 1) > VERSION)
    throw new Error('Filen er gemt med en nyere version af programmet. Opdatér programmet for at åbne den.')
  return { metadata: m.metadata ?? {}, blocks: m.blocks }
}

const tauri = () => (typeof window !== 'undefined' ? window.__TAURI__ : null)
const harFsa = () => typeof window !== 'undefined' && 'showSaveFilePicker' in window

const FSA_TYPES = [{ description: 'Omkreds FEM-model', accept: { 'application/json': [`.${FILTYPE}`] } }]

/**
 * Gem. `handle` er den fil, modellen sidst blev gemt til eller åbnet fra
 * (sti i Tauri, FileSystemFileHandle i browseren); null = "Gem som".
 * Returnerer { handle, navn } eller null, hvis brugeren fortrød.
 */
export async function gem(model, handle, forslag = 'Model') {
  const tekst = JSON.stringify(model, null, 1)
  const T = tauri()
  if (T) {
    let sti = handle
    if (!sti) {
      sti = await T.dialog.save({
        defaultPath: `${forslag}.${FILTYPE}`,
        filters: [{ name: 'Omkreds FEM-model', extensions: [FILTYPE] }],
      })
      if (!sti) return null
    }
    await T.fs.writeTextFile(sti, tekst)
    return { handle: sti, navn: filnavn(sti) }
  }
  if (harFsa()) {
    let h = handle
    if (!h) {
      try {
        h = await window.showSaveFilePicker({ suggestedName: `${forslag}.${FILTYPE}`, types: FSA_TYPES })
      } catch (e) {
        if (e?.name === 'AbortError') return null
        throw e
      }
    }
    const w = await h.createWritable()
    await w.write(tekst)
    await w.close()
    return { handle: h, navn: h.name }
  }
  download(new Blob([tekst], { type: 'application/json' }), `${forslag}.${FILTYPE}`)
  return { handle: null, navn: `${forslag}.${FILTYPE}` }
}

/** Åbn. Returnerer { model, handle, navn } eller null, hvis brugeren fortrød. */
export async function aabn() {
  const T = tauri()
  if (T) {
    const sti = await T.dialog.open({
      multiple: false,
      filters: [{ name: 'Omkreds FEM-model', extensions: [FILTYPE, 'json'] }],
    })
    if (!sti) return null
    const tekst = await T.fs.readTextFile(sti)
    return { model: laesModel(tekst), handle: sti, navn: filnavn(sti) }
  }
  if ('showOpenFilePicker' in window) {
    let h
    try {
      ;[h] = await window.showOpenFilePicker({ types: FSA_TYPES, multiple: false })
    } catch (e) {
      if (e?.name === 'AbortError') return null
      throw e
    }
    const f = await h.getFile()
    return { model: laesModel(await f.text()), handle: h, navn: h.name }
  }
  const f = await vaelgFil(`.${FILTYPE},.json`)
  if (!f) return null
  return { model: laesModel(await f.text()), handle: null, navn: f.name }
}

/** Gem en PDF (Blob). */
export async function gemPdf(blob, forslag = 'Rammeberegning') {
  const T = tauri()
  if (T) {
    const sti = await T.dialog.save({
      defaultPath: `${forslag}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })
    if (!sti) return null
    await T.fs.writeFile(sti, new Uint8Array(await blob.arrayBuffer()))
    return sti
  }
  download(blob, `${forslag}.pdf`)
  return `${forslag}.pdf`
}

function filnavn(sti) {
  return String(sti).split(/[\\/]/).pop()
}

function download(blob, navn) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = navn
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function vaelgFil(accept) {
  return new Promise(resolve => {
    const inp = document.createElement('input')
    inp.type = 'file'
    inp.accept = accept
    inp.onchange = () => resolve(inp.files?.[0] ?? null)
    inp.click()
  })
}
