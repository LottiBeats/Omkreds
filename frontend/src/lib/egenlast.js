/**
 * egenlast.js — fælles for Egenlast-blokken og de blokke, der henter G_k fra den.
 *
 * Beregningen spejler backend/egenlast.py, så blokken kan vise summen, mens
 * man skriver. Rapporten regnes stadig i backend.
 */

export const BYGNINGSDELE = [
  { value: 'tag',  label: 'Tag' },
  { value: 'daek', label: 'Dæk' },
  { value: 'vaeg', label: 'Væg' },
]

// Brugerens eget eksempel: et almindeligt tegltag med gipsloft. Udefra og ind.
export const STANDARD_OPBYGNING = [
  { type: 'fast',  beskrivelse: 'Tegltagsten', produkt: 'tegltagsten', g_kNm2: 0.50 },
  { type: 'ribbe', beskrivelse: 'Lægter 25×50 c/c 320', materiale: 'C24', b_mm: 25, h_mm: 50, cc_mm: 320 },
  { type: 'fast',  beskrivelse: 'Undertag', produkt: 'undertag', g_kNm2: 0.01 },
  { type: 'ribbe', beskrivelse: 'Spær 45×195 c/c 600', materiale: 'C24', b_mm: 45, h_mm: 195, cc_mm: 600 },
  { type: 'lag',   beskrivelse: 'Isolering 195 mm', materiale: 'glasuld', t_mm: 195 },
  { type: 'fast',  beskrivelse: 'Dampspærre', produkt: 'dampspaerre', g_kNm2: 0.01 },
  { type: 'lag',   beskrivelse: 'Gips 13 mm', materiale: 'gips', t_mm: 13 },
]

/** Slå et materiale op: {navn, gamma, kilde} eller null. */
export function slaaOp(lib, key) {
  if (!key || !lib) return null
  const en = lib.densiteter[key]
  if (en) return { navn: en.name, gamma: en.default_kNm3, kilde: en.table }
  const bv = lib.byggevarer[key]
  if (bv && bv.kind === 'densitet') return { navn: bv.name, gamma: bv.value, kilde: bv.source }
  return null
}

/** Fladelasten af ét lag [kN/m² flade]; null hvis den ikke kan regnes endnu. */
export function lagLast(l, lib) {
  const type = l.type ?? 'fast'
  if (type === 'fast') return Number(l.g_kNm2) || 0
  const m = slaaOp(lib, type === 'ribbe' ? (l.materiale || 'C24') : l.materiale)
  const gamma = l.gamma_kNm3 ?? m?.gamma
  if (gamma == null) return null
  if (type === 'lag') return gamma * (Number(l.t_mm) || 0) / 1000
  if (type === 'ribbe') {
    const b = Number(l.b_mm) || 0, h = Number(l.h_mm) || 0, cc = Number(l.cc_mm) || 0
    if (b <= 0 || h <= 0 || cc < b) return null
    return gamma * b * h / cc / 1000
  }
  return null
}

export function summer(d, lib) {
  const lag = d.lag ?? []
  const pr = lag.map(l => lagLast(l, lib))
  const g_flade = pr.reduce((s, g) => s + (g ?? 0), 0)
  const erTag = (d.bygningsdel ?? 'tag') === 'tag'
  const alpha = erTag ? (Number(d.alpha_deg) || 0) : 0
  const g_vandret = g_flade / Math.cos(alpha * Math.PI / 180)
  return { pr, g_flade, g_vandret, erTag }
}

// ── Kilder for andre blokke ─────────────────────────────────────────────────

const FELTER = {
  flade:   { enhed: 'kN/m²', tekst: (e) => e.bygningsdel === 'tag' ? 'pr. m² tagflade' : 'pr. m²' },
  vandret: { enhed: 'kN/m²', tekst: () => 'pr. m² vandret' },
  linje:   { enhed: 'kN/m',  tekst: (e) => e.bygningsdel === 'vaeg' ? 'linjelast under væggen' : 'linjelast' },
}

function felter(ex) {
  const f = ['flade']
  if (ex.bygningsdel === 'tag' && ex.alpha_deg > 0) f.push('vandret')
  if (ex.g_linje_kNm != null) f.push('linje')
  return f
}

function vaerdi(ex, felt) {
  if (felt === 'flade')   return ex.g_flade_kNm2
  if (felt === 'vandret') return ex.g_vandret_kNm2
  if (felt === 'linje')   return ex.g_linje_kNm
  return null
}

const dk = (v, n = 3) => Number(v).toFixed(n).replace('.', ',')

/**
 * Alle værdier, som regnede Egenlast-blokke i dokumentet stiller til rådighed.
 * [{ key: 'id:felt', id, felt, value, enhed, label }]
 */
export function egenlastKilder(blocks, { kunTag = false, felt: kunFelt = null } = {}) {
  const out = []
  for (const b of blocks ?? []) {
    if (b.type !== 'egenlast') continue
    const ex = b.data?._exports
    if (!ex) continue
    if (kunTag && ex.bygningsdel !== 'tag') continue
    for (const felt of felter(ex)) {
      if (kunFelt && felt !== kunFelt) continue
      const v = vaerdi(ex, felt)
      if (v == null) continue
      const F = FELTER[felt]
      out.push({
        key: `${b.id}:${felt}`, id: b.id, felt, value: v, enhed: F.enhed,
        label: `${ex.label} · ${b.data?.title ?? 'Egenlast'} — ${dk(v)} ${F.enhed} ${F.tekst(ex)}`,
      })
    }
  }
  return out
}

/** Værdien bag en gemt kilde {id, felt}; null hvis blokken er væk eller ikke regnet. */
export function hentEgenlast(blocks, kilde) {
  if (!kilde) return null
  const b = (blocks ?? []).find(x => x.id === kilde.id && x.type === 'egenlast')
  const ex = b?.data?._exports
  return ex ? vaerdi(ex, kilde.felt) : null
}

export const enhedFor = (felt) => FELTER[felt]?.enhed ?? 'kN/m²'

/**
 * Når Egenlast-blokken er regnet: de blokke, der henter fra den, og deres nye
 * data. G_k er et input i dem, så deres resultat bliver forældet af sig selv.
 */
export function afhaengige(blocks, egenBlok) {
  const ex = egenBlok.data?._exports
  if (!ex) return []
  const par = []
  for (const b of blocks ?? []) {
    if (b.id === egenBlok.id) continue
    if (b.type === 'load_combo' && b.data?.G_kilde?.id === egenBlok.id) {
      const v = vaerdi(ex, b.data.G_kilde.felt)
      if (v != null && v !== b.data.G_k) par.push([b.id, { ...b, data: { ...b.data, G_k: v } }])
    }
    if (b.type === 'frame_loads' && b.data?.g_tag_kilde?.id === egenBlok.id) {
      const v = ex.bygningsdel === 'tag' ? ex.g_flade_kNm2 : null
      if (v != null && v !== b.data.g_tag_kNm2) par.push([b.id, { ...b, data: { ...b.data, g_tag_kNm2: v } }])
    }
  }
  return par
}
