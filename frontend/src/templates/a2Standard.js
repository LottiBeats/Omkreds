/**
 * a2Standard.js — A2-skabelon til et nyt byggeri, bygget på standardbogen.
 *
 * Lægger "Standard — lodret og vandret lastnedføring" (lib/bogSkabeloner.js)
 * i regnearksbogen og skriver rapporten rundt om den: forudsætninger, lastover-
 * sigten, oversigten fra den lodrette lastnedføring og fordelingen af vinden
 * på de stabiliserende vægge. Visningerne peger på arkene ved navn; EditorPage
 * sætter id'erne ind (tilpasBlokke).
 */
import { BOG_SKABELONER, STANDARD_OMRAADER } from '../lib/bogSkabeloner.js'

export const standardBog = () => BOG_SKABELONER.find(s => s.key === 'standard').bog()

export function makeStandardLastnedfoeringTemplate() {
  let id = Date.now()
  const H = (text, level = 1) => ({ id: id++, type: 'heading', data: { level, text } })
  const T = (text) => ({ id: id++, type: 'text', data: { text } })
  const V = (ark, titel = '', omraade = '') => ({ id: id++, type: 'ark_visning', data: { ark, omraade, titel } })
  return [
    T('Lasterne er opgjort i projektets regnearksbog (knappen "Regneark" øverst). Arkene henviser til hinanden: ' +
      'forudsætninger → materialer → opbygninger → lastoversigt → lodret og vandret lastnedføring. Tabellerne ' +
      'herunder er levende visninger af arkene og følger med, når bogen rettes.'),
    H('Forudsætninger'),
    T('Konsekvensklasse, sne efter DS/EN 1991-1-3 DK NA og peakhastighedstrykket efter DS/EN 1991-1-4 DK NA.'),
    V('Forudsætninger'),
    H('Egenlaster og lastoversigt'),
    T('Egenlasten er opgjort lag for lag i arket Opbygninger. G_sup tæller alle lag; G_inf kun de bundne. ' +
      'Lastoversigten samler alle lasttyper med karakteristiske værdier og ψ-faktorer.'),
    V('Lastoversigt'),
    H('Lodret lastnedføring'),
    T('Lasten føres ned plan for plan: typen slås op i lastoversigten og ganges med oplandet. Hvert plans Σ ' +
      'indeholder alt ovenover. 6.10a = K_FI·1,2·G og 6.10b = K_FI·(G + 1,5·dominerende + 1,5·ψ0·øvrige).'),
    V('Lodret lastnedføring', 'Laster ved fundament', STANDARD_OMRAADER.lodret_oversigt),
    {
      id: id++, type: 'custom_calc', data: {
        title: 'Dimensionerende linjelast, ydervæg akse A', version: 2, subst: true, _result: null,
        lines: [
          '# Fra regnearket',
          'q_d = [ln_A_d] | største af 6.10a/b ved fundament',
          'q_stab = [ln_A_g_inf09] | 0,9·G_inf, stabiliserende',
        ],
      },
    },
    H('Vandret lastnedføring'),
    T('Vinden på facaderne samles i etageskiverne og fordeles på de stabiliserende vægge efter stivhed ' +
      '(I = t·L³/12) med tillæg for vridning. Væggene eftervises for væltning, og den nødvendige forankring ' +
      'bestemmes.'),
    V('Vandret lastnedføring', 'Vind på langfacaden', STANDARD_OMRAADER.vandret_y),
    V('Vandret lastnedføring', 'Vind på gavlen', STANDARD_OMRAADER.vandret_x),
    H('Forudsætninger, der skal bekræftes'),
    T('• Konsekvensklasse og bygningens anvendelse (nyttelastkategorier).\n• Opbygningernes lag og densiteter.\n' +
      '• Basisvindhastighed, terrænkategori og orografi.\n• De stabiliserende vægges placering, længde og lodrette last.'),
  ]
}
