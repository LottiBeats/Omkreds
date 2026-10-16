/**
 * regnearkSkabeloner.js — regneark at starte fra, bygget som de Excel-ark,
 * der bruges i praksis til lodret og vandret lastnedføring.
 *
 *   Opbygning       lag for lag, bunden/fri: G_sup tæller alle lag, G_inf kun
 *                   de bundne (de frie kan fjernes senere, fx beklædning).
 *   Lastnedføring   element for element: last × opland → kN/m, summen føres
 *                   videre ned, og kombinationerne regnes på summerne.
 *                   Henter G_sup og G_inf fra arket "Opbygning".
 *   Vægskive        væltningsreaktioner fra vandret last og forankring.
 *
 * Alle tal står i cellerne og kan rettes; formlerne regner om med det samme.
 */

const raekker = (r) => r.map(x => x.map(c => (c === undefined || c === null ? '' : String(c))))

const opbygning = () => ({
  titel: 'Opbygning — tag',
  overskrift: true,
  bredder: [200, 82, 92, 92, 92, 96, 92, 92],
  celler: raekker([
    ['Lag', 'Bunden/Fri', 'Densitet [kN/m³]', 'Tykkelse [mm]', 'Fast last [kN/m²]', 'G bunden [kN/m²]', 'G fri [kN/m²]', 'G sup [kN/m²]'],
    ['Tegltagsten', 'Fri', '', '', '0,5', '=HVIS(B2="Bunden";C2*D2/1000+E2;0)', '=HVIS(B2="Fri";C2*D2/1000+E2;0)', '=F2+G2'],
    ['Lægter 35×50 c/c 320', 'Bunden', '', '', '0,03', '=HVIS(B3="Bunden";C3*D3/1000+E3;0)', '=HVIS(B3="Fri";C3*D3/1000+E3;0)', '=F3+G3'],
    ['OSB 18 mm', 'Bunden', '7', '18', '', '=HVIS(B4="Bunden";C4*D4/1000+E4;0)', '=HVIS(B4="Fri";C4*D4/1000+E4;0)', '=F4+G4'],
    ['Spær 45×245 c/c 600', 'Bunden', '', '', '0,08', '=HVIS(B5="Bunden";C5*D5/1000+E5;0)', '=HVIS(B5="Fri";C5*D5/1000+E5;0)', '=F5+G5'],
    ['Isolering 240 mm', 'Bunden', '0,6', '240', '', '=HVIS(B6="Bunden";C6*D6/1000+E6;0)', '=HVIS(B6="Fri";C6*D6/1000+E6;0)', '=F6+G6'],
    ['Krydsfiner 15 mm', 'Fri', '5', '15', '', '=HVIS(B7="Bunden";C7*D7/1000+E7;0)', '=HVIS(B7="Fri";C7*D7/1000+E7;0)', '=F7+G7'],
    [],
    ['Σ pr. m² tagflade', '', '', '', '', '=SUM(F2:F7)', '=SUM(G2:G7)', '=SUM(H2:H7)'],
    ['Taghældning α [°]', '45'],
    ['G inf pr. m² vandret [kN/m²]', '=F9/COS(RADIANER(B10))'],
    ['G sup pr. m² vandret [kN/m²]', '=H9/COS(RADIANER(B10))'],
  ]),
  fed: { A9: true, F9: true, G9: true, H9: true, A11: true, B11: true, A12: true, B12: true },
  dec: { F9: 2, G9: 2, H9: 2, B11: 2, B12: 2 },
})

const lastnedfoering = () => {
  // Kolonner: A Element, B Last, C Opland [m], D–H last pr. m² (G sup, G inf, Q, S, W),
  // I–M last pr. m (= opland × D–H), N–Q kombinationer (kun på Σ-rækkerne).
  const pm = (r) => [`=C${r}*D${r}`, `=C${r}*E${r}`, `=C${r}*F${r}`, `=C${r}*G${r}`, `=C${r}*H${r}`]
  const sum = (a, b) => ['I', 'J', 'K', 'L', 'M'].map(k => `=SUM(${k}${a}:${k}${b})`)
  const komb = (r) => [
    `=1,2*I${r}`,
    `=I${r}+1,5*L${r}+1,5*0,5*K${r}+1,5*0,3*M${r}`,
    `=I${r}+1,5*K${r}+1,5*0,3*L${r}+1,5*0,3*M${r}`,
    `=I${r}+K${r}+L${r}+M${r}`,
  ]
  const fra = (r) => [`=I${r}`, `=J${r}`, `=K${r}`, `=L${r}`, `=M${r}`]
  return {
    titel: 'Lodret lastnedføring',
    overskrift: true,
    bredder: [118, 150, 62, 70, 70, 62, 62, 62, 70, 70, 62, 62, 62, 84, 96, 96, 78],
    celler: raekker([
      ['Element', 'Last', 'Opland [m]', 'G sup [kN/m²]', 'G inf [kN/m²]', 'Q [kN/m²]', 'S [kN/m²]', 'W [kN/m²]',
       'G sup [kN/m]', 'G inf [kN/m]', 'Q [kN/m]', 'S [kN/m]', 'W [kN/m]',
       '6.10a: 1,2G', '6.10b: S dom.', '6.10b: Q dom.', 'Karakt.'],
      ['Tag', 'Tagkonstruktion', '2,7', '=Opbygning!B12', '=Opbygning!B11', '', '', '', ...pm(2)],
      ['', 'Sne', '2,7', '', '', '', '0,4', '', ...pm(3)],
      ['', 'Vindtryk (ned)', '2,7', '', '', '', '', '0,3', ...pm(4)],
      ['Σ Tag → rem', '', '', '', '', '', '', '', ...sum(2, 4), ...komb(5)],
      ['Rem/ydervæg', 'Fra tag', '', '', '', '', '', '', ...fra(5)],
      ['', 'Ydervæg', '3,1', '0,66', '0,66', '', '', '', ...pm(7)],
      ['Σ Væg → fundament', '', '', '', '', '', '', '', ...sum(6, 7), ...komb(8)],
      ['Fundament', 'Fra væg', '', '', '', '', '', '', ...fra(8)],
      ['', 'Fundament 0,4 × 0,9 m beton', '1', '=0,4*0,9*24', '=0,4*0,9*24', '', '', '', ...pm(10)],
      ['', 'Gulv (opland)', '0,5', '3,24', '3,24', '1,5', '', '', ...pm(11)],
      ['Σ Fundament → jord', '', '', '', '', '', '', '', ...sum(9, 11), ...komb(12)],
    ]),
    fed: Object.fromEntries(['5', '8', '12'].flatMap(r => ['A', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q'].map(k => [`${k}${r}`, true]))),
    dec: Object.fromEntries(['I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q'].map(k => [k, 2])),
  }
}

const vaegskive = () => ({
  titel: 'Vægskive — væltning og forankring',
  overskrift: true,
  bredder: [210, 92, 120, 170, 170],
  celler: raekker([
    ['Geometri og lodret last', 'Værdi', 'Enhed'],
    ['Væghøjde h', '4,71', 'm'],
    ['Vægbredde L (tværgående)', '8,2', 'm'],
    ['g inf pr. søjle (c/c 5,03 m)', '3,5', 'kN'],
    ['w sug pr. søjle', '-7,4', 'kN'],
    [],
    ['Vandret last', 'W [kN]', 'R = −W·h/L [kN]', 'R d = 1,5R + 0,9g + 1,5w [kN]', 'Forankring R d/1,1·1,35 [kN]'],
    ['W1', '46,75', '=-B8*$B$2/$B$3', '=1,5*C8+0,9*$B$4+1,5*$B$5', '=D8/1,1*1,35'],
    ['W2', '36,33', '=-B9*$B$2/$B$3', '=1,5*C9+0,9*$B$4+1,5*$B$5', '=D9/1,1*1,35'],
    ['W3', '20,76', '=-B10*$B$2/$B$3', '=1,5*C10+0,9*$B$4+1,5*$B$5', '=D10/1,1*1,35'],
    ['W4', '31,14', '=-B11*$B$2/$B$3', '=1,5*C11+0,9*$B$4+1,5*$B$5', '=D11/1,1*1,35'],
  ]),
  fed: { A7: true, B7: true, C7: true, D7: true, E7: true },
  dec: { C: 2, D: 2, E: 2 },
})

export const SKABELONER = [
  { key: 'opbygning', titel: 'Opbygning (bunden/fri)', navn: 'Opbygning', data: opbygning },
  { key: 'lastnedfoering', titel: 'Lodret lastnedføring', navn: 'Lastnedføring', data: lastnedfoering },
  { key: 'vaegskive', titel: 'Vægskive — væltning og forankring', navn: 'Vægskive', data: vaegskive },
]
