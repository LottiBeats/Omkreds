/**
 * a2Regnearksbog.js — A2-skabelon bygget på projektets regnearksbog.
 *
 * Skabelonen lægger arkene fra "Træhus med sadeltag" (lib/bogSkabeloner.js)
 * i bogen og skriver rapporten rundt om dem: visninger af arkene, en Egen
 * beregning og en træbjælke, der henter kipbjælkens laster fra arket
 * (data._links, lib/koblinger.js). Visningerne peger på arkene ved navn;
 * EditorPage sætter id'erne ind, når skabelonen bruges (tilpasBlokke).
 */
import { BOG_SKABELONER } from '../lib/bogSkabeloner.js'

export const traehusBog = () => BOG_SKABELONER.find(s => s.key === 'traehus').bog()

export function makeTraehusRegnearkTemplate() {
  let id = Date.now()
  const H = (text, level = 1) => ({ id: id++, type: 'heading', data: { level, text } })
  const T = (text) => ({ id: id++, type: 'text', data: { text } })
  const V = (ark, titel = '', omraade = '') => ({ id: id++, type: 'ark_visning', data: { ark, omraade, titel } })
  return [
    T('Lasterne er opgjort i projektets regnearksbog (knappen "Regneark" øverst): opbygninger → laster → ' +
      'lastnedføring → stabilitet → fundament. Arkene henviser til hinanden, og tabellerne herunder er levende ' +
      'visninger af dem. Rettes en opbygning, en vindlast eller et mål i bogen, følger rapporten og de koblede ' +
      'beregninger med.'),
    H('Opbygninger og egenlast'),
    T('Egenlasten er opgjort lag for lag. G sup tæller alle lag; G inf kun de bundne, der ikke kan fjernes.'),
    V('Opbygninger'),
    H('Sne og vind'),
    T('Sne efter DS/EN 1991-1-3 DK NA. Peakhastighedstryk og formfaktorer indtastes fra vindberegningen.'),
    V('Laster'),
    H('Lodret lastnedføring'),
    T('Spær bærer fra remmen til kipbjælken, remmen får B/4 + udhæng og kipbjælken B/2 plus egenvægt. ' +
      'Kipbjælkens reaktion er punktlasten i kip på gavlrammerne.'),
    V('Lastnedføring'),
    H('Kipbjælke'),
    {
      id: id++, type: 'custom_calc', data: {
        title: 'Kipbjælke — snitkræfter', version: 2, subst: true, _result: null,
        lines: [
          '# Laster fra regnearket',
          'L = [kip_L] | spænd, gavl–gavl',
          'q_d = [kip_q_d] | 6.10b, sne dominerende',
          'M_Ed = q_d·L²/8 → kNm | moment midt i spændet',
          'V_Ed = q_d·L/2 → kN | forskydning ved understøtning',
        ],
      },
    },
    {
      id: id++, type: 'timber_beam', data: {
        title: 'Kipbjælke', label: 'K1', span_m: 8.0, b_mm: 140, h_mm: 405, g_k_kNm: 4.0, q_k_kNm: 1.2,
        timber_grade: 'GL28H', service_class: 1, load_duration: 'short', gamma_M: null,
        compression_edge_restrained: true, torsional_restraint_at_supports: true, _result: null,
        // Spænd og laster hentes fra regnearket og følger med, når det ændres.
        _links: { span_m: 'kip_L', g_k_kNm: 'kip_g_sup', q_k_kNm: 'kip_s' },
      },
    },
    H('Stabilitet nord–syd'),
    T('Vinden på husets nord- og sydfacade føres gennem tagskiven til de stabiliserende linjer efter opland: ' +
      'gavlrammerne og den indvendige væg. Væggen eftervises for væltning; rammernes last føres til fundamentet.'),
    V('Stabilitet N-S'),
    H('Fundament under gavlrammen'),
    V('Fundament'),
    {
      id: id++, type: 'custom_calc', data: {
        title: 'Fundament — udnyttelse', version: 2, subst: true, _result: null,
        lines: ['eta_d = [fund_eta_draenet] | drænet bæreevne', 'eta_u = [fund_eta_udraenet] | udrænet bæreevne', 'eta_d ≤ 1', 'eta_u ≤ 1'],
      },
    },
    H('Forudsætninger, der skal bekræftes'),
    T('• Konsekvensklasse CC2.\n• Opbygningernes lag og densiteter.\n• Vindens peakhastighedstryk og formfaktorer.\n' +
      '• Jordbund: moræneler med c_u,k = 80 kPa og φ\'_k = 30° er antaget; værdierne erstattes af den geotekniske rapports.'),
  ]
}
