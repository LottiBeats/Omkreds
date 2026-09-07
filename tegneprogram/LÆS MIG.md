# Tegneprogrammet

Et SVG-baseret tegneværktøj, der kører helt i browseren. Ingen byggetrin: de
filer, der ligger her, er dem browseren henter.

Serveres på `https://omkreds.dk/tegning/`, bag samme login som resten af appen —
se `deploy/nginx-tegning.conf` og `/auth/gate` i `backend/main.py`.

## Hvad der ligger her

    index.html                                  siden selv
    script.js                                   hele programmet
    styles.css
    vendor/svg2pdf.umd.min.js                   SVG → PDF
    component-library/…/simpson/geometry.packed.js
                                                beslaggeometri, pakket
    tools/suppliers/…                           det, der genererer den pakkede fil

`index.html` henter derudover jsPDF og pdf.js fra cdnjs. De ligger ikke her.

## Hvad der bevidst IKKE er med

Kildemappen (`Downloads/Tegne program`) fylder 195 MB. Under 1 % af det er
programmet. Resten er ikke taget med, og det er ikke en forglemmelse:

**De rå Simpson-filer** — 95 MB DXF, JSON og zip under
`component-library/manufacturers/simpson/`. Programmet rører dem ikke; det
læser kun den pakkede `geometry.packed.js` på 574 KB. At lægge en producents
CAD-bibliotek ud på en offentlig adresse er desuden en anden slags beslutning
end at udgive sit eget program, og den er ikke truffet her. Filerne bliver
liggende lokalt og bruges af `tools/suppliers/simpson/build_library.py`, når
den pakkede fil skal laves om.

**PDF'erne** — 102 MB. To eksporttests (`omkreds-tegning (1).pdf` og `(4).pdf`)
og de to preview-PNG'er er arbejdsspor, ikke en del af programmet. Den tredje,
`pdfcoffee.com_structural-detailing-…`, er en indscannet lærebog med
ophavsret. Den skal ikke ligge på en webserver.

**`.backup-pre-improvement/`** — en ældre kopi af de tre hovedfiler. Git er
stedet for den slags nu.

## Når filerne ændres

Der er ingen byggeproces. Kopiér den ændrede fil herind, commit, og kør
`bash deploy/push.sh`. Serveren henter dem med `git pull`, og nginx serverer
dem direkte fra checkouten — der er ingen `dist` at bygge og intet at genstarte.

Skal `geometry.packed.js` laves om, kræver det de rå DXF-filer, som altså ikke
ligger i repoet:

    python tools/suppliers/simpson/build_library.py     # mod den lokale mappe
    python tools/suppliers/verify-packed.py
