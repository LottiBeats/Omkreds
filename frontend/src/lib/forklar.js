/**
 * forklar.js — hvad en celle i regnearksbogen er, og hvad den regner.
 *
 * En celle får en etiket ud fra arket selv, som man læser et ingeniørark:
 * rækkens tekst (fx "Væg tekøkken/soveværelse") og overskriften over
 * kolonnen (fx "R = F·h/L [kN]"). En formel vises med tal i stedet for
 * henvisninger, og hver henvisning med sin etiket og værdi:
 *
 *   R_d = 1,5R − 0,9·G/2 [kN] · Væg tekøkken/soveværelse = 15,25
 *     =1,5*I20-0,9*H20/2   →   = 1,5·11,58 − 0,9·4,73/2
 *     I20  11,58  R = F·h/L [kN] · Væg tekøkken/soveværelse
 *
 * Funktionerne er rene, så de kan testes for sig.
 */
import { erstatHenvisninger, formatVaerdi, erFejl, adresse, kolNavn, oversaet, arkPrefiks } from './regneark.js'
import { raekkeTyper, celleArt } from './regnearksbog.js'

const tekstIn = (v) => (v === undefined || v === null ? '' : String(v))

/** Viste tekster, fed og art for et helt ark (til etiketter). */
function arkInfo(ark, vaerdier) {
  const celler = ark.celler ?? []
  const vist = celler.map((r, i) => r.map((_, k) => formatVaerdi(vaerdier?.[i]?.[k], ark.dec?.[adresse(i, k)] ?? ark.dec?.[kolNavn(k)] ?? null)))
  const fed = celler.map((r, i) => r.map((_, k) => !!ark.fed?.[adresse(i, k)]))
  const art = celler.map(r => r.map(celleArt))
  return { vist, typer: raekkeTyper(vist, fed, art, ark.overskrift !== false), art }
}

/** Etiketten for cellen (r, k): { raekke, kolonne, tekst }. */
export function etiket(ark, vaerdier, r, k, info = arkInfo(ark, vaerdier)) {
  const { vist, typer, art } = info
  // Rækkens tekst: de første tekster i rækken (fx "Kipbjælke V2, gavl").
  const tekster = []
  for (let j = 0; j < k && tekster.length < 2; j++) {
    const t = tekstIn(vist[r]?.[j]).trim()
    if (t && art[r]?.[j] === 't') tekster.push(t)
  }
  let raekke = tekster.join(', ')
  // Kolonnens overskrift: den nærmeste overskriftsrække over cellen ("Værdi" o.l. siger intet).
  let kolonne = ''
  for (let i = r - 1; i >= 0; i--) {
    if (typer[i] === 'hoved') { kolonne = tekstIn(vist[i]?.[k]).trim(); break }
  }
  if (/^(værdi|value|resultat)$/i.test(kolonne)) kolonne = ''
  // Sektionen over rækken (fx "KIPBJÆLKE, V1 PLANTERUM") giver sammenhængen.
  let sektion = ''
  for (let i = r - 1; i >= 0; i--) if (typer[i] === 'sektion') { sektion = tekstIn(vist[i][0]).trim(); break }
  if (!raekke) { raekke = sektion; sektion = '' }
  const dele = [kolonne, raekke, sektion].filter(Boolean)
  return { raekke, kolonne, sektion, tekst: dele.join(' · ') }
}

/**
 * Forklaringen af cellen: { adresse, etiket, art: 'formel'|'inddata'|'tekst'|'tom',
 * vaerdi, formel, medTal, henvisninger: [{ tekst, ark, r, k, vaerdi, etiket, omraade }] }
 * vaerdierAlle: regnBog-resultatet for hele bogen ({ [arknavn]: værdier }).
 */
export function forklar(bog, ark, r, k, vaerdierAlle) {
  const infoFor = new Map()
  const info = (a) => {
    if (!infoFor.has(a.id)) infoFor.set(a.id, arkInfo(a, vaerdierAlle[a.navn]))
    return infoFor.get(a.id)
  }
  const fmt = (a, rr, kk) => formatVaerdi(vaerdierAlle[a.navn]?.[rr]?.[kk], a.dec?.[adresse(rr, kk)] ?? a.dec?.[kolNavn(kk)] ?? null)
  const raw = tekstIn(ark.celler?.[r]?.[k])
  const art = celleArt(raw)
  const ud = {
    adresse: adresse(r, k), etiket: etiket(ark, vaerdierAlle[ark.navn], r, k, info(ark)).tekst,
    art: art === 'f' ? 'formel' : art === 'i' ? 'inddata' : art === 't' ? 'tekst' : 'tom',
    vaerdi: fmt(ark, r, k), fejl: erFejl(vaerdierAlle[ark.navn]?.[r]?.[k]), formel: art === 'f' ? raw : null,
    medTal: null, henvisninger: [],
  }
  if (art !== 'f') return ud
  const findArk = (navn) => (navn ? bog.ark.find(a => a.navn.trim().toLowerCase() === navn.trim().toLowerCase()) : ark)
  const set = new Set()
  ud.medTal = erstatHenvisninger(raw, ({ ark: an, fra, til }) => {
    const a = findArk(an)
    if (!a) return '#REF!'
    if (til) return null
    return fmt(a, fra.r, fra.k) || '0'
  }).replace(/^=/, '= ').replace(/\*/g, '·').replace(/;/g, '; ').replace(/-/g, '−')
    .replace(/([\d)%])\s*([+−])\s*/g, '$1 $2 ').replace(/\s+/g, ' ')
  for (const ref of oversaet(raw.trim().slice(1)).refs) {
    const a = findArk(ref.ark)
    const tekst = `${ref.ark ? arkPrefiks(a?.navn ?? ref.ark) : ''}${adresse(ref.fra.r, ref.fra.k)}${ref.til ? ':' + adresse(ref.til.r, ref.til.k) : ''}`
    if (set.has(tekst)) continue
    set.add(tekst)
    if (!a) { ud.henvisninger.push({ tekst, ark: null, etiket: 'arket findes ikke', vaerdi: '#REF!' }); continue }
    const e = etiket(a, vaerdierAlle[a.navn], ref.fra.r, ref.fra.k, info(a))
    ud.henvisninger.push({
      tekst, ark: a.navn, r: ref.fra.r, k: ref.fra.k, omraade: !!ref.til,
      vaerdi: ref.til ? '' : fmt(a, ref.fra.r, ref.fra.k),
      etiket: ref.til ? (e.kolonne || e.raekke || 'område') : e.tekst,
    })
  }
  return ud
}

/** Celler i hele bogen, der bruger cellen (arkNavn, r, k): [{ ark, r, k, tekst, etiket, vaerdi }]. */
export function brugtAf(bog, arkNavn, r, k, vaerdierAlle) {
  const ud = []
  const navn = arkNavn.trim().toLowerCase()
  for (const a of bog.ark) {
    let info = null
    ;(a.celler ?? []).forEach((raek, rr) => raek.forEach((c, kk) => {
      if (typeof c !== 'string' || !c.trim().startsWith('=')) return
      for (const ref of oversaet(c.trim().slice(1)).refs) {
        if ((ref.ark ?? a.navn).trim().toLowerCase() !== navn) continue
        const til = ref.til ?? ref.fra
        if (r >= Math.min(ref.fra.r, til.r) && r <= Math.max(ref.fra.r, til.r) && k >= Math.min(ref.fra.k, til.k) && k <= Math.max(ref.fra.k, til.k)) {
          info = info ?? arkInfo(a, vaerdierAlle[a.navn])
          ud.push({
            ark: a.navn, r: rr, k: kk, tekst: `${a.navn.trim().toLowerCase() === navn ? '' : arkPrefiks(a.navn)}${adresse(rr, kk)}`,
            etiket: etiket(a, vaerdierAlle[a.navn], rr, kk, info).tekst,
            vaerdi: formatVaerdi(vaerdierAlle[a.navn]?.[rr]?.[kk], a.dec?.[adresse(rr, kk)] ?? a.dec?.[kolNavn(kk)] ?? null),
          })
          break
        }
      }
    }))
  }
  return ud
}
