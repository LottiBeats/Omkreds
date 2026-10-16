/**
 * robusthed.js — A1 afsnit 4.5 Robusthed.
 *
 * Normgrundlaget er DS/EN 1990 DK NA:2024, anneks E1:
 *   (4) CC1: der gøres ikke rede for robusthed.
 *       CC2: robustheden vurderes efter samme principper som (6), og
 *            foranstaltningerne til sikring af robusthed beskrives.
 *       CC3: robustheden dokumenteres i en teknisk-faglig redegørelse (6).
 *   (7) acceptabelt kollapsomfang ved 'bortfald af element' (CC3).
 *   (9) ekstra sikkerhed på nøgleelementer: γM × 1,2.
 *
 * Hver variant skriver afsnittets blokke ud fra projektbeskrivelsen (o) og
 * svarene i hjælperen (svar). Et nyt A1 får den variant, der passer til
 * sagen; hjælperen kan vælge en anden.
 */
import { ogListe } from '../a1.js'

const T = (text) => ({ type: 'text', data: { text } })

const DK_NA = 'DS/EN 1990 DK NA, anneks E1'

const METODER = [
  { key: 'bortfald',  label: 'Bortfald af element — konstruktionen forbliver stabil' },
  { key: 'ekstra',    label: 'Ekstra sikkerhed på nøgleelementer (γM × 1,2)' },
  { key: 'foelsomhed', label: 'Nøgleelementer kun lidt følsomme over for utilsigtede påvirkninger' },
]

function metodeTekst(metode, cc) {
  switch (metode) {
    case 'ekstra':
      return `Robustheden sikres ved ekstra sikkerhed på nøgleelementerne: de dimensioneres med en materialepartialkoefficient γM forøget med faktoren 1,2 iht. ${DK_NA} (9).`
    case 'foelsomhed':
      return 'Robustheden sikres ved, at nøgleelementerne udformes, så de kun er lidt følsomme over for utilsigtede påvirkninger og defekter, fx uforudsete lastvirkninger, imperfektioner og sætninger.'
    default:
      return `Robustheden eftervises ved bortfald af element: det vises, at den beskadigede konstruktion stadig udgør et stabilt system, når en dækkonstruktion og en vilkårlig søjle eller et vilkårligt 3 m langt vægstykke er bortfaldet (${DK_NA} (8)).` +
        (cc === 3
          ? ' Acceptabelt kollapsomfang: højst to etager umiddelbart over hinanden, på hver etage højst 15 % af etagearealet, dog maks. 240 m² pr. etage og 360 m² i alt (E1 (7)).'
          : '')
  }
}

function noegleTekst(svar) {
  const hvilke = (svar.noegleHvilke ?? '').trim() || '[nøgleelementer]'
  return `Følgende nøgleelementer er identificeret: ${hvilke}.`
}

export default {
  key: 'a1.robusthed',
  titel: 'Robusthed',

  spoergsmaal: [
    { key: 'noegle', label: 'Er der nøgleelementer?', type: 'valg',
      valg: [{ key: 'nej', label: 'Nej' }, { key: 'ja', label: 'Ja' }],
      hvis: (svar, o, v) => v === 'cc2' || v === 'cc3' },
    { key: 'noegleHvilke', label: 'Hvilke nøgleelementer?', type: 'tekst',
      hvis: (svar, o, v) => (v === 'cc2' || v === 'cc3') && svar.noegle === 'ja',
      pladsholder: 'fx stålsøjle i akse B/3, limtræsdrager over stue' },
    { key: 'metode', label: 'Hvordan sikres robustheden?', type: 'valg', valg: METODER,
      hvis: (svar, o, v) => v === 'cc3' || (v === 'cc2' && svar.noegle === 'ja') },
  ],

  standardSvar: () => ({ noegle: 'nej', noegleHvilke: '', metode: 'bortfald' }),

  varianter: [
    {
      key: 'simpel',
      titel: 'Simpel konstruktion — taget uden betydning for stabiliteten',
      // Et simpelt hus i én til to etager. Enfamiliehuse er CC2 efter
      // DS/INF 1990, og så skal vurderingen stå der (DK NA E1 (4)).
      passer: (o) => o.simpel && o.cc <= 2 && o.etager <= 2,
      skriv: (o) => [
        T((o.cc === 2
          ? `Bygningen henføres til konsekvensklasse CC2, og robustheden vurderes iht. ${DK_NA} (4).\n\n`
          : '') +
          'Konstruktionen er simpel, og tagkonstruktionen har ingen indflydelse på den øvrige bygnings ' +
          'statiske virkemåde. Et progressivt kollaps vurderes derfor ikke at kunne opstå.'),
      ],
    },
    {
      key: 'cc1',
      titel: 'CC1 — der gøres ikke rede for robusthed',
      passer: (o) => o.cc === 1 && !o.simpel,
      skriv: () => [
        T(`Bygningen henføres til konsekvensklasse CC1. Iht. ${DK_NA} (4), gøres der ikke rede for ` +
          'robusthed for konstruktioner i CC1.\n\n' +
          'Konstruktionen udformes som en sammenhængende konstruktion med mekaniske forbindelser mellem ' +
          'de bærende dele, og robustheden anses for tilstrækkelig ved dimensionering for de almindelige ' +
          'laster iht. normerne.'),
      ],
    },
    {
      key: 'cc2',
      titel: 'CC2 — vurdering og beskrivelse af foranstaltninger',
      passer: (o) => o.cc === 2,
      skriv: (o, svar) => {
        const dele = o.dele.length ? ogListe(o.dele) : 'de bærende konstruktioner'
        const stab = o.stab.length ? ogListe(o.stab.map(s => s.tekst)) : 'de stabiliserende konstruktioner'
        let vurdering =
          `Bygningen henføres til konsekvensklasse CC2. Iht. ${DK_NA} (4), vurderes robustheden ud fra ` +
          'samme principper som for CC3, og foranstaltningerne til sikring af tilstrækkelig robusthed beskrives.\n\n' +
          `Konstruktionen består af ${dele} og stabiliseres af ${stab}. `
        vurdering += svar.noegle === 'ja'
          ? noegleTekst(svar)
          : 'Ved bortfald af et enkelt element vurderes et svigt at forblive lokalt, da lasten kan ' +
            'omfordeles til de tilstødende konstruktionsdele. Der er ikke identificeret nøgleelementer.'
        if (o.etager === 1) {
          vurdering += '\n\nFor en én-etages bygning fastlægges acceptabelt kollapsomfang i forhold til ' +
            'anvendelsen. Som vejledende grænse benyttes 360 m² (E1 (7), note 2).'
        }
        const foranstaltninger =
          'Foranstaltninger:\n' +
          '• Tag, etagedæk og vægge forbindes med mekaniske forbindelser, så konstruktionen virker som én sammenhængende helhed.\n' +
          '• De stabiliserende konstruktioner forankres til fundamenterne.' +
          (svar.noegle === 'ja' ? '\n• ' + metodeTekst(svar.metode, 2) : '')
        return [T(vurdering), T(foranstaltninger)]
      },
    },
    {
      key: 'cc3',
      titel: 'CC3 — robustheden dokumenteres',
      passer: (o) => o.cc === 3,
      skriv: (o, svar) => [
        T(`Bygningen henføres til konsekvensklasse CC3, og robustheden dokumenteres iht. ${DK_NA} (6), ` +
          'i en teknisk-faglig redegørelse i A2.1. Redegørelsen indeholder en kritisk gennemgang af den ' +
          'konstruktive opbygning, herunder identifikation af nøgleelementer og lastscenarier.\n\n' +
          metodeTekst(svar.metode, 3) +
          (svar.noegle === 'ja' ? '\n\n' + noegleTekst(svar) : '') +
          '\n\nTilstrækkelig bæreevne eftervises i ulykkesdimensioneringstilstanden, formel (6.11 a/b).'),
      ],
    },
    {
      key: 'ombygning',
      titel: 'Ombygning — robustheden påvirkes ikke',
      passer: (o) => o.konstruktionstype === 'Ombygning',
      skriv: () => [T('Bygværkets robusthed påvirkes ikke af ombygningen.')],
    },
  ],
}
