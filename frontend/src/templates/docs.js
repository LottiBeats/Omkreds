/**
 * docs.js — the DS 1140 / BR18 document set
 *
 * One definition, used by the editor sidebar, the document list block and the
 * templates. Kept separate so nothing has to import EditorPage to know what a
 * project consists of.
 *
 * Names are the official ones from BR18 §§ 494-505.
 */
export const DOC_TITLES = {
  A1: 'Konstruktionsgrundlag',
  A2: 'Statiske beregninger',
  A3: 'Konstruktionstegninger og modeller',
  A4: 'Konstruktionsændringer',
  A5: 'Konstruktion som udført',
  B1: 'Statisk projektredegørelse',
  B2: 'Statisk kontrolplan',
  B3: 'Statisk kontrolrapport',
}

/** Short names for the rail, where the full BR18 name doesn't fit. */
export const DOC_SHORT = {
  A1: 'Konstruktionsgrundlag',
  A2: 'Statiske beregninger',
  A3: 'Tegninger og modeller',
  A4: 'Konstruktionsændringer',
  A5: 'Som udført',
  B1: 'Projektredegørelse',
  B2: 'Kontrolplan',
  B3: 'Kontrolrapport',
}

/**
 * The documents grouped by when in the job they are written.
 *
 * `later` groups belong to the construction phase. They start collapsed in
 * the editor, and open by themselves once one of their documents has content.
 */
export const DOC_PHASES = [
  { key: 'projektering', label: 'Projektering', docs: ['A1', 'A2', 'A3'] },
  { key: 'kontrol',      label: 'Kontrol',      docs: ['B1', 'B2'] },
  { key: 'udfoerelse',   label: 'Udførelse',    docs: ['A4', 'A5', 'B3'], later: true },
]

export const DOC_IDS = DOC_PHASES.flatMap(p => p.docs)
