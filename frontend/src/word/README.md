# Omkreds-beregning i Word

Et Word-tilføjelsesprogram (Office add-in) med "Egen beregning" fra Omkreds.
Linjerne regnes af `lib/calcEngine.js` med enheder, og "Indsæt i dokumentet"
sætter beregningen ind som overskrifter og Word-ligninger (`lib/calcWord.js`).

- Panelet: `frontend/word.html` → `src/word/` (bygges sammen med appen og ligger på https://omkreds.dk/word.html)
- Manifestet: `frontend/public/word/manifest.xml` (https://omkreds.dk/word/manifest.xml)

## Installér i Word

**Én bruger (Word til Windows eller Mac, Microsoft 365):**
Hent `manifest.xml`, og læg den i en delt mappe, som Word stoler på
(Filer → Indstillinger → Sikkerhedscenter → Indstillinger for Sikkerhedscenter →
Kataloger over tilføjelsesprogrammer → tilføj mappen som netværkssti, og sæt
flueben i "Vis i menu"). Genstart Word, og vælg Hjem → Tilføjelsesprogrammer →
Avanceret → Delt mappe → Omkreds-beregning.

**Word på nettet:** Hjem → Tilføjelsesprogrammer → Flere indstillinger →
Mine tilføjelsesprogrammer → Upload mit tilføjelsesprogram → vælg `manifest.xml`.

**Hele firmaet:** En Microsoft 365-administrator kan udrulle manifestet centralt
(Microsoft 365 Admin Center → Indstillinger → Integrerede apps → Upload brugerdefinerede apps).

Herefter ligger knappen **Beregning** i gruppen **Omkreds** under fanen Hjem.

## Sådan virker det

- En indsat beregning ligger i en indholdskontrol mærket `omkreds-calc:<id>`.
  Linjerne gemmes i dokumentets indstillinger under samme nøgle.
- Sættes markøren i en indsat beregning, tilbyder panelet at åbne den igen;
  "Opdater i dokumentet" erstatter den, hvor den står.
- Overskrifter får Words egne typografier (Overskrift 2/3) og følger dokumentet.
