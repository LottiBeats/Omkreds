/**
 * a2Standard.js — A2-skabelon til et nyt byggeri, bygget på standardbogen.
 *
 * Lægger "Standard — lodret og vandret lastnedføring" (lib/bogSkabeloner.js)
 * i regnearksbogen og skriver rapporten rundt om den: forudsætninger, lastover-
 * sigten, oversigten over de dimensionerende laster og fordelingen af vinden
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
    H('Opbygninger og nyttelaster'),
    T('Egenlasten er opgjort lag for lag for hver opbygning. g_k,sup tæller alle lag; g_k,inf kun de lag, der ikke ' +
      'kan fjernes. Hver opbygning har sin nyttelastkategori, sne efter taghældningen og vind på taget, regnet om ' +
      'til pr. m² vandret projektion.'),
    V('Opbygninger'),
    V('Lastoversigt'),
    H('Lodret lastnedføring'),
    T('Lasten føres ned element for element: spær og dæk giver linjelaster på bjælker og vægge, bjælker giver ' +
      'punktlaster på søjler og vægge, og væggene føres ned til fundamenterne med N, M og den plastiske ' +
      'reaktionsfordeling. Hver lasttype holdes for sig hele vejen ned; kombinationerne regnes til sidst: ' +
      '6.10a = K_FI·1,2·G og 6.10b = G + K_FI·1,5·(dominerende + Σψ0·øvrige), samt løft ved 0,9·G_inf + K_FI·1,5·W.'),
    V('Lodret lastnedføring', 'Dimensionerende laster', STANDARD_OMRAADER.lodret_oversigt),
    {
      id: id++, type: 'custom_calc', data: {
        title: 'Fundamenter — dimensionerende laster', version: 2, subst: true, _result: null,
        lines: [
          '# Fra regnearket',
          'q_d = [F1_q_d] | stribefundament under ydervæg syd, største af 6.10a/b',
          'q_stab = 0,9·[V1_q_ginf] → kN/m | 0,9·G_inf fra ydervæggen, stabiliserende',
          'N_d = [F3_N_d] | punktfundament under midterstolpen',
        ],
      },
    },
    H('Vandret lastnedføring'),
    T('Vinden på facaderne samles i tagskiven og fordeles på de stabiliserende vægge efter stivhed ' +
      '(I = t·L³/12) med tillæg for vridning. Væggene eftervises for væltning, og den nødvendige forankring ' +
      'bestemmes.'),
    V('Vandret lastnedføring', 'Vind på langfacaden', STANDARD_OMRAADER.vandret_y),
    V('Vandret lastnedføring', 'Vind på gavlen', STANDARD_OMRAADER.vandret_x),
    H('Forudsætninger, der skal bekræftes'),
    T('• Konsekvensklasse og bygningens anvendelse (nyttelastkategorier).\n• Opbygningernes lag og densiteter.\n' +
      '• Basisvindhastighed, terrænkategori og orografi, og c_pe på taget.\n' +
      '• Elementernes spænd, oplande og understøtninger.\n• De stabiliserende vægges placering, længde og lodrette last.'),
  ]
}
