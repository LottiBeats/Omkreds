/**
 * vandretLastfoering.js — A1 afsnit 4.1.2 Vandret lastføring.
 *
 * 'beskrivelse' er teksten, et nyt A1 altid har haft: skrevet ud fra det
 * stabiliserende system i projektbeskrivelsen. De øvrige varianter beskriver
 * lastvejen mere konkret for de typiske systemer: træhus med tag- og
 * vægskiver, hal med rammer og vindkryds, etagebyggeri med dækskiver og
 * vægge/kerner, og en tilbygning eller ombygning.
 */
import { ogListe } from '../a1.js'

const T = (text) => ({ type: 'text', data: { text } })

const TAGSKIVER = [
  { key: 'plader',   label: 'Plader på spær/lægter (krydsfiner, OSB, gips)', tekst: 'pladebeklædning, der er sømmet eller skruet til spærene' },
  { key: 'staalbaand', label: 'Vindstålbånd i tagfladen', tekst: 'vindstålbånd monteret diagonalt på spærenes overside' },
  { key: 'kryds',    label: 'Vindkryds/gitter i tagfladen', tekst: 'et vindgitter i tagfladen' },
  { key: 'daek',     label: 'Betondæk/elementdæk', tekst: 'det sammenstøbte dæk' },
]

const FORANKRINGER = [
  { key: 'beslag',  label: 'Beslag og ankerbolte', tekst: 'beslag og ankerbolte' },
  { key: 'forankringsjern', label: 'Forankringsjern/rem fastgjort til sokkel', tekst: 'forankringsjern og en rem, der er boltet til soklen' },
  { key: 'stoebt',  label: 'Indstøbt armering', tekst: 'indstøbt armering' },
]

const valg = (liste, key) => (liste.find(x => x.key === key) ?? liste[0]).tekst

function stabTekst(o) {
  return o.stab.length ? ogListe(o.stab.map(x => x.tekst)) : '[stabiliserende system]'
}

export default {
  key: 'a1.vandret',
  titel: 'Vandret lastføring',

  spoergsmaal: [
    { key: 'tagskive', label: 'Hvordan virker tag/dæk som skive?', type: 'valg', valg: TAGSKIVER,
      hvis: (svar, o, v) => v !== 'beskrivelse' && !(v === 'eksisterende' && o.konstruktionstype === 'Ombygning') },
    { key: 'forankring', label: 'Hvordan forankres de stabiliserende vægge?', type: 'valg', valg: FORANKRINGER,
      hvis: (svar, o, v) => ['skiver', 'rammer', 'kerner'].includes(v) },
  ],

  standardSvar: (o) => ({
    tagskive: o?.mat?.beton && o?.harDaek ? 'daek' : 'plader',
    forankring: o?.mat?.beton && !o?.mat?.trae ? 'stoebt' : 'beslag',
  }),

  varianter: [
    {
      key: 'beskrivelse',
      titel: 'Ud fra projektbeskrivelsen (kort)',
      passer: () => false,
      skriv: (o) => [T(
        `Vindlasten optages af facaderne og føres via ${o.harTag ? 'tagfladen' : o.harDaek ? 'dækkene' : 'væggene'}` +
        `${o.harTag || o.harDaek ? ', der virker som skive,' : ''} til bygningens stabiliserende system: ` +
        `${stabTekst(o)}. ` +
        'Systemet stabiliserer bygningen i begge hovedretninger og fører de vandrette kræfter til ' +
        'fundamenterne, hvor de optages ved friktion og jordtryk.'
      )],
    },
    {
      key: 'skiver',
      titel: 'Tag- og vægskiver (træ- og murstenshuse)',
      passer: (o) => o.stabilisering.skiver && !o.stabilisering.rammer && !o.stabilisering.kerne && o.konstruktionstype !== 'Ombygning',
      skriv: (o, svar) => [T(
        'Vindlasten på facaderne føres af facadevæggene halvt til fundamentet og halvt til ' +
        `${o.harTag ? 'tagfladen' : 'dækket'}.\n\n` +
        `${o.harTag ? 'Tagfladen' : 'Dækket'} virker som skive ved ${valg(TAGSKIVER, svar.tagskive)} og fører de ` +
        'vandrette kræfter til gavlene og de stabiliserende indervægge. ' +
        (o.harTag && o.harDaek ? 'Etagedækket virker tilsvarende som skive i sit niveau. ' : '') +
        '\n\nDe stabiliserende vægge virker som vægskiver og fører kræfterne ned til fundamenterne. ' +
        `Væggene forankres til fundamentet med ${valg(FORANKRINGER, svar.forankring)}, så de kan optage ` +
        'både glidning og løft. Bygningen stabiliseres på denne måde i begge hovedretninger.'
      )],
    },
    {
      key: 'rammer',
      titel: 'Rammer på tværs, vindkryds på langs (haller)',
      passer: (o) => o.stabilisering.rammer,
      skriv: (o, svar) => [T(
        'I tværretningen optages de vandrette laster af momentstive rammer. Vindlasten på facaden føres ' +
        'via facaderigler og -søjler til rammerne.\n\n' +
        'I længderetningen føres vindlasten på gavlene via tagfladen til vindkryds i tag og facader, ' +
        `som fører kræfterne til fundamenterne. Tagfladen virker som skive ved ${valg(TAGSKIVER, svar.tagskive)}.\n\n` +
        `Søjlefødderne forankres til fundamenterne med ${valg(FORANKRINGER, svar.forankring)}, og de vandrette ` +
        'kræfter optages i fundamenterne ved friktion og jordtryk.'
      )],
    },
    {
      key: 'kerner',
      titel: 'Dækskiver og stabiliserende vægge/kerner (etagebyggeri)',
      passer: (o) => o.stabilisering.kerne || (o.harDaek && o.mat.beton && !o.stabilisering.rammer && o.etager >= 3),
      skriv: (o, svar) => [T(
        'Vindlasten på facaderne føres af facadevæggene til etagedækkene, der virker som skiver. ' +
        (svar.tagskive === 'daek'
          ? 'Dækelementerne sammenstøbes i fugerne, og der udføres randarmering, så hvert dæk virker som én skive. '
          : '') +
        `\n\nDækskiverne fører de vandrette kræfter til de stabiliserende ${o.stabilisering.kerne ? 'kerner og vægge' : 'vægge'} ` +
        `(${stabTekst(o)}), som fører dem ned gennem etagerne til fundamenterne. ` +
        `De stabiliserende vægge forankres med ${valg(FORANKRINGER, svar.forankring)}.\n\n` +
        'Lastfordelingen mellem de stabiliserende vægge bestemmes ud fra deres stivhed og placering, ' +
        'og der tages hensyn til vridning. Eftervisningen fremgår af A2.1.'
      )],
    },
    {
      key: 'eksisterende',
      titel: 'Tilbygning/ombygning — eksisterende stabilitet',
      passer: (o) => o.konstruktionstype !== 'Nybyggeri',
      skriv: (o, svar) => [T(
        o.konstruktionstype === 'Tilbygning'
          ? 'Tilbygningen stabiliseres selvstændigt af ' + stabTekst(o) + ', og der overføres ikke vandrette ' +
            'kræfter til den eksisterende bygning. ' +
            `${o.harTag ? 'Tilbygningens tagflade' : 'Dækket'} virker som skive ved ${valg(TAGSKIVER, svar.tagskive)}.`
          : 'Den eksisterende bygnings stabiliserende system ændres ikke af ombygningen. De vandrette ' +
            'laster føres som hidtil gennem dæk og tag til de eksisterende stabiliserende vægge og videre ' +
            'til fundamenterne. [Angiv, hvis vægge, der indgår i stabiliteten, fjernes eller gennembrydes, ' +
            'og hvordan stabiliteten så sikres.]'
      )],
    },
  ],
}
