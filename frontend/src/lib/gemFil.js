/**
 * gemFil.js — en fil fra appen til brugerens computer (PDF, Word, Excel, JSON).
 *
 * I browseren hentes den som en download. I skrivebordsprogrammet (Tauri,
 * desktop/) virker en download ikke pålideligt i vinduet, så dér spørger
 * Windows' egen gem-dialog, hvor filen skal ligge -- som FEM-programmet gør
 * med sine modeller (lib/femFile.js).
 *
 * Returnerer filnavnet, eller null, hvis brugeren fortrød i dialogen.
 */
const tauri = () => (typeof window !== 'undefined' ? window.__TAURI__ : null)

const TYPER = { pdf: 'PDF', docx: 'Word-dokument', xlsx: 'Excel-projektmappe', json: 'JSON', zip: 'ZIP-arkiv', csv: 'CSV' }

export async function gemFil(blob, navn) {
  const T = tauri()
  if (T?.dialog?.save && T?.fs?.writeFile) {
    const ext = String(navn).split('.').pop().toLowerCase()
    const sti = await T.dialog.save({
      defaultPath: navn,
      filters: TYPER[ext] ? [{ name: TYPER[ext], extensions: [ext] }] : [],
    })
    if (!sti) return null
    await T.fs.writeFile(sti, new Uint8Array(await blob.arrayBuffer()))
    return String(sti).split(/[\\/]/).pop()
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = navn
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return navn
}
