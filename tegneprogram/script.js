const svg = document.getElementById("drawingCanvas");
const canvasWrap = document.getElementById("canvasWrap");
const underlayLayer = document.getElementById("underlayLayer");
const drawingLayer = document.getElementById("drawingLayer");
const previewLayer = document.getElementById("previewLayer");
const statusText = document.getElementById("statusText");
const strokeColor = document.getElementById("strokeColor");
const strokeWidth = document.getElementById("strokeWidth");
const strokeWidthValue = document.getElementById("strokeWidthValue");
const lineTypeSelect = document.getElementById("lineTypeSelect");
const strokeOpacity = document.getElementById("strokeOpacity");
const strokeOpacityValue = document.getElementById("strokeOpacityValue");
const stylePreset = document.getElementById("stylePreset");
const gridSize = document.getElementById("gridSize");
const scaleFactor = document.getElementById("scaleFactor");
const snapToggle = document.getElementById("snapToggle");
const zoomLabel = document.getElementById("zoomLabel");
const selectionCount = document.getElementById("selectionCount");
const planImport = document.getElementById("planImport");
const underlayOpacity = document.getElementById("underlayOpacity");
const underlayOpacityValue = document.getElementById("underlayOpacityValue");
const underlayScale = document.getElementById("underlayScale");
const underlayScaleValue = document.getElementById("underlayScaleValue");
const underlayLocked = document.getElementById("underlayLocked");
const pdfControls = document.getElementById("pdfControls");
const pdfPageSelect = document.getElementById("pdfPageSelect");
const pdfRotation = document.getElementById("pdfRotation");
const profileSelect = document.getElementById("profileSelect");
const boltSelect = document.getElementById("boltSelect");
const boltGrade = document.getElementById("boltGrade");
const boltViewSelect = document.getElementById("boltViewSelect");
const boltHeadForm = document.getElementById("boltHeadForm");
const boltLengthInput = document.getElementById("boltLengthInput");
const boltThreadInput = document.getElementById("boltThreadInput");
const boltExtensionInput = document.getElementById("boltExtensionInput");
const boltShowNut = document.getElementById("boltShowNut");
const boltThinNut = document.getElementById("boltThinNut");
const boltNutWasher = document.getElementById("boltNutWasher");
const boltHeadWasher = document.getElementById("boltHeadWasher");
const boltSpringWasher = document.getElementById("boltSpringWasher");
const boltShowShank = document.getElementById("boltShowShank");
const boltSymbolic = document.getElementById("boltSymbolic");
const hatchAngleInput = document.getElementById("hatchAngleInput");
const hatchScaleInput = document.getElementById("hatchScaleInput");
const screwFamilySelect = document.getElementById("screwFamilySelect");
const screwSelect = document.getElementById("screwSelect");
const screwViewSelect = document.getElementById("screwViewSelect");
const hatchSelect = document.getElementById("hatchSelect");
const componentCategory = document.getElementById("componentCategory");
const componentItem = document.getElementById("componentItem");
const componentView = document.getElementById("componentView");
const componentSource = document.getElementById("componentSource");
const componentManufacturer = document.getElementById("componentManufacturer");
const componentVariant = document.getElementById("componentVariant");
const componentSearch = document.getElementById("componentSearch");
const componentPreview = document.getElementById("componentPreview");
const componentBrowser = document.getElementById("componentBrowser");
const activeLayer = document.getElementById("activeLayer");
const layerList = document.getElementById("layerList");
const projectImport = document.getElementById("projectImport");
const scaleStatus = document.getElementById("scaleStatus");
const propertyEmpty = document.getElementById("propertyEmpty");
const propertyForm = document.getElementById("propertyForm");
const propType = document.getElementById("propType");
const propDimension = document.getElementById("propDimension");
const propMaterial = document.getElementById("propMaterial");
const propManufacturer = document.getElementById("propManufacturer");
const propFamily = document.getElementById("propFamily");
const propProduct = document.getElementById("propProduct");
const propSourceUrl = document.getElementById("propSourceUrl");
const propLength = document.getElementById("propLength");
const propRotation = document.getElementById("propRotation");
const propStrokeWidth = document.getElementById("propStrokeWidth");
const propOpacity = document.getElementById("propOpacity");
const propLayer = document.getElementById("propLayer");
const propColor = document.getElementById("propColor");
const propLineType = document.getElementById("propLineType");
const propMeasureText = document.getElementById("propMeasureText");
const propMeasureMode = document.getElementById("propMeasureMode");
const propMeasureOffset = document.getElementById("propMeasureOffset");
const contextMenu = document.getElementById("contextMenu");
const activeToolName = document.getElementById("activeToolName");
const activeToolHint = document.getElementById("activeToolHint");
const closePanelButton = document.getElementById("closePanel");
const panelToggles = document.querySelectorAll("[data-panel-target]");
const panelSections = document.querySelectorAll("[data-panel]");
const selectionBar = document.getElementById("selectionBar");
const elementList = document.getElementById("elementList");
const elementTotal = document.getElementById("elementTotal");

let activeTool = "select";
let startPoint = null;
/* Screen-space press position, used to tell a click from a drag. */
let drawPressScreen = null;
const DRAW_CLICK_SLOP = 4;
let previewElement = null;
let dragState = null;
let marqueeState = null;
let zoom = 1;
let pdfDocument = null;
let currentPdfBytes = null;
let currentScaleValue = 1;
let isRestoringHistory = false;
let historyPointer = -1;
const historyStack = [];
const maxHistory = 120;
const historyByteBudget = 24 * 1024 * 1024;
let historyTimer = 0;
let hoveredElement = null;
let panState = null;
let clipboardHtml = "";
let spacePressed = false;
let suppressNativeContextMenu = false;
let placementState = null;
let lastOperation = null;
let gripState = null;
const dragThresholdPx = 4;

/* --- Viewport ------------------------------------------------------------
   The view transform lives in the SVG viewBox, not a CSS transform. `zoom`
   keeps its old meaning (screen px per drawing unit) so every `n / zoom`
   size compensation elsewhere in this file keeps working unchanged. */
/* The sheet is a piece of paper: a size in millimetres and a plot scale.
   `width`/`height` stay available in drawing units because the viewport, the
   grid and the exporter all work in model space -- they are now derived.
   The default (1400 x 900 mm at 1:1) reproduces the previous behaviour. */
const sheet = {
  paper: "custom",
  widthMm: 1400,
  heightMm: 900,
  plotScale: 1,
  width: 1400,
  height: 900,
};
const view = { x: 0, y: 0, width: 1400, height: 900 };
const minZoom = 0.05;
const maxZoom = 40;
const zoomStepFactor = 1.25;
let viewFrame = 0;

const selectedElements = new Set();
const svgNS = "http://www.w3.org/2000/svg";
let activeUnderlayUrl = null;

const layers = {
  underlay: { name: "Underlag", visible: true, locked: true },
  measure: { name: "Maal", visible: true, locked: false },
  steel: { name: "Staal", visible: true, locked: false },
  timber: { name: "Trae", visible: true, locked: false },
  masonry: { name: "Beton/murvaerk", visible: true, locked: false },
  notes: { name: "Noter", visible: true, locked: false },
  revision: { name: "Revision", visible: true, locked: false },
};

const toolCopy = {
  select: {
    name: "Ingen aktiv kommando",
    hint: "Klik geometri for at markere. Traek paa tomt papir for flere valg.",
  },
  trim: {
    name: "Trim / forlaeng",
    hint: "Klik den del af linjen der skal fjernes. Ligger skaeringen udenfor, forlaenges linjen dertil.",
  },
  placeObject: {
    name: "Placer objekt",
    hint: "Ghosten foelger cursoren. Klik for at placere, wheel/R roterer, Esc afslutter.",
  },
  line: {
    name: "Linje",
    hint: "Klik start, klik slut. Skriv laengde (Tab for vinkel) og Enter. Fortsaetter som polylinje; Esc afslutter.",
  },
  arrow: {
    name: "Pil",
    hint: "Traek fra hale til spids. Shift laaser vinkler.",
  },
  loadArrow: {
    name: "Lastpil",
    hint: "Traek i lastens retning. Label kan aendres i egenskaber.",
  },
  placeScrew: {
    name: "Placer skrue",
    hint: "Ghosten foelger cursoren. Klik for at placere, wheel/R roterer, Esc annullerer.",
  },
  leader: {
    name: "Leader note",
    hint: "Traek fra punktet paa detaljen til tekstplacering. Teksten kan redigeres i egenskaber.",
  },
  weld: {
    name: "Svejsning",
    hint: "Traek langs svejsningen. Enderne kan bagefter flyttes med grips.",
  },
  measure: {
    name: "Maal",
    hint: "Traek mellem to punkter. Shift laaser vinkler.",
  },
  calibrate: {
    name: "Kalibrer skala",
    hint: "Traek en kendt afstand og skriv den rigtige laengde i mm.",
  },
  rect: {
    name: "Firkant",
    hint: "Traek diagonalt for at oprette en form.",
  },
  hatch: {
    name: "Hatch",
    hint: "Traek et felt og vaelg materialehatch i komponentpanelet.",
  },
  circle: {
    name: "Cirkel",
    hint: "Traek fra centrum til radius.",
  },
  text: {
    name: "Tekst",
    hint: "Klik paa tegningen og skriv noten.",
  },
  placeProfile: {
    name: "Placer profil",
    hint: "Foer profilen med cursoren. Klik indsats, flyt for rotation, klik igen. R drejer 90 grader.",
  },
  placeBolt: {
    name: "Placer bolt",
    hint: "Foer bolten med cursoren og klik for at placere. Vaerktoejet bliver aktivt til flere bolte.",
  },
  copyReference: {
    name: "Kopi med referencepunkt",
    hint: "Klik basepunkt paa valget, flyt ghosten, og klik ny placering.",
  },
};

const lineStyleMap = {
  solid: "",
  dashed: "10 6",
  dotted: "1.5 5",
  dashdot: "14 5 2.5 5",
  center: "20 5 3 5",
  hidden: "6 4",
  construction: "18 8",
  phantom: "20 5 3 5 3 5",
};

const stylePresets = {
  outline: { lineType: "solid", width: 1.2, opacity: 100, color: "#111111" },
  fine: { lineType: "solid", width: 0.55, opacity: 100, color: "#111111" },
  heavy: { lineType: "solid", width: 2.2, opacity: 100, color: "#111111" },
  centerline: { lineType: "center", width: 0.55, opacity: 65, color: "#111111" },
  hidden: { lineType: "hidden", width: 0.65, opacity: 70, color: "#111111" },
  construction: { lineType: "construction", width: 0.5, opacity: 38, color: "#65758b" },
  dimension: { lineType: "solid", width: 0.55, opacity: 100, color: "#111111" },
  markup: { lineType: "solid", width: 2.5, opacity: 90, color: "#1f6feb" },
};

const profileCatalog = {
  IPE100: { name: "IPE 100", h: 100, b: 55, tw: 4.1, tf: 5.7 },
  IPE160: { name: "IPE 160", h: 160, b: 82, tw: 5, tf: 7.4 },
  IPE200: { name: "IPE 200", h: 200, b: 100, tw: 5.6, tf: 8.5 },
  IPE300: { name: "IPE 300", h: 300, b: 150, tw: 7.1, tf: 10.7 },
  HEA100: { name: "HEA 100", h: 96, b: 100, tw: 5, tf: 8 },
  HEA200: { name: "HEA 200", h: 190, b: 200, tw: 6.5, tf: 10 },
  HEB200: { name: "HEB 200", h: 200, b: 200, tw: 9, tf: 15 },
  RHS100x50x5: { name: "RHS 100x50x5", h: 100, b: 50, tw: 5, tf: 5, shape: "rhs" },
  SHS100x100x5: { name: "SHS 100x100x5", h: 100, b: 100, tw: 5, tf: 5, shape: "rhs" },
  UPN160: { name: "UPN 160", h: 160, b: 65, tw: 7.5, tf: 10.5, shape: "upn" },
};

/* Fasteners are standardised, so their geometry is looked up, not invented.
   Every number below is from the standard, in millimetres:

     s     width across flats, hex head        ISO 4014 / ISO 4017
     k     head height                         ISO 4014 / ISO 4017
     m     nut height                          ISO 4032   (mt = thin nut, ISO 4035)
     dw    plain washer outside diameter       ISO 7089
     tw    plain washer thickness              ISO 7089
     hole  clearance hole, medium fit          EN 20273

   The previous table carried M10 s=17 and M12 s=19, which are the superseded
   DIN 933 values -- current ISO is 16 and 18. Drawing a bolt head 1 mm too wide
   is exactly the kind of quiet inaccuracy this is meant to remove. */
const boltCatalog = {
  M6:  { d: 6,  s: 10, k: 4.0,  m: 5.2,  mt: 3.2, dw: 12, tw: 1.6, hole: 7 },
  M8:  { d: 8,  s: 13, k: 5.3,  m: 6.8,  mt: 4.0, dw: 16, tw: 1.6, hole: 9 },
  M10: { d: 10, s: 16, k: 6.4,  m: 8.4,  mt: 5.0, dw: 20, tw: 2.0, hole: 11 },
  M12: { d: 12, s: 18, k: 7.5,  m: 10.8, mt: 6.0, dw: 24, tw: 2.5, hole: 13 },
  M16: { d: 16, s: 24, k: 10.0, m: 14.8, mt: 8.0, dw: 30, tw: 3.0, hole: 17 },
  M20: { d: 20, s: 30, k: 12.5, m: 18.0, mt: 10.0, dw: 37, tw: 3.0, hole: 21 },
  M24: { d: 24, s: 36, k: 15.0, m: 21.5, mt: 12.0, dw: 44, tw: 4.0, hole: 25 },
  M30: { d: 30, s: 46, k: 18.7, m: 25.6, mt: 15.0, dw: 56, tw: 4.0, hole: 31 },
  M36: { d: 36, s: 55, k: 22.5, m: 31.0, mt: 18.0, dw: 66, tw: 5.0, hole: 37 },
};

/* `head` was the across-flats dimension under an older name; keep it resolving
   so nothing that already reads bolt.head has to change. */
Object.values(boltCatalog).forEach((entry) => { entry.head = entry.s; });

/* Clearance hole, one place. d+2 is only right from M16 up; below that the
   table says d+1, and captions quoting d+2 disagreed with the drawn circle. */
function boltHoleMm(bolt) {
  return bolt?.hole ?? (Number(bolt?.d) || 0) + 2;
}

/* Head forms other than hex, as proportions of the thread diameter. These are
   the shapes the drawing needs, not full thread profiles.
     dia    head diameter (or across-corners for a dome)
     h      head height above the surface; 0 = sits flush
     flush  countersunk into the material rather than standing proud */
const boltHeadForms = {
  hex:        { label: "Sekskant",     dia: (b) => b.s,        h: (b) => b.k,       style: "facets" },
  socket:     { label: "Indv. sekskant", dia: (b) => b.d * 1.5, h: (b) => b.d,      style: "socket" },
  lowSocket:  { label: "Lav socket",   dia: (b) => b.d * 1.6,  h: (b) => b.d * 0.6, style: "socket" },
  button:     { label: "Kalot",        dia: (b) => b.d * 1.75, h: (b) => b.d * 0.55, style: "dome" },
  coach:      { label: "Bræddebolt",   dia: (b) => b.d * 2.2,  h: (b) => b.d * 0.8, style: "domeNeck" },
  countersunk:{ label: "Undersænket",  dia: (b) => b.d * 2,    h: (b) => b.d * 0.5, flush: true, style: "taper" },
  none:       { label: "Uden hoved",   dia: (b) => b.d,        h: () => 0 },
};


const screwCatalog = {
  connector: {
    name: "Simpson CSA beslagskruer",
    material: "Carbon steel, zinc coated",
    sourceUrl: "https://www.strongtie.dk/da-DK/produkter/beslagskruer-csa",
    items: {
      "CSA4.0X30": { name: "CSA 4.0 x 30", d: 3.95, core: 2.5, length: 30, head: 7.3, headType: "pan", drive: "torx", thread: 24, bit: "T-15", verified: true },
      "CSA5.0X25": { name: "CSA 5.0 x 25", d: 4.85, core: 3.15, length: 25, head: 8.3, headType: "pan", drive: "torx", thread: 19, bit: "T-20", verified: true },
      "CSA5.0X35": { name: "CSA 5.0 x 35", d: 4.85, core: 3.15, length: 35, head: 8.3, headType: "pan", drive: "torx", thread: 29, bit: "T-20", verified: true },
      "CSA5.0X40": { name: "CSA 5.0 x 40", d: 4.85, core: 3.15, length: 40, head: 8.3, headType: "pan", drive: "torx", thread: 34, bit: "T-20", verified: true },
      "CSA5.0X50": { name: "CSA 5.0 x 50", d: 4.85, core: 3.15, length: 50, head: 8.3, headType: "pan", drive: "torx", thread: 44, bit: "T-20", verified: true },
      "CSA5.0X80": { name: "CSA 5.0 x 80", d: 4.85, core: 3.15, length: 80, head: 8.3, headType: "pan", drive: "torx", thread: 74, bit: "T-20", verified: true },
    },
  },
  timber: {
    name: "Konstruktionsskruer trae",
    material: "Structural timber screw",
    items: {
      "WT6x80": { name: "WT 6 x 80", d: 6, length: 80, head: 12, headType: "countersunk", drive: "torx", thread: 50 },
      "WT6x120": { name: "WT 6 x 120", d: 6, length: 120, head: 12, headType: "countersunk", drive: "torx", thread: 70 },
      "WT8x120": { name: "WT 8 x 120", d: 8, length: 120, head: 16, headType: "washer", drive: "torx", thread: 70 },
      "WT8x160": { name: "WT 8 x 160", d: 8, length: 160, head: 18, headType: "washer", drive: "torx", thread: 90 },
      "WT8x200": { name: "WT 8 x 200", d: 8, length: 200, head: 18, headType: "washer", drive: "torx", thread: 100 },
      "WT10x160": { name: "WT 10 x 160", d: 10, length: 160, head: 22, headType: "washer", drive: "torx", thread: 90 },
      "WT10x200": { name: "WT 10 x 200", d: 10, length: 200, head: 22, headType: "washer", drive: "torx", thread: 100 },
      "WT10x240": { name: "WT 10 x 240", d: 10, length: 240, head: 22, headType: "washer", drive: "torx", thread: 120 },
      "WT12x240": { name: "WT 12 x 240", d: 12, length: 240, head: 26, headType: "washer", drive: "torx", thread: 120 },
      "WT12x300": { name: "WT 12 x 300", d: 12, length: 300, head: 26, headType: "washer", drive: "torx", thread: 140 },
    },
  },
  concrete: {
    name: "Beton- og ankerskruer",
    material: "Concrete screw anchor",
    items: {
      "CS7.5x60": { name: "CS 7.5 x 60", d: 7.5, length: 60, head: 13, headType: "hex", drive: "hex", thread: 46 },
      "CS7.5x80": { name: "CS 7.5 x 80", d: 7.5, length: 80, head: 13, headType: "hex", drive: "hex", thread: 58 },
      "CS10x80": { name: "CS 10 x 80", d: 10, length: 80, head: 17, headType: "hex", drive: "hex", thread: 60 },
      "CS10x100": { name: "CS 10 x 100", d: 10, length: 100, head: 17, headType: "hex", drive: "hex", thread: 70 },
      "CS12x100": { name: "CS 12 x 100", d: 12, length: 100, head: 19, headType: "hex", drive: "hex", thread: 75 },
    },
  },
  metal: {
    name: "Selvborende / metal",
    material: "Self-drilling steel screw",
    items: {
      "TEK4.8x19": { name: "TEK 4.8 x 19", d: 4.8, length: 19, head: 9.5, headType: "hexWasher", drive: "hex", thread: 14, drillTip: true },
      "TEK5.5x25": { name: "TEK 5.5 x 25", d: 5.5, length: 25, head: 11, headType: "hexWasher", drive: "hex", thread: 19, drillTip: true },
      "TEK5.5x38": { name: "TEK 5.5 x 38", d: 5.5, length: 38, head: 11, headType: "hexWasher", drive: "hex", thread: 29, drillTip: true },
      "TEK6.3x50": { name: "TEK 6.3 x 50", d: 6.3, length: 50, head: 13, headType: "hexWasher", drive: "hex", thread: 38, drillTip: true },
    },
  },
};

const structuralLibrary = {
  bolts: {
    name: "Bolte, moetrikker og skiver",
    layer: "steel",
    /* One parametric bolt, not twenty-nine stickers.
       This list used to name 29 separate fixed-size cartoons -- "Bolt + nut",
       "Bolt + nut + washer", "Double nut", "Threaded rod", "Countersunk bolt",
       "Coach bolt" and so on -- every one of which was the same hand-drawn
       shape at the same invented proportions. They are all the ISO bolt with
       different switches: head form, showNut, thinNut, nutWasher, headWasher,
       springWasher, thread length, extension. Deleting them removes fake
       breadth and leaves one object that actually draws to standard at any
       size. Anchors stay separate because a cast-in anchor genuinely is a
       different product, not a bolt with a checkbox. */
    items: [
      "Bolt",
      "Ankerbolt",
    ],
  },
  screws: {
    name: "Skruer",
    layer: "steel",
    /* One parametric screw, not thirty rows naming the same one.
       Each of those thirty entries named a product that already exists in
       screwCatalog with real dimensions -- d, core, head, thread length, drive
       and bit -- and every one routed to the same generator anyway. The product
       is chosen in the Skruer panel (family, then size); listing every SKU here
       as well was breadth that did nothing. */
    items: [
      "Skrue",
    ],
  },
  connectors: {
    name: "Soem, dyvler og mindre forbindere",
    layer: "steel",
    items: [
      "Common nail", "Ring-shank nail", "Anchor nail", "Concrete nail", "Staple", "Timber dowel", "Steel dowel", "Drift pin",
      "Wooden peg", "Split ring connector", "Shear plate connector", "Toothed plate connector",
    ],
  },
  plates: {
    name: "Staalplader og beslag",
    layer: "steel",
    items: [
      "Flat steel plate", "End plate", "Base plate", "Gusset plate", "Fin plate", "Splice plate", "Stiffener plate", "Knife plate",
      "Rib stiffener pair", "Triangular gusset stiffener", "Base plate with 4 anchors", "End plate with 4 bolts", "End plate with 6 bolts",
      "Slotted hole plate", "Bolt group 2x2", "Bolt group 2x3", "Bolt group 2x4", "Shim plate pack", "Shear tab",
      "Embedded steel plate", "Washer plate", "Anchor plate", "Angle bracket", "Joist hanger", "Beam hanger", "Post base",
      "Post cap", "Hold-down", "Wind anchor", "Strap", "Perforated strap", "Nail plate", "Timber connector plate",
    ],
  },
  welds: {
    name: "Svejsninger",
    layer: "steel",
    items: ["Fillet weld", "Double fillet weld", "Butt weld", "Partial penetration weld", "Full penetration weld", "Plug weld", "Spot weld", "Intermittent weld", "6mm fillet weld callout", "8mm fillet weld callout", "Full perimeter weld callout", "Site weld flag"],
  },
  profiles: {
    name: "Staalprofiler",
    layer: "steel",
    items: ["IPE", "HEA", "HEB", "HEM", "UPE", "UNP", "IPN", "RHS", "SHS", "CHS", "L-angle", "Equal angle", "Unequal angle", "T-section", "Flat bar", "Round bar", "Square bar", "Z-profile", "C-profile", "Cold-formed channel", "Hat profile"],
  },
  timber: {
    name: "Traekonstruktioner",
    layer: "timber",
    items: ["Rectangular timber beam", "Timber beam end grain", "Timber column", "Timber post section", "Timber stud", "Rafter", "Joist", "Batten", "Blocking", "Nogging", "Timber board", "Glulam", "LVL", "CLT", "Plywood", "OSB", "MDF", "Particle board", "Half lap", "Scarf joint", "Mortise and tenon", "Dovetail", "Finger joint", "Birdsmouth", "Notch", "Housing joint", "Timber-to-timber screw connection", "Timber-to-steel connection"],
  },
  concrete: {
    name: "Beton og armering",
    layer: "masonry",
    items: ["Concrete slab", "Concrete wall", "Concrete beam", "Concrete column", "Foundation", "Pad foundation", "Strip foundation", "Pile", "Concrete topping", "Precast panel", "Hollow-core slab", "Grout bed", "Non-shrink grout", "Bearing pad", "DPC under plate", "Pocket detail", "Cast-in channel", "Reinforcement bar", "Bent reinforcement bar", "Stirrup", "Mesh", "Hairpin", "U-bar", "L-bar", "Starter bar", "Coupler", "Mechanical splice", "Rebar chair"],
  },
  masonry: {
    name: "Murvaerk",
    layer: "masonry",
    items: ["Standard brick", "Danish brick", "Concrete block", "AAC block", "Lightweight block", "Hollow block", "Stone", "Mortar joint", "Movement joint", "Cavity closer", "Weep vent", "Cavity tray", "Bed joint reinforcement", "Wall tie", "Brick tie", "Cavity anchor", "Lintel", "Masonry support angle"],
  },
  ground: {
    name: "Fundamenter og jord",
    layer: "masonry",
    items: ["Strip footing", "Pad footing", "Foundation wall", "Ground beam", "Pile", "Screw pile", "Ground anchor", "Concrete pile", "Steel pile", "Gravel", "Sand", "Compacted fill", "Existing soil", "Excavated soil"],
  },
  envelope: {
    name: "Isolering, membraner og taetning",
    layer: "masonry",
    items: ["Mineral wool", "Glass wool", "Rock wool", "EPS", "XPS", "PIR", "PUR", "Wood fibre", "Cellulose", "Foam glass", "Vapour barrier", "Wind barrier", "Roofing membrane", "Bitumen membrane", "EPDM", "DPC", "Radon membrane", "Waterproofing membrane", "Geotextile", "Silicone joint", "Sealant", "Backer rod", "Expanding tape", "Fire seal", "Firestop mineral wool", "Intumescent seal", "Acoustic seal", "Mastic", "Construction adhesive", "Foam"],
  },
  building: {
    name: "Facade, tag, gulv, vinduer",
    layer: "notes",
    items: ["Brick", "Timber cladding", "Metal cladding", "Standing seam cladding", "Fibre cement board", "Aluminium profile", "Curtain wall profile", "Window sill", "Flashing", "Stepped flashing", "Drip edge", "Coping", "Rainscreen bracket", "Facade anchor", "Ventilation cavity", "Rafter", "Roof truss", "Roof batten", "Counter batten", "Roof tile", "Slate", "Metal roofing", "Ridge", "Valley", "Gutter", "Downpipe", "Roof flashing", "Fascia", "Soffit", "Screed", "Timber floor", "Floorboard", "Parquet", "Underlay", "Raised floor", "Acoustic mat", "Floor heating pipe", "Window frame", "Window sash", "Double glazing", "Triple glazing", "Door leaf", "Door frame", "Threshold", "Hinge", "Door seal", "Glass clamp", "Spider fitting"],
  },
  graphic: {
    name: "Grafik, symboler og maal",
    layer: "notes",
    items: ["Break line", "Zig-zag break", "Curved break", "Section cut", "Detail boundary", "Match line", "Hidden line", "Centre line", "Axis line", "Demolition line", "Existing construction line", "Overhead line", "Section marker", "Elevation marker", "Detail marker", "North arrow", "Level marker", "Datum", "Grid bubble A", "Grid bubble 1", "Revision cloud", "Revision triangle", "Welding symbol", "Surface finish symbol", "Slope symbol", "Fall arrow", "Linear dimension", "Aligned dimension", "Angular dimension", "Radius", "Diameter", "Bolt spacing", "Edge distance", "Weld size", "Leader dot", "Leader arrow", "Section tail"],
  },
  hatches: {
    name: "Materialehatches",
    layer: "masonry",
    items: ["Concrete hatch", "Reinforced concrete hatch", "Timber hatch", "Plywood hatch", "Steel hatch", "Aluminium hatch", "Brick hatch", "Masonry hatch", "Stone hatch", "Earth hatch", "Gravel hatch", "Sand hatch", "Insulation hatch", "Glass hatch", "Gypsum hatch", "Existing material hatch", "New material hatch"],
  },
};

const manufacturerLibraries = {
  "simpson-strong-tie": {
    manufacturer: { id: "simpson-strong-tie", name: "Simpson Strong-Tie" },
    retrievedAt: "2026-08-14",
    families: [
      {
        id: "simpson-abr-keyhole",
        family: "ABR",
        name: "Vinkelbeslag med noeglehulsribbe",
        category: "angle_bracket",
        sourceUrl: "https://www.strongtie.dk/da-DK/produkter/vinkelbeslag-med-noglehulsribbe-abr",
        fasteners: ["CNA4.0", "CSA5.0"],
        representations: ["symbol", "top", "side", "section", "elevation"],
        variants: [
          { sku: "ABR7015", dimensions: { A: 70, B: 70, C: 55, t: 1.5 }, holes: { flangeA: { 5: 8, 7: 1 }, flangeB: { 5: 8, 9: 1 } }, material: { steelGrade: "S350GD", coating: "Z275" }, weightKg: 0.081, geometry: { status: "pending_import", sourceAsset: "c-abr7015-2do-cad-mult-prod-2.dxf" } },
          { sku: "ABR9020", dimensions: { A: 88, B: 88, C: 65, t: 2 }, holes: { flangeA: { 5: 10, 11: 1 }, flangeB: { 5: 10, 13: 1 } }, material: { steelGrade: "S250GD", coating: "Z275" }, weightKg: 0.17, geometry: { status: "pending_import", sourceAsset: "c-abr9020-2do-cad-mult-prod.dxf" } },
          { sku: "ABR10525", dimensions: { A: 105, B: 105, C: 90, t: 2.5 }, holes: { flangeA: { 5: 10, 11: 2, 14: 1 }, flangeB: { 5: 14, 14: 1 } }, material: { steelGrade: "S350GD", coating: "Z275" }, weightKg: 0.34, geometry: { status: "pending_import", sourceAsset: "c-abr10525-2do-cad-mult-prod.dxf" } },
        ],
      },
      {
        id: "simpson-ewh",
        family: "EWH",
        name: "Bjaelkesko til I-bjaelker",
        category: "joist_hanger",
        sourceUrl: "https://www.strongtie.dk/da-DK/produkter/bjaelkesko-til-i-bjaelker-ewh",
        fasteners: [],
        representations: ["symbol", "top", "side", "section", "elevation"],
        variants: [
          { sku: "EWH195/47", dimensions: { height: 195, width: 47 }, geometry: { status: "pending_import", sourceAsset: "c-ewh195-47-2do-cad-mult-prod.dxf" } },
          { sku: "EWH195/47-BENT", dimensions: { height: 195, width: 47 }, geometry: { status: "pending_import", sourceAsset: "c-ewh195-47-bent-2do-cad-mult-prod.dxf" } },
        ],
      },
      {
        id: "simpson-pb-pbl",
        family: "PB/PBL/PBK/PBE",
        name: "Stolpesko PB og PBL",
        category: "post_base",
        sourceUrl: "https://www.strongtie.dk/da-DK/produkter/stolpesko-pb-og-pbl-pb-pbl-pbk-pbe",
        fasteners: ["CNA4.0x40G", "M8 coach screws"],
        representations: ["symbol", "side", "elevation"],
        variants: [
          { sku: "PB70G-R", dimensions: { A: 70, B: 70, C: 125, F: 250, G: 16, t: 5 }, weightKg: 0.93, geometry: { status: "pending_import", sourceAsset: "pb70g-r-2d.dwg" } },
          { sku: "PBL4540", dimensions: { A: 45, B: 40, C: 90, F: 200, G: 16, t: 4 }, weightKg: 0.42, geometry: { status: "pending_import", sourceAsset: "pbl4540-2d.dwg" } },
          { sku: "PBK60G", dimensions: { A: 70, B: 60, C: 92, F: 200, G: 16, t: 4 }, weightKg: 0.63, geometry: { status: "pending_import", sourceAsset: "pbk60g-2d.dwg" } },
        ],
      },
      {
        id: "simpson-ppb",
        family: "PPB",
        name: "Hoejdejusterbar soejlesko",
        category: "post_base",
        sourceUrl: "https://www.strongtie.dk/da-DK/produkter/stolpesko-ppb",
        fasteners: ["M10 bolts", "M20 threaded rod"],
        representations: ["symbol", "top", "side", "section", "elevation"],
        variants: [{ sku: "PPB70G", dimensions: {}, geometry: { status: "pending_import", sourceAsset: "C_PPB70G_2DO_CAD_MULT_Prod.dxf" } }],
      },
      {
        id: "simpson-np",
        family: "NP",
        name: "Hulplader og hulpladestrimler",
        category: "plates",
        sourceUrl: "https://www.strongtie.dk/da-DK/produkter/hulplader-np",
        fasteners: ["CNA4.0", "CSA5.0"],
        representations: ["symbol", "top", "side", "section", "elevation"],
        variants: [
          { sku: "NP15/100/140", dimensions: { t: 1.5, width: 100, length: 140 }, geometry: { status: "pending_import", sourceAsset: "c-np15-100-140-2do-cad-mult-prod.dxf" } },
          { sku: "NP20/100/1200", dimensions: { t: 2, width: 100, length: 1200 }, sourceUrl: "https://www.strongtie.dk/da-DK/produkter/hulplade-strimler-np-1200", geometry: { status: "pending_import", sourceAsset: "c-np20-100-1200-2do-cad-mult-prod.dxf" } },
        ],
      },
    ],
  },
};

function applyVerifiedManufacturerGeometry(geometryByManufacturer = {}) {
  Object.entries(geometryByManufacturer).forEach(([manufacturerId, geometryBySku]) => {
    const library = manufacturerLibraries[manufacturerId];
    if (!library) return;
    library.families.forEach((family) => {
      family.variants.forEach((variant) => {
        const verified = geometryBySku?.[variant.sku];
        if (verified?.status === "verified" && Array.isArray(verified.elements) && verified.elements.length) {
          variant.geometry = verified;
        }
      });
    });
  });
}

function applyGeneratedManufacturerFamilies(familiesByManufacturer = {}) {
  Object.entries(familiesByManufacturer).forEach(([manufacturerId, generatedFamilies]) => {
    const library = manufacturerLibraries[manufacturerId];
    if (!library || !Array.isArray(generatedFamilies)) return;
    generatedFamilies.forEach((generatedFamily) => {
      const existing = library.families.find((family) => family.id === generatedFamily.id);
      if (existing) {
        const variantsBySku = new Map(existing.variants.map((variant) => [variant.sku, variant]));
        generatedFamily.variants.forEach((variant) => {
          if (!variantsBySku.has(variant.sku)) existing.variants.push(variant);
        });
        existing.representations = generatedFamily.representations || existing.representations;
        return;
      }
      library.families.push(generatedFamily);
    });
  });
}

/* Applied by consumeGeneratedGeometry() once the async bundle has landed. */

function createSvgElement(tag, attrs = {}) {
  const element = document.createElementNS(svgNS, tag);
  Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}

/* --- Batched UI updates --------------------------------------------------
   Selection changes used to re-render the overlay, the property panel and the
   whole element list once per element, which made Ctrl+A quadratic. Everything
   now marks a dirty flag and the real work happens once per animation frame. */
const uiDirty = { overlay: false, selection: false, list: false, props: false };
let uiFrame = 0;

/* rAF is paused while the tab is hidden, so every scheduled job also carries a
   timer fallback; whichever fires first cancels the other. */
function scheduleFrame(callback) {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    clearTimeout(timer);
    callback();
  };
  const raf = requestAnimationFrame(run);
  const timer = setTimeout(run, 120);
  return () => {
    done = true;
    cancelAnimationFrame(raf);
    clearTimeout(timer);
  };
}

function markUi(...parts) {
  parts.forEach((part) => {
    uiDirty[part] = true;
  });
  if (uiFrame) return;
  uiFrame = scheduleFrame(() => {
    uiFrame = 0;
    flushUi();
  });
}

function flushUi() {
  if (uiFrame) {
    uiFrame();
    uiFrame = 0;
  }
  const parts = { ...uiDirty };
  uiDirty.overlay = uiDirty.selection = uiDirty.list = uiDirty.props = false;
  if (parts.selection) updateSelectionUiNow();
  if (parts.props) updatePropertyPanelNow();
  if (parts.list) renderElementListNow();
  if (parts.overlay) renderSelectionOverlayNow();
}

/* --- Geometry caches -----------------------------------------------------
   getBoundingClientRect forces a synchronous layout, and marquee/hover used to
   call it for every element on every pointer move. Both caches are keyed by an
   epoch that any mutation bumps. */
const boundsCache = new WeakMap();
let boundsEpoch = 1;
let snapEpoch = 1;
let snapIndex = null;

function invalidateBounds() {
  boundsEpoch += 1;
}

function invalidateSnapCache() {
  snapEpoch += 1;
  snapIndex = null;
}

/* Call after anything that changes drawing geometry. */
function invalidateGeometry() {
  invalidateBounds();
  invalidateSnapCache();
}

function cloneLayers() {
  return JSON.parse(JSON.stringify(layers));
}

function cleanLayerHtml(layer) {
  const clone = layer.cloneNode(true);
  clone.querySelectorAll(".selected, .hovered").forEach((element) => element.classList.remove("selected", "hovered"));
  clone.querySelectorAll(".snap-marker, .selection-marquee, .placement-ghost, .placement-anchor").forEach((element) => element.remove());
  return clone.innerHTML;
}

/* A clone carries the source's data-eid, and ensureElementIds only fills in
   elements that lack one -- so duplicate, paste, both arrays and the placement
   copy all produced elements sharing an id with their source. reselectByIds
   resolves an id with querySelector (first match), so undo/redo could hand the
   selection to the original instead of the copy. Clones start with no id and
   are given a fresh one on the next ensureElementIds pass. */
function stripElementIds(node) {
  delete node.dataset.eid;
  node.querySelectorAll?.("[data-eid]").forEach((child) => { delete child.dataset.eid; });
}

/* Every drawing item carries a stable id so that undo/redo -- which replaces
   innerHTML and therefore every DOM node -- can put the selection back. */
let elementIdCounter = 0;

function ensureElementIds(root = drawingLayer) {
  root.querySelectorAll(".draw-item").forEach((element) => {
    if (!element.dataset.eid) {
      elementIdCounter += 1;
      element.dataset.eid = `e${Date.now().toString(36)}${elementIdCounter.toString(36)}`;
    }
  });
}

function captureState() {
  ensureElementIds();
  return {
    drawing: cleanLayerHtml(drawingLayer),
    underlay: underlayDescriptor(),
    scale: currentScaleValue,
    gridSize: gridSize.value,
    activeLayer: activeLayer.value,
    underlayOpacity: underlayOpacity.value,
    underlayScale: underlayScale.value,
    underlayLocked: underlayLocked.checked,
    layers: cloneLayers(),
    sheet: { paper: sheet.paper, widthMm: sheet.widthMm, heightMm: sheet.heightMm, plotScale: sheet.plotScale },
    selection: Array.from(selectedElements).map((element) => element.dataset.eid).filter(Boolean),
  };
}

function reselectByIds(ids = []) {
  selectedElements.forEach((element) => element.classList.remove("selected"));
  selectedElements.clear();
  ids.forEach((id) => {
    const element = drawingLayer.querySelector(`.draw-item[data-eid="${id}"]`);
    if (element && !isElementLocked(element)) {
      selectedElements.add(element);
      element.classList.add("selected");
    }
  });
  updateSelectionUi();
}

function restoreState(state) {
  if (!state) return;
  isRestoringHistory = true;
  invalidateGeometry();
  drawingLayer.innerHTML = state.drawing || "";
  applyUnderlayDescriptor(state.underlay);
  currentScaleValue = Number(state.scale || 1);
  gridSize.value = state.gridSize || gridSize.value;
  activeLayer.value = state.activeLayer || activeLayer.value;
  underlayOpacity.value = state.underlayOpacity || underlayOpacity.value;
  underlayScale.value = state.underlayScale || underlayScale.value;
  underlayLocked.checked = Boolean(state.underlayLocked);
  if (state.sheet && state.sheet.widthMm && state.sheet.widthMm !== sheet.widthMm) {
    setSheet({ ...state.sheet }, { silent: true });
  }
  Object.entries(state.layers || {}).forEach(([key, value]) => {
    if (layers[key]) Object.assign(layers[key], value);
  });
  underlayOpacityValue.textContent = `${underlayOpacity.value}%`;
  underlayScaleValue.textContent = `${underlayScale.value}%`;
  let option = Array.from(scaleFactor.options).find((item) => item.value === String(currentScaleValue));
  if (!option) {
    option = new Option(`Kalibreret: 1 enhed = ${currentScaleValue.toFixed(3)} mm`, String(currentScaleValue));
    scaleFactor.append(option);
  }
  scaleFactor.value = String(currentScaleValue);
  scaleStatus.textContent = `Skala: 1 enhed = ${currentScaleValue.toFixed(3)} mm`;
  renderLayerList();
  updateLayerVisibility();
  updateAllMeasures();
  ensureTextScaleMetadata();
  renderElementList();
  reselectByIds(state.selection || []);
  isRestoringHistory = false;
}

function historyFingerprint(state) {
  /* Selection is deliberately excluded: selecting something is not an edit. */
  return `${state.drawing}\u0000${JSON.stringify(state.underlay)}\u0000${state.scale}\u0000${state.gridSize}\u0000${state.activeLayer}\u0000${state.underlayOpacity}\u0000${state.underlayScale}\u0000${state.underlayLocked}\u0000${JSON.stringify(state.layers)}\u0000${JSON.stringify(state.sheet)}`;
}

function pushHistory() {
  if (isRestoringHistory) return;
  if (historyTimer) {
    clearTimeout(historyTimer);
    historyTimer = 0;
  }
  invalidateGeometry();
  const state = captureState();
  const fingerprint = historyFingerprint(state);
  const current = historyStack[historyPointer];
  if (current && current.fingerprint === fingerprint) {
    /* Same drawing, possibly a new selection: keep the newest selection so
       undo returns you to what you were actually working on. */
    current.selection = state.selection;
    return;
  }
  state.fingerprint = fingerprint;
  state.bytes = fingerprint.length;
  historyStack.splice(historyPointer + 1);
  historyStack.push(state);
  trimHistory();
  historyPointer = historyStack.length - 1;
  updateHistoryButtons();
  renderElementList();
  scheduleAutosave();
}

/* Big drawings make each snapshot large, so the stack is bounded by bytes as
   well as by entry count. */
function trimHistory() {
  let total = historyStack.reduce((sum, entry) => sum + (entry.bytes || 0), 0);
  while (historyStack.length > 2 && (historyStack.length > maxHistory || total > historyByteBudget)) {
    const dropped = historyStack.shift();
    total -= dropped.bytes || 0;
  }
}

/* Continuous controls (sliders, text fields) commit one entry when they settle
   instead of one per input event. */
function pushHistorySoon(delay = 450) {
  if (isRestoringHistory) return;
  if (historyTimer) clearTimeout(historyTimer);
  historyTimer = setTimeout(() => {
    historyTimer = 0;
    pushHistory();
  }, delay);
}

function undo() {
  if (historyTimer) {
    clearTimeout(historyTimer);
    historyTimer = 0;
    pushHistory();
  }
  if (historyPointer <= 0) return;
  historyPointer -= 1;
  restoreState(historyStack[historyPointer]);
  updateHistoryButtons();
  scheduleAutosave();
  statusText.textContent = `Fortryd (${historyPointer + 1}/${historyStack.length}).`;
}

function redo() {
  if (historyPointer >= historyStack.length - 1) return;
  historyPointer += 1;
  restoreState(historyStack[historyPointer]);
  updateHistoryButtons();
  scheduleAutosave();
  statusText.textContent = `Gendan (${historyPointer + 1}/${historyStack.length}).`;
}

function updateHistoryButtons() {
  const undoButton = document.getElementById("undoAction");
  const redoButton = document.getElementById("redoAction");
  if (undoButton) undoButton.disabled = historyPointer <= 0;
  if (redoButton) redoButton.disabled = historyPointer >= historyStack.length - 1;
}

function trackControlHistory(control) {
  control.addEventListener("pointerdown", () => {
    if (!control.dataset.historyEditing) {
      pushHistory();
      control.dataset.historyEditing = "true";
    }
  });
  control.addEventListener("focusin", () => {
    if (!control.dataset.historyEditing) {
      pushHistory();
      control.dataset.historyEditing = "true";
    }
  });
  ["change", "blur"].forEach((eventName) => {
    control.addEventListener(eventName, () => {
      delete control.dataset.historyEditing;
    });
  });
}

function underlayBox() {
  const scale = Number(underlayScale.value) / 100;
  const width = 1400 * scale;
  const height = 900 * scale;
  return {
    x: (1400 - width) / 2,
    y: (900 - height) / 2,
    width,
    height,
  };
}

function applyUnderlayBox() {
  const box = underlayBox();
  underlayLayer.querySelectorAll(".plan-underlay").forEach((element) => {
    Object.entries(box).forEach(([key, value]) => element.setAttribute(key, value));
  });
}

function getScaleValue() {
  return currentScaleValue;
}

function mmToDrawing(mm) {
  return Number(mm) / getScaleValue();
}

function setScaleValue(value, label = "Kalibreret") {
  currentScaleValue = Number(value) || 1;
  let option = Array.from(scaleFactor.options).find((item) => item.value === String(currentScaleValue));
  if (!option) {
    option = new Option(`${label}: 1 enhed = ${currentScaleValue.toFixed(3)} mm`, String(currentScaleValue));
    scaleFactor.append(option);
  }
  scaleFactor.value = String(currentScaleValue);
  scaleStatus.textContent = `${label}: 1 enhed = ${currentScaleValue.toFixed(3)} mm`;
  updateAllMeasures();
  updateCatalogElements();
  pushHistory();
}

function elementLayer(element) {
  return element.dataset.layer || "revision";
}

function applyLayer(element, layer = activeLayer.value) {
  element.dataset.layer = layer;
  element.style.display = layers[layer]?.visible === false ? "none" : "";
  return element;
}

function isLayerLocked(layer) {
  if (layer === "underlay") return underlayLocked.checked || layers.underlay.locked;
  return layers[layer]?.locked;
}

function currentDrawStyle() {
  return {
    color: strokeColor.value,
    width: Number(strokeWidth.value || 3),
    lineType: lineTypeSelect.value || "solid",
    opacity: Number(strokeOpacity.value || 100),
  };
}

function strokeTargets(element) {
  const selector = "line, rect, circle, path, polygon";
  const targets = Array.from(element.querySelectorAll(selector));
  if (element.matches(selector)) targets.unshift(element);
  return targets;
}

/* Geometry traced from a manufacturer's DXF carries the pen weight the
   manufacturer drew it with, per primitive -- outline heavy, hole circles and
   fold lines fine. That hierarchy is most of what makes the part look like the
   real product. A blanket group lineweight flattened all of it to one weight,
   so the bracket came in uniformly thick and subtly wrong. These children own
   their weight; only an explicit edit of the traced geometry should change it. */
function penTargets(element) {
  return strokeTargets(element).filter((child) => child.dataset.pen !== "own");
}

function applyLineType(element, lineType) {
  element.dataset.lineType = lineType;
  const dash = lineStyleMap[lineType] ?? "";
  strokeTargets(element).forEach((child) => {
    child.setAttribute("stroke-dasharray", dash);
  });
}

/* `width` is a paper millimetre value; the attribute written to the DOM is in
   model units so the printed weight is independent of the plot scale. */
function applyStrokeWidth(element, width) {
  element.dataset.strokeWidth = String(width);
  const units = paperMmToUnits(width);
  penTargets(element).forEach((child) => {
    child.setAttribute("stroke-width", units);
  });
}

function applyOpacity(element, opacityPercent) {
  const opacity = Math.max(0.1, Math.min(1, Number(opacityPercent || 100) / 100));
  element.dataset.opacity = String(Math.round(opacity * 100));
  element.setAttribute("opacity", opacity);
}

function applyDrawStyle(element, style = currentDrawStyle()) {
  applyColor(element, style.color);
  applyStrokeWidth(element, style.width);
  applyLineType(element, style.lineType);
  applyOpacity(element, style.opacity);
  return element;
}

function elementStyle(element) {
  return {
    color: element.dataset.color || strokeColor.value,
    width: Number(element.dataset.strokeWidth || strokeWidth.value || 3),
    lineType: element.dataset.lineType || "solid",
    opacity: Number(element.dataset.opacity || 100),
  };
}

function getSelectedPrimary() {
  return selectedElements.size === 1 ? Array.from(selectedElements)[0] : null;
}

function transformInfo(element) {
  const transform = element.transform?.baseVal?.consolidate();
  const matrix = transform ? transform.matrix : svg.createSVGMatrix();
  const rotation = Number(element.dataset.rotation || 0);
  return { x: matrix.e, y: matrix.f, rotation };
}

function setElementRotation(element, angle) {
  invalidateGeometry();
  const previous = Number(element.dataset.rotation || 0);
  element.dataset.rotation = String(angle);
  const delta = angle - previous;
  if (!delta) return;
  /* Rotate the transform the element already has, rather than rebuilding it as
     translate+rotate. The old form read back only the matrix translation and
     discarded a/b/c/d, so typing one character into any property field silently
     undid a mirror or a grip resize -- the reflection simply vanished. */
  const transform = element.transform?.baseVal?.consolidate();
  const matrix = transform ? transform.matrix : svg.createSVGMatrix();
  element.transform.baseVal.initialize(svg.createSVGTransformFromMatrix(matrix.rotate(delta)));
}

function describeElement(element) {
  const type = element.dataset.type || element.tagName.toLowerCase();
  if (type === "profile") return element.dataset.dimension || profileCatalog[element.dataset.profile]?.name || element.dataset.profile;
  if (type === "bolt") return element.dataset.dimension || `${element.dataset.bolt || ""} ${element.dataset.grade || ""}`.trim();
  if (type === "boltSide") return element.dataset.dimension || `${element.dataset.bolt || "Bolt"} side view`;
  if (type === "screw") return element.dataset.dimension || screwByKey(element.dataset.screw).screw.name;
  if (type === "fastenerMarker") return element.dataset.dimension || "Fastener marker";
  if (type === "profileMember") return element.dataset.dimension || profileCatalog[element.dataset.profile]?.name || "Profile member";
  if (type === "hatch") return element.dataset.hatch;
  if (type === "polygon") return element.dataset.dimension || "Plate outline";
  /* A dimension with no override still has an identity: the length it states.
     Returning "" left the only object type whose whole job is a number showing
     a blank name in the properties panel and in every leader that tags it. */
  if (type === "measure") return element.dataset.customText || elementLength(element) || "Maal";
  if (type === "loadArrow") return element.dataset.dimension || "Last";
  if (type === "leader") return element.dataset.dimension || "Leader note";
  if (type === "weld") return element.dataset.dimension || "Svejsning";
  if (type === "detailTitle") return element.dataset.detailId || "Detail";
  if (type === "detailViewport") return `${element.dataset.detailId || "Detail"} ${element.dataset.dimension || ""}`.trim();
  if (type === "detailTemplate") return element.dataset.dimension || "Detail template";
  if (type === "sheetFrame") return "Sheet frame";
  if (type === "manufacturerComponent") return `${element.dataset.manufacturer || ""} ${element.dataset.variant || element.dataset.family || ""}`.trim();
  if (type === "connection") return element.dataset.dimension || "Samling";
  if (type === "libraryComponent") return element.dataset.dimension || "Library component";
  if (type === "polyline") return (element.dataset.closed === "true" ? "Lukket polylinje" : "Polylinje") + " - " + polylinePoints(element).length + " punkter";
  if (type === "arrow") return "Pil";
  return element.dataset.symbol || type;
}

function safeMetadata(element) {
  try {
    return element.dataset.metadata ? JSON.parse(element.dataset.metadata) : {};
  } catch (error) {
    return {};
  }
}

function tagForElement(element) {
  const type = element.dataset.type || element.tagName.toLowerCase();
  const layer = elementLayer(element);
  const material = element.dataset.material || "";
  if (type === "profile" || type === "profileMember") {
    const profile = profileCatalog[element.dataset.profile];
    const name = element.dataset.dimension || profile?.name || element.dataset.profile || "STEEL PROFILE";
    const length = elementLength(element);
    return [name.toUpperCase(), material || "S355", length && `L=${length}`].filter(Boolean).join("|");
  }
  if (type === "bolt" || type === "boltSide") {
    const bolt = boltCatalog[element.dataset.bolt];
    return [`${element.dataset.bolt || "BOLT"} GRADE ${element.dataset.grade || material || "8.8"}`, bolt ? `HOLE Ø${boltHoleMm(bolt)}` : "", type === "boltSide" ? "SIDE VIEW" : "TOP VIEW"].filter(Boolean).join("|");
  }
  if (type === "screw") {
    const found = screwByKey(element.dataset.screw);
    return [found.screw.name.toUpperCase(), found.family.name, found.screw.bit ? `BIT ${found.screw.bit}` : ""].filter(Boolean).join("|");
  }
  if (type === "manufacturerComponent") {
    const metadata = safeMetadata(element);
    const dims = metadata.dimensions
      ? Object.entries(metadata.dimensions).slice(0, 3).map(([key, value]) => `${key}=${value}`).join(" ")
      : "";
    return [element.dataset.manufacturer || "MANUFACTURER", element.dataset.variant || element.dataset.family || "COMPONENT", dims, material].filter(Boolean).join("|");
  }
  if (type === "libraryComponent") {
    return [element.dataset.dimension || "COMPONENT", element.dataset.componentCategory || "", material].filter(Boolean).join("|");
  }
  if (type === "weld") {
    return [element.dataset.dimension || "FILLET WELD", elementLength(element)].filter(Boolean).join("|");
  }
  if (type === "hatch") {
    return [`${String(element.dataset.hatch || "MATERIAL").toUpperCase()} HATCH`, layer].filter(Boolean).join("|");
  }
  if (type === "measure") {
    return [`DIMENSION`, element.dataset.customText || elementLength(element)].filter(Boolean).join("|");
  }
  if (type === "fastenerMarker") return element.dataset.dimension || "FASTENER";
  if (type === "symbol") return [String(element.dataset.symbol || "SYMBOL").toUpperCase(), element.dataset.dimension || ""].filter(Boolean).join("|");
  return [describeElement(element), material, layer].filter(Boolean).join("|");
}

function elementLength(element) {
  if (element.dataset.type === "polyline") return formatDistance(polylineLengthMm(element));
  if (["measure", "arrow", "loadArrow", "leader", "weld", "breakLine"].includes(element.dataset.type)) {
    const dx = Number(element.dataset.endX) - Number(element.dataset.startX);
    const dy = Number(element.dataset.endY) - Number(element.dataset.startY);
    return formatDistance(Math.hypot(dx, dy) * getScaleValue());
  }
  if (element.dataset.type === "profileMember") {
    const dx = Number(element.dataset.endX) - Number(element.dataset.startX);
    const dy = Number(element.dataset.endY) - Number(element.dataset.startY);
    return formatDistance(Math.hypot(dx, dy) * getScaleValue());
  }
  if (element.dataset.scaleX || element.dataset.scaleY) {
    const sx = Number(element.dataset.scaleX || 1);
    const sy = Number(element.dataset.scaleY || 1);
    return `${Math.round(sx * 100)}% x ${Math.round(sy * 100)}%`;
  }
  if (element.dataset.type === "line") {
    const dx = Number(element.getAttribute("x2")) - Number(element.getAttribute("x1"));
    const dy = Number(element.getAttribute("y2")) - Number(element.getAttribute("y1"));
    return formatDistance(Math.hypot(dx, dy) * getScaleValue());
  }
  return "";
}

function updatePropertyPanel() {
  markUi("props");
}

function updatePropertyPanelNow() {
  const element = getSelectedPrimary();
  propertyEmpty.hidden = Boolean(element);
  propertyForm.hidden = !element;
  if (!element) return;

  /* Every keystroke in a property field runs updateSelectedFromProperties,
     which ends by refreshing this panel -- so the refresh was overwriting the
     very field being typed in, resetting the caret mid-number. Typing "0.35"
     never survived; only the spinner arrows did, because they never produce an
     intermediate value. While focus is inside the form the fields already show
     what the user meant, so leave them alone. */
  if (propertyForm.contains(document.activeElement)) return;

  propType.value = element.dataset.type || element.tagName.toLowerCase();
  propDimension.value = describeElement(element) || "";
  propMaterial.value = element.dataset.material || "";
  propManufacturer.value = element.dataset.manufacturer || "";
  propFamily.value = element.dataset.family || "";
  propProduct.value = element.dataset.variant || "";
  propSourceUrl.value = element.dataset.sourceUrl || "";
  propLength.value = elementLength(element);
  propRotation.value = element.dataset.rotation || "0";
  propStrokeWidth.value = element.dataset.strokeWidth || strokeWidth.value;
  propOpacity.value = element.dataset.opacity || "100";
  propLayer.value = elementLayer(element);
  propColor.value = element.dataset.color || element.getAttribute("stroke") || element.getAttribute("color") || strokeColor.value;
  propLineType.value = element.dataset.lineType || "solid";
  propMeasureText.value = element.dataset.customText || "";
  propMeasureMode.value = element.dataset.measureMode || "actual";
  propMeasureOffset.value = element.dataset.measureOffset || "24";
  if (element.dataset.type === "bolt" || element.dataset.type === "boltSide") syncBoltInputsFromElement(element);
}

/* Selecting a bolt loads its parameters back into the panel, so the controls
   describe the thing on screen instead of whatever was last placed.

   The field being typed in is skipped: this runs on every keystroke via
   updatePropertyPanel, and writing .value back mid-number resets the caret --
   the same bug the property form guards against by bailing out on focus. */
function syncBoltInputsFromElement(element) {
  const options = boltOptionsFrom(element);
  const set = (control, value) => {
    if (!control || control === document.activeElement) return;
    control.value = value;
  };
  const check = (control, value) => {
    if (!control || control === document.activeElement) return;
    control.checked = Boolean(value);
  };
  if (boltCatalog[element.dataset.bolt]) set(boltSelect, element.dataset.bolt);
  if (element.dataset.grade) set(boltGrade, element.dataset.grade);
  if (element.dataset.type === "bolt") set(boltViewSelect, element.dataset.showHead === "true" ? "head" : "hole");
  set(boltHeadForm, options.headType);
  set(boltLengthInput, Number.isFinite(options.length) ? String(options.length) : "");
  set(boltThreadInput, Number.isFinite(options.threadLength) ? String(options.threadLength) : "");
  set(boltExtensionInput, String(options.extension || 0));
  check(boltShowShank, options.showShank);
  check(boltSymbolic, options.symbolic);
  check(boltShowNut, options.showNut);
  check(boltThinNut, options.thinNut);
  check(boltNutWasher, options.nutWasher);
  check(boltHeadWasher, options.headWasher);
  check(boltSpringWasher, options.springWasher);
}

function centerPoint() {
  return snapPoint({ x: view.x + view.width / 2, y: view.y + view.height / 2 });
}

function getPointerPoint(event, shouldSnap = true) {
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const transformed = point.matrixTransform(svg.getScreenCTM().inverse());
  const rawPoint = { x: transformed.x, y: transformed.y };
  return shouldSnap ? snapPoint(rawPoint, event) : rawPoint;
}

/* Authored coordinates inside an element -> drawing-layer coordinates.

   getCTM() alone maps to the root SVG viewport, so it folds in the viewBox --
   i.e. the current zoom and pan. Snap candidates taken from primitives are raw
   user-space attributes, so mixing the two put every component's child geometry
   in a different coordinate system than the lines next to it, and the two only
   agreed at 100% zoom with no pan. Composing with the inverse of the drawing
   layer's own CTM cancels the viewport out and leaves pure user space. */
function pointInCanvasFromElement(element, x, y) {
  const point = svg.createSVGPoint();
  point.x = x;
  point.y = y;
  const matrix = element.getCTM();
  const base = drawingLayer.getCTM();
  if (!matrix || !base) return { x, y };
  const transformed = point.matrixTransform(base.inverse().multiply(matrix));
  return { x: transformed.x, y: transformed.y };
}

function addGroupedGeometrySnapCandidates(element, candidates, segments) {
  element.querySelectorAll("line, circle, rect, polyline, polygon").forEach((child) => {
    if (child.closest(".selection-overlay")) return;
    if (child.tagName.toLowerCase() === "line") {
      const p1 = pointInCanvasFromElement(child, Number(child.getAttribute("x1")), Number(child.getAttribute("y1")));
      const p2 = pointInCanvasFromElement(child, Number(child.getAttribute("x2")), Number(child.getAttribute("y2")));
      candidates.push(
        { x: p1.x, y: p1.y, kind: "endpoint" },
        { x: p2.x, y: p2.y, kind: "endpoint" },
        { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2, kind: "midpoint" }
      );
      segments.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
    }
    if (child.tagName.toLowerCase() === "circle") {
      const center = pointInCanvasFromElement(child, Number(child.getAttribute("cx")), Number(child.getAttribute("cy")));
      candidates.push({ x: center.x, y: center.y, kind: "center" });
    }
    if (child.tagName.toLowerCase() === "rect") {
      const x = Number(child.getAttribute("x"));
      const y = Number(child.getAttribute("y"));
      const width = Number(child.getAttribute("width"));
      const height = Number(child.getAttribute("height"));
      const corners = [
        pointInCanvasFromElement(child, x, y),
        pointInCanvasFromElement(child, x + width, y),
        pointInCanvasFromElement(child, x, y + height),
        pointInCanvasFromElement(child, x + width, y + height),
      ].map((corner) => ({ x: corner.x, y: corner.y, kind: "corner" }));
      const middle = pointInCanvasFromElement(child, x + width / 2, y + height / 2);
      candidates.push(...corners, { x: middle.x, y: middle.y, kind: "center" });
    }
    if (child.tagName.toLowerCase() === "polyline" || child.tagName.toLowerCase() === "polygon") {
      const points = Array.from(child.points || []).map((point) => pointInCanvasFromElement(child, point.x, point.y));
      points.forEach((point, index) => {
        candidates.push({ x: point.x, y: point.y, kind: "endpoint" });
        const next = points[index + 1];
        if (next) {
          candidates.push({ x: (point.x + next.x) / 2, y: (point.y + next.y) / 2, kind: "midpoint" });
          segments.push({ x1: point.x, y1: point.y, x2: next.x, y2: next.y });
        }
      });
    }
  });
}

function collectSnapCandidates() {
  return buildSnapIndex().points;
}

/* Leaf primitives describe themselves through their own attributes; every
   other object type is a <g> whose children carry the geometry. */
const SNAP_PRIMITIVE_TYPES = new Set([
  "line", "rect", "hatch", "circle",
  "measure", "arrow", "loadArrow", "leader", "profileMember",
]);

function collectSnapGeometry() {
  const candidates = [];
  const segments = [];
  drawingLayer.querySelectorAll(".draw-item").forEach((element) => {
    if (element.style.display === "none") return;
    const type = element.dataset.type;
    if (type === "polyline") {
      const pts = polylinePoints(element).map(([x, y]) => pointInCanvasFromElement(element, x, y));
      pts.forEach((p, i) => {
        candidates.push({ x: p.x, y: p.y, kind: "endpoint" });
        const next = pts[i + 1];
        if (next) {
          candidates.push({ x: (p.x + next.x) / 2, y: (p.y + next.y) / 2, kind: "midpoint" });
          segments.push({ x1: p.x, y1: p.y, x2: next.x, y2: next.y });
        }
      });
      if (element.dataset.closed === "true" && pts.length > 2) {
        segments.push({ x1: pts.at(-1).x, y1: pts.at(-1).y, x2: pts[0].x, y2: pts[0].y });
      }
    }
    if (type === "line") {
      const x1 = Number(element.getAttribute("x1"));
      const y1 = Number(element.getAttribute("y1"));
      const x2 = Number(element.getAttribute("x2"));
      const y2 = Number(element.getAttribute("y2"));
      candidates.push(
        { x: x1, y: y1, kind: "endpoint" },
        { x: x2, y: y2, kind: "endpoint" },
        { x: (x1 + x2) / 2, y: (y1 + y2) / 2, kind: "midpoint" }
      );
      segments.push({ x1, y1, x2, y2 });
    }
    if (type === "measure" || type === "arrow" || type === "loadArrow" || type === "leader" || type === "breakLine" || type === "profileMember") {
      /* startX/startY are authored coordinates, so they have to go through the
         element's own transform to land in canvas space. Reading them raw meant
         a dimension that had been moved still offered its snap points back at
         the position it was created at. */
      const a = pointInCanvasFromElement(element, Number(element.dataset.startX), Number(element.dataset.startY));
      const b = pointInCanvasFromElement(element, Number(element.dataset.endX), Number(element.dataset.endY));
      candidates.push(
        { x: a.x, y: a.y, kind: "endpoint" },
        { x: b.x, y: b.y, kind: "endpoint" },
        { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, kind: "midpoint" }
      );
      segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }
    if ((type === "rect" || type === "hatch") && element.tagName.toLowerCase() === "rect") {
      const x = Number(element.getAttribute("x"));
      const y = Number(element.getAttribute("y"));
      const width = Number(element.getAttribute("width"));
      const height = Number(element.getAttribute("height"));
      candidates.push(
        { x, y, kind: "endpoint" },
        { x: x + width, y, kind: "endpoint" },
        { x, y: y + height, kind: "endpoint" },
        { x: x + width, y: y + height, kind: "endpoint" },
        { x: x + width / 2, y: y + height / 2, kind: "center" },
        { x: x + width / 2, y, kind: "midpoint" },
        { x: x + width / 2, y: y + height, kind: "midpoint" },
        { x, y: y + height / 2, kind: "midpoint" },
        { x: x + width, y: y + height / 2, kind: "midpoint" }
      );
      segments.push(
        { x1: x, y1: y, x2: x + width, y2: y },
        { x1: x + width, y1: y, x2: x + width, y2: y + height },
        { x1: x + width, y1: y + height, x2: x, y2: y + height },
        { x1: x, y1: y + height, x2: x, y2: y }
      );
    }
    if (type === "circle") {
      const cx = Number(element.getAttribute("cx"));
      const cy = Number(element.getAttribute("cy"));
      const r = Number(element.getAttribute("r"));
      candidates.push(
        { x: cx, y: cy, kind: "center" },
        { x: cx + r, y: cy, kind: "quadrant" },
        { x: cx - r, y: cy, kind: "quadrant" },
        { x: cx, y: cy + r, kind: "quadrant" },
        { x: cx, y: cy - r, kind: "quadrant" }
      );
    }
    /* Anything that is not one of the leaf primitives above draws its geometry
       as children, so it contributes them. This used to be a hardcoded list of
       eight component types, which silently excluded group, weld, connection,
       detailTemplate and fastenerMarker -- grouping two members removed both
       from snapping, and the app's best structural object could not be snapped
       to at all. */
    if (!SNAP_PRIMITIVE_TYPES.has(type) && element.tagName.toLowerCase() === "g") {
      const box = getElementBounds(element);
      candidates.push(
        { x: box.x, y: box.y, kind: "corner" },
        { x: box.x + box.width, y: box.y, kind: "corner" },
        { x: box.x, y: box.y + box.height, kind: "corner" },
        { x: box.x + box.width, y: box.y + box.height, kind: "corner" },
        { x: box.x + box.width / 2, y: box.y + box.height / 2, kind: "center" }
      );
      addGroupedGeometrySnapCandidates(element, candidates, segments);
    }
  });
  return { candidates, segments };
}

/* Snap kinds are ranked, not just distance-sorted: a slightly more distant
   endpoint still beats a point that merely lies on a line, which is what makes
   snapping feel deliberate instead of twitchy. */
const snapKindBonus = { endpoint: 7, intersection: 5, midpoint: 4, center: 4, quadrant: 2, perpendicular: 0, grid: 0 };
const snapKindLabel = {
  endpoint: "Endepunkt",
  intersection: "Skæring",
  midpoint: "Midtpunkt",
  center: "Centrum",
  quadrant: "Kvadrant",
  perpendicular: "På linje",
  grid: "Gitter",
};
const snapCellSize = 120;

function snapCellKey(x, y) {
  return `${Math.floor(x / snapCellSize)}:${Math.floor(y / snapCellSize)}`;
}

function buildSnapIndex() {
  if (snapIndex && snapIndex.epoch === snapEpoch) return snapIndex;
  const { candidates, segments } = collectSnapGeometry();
  const pointBuckets = new Map();
  const segmentBuckets = new Map();
  candidates.forEach((point) => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    const key = snapCellKey(point.x, point.y);
    if (!pointBuckets.has(key)) pointBuckets.set(key, []);
    pointBuckets.get(key).push(point);
  });
  segments.forEach((segment) => {
    const minX = Math.min(segment.x1, segment.x2);
    const maxX = Math.max(segment.x1, segment.x2);
    const minY = Math.min(segment.y1, segment.y2);
    const maxY = Math.max(segment.y1, segment.y2);
    if (!Number.isFinite(minX) || !Number.isFinite(minY)) return;
    /* A long line crosses many cells; registering it in each cell along its
       bounding box keeps the per-query segment set small. */
    for (let cx = Math.floor(minX / snapCellSize); cx <= Math.floor(maxX / snapCellSize); cx += 1) {
      for (let cy = Math.floor(minY / snapCellSize); cy <= Math.floor(maxY / snapCellSize); cy += 1) {
        const key = `${cx}:${cy}`;
        if (!segmentBuckets.has(key)) segmentBuckets.set(key, []);
        segmentBuckets.get(key).push(segment);
      }
    }
  });
  snapIndex = { epoch: snapEpoch, points: candidates, segments, pointBuckets, segmentBuckets };
  return snapIndex;
}

function snapNeighbourhood(bucketMap, point, radius) {
  const found = [];
  const minCx = Math.floor((point.x - radius) / snapCellSize);
  const maxCx = Math.floor((point.x + radius) / snapCellSize);
  const minCy = Math.floor((point.y - radius) / snapCellSize);
  const maxCy = Math.floor((point.y + radius) / snapCellSize);
  for (let cx = minCx; cx <= maxCx; cx += 1) {
    for (let cy = minCy; cy <= maxCy; cy += 1) {
      const bucket = bucketMap.get(`${cx}:${cy}`);
      if (bucket) found.push(...bucket);
    }
  }
  return found;
}

function projectOnSegment(point, segment) {
  const dx = segment.x2 - segment.x1;
  const dy = segment.y2 - segment.y1;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return null;
  const t = Math.max(0, Math.min(1, ((point.x - segment.x1) * dx + (point.y - segment.y1) * dy) / lengthSquared));
  return { x: segment.x1 + t * dx, y: segment.y1 + t * dy };
}

function segmentIntersection(a, b) {
  const d = (a.x1 - a.x2) * (b.y1 - b.y2) - (a.y1 - a.y2) * (b.x1 - b.x2);
  if (Math.abs(d) < 0.0001) return null;
  const px = ((a.x1 * a.y2 - a.y1 * a.x2) * (b.x1 - b.x2) - (a.x1 - a.x2) * (b.x1 * b.y2 - b.y1 * b.x2)) / d;
  const py = ((a.x1 * a.y2 - a.y1 * a.x2) * (b.y1 - b.y2) - (a.y1 - a.y2) * (b.x1 * b.y2 - b.y1 * b.x2)) / d;
  const within = (segment) =>
    px >= Math.min(segment.x1, segment.x2) - 0.01 &&
    px <= Math.max(segment.x1, segment.x2) + 0.01 &&
    py >= Math.min(segment.y1, segment.y2) - 0.01 &&
    py <= Math.max(segment.y1, segment.y2) + 0.01;
  return within(a) && within(b) ? { x: px, y: py } : null;
}

function nearestCandidate(point) {
  const threshold = 14 / zoom;
  const index = buildSnapIndex();
  let best = null;
  const consider = (candidate, kind) => {
    const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
    if (distance > threshold) return;
    const score = distance - (snapKindBonus[kind] || 0) / zoom;
    if (!best || score < best.score) best = { x: candidate.x, y: candidate.y, kind, distance, score };
  };

  snapNeighbourhood(index.pointBuckets, point, threshold).forEach((candidate) => {
    consider(candidate, candidate.kind || "endpoint");
  });

  const nearbySegments = snapNeighbourhood(index.segmentBuckets, point, threshold);
  const uniqueSegments = nearbySegments.length > 24 ? nearbySegments.slice(0, 24) : nearbySegments;
  uniqueSegments.forEach((segment) => {
    const projected = projectOnSegment(point, segment);
    if (projected) consider(projected, "perpendicular");
  });
  /* Intersections are only computed for the handful of segments near the
     cursor rather than for every pair in the drawing. */
  for (let i = 0; i < uniqueSegments.length; i += 1) {
    for (let j = i + 1; j < uniqueSegments.length; j += 1) {
      const intersection = segmentIntersection(uniqueSegments[i], uniqueSegments[j]);
      if (intersection) consider(intersection, "intersection");
    }
  }
  return best;
}

function constrainAngle(point, origin) {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const distance = Math.hypot(dx, dy);
  if (!distance) return point;
  const angle = Math.atan2(dy, dx);
  const step = Math.PI / 4;
  const snapped = Math.round(angle / step) * step;
  return {
    x: origin.x + Math.cos(snapped) * distance,
    y: origin.y + Math.sin(snapped) * distance,
  };
}

let snapMarkerNode = null;

function showSnapMarker(point, kind = "endpoint") {
  if (!point) {
    if (snapMarkerNode) snapMarkerNode.style.display = "none";
    return;
  }
  if (!snapMarkerNode || !snapMarkerNode.isConnected) {
    snapMarkerNode = createSvgElement("g", { class: "snap-marker" });
    snapMarkerNode.append(
      createSvgElement("rect", { class: "snap-marker-shape" }),
      createSvgElement("text", { class: "snap-marker-label" })
    );
    previewLayer.append(snapMarkerNode);
  }
  const size = 5 / zoom;
  const shape = snapMarkerNode.firstElementChild;
  const label = snapMarkerNode.lastElementChild;
  shape.setAttribute("x", point.x - size);
  shape.setAttribute("y", point.y - size);
  shape.setAttribute("width", size * 2);
  shape.setAttribute("height", size * 2);
  shape.setAttribute("rx", kind === "endpoint" || kind === "corner" ? 0 : size);
  label.setAttribute("x", point.x + size * 1.8);
  label.setAttribute("y", point.y - size * 1.4);
  label.setAttribute("font-size", 10 / zoom);
  label.textContent = snapKindLabel[kind] || "";
  snapMarkerNode.dataset.snapKind = kind;
  snapMarkerNode.style.display = "";
  activeSnapKind = kind;
}

let activeSnapKind = null;

function snapPoint(point, event = null) {
  if (!snapToggle.checked || event?.altKey) {
    activeSnapKind = null;
    showSnapMarker(null);
    return event?.shiftKey && startPoint ? constrainAngle(point, startPoint) : point;
  }
  const size = Number(gridSize.value);
  let next = {
    x: Math.round(point.x / size) * size,
    y: Math.round(point.y / size) * size,
  };
  activeSnapKind = "grid";
  const candidate = nearestCandidate(point);
  if (candidate) {
    next = { x: candidate.x, y: candidate.y };
    showSnapMarker(next, candidate.kind);
  } else {
    showSnapMarker(null);
    activeSnapKind = null;
  }
  if (event?.shiftKey && startPoint) next = constrainAngle(next, startPoint);
  return next;
}

function openPanel(panelName) {
  document.body.dataset.openPanel = panelName || "";
  document.body.dataset.panelOpen = "true";
  if (panelName === "elements") markUi("list");
  panelToggles.forEach((button) => {
    button.classList.toggle("active", button.dataset.panelTarget === panelName);
  });
  panelSections.forEach((section) => {
    section.classList.toggle("is-open", section.dataset.panel === panelName);
  });
}

function closePanel() {
  openPanel("properties");
  document.body.dataset.panelOpen = "false";
}

/* --- Command palette + tool-aware panel ------------------------------------
   Everything the program can do sits behind either a 15-icon rail or one of
   five stacked panels full of collapsed sections, so finding a command means
   remembering which drawer it lives in. Two fixes, both cheap:

   1. Ctrl+K searches every command by name and runs it. The list is built from
      the DOM -- every tool button, every insert button, every selection action
      -- so a command added later shows up without being registered twice.
   2. Picking a tool opens the settings that tool actually uses, instead of
      leaving you to hunt for the Bolte section after pressing the bolt tool. */

const paletteRoot = document.getElementById("commandPalette");
const paletteInput = document.getElementById("commandPaletteInput");
const paletteList = document.getElementById("commandPaletteList");
let paletteCommands = [];
let paletteIndex = 0;

/* Which panel section belongs to which tool or insert action. */
const toolPanelSection = {
  hatch: "Symboler og hatch",
  timber: "Trae",
  placeBolt: "Bolte",
  placeScrew: "Skruer",
  placeProfile: "Staal",
  bolt: "Bolte",
  screw: "Skruer",
};

function panelSectionByTitle(title) {
  return [...document.querySelectorAll(".panel-section details")]
    .find((node) => node.querySelector("summary")?.textContent.trim() === title);
}

function revealPanelSection(title) {
  const section = panelSectionByTitle(title);
  if (!section) return false;
  openPanel(section.closest(".panel-section")?.dataset.panel || "components");
  section.open = true;
  section.scrollIntoView({ block: "nearest" });
  return true;
}

function collectCommands() {
  const commands = [];
  document.querySelectorAll(".tool-button[data-tool]").forEach((button) => {
    const name = button.querySelector(".tool-label")?.textContent.trim() || button.dataset.tool;
    commands.push({
      label: name,
      group: "Vaerktoej",
      hint: button.dataset.shortcut || "",
      run: () => setActiveTool(button.dataset.tool),
    });
  });
  document.querySelectorAll(".panel-section button[id]").forEach((button) => {
    const label = button.textContent.trim();
    if (!label) return;
    const section = button.closest("details")?.querySelector("summary")?.textContent.trim() || "Panel";
    commands.push({ label, group: section, hint: "", run: () => button.click() });
  });
  document.querySelectorAll("[data-action]").forEach((button) => {
    const label = button.textContent.trim();
    if (!label || !button.dataset.action) return;
    if (commands.some((c) => c.label === label && c.group === "Valg")) return;
    commands.push({
      label,
      group: "Valg",
      hint: button.title && button.title !== label ? button.title : "",
      run: () => handleSelectionAction(button.dataset.action),
    });
  });
  [
    ["Zoom til tegningen", "Shift+F", () => fitToContent()],
    ["Gem projekt", "Ctrl+S", () => saveProject()],
    ["Eksporter PNG", "", () => exportPng()],
    ["Eksporter SVG", "", () => exportSvg()],
    ["Eksporter PDF", "", () => exportPdf()],
    ["Fortryd", "Ctrl+Z", () => undo()],
    ["Gendan", "Ctrl+Shift+Z", () => redo()],
    ["Vaelg alt", "Ctrl+A", () => selectAllUnlocked()],
    ["Skift lyst/moerkt tema", "", () => applyTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light")],
    ["Tastaturgenveje", "?", () => toggleShortcuts(true)],
  ].forEach(([label, hint, run]) => commands.push({ label, group: "Generelt", hint, run }));
  return commands;
}

/* Subsequence match, so "bosi" finds "Bolt side-view". */
function paletteScore(command, query) {
  if (!query) return 0;
  const haystack = `${command.label} ${command.group}`.toLowerCase();
  const direct = haystack.indexOf(query);
  if (direct >= 0) return 1000 - direct;
  let i = 0;
  let score = 0;
  for (const ch of query) {
    const at = haystack.indexOf(ch, i);
    if (at < 0) return -1;
    score += at - i === 0 ? 3 : 1;
    i = at + 1;
  }
  return score;
}

function renderPalette() {
  const query = paletteInput.value.trim().toLowerCase();
  const ranked = paletteCommands
    .map((command) => ({ command, score: paletteScore(command, query) }))
    .filter((row) => row.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 40);
  paletteIndex = Math.min(paletteIndex, Math.max(0, ranked.length - 1));
  paletteList.replaceChildren();
  ranked.forEach((row, i) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "command-item" + (i === paletteIndex ? " active" : "");
    const label = document.createElement("span");
    label.className = "command-label";
    label.textContent = row.command.label;
    const group = document.createElement("span");
    group.className = "command-group";
    group.textContent = row.command.hint ? `${row.command.group} · ${row.command.hint}` : row.command.group;
    item.append(label, group);
    item.addEventListener("click", () => runPaletteCommand(row.command));
    paletteList.append(item);
  });
  if (!ranked.length) {
    const empty = document.createElement("p");
    empty.className = "command-empty";
    empty.textContent = "Ingen kommandoer matcher.";
    paletteList.append(empty);
  }
  paletteList.dataset.count = String(ranked.length);
  paletteList._ranked = ranked.map((row) => row.command);
}

function runPaletteCommand(command) {
  closePalette();
  try {
    command.run();
  } catch (error) {
    statusText.textContent = `Kommandoen fejlede: ${String(error).slice(0, 80)}`;
  }
}

function openPalette() {
  paletteCommands = collectCommands();
  paletteIndex = 0;
  paletteRoot.hidden = false;
  paletteInput.value = "";
  renderPalette();
  paletteInput.focus();
}

function closePalette() {
  paletteRoot.hidden = true;
  paletteInput.blur();
}

function paletteIsOpen() {
  return paletteRoot && !paletteRoot.hidden;
}

/* Ctrl+K opens it; the palette owns the keyboard while it is up. */
window.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    if (paletteIsOpen()) closePalette();
    else openPalette();
    return;
  }
  if (!paletteIsOpen()) return;
  const ranked = paletteList._ranked || [];
  if (event.key === "Escape") { event.preventDefault(); closePalette(); return; }
  if (event.key === "ArrowDown") { event.preventDefault(); paletteIndex = Math.min(paletteIndex + 1, ranked.length - 1); renderPalette(); return; }
  if (event.key === "ArrowUp") { event.preventDefault(); paletteIndex = Math.max(paletteIndex - 1, 0); renderPalette(); return; }
  if (event.key === "Enter") {
    event.preventDefault();
    const command = ranked[paletteIndex];
    if (command) runPaletteCommand(command);
  }
}, true);

paletteInput?.addEventListener("input", () => { paletteIndex = 0; renderPalette(); });
paletteRoot?.addEventListener("pointerdown", (event) => { if (event.target === paletteRoot) closePalette(); });

function setActiveTool(tool) {
  if (tool !== "polyline" && polylineDraftActive()) cancelPolyline();
  /* Show the settings the tool actually uses. Hunting for the Bolte section
     after pressing the bolt tool is the whole complaint about these menus. */
  if (typeof toolPanelSection !== "undefined" && toolPanelSection[tool]) {
    revealPanelSection(toolPanelSection[tool]);
  }
  if (!["placeProfile", "placeBolt", "placeScrew", "placeObject", "copyReference"].includes(tool) && placementState) {
    placementState = null;
    previewLayer.querySelectorAll(".placement-ghost, .placement-anchor").forEach((element) => element.remove());
  }
  activeTool = tool;
  startPoint = null;
  clearNumericEntry();
  clearDrawAnchor();
  clearPreview();
  const copy = toolCopy[tool] || toolCopy.select;
  document.querySelectorAll(".tool-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.tool === tool);
  });
  activeToolName.textContent = copy.name;
  activeToolHint.textContent = copy.hint;
  statusText.textContent = tool === "select"
    ? "Klik geometri, traek en ramme, eller brug et tegnevaerktoej."
    : "Klik tomt papir for at tegne. Geometri kan stadig vaelges og flyttes.";
  updateCanvasCursor();
}

function clearPreview() {
  Array.from(previewLayer.children)
    .filter((element) => !element.classList.contains("selection-overlay")
      && !element.classList.contains("snap-marker")
      && !element.classList.contains("draw-anchor"))
    .forEach((element) => element.remove());
  previewElement = null;
}

/* Click-click arming is otherwise invisible: the first click sets a point and
   draws nothing until the mouse moves, so a user who clicked and then went to
   another panel had no way to know the tool was still holding an anchor. The
   marker is the mode made visible, and it survives clearPreview so the rubber
   band redrawing does not wipe it. */
function showDrawAnchor(point) {
  clearDrawAnchor();
  if (!point) return;
  const arm = 7 / zoom;
  const pen = 1 / zoom;
  const anchor = createSvgElement("g", { class: "draw-anchor" });
  anchor.append(
    createSvgElement("line", { x1: point.x - arm, y1: point.y, x2: point.x + arm, y2: point.y, "stroke-width": pen }),
    createSvgElement("line", { x1: point.x, y1: point.y - arm, x2: point.x, y2: point.y + arm, "stroke-width": pen })
  );
  previewLayer.append(anchor);
}

function clearDrawAnchor() {
  previewLayer.querySelectorAll(".draw-anchor").forEach((element) => element.remove());
}

function clearSelection() {
  selectedElements.forEach((element) => element.classList.remove("selected"));
  selectedElements.clear();
  renderSelectionOverlay();
  updateSelectionUi();
}

function selectOnly(element) {
  clearSelection();
  if (element) addToSelection(element);
}

function addToSelection(element) {
  selectedElements.add(element);
  element.classList.add("selected");
  updateSelectionUi();
}

function addManyToSelection(elements) {
  elements.forEach((element) => {
    selectedElements.add(element);
    element.classList.add("selected");
  });
  renderSelectionOverlay();
  updateSelectionUi();
}

function toggleSelection(element) {
  if (selectedElements.has(element)) {
    selectedElements.delete(element);
    element.classList.remove("selected");
  } else {
    addToSelection(element);
  }
  renderSelectionOverlay();
  updateSelectionUi();
}

function clearMarqueePreviewSelection() {
  drawingLayer.querySelectorAll(".marquee-hit").forEach((element) => element.classList.remove("marquee-hit"));
}

function updateSelectionUi() {
  markUi("selection", "props", "list", "overlay");
}

function updateSelectionUiNow() {
  const count = selectedElements.size;
  selectionCount.textContent = `${count} valgt`;
  document.body.classList.toggle("has-selection", count > 0);
  /* Selecting something used to force the Properties panel open and clearing
     the selection used to close it again. That meant every click on the drawing
     threw away whatever panel you were working in -- place a bolt, click it to
     check it, and the Komponenter panel you were about to place the next one
     from had collapsed, four of its sections shut. Placing three bolts meant
     navigating back three times.

     The panel is now the user's choice. Properties still fills in on selection;
     it just no longer steals focus from the panel you deliberately opened. */
  if (count > 0 && !placementState && !document.body.dataset.openPanel) openPanel("properties");
  if (count > 1) statusText.textContent = `${count} elementer valgt. Traek for at flytte dem samlet.`;
  if (count === 1) statusText.textContent = "1 element valgt. Shift-klik for at tilfoeje flere.";
}

function elementListName(element, index) {
  const type = element.dataset.type || element.tagName.toLowerCase();
  const label = describeElement(element);
  if (label && !["Pil", type].includes(label)) return label;
  const names = {
    line: "Linje",
    arrow: "Pil",
    loadArrow: "Lastpil",
    weld: "Svejsning",
    measure: "Maal",
    rect: "Flade",
    hatch: "Hatch",
    circle: "Cirkel",
    text: "Tekst",
    profile: "Profil",
    bolt: "Bolt",
    timber: "Trae",
    symbol: "Symbol",
    group: "Gruppe",
  };
  return `${names[type] || "Element"} ${index + 1}`;
}

function renderElementList() {
  markUi("list");
}

function renderElementListNow() {
  if (!elementList) return;
  if (document.body.dataset.openPanel !== "elements") {
    if (elementTotal) elementTotal.textContent = String(drawingLayer.querySelectorAll(":scope > .draw-item").length);
    return;
  }
  const elements = Array.from(drawingLayer.children).filter((element) => element.classList.contains("draw-item"));
  elementTotal.textContent = String(elements.length);
  elementList.replaceChildren();
  if (!elements.length) {
    const empty = document.createElement("div");
    empty.className = "element-row";
    empty.innerHTML = `<span class="element-row-icon"></span><span class="element-row-name">Ingen elementer</span>`;
    elementList.append(empty);
    return;
  }
  elements.forEach((element, index) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "element-row";
    row.classList.toggle("active", selectedElements.has(element));
    row.classList.toggle("locked", isElementLocked(element));
    row.dataset.elementIndex = String(index);
    const icon = document.createElement("span");
    icon.className = "element-row-icon";
    const name = document.createElement("span");
    name.className = "element-row-name";
    name.textContent = elementListName(element, index);
    row.append(icon, name);
    row.addEventListener("click", (event) => {
      if (event.shiftKey || event.ctrlKey || event.metaKey) toggleSelection(element);
      else selectOnly(element);
      element.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    });
    elementList.append(row);
  });
}

function baseAttrs() {
  const style = currentDrawStyle();
  return {
    stroke: style.color,
    "stroke-width": style.width,
    "stroke-dasharray": lineStyleMap[style.lineType] || "",
    opacity: style.opacity / 100,
    fill: "none",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  };
}

function makeLine(start, end) {
  const line = createSvgElement("line", {
    ...baseAttrs(),
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
  });
  line.classList.add("draw-item");
  line.dataset.type = "line";
  line.dataset.color = strokeColor.value;
  applyDrawStyle(line);
  return applyLayer(line, activeLayer.value);
}

function arrowHeadPoints(start, end, size = 16) {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const left = angle + Math.PI * 0.82;
  const right = angle - Math.PI * 0.82;
  return [
    `${end.x},${end.y}`,
    `${end.x + Math.cos(left) * size},${end.y + Math.sin(left) * size}`,
    `${end.x + Math.cos(right) * size},${end.y + Math.sin(right) * size}`,
  ].join(" ");
}

function makeArrow(start, end, options = {}) {
  const group = createSvgElement("g", { color: strokeColor.value });
  group.classList.add("draw-item");
  group.dataset.type = options.type || "arrow";
  group.dataset.startX = start.x;
  group.dataset.startY = start.y;
  group.dataset.endX = end.x;
  group.dataset.endY = end.y;
  group.dataset.color = strokeColor.value;
  group.dataset.dimension = options.label || "";

  const line = createSvgElement("line", {
    ...baseAttrs(),
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
    stroke: "currentColor",
  });
  const head = createSvgElement("polygon", {
    points: arrowHeadPoints(start, end, options.headSize || 18),
    fill: "currentColor",
    stroke: "currentColor",
    "stroke-linejoin": "round",
  });
  group.append(line, head);

  if (options.type === "loadArrow") {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy) || 1;
    const normal = { x: -dy / length, y: dx / length };
    const label = options.label || "Last";
    const mid = { x: (start.x + end.x) / 2 + normal.x * 18, y: (start.y + end.y) / 2 + normal.y * 18 };
    const text = createSvgElement("text", {
      x: mid.x,
      y: mid.y,
      fill: "currentColor",
      "font-size": 14,
      "font-weight": 800,
      "text-anchor": "middle",
    });
    text.textContent = label;
    group.append(text);
  }

  applyDrawStyle(group);
  return applyLayer(group, "revision");
}

function makeLoadArrow(start, end) {
  const label = "Last";
  return makeArrow(start, end, { type: "loadArrow", label, headSize: 22 });
}

function renderArrow(group) {
  const start = { x: Number(group.dataset.startX), y: Number(group.dataset.startY) };
  const end = { x: Number(group.dataset.endX), y: Number(group.dataset.endY) };
  const label = group.dataset.dimension || "Last";
  const type = group.dataset.type;
  const style = elementStyle(group);
  group.replaceChildren();
  const line = createSvgElement("line", {
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
    stroke: "currentColor",
    fill: "none",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  });
  const head = createSvgElement("polygon", {
    points: arrowHeadPoints(start, end, type === "loadArrow" ? 22 : 18),
    fill: "currentColor",
    stroke: "currentColor",
    "stroke-linejoin": "round",
  });
  group.append(line, head);
  if (type === "loadArrow") {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy) || 1;
    const normal = { x: -dy / length, y: dx / length };
    const mid = { x: (start.x + end.x) / 2 + normal.x * 18, y: (start.y + end.y) / 2 + normal.y * 18 };
    const text = createSvgElement("text", {
      x: mid.x,
      y: mid.y,
      fill: "currentColor",
      "font-size": 14,
      "font-weight": 800,
      "text-anchor": "middle",
    });
    text.textContent = label;
    group.append(text);
  }
  applyDrawStyle(group, style);
}

function makeLeader(start, end, label = "203 x 133 x 25 UB TRUSS") {
  const group = createSvgElement("g", { color: strokeColor.value });
  group.classList.add("draw-item");
  group.dataset.type = "leader";
  group.dataset.startX = start.x;
  group.dataset.startY = start.y;
  group.dataset.endX = end.x;
  group.dataset.endY = end.y;
  group.dataset.dimension = label;
  group.dataset.color = strokeColor.value;
  renderLeader(group);
  applyLayer(group, "notes");
  return group;
}

function renderLeader(group) {
  const start = { x: Number(group.dataset.startX), y: Number(group.dataset.startY) };
  const end = { x: Number(group.dataset.endX), y: Number(group.dataset.endY) };
  const label = group.dataset.dimension || "Leader note";
  const style = elementStyle(group);
  const dir = end.x >= start.x ? 1 : -1;
  const landing = Math.max(46, Number(group.dataset.landingLength || 64));
  const elbow = { x: end.x - dir * landing, y: end.y };
  const textX = end.x + dir * 7;
  group.replaceChildren();
  group.append(
    createSvgElement("circle", {
      cx: start.x,
      cy: start.y,
      r: 2.3,
      fill: "currentColor",
      stroke: "none",
    }),
    createSvgElement("path", {
      d: `M ${start.x} ${start.y} L ${elbow.x} ${elbow.y} L ${end.x} ${end.y}`,
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 0.9,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }),
    createSvgElement("line", {
      x1: end.x,
      y1: end.y,
      x2: end.x + dir * landing * 0.72,
      y2: end.y,
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 0.9,
      "stroke-linecap": "round",
    })
  );
  const lines = label.split("\\n").flatMap((line) => line.split("|"));
  lines.forEach((line, index) => {
    const text = createSvgElement("text", {
      x: textX,
      y: end.y - (lines.length - 1) * paperMmToUnits(1.75) + index * paperMmToUnits(3.5) - paperMmToUnits(1),
      fill: "currentColor",
      "font-family": "Arial, Helvetica, sans-serif",
      "text-anchor": dir > 0 ? "start" : "end",
    });
    setTextSize(text, Number(group.dataset.textMmOverride) || textStyles.note);
    text.textContent = line.trim();
    group.append(text);
  });
  applyDrawStyle(group, style);
}

/* --- Break line -----------------------------------------------------------
   A break line that actually breaks: the jag is drawn, and everything on the
   far side of it is MASKED -- covered by a paper-coloured region -- so a member
   can be cut short without deleting or trimming what runs past the cut.

   The mask hides whatever sits below it in the document, which is what "behind"
   means in a flat drawing: draw the break last and it covers what is already
   there; send it to the back and it covers nothing. That is the same rule
   AutoCAD wipeouts and Revit masking regions follow.

   The mask is painted with the paper colour rather than white, so it stays
   invisible when the theme changes; the export pass restates it as white the
   same way it does for dimension label backgrounds. */

function breakLineGeometry(group) {
  const start = { x: Number(group.dataset.startX), y: Number(group.dataset.startY) };
  const end = { x: Number(group.dataset.endX), y: Number(group.dataset.endY) };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  /* Mask side, as a sign on the normal. Flipping this is the whole difference
     between keeping the left half of a member and keeping the right half. */
  const side = group.dataset.maskSide === "left" ? -1 : 1;
  /* y runs DOWN, so the hand rule flips: the right-hand side of a walk from
     start to end is (uy, -ux), not (-uy, ux). Getting this backwards masks the
     half you meant to keep. */
  const nx = uy * side;
  const ny = -ux * side;
  const amp = Math.max(6, Math.min(Number(group.dataset.amplitude) || len * 0.09, len * 0.3));
  const depth = Math.max(10, Number(group.dataset.depthMm) || len * 1.1);

  /* The jag: straight, then a lightning jog across the middle, then straight. */
  const at = (t, off) => ({
    x: start.x + ux * len * t + nx * off,
    y: start.y + uy * len * t + ny * off,
  });
  const jag = [at(0, 0), at(0.38, 0), at(0.46, amp), at(0.54, -amp), at(0.62, 0), at(1, 0)];
  const mask = jag.concat([at(1, depth), at(0, depth)]);
  return { jag, mask, depth, side };
}

function renderBreakLine(group) {
  const { jag, mask } = breakLineGeometry(group);
  const points = (list) => list.map((p) => `${p.x},${p.y}`).join(" ");
  group.replaceChildren();
  group.setAttribute("color", group.dataset.color || "#111111");

  const cover = createSvgElement("polygon", {
    points: points(mask),
    stroke: "none",
  });
  cover.classList.add("break-mask");
  /* var() is not honoured in a presentation attribute, only in a style, which
     is also what lets the export pass override it with a plain white. */
  cover.style.fill = "var(--paper)";
  cover.dataset.pen = "own";
  group.append(cover);

  group.append(createSvgElement("polyline", {
    points: points(jag),
    fill: "none",
    stroke: "currentColor",
    "stroke-width": paperMmToUnits(Number(group.dataset.strokeWidth) || 0.35),
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  }));
  applyDrawStyle(group, elementStyle(group));
}

function makeBreakLine(start, end) {
  const group = createSvgElement("g", { color: "#111111" });
  group.classList.add("draw-item");
  group.dataset.type = "breakLine";
  group.dataset.startX = String(start.x);
  group.dataset.startY = String(start.y);
  group.dataset.endX = String(end.x);
  group.dataset.endY = String(end.y);
  group.dataset.maskSide = "right";
  group.dataset.color = "#111111";
  group.dataset.strokeWidth = "0.35";
  group.dataset.lineType = "solid";
  group.dataset.opacity = "100";
  group.dataset.dimension = "Brudlinje med maske";
  renderBreakLine(group);
  return applyLayer(group, "notes");
}

/* Flip which side is covered. Bound to the context menu and to F while a break
   line is selected, because getting it backwards is the normal first attempt. */
function flipBreakLineSide() {
  const breaks = selectedArray().filter((element) => element.dataset.type === "breakLine");
  if (!breaks.length) return;
  pushHistory();
  breaks.forEach((element) => {
    element.dataset.maskSide = element.dataset.maskSide === "left" ? "right" : "left";
    renderBreakLine(element);
  });
  renderSelectionOverlay();
  pushHistorySoon();
  statusText.textContent = `Brudlinje: maskerer nu mod ${breaks[0].dataset.maskSide === "left" ? "venstre" : "hoejre"}.`;
}

function makeWeld(start, end, options = {}) {
  const group = createSvgElement("g", { color: options.color || "#111111" });
  group.classList.add("draw-item");
  group.dataset.type = "weld";
  group.dataset.startX = start.x;
  group.dataset.startY = start.y;
  group.dataset.endX = end.x;
  group.dataset.endY = end.y;
  group.dataset.dimension = options.label || "6mm fillet weld";
  group.dataset.material = "Weld";
  group.dataset.color = options.color || "#111111";
  group.dataset.strokeWidth = String(options.strokeWidth || 0.8);
  group.dataset.lineType = "solid";
  group.dataset.opacity = "100";
  renderWeld(group);
  return applyLayer(group, "steel");
}

function renderWeld(group) {
  const start = { x: Number(group.dataset.startX), y: Number(group.dataset.startY) };
  const end = { x: Number(group.dataset.endX), y: Number(group.dataset.endY) };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const nx = -uy;
  const ny = ux;
  const style = elementStyle(group);
  const size = Math.max(7, Number(group.dataset.weldSize || 6) + 2);
  const pitch = Math.max(18, Number(group.dataset.weldPitch || 22));
  group.replaceChildren();
  group.setAttribute("color", group.dataset.color || "#111111");
  group.append(createSvgElement("line", {
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
    stroke: "currentColor",
    "stroke-width": 0.75,
    "stroke-linecap": "round",
  }));
  const count = Math.max(1, Math.floor((length - 8) / pitch));
  for (let i = 0; i < count; i += 1) {
    const along = Math.min(length - 10, 8 + i * pitch);
    const base = { x: start.x + ux * along, y: start.y + uy * along };
    const next = { x: base.x + ux * size, y: base.y + uy * size };
    const tip = { x: base.x + ux * size * 0.5 + nx * size, y: base.y + uy * size * 0.5 + ny * size };
    group.append(createSvgElement("path", {
      d: `M ${base.x} ${base.y} L ${tip.x} ${tip.y} L ${next.x} ${next.y}`,
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 0.85,
      "stroke-linejoin": "round",
    }));
  }
  const label = group.dataset.dimension || "";
  if (label) {
    const mid = { x: (start.x + end.x) / 2 + nx * (size + 13), y: (start.y + end.y) / 2 + ny * (size + 13) };
    const text = createSvgElement("text", {
      x: mid.x,
      y: mid.y,
      fill: "currentColor",
      "font-size": 7.5,
      "font-weight": 700,
      "text-anchor": "middle",
    });
    text.textContent = label;
    group.append(text);
  }
  applyDrawStyle(group, style);
}

function makeDetailTitle(point, id = "D-01", title = "TRUSS CONNECTION DETAIL", scale = "SCALE 1:10") {
  const group = createSvgElement("g", {
    transform: `translate(${point.x} ${point.y})`,
    color: "#111111",
  });
  group.classList.add("draw-item");
  group.dataset.type = "detailTitle";
  group.dataset.detailId = id;
  group.dataset.dimension = title;
  group.dataset.material = scale;
  group.dataset.color = "#111111";
  renderDetailTitle(group);
  return applyLayer(group, "notes");
}

function renderDetailTitle(group) {
  const id = group.dataset.detailId || "D-01";
  const title = group.dataset.dimension || "DETAIL TITLE";
  const scale = group.dataset.material || "SCALE 1:10";
  group.replaceChildren();
  group.setAttribute("color", group.dataset.color || "#111111");
  const mm = (value) => paperMmToUnits(value);
  const idText = setTextSize(createSvgElement("text", { x: 0, y: 0, fill: "currentColor", "text-anchor": "middle" }), textStyles.subtitle);
  idText.textContent = id;
  const titleText = setTextSize(createSvgElement("text", { x: 0, y: mm(7), fill: "currentColor", "font-weight": "700", "text-anchor": "middle" }), textStyles.title);
  titleText.textContent = title;
  const halfRule = mm(34);
  const underline = createSvgElement("line", { x1: -halfRule, y1: mm(9.5), x2: halfRule, y2: mm(9.5), stroke: "currentColor", "stroke-width": mm(0.5) });
  const scaleText = setTextSize(createSvgElement("text", { x: 0, y: mm(14), fill: "currentColor", "text-anchor": "middle" }), textStyles.note);
  scaleText.textContent = scale;
  group.append(idText, titleText, underline, scaleText);
}

function makeDetailViewport(point, options = {}) {
  const group = createSvgElement("g", {
    transform: `translate(${point.x} ${point.y})`,
    color: "#111111",
  });
  group.classList.add("draw-item");
  group.dataset.type = "detailViewport";
  group.dataset.detailId = options.id || "D-01";
  group.dataset.dimension = options.title || "CONNECTION DETAIL";
  group.dataset.material = options.scale || "SCALE 1:10";
  group.dataset.viewportWidth = String(options.width || 360);
  group.dataset.viewportHeight = String(options.height || 240);
  group.dataset.color = "#111111";
  /* The traced primitives carry their own weights; this is only the fallback
     for anything drawn around them, so it sits at a normal ISO pen. */
  group.dataset.strokeWidth = "0.35";
  group.dataset.lineType = "solid";
  group.dataset.opacity = "100";
  renderDetailViewport(group);
  return applyLayer(group, "notes");
}

function renderDetailViewport(group) {
  const width = Number(group.dataset.viewportWidth || 360);
  const height = Number(group.dataset.viewportHeight || 240);
  const x = -width / 2;
  const y = -height / 2;
  const titleY = height / 2 + paperMmToUnits(12);
  group.replaceChildren();
  group.setAttribute("color", group.dataset.color || "#111111");
  group.append(
    createSvgElement("rect", {
      x,
      y,
      width,
      height,
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 0.9,
      "stroke-dasharray": "10 7",
      opacity: 0.42,
    }),
    createSvgElement("line", { x1: x, y1: y - 10, x2: x, y2: y + 20, stroke: "currentColor", "stroke-width": 0.7, opacity: 0.55 }),
    createSvgElement("line", { x1: x - 10, y1: y, x2: x + 20, y2: y, stroke: "currentColor", "stroke-width": 0.7, opacity: 0.55 }),
    createSvgElement("line", { x1: x + width, y1: y - 10, x2: x + width, y2: y + 20, stroke: "currentColor", "stroke-width": 0.7, opacity: 0.55 }),
    createSvgElement("line", { x1: x + width - 20, y1: y, x2: x + width + 10, y2: y, stroke: "currentColor", "stroke-width": 0.7, opacity: 0.55 }),
    createSvgElement("line", { x1: -paperMmToUnits(32), y1: titleY + paperMmToUnits(2), x2: paperMmToUnits(32), y2: titleY + paperMmToUnits(2), stroke: "currentColor", "stroke-width": paperMmToUnits(0.5) })
  );
  const idText = setTextSize(createSvgElement("text", { x: 0, y: titleY - paperMmToUnits(10.5), fill: "currentColor", "text-anchor": "middle" }), textStyles.subtitle);
  idText.textContent = group.dataset.detailId || "D-01";
  const titleText = setTextSize(createSvgElement("text", { x: 0, y: titleY - paperMmToUnits(3), fill: "currentColor", "font-weight": "700", "text-anchor": "middle" }), textStyles.title);
  titleText.textContent = group.dataset.dimension || "CONNECTION DETAIL";
  const scaleText = setTextSize(createSvgElement("text", { x: 0, y: titleY + paperMmToUnits(7), fill: "currentColor", "text-anchor": "middle" }), textStyles.note);
  scaleText.textContent = group.dataset.material || "SCALE 1:10";
  group.append(idText, titleText, scaleText);
  applyOpacity(group, group.dataset.opacity || 100);
}

function makeSheetFrame() {
  const group = createSvgElement("g", { color: "#111111" });
  group.classList.add("draw-item");
  group.dataset.type = "sheetFrame";
  group.dataset.dimension = "Proposed Details";
  group.dataset.material = "Scale bars + title block";
  group.dataset.color = "#111111";
  group.dataset.locked = "true";
  group.classList.add("locked");
  /* Everything below is expressed in paper millimetres and converted, so the
     frame fits A4 through A0 at any plot scale. */
  const mm = (value) => paperMmToUnits(value);
  const W = sheet.width;
  const H = sheet.height;
  const margin = mm(10);
  const blockW = mm(80);
  const blockH = mm(45);
  const blockX = W - margin - blockW;
  const blockY = H - margin - blockH;
  const pen = (weight) => paperMmToUnits(weight);

  group.append(
    createSvgElement("rect", { x: margin, y: margin, width: W - margin * 2, height: H - margin * 2, fill: "none", stroke: "currentColor", "stroke-width": pen(0.7) }),
    createSvgElement("rect", { x: blockX, y: blockY, width: blockW, height: blockH, fill: "none", stroke: "currentColor", "stroke-width": pen(0.5) }),
    createSvgElement("line", { x1: blockX, y1: blockY + mm(14), x2: blockX + blockW, y2: blockY + mm(14), stroke: "currentColor", "stroke-width": pen(0.25) }),
    createSvgElement("line", { x1: blockX, y1: blockY + mm(26), x2: blockX + blockW, y2: blockY + mm(26), stroke: "currentColor", "stroke-width": pen(0.25) }),
    createSvgElement("line", { x1: blockX, y1: blockY + mm(36), x2: blockX + blockW, y2: blockY + mm(36), stroke: "currentColor", "stroke-width": pen(0.25) })
  );

  const rows = [
    { y: 10, size: textStyles.subtitle, weight: "700", fill: "currentColor", text: "Omkreds" },
    { y: 21.5, size: textStyles.small, weight: "400", fill: "currentColor", text: "Project / client / revision" },
    { y: 32.5, size: textStyles.note, weight: "700", fill: "#b3261e", text: "DETAIL WIP" },
    { y: 42, size: textStyles.micro, weight: "400", fill: "currentColor", text: `Sheet ${sheetLabelText()}` },
  ];
  rows.forEach((row) => {
    const node = createSvgElement("text", { x: blockX + mm(4), y: blockY + mm(row.y), fill: row.fill, "font-weight": row.weight });
    setTextSize(node, row.size);
    node.textContent = row.text;
    group.append(node);
  });

  const footer = createSvgElement("text", { x: margin + mm(4), y: H - margin - mm(3), fill: "currentColor" });
  setTextSize(footer, textStyles.micro);
  footer.textContent = "ALL DIMENSIONS TO BE CONFIRMED ON SITE PRIOR TO CONSTRUCTION";
  group.append(footer);
  return applyLayer(group, "revision");
}

function appendTemplateText(group, textValue, x, y, size = 7, anchor = "start", weight = "500") {
  const text = createSvgElement("text", {
    x,
    y,
    fill: "currentColor",
    "font-size": size,
    "font-family": "Arial, Helvetica, sans-serif",
    "font-weight": weight,
    "text-anchor": anchor,
  });
  text.textContent = textValue;
  group.append(text);
  return text;
}

function appendTemplateMember(group, x1, y1, x2, y2, width = 32) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length * width / 2;
  const ny = dx / length * width / 2;
  const points = [
    `${x1 + nx},${y1 + ny}`,
    `${x2 + nx},${y2 + ny}`,
    `${x2 - nx},${y2 - ny}`,
    `${x1 - nx},${y1 - ny}`,
  ].join(" ");
  group.append(createSvgElement("polygon", {
    points,
    fill: "none",
    stroke: "currentColor",
    "stroke-width": 1.2,
    "stroke-linejoin": "miter",
  }));
  group.append(createSvgElement("line", {
    x1,
    y1,
    x2,
    y2,
    stroke: "currentColor",
    "stroke-width": 0.8,
    "stroke-dasharray": "12 8",
    opacity: 0.45,
  }));
}

function appendTemplateBolt(group, x, y, radius = 3.2) {
  group.append(createSvgElement("circle", {
    cx: x,
    cy: y,
    r: radius,
    fill: "none",
    stroke: "currentColor",
    "stroke-width": 1,
  }));
  group.append(createSvgElement("circle", {
    cx: x,
    cy: y,
    r: 1.15,
    fill: "currentColor",
    stroke: "none",
  }));
  group.append(createSvgElement("line", { x1: x - 7, y1: y, x2: x + 7, y2: y, stroke: "currentColor", "stroke-width": 0.7 }));
  group.append(createSvgElement("line", { x1: x, y1: y - 7, x2: x, y2: y + 7, stroke: "currentColor", "stroke-width": 0.7 }));
}

function appendTemplateLeader(group, start, end, label) {
  const dir = end.x >= start.x ? 1 : -1;
  const elbow = { x: end.x - dir * 16, y: end.y };
  group.append(
    createSvgElement("circle", { cx: start.x, cy: start.y, r: 1.6, fill: "currentColor", stroke: "none" }),
    createSvgElement("path", {
      d: `M ${start.x} ${start.y} L ${elbow.x} ${elbow.y} L ${end.x} ${end.y}`,
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 0.8,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    })
  );
  label.split("|").forEach((line, index) => {
    appendTemplateText(group, line.trim(), end.x + dir * 4, end.y + index * 8, 6.2, dir > 0 ? "start" : "end");
  });
}

function appendTemplateDimension(group, x1, y1, x2, y2, label, offset = 14) {
  const horizontal = Math.abs(y2 - y1) < Math.abs(x2 - x1);
  if (horizontal) {
    const y = y1 - offset;
    group.append(createSvgElement("line", { x1, y1, x2: x1, y2: y, stroke: "currentColor", "stroke-width": 0.7 }));
    group.append(createSvgElement("line", { x1: x2, y1: y2, x2, y2: y, stroke: "currentColor", "stroke-width": 0.7 }));
    group.append(createSvgElement("line", { x1, y1: y, x2, y2: y, stroke: "currentColor", "stroke-width": 0.7 }));
    group.append(createSvgElement("path", { d: `M ${x1 + 5} ${y - 5} L ${x1} ${y} L ${x1 + 5} ${y + 5} M ${x2 - 5} ${y - 5} L ${x2} ${y} L ${x2 - 5} ${y + 5}`, fill: "none", stroke: "currentColor", "stroke-width": 0.7 }));
    appendTemplateText(group, label, (x1 + x2) / 2, y - 3, 6.5, "middle");
    return;
  }
  const x = x1 + offset;
  group.append(createSvgElement("line", { x1, y1, x2: x, y2: y1, stroke: "currentColor", "stroke-width": 0.7 }));
  group.append(createSvgElement("line", { x1: x2, y1: y2, x2: x, y2, stroke: "currentColor", "stroke-width": 0.7 }));
  group.append(createSvgElement("line", { x1: x, y1, x2: x, y2, stroke: "currentColor", "stroke-width": 0.7 }));
  group.append(createSvgElement("path", { d: `M ${x - 5} ${y1 + 5} L ${x} ${y1} L ${x + 5} ${y1 + 5} M ${x - 5} ${y2 - 5} L ${x} ${y2} L ${x + 5} ${y2 - 5}`, fill: "none", stroke: "currentColor", "stroke-width": 0.7 }));
  appendTemplateText(group, label, x + 4, (y1 + y2) / 2 + 2, 6.5, "start");
}

function makeTrussConnectionTemplate(point = centerPoint()) {
  const group = createSvgElement("g", {
    transform: `translate(${point.x} ${point.y})`,
    color: "#111111",
  });
  group.classList.add("draw-item");
  group.dataset.type = "detailTemplate";
  group.dataset.dimension = "TRUSS RIDGE DETAIL";
  group.dataset.material = "203 x 133 x 25 UB / 10mm plates / M16 8.8 bolts";
  group.dataset.color = "#111111";
  group.dataset.rotation = "0";
  group.dataset.strokeWidth = "1";
  group.dataset.lineType = "solid";
  group.dataset.opacity = "100";

  appendTemplateMember(group, -240, 70, -18, -36, 34);
  appendTemplateMember(group, 18, -36, 242, 70, 34);
  appendTemplateMember(group, -210, 112, -36, 28, 18);
  appendTemplateMember(group, 36, 28, 210, 112, 18);

  group.append(createSvgElement("rect", { x: -24, y: -78, width: 48, height: 154, fill: "none", stroke: "currentColor", "stroke-width": 1.2 }));
  group.append(createSvgElement("rect", { x: -37, y: -52, width: 74, height: 22, fill: "none", stroke: "currentColor", "stroke-width": 1.2 }));
  group.append(createSvgElement("rect", { x: -32, y: 36, width: 64, height: 24, fill: "none", stroke: "currentColor", "stroke-width": 1.2 }));
  group.append(createSvgElement("line", { x1: 0, y1: -82, x2: 0, y2: 92, stroke: "currentColor", "stroke-width": 0.7, "stroke-dasharray": "10 6", opacity: 0.55 }));
  group.append(createSvgElement("path", { d: "M -16 -72 L 16 -72 M -16 -62 L 16 -62 M -16 66 L 16 66", fill: "none", stroke: "currentColor", "stroke-width": 0.8 }));

  [-14, 14].forEach((x) => [-42, -18, 28, 52].forEach((y) => appendTemplateBolt(group, x, y, 3)));
  [-4, 4].forEach((x) => group.append(createSvgElement("path", { d: `M ${x} -52 L ${x} 60`, fill: "none", stroke: "currentColor", "stroke-width": 0.9, "stroke-dasharray": "4 3", opacity: 0.7 })));

  appendTemplateLeader(group, { x: -118, y: 9 }, { x: -218, y: -26 }, "203 x 133 x 25 UB TRUSS");
  appendTemplateLeader(group, { x: 22, y: -62 }, { x: 120, y: -82 }, "10mm THICK STEEL PLATES TO|FORM STUB TO SUPPORT RIDGE BEAM");
  appendTemplateLeader(group, { x: 15, y: -20 }, { x: 116, y: -20 }, "4no. M16 GRADE 8.8 BOLTS");
  appendTemplateLeader(group, { x: 3, y: 56 }, { x: 128, y: 36 }, "8mm FPFW UB TO END PLATE");
  appendTemplateLeader(group, { x: 108, y: 9 }, { x: 214, y: 0 }, "203 x 133 x 25 UB TRUSS");

  appendTemplateDimension(group, -37, -52, 37, -52, "150", 18);
  appendTemplateDimension(group, 37, -52, 37, 60, "190", 22);
  appendTemplateDimension(group, -14, -42, -14, -18, "30", -20);
  appendTemplateDimension(group, 14, 28, 14, 52, "30", 20);

  group.append(createSvgElement("line", { x1: -52, y1: 94, x2: -30, y2: 94, stroke: "currentColor", "stroke-width": 0.9 }));
  group.append(createSvgElement("polygon", { points: "-41,94 -47,86 -35,86", fill: "currentColor", stroke: "none" }));
  appendTemplateText(group, "A", -41, 108, 7, "middle", "700");
  group.append(createSvgElement("line", { x1: 30, y1: 94, x2: 52, y2: 94, stroke: "currentColor", "stroke-width": 0.9 }));
  group.append(createSvgElement("polygon", { points: "41,94 35,86 47,86", fill: "currentColor", stroke: "none" }));
  appendTemplateText(group, "A", 41, 108, 7, "middle", "700");

  appendTemplateText(group, "D-03", 0, 158, 14, "middle", "500");
  appendTemplateText(group, "TRUSS RIDGE DETAIL", 0, 178, 16, "middle", "700");
  group.append(createSvgElement("line", { x1: -114, y1: 184, x2: 114, y2: 184, stroke: "currentColor", "stroke-width": 1.1 }));
  appendTemplateText(group, "SCALE 1:10", 0, 197, 8.5, "middle", "500");

  return applyLayer(group, "steel");
}

function templatePoint(origin, x, y) {
  return { x: origin.x + x, y: origin.y + y };
}

function makeTemplateLine(origin, x1, y1, x2, y2, options = {}) {
  const line = createSvgElement("line", {
    x1: origin.x + x1,
    y1: origin.y + y1,
    x2: origin.x + x2,
    y2: origin.y + y2,
    stroke: options.color || "#111111",
    "stroke-width": options.width || 1,
    "stroke-dasharray": options.dash || "",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    fill: "none",
    opacity: options.opacity || 1,
  });
  line.classList.add("draw-item");
  line.dataset.type = "line";
  line.dataset.dimension = options.name || "Detail line";
  line.dataset.color = options.color || "#111111";
  line.dataset.strokeWidth = String(options.width || 1);
  line.dataset.lineType = options.lineType || (options.dash ? "dashed" : "solid");
  line.dataset.opacity = String(Math.round((options.opacity || 1) * 100));
  return applyLayer(line, options.layer || "steel");
}

function makeTemplateRect(origin, x, y, width, height, options = {}) {
  const rect = createSvgElement("rect", {
    x: origin.x + x,
    y: origin.y + y,
    width,
    height,
    fill: options.fill || "none",
    stroke: options.color || "#111111",
    "stroke-width": options.width ?? 1,
    "stroke-dasharray": options.dash || "",
    rx: 0,
  });
  rect.classList.add("draw-item");
  rect.dataset.type = "rect";
  rect.dataset.dimension = options.name || "Plate";
  rect.dataset.material = options.material || "";
  rect.dataset.color = options.color || "#111111";
  rect.dataset.strokeWidth = String(options.width ?? 1);
  rect.dataset.lineType = options.lineType || (options.dash ? "dashed" : "solid");
  return applyLayer(rect, options.layer || "steel");
}

function makeTemplatePolygon(origin, points, options = {}) {
  const polygon = createSvgElement("polygon", {
    points: points.map(([x, y]) => `${origin.x + x},${origin.y + y}`).join(" "),
    fill: options.fill || "none",
    stroke: options.color || "#111111",
    "stroke-width": options.width ?? 1,
    "stroke-dasharray": options.dash || "",
    "stroke-linejoin": "round",
  });
  polygon.classList.add("draw-item");
  polygon.dataset.type = "polygon";
  polygon.dataset.dimension = options.name || "Plate outline";
  polygon.dataset.material = options.material || "";
  polygon.dataset.color = options.color || "#111111";
  polygon.dataset.strokeWidth = String(options.width ?? 1);
  polygon.dataset.lineType = options.lineType || (options.dash ? "dashed" : "solid");
  return applyLayer(polygon, options.layer || "steel");
}

function makeTemplateCircle(origin, cx, cy, radius, options = {}) {
  const circle = createSvgElement("circle", {
    cx: origin.x + cx,
    cy: origin.y + cy,
    r: radius,
    fill: options.fill || "none",
    stroke: options.color || "#111111",
    "stroke-width": options.width ?? 1,
    "stroke-dasharray": options.dash || "",
  });
  circle.classList.add("draw-item");
  circle.dataset.type = "circle";
  circle.dataset.dimension = options.name || "Circle";
  circle.dataset.material = options.material || "";
  circle.dataset.color = options.color || "#111111";
  circle.dataset.strokeWidth = String(options.width ?? 1);
  circle.dataset.lineType = options.lineType || (options.dash ? "dashed" : "solid");
  return applyLayer(circle, options.layer || "steel");
}

function makeTemplatePath(origin, d, options = {}) {
  const path = createSvgElement("path", {
    d,
    transform: `translate(${origin.x} ${origin.y})`,
    fill: options.fill || "none",
    stroke: options.color || "#111111",
    "stroke-width": options.width || 1,
    "stroke-dasharray": options.dash || "",
    "stroke-linecap": options.cap || "round",
    "stroke-linejoin": options.join || "round",
  });
  path.classList.add("draw-item");
  path.dataset.type = "path";
  path.dataset.dimension = options.name || "Detail path";
  path.dataset.material = options.material || "";
  path.dataset.color = options.color || "#111111";
  path.dataset.strokeWidth = String(options.width || 1);
  path.dataset.lineType = options.lineType || (options.dash ? "dashed" : "solid");
  return applyLayer(path, options.layer || "steel");
}

function makeTemplateText(origin, textValue, x, y, options = {}) {
  const text = createSvgElement("text", {
    x: origin.x + x,
    y: origin.y + y,
    fill: options.color || "#111111",
    "font-size": options.size || 7,
    "font-family": "Arial, Helvetica, sans-serif",
    "font-weight": options.weight || "500",
    "text-anchor": options.anchor || "start",
  });
  text.textContent = textValue;
  text.classList.add("draw-item");
  text.dataset.type = "text";
  text.dataset.dimension = textValue;
  text.dataset.color = options.color || "#111111";
  return applyLayer(text, options.layer || "notes");
}

function makeTemplateProfileMember(origin, x1, y1, x2, y2, width = 34, name = "203 x 133 x 25 UB TRUSS") {
  const start = templatePoint(origin, x1, y1);
  const end = templatePoint(origin, x2, y2);
  const group = createSvgElement("g", { color: "#111111" });
  group.classList.add("draw-item");
  group.dataset.type = "profileMember";
  group.dataset.profile = "UB203x133x25";
  group.dataset.dimension = name;
  group.dataset.material = "Steel";
  group.dataset.startX = start.x;
  group.dataset.startY = start.y;
  group.dataset.endX = end.x;
  group.dataset.endY = end.y;
  group.dataset.memberWidth = String(width);
  group.dataset.color = "#111111";
  /* The traced primitives carry their own weights; this is only the fallback
     for anything drawn around them, so it sits at a normal ISO pen. */
  group.dataset.strokeWidth = "0.35";
  group.dataset.lineType = "solid";
  renderTemplateProfileMember(group);
  return applyLayer(group, "steel");
}

function renderTemplateProfileMember(group) {
  const start = { x: Number(group.dataset.startX), y: Number(group.dataset.startY) };
  const end = { x: Number(group.dataset.endX), y: Number(group.dataset.endY) };
  const width = Number(group.dataset.memberWidth || 34);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length * width / 2;
  const ny = dx / length * width / 2;
  const points = [
    `${start.x + nx},${start.y + ny}`,
    `${end.x + nx},${end.y + ny}`,
    `${end.x - nx},${end.y - ny}`,
    `${start.x - nx},${start.y - ny}`,
  ].join(" ");
  group.replaceChildren();
  group.setAttribute("color", group.dataset.color || "#111111");
  group.append(
    createSvgElement("polygon", {
      points,
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 1.1,
      "stroke-linejoin": "miter",
    }),
    createSvgElement("line", {
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
      stroke: "currentColor",
      "stroke-width": 0.65,
      "stroke-dasharray": "12 8",
      opacity: 0.5,
    })
  );
}

function makeTemplateBoltElement(origin, x, y, name = "M16 grade 8.8 bolt") {
  const point = templatePoint(origin, x, y);
  const group = createSvgElement("g", {
    transform: `translate(${point.x} ${point.y})`,
    color: "#111111",
  });
  group.classList.add("draw-item");
  group.dataset.type = "bolt";
  group.dataset.bolt = "M16";
  group.dataset.grade = "8.8";
  group.dataset.dimension = name;
  group.dataset.material = "Grade 8.8";
  group.dataset.color = "#111111";
  group.dataset.rotation = "0";
  group.dataset.compactBolt = "true";
  group.dataset.showLabel = "false";
  group.dataset.strokeWidth = "1";
  group.dataset.lineType = "solid";
  group.dataset.opacity = "100";
  group.append(
    createSvgElement("circle", {
      cx: 0,
      cy: 0,
      r: 4,
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 1,
    }),
    createSvgElement("circle", {
      cx: 0,
      cy: 0,
      r: 1.2,
      fill: "currentColor",
      stroke: "none",
    }),
    createSvgElement("line", { x1: -7, y1: 0, x2: 7, y2: 0, stroke: "currentColor", "stroke-width": 0.7 }),
    createSvgElement("line", { x1: 0, y1: -7, x2: 0, y2: 7, stroke: "currentColor", "stroke-width": 0.7 })
  );
  return applyLayer(group, "steel");
}

function makeTemplateFastenerMarker(origin, x, y, name = "CSA5.0X40 fixing") {
  const point = templatePoint(origin, x, y);
  const group = createSvgElement("g", {
    transform: `translate(${point.x} ${point.y})`,
    color: "#111111",
  });
  group.classList.add("draw-item");
  group.dataset.type = "fastenerMarker";
  group.dataset.dimension = name;
  group.dataset.material = "Fastener";
  group.dataset.color = "#111111";
  group.dataset.rotation = "0";
  group.dataset.strokeWidth = "0.75";
  group.dataset.lineType = "solid";
  group.dataset.opacity = "100";
  group.append(
    createSvgElement("circle", {
      cx: 0,
      cy: 0,
      r: 2.8,
      fill: "#fffefb",
      stroke: "currentColor",
      "stroke-width": 0.75,
    }),
    createSvgElement("line", { x1: -4.8, y1: 0, x2: 4.8, y2: 0, stroke: "currentColor", "stroke-width": 0.55 }),
    createSvgElement("line", { x1: 0, y1: -4.8, x2: 0, y2: 4.8, stroke: "currentColor", "stroke-width": 0.55 })
  );
  return applyLayer(group, "steel");
}

function makeTemplateLeaderElement(origin, startX, startY, endX, endY, label) {
  const leader = makeLeader(templatePoint(origin, startX, startY), templatePoint(origin, endX, endY), label);
  leader.dataset.color = "#111111";
  leader.dataset.strokeWidth = "0.9";
  leader.dataset.opacity = "100";
  leader.dataset.lineType = "solid";
  leader.setAttribute("color", "#111111");
  renderLeader(leader);
  return leader;
}

function makeTemplateMeasure(origin, x1, y1, x2, y2, label, offset = 18) {
  const measure = makeMeasure(templatePoint(origin, x1, y1), templatePoint(origin, x2, y2));
  measure.dataset.measureMode = "custom";
  measure.dataset.customText = label;
  measure.dataset.measureOffset = String(offset);
  measure.dataset.dimension = label;
  measure.classList.add("template-measure");
  renderMeasure(measure);
  return measure;
}

function buildTrussConnectionTemplateElements(origin = centerPoint()) {
  const elements = [];
  const add = (element) => {
    if (element) elements.push(element);
    return element;
  };

  add(makeTemplateProfileMember(origin, -120, -196, -120, 10, 44, "BPSS / SHS COLUMN"));
  add(makeTemplateProfileMember(origin, -60, -196, -60, 10, 44, "BPSS / SHS COLUMN"));
  add(makeTemplateProfileMember(origin, 24, -14, 158, -202, 34, "ADJUST BRACE LENGTH SO BRACE CAP IS INSTALLED"));
  add(makeTemplateProfileMember(origin, 74, -2, 206, -188, 34, "ADJUST BRACE LENGTH SO BRACE CAP IS INSTALLED"));

  add(makeTemplateLine(origin, -92, -204, -92, 70, { name: "Column centreline", dash: "12 7", lineType: "dash-dot", width: 0.7, opacity: 0.55 }));
  add(makeTemplateLine(origin, 92, -120, 20, 18, { name: "Brace centreline", dash: "12 7", lineType: "dash-dot", width: 0.7, opacity: 0.55 }));
  add(makeTemplateLine(origin, -170, 10, 176, 10, { name: "Top of concrete / base line", width: 1.5 }));
  add(makeTemplateLine(origin, -174, 22, 174, 22, { name: "Concrete edge", width: 0.9 }));
  add(makeTemplateLine(origin, -145, 10, -145, 45, { name: "Baseplate thickness marker", width: 0.8 }));

  add(makeTemplateRect(origin, -154, -2, 316, 18, { name: "Base plate", material: "S275 Gr 50", width: 1.2 }));
  add(makeTemplatePolygon(origin, [[-20, 10], [34, -132], [118, -84], [40, 10]], { name: "Gusset / side plate A", material: "S275 steel plate", width: 1.1 }));
  add(makeTemplateRect(origin, 18, -116, 96, 44, { name: "Brace cap / splice plate", material: "S275 steel plate", width: 1.1 }));
  add(makeTemplateLine(origin, 28, -106, 104, -82, { name: "Plate fold / hidden edge", dash: "8 5", lineType: "dashed", width: 0.8 }));
  add(makeTemplateLine(origin, -24, 10, 18, -74, { name: "10mm stiffener", width: 1.1 }));
  add(makeTemplateLine(origin, -34, 10, 8, -74, { name: "10mm stiffener", width: 1.1 }));

  [-104, -46, 18, 86, 140].forEach((x) => add(makeTemplateBoltElement(origin, x, 10, "1in dia A.B. in 1-1/4in hole")));
  [-46, 18, 86].forEach((x) => add(makeTemplateBoltElement(origin, x, 48, "Anchor bolt with square washer")));
  [[36, -103], [58, -96], [82, -88], [104, -80], [48, -84], [72, -76]].forEach(([x, y]) => add(makeTemplateBoltElement(origin, x, y, "1in dia brace bolts")));

  add(makeTemplateRect(origin, 228, -64, 52, 90, { name: "Section A - tube profile", material: "SHS / cap plate", width: 1.2 }));
  add(makeTemplateRect(origin, 238, -50, 32, 62, { name: "Section A hollow core", material: "void", width: 1, layer: "notes" }));
  add(makeTemplateLine(origin, 224, -72, 284, -72, { name: "Top cap line", width: 1 }));
  add(makeTemplateLine(origin, 224, 34, 284, 34, { name: "Bottom cap line", width: 1 }));
  add(makeTemplateBoltElement(origin, 222, -16, "Section bolt"));
  add(makeTemplateBoltElement(origin, 286, -16, "Section bolt"));

  add(makeTemplateRect(origin, -128, 105, 76, 62, { name: "Plan view base plate left", material: "S275 Gr 50", width: 1.1 }));
  add(makeTemplateRect(origin, -42, 105, 76, 62, { name: "Plan view base plate middle", material: "S275 Gr 50", width: 1.1 }));
  add(makeTemplateRect(origin, 44, 105, 96, 62, { name: "Plan view brace lug", material: "S275 Gr 50", width: 1.1 }));
  add(makeTemplateLine(origin, -132, 136, 144, 136, { name: "Plan view centreline", dash: "12 7", lineType: "dash-dot", width: 0.65, opacity: 0.55 }));
  [-104, -68, -18, 18, 68, 112].forEach((x) => add(makeTemplateBoltElement(origin, x, 124, "Plan view bolt")));
  [-104, -68, -18, 18].forEach((x) => add(makeTemplateBoltElement(origin, x, 150, "Plan view bolt")));

  add(makeTemplateLeaderElement(origin, -118, -82, -210, -158, "BPSS"));
  add(makeTemplateLeaderElement(origin, -32, -34, -206, -8, "10in STIFF\nRIBS"));
  add(makeTemplateLeaderElement(origin, 76, -94, 196, -142, "1in DIA\nBOLTS"));
  add(makeTemplateLeaderElement(origin, 116, 10, 212, 46, "CAP SIDE \"A\"\nPLATE LUG"));
  add(makeTemplateLeaderElement(origin, 254, -20, 322, -78, "TYP"));
  add(makeTemplateLeaderElement(origin, -92, 126, -194, 205, "PL BASE\nALL AE ASTM\nGr 50"));
  add(makeTemplateLeaderElement(origin, 98, 132, 210, 202, "PL 1/4\nSHAPE LUG"));

  add(makeTemplateMeasure(origin, -154, 18, 162, 18, "7.50   7.00   7.00   10.00   10.00", 34));
  add(makeTemplateMeasure(origin, -154, 10, -154, 48, "1-1/2 PLAT", -26));
  add(makeTemplateMeasure(origin, -128, 170, 140, 170, "40.00", 16));
  add(makeTemplateMeasure(origin, -128, 167, 34, 167, "31.50", 30));
  add(makeTemplateMeasure(origin, -128, 105, -128, 167, "10.50", -18));

  add(makeTemplateText(origin, "D-05", 0, 226, { size: 14, anchor: "middle" }));
  add(makeTemplateText(origin, "BRACE BASEPLATE CONNECTION DETAIL", 0, 246, { size: 16, anchor: "middle", weight: "700" }));
  add(makeTemplateLine(origin, -160, 252, 160, 252, { name: "Detail title underline", layer: "notes", width: 1.1 }));
  add(makeTemplateText(origin, "SCALE 1:10", 0, 265, { size: 8.5, anchor: "middle" }));

  return elements;
}

function addBreakMark(elements, origin, x, y, orientation = "horizontal", scale = 1) {
  const d = orientation === "horizontal"
    ? `M ${x - 22 * scale} ${y} L ${x - 8 * scale} ${y} L ${x - 2 * scale} ${y - 10 * scale} L ${x + 4 * scale} ${y + 10 * scale} L ${x + 10 * scale} ${y} L ${x + 24 * scale} ${y}`
    : `M ${x} ${y - 22 * scale} L ${x} ${y - 8 * scale} L ${x - 10 * scale} ${y - 2 * scale} L ${x + 10 * scale} ${y + 4 * scale} L ${x} ${y + 10 * scale} L ${x} ${y + 24 * scale}`;
  elements.push(makeTemplatePath(origin, d, { name: "Break line", layer: "notes", width: 1 }));
}

function addHexBolt(elements, origin, x, y, radius = 8, name = "Bolt / nut") {
  const points = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = Math.PI / 6 + i * Math.PI / 3;
    points.push([x + Math.cos(angle) * radius, y + Math.sin(angle) * radius]);
  }
  elements.push(makeTemplatePolygon(origin, points, { name, width: 1.1 }));
  elements.push(makeTemplateCircle(origin, x, y, radius * 0.45, { name: `${name} washer`, width: 0.9 }));
  elements.push(makeTemplateLine(origin, x - radius * 0.75, y, x + radius * 0.75, y, { name: `${name} centre mark`, width: 0.7 }));
  elements.push(makeTemplateLine(origin, x, y - radius * 0.75, x, y + radius * 0.75, { name: `${name} centre mark`, width: 0.7 }));
}

function addISection(elements, origin, x, y, height = 150, flange = 32, web = 10, name = "Column I-section") {
  elements.push(makeTemplateLine(origin, x - flange / 2, y - height / 2, x - flange / 2, y + height / 2, { name: `${name} outer flange`, width: 1.3 }));
  elements.push(makeTemplateLine(origin, x + flange / 2, y - height / 2, x + flange / 2, y + height / 2, { name: `${name} outer flange`, width: 1.3 }));
  elements.push(makeTemplateLine(origin, x - web / 2, y - height / 2, x - web / 2, y + height / 2, { name: `${name} web`, width: 0.9 }));
  elements.push(makeTemplateLine(origin, x + web / 2, y - height / 2, x + web / 2, y + height / 2, { name: `${name} web`, width: 0.9 }));
}

function addBeamSide(elements, origin, x, y, length = 150, depth = 64, name = "Beam side view") {
  elements.push(makeTemplateRect(origin, x, y - depth / 2, length, depth, { name, width: 1.1 }));
  elements.push(makeTemplateLine(origin, x, y, x + length, y, { name: `${name} centreline`, width: 0.65, dash: "10 6", lineType: "center", opacity: 0.55 }));
  addBreakMark(elements, origin, x + length + 6, y - depth / 2 + 2, "vertical", 0.75);
  addBreakMark(elements, origin, x + length + 6, y + depth / 2 - 2, "vertical", 0.75);
}

function addEndPlateBoltPair(elements, origin, x, y) {
  elements.push(makeTemplateRect(origin, x - 34, y - 19, 68, 38, { name: "End plate bolt zone", width: 1 }));
  elements.push(makeBoltSideSymbol("M16", templatePoint(origin, x - 16, y), { name: "Bolted connection side-view bolt", strokeWidth: 0.9 }));
  elements.push(makeBoltSideSymbol("M16", templatePoint(origin, x + 16, y), { name: "Bolted connection side-view bolt", strokeWidth: 0.9 }));
  elements.push(makeTemplateLine(origin, x - 44, y, x + 44, y, { name: "Bolt row centreline", dash: "9 6", lineType: "center", width: 0.65, opacity: 0.55 }));
}

function buildBeamColumnConnectionTemplateElements(origin = centerPoint()) {
  const elements = [];
  const add = (element) => {
    if (element) elements.push(element);
    return element;
  };

  const a = { x: -255, y: -185 };
  addISection(elements, origin, a.x - 82, a.y + 62, 126, 30, 8, "Top-left column section");
  add(makeTemplateLine(origin, a.x - 47, a.y - 6, a.x + 64, a.y - 6, { name: "Beam top flange", width: 1.2 }));
  add(makeTemplateLine(origin, a.x - 47, a.y + 56, a.x + 64, a.y + 56, { name: "Beam bottom flange", width: 1.2 }));
  add(makeTemplateLine(origin, a.x - 47, a.y - 6, a.x - 47, a.y + 56, { name: "Beam web end", width: 1.2 }));
  add(makeTemplateLine(origin, a.x + 4, a.y - 6, a.x + 4, a.y + 56, { name: "End plate", width: 1.2 }));
  add(makeTemplateLine(origin, a.x + 13, a.y - 22, a.x + 13, a.y + 72, { name: "Column face plate", width: 1 }));
  add(makeTemplateRect(origin, a.x - 9, a.y + 2, 34, 46, { name: "Cleat / plate pack", width: 1 }));
  add(makeTemplateCircle(origin, a.x + 16, a.y + 26, 46, { name: "Enlarged bolt callout circle", layer: "notes", width: 1.1 }));
  addEndPlateBoltPair(elements, origin, a.x + 13, a.y + 26);
  add(makeTemplateLine(origin, a.x + 58, a.y - 20, a.x + 104, a.y - 20, { name: "Reference line", width: 0.8 }));
  add(makeTemplateLine(origin, a.x + 58, a.y + 72, a.x + 104, a.y + 72, { name: "Reference line", width: 0.8 }));
  add(makeTemplateLine(origin, a.x + 104, a.y - 42, a.x + 104, a.y + 92, { name: "Reference vertical", width: 0.8 }));
  add(makeArrow(templatePoint(origin, a.x + 80, a.y + 25), templatePoint(origin, a.x + 155, a.y + 48), { label: "", headSize: 8 }));
  add(makeArrow(templatePoint(origin, a.x + 118, a.y + 6), templatePoint(origin, a.x + 165, a.y + 6), { label: "", headSize: 8 }));
  addBreakMark(elements, origin, a.x + 112, a.y + 11, "horizontal", 0.65);

  const b = { x: 115, y: -190 };
  addISection(elements, origin, b.x - 56, b.y + 58, 126, 28, 9, "Top-right column section");
  addBeamSide(elements, origin, b.x - 10, b.y + 30, 142, 60, "Top-right beam");
  add(makeTemplateLine(origin, b.x - 20, b.y - 16, b.x - 20, b.y + 82, { name: "End plate", width: 1.2 }));
  add(makeTemplateLine(origin, b.x - 7, b.y - 14, b.x - 7, b.y + 80, { name: "Plate washer line", width: 0.9 }));
  addEndPlateBoltPair(elements, origin, b.x - 14, b.y + 31);
  add(makeArrow(templatePoint(origin, b.x + 72, b.y + 30), templatePoint(origin, b.x + 148, b.y + 30), { label: "", headSize: 8 }));
  add(makeTemplateText(origin, "Tension", b.x - 16, b.y + 98, { size: 8, anchor: "middle" }));
  add(makeTemplateText(origin, "connection", b.x - 16, b.y + 110, { size: 8, anchor: "middle" }));

  const c = { x: -246, y: 40 };
  addISection(elements, origin, c.x - 92, c.y + 45, 188, 30, 8, "Bottom-left column section");
  addBreakMark(elements, origin, c.x - 92, c.y - 50, "vertical", 0.75);
  addBreakMark(elements, origin, c.x - 92, c.y + 142, "vertical", 0.75);
  addBeamSide(elements, origin, c.x + 15, c.y + 56, 140, 82, "Bottom-left beam");
  add(makeTemplateRect(origin, c.x - 42, c.y - 30, 22, 174, { name: "Welded end plate", material: "End plate", width: 1.1 }));
  add(makeTemplateRect(origin, c.x - 20, c.y - 26, 8, 166, { name: "Weld hatch strip", material: "Welded", width: 0.8, fill: "url(#hatch-steel)" }));
  [-8, 48, 105].forEach((y) => addEndPlateBoltPair(elements, origin, c.x - 31, c.y + y));
  add(makeTemplateLeaderElement(origin, c.x + 28, c.y - 18, c.x + 82, c.y - 48, "Welded"));
  add(makeTemplateLeaderElement(origin, c.x + 2, c.y + 143, c.x + 95, c.y + 184, "End plate"));
  add(makeArrow(templatePoint(origin, c.x + 63, c.y + 65), templatePoint(origin, c.x + 63, c.y + 94), { type: "loadArrow", label: "V", headSize: 10 }));
  add(makeArrow(templatePoint(origin, c.x + 94, c.y + 65), templatePoint(origin, c.x + 124, c.y + 65), { type: "loadArrow", label: "M", headSize: 10 }));

  const d = { x: 130, y: 44 };
  add(makeTemplateRect(origin, d.x - 45, d.y - 55, 90, 212, { name: "End plate front view", material: "Bolted end plate", width: 1.3 }));
  add(makeTemplateRect(origin, d.x - 30, d.y - 38, 60, 176, { name: "Beam I-section on end plate", width: 1.1 }));
  add(makeTemplateRect(origin, d.x - 7, d.y - 39, 14, 178, { name: "Beam web on end plate", width: 1 }));
  add(makeTemplateLine(origin, d.x - 45, d.y + 19, d.x + 45, d.y + 19, { name: "Stiffener/plate division", width: 1 }));
  add(makeTemplateLine(origin, d.x - 45, d.y + 85, d.x + 45, d.y + 85, { name: "Stiffener/plate division", width: 1 }));
  add(makeTemplateLine(origin, d.x, d.y - 68, d.x, d.y + 170, { name: "End plate centreline", dash: "10 6", lineType: "center", width: 0.65, opacity: 0.55 }));
  add(makeTemplateLine(origin, d.x - 59, d.y + 19, d.x + 59, d.y + 19, { name: "Bolt row centreline", dash: "10 6", lineType: "center", width: 0.65, opacity: 0.55 }));
  add(makeTemplateLine(origin, d.x - 59, d.y + 85, d.x + 59, d.y + 85, { name: "Bolt row centreline", dash: "10 6", lineType: "center", width: 0.65, opacity: 0.55 }));
  [-26, 26].forEach((x) => [-35, 20, 76].forEach((y) => addHexBolt(elements, origin, d.x + x, d.y + y, 9, "End plate bolt")));

  add(makeTemplateText(origin, "Figure 2  Bolted beam-to-column connection", -278, 220, { size: 11, anchor: "start" }));
  return elements;
}

function addTemplateElement(elements, element) {
  if (element) elements.push(element);
  return element;
}

function makeTemplateScrew(origin, x, y, sku = "CSA5.0X40", view = "top", rotation = 0, name = "") {
  const screw = makeScrewSymbol(sku, templatePoint(origin, x, y), {
    view,
    rotation,
    color: "#111111",
    strokeWidth: 0.35,
    name: name || `${sku} Simpson CSA beslagskrue`,
  });
  screw.dataset.dimension = name || `${sku} Simpson CSA beslagskrue`;
  screw.dataset.rotation = String(rotation);
  screw.setAttribute("transform", `translate(${origin.x + x} ${origin.y + y}) rotate(${rotation})`);
  return screw;
}

function makeTemplateManufacturer(origin, familyId, sku, view, x, y, options = {}) {
  const component = makeManufacturerComponent("simpson-strong-tie", familyId, sku, view, templatePoint(origin, x, y));
  if (!component) return null;
  component.dataset.dimension = options.name || component.dataset.dimension;
  component.dataset.strokeWidth = String(options.strokeWidth || 0.75);
  component.dataset.opacity = String(options.opacity || 100);
  component.dataset.rotation = String(options.rotation || 0);
  component.setAttribute("transform", `translate(${origin.x + x} ${origin.y + y}) rotate(${options.rotation || 0})`);
  renderManufacturerComponent(component);
  return component;
}

function buildPolishedConnectionDetailElements(origin = centerPoint()) {
  const elements = [];
  const add = (element) => addTemplateElement(elements, element);

  add(makeDetailViewport(templatePoint(origin, 0, 4), {
    id: "D-14",
    title: "BSIN JOIST HANGER TO TIMBER HEADER",
    scale: "SCALE 1:5",
    width: 650,
    height: 430,
  }));

  const elevation = { x: -168, y: -16 };
  const section = { x: 238, y: -16 };

  add(makeTemplateRect(origin, elevation.x - 98, elevation.y - 132, 196, 264, {
    name: "Elevation header face - C24 timber",
    material: "C24",
    fill: "#fffefb",
    width: 0.85,
    layer: "timber",
  }));
  add(makeTemplateRect(origin, elevation.x - 42, elevation.y - 72.5, 84, 145, {
    name: "45 x 145 joist end face",
    material: "C24",
    fill: "url(#hatch-wood)",
    width: 0.8,
    layer: "timber",
  }));
  add(makeTemplateLine(origin, elevation.x, elevation.y - 104, elevation.x, elevation.y + 104, {
    name: "Joist centreline",
    width: 0.5,
    dash: "12 7",
    lineType: "center",
    opacity: 0.5,
    layer: "notes",
  }));
  add(makeTemplateLine(origin, elevation.x - 70, elevation.y, elevation.x + 70, elevation.y, {
    name: "Hanger horizontal centreline",
    width: 0.5,
    dash: "12 7",
    lineType: "center",
    opacity: 0.45,
    layer: "notes",
  }));
  add(makeTemplateManufacturer(origin, "simpson-bsin", "BSIN80/150", "elevation", elevation.x, elevation.y, {
    name: "Simpson BSIN80/150 joist hanger - elevation",
    strokeWidth: 0.58,
  }));

  [
    [-30, -54], [30, -54],
    [-30, -24], [30, -24],
    [-30, 8], [30, 8],
    [-30, 40], [30, 40],
  ].forEach(([x, y]) => add(makeTemplateFastenerMarker(origin, elevation.x + x, elevation.y + y, "CSA5.0X40 fixing in BSIN hanger")));

  add(makeTemplateText(origin, "ELEVATION", elevation.x, elevation.y + 158, { size: 11, anchor: "middle", weight: "700" }));
  add(makeTemplateLine(origin, elevation.x - 47, elevation.y + 164, elevation.x + 47, elevation.y + 164, { name: "Elevation title underline", width: 0.8, layer: "notes" }));

  add(makeTemplateRect(origin, section.x - 108, section.y - 124, 56, 248, {
    name: "Section A header - 45mm timber",
    material: "C24",
    fill: "url(#hatch-wood)",
    width: 0.85,
    layer: "timber",
  }));
  add(makeTemplateRect(origin, section.x - 52, section.y - 72.5, 228, 145, {
    name: "Section A 45 x 145 joist",
    material: "C24",
    fill: "#fffefb",
    width: 0.9,
    layer: "timber",
  }));
  add(makeTemplateRect(origin, section.x - 56, section.y - 75.5, 7, 151, {
    name: "Hanger side flange / bearing leg",
    material: "Galvanised steel",
    fill: "#f4f4f1",
    width: 0.75,
    layer: "steel",
  }));
  add(makeTemplateLine(origin, section.x - 52, section.y - 72.5, section.x - 52, section.y + 72.5, { name: "Joist bearing line", width: 1.2 }));
  add(makeTemplateManufacturer(origin, "simpson-bsin", "BSIN80/150", "side", section.x - 48, section.y, {
    name: "Simpson BSIN80/150 joist hanger - side",
    strokeWidth: 0.58,
  }));
  [-48, -16, 16, 48].forEach((y) => add(makeTemplateLine(origin, section.x - 102, section.y + y, section.x - 52, section.y + y, {
    name: "CSA fixing penetration",
    width: 0.55,
    dash: "5 3",
    lineType: "hidden",
    opacity: 0.65,
    layer: "steel",
  })));

  add(makeTemplateScrew(origin, section.x + 106, section.y - 148, "CSA5.0X40", "side", 90, "Typical CSA5.0X40 screw side view"));
  add(makeTemplateText(origin, "TYP. CSA5.0X40", section.x + 104, section.y - 122, { size: 7, anchor: "middle", weight: "700" }));
  add(makeTemplateLine(origin, section.x + 82, section.y - 112, section.x + 126, section.y - 112, { name: "Screw callout underline", width: 0.6, layer: "notes" }));

  add(makeTemplateText(origin, "SECTION A-A", section.x + 34, section.y + 158, { size: 11, anchor: "middle", weight: "700" }));
  add(makeTemplateLine(origin, section.x - 16, section.y + 164, section.x + 84, section.y + 164, { name: "Section title underline", width: 0.8, layer: "notes" }));

  add(makeTemplateLeaderElement(origin, elevation.x - 18, elevation.y - 86, -318, -166, "SIMPSON BSIN80/150|VERIFIED 1:1 DXF GEOMETRY"));
  add(makeTemplateLeaderElement(origin, elevation.x + 30, elevation.y - 24, 10, -154, "CSA5.0X40 FIXINGS|SYMBOLIC HOLE PATTERN SHOWN"));
  add(makeTemplateLeaderElement(origin, elevation.x - 84, elevation.y - 104, -324, -62, "C24 HEADER / SUPPORT MEMBER"));
  add(makeTemplateLeaderElement(origin, elevation.x + 42, elevation.y + 4, 22, 72, "45 x 145 C24 JOIST END|FULLY SEATED IN HANGER"));
  add(makeTemplateLeaderElement(origin, section.x - 51, section.y + 72, 448, 42, "HANGER SEAT / BOTTOM LEG"));
  add(makeTemplateLeaderElement(origin, section.x - 82, section.y - 18, 434, -58, "SCREW PENETRATION SHOWN DASHED|FINAL FIXING TO PROJECT DESIGN"));

  add(makeTemplateMeasure(origin, elevation.x - 42, elevation.y - 72.5, elevation.x + 42, elevation.y - 72.5, "84", 20));
  add(makeTemplateMeasure(origin, elevation.x + 42, elevation.y - 72.5, elevation.x + 42, elevation.y + 72.5, "145", 22));
  add(makeTemplateMeasure(origin, elevation.x - 98, elevation.y - 132, elevation.x - 98, elevation.y + 132, "HEADER FACE", -24));
  add(makeTemplateMeasure(origin, section.x - 108, section.y - 124, section.x - 52, section.y - 124, "45", 18));
  add(makeTemplateMeasure(origin, section.x - 52, section.y - 72.5, section.x + 176, section.y - 72.5, "JOIST", 22));
  add(makeTemplateMeasure(origin, section.x + 176, section.y - 72.5, section.x + 176, section.y + 72.5, "145", 20));

  add(makeTemplateLine(origin, elevation.x - 52, elevation.y + 96, elevation.x + 52, elevation.y + 96, { name: "Section cut A-A", width: 0.85, layer: "notes" }));
  add(makeTemplateText(origin, "A", elevation.x - 65, elevation.y + 100, { size: 8, anchor: "middle", weight: "700" }));
  add(makeTemplateText(origin, "A", elevation.x + 65, elevation.y + 100, { size: 8, anchor: "middle", weight: "700" }));
  add(makeTemplatePolygon(origin, [[elevation.x - 52, elevation.y + 96], [elevation.x - 42, elevation.y + 90], [elevation.x - 42, elevation.y + 102]], { name: "Section arrow", fill: "#111111", width: 0, layer: "notes" }));
  add(makeTemplatePolygon(origin, [[elevation.x + 52, elevation.y + 96], [elevation.x + 42, elevation.y + 90], [elevation.x + 42, elevation.y + 102]], { name: "Section arrow", fill: "#111111", width: 0, layer: "notes" }));

  add(makeTemplateRect(origin, -318, 184, 238, 82, { name: "Fastener schedule frame", width: 0.65, layer: "notes" }));
  add(makeTemplateLine(origin, -318, 205, -80, 205, { name: "Schedule divider", width: 0.55, layer: "notes" }));
  add(makeTemplateLine(origin, -246, 184, -246, 266, { name: "Schedule divider", width: 0.55, layer: "notes" }));
  add(makeTemplateLine(origin, -170, 184, -170, 266, { name: "Schedule divider", width: 0.55, layer: "notes" }));
  add(makeTemplateText(origin, "FIXING SCHEDULE", -199, 199, { size: 7.2, anchor: "middle", weight: "700" }));
  add(makeTemplateText(origin, "ITEM", -304, 222, { size: 6.2, weight: "700" }));
  add(makeTemplateText(origin, "SIZE", -232, 222, { size: 6.2, weight: "700" }));
  add(makeTemplateText(origin, "USE", -158, 222, { size: 6.2, weight: "700" }));
  add(makeTemplateText(origin, "1", -304, 242, { size: 6.2 }));
  add(makeTemplateText(origin, "CSA5.0X40", -232, 242, { size: 6.2 }));
  add(makeTemplateText(origin, "BSIN to timber", -158, 242, { size: 6.2 }));
  add(makeTemplateText(origin, "NOTE: geometry is traced from Simpson CAD; fixing quantity/load design must be verified.", -318, 288, { size: 6.2, anchor: "start" }));

  add(makeTemplateText(origin, "D-14", 0, 252, { size: 13, anchor: "middle" }));
  add(makeTemplateText(origin, "TIMBER JOIST HANGER CONNECTION DETAIL", 0, 273, { size: 15, anchor: "middle", weight: "700" }));
  add(makeTemplateLine(origin, -168, 280, 168, 280, { name: "Detail title underline", layer: "notes", width: 0.9 }));
  add(makeTemplateText(origin, "SCALE 1:5", 0, 296, { size: 8.2, anchor: "middle" }));

  return elements;

  add(makeDetailViewport(templatePoint(origin, 0, 5), {
    id: "D-14",
    title: "BSIN JOIST HANGER TO TIMBER HEADER",
    scale: "SCALE 1:5",
    width: 650,
    height: 430,
  }));

  add(makeTemplateRect(origin, -278, -128, 118, 292, {
    name: "C24 timber header 45 x 195",
    material: "C24",
    fill: "url(#hatch-wood)",
    width: 0.9,
    layer: "timber",
  }));
  add(makeTemplateRect(origin, -168, -84, 306, 84, {
    name: "C24 secondary joist 45 x 145",
    material: "C24",
    fill: "#fffefb",
    width: 1.15,
    layer: "timber",
  }));
  add(makeTemplateLine(origin, -168, -42, 138, -42, { name: "Joist centreline", width: 0.55, dash: "12 7", lineType: "center", opacity: 0.48, layer: "notes" }));
  add(makeTemplateLine(origin, -220, -155, -220, 188, { name: "Header centreline", width: 0.55, dash: "12 7", lineType: "center", opacity: 0.48, layer: "notes" }));
  add(makeTemplateManufacturer(origin, "simpson-bsin", "BSIN80/150", "elevation", -82, -44, {
    name: "Simpson BSIN80/150 bjælkesko - elevation",
    strokeWidth: 0.65,
  }));

  const screwPositions = [
    [-112, -100], [-82, -100], [-52, -100],
    [-118, -64], [-46, -64],
    [-118, -22], [-46, -22],
    [-112, 18], [-82, 18], [-52, 18],
  ];
  screwPositions.forEach(([x, y]) => add(makeTemplateScrew(origin, x, y, "CSA5.0X40", "top", 0, "CSA5.0X40 in hanger holes")));

  add(makeTemplateRect(origin, 180, -124, 74, 248, {
    name: "Section A timber header",
    material: "C24",
    fill: "url(#hatch-wood)",
    width: 0.9,
    layer: "timber",
  }));
  add(makeTemplateRect(origin, 254, -76, 145, 92, {
    name: "Section A secondary joist",
    material: "C24",
    fill: "#fffefb",
    width: 1,
    layer: "timber",
  }));
  add(makeTemplateLine(origin, 254, -76, 254, 16, { name: "Joist bearing line", width: 1.2 }));
  add(makeTemplateManufacturer(origin, "simpson-bsin", "BSIN80/150", "side", 238, -36, {
    name: "Simpson BSIN80/150 bjælkesko - side",
    strokeWidth: 0.65,
  }));
  [-92, -56, -20, 16, 52].forEach((y) => add(makeTemplateScrew(origin, 270, y, "CSA5.0X40", "side", 90, "CSA5.0X40 side view")));

  add(makeTemplateText(origin, "SECTION A-A", 294, 154, { size: 12, anchor: "middle", weight: "700" }));
  add(makeTemplateLine(origin, 228, 160, 360, 160, { name: "Section title underline", width: 0.9, layer: "notes" }));
  add(makeTemplateText(origin, "SCALE 1:5", 294, 174, { size: 8, anchor: "middle" }));

  add(makeTemplateLeaderElement(origin, -86, -126, -306, -170, "SIMPSON STRONG-TIE BSIN80/150|JOIST HANGER, 1:1 DXF GEOMETRY"));
  add(makeTemplateLeaderElement(origin, -92, -100, 50, -172, "CSA5.0X40 BESLAGSSKRUER|INSTALL IN ALL SPECIFIED HOLES"));
  add(makeTemplateLeaderElement(origin, -215, -112, -340, -54, "C24 HEADER MEMBER|45 x 195 MIN."));
  add(makeTemplateLeaderElement(origin, 20, -70, 170, -154, "C24 SECONDARY JOIST|45 x 145 SHOWN"));
  add(makeTemplateLeaderElement(origin, 268, -54, 434, -82, "SCREWS SHOWN IN SIDE VIEW|VERIFY EDGE DISTANCES"));
  add(makeTemplateLeaderElement(origin, 238, 8, 438, 34, "HANGER SEAT / BEARING|JOIST FULLY SEATED"));

  add(makeTemplateMeasure(origin, -278, -128, -160, -128, "118", 22));
  add(makeTemplateMeasure(origin, -160, -84, 138, -84, "SECONDARY JOIST", 24));
  add(makeTemplateMeasure(origin, -160, 0, -160, -84, "145", -22));
  add(makeTemplateMeasure(origin, -278, -128, -278, 164, "195", -26));
  add(makeTemplateMeasure(origin, 180, -124, 254, -124, "45", 22));
  add(makeTemplateMeasure(origin, 254, -76, 399, -76, "145", 25));

  add(makeTemplateLine(origin, -30, 94, 30, 94, { name: "Section cut A-A", width: 0.9, layer: "notes" }));
  add(makeTemplateText(origin, "A", -42, 98, { size: 8, anchor: "middle", weight: "700" }));
  add(makeTemplateText(origin, "A", 42, 98, { size: 8, anchor: "middle", weight: "700" }));
  add(makeTemplatePolygon(origin, [[-30, 94], [-21, 88], [-21, 100]], { name: "Section arrow", fill: "#111111", width: 0, layer: "notes" }));
  add(makeTemplatePolygon(origin, [[30, 94], [21, 88], [21, 100]], { name: "Section arrow", fill: "#111111", width: 0, layer: "notes" }));

  add(makeTemplateRect(origin, -318, 196, 236, 88, { name: "Fastener schedule frame", width: 0.75, layer: "notes" }));
  add(makeTemplateLine(origin, -318, 218, -82, 218, { name: "Schedule divider", width: 0.65, layer: "notes" }));
  add(makeTemplateLine(origin, -238, 196, -238, 284, { name: "Schedule divider", width: 0.65, layer: "notes" }));
  add(makeTemplateLine(origin, -168, 196, -168, 284, { name: "Schedule divider", width: 0.65, layer: "notes" }));
  add(makeTemplateText(origin, "FASTENER SCHEDULE", -200, 212, { size: 8, anchor: "middle", weight: "700" }));
  add(makeTemplateText(origin, "ITEM", -304, 234, { size: 6.5, weight: "700" }));
  add(makeTemplateText(origin, "SIZE", -224, 234, { size: 6.5, weight: "700" }));
  add(makeTemplateText(origin, "USE", -154, 234, { size: 6.5, weight: "700" }));
  add(makeTemplateText(origin, "1", -304, 254, { size: 6.5 }));
  add(makeTemplateText(origin, "CSA5.0X40", -224, 254, { size: 6.5 }));
  add(makeTemplateText(origin, "BSIN hanger to timber", -154, 254, { size: 6.5 }));
  add(makeTemplateText(origin, "NOTE: final fixing pattern to be checked against project loading and Simpson documentation.", -318, 306, { size: 6.5, anchor: "start" }));

  add(makeTemplateText(origin, "D-14", 0, 260, { size: 14, anchor: "middle" }));
  add(makeTemplateText(origin, "TIMBER JOIST HANGER CONNECTION DETAIL", 0, 281, { size: 16, anchor: "middle", weight: "700" }));
  add(makeTemplateLine(origin, -176, 288, 176, 288, { name: "Detail title underline", layer: "notes", width: 1 }));
  add(makeTemplateText(origin, "SCALE 1:5", 0, 304, { size: 8.5, anchor: "middle" }));

  return elements;
}

function makeRect(start, end) {
  const rect = createSvgElement("rect", {
    ...baseAttrs(),
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  });
  rect.classList.add("draw-item");
  rect.dataset.type = "rect";
  rect.dataset.color = strokeColor.value;
  applyDrawStyle(rect);
  return applyLayer(rect, activeLayer.value);
}

function makeCircle(start, end) {
  const radius = Math.hypot(end.x - start.x, end.y - start.y);
  const circle = createSvgElement("circle", {
    ...baseAttrs(),
    cx: start.x,
    cy: start.y,
    r: radius,
  });
  circle.classList.add("draw-item");
  circle.dataset.type = "circle";
  circle.dataset.color = strokeColor.value;
  applyDrawStyle(circle);
  return applyLayer(circle, activeLayer.value);
}

/* A hatch belongs to the material it represents, not to whichever layer was
   written first. Steel hatch on the concrete layer meant turning off concrete
   hid the steel, which is the opposite of what a layer is for. */
const hatchLayer = {
  masonry: "masonry",
  concrete: "masonry",
  steel: "steel",
  wood: "timber",
  insulation: "notes",
};

/* --- Boundary hatch --------------------------------------------------------
   Click inside a closed region and it gets hatched, the way every CAD tool
   does it. What existed before could only drag an axis-aligned RECTANGLE of
   pattern, which meant a wall between two lines, the inside of a member
   outline, or anything with a sloped edge simply could not be hatched.

   The boundary is found by rasterising the drawing with every fill removed --
   so only edges are barriers, exactly like a CAD boundary set -- flood filling
   from the picked point, and tracing the resulting island back into a path.
   Pixels rather than a planar-subdivision solve: it handles arcs, text and
   crossing lines without a geometry kernel, and the trace is simplified back
   to a handful of points before it becomes an object. */

const HATCH_TRACE_MAX_PX = 1400;
const HATCH_TRACE_SIMPLIFY_PX = 1.4;

/* A clone of the drawing with fills stripped and strokes forced dark and thick
   enough that a hairline cannot leak at raster resolution. */
function hatchBoundarySvg(box) {
  const clone = svg.cloneNode(true);
  clone.setAttribute("xmlns", svgNS);
  clone.setAttribute("width", box.width);
  clone.setAttribute("height", box.height);
  clone.setAttribute("viewBox", `${box.x} ${box.y} ${box.width} ${box.height}`);
  clone.setAttribute("style", "background:#ffffff");
  clone.querySelector(".grid-bg")?.remove();
  clone.querySelector(".sheet-shadow")?.remove();
  clone.querySelector("#previewLayer")?.replaceChildren();
  clone.querySelector("#underlayLayer")?.replaceChildren();
  clone.querySelector(".paper-bg")?.setAttribute("fill", "#ffffff");
  clone.querySelectorAll(".selection-overlay, .selection-marquee, .placement-ghost, .snap-marker").forEach((n) => n.remove());
  const minStroke = Math.max(box.width, box.height) / HATCH_TRACE_MAX_PX * 1.6;
  clone.querySelectorAll("#drawingLayer *").forEach((node) => {
    if (node.tagName === "text" || node.tagName === "image") { node.remove(); return; }
    node.setAttribute("fill", "none");
    node.setAttribute("stroke", "#000000");
    node.style.stroke = "#000000";
    node.style.fill = "none";
    const w = Number(node.getAttribute("stroke-width")) || 1;
    node.setAttribute("stroke-width", String(Math.max(w, minStroke)));
    node.removeAttribute("stroke-dasharray");
    node.removeAttribute("opacity");
  });
  return new XMLSerializer().serializeToString(clone);
}

async function rasteriseForHatch(box, w, h) {
  const markup = hatchBoundarySvg(box);
  const blob = new Blob([markup], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    const ok = await new Promise((resolve) => {
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    });
    if (!ok) return null;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* Moore-neighbour tracing: walk the outside of the filled island once. */
function traceMask(mask, w, h, startIndex) {
  const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
  const sx = startIndex % w;
  const sy = (startIndex / w) | 0;
  const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const points = [];
  let cx = sx;
  let cy = sy;
  let dir = 0;
  const guard = w * h * 4;
  for (let step = 0; step < guard; step += 1) {
    points.push([cx, cy]);
    let moved = false;
    for (let i = 0; i < 8; i += 1) {
      const d = (dir + 6 + i) % 8;
      const nx = cx + dirs[d][0];
      const ny = cy + dirs[d][1];
      if (inside(nx, ny)) {
        cx = nx; cy = ny; dir = d; moved = true;
        break;
      }
    }
    if (!moved) break;
    if (cx === sx && cy === sy && points.length > 2) break;
  }
  return points;
}

/* Ramer-Douglas-Peucker, iterative so a long contour cannot blow the stack. */
function simplifyPoints(points, tolerance) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let best = -1;
    let bestDist = tolerance;
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    for (let i = a + 1; i < b; i += 1) {
      const [px, py] = points[i];
      const dist = Math.abs((px - ax) * dy - (py - ay) * dx) / len;
      if (dist > bestDist) { bestDist = dist; best = i; }
    }
    if (best > 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/* Point -> boundary path in drawing coordinates, or a reason it failed. */
async function traceHatchBoundary(point) {
  const box = { x: view.x, y: view.y, width: view.width, height: view.height };
  const scale = Math.min(HATCH_TRACE_MAX_PX / box.width, HATCH_TRACE_MAX_PX / box.height, 3);
  const w = Math.max(2, Math.round(box.width * scale));
  const h = Math.max(2, Math.round(box.height * scale));
  const px = Math.round((point.x - box.x) * scale);
  const py = Math.round((point.y - box.y) * scale);
  if (px < 1 || py < 1 || px >= w - 1 || py >= h - 1) return { error: "Klik inde i tegningen." };

  const image = await rasteriseForHatch(box, w, h);
  if (!image) return { error: "Kunne ikke laese tegningen." };
  const data = image.data;
  const isInk = (i) => data[i * 4] < 128 || data[i * 4 + 1] < 128 || data[i * 4 + 2] < 128;
  if (isInk(py * w + px)) return { error: "Klik i et tomt omraade, ikke paa en streg." };

  /* Flood fill the empty space the point sits in. Reaching the edge of the
     view means the region is not closed -- the same "boundary not found" an
     unclosed region gives in any CAD. */
  const mask = new Uint8Array(w * h);
  const stack = [py * w + px];
  mask[py * w + px] = 1;
  let escaped = false;
  let count = 0;
  while (stack.length) {
    const idx = stack.pop();
    const x = idx % w;
    const y = (idx / w) | 0;
    count += 1;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) { escaped = true; break; }
    const neighbours = [idx - 1, idx + 1, idx - w, idx + w];
    for (const n of neighbours) {
      if (n < 0 || n >= mask.length || mask[n]) continue;
      if (isInk(n)) continue;
      mask[n] = 1;
      stack.push(n);
    }
  }
  if (escaped) return { error: "Ingen lukket kant omkring punktet." };
  if (count < 12) return { error: "Omraadet er for lille." };

  /* Start the trace at the topmost-leftmost filled pixel. */
  let startIndex = -1;
  for (let i = 0; i < mask.length && startIndex < 0; i += 1) if (mask[i]) startIndex = i;
  const traced = traceMask(mask, w, h, startIndex);
  if (traced.length < 4) return { error: "Kunne ikke foelge kanten." };
  const simplified = simplifyPoints(traced, HATCH_TRACE_SIMPLIFY_PX);
  const pts = simplified.map(([x, y]) => [box.x + x / scale, box.y + y / scale]);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"} ${x.toFixed(2)} ${y.toFixed(2)}`).join(" ") + " Z";
  return { d, points: pts.length, areaPx: count };
}

function makeBoundaryHatch(d) {
  const pattern = hatchSelect.value;
  const path = createSvgElement("path", {
    d,
    fill: `url(#hatch-${pattern})`,
    stroke: strokeColor.value,
    "stroke-width": Math.max(1, Number(strokeWidth.value) / 2),
    color: strokeColor.value,
  });
  path.classList.add("draw-item", "hatch-area");
  path.dataset.type = "hatch";
  path.dataset.hatch = pattern;
  path.dataset.hatchBoundary = "traced";
  path.dataset.color = strokeColor.value;
  path.dataset.hatchAngle = String(Number(hatchAngleInput?.value) || 0);
  path.dataset.hatchScale = String(Number(hatchScaleInput?.value) || 1);
  applyHatchAppearance(path);
  applyDrawStyle(path);
  return applyLayer(path, hatchLayer[pattern] || "masonry");
}

async function hatchAtPoint(point) {
  statusText.textContent = "Finder kant...";
  const result = await traceHatchBoundary(point);
  if (result.error) {
    statusText.textContent = result.error;
    return null;
  }
  pushHistory();
  const element = makeBoundaryHatch(result.d);
  drawingLayer.append(element);
  selectOnly(element);
  pushHistory();
  statusText.textContent = `Skravering lagt i omraadet (${result.points} punkter).`;
  return element;
}

/* --- Polyline -------------------------------------------------------------
   The line tool already refuses to let go between segments, so a chain was
   always drawable -- but it came out as N separate line objects. Select the
   outline of a plate and you selected four things; offset it and you offset
   four things that no longer met at the corners; hatch inside it and the
   boundary was only as good as the four gaps between them.

   A polyline is one object with its vertices in the dataset, a grip on each,
   and an optional close. Closed ones are exactly what the boundary hatch wants
   to find. */

function polylinePoints(element) {
  return (element.dataset.points || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((pair) => pair.split(",").map(Number))
    .filter((p) => p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]));
}

function setPolylinePoints(element, points) {
  element.dataset.points = points.map(([x, y]) => `${x},${y}`).join(" ");
}

function polylinePathData(points, closed) {
  if (!points.length) return "";
  return points.map(([x, y], i) => `${i ? "L" : "M"} ${x} ${y}`).join(" ") + (closed ? " Z" : "");
}

function renderPolyline(element) {
  const points = polylinePoints(element);
  element.setAttribute("d", polylinePathData(points, element.dataset.closed === "true"));
  element.setAttribute("fill", "none");
  applyDrawStyle(element, elementStyle(element));
}

function makePolyline(points, closed = false) {
  const path = createSvgElement("path", {
    d: polylinePathData(points, closed),
    fill: "none",
    stroke: strokeColor.value,
    "stroke-width": paperMmToUnits(Number(strokeWidth.value) || 0.35),
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  });
  path.classList.add("draw-item");
  path.dataset.type = "polyline";
  setPolylinePoints(path, points);
  path.dataset.closed = closed ? "true" : "false";
  path.dataset.color = strokeColor.value;
  path.dataset.strokeWidth = String(strokeWidth.value || 0.35);
  path.dataset.lineType = lineTypeSelect.value || "solid";
  path.dataset.opacity = String(strokeOpacity.value || 100);
  path.dataset.rotation = "0";
  applyDrawStyle(path);
  return applyLayer(path, activeLayer.value);
}

function polylineLengthMm(element) {
  const points = polylinePoints(element);
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  if (element.dataset.closed === "true" && points.length > 2) {
    total += Math.hypot(points[0][0] - points.at(-1)[0], points[0][1] - points.at(-1)[1]);
  }
  return total * getScaleValue();
}

/* --- the tool -------------------------------------------------------------
   Click to add a vertex, Enter or double-click to finish, C to close, Esc to
   throw the chain away. The rubber band is drawn in the preview layer, which is
   cleared for us on every tool change. */
let polylineDraft = null;

function polylineDraftActive() {
  return Boolean(polylineDraft && polylineDraft.points.length);
}

function beginPolyline() {
  polylineDraft = { points: [] };
}

function renderPolylineDraft(cursor) {
  clearPreview();
  if (!polylineDraftActive()) return;
  const points = cursor ? polylineDraft.points.concat([[cursor.x, cursor.y]]) : polylineDraft.points;
  const ghost = createSvgElement("path", {
    d: polylinePathData(points, false),
    fill: "none",
    stroke: strokeColor.value,
    "stroke-width": paperMmToUnits(Number(strokeWidth.value) || 0.35),
    "stroke-dasharray": "10 6",
    opacity: 0.9,
  });
  ghost.classList.add("placement-ghost");
  previewLayer.append(ghost);
  polylineDraft.points.forEach(([x, y]) => {
    const dot = createSvgElement("circle", { cx: x, cy: y, r: 5 / zoom, class: "selection-grip" });
    previewLayer.append(dot);
  });
}

function addPolylinePoint(point) {
  if (!polylineDraft) beginPolyline();
  polylineDraft.points.push([point.x, point.y]);
  renderPolylineDraft(point);
  statusText.textContent = polylineDraft.points.length < 2
    ? "Polylinje: klik naeste punkt."
    : `Polylinje: ${polylineDraft.points.length} punkter. Enter afslutter, C lukker, Esc fortryder.`;
}

function finishPolyline(closed = false) {
  if (!polylineDraftActive() || polylineDraft.points.length < 2) {
    polylineDraft = null;
    clearPreview();
    return null;
  }
  const element = makePolyline(polylineDraft.points, closed);
  polylineDraft = null;
  clearPreview();
  pushHistory();
  drawingLayer.append(element);
  selectOnly(element);
  pushHistory();
  statusText.textContent = closed ? "Lukket polylinje oprettet." : "Polylinje oprettet.";
  return element;
}

function cancelPolyline() {
  polylineDraft = null;
  clearPreview();
}

function makeHatch(start, end) {
  const pattern = hatchSelect.value;
  const hatch = createSvgElement("rect", {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
    fill: `url(#hatch-${pattern})`,
    stroke: strokeColor.value,
    "stroke-width": Math.max(1, Number(strokeWidth.value) / 2),
    color: strokeColor.value,
  });
  hatch.classList.add("draw-item", "hatch-area");
  hatch.dataset.type = "hatch";
  hatch.dataset.hatch = pattern;
  hatch.dataset.color = strokeColor.value;
  hatch.dataset.hatchAngle = String(Number(hatchAngleInput?.value) || 0);
  hatch.dataset.hatchScale = String(Number(hatchScaleInput?.value) || 1);
  applyHatchAppearance(hatch);
  applyDrawStyle(hatch);
  return applyLayer(hatch, hatchLayer[pattern] || "masonry");
}

/* Hatch spacing is authored in drawing units, so at 1:50 a 12-unit timber rake
   printed at 0.24 mm on paper -- a solid grey smear. The patterns are shared
   defs, so one pass over them at the plot scale fixes every hatch at once, the
   same way the pen table is restated when the scale changes. */
function refreshHatchScale() {
  const scale = Math.max(0.05, Number(sheet.plotScale) || 1);
  document.querySelectorAll('pattern[id^="hatch-"]').forEach((node) => {
    if (node.dataset.baseTransform === undefined) {
      node.dataset.baseTransform = node.getAttribute("patternTransform") || "";
    }
    const base = node.dataset.baseTransform;
    node.setAttribute("patternTransform", `scale(${scale}) ${base}`.trim());
  });
}

function formatDistance(value) {
  if (value >= 1000) {
    const meters = value / 1000;
    return `${Number.isInteger(meters) ? meters : meters.toFixed(2)} m`;
  }
  return `${Math.round(value)} mm`;
}

function makeTick(center, direction, normal) {
  const size = 7;
  return createSvgElement("line", {
    x1: center.x - direction.x * size + normal.x * size,
    y1: center.y - direction.y * size + normal.y * size,
    x2: center.x + direction.x * size - normal.x * size,
    y2: center.y + direction.y * size - normal.y * size,
    class: "measure-tick",
  });
}

function renderMeasure(group) {
  const start = { x: Number(group.dataset.startX), y: Number(group.dataset.startY) };
  const end = { x: Number(group.dataset.endX), y: Number(group.dataset.endY) };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const rawDistance = Math.hypot(dx, dy);
  group.replaceChildren();
  if (rawDistance < 1) return;

  const direction = { x: dx / rawDistance, y: dy / rawDistance };
  const normal = { x: -direction.y, y: direction.x };
  const offset = Number(group.dataset.measureOffset || 24);
  const extensionPast = 8;
  const a = { x: start.x + normal.x * offset, y: start.y + normal.y * offset };
  const b = { x: end.x + normal.x * offset, y: end.y + normal.y * offset };
  const labelPoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const distance = rawDistance * getScaleValue();
  const labelText = group.dataset.measureMode === "custom" && group.dataset.customText
    ? group.dataset.customText
    : formatDistance(distance);
  const compact = group.classList.contains("template-measure");
  const textSize = Number(group.dataset.textSize || (compact ? 6.5 : 10));
  const labelWidth = Math.max(compact ? 20 : 36, labelText.length * textSize * 0.55 + 8);
  const labelHeight = compact ? 10 : 15;
  const labelY = labelPoint.y - labelHeight / 2;

  group.append(
    createSvgElement("line", {
      x1: start.x,
      y1: start.y,
      x2: start.x + normal.x * (offset + extensionPast),
      y2: start.y + normal.y * (offset + extensionPast),
      class: "measure-extension",
    }),
    createSvgElement("line", {
      x1: end.x,
      y1: end.y,
      x2: end.x + normal.x * (offset + extensionPast),
      y2: end.y + normal.y * (offset + extensionPast),
      class: "measure-extension",
    }),
    createSvgElement("line", {
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
      class: "measure-line",
    }),
    makeTick(a, direction, normal),
    makeTick(b, direction, normal),
    createSvgElement("rect", {
      x: labelPoint.x - labelWidth / 2,
      y: labelY,
      width: labelWidth,
      height: labelHeight,
      rx: 1,
      class: "measure-label-bg",
    }),
    createSvgElement("text", {
      x: labelPoint.x,
      y: labelPoint.y + textSize * 0.34,
      class: "measure-label",
    })
  );

  const label = group.querySelector(".measure-label");
  setTextSize(label, group.closest(".template-measure") ? textStyles.small : textStyles.dimension);
  label.textContent = labelText;
}

function makeMeasure(start, end) {
  const group = createSvgElement("g");
  group.classList.add("draw-item");
  group.dataset.type = "measure";
  group.dataset.startX = start.x;
  group.dataset.startY = start.y;
  group.dataset.endX = end.x;
  group.dataset.endY = end.y;
  group.dataset.layer = "measure";
  group.dataset.measureMode = "actual";
  group.dataset.measureOffset = "28";
  group.dataset.textSize = "10";
  renderMeasure(group);
  return applyLayer(group, "measure");
}

function updateAllMeasures() {
  drawingLayer.querySelectorAll('[data-type="measure"]').forEach(renderMeasure);
}

async function createTextAtPoint(point) {
  const value = await showPrompt("Tekst paa tegningen", "Tekst", "Note");
  if (!value) return;
  const text = makeText(point, value);
  if (!text) return;
  pushHistory();
  drawingLayer.append(text);
  selectOnly(text);
  pushHistory();
  statusText.textContent = "Tekst tilfoejet.";
}

function makeText(point, textValue) {
  if (!textValue) return null;
  const text = createSvgElement("text", {
    x: point.x,
    y: point.y,
    fill: strokeColor.value,
    "font-weight": "700",
  });
  setTextSize(text, textStyles.note);
  text.textContent = textValue;
  text.classList.add("draw-item");
  text.dataset.type = "text";
  text.dataset.color = strokeColor.value;
  return applyLayer(text, "notes");
}

function appendLine(group, x1, y1, x2, y2, width = 3) {
  group.append(createSvgElement("line", {
    x1,
    y1,
    x2,
    y2,
    stroke: "currentColor",
    "stroke-width": width,
    "stroke-linecap": "round",
  }));
}

function appendCircle(group, cx, cy, r, width = 3, fill = "none") {
  group.append(createSvgElement("circle", {
    cx,
    cy,
    r,
    fill,
    stroke: "currentColor",
    "stroke-width": width,
  }));
}

function appendRect(group, x, y, width, height, strokeWidth = 3, fill = "none") {
  group.append(createSvgElement("rect", {
    x,
    y,
    width,
    height,
    fill,
    stroke: "currentColor",
    "stroke-width": strokeWidth,
    rx: 2,
  }));
}

function appendText(group, textValue, x, y, size = 14) {
  const text = createSvgElement("text", {
    x,
    y,
    fill: "currentColor",
    "font-size": size,
    "font-weight": "700",
    "text-anchor": "middle",
  });
  text.textContent = textValue;
  group.append(text);
}

function appendSlot(group, cx, cy, width, height, strokeWidth = 1) {
  const radius = height / 2;
  group.append(createSvgElement("path", {
    d: `M ${cx - width / 2 + radius} ${cy - height / 2} H ${cx + width / 2 - radius} A ${radius} ${radius} 0 0 1 ${cx + width / 2 - radius} ${cy + height / 2} H ${cx - width / 2 + radius} A ${radius} ${radius} 0 0 1 ${cx - width / 2 + radius} ${cy - height / 2} Z`,
    fill: "none",
    stroke: "currentColor",
    "stroke-width": strokeWidth,
    "stroke-linejoin": "round",
  }));
}

function appendBoltGrid(group, cols = 2, rows = 2, spacingX = 34, spacingY = 30, radius = 4) {
  const startX = -((cols - 1) * spacingX) / 2;
  const startY = -((rows - 1) * spacingY) / 2;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = startX + col * spacingX;
      const y = startY + row * spacingY;
      appendCircle(group, x, y, radius, 1);
      appendLine(group, x - radius * 1.9, y, x + radius * 1.9, y, 0.55);
      appendLine(group, x, y - radius * 1.9, x, y + radius * 1.9, 0.55);
    }
  }
}

/* --- Parametric steel plate ------------------------------------------------
   The single most-used object in steel detailing, and until now it did not
   exist in editable form: the "plate" symbol was a fixed 60 x 40 drawing-unit
   cartoon with four holes at invented positions, and the library's "Gusset
   plate" and "Base plate" were the same picture under different names. A real
   detail needs an 8 mm x 120 x 200 flitch plate with a stated hole pattern, and
   there was no way to draw one except by hand with the rect tool.

   Everything is stored in real millimetres on the element and re-rendered from
   those, so changing thickness or hole spacing redraws rather than rescales. */
const plateDefaults = {
  lengthMm: 300,
  widthMm: 160,
  thicknessMm: 10,
  cols: 3,
  rows: 2,
  pitchXMm: 90,
  pitchYMm: 80,
  holeMm: 18,
  slotted: false,
  slotMm: 26,
  material: "S355",
};

function plateParams(group) {
  const out = { ...plateDefaults };
  Object.keys(plateDefaults).forEach((key) => {
    const raw = group.dataset[key];
    if (raw === undefined || raw === "") return;
    out[key] = typeof plateDefaults[key] === "boolean" ? raw === "true"
      : typeof plateDefaults[key] === "number" ? (Number(raw) || plateDefaults[key])
      : raw;
  });
  return out;
}

function renderPlate(group) {
  const t = plateParams(group);
  const u = mmToDrawing;
  const outlinePen = paperMmToUnits(0.35);
  const holePen = paperMmToUnits(0.25);
  const centrePen = paperMmToUnits(0.18);

  group.replaceChildren();
  group.setAttribute("color", group.dataset.color || "#111111");

  const w = u(t.lengthMm);
  const h = u(t.widthMm);
  group.append(createSvgElement("rect", {
    x: -w / 2, y: -h / 2, width: w, height: h,
    fill: "none", stroke: "currentColor", "stroke-width": outlinePen,
  }));

  /* Holes on a stated grid, centred on the plate. A hole gets a centre cross
     that runs past it, the way a detail dimensions to hole centres. */
  const cols = Math.max(0, Math.round(t.cols));
  const rows = Math.max(0, Math.round(t.rows));
  const x0 = -((cols - 1) * u(t.pitchXMm)) / 2;
  const y0 = -((rows - 1) * u(t.pitchYMm)) / 2;
  const r = u(t.holeMm) / 2;
  const cross = r * 1.6;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const cx = x0 + col * u(t.pitchXMm);
      const cy = y0 + row * u(t.pitchYMm);
      if (t.slotted) {
        appendSlot(group, cx, cy, u(t.slotMm), u(t.holeMm), holePen);
      } else {
        group.append(createSvgElement("circle", {
          cx, cy, r, fill: "none", stroke: "currentColor", "stroke-width": holePen,
        }));
      }
      group.append(createSvgElement("line", {
        x1: cx - cross, y1: cy, x2: cx + cross, y2: cy,
        stroke: "currentColor", "stroke-width": centrePen,
      }));
      group.append(createSvgElement("line", {
        x1: cx, y1: cy - cross, x2: cx, y2: cy + cross,
        stroke: "currentColor", "stroke-width": centrePen,
      }));
    }
  }

  group.dataset.dimension = `Plade ${t.thicknessMm} \u00d7 ${t.widthMm} \u00d7 ${t.lengthMm}`;
  group.dataset.material = t.material;
  /* Outline, hole and centre line are three deliberate weights; a group
     lineweight must not flatten them. */
  group.querySelectorAll("*").forEach((child) => { child.dataset.pen = "own"; });
  applyStrokeWidth(group, Number(group.dataset.strokeWidth || 0.35));
  applyDrawStyle(group, elementStyle(group));
}

function makePlate(point, options = {}) {
  const group = createSvgElement("g", {
    transform: `translate(${point.x} ${point.y}) rotate(${options.rotation || 0})`,
    color: options.color || "#111111",
  });
  group.classList.add("draw-item");
  group.dataset.type = "plate";
  Object.entries({ ...plateDefaults, ...options }).forEach(([key, value]) => {
    if (key in plateDefaults) group.dataset[key] = String(value);
  });
  group.dataset.color = options.color || "#111111";
  group.dataset.strokeWidth = "0.35";
  group.dataset.lineType = "solid";
  group.dataset.opacity = "100";
  group.dataset.rotation = String(options.rotation || 0);
  renderPlate(group);
  return applyLayer(group, "steel");
}

function makeProfileSymbol(profileKey, point) {
  const profile = profileCatalog[profileKey];
  const h = mmToDrawing(profile.h);
  const b = mmToDrawing(profile.b);
  const tw = Math.max(mmToDrawing(profile.tw), 1.5);
  const tf = Math.max(mmToDrawing(profile.tf), 1.5);
  const x = -b / 2;
  const y = -h / 2;
  const group = createSvgElement("g", {
    transform: `translate(${point.x} ${point.y})`,
    color: strokeColor.value,
  });
  group.classList.add("draw-item");
  group.dataset.type = "profile";
  group.dataset.profile = profileKey;
  group.dataset.material = "S355";
  group.dataset.color = strokeColor.value;
  group.dataset.dimension = profile.name;
  group.dataset.rotation = "0";

  renderProfileSymbol(group);
  applyDrawStyle(group);
  return applyLayer(group, "steel");
}

function renderProfileSymbol(group) {
  const profile = profileCatalog[group.dataset.profile];
  if (!profile) return;
  const h = mmToDrawing(profile.h);
  const b = mmToDrawing(profile.b);
  const tw = Math.max(mmToDrawing(profile.tw), 1.5);
  const tf = Math.max(mmToDrawing(profile.tf), 1.5);
  const x = -b / 2;
  const y = -h / 2;
  group.replaceChildren();
  group.setAttribute("color", group.dataset.color || strokeColor.value);
  if (profile.shape === "rhs") {
    appendRect(group, x, y, b, h, 2, "none");
    appendRect(group, x + tw, y + tf, b - tw * 2, h - tf * 2, 1.5, "#fffefb");
  } else if (profile.shape === "upn") {
    appendRect(group, x, y, b, tf, 2, "none");
    appendRect(group, x, y + h - tf, b, tf, 2, "none");
    appendRect(group, x, y + tf, tw, h - tf * 2, 2, "none");
  } else {
    appendRect(group, x, y, b, tf, 2, "none");
    appendRect(group, -tw / 2, y + tf, tw, h - tf * 2, 2, "none");
    appendRect(group, x, y + h - tf, b, tf, 2, "none");
  }
  appendText(group, profile.name, 0, h / 2 + 18, 13);
  applyDrawStyle(group, elementStyle(group));
}

function hexPoints(radius) {
  const points = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = Math.PI / 6 + i * Math.PI / 3;
    points.push(`${Math.cos(angle) * radius},${Math.sin(angle) * radius}`);
  }
  return points.join(" ");
}

function makeBoltSymbol(boltKey, point) {
  const bolt = boltCatalog[boltKey];
  const group = createSvgElement("g", {
    transform: `translate(${point.x} ${point.y})`,
    color: strokeColor.value,
  });
  group.classList.add("draw-item");
  group.dataset.type = "bolt";
  group.dataset.bolt = boltKey;
  group.dataset.grade = boltGrade.value;
  group.dataset.material = boltGrade.value;
  group.dataset.color = strokeColor.value;
  /* The clearance hole comes from the table (EN 20273); it is d+1 up to M14 and
     d+2 above. Quoting a flat d+2 made the caption disagree with the circle the
     same function had just drawn, on every size below M16. */
  group.dataset.dimension = `${boltKey}, hul ${boltHoleMm(bolt)} mm`;
  group.dataset.rotation = "0";
  group.dataset.showHead = boltViewSelect?.value === "head" ? "true" : "false";
  group.dataset.showLabel = "false";
  writeBoltOptions(group, boltUiOptions());

  renderBoltSymbol(group);
  applyDrawStyle(group);
  return applyLayer(group, "steel");
}

/* A bolt in plan.

   Drawing convention, not a picture of a bolt: in plan a bolted connection is
   the HOLE with a centre cross, at the hole diameter -- because that is the
   thing the detail is dimensioned to. The hexagon nut outline belongs in views
   where the head is actually visible, so it is opt-in via `showHead` rather
   than drawn on every bolt in every view.

   The label is opt-in for the same reason. A six-bolt row used to carry six
   identical "M12 8.8" captions stacked on top of each other; an engineer tags
   the group once with a leader instead. */
function renderBoltSymbol(group) {
  const bolt = boltCatalog[group.dataset.bolt];
  if (!bolt) return;
  const headType = group.dataset.headType || "hex";
  const form = boltHeadForms[headType] || boltHeadForms.hex;
  /* hexPoints takes the CIRCUMRADIUS. bolt.s is the across-FLATS dimension, so
     R = s/sqrt(3). The old factor was 1.15 -- the across-corners ratio (1.155)
     used as if it were a radius, which drew every hex head at exactly twice its
     real size. A file that corrects M10 from 17 to 16 mm across flats cannot
     also draw the head 100 % oversize. */
  const headRadius = headType === "hex"
    ? Math.max(mmToDrawing(form.dia(bolt)) / Math.sqrt(3), 3)
    : Math.max(mmToDrawing(form.dia(bolt)) / 2, 3);
  /* Holes are drilled larger than the bolt -- the clearance from the table. */
  const holeRadius = Math.max(mmToDrawing(boltHoleMm(bolt) / 2), 1);
  const cross = holeRadius * 1.45;

  group.replaceChildren();
  group.setAttribute("color", group.dataset.color || strokeColor.value);

  if (group.dataset.showHead === "true" && headType !== "none") {
    /* Head-on, the way the RevitWorks sheet draws a bolt plan: a hex head is
       the hexagon WITH the across-flats circle inscribed in it (the chamfer),
       and a socket head is the barrel circle with the drive hexagon inside. */
    if (headType === "hex") {
      appendCircle(group, 0, 0, Math.max(mmToDrawing(bolt.s / 2), 2), 1, "none");
    } else if (headType === "socket" || headType === "lowSocket") {
      group.append(createSvgElement("polygon", {
        points: hexPoints(Math.max(mmToDrawing(bolt.d * 0.6) / Math.sqrt(3), 1.5)),
        fill: "none",
        stroke: "currentColor",
      }));
    }
    /* In plan a hex head is a hexagon and every other form reads as a circle,
       so the head switch follows the head form instead of assuming hex. */
    group.append(headType === "hex"
      ? createSvgElement("polygon", { points: hexPoints(headRadius), fill: "none", stroke: "currentColor" })
      : createSvgElement("circle", { cx: 0, cy: 0, r: headRadius, fill: "none", stroke: "currentColor" }));
  }

  appendCircle(group, 0, 0, holeRadius, 1, "none");
  /* Centre cross, drawn past the hole the way a centre mark is. */
  appendLine(group, -cross, 0, cross, 0, 1);
  appendLine(group, 0, -cross, 0, cross, 1);

  if (group.dataset.showLabel === "true") {
    appendText(group, `${group.dataset.bolt} ${group.dataset.grade}`, 0,
               (group.dataset.showHead === "true" ? headRadius : cross) + mmToDrawing(4), mmToDrawing(2.5));
  }
  applyDrawStyle(group, elementStyle(group));
}

function makeBoltSideSymbol(boltKey, point, options = {}) {
  const bolt = boltCatalog[boltKey] || boltCatalog.M16;
  const group = createSvgElement("g", {
    transform: `translate(${point.x} ${point.y}) rotate(${options.rotation || 0})`,
    color: options.color || "#111111",
  });
  group.classList.add("draw-item");
  group.dataset.type = "boltSide";
  group.dataset.bolt = boltKey;
  group.dataset.grade = options.grade || boltGrade.value || "8.8";
  group.dataset.material = `Grade ${group.dataset.grade}`;
  group.dataset.dimension = options.name || `${boltKey} side-view bolt assembly`;
  group.dataset.color = options.color || "#111111";
  group.dataset.rotation = String(options.rotation || 0);
  group.dataset.strokeWidth = String(options.strokeWidth || 0.25);
  group.dataset.lineType = "solid";
  group.dataset.opacity = "100";
  /* Options come from the caller, not from the panel: a template has to draw
     the same bolt whatever the Bolte panel happens to be set to. The placement
     paths pass boltUiOptions() themselves. */
  writeBoltOptions(group, options);
  renderBoltSideSymbol(group);
  return applyLayer(group, "steel");
}

/* --- Fastener elevation ---------------------------------------------------
   Built from the ISO tables in real millimetres, with the parameter set a
   professional fixings library exposes: length, thread length, extension past
   the nut, and independent switches for the nut, its washer, a spring washer
   and a washer under the head.

   The geometry it replaces was proportional guesswork -- a washer was always
   5 drawing units, the head depth 1.15x the shank, the shank a fixed 52 units
   regardless of plot scale. None of it was a bolt, which is why it looked like
   a cartoon at every size.

   Returns primitives in millimetres so the shape can be reasoned about and
   tested without a canvas; the renderer converts once. */
function boltElevationMm(bolt, o = {}) {
  const form = boltHeadForms[o.headType] || boltHeadForms.hex;
  const headDia = form.dia(bolt);
  const headH = form.h(bolt);
  const d = bolt.d;
  const length = Number(o.length) || d * 5;
  const thread = Math.min(Number(o.threadLength) || length * 0.6, length);
  const nutH = o.thinNut ? bolt.mt : bolt.m;
  /* ISO 6410: the major diameter is a continuous line, the thread ROOT is a
     second continuous line just inside it, and the thread limit is a line
     across the shank. Root sits at about 0.85 d for an ISO coarse thread. */
  const root = d * 0.85;
  const chamfer = Math.min(d * 0.1, 1.5);
  /* Across CORNERS. The tables carry s, the across-flats size, but a head or a
     nut in elevation is drawn on its widest face -- e = 1.155 s -- showing three
     facets. Drawing it s wide is the same head seen from the wrong angle. */
  const across = (s) => s * 1.1547;
  const parts = [];
  const rect = (x, y, w, h, pen) => parts.push({ type: "rect", x, y, w, h, pen });
  const line = (x1, y1, x2, y2, pen) => parts.push({ type: "line", x1, y1, x2, y2, pen });
  const poly = (pts, pen) => parts.push({ type: "poly", pts, pen });

  /* A hex head or nut: the outline with its corners chamfered, plus the two
     lines where the facets meet. Same shape at both ends of the bolt, so it is
     written once. x0..x1 is along the bolt, the outer face is the free one. */
  const hexBlock = (x0, x1, sizeAcrossFlats, outer) => {
    const e = across(sizeAcrossFlats);
    const r = e / 2;
    const c = Math.min((x1 - x0) * 0.22, e * 0.07);
    const near = outer === "left" ? x0 : x1;
    const far = outer === "left" ? x1 : x0;
    poly([
      [far, -r], [near + (outer === "left" ? c : -c), -r], [near, -r + c],
      [near, r - c], [near + (outer === "left" ? c : -c), r], [far, r],
    ], "light");
    line(x0, -r / 2, x1, -r / 2, "light");
    line(x0, r / 2, x1, r / 2, "light");
  };

  /* x = 0 is the bearing face under the head; the bolt runs to the right. */

  /* --- head end ---------------------------------------------------------
     A washer under the head goes UNDER it -- between the bearing face and the
     material -- so it pushes the head back, it does not stack on top of it. */
  let headFace = 0;
  if (o.headWasher && !form.flush && headH > 0 && o.headType !== "none") {
    rect(-bolt.tw, -bolt.dw / 2, bolt.tw, bolt.dw, "light");
    headFace = -bolt.tw;
  }
  if (headH > 0 && o.headType !== "none") {
    const R = headDia / 2;
    const style = form.style || "facets";
    if (style === "taper") {
      /* Countersunk: a taper sunk into the material, not a block on top of it. */
      poly([[headFace, -R], [headFace + headH, -d / 2], [headFace + headH, d / 2], [headFace, R]], "light");
      rect(headFace + headH * 0.2, -R * 0.35, headH * 0.45, R * 0.7, "light");
    } else if (style === "facets") {
      hexBlock(headFace - headH, headFace, headDia, "left");
    } else if (style === "socket") {
      /* Cap screw: a plain barrel with the hex socket open at the top. */
      rect(headFace - headH, -R, headH, headDia, "light");
      const depth = headH * 0.6;
      const w = R * 0.55;
      line(headFace - headH, -w, headFace - headH + depth, -w, "light");
      line(headFace - headH + depth, -w, headFace - headH + depth, w, "light");
      line(headFace - headH + depth, w, headFace - headH, w, "light");
    } else {
      /* Dome, for a button or a coach head. The chord closing the polygon is
         the bearing face, so the shape is one closed outline. */
      const neckH = style === "domeNeck" ? d * 0.35 : 0;
      const domeBase = headFace - neckH;
      const pts = [];
      for (let i = 0; i <= 14; i += 1) {
        const t = Math.PI * (i / 14);
        pts.push([domeBase - (headH - neckH) * Math.sin(t), R * Math.cos(t)]);
      }
      poly(pts, "light");
      if (style === "domeNeck") {
        /* The square neck that stops a coach bolt turning. */
        hexBlock(domeBase, headFace, d * 1.4, "left");
      } else {
        rect(domeBase - (headH - neckH) * 0.55, -R * 0.3, (headH - neckH) * 0.4, R * 0.6, "light");
      }
    }
  }

  /* --- nut end ----------------------------------------------------------
     The nut is threaded ON to the shank, near its end -- it is not a block
     glued to the end face. It used to be stacked past x = length together with
     its washers, so an M12 x 120 drew 141 mm long, the shank stopped dead at
     the washer, and `extension` added yet more length instead of being the bit
     of bolt that sticks out past the nut. Here the nut sits INSIDE the stated
     length, its outer face `extension` back from the end, and the shank runs
     behind it. */
  const extension = Math.max(0, Number(o.extension) || 0);
  const showNut = o.showNut !== false;
  let coverStart = length;              // where the nut assembly starts hiding the shank
  let nutEnd = length;
  if (showNut) {
    nutEnd = Math.min(length, Math.max(nutH, length - extension));
    const nutStart = nutEnd - nutH;
    hexBlock(nutStart, nutEnd, bolt.s, "right");
    coverStart = nutStart;
    if (o.springWasher) {
      coverStart -= bolt.tw * 0.8;
      rect(coverStart, -bolt.dw / 2, bolt.tw * 0.8, bolt.dw, "light");
    }
    if (o.nutWasher) {
      coverStart -= bolt.tw;
      rect(coverStart, -bolt.dw / 2, bolt.tw, bolt.dw, "light");
    }
    coverStart = Math.max(coverStart, 0);
  }

  /* --- shank ------------------------------------------------------------
     Drawn as the spans that are actually VISIBLE: from the head to the washer,
     and whatever sticks out past the nut. Nothing is drawn through the nut,
     because you cannot see through a nut. */
  if (o.showShank !== false) {
    const tipVisible = nutEnd < length - 1e-6 || !showNut;
    const tipStart = tipVisible ? length - chamfer : length;
    const spans = [];
    if (coverStart > 0) spans.push([0, Math.min(coverStart, length)]);
    if (showNut && nutEnd < length) spans.push([nutEnd, length]);

    spans.forEach(([a, b]) => {
      const b1 = Math.min(b, tipStart);
      if (b1 > a) {
        line(a, -d / 2, b1, -d / 2, "light");
        line(a, d / 2, b1, d / 2, "light");
      }
      /* Thread root lines, over the threaded part of this span only. */
      const t0 = Math.max(a, length - thread);
      const t1 = Math.min(b1, length);
      if (t1 - t0 > 0.5) {
        line(t0, -root / 2, t1, -root / 2, "hidden");
        line(t0, root / 2, t1, root / 2, "hidden");
      }
    });

    /* Thread limit line, only if the run-out is somewhere you can see it. */
    const limit = length - thread;
    if (limit > 0.5 && limit < coverStart) line(limit, -d / 2, limit, d / 2, "light");

    /* Chamfered end face, the detail that reads as "this end is the free one". */
    if (tipVisible) {
      line(tipStart, -d / 2, length, -d / 2 + chamfer, "light");
      line(tipStart, d / 2, length, d / 2 - chamfer, "light");
      line(length, -d / 2 + chamfer, length, d / 2 - chamfer, "light");
    }
    /* Threaded rod: no head to close the near end, so close it here. */
    if (headH <= 0 || o.headType === "none") line(0, -d / 2, 0, d / 2, "light");
  }
  return parts;
}

/* The Bolte panel IS the parameter set.

   boltElevationMm has taken these ten arguments all along and boltOptionsFrom
   has read them off the dataset all along -- but nothing ever wrote them. Every
   bolt in every drawing therefore came out identical: hex head, 5d long, 0.6L
   of thread, nut and plain washer, no extension. Parametric in the generator,
   a sticker in practice. These three functions are the missing wire: panel ->
   dataset -> geometry. */
function boltUiOptions() {
  /* An empty length or thread field means AUTO, not zero -- and it has to stay
     empty on the element too, so that changing M12 to M20 rescales instead of
     freezing yesterday's derived millimetres. */
  const num = (input) => {
    const value = Number(input?.value);
    return input && input.value !== "" && Number.isFinite(value) ? value : undefined;
  };
  const flag = (input, fallback) => (input ? input.checked : fallback);
  return {
    headType: boltHeadForm?.value || "hex",
    symbolic: Boolean(boltSymbolic?.checked),
    length: num(boltLengthInput),
    threadLength: num(boltThreadInput),
    extension: num(boltExtensionInput) || 0,
    showShank: flag(boltShowShank, true),
    showNut: flag(boltShowNut, true),
    thinNut: flag(boltThinNut, false),
    nutWasher: flag(boltNutWasher, true),
    headWasher: flag(boltHeadWasher, false),
    springWasher: flag(boltSpringWasher, false),
  };
}

function writeBoltOptions(group, o = {}) {
  const setNum = (key, value) => {
    if (Number.isFinite(value)) group.dataset[key] = String(value);
    else delete group.dataset[key];
  };
  const setFlag = (key, value, fallback) => {
    group.dataset[key] = (value === undefined ? fallback : Boolean(value)) ? "true" : "false";
  };
  group.dataset.headType = o.headType || "hex";
  setFlag("symbolic", o.symbolic, false);
  setNum("lengthMm", Number(o.length));
  setNum("threadLengthMm", Number(o.threadLength));
  setNum("extensionMm", Number(o.extension) || 0);
  setFlag("showShank", o.showShank, true);
  setFlag("showNut", o.showNut, true);
  setFlag("thinNut", o.thinNut, false);
  setFlag("nutWasher", o.nutWasher, true);
  setFlag("headWasher", o.headWasher, false);
  setFlag("springWasher", o.springWasher, false);
  return group;
}

/* Drawn length in mm, auto included -- the grip needs the same number the
   generator uses, or the handle sits somewhere other than the bolt end. */
function boltLengthMmOf(group) {
  const bolt = boltCatalog[group.dataset.bolt] || boltCatalog.M16;
  const stated = Number(group.dataset.lengthMm);
  return Number.isFinite(stated) && group.dataset.lengthMm !== "" && stated > 0 ? stated : bolt.d * 5;
}

/* The symbolic fixing.

   RevitWorks' own sheet lists two line styles: light for the drawn fixing, and
   MEDIUM "for symbolic fixings representation" -- a heavy line along the axis
   with a dot at each end. That is the answer to a problem the true geometry
   cannot solve: on the default A3 at 1:10 an M12 shank is 1.2 mm wide on paper
   and a 0.25 mm pen covers a fifth of it, so the honest elevation reads as a
   black smear. Below about 1:5 you draw the symbol, not the bolt. */
function boltSymbolicMm(bolt, o = {}) {
  const form = boltHeadForms[o.headType] || boltHeadForms.hex;
  const headH = o.headType === "none" ? 0 : form.h(bolt);
  const washer = o.headWasher && !form.flush ? bolt.tw : 0;
  const x0 = -(headH + washer);
  const x1 = Number(o.length) || bolt.d * 5;
  return [
    { type: "line", x1: x0, y1: 0, x2: x1, y2: 0, pen: "medium" },
    { type: "dot", x: x0, y: 0, r: bolt.d * 0.16, pen: "medium" },
    { type: "dot", x: x1, y: 0, r: bolt.d * 0.16, pen: "medium" },
  ];
}

function boltOptionsFrom(group) {
  const num = (key, fallback) => {
    const v = Number(group.dataset[key]);
    return Number.isFinite(v) && group.dataset[key] !== "" ? v : fallback;
  };
  const flag = (key, fallback) => (group.dataset[key] === undefined ? fallback : group.dataset[key] === "true");
  return {
    headType: group.dataset.headType || "hex",
    symbolic: group.dataset.symbolic === "true",
    length: num("lengthMm", undefined),
    threadLength: num("threadLengthMm", undefined),
    extension: num("extensionMm", 0),
    showShank: flag("showShank", true),
    showNut: flag("showNut", true),
    thinNut: flag("thinNut", false),
    nutWasher: flag("nutWasher", true),
    headWasher: flag("headWasher", false),
    springWasher: flag("springWasher", false),
  };
}

/* Fastener parts -> SVG.

   Bolts and screws are both generated as a list of primitives in millimetres,
   so they share one emitter. Keeping it in one place is what stops the two
   drifting apart again -- the pen table, the mm conversion and the "this node
   owns its weight" marking are the same rules for every fixing. */
function appendFastenerParts(group, parts) {
  const u = (mm) => mmToDrawing(mm);
  /* Two pens, the way a fixings library does it: real geometry light, thread
     crests finer still. Medium is the symbolic representation. */
  const pen = { light: paperMmToUnits(0.25), hidden: paperMmToUnits(0.18), medium: paperMmToUnits(0.5) };
  /* The generator assigns its own weights. Marking them as owning their pen
     keeps a group-level lineweight from flattening the hierarchy back to one
     weight, which is what made the old symbols read as a single fat outline. */
  const own = (node) => { node.dataset.pen = "own"; return node; };
  parts.forEach((part) => {
    const w = pen[part.pen] || pen.light;
    if (part.type === "rect") {
      group.append(own(createSvgElement("rect", {
        x: u(part.x), y: u(part.y), width: u(part.w), height: u(part.h),
        fill: "none", stroke: "currentColor", "stroke-width": w,
      })));
    } else if (part.type === "line") {
      group.append(own(createSvgElement("line", {
        x1: u(part.x1), y1: u(part.y1), x2: u(part.x2), y2: u(part.y2),
        stroke: "currentColor", "stroke-width": w,
      })));
    } else if (part.type === "dot") {
      /* Filled, because the symbol's end marks are dots, not little circles. */
      group.append(own(createSvgElement("circle", {
        cx: u(part.x), cy: u(part.y), r: u(part.r),
        fill: "currentColor", stroke: "none",
      })));
    } else if (part.type === "poly" || part.type === "polyline") {
      group.append(own(createSvgElement(part.type === "poly" ? "polygon" : "polyline", {
        points: part.pts.map(([px, py]) => `${u(px)},${u(py)}`).join(" "),
        fill: "none", stroke: "currentColor", "stroke-width": w,
      })));
    }
  });
}

function renderBoltSideSymbol(group) {
  const bolt = boltCatalog[group.dataset.bolt] || boltCatalog.M16;
  const options = boltOptionsFrom(group);
  const parts = options.symbolic ? boltSymbolicMm(bolt, options) : boltElevationMm(bolt, options);

  group.replaceChildren();
  group.setAttribute("color", group.dataset.color || "#111111");
  appendFastenerParts(group, parts);
  applyStrokeWidth(group, Number(group.dataset.strokeWidth || 0.25));
  applyDrawStyle(group, elementStyle(group));
}

function selectedScrewFamily() {
  return screwCatalog[screwFamilySelect?.value] || screwCatalog.connector;
}

function selectedScrewKey() {
  return screwSelect?.value || Object.keys(selectedScrewFamily().items)[0];
}

function canonicalScrewSku(key = "") {
  return String(key).replace(/x/g, "X");
}

function screwByKey(key) {
  const canonicalKey = canonicalScrewSku(key);
  for (const familyKey of Object.keys(screwCatalog)) {
    const items = screwCatalog[familyKey].items;
    const itemKey = items[canonicalKey] ? canonicalKey : Object.keys(items).find((candidate) => candidate.toLowerCase() === String(key).toLowerCase());
    if (itemKey) return { key: itemKey, familyKey, family: screwCatalog[familyKey], screw: items[itemKey] };
  }
  const fallbackFamilyKey = Object.keys(screwCatalog)[0];
  const fallbackKey = Object.keys(screwCatalog[fallbackFamilyKey].items)[0];
  return { key: fallbackKey, familyKey: fallbackFamilyKey, family: screwCatalog[fallbackFamilyKey], screw: screwCatalog[fallbackFamilyKey].items[fallbackKey] };
}

function verifiedScrewGeometry(screwKey, view = "side") {
  const sku = canonicalScrewSku(screwKey);
  const geometry = window.omkredsVerifiedManufacturerGeometry?.["simpson-strong-tie"]?.[sku];
  if (!geometry?.views) return null;
  const aliases = {
    side: ["elevation", "symbol", "top"],
    elevation: ["elevation", "symbol", "top"],
    symbol: ["symbol", "elevation", "top"],
    top: ["top", "symbol", "elevation"],
  }[view] || [view, "elevation", "symbol", "top"];
  for (const key of aliases) {
    const viewGeometry = geometry.views[key];
    if (viewGeometry?.elements?.length) return { key, bbox: viewGeometry.bbox || geometry.bbox, elements: viewGeometry.elements };
  }
  return geometry.elements?.length ? { key: "default", bbox: geometry.bbox, elements: geometry.elements } : null;
}

function inferScrewKeyFromName(name = "") {
  const lower = name.toLowerCase();
  if (lower.includes("concrete") || lower.includes("anchor")) return "CS10x100";
  if (lower.includes("tek") || lower.includes("self-drilling") || lower.includes("sheet") || lower.includes("metal") || lower.includes("roofing")) return "TEK5.5x38";
  if (lower.includes("5.0 x 25") || lower.includes("5.0x25")) return "CSA5.0X25";
  if (lower.includes("5.0 x 35") || lower.includes("5.0x35")) return "CSA5.0X35";
  if (lower.includes("5.0 x 50") || lower.includes("5.0x50")) return "CSA5.0X50";
  if (lower.includes("5.0 x 80") || lower.includes("5.0x80")) return "CSA5.0X80";
  if (lower.includes("4.0 x 30") || lower.includes("4.0x30")) return "CSA4.0X30";
  if (lower.includes("connector") || lower.includes("beslag") || lower.includes("pan") || lower.includes("csa")) return "CSA5.0X40";
  if (lower.includes("fully") || lower.includes("structural") || lower.includes("timber") || lower.includes("wood") || lower.includes("coach") || lower.includes("lag")) return "WT8x160";
  if (lower.includes("countersunk")) return "WT6x120";
  return selectedScrewKey();
}

function makeScrewSymbol(screwKey, point, options = {}) {
  const found = screwByKey(screwKey);
  const group = createSvgElement("g", {
    transform: `translate(${point.x} ${point.y}) rotate(${options.rotation || 0})`,
    color: options.color || strokeColor.value,
  });
  group.classList.add("draw-item");
  group.dataset.type = "screw";
  group.dataset.screw = found.key;
  group.dataset.screwFamily = found.familyKey;
  group.dataset.screwView = options.view || screwViewSelect?.value || "side";
  group.dataset.material = options.material || found.family.material;
  group.dataset.manufacturer = found.screw.verified ? "Simpson Strong-Tie" : "";
  group.dataset.sourceUrl = found.screw.verified ? found.family.sourceUrl || "" : "";
  group.dataset.color = options.color || strokeColor.value;
  group.dataset.dimension = options.name || found.screw.name;
  group.dataset.rotation = String(options.rotation || 0);
  group.dataset.strokeWidth = String(options.strokeWidth || (found.screw.verified ? 0.35 : 1.1));
  group.dataset.lineType = lineTypeSelect.value || "solid";
  group.dataset.opacity = strokeOpacity.value || "100";
  renderScrewSymbol(group);
  return applyLayer(group, "steel");
}

/* --- Screw elevation ------------------------------------------------------
   Drawn the way the RevitWorks sheet draws a screw: a real head with its drive
   recess, an optional washer under it, a plain shank, the thread shown as two
   groups of crest lines rather than hatching all the way down, and a sharp
   point.

   What this replaces was one rectangle for every head type, a barber-pole of
   diagonal ticks over the whole shank, a blunt end, and a dashed centreline
   that ran out past the head -- which is what made a screw read as a spike with
   a box on it at any size.

   Millimetres, origin at the bearing face under the head, screw running +x. */
function screwElevationMm(screw, o = {}) {
  const d = Number(screw.d) || 5;
  const length = Number(o.length) || Number(screw.length) || d * 10;
  const headDia = Number(screw.head) || d * 1.9;
  const headType = screw.headType || "pan";
  const thread = Math.min(Number(o.threadLength) || Number(screw.thread) || length * 0.65, length);
  const R = headDia / 2;
  const parts = [];
  const rect = (x, y, w, h, pen) => parts.push({ type: "rect", x, y, w, h, pen });
  const line = (x1, y1, x2, y2, pen) => parts.push({ type: "line", x1, y1, x2, y2, pen });
  const poly = (pts, pen) => parts.push({ type: "poly", pts, pen });

  const hasWasher = headType === "washer" || headType === "hexWasher";
  const isHex = headType === "hex" || headType === "hexWasher";
  const headH = headType === "countersunk" ? R : (isHex ? d * 0.7 : R * 0.85);

  /* Washer first: it sits UNDER the head, against the timber. */
  let face = 0;
  if (hasWasher) {
    const wt = Math.max(d * 0.18, 0.6);
    rect(-wt, -R * 1.3, wt, R * 2.6, "light");
    face = -wt;
  }

  let shankStart = 0;
  if (headType === "countersunk") {
    /* Sunk INTO the timber, so it eats the first headH of the shank. */
    poly([[face, -R], [face + headH, -d / 2], [face + headH, d / 2], [face, R]], "light");
    shankStart = face + headH;
    rect(face + headH * 0.15, -R * 0.3, headH * 0.4, R * 0.6, "light");
  } else if (isHex) {
    /* Same hex block as a bolt head: across corners, chamfered, three facets. */
    const e = headDia * 1.1547;
    const c = Math.min(headH * 0.22, e * 0.07);
    poly([
      [face, -e / 2], [face - headH + c, -e / 2], [face - headH, -e / 2 + c],
      [face - headH, e / 2 - c], [face - headH + c, e / 2], [face, e / 2],
    ], "light");
    line(face - headH, -e / 4, face, -e / 4, "light");
    line(face - headH, e / 4, face, e / 4, "light");
  } else {
    /* Pan or washer head: a dome, closed by the bearing face. */
    const pts = [];
    for (let i = 0; i <= 12; i += 1) {
      const t = Math.PI * (i / 12);
      pts.push([face - headH * Math.sin(t), R * Math.cos(t)]);
    }
    poly(pts, "light");
    rect(face - headH * 0.85, -R * 0.32, headH * 0.45, R * 0.64, "light");
  }

  /* Point. A screw ends in a cone, not a flat face. */
  const tip = screw.drillTip ? d * 1.7 : d * 1.5;
  const tipStart = Math.max(shankStart + d * 0.5, length - tip);
  line(tipStart, -d / 2, length, 0, "light");
  line(tipStart, d / 2, length, 0, "light");
  if (screw.drillTip) {
    /* Self-drilling point: the flute that makes it its own pilot bit. */
    line(tipStart, -d / 2, tipStart + tip * 0.55, d * 0.18, "hidden");
    line(tipStart + tip * 0.2, d / 2, tipStart + tip * 0.6, -d * 0.1, "hidden");
  }

  /* Shank. */
  line(shankStart, -d / 2, tipStart, -d / 2, "light");
  line(shankStart, d / 2, tipStart, d / 2, "light");

  /* Thread: crest lines in a group where the thread starts and a group running
     into the point, with plain shank between them. Hatching the whole length is
     what a thread is NOT -- the convention shows enough crests to read the
     pitch and leaves the rest open. */
  const threadStart = Math.max(shankStart, length - thread);
  /* Spacing along the axis, and how far each crest leans. The crests are closer
     together than they are long, so they overlap in projection -- which is what
     makes a run of them read as a thread rather than as tally marks. */
  const pitch = Math.max(d * 0.45, 0.7);
  const lean = Math.max(d * 1.1, 1.6);
  const crest = (x) => {
    const x1 = Math.min(x + lean, tipStart);
    if (x1 - x > pitch * 0.3) line(x, d / 2, x1, -d / 2, "hidden");
  };
  const run = tipStart - threadStart;
  const per = 4;
  if (run > 0) {
    if (run < pitch * per + lean * 2) {
      /* Too short for two groups -- fill it, or the thread disappears. */
      for (let x = threadStart; x <= tipStart - lean; x += pitch) crest(x);
    } else {
      /* The lower group is measured back from the point so its last crest ENDS
         at the cone, rather than being clipped into a stub against it. */
      for (let i = 0; i < per; i += 1) {
        crest(threadStart + i * pitch);
        crest(tipStart - lean - (per - 1 - i) * pitch);
      }
    }
  }
  return parts;
}

function renderScrewTopView(group, screw) {
  const headR = Math.max(mmToDrawing(screw.head / 2), 5);
  const shankR = Math.max(mmToDrawing(screw.d / 2), 2);
  const driveR = Math.max(headR * 0.42, 2.5);
  if (screw.headType === "hex" || screw.headType === "hexWasher") {
    if (screw.headType === "hexWasher") appendCircle(group, 0, 0, headR * 1.18, 0.8);
    /* head is the across-FLATS size, and hexPoints wants the circumradius --
       s/sqrt(3), not s/2, which drew every hex screw head 14 % undersize. */
    group.append(createSvgElement("polygon", {
      points: hexPoints(Math.max(mmToDrawing(screw.head) / Math.sqrt(3), 5)),
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 1,
    }));
  } else {
    appendCircle(group, 0, 0, headR, 1);
  }
  appendCircle(group, 0, 0, shankR, 0.8, "none");
  if (screw.drive === "torx") {
    for (let i = 0; i < 6; i += 1) {
      const a = i * Math.PI / 3;
      appendLine(group, 0, 0, Math.cos(a) * driveR, Math.sin(a) * driveR, 0.65);
    }
    appendCircle(group, 0, 0, driveR * 0.36, 0.55);
  } else if (screw.drive === "slot") {
    appendLine(group, -driveR, 0, driveR, 0, 0.8);
  } else {
    appendCircle(group, 0, 0, driveR * 0.56, 0.65);
  }
}

function renderScrewSideView(group, screw) {
  /* The generator puts x = 0 at the bearing face, like the bolt. Screws have
     always been anchored on their mid-length, so shift rather than move every
     screw already sitting in a drawing. */
  const parts = screwElevationMm(screw, {}).map((part) => {
    const dx = -Number(screw.length || 0) / 2;
    if (part.type === "rect") return { ...part, x: part.x + dx };
    if (part.type === "line") return { ...part, x1: part.x1 + dx, x2: part.x2 + dx };
    if (part.type === "dot") return { ...part, x: part.x + dx };
    return { ...part, pts: part.pts.map(([px, py]) => [px + dx, py]) };
  });
  appendFastenerParts(group, parts);
}

function renderScrewSymbol(group) {
  const found = screwByKey(group.dataset.screw);
  const { screw, family } = found;
  const view = group.dataset.screwView || "side";
  group.replaceChildren();
  group.setAttribute("color", group.dataset.color || strokeColor.value);
  group.dataset.dimension = group.dataset.dimension || screw.name;
  group.dataset.material = group.dataset.material || family.material;
  const verifiedGeometry = verifiedScrewGeometry(found.key, view);
  if (verifiedGeometry?.elements?.length) {
    verifiedGeometry.elements.forEach((element) => appendNativeGeometryElement(group, element));
    applyStrokeWidth(group, Number(group.dataset.strokeWidth || 0.35));
    applyOpacity(group, group.dataset.opacity || 100);
    return;
  }
  if (view === "top") {
    renderScrewTopView(group, screw);
  } else {
    renderScrewSideView(group, screw);
  }
  /* Opt-in, for the same reason the bolt's is: a row of eight screws carried
     eight identical "CSA 5.0 x 40" captions, one under each, at a fixed text
     size that ignored the drawing scale. A fastener group is tagged once with
     a leader. */
  if (group.dataset.showLabel === "true") {
    appendText(group, screw.name, 0, Math.max(mmToDrawing(screw.head), 12) + 14, mmToDrawing(2.5));
  }
  applyDrawStyle(group, elementStyle(group));
}

/* --- Object registry -------------------------------------------------------
   Every object type used to be re-rendered from four separate hand-maintained
   lists -- updateCatalogElements, updateSelectedFromProperties, polishSelection
   and applyCurrentStyleToSelection -- and they had drifted apart. The catalogue
   pass rebuilt nine types and forgot measure, connection, detailTitle, arrow and
   leader; the property pass rebuilt twelve and forgot profile, bolt and
   boltSide. That drift is why a plot-scale change left some objects at the old
   lineweights and editing a bolt's properties did not redraw it.

   One table, one dispatch. Adding a new structural object means registering it
   here instead of remembering four call sites. The render functions themselves
   are untouched -- this only replaces the dispatch. */
const objectTypes = {};

function defineObject(type, def) {
  objectTypes[type] = { type, ...def };
}

function defOf(element) {
  return objectTypes[element?.dataset?.type] || null;
}

/* Rebuild one object from its dataset. Returns false for plain geometry
   (line, rect, circle, text...) which has no parametric render step. */
function renderObject(element) {
  const def = defOf(element);
  if (!def?.render) return false;
  def.render(element);
  return true;
}

function renderAllObjects() {
  drawingLayer.querySelectorAll("[data-type]").forEach((element) => {
    defOf(element)?.render?.(element);
  });
}

defineObject("profile",              { label: "Profil",        render: renderProfileSymbol });
defineObject("bolt",                 { label: "Bolt",          render: renderBoltSymbol });
defineObject("boltSide", {
  label: "Bolt (side)",
  render: renderBoltSideSymbol,
  /* One grip, on the end of the shank. x = 0 is the bearing face under the
     head and the bolt runs to +x, so the grip is the drawn length -- dragging
     it sets lengthMm in millimetres and the nut follows the end. */
  grips: (element) => {
    const end = pointInCanvasFromElement(element, mmToDrawing(boltLengthMmOf(element)), 0);
    return [{ role: "bolt-length", x: end.x, y: end.y }];
  },
});
defineObject("screw",                { label: "Skrue",         render: renderScrewSymbol });
defineObject("connection",           { label: "Samling",       render: renderConnection });
defineObject("plate", {
  label: "Plade",
  render: renderPlate,
  /* Corner grips that resize the PLATE, not the drawing of it: the hole grid
     stays on its stated pitch and the thickness is untouched. */
  grips: (element) => {
    const t = plateParams(element);
    const w = mmToDrawing(t.lengthMm) / 2;
    const h = mmToDrawing(t.widthMm) / 2;
    const corner = (x, y, role) => {
      const q = pointInCanvasFromElement(element, x, y);
      return { role, x: q.x, y: q.y };
    };
    return [
      corner(-w, -h, "plate-nw"), corner(w, -h, "plate-ne"),
      corner(-w, h, "plate-sw"), corner(w, h, "plate-se"),
    ];
  },
});
defineObject("profileMember",        { label: "Profilstang",   render: renderTemplateProfileMember });

function updateCatalogElements() {
  renderAllObjects();
  updatePropertyPanel();
}

/* A, B, C ... skipping whatever is already on the sheet. Past Z it falls back
   to AA, AB, which is rare enough not to be worth more than this. */
function nextSectionMark() {
  const used = new Set();
  drawingLayer.querySelectorAll('[data-symbol="sectionCut"]').forEach((node) => {
    if (node.dataset.sectionMark) used.add(node.dataset.sectionMark);
  });
  for (let i = 0; i < 26; i += 1) {
    const letter = String.fromCharCode(65 + i);
    if (!used.has(letter)) return letter;
  }
  for (let i = 0; i < 26; i += 1) {
    const letter = `A${String.fromCharCode(65 + i)}`;
    if (!used.has(letter)) return letter;
  }
  return "A";
}

function setSectionMark(group, value) {
  const mark = (value || "A").trim().slice(0, 2).toUpperCase() || "A";
  group.dataset.sectionMark = mark;
  group.querySelectorAll("text").forEach((node) => { node.textContent = mark; });
  group.dataset.dimension = `Snit ${mark}-${mark}`;
}

/* Symbol names, shared: makeSymbol stamps them onto the object and the
   placement prompt needs the same name before the object exists. */
const detailSymbolLabels = {
  weld: "Svejsesymbol",
  bracket: "Beslag",
  plate: "Plade med huller",
  sectionCut: "Snitmarkering",
  breakLine: "Brudlinje",
  centerMark: "Centermarkering",
  detailCallout: "Detaljehenvisning",
  revisionCloud: "Revisionssky",
  levelMarker: "Kotemarkering",
  fallArrow: "Faldpil",
};

function detailSymbolLabel(type) {
  return detailSymbolLabels[type] || type;
}

function makeSymbol(type, point) {
  if (type === "screw") return makeScrewSymbol(selectedScrewKey(), point, { view: screwViewSelect?.value || "side" });

  const selfStyledSymbols = new Set(["sectionCut", "breakLine", "centerMark", "detailCallout", "revisionCloud", "levelMarker", "fallArrow", "weld"]);
  const group = createSvgElement("g", {
    transform: `translate(${point.x} ${point.y})`,
    color: selfStyledSymbols.has(type) ? "#111111" : strokeColor.value,
  });
  group.classList.add("draw-item");
  group.dataset.type = "symbol";
  group.dataset.symbol = type;
  group.dataset.dimension = detailSymbolLabels[type] || type;
  group.dataset.color = selfStyledSymbols.has(type) ? "#111111" : strokeColor.value;
  group.dataset.strokeWidth = selfStyledSymbols.has(type) ? "1" : String(strokeWidth.value || 1);
  group.dataset.lineType = "solid";
  group.dataset.opacity = "100";
  if (selfStyledSymbols.has(type)) group.dataset.preserveStyle = "true";

  if (type === "bolt") {
    appendCircle(group, 0, 0, 17, 3);
    appendCircle(group, 0, 0, 5, 2, "currentColor");
    appendLine(group, -11, 0, 11, 0, 2);
    appendLine(group, 0, -11, 0, 11, 2);
  }

  if (type === "screw") {
    appendLine(group, -24, 0, 18, 0, 4);
    appendLine(group, 18, 0, 28, -7, 4);
    appendLine(group, 18, 0, 28, 7, 4);
    appendLine(group, -17, -8, -9, 8, 2);
    appendLine(group, -6, -8, 2, 8, 2);
    appendLine(group, 5, -8, 13, 8, 2);
  }

  if (type === "weld") {
    appendLine(group, -34, 0, 34, 0, 0.9);
    for (let x = -24; x <= 18; x += 14) {
      group.append(createSvgElement("path", {
        d: `M ${x} 0 L ${x + 7} 10 L ${x + 14} 0`,
        fill: "none",
        stroke: "currentColor",
        "stroke-width": 0.9,
        "stroke-linejoin": "round",
      }));
    }
  }

  if (type === "iprofile") {
    appendRect(group, -24, -26, 48, 10, 3);
    appendRect(group, -24, 16, 48, 10, 3);
    appendRect(group, -6, -16, 12, 32, 3);
  }

  if (type === "bracket") {
    group.append(createSvgElement("path", {
      d: "M -24 -24 L -24 24 L 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 6,
      "stroke-linecap": "square",
      "stroke-linejoin": "round",
    }));
    appendLine(group, -16, 16, 16, -16, 3);
    appendCircle(group, -12, 12, 4, 2, "currentColor");
    appendCircle(group, 12, 20, 4, 2, "currentColor");
  }

  if (type === "plate") {
    appendRect(group, -30, -20, 60, 40, 3);
    appendCircle(group, -17, -8, 4, 2);
    appendCircle(group, 17, -8, 4, 2);
    appendCircle(group, -17, 8, 4, 2);
    appendCircle(group, 17, 8, 4, 2);
  }

  if (type === "sectionCut") {
    /* The letter was hardcoded, so every section on a sheet was A-A and there
       was no way to change it. It now takes the next free letter on insert and
       can be edited afterwards like any other text. */
    group.dataset.sectionMark = nextSectionMark();
    appendLine(group, -52, 0, 52, 0, 0.9);
    group.append(createSvgElement("polygon", { points: "-52,0 -39,-8 -39,8", fill: "currentColor", stroke: "none" }));
    group.append(createSvgElement("polygon", { points: "52,0 39,-8 39,8", fill: "currentColor", stroke: "none" }));
    appendText(group, group.dataset.sectionMark, -66, 4, 10);
    appendText(group, group.dataset.sectionMark, 66, 4, 10);
    group.dataset.dimension = `Snit ${group.dataset.sectionMark}-${group.dataset.sectionMark}`;
  }

  if (type === "breakLine") {
    group.append(createSvgElement("path", {
      d: "M -58 0 L -25 0 L -15 -15 L -4 15 L 7 0 L 58 0",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 1,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }));
  }

  if (type === "centerMark") {
    appendCircle(group, 0, 0, 22, 0.75);
    group.append(createSvgElement("line", { x1: -36, y1: 0, x2: -8, y2: 0, stroke: "currentColor", "stroke-width": 0.65, "stroke-dasharray": "10 4 2 4" }));
    group.append(createSvgElement("line", { x1: 8, y1: 0, x2: 36, y2: 0, stroke: "currentColor", "stroke-width": 0.65, "stroke-dasharray": "10 4 2 4" }));
    group.append(createSvgElement("line", { x1: 0, y1: -36, x2: 0, y2: -8, stroke: "currentColor", "stroke-width": 0.65, "stroke-dasharray": "10 4 2 4" }));
    group.append(createSvgElement("line", { x1: 0, y1: 8, x2: 0, y2: 36, stroke: "currentColor", "stroke-width": 0.65, "stroke-dasharray": "10 4 2 4" }));
  }

  if (type === "detailCallout") {
    appendCircle(group, 0, 0, 24, 1);
    appendText(group, "D-01", 0, 4, 9);
    appendLine(group, -24, 11, 24, 11, 0.65);
    appendText(group, "1:5", 0, 21, 6.5);
  }

  if (type === "revisionCloud") {
    const d = [
      "M -48 -4",
      "C -52 -20 -33 -26 -25 -14",
      "C -20 -31 0 -29 4 -14",
      "C 18 -30 39 -19 32 -4",
      "C 52 -2 50 21 31 18",
      "C 21 33 1 27 -2 16",
      "C -16 31 -40 23 -31 8",
      "C -44 12 -54 7 -48 -4",
      "Z",
    ].join(" ");
    group.append(createSvgElement("path", { d, fill: "none", stroke: "currentColor", "stroke-width": 1.1, "stroke-linejoin": "round" }));
    appendText(group, "REV", 0, 5, 8);
  }

  if (type === "levelMarker") {
    appendLine(group, -42, 0, 4, 0, 0.9);
    group.append(createSvgElement("polygon", { points: "4,0 20,-9 20,9", fill: "none", stroke: "currentColor", "stroke-width": 0.9, "stroke-linejoin": "round" }));
    appendText(group, "+0.000", 54, 4, 8);
  }

  if (type === "fallArrow") {
    appendLine(group, -46, 0, 34, 0, 0.9);
    group.append(createSvgElement("polygon", { points: "45,0 32,-7 32,7", fill: "currentColor", stroke: "none" }));
    appendText(group, "FALL 1:40", -2, -9, 7);
  }

  const symbolLayer = type === "weld" || type === "plate" || type === "bracket" ? "steel" : activeLayer.value;
  return applyLayer(group, symbolLayer);
}

function libraryKind(category, name) {
  const lower = name.toLowerCase();
  if (category === "bolts" && (lower.includes("side") || lower.includes("assembly") || lower.includes("rod") || lower.includes("anchor") || lower.includes("bolt +"))) return "boltSide";
  if (category === "bolts") return "boltTop";
  if (category === "screws") return "screw";
  if (category === "connectors") return lower.includes("nail") || lower.includes("pin") || lower.includes("dowel") || lower.includes("shear") || lower.includes("split ring") || lower.includes("toothed") ? "pin" : "connector";
  if (category === "plates" && lower.includes("bolt group")) return "boltGroup";
  if (category === "plates" && lower.includes("base plate with")) return "basePlateAnchors";
  if (category === "plates" && lower.includes("end plate with")) return "endPlateBolts";
  if (category === "plates" && (lower.includes("stiffener") || lower.includes("gusset"))) return "stiffener";
  if (category === "plates" && lower.includes("slotted")) return "slottedPlate";
  if (category === "plates" && (lower.includes("shim") || lower.includes("shear tab"))) return "plateDetail";
  if (category === "plates") return lower.includes("bracket") || lower.includes("hanger") || lower.includes("hold-down") || lower.includes("strap") ? "bracket" : "plate";
  if (category === "welds") return "weld";
  if (category === "profiles") return "profile";
  if (category === "timber" && (lower.includes("end grain") || lower.includes("section"))) return "timberSection";
  if (category === "timber") return lower.includes("joint") || lower.includes("connection") ? "timberJoint" : "timber";
  if (category === "concrete" && (lower.includes("grout") || lower.includes("bearing pad") || lower.includes("dpc") || lower.includes("cast-in") || lower.includes("pocket"))) return "concreteDetail";
  if (category === "concrete") return lower.includes("reinforcement") || lower.includes("bar") || lower.includes("stirrup") || lower.includes("mesh") ? "rebar" : "concrete";
  if (category === "masonry" && (lower.includes("movement") || lower.includes("weep") || lower.includes("tray") || lower.includes("closer"))) return "masonryDetail";
  if (category === "masonry" || category === "ground" || category === "hatches") return "hatchBlock";
  if (category === "envelope" && (lower.includes("seal") || lower.includes("firestop") || lower.includes("backer") || lower.includes("tape") || lower.includes("mastic") || lower.includes("foam"))) return "sealantDetail";
  if (category === "envelope") return lower.includes("barrier") || lower.includes("membrane") || lower.includes("dpc") ? "membrane" : "insulation";
  if (category === "building" && (lower.includes("flashing") || lower.includes("drip") || lower.includes("coping") || lower.includes("gutter") || lower.includes("sill"))) return "flashingDetail";
  if (category === "building" && (lower.includes("window") || lower.includes("door") || lower.includes("glazing"))) return "openingDetail";
  if (category === "building" && (lower.includes("cladding") || lower.includes("rainscreen") || lower.includes("ventilation"))) return "claddingDetail";
  if (category === "graphic") return "graphic";
  return "generic";
}

function makeLibraryComponent(categoryKey, itemName, view, point) {
  const category = structuralLibrary[categoryKey] || structuralLibrary.graphic;
  const kind = libraryKind(categoryKey, itemName);
  if (categoryKey === "bolts" && itemName === "Bolt") {
    /* Plan gets the hole and centre cross, any other view gets the elevation --
       both from the ISO tables, both parametric. */
    return view === "top" || view === "symbol"
      ? makeBoltSymbol(boltSelect.value || "M16", point)
      : makeBoltSideSymbol(boltSelect.value || "M16", point, { ...boltUiOptions(), name: itemName });
  }
  if (kind === "boltSide" || view === "side" && categoryKey === "bolts") return makeBoltSideSymbol(boltSelect.value || "M16", point, { ...boltUiOptions(), name: itemName });
  if (kind === "boltTop") return makeTemplateBoltElement({ x: 0, y: 0 }, point.x, point.y, itemName);
  if (kind === "screw") return makeScrewSymbol(inferScrewKeyFromName(itemName), point, { name: itemName, view: view === "symbol" ? "side" : view, material: category.name });

  const group = createSvgElement("g", {
    transform: `translate(${point.x} ${point.y})`,
    color: strokeColor.value,
  });
  group.classList.add("draw-item");
  group.dataset.type = "libraryComponent";
  group.dataset.componentCategory = categoryKey;
  group.dataset.componentKind = kind;
  group.dataset.componentView = view;
  group.dataset.dimension = itemName;
  group.dataset.material = category.name;
  group.dataset.color = strokeColor.value;
  group.dataset.strokeWidth = ["steel", "timber", "masonry", "notes"].includes(category.layer) ? "1" : strokeWidth.value || "1";
  group.dataset.lineType = lineTypeSelect.value || "solid";
  group.dataset.opacity = strokeOpacity.value || "100";
  renderLibraryComponent(group);
  return applyLayer(group, category.layer || activeLayer.value);
}

function renderLibraryComponent(group) {
  const name = group.dataset.dimension || "Component";
  const kind = group.dataset.componentKind || "generic";
  const view = group.dataset.componentView || "symbol";
  group.replaceChildren();
  group.setAttribute("color", group.dataset.color || strokeColor.value);

  if (kind === "screw") {
    appendLine(group, -42, 0, 30, 0, 1.6);
    group.append(createSvgElement("polygon", { points: "30,0 44,-8 44,8", fill: "none", stroke: "currentColor", "stroke-width": 1.4 }));
    for (let x = -30; x <= 18; x += 10) appendLine(group, x, -5, x + 8, 5, 0.8);
  } else if (kind === "pin") {
    if (name.toLowerCase().includes("nail")) {
      appendLine(group, -42, 0, 30, 0, 1.3);
      appendCircle(group, -42, 0, 5, 0.9);
      group.append(createSvgElement("polygon", { points: "30,0 44,-6 44,6", fill: "none", stroke: "currentColor", "stroke-width": 0.9 }));
    } else if (name.toLowerCase().includes("shear") || name.toLowerCase().includes("split ring") || name.toLowerCase().includes("toothed")) {
      appendCircle(group, 0, 0, 24, 1.1);
      appendCircle(group, 0, 0, 11, 0.8);
      for (let i = 0; i < 12; i += 1) {
        const a = i * Math.PI / 6;
        appendLine(group, Math.cos(a) * 15, Math.sin(a) * 15, Math.cos(a) * 24, Math.sin(a) * 24, 0.65);
      }
    } else {
      appendLine(group, -34, 0, 34, 0, 2);
      appendCircle(group, -22, 0, 4, 1);
      appendCircle(group, 22, 0, 4, 1);
    }
  } else if (kind === "plate") {
    appendRect(group, -42, -26, 84, 52, 1.2);
    appendCircle(group, -24, -12, 4, 1);
    appendCircle(group, 24, -12, 4, 1);
    appendCircle(group, -24, 12, 4, 1);
    appendCircle(group, 24, 12, 4, 1);
  } else if (kind === "plateDetail") {
    if (name.toLowerCase().includes("shim")) {
      [-6, 0, 6].forEach((offset) => appendRect(group, -44 + offset, -20 + offset * 0.15, 88, 40, 0.75));
      appendText(group, "SHIMS", 0, 38, 7);
    } else {
      appendRect(group, -48, -24, 96, 48, 1.1);
      appendLine(group, -48, 0, 48, 0, 0.7);
      appendBoltGrid(group, 1, 2, 0, 26, 4);
    }
  } else if (kind === "boltGroup") {
    const lower = name.toLowerCase();
    const rows = lower.includes("2x4") ? 4 : lower.includes("2x3") ? 3 : 2;
    appendBoltGrid(group, 2, rows, 34, 28, 4.2);
    appendLine(group, -30, 0, 30, 0, 0.55);
    appendLine(group, 0, -((rows - 1) * 28) / 2 - 12, 0, ((rows - 1) * 28) / 2 + 12, 0.55);
  } else if (kind === "slottedPlate") {
    appendRect(group, -52, -28, 104, 56, 1.1);
    [-24, 24].forEach((x) => {
      appendSlot(group, x, -10, 24, 8, 1);
      appendSlot(group, x, 12, 24, 8, 1);
    });
  } else if (kind === "basePlateAnchors") {
    appendRect(group, -56, -38, 112, 76, 1.25);
    appendBoltGrid(group, 2, 2, 68, 42, 5);
    appendRect(group, -15, -15, 30, 30, 0.9);
    appendLine(group, -66, 0, 66, 0, 0.55);
    appendLine(group, 0, -46, 0, 46, 0.55);
  } else if (kind === "endPlateBolts") {
    const rows = name.toLowerCase().includes("6") ? 3 : 2;
    appendRect(group, -36, -48, 72, 96, 1.25);
    appendRect(group, -15, -38, 30, 76, 0.9);
    appendLine(group, 0, -48, 0, 48, 0.6);
    appendBoltGrid(group, 2, rows, 44, 30, 4.2);
  } else if (kind === "stiffener") {
    if (name.toLowerCase().includes("triangular") || name.toLowerCase().includes("gusset")) {
      group.append(createSvgElement("polygon", { points: "-44,30 -44,-30 42,30", fill: "none", stroke: "currentColor", "stroke-width": 1.2, "stroke-linejoin": "round" }));
      appendLine(group, -33, 22, -33, -16, 0.55);
      appendLine(group, -20, 22, 20, 22, 0.55);
    } else {
      appendRect(group, -48, -8, 96, 16, 1);
      appendRect(group, -20, -36, 10, 72, 1.1);
      appendRect(group, 10, -36, 10, 72, 1.1);
      appendLine(group, 0, -38, 0, 38, 0.55);
    }
  } else if (kind === "bracket") {
    appendLine(group, -34, -28, -34, 28, 3);
    appendLine(group, -34, 28, 34, 28, 3);
    appendLine(group, -24, 18, 22, -18, 1.2);
    appendCircle(group, -22, 14, 4, 1);
    appendCircle(group, 16, 20, 4, 1);
  } else if (kind === "weld") {
    appendLine(group, -48, 0, 48, 0, 0.9);
    if (name.toLowerCase().includes("site")) {
      group.append(createSvgElement("path", { d: "M -28 0 V -22 L -8 -16 L -28 -10", fill: "none", stroke: "currentColor", "stroke-width": 0.9 }));
    }
    if (name.toLowerCase().includes("perimeter")) appendCircle(group, -38, 0, 4, 0.8);
    if (name.toLowerCase().includes("callout") || name.toLowerCase().includes("fillet")) {
      group.append(createSvgElement("path", { d: "M -20 0 L 0 15 L 20 0", fill: "none", stroke: "currentColor", "stroke-width": 0.9 }));
      appendText(group, name.toLowerCase().includes("8mm") ? "8" : "6", -30, -7, 7);
    } else {
      for (let x = -34; x <= 24; x += 14) {
        group.append(createSvgElement("path", { d: `M ${x} 0 L ${x + 7} 9 L ${x + 14} 0`, fill: "none", stroke: "currentColor", "stroke-width": 1 }));
      }
    }
  } else if (kind === "profile") {
    if (view === "section" || view === "end") {
      appendRect(group, -34, -30, 68, 9, 1.2);
      appendRect(group, -34, 21, 68, 9, 1.2);
      appendRect(group, -5, -21, 10, 42, 1.2);
    } else {
      appendRect(group, -58, -13, 116, 26, 1.2);
      appendLine(group, -58, 0, 58, 0, 0.8);
    }
  } else if (kind === "timber") {
    appendRect(group, -54, -20, 108, 40, 1.2, "#fbf1df");
    appendLine(group, -54, -20, 54, 20, 0.8);
    appendLine(group, -54, 20, 54, -20, 0.8);
  } else if (kind === "timberSection") {
    appendRect(group, -34, -34, 68, 68, 1.1, "#fffefb");
    appendLine(group, -34, -34, 34, 34, 0.65);
    appendLine(group, 34, -34, -34, 34, 0.65);
    appendLine(group, -24, 0, 24, 0, 0.45);
    appendLine(group, 0, -24, 0, 24, 0.45);
  } else if (kind === "timberJoint") {
    appendRect(group, -52, -16, 58, 32, 1.2, "#fbf1df");
    appendRect(group, -6, -16, 58, 32, 1.2, "#fbf1df");
    appendLine(group, -6, -16, 6, 16, 1);
  } else if (kind === "concrete") {
    appendRect(group, -56, -22, 112, 44, 1.2, "url(#hatch-concrete)");
  } else if (kind === "concreteDetail") {
    if (name.toLowerCase().includes("bearing pad")) {
      appendRect(group, -56, -8, 112, 16, 1.1, "#f7f7f4");
      appendRect(group, -42, -22, 84, 14, 0.7, "url(#hatch-steel)");
      appendText(group, "PAD", 0, 28, 7);
    } else if (name.toLowerCase().includes("dpc")) {
      appendRect(group, -56, -18, 112, 36, 0.8, "url(#hatch-concrete)");
      appendLine(group, -58, -2, 58, -2, 1.4);
      appendLine(group, -58, 4, 58, 4, 0.7);
    } else if (name.toLowerCase().includes("cast-in")) {
      appendRect(group, -56, -24, 112, 48, 1, "url(#hatch-concrete)");
      appendRect(group, -36, -8, 72, 16, 1.1, "#fffefb");
      appendSlot(group, 0, 0, 42, 8, 0.9);
    } else {
      appendRect(group, -58, -18, 116, 36, 1, "#f4f4f1");
      group.append(createSvgElement("path", { d: "M -52 -4 H 52 M -50 6 H 50", fill: "none", stroke: "currentColor", "stroke-width": 0.65, "stroke-dasharray": "5 3" }));
      appendText(group, "GROUT", 0, 32, 7);
    }
  } else if (kind === "rebar") {
    appendLine(group, -44, 0, 44, 0, 2);
    appendLine(group, -44, 0, -34, -10, 2);
    appendLine(group, 44, 0, 34, -10, 2);
    appendText(group, "O16 c/c", 0, 18, 8);
  } else if (kind === "hatchBlock") {
    const hatch = name.toLowerCase().includes("timber") ? "wood" : name.toLowerCase().includes("steel") ? "steel" : name.toLowerCase().includes("insulation") ? "insulation" : name.toLowerCase().includes("brick") || name.toLowerCase().includes("masonry") ? "masonry" : "concrete";
    appendRect(group, -54, -22, 108, 44, 1.1, `url(#hatch-${hatch})`);
  } else if (kind === "masonryDetail") {
    appendRect(group, -58, -24, 116, 48, 1, "url(#hatch-masonry)");
    if (name.toLowerCase().includes("movement")) {
      appendRect(group, -5, -26, 10, 52, 0.8, "#fffefb");
      group.append(createSvgElement("path", { d: "M 0 -22 C -6 -10 6 2 0 22", fill: "none", stroke: "currentColor", "stroke-width": 0.8 }));
    } else if (name.toLowerCase().includes("weep")) {
      [-24, 0, 24].forEach((x) => appendSlot(group, x, 20, 14, 5, 0.75));
    } else {
      group.append(createSvgElement("path", { d: "M -52 -4 H 8 L 24 -18 H 52 M -52 8 H 52", fill: "none", stroke: "currentColor", "stroke-width": 0.85 }));
    }
  } else if (kind === "membrane") {
    group.append(createSvgElement("path", { d: "M -54 0 C -36 -12 -18 12 0 0 S 36 -12 54 0", fill: "none", stroke: "currentColor", "stroke-width": 1.4 }));
  } else if (kind === "sealantDetail") {
    appendRect(group, -54, -20, 108, 40, 0.8);
    appendRect(group, -6, -18, 12, 36, 0.7, "#fffefb");
    group.append(createSvgElement("path", { d: "M -2 -16 C -13 -4 -13 4 -2 16 M 2 -16 C 13 -4 13 4 2 16", fill: "none", stroke: "currentColor", "stroke-width": 0.8 }));
    if (name.toLowerCase().includes("fire")) appendText(group, "FIRE", 0, 34, 7);
  } else if (kind === "insulation") {
    group.append(createSvgElement("path", { d: "M -54 0 C -40 -20 -20 20 0 0 S 40 -20 54 0", fill: "none", stroke: "currentColor", "stroke-width": 1.3 }));
    appendRect(group, -56, -18, 112, 36, 0.7);
  } else if (kind === "flashingDetail") {
    group.append(createSvgElement("path", {
      d: "M -56 -16 H 28 L 44 -4 V 12 L 54 18 M 28 -16 V -4 H 44",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 1.1,
      "stroke-linejoin": "miter",
    }));
    if (name.toLowerCase().includes("drip")) appendCircle(group, 48, 17, 1.8, 0.6, "currentColor");
  } else if (kind === "openingDetail") {
    appendRect(group, -50, -28, 100, 56, 1.1);
    appendRect(group, -34, -18, 68, 36, 0.75);
    if (name.toLowerCase().includes("glazing")) {
      appendLine(group, -28, -16, 28, 16, 0.55);
      appendLine(group, -28, 16, 28, -16, 0.55);
    }
  } else if (kind === "claddingDetail") {
    appendRect(group, -58, -24, 116, 48, 0.8);
    [-42, -21, 0, 21, 42].forEach((x) => appendLine(group, x, -24, x, 24, 0.65));
    appendLine(group, -58, -7, 58, -7, 0.6,);
    appendLine(group, -58, 7, 58, 7, 0.6);
  } else if (kind === "graphic") {
    if (name.toLowerCase().includes("break")) {
      group.append(createSvgElement("path", { d: "M -44 0 L -14 0 L -4 -14 L 7 14 L 17 0 L 44 0", fill: "none", stroke: "currentColor", "stroke-width": 1.4 }));
    } else if (name.toLowerCase().includes("grid bubble")) {
      appendLine(group, -48, 0, -16, 0, 0.8);
      appendCircle(group, 0, 0, 16, 0.9);
      appendText(group, name.toLowerCase().includes(" 1") ? "1" : "A", 0, 4, 11);
    } else if (name.toLowerCase().includes("datum")) {
      appendLine(group, -48, 0, 12, 0, 0.8);
      group.append(createSvgElement("polygon", { points: "12,0 30,-10 30,10", fill: "none", stroke: "currentColor", "stroke-width": 0.9, "stroke-linejoin": "round" }));
      appendText(group, "DATUM", 66, 4, 7);
    } else if (name.toLowerCase().includes("level")) {
      appendLine(group, -42, 0, 4, 0, 0.9);
      group.append(createSvgElement("polygon", { points: "4,0 20,-9 20,9", fill: "none", stroke: "currentColor", "stroke-width": 0.9, "stroke-linejoin": "round" }));
      appendText(group, "+0.000", 54, 4, 8);
    } else if (name.toLowerCase().includes("revision triangle")) {
      group.append(createSvgElement("polygon", { points: "0,-24 24,18 -24,18", fill: "none", stroke: "currentColor", "stroke-width": 1.1, "stroke-linejoin": "round" }));
      appendText(group, "1", 0, 8, 13);
    } else if (name.toLowerCase().includes("revision cloud")) {
      group.append(createSvgElement("path", { d: "M -48 -4 C -52 -20 -33 -26 -25 -14 C -20 -31 0 -29 4 -14 C 18 -30 39 -19 32 -4 C 52 -2 50 21 31 18 C 21 33 1 27 -2 16 C -16 31 -40 23 -31 8 C -44 12 -54 7 -48 -4 Z", fill: "none", stroke: "currentColor", "stroke-width": 1.1, "stroke-linejoin": "round" }));
    } else if (name.toLowerCase().includes("leader dot")) {
      appendCircle(group, -36, 0, 2.4, 0.8, "currentColor");
      appendLine(group, -34, 0, 40, -24, 0.8);
      appendLine(group, 40, -24, 64, -24, 0.8);
    } else if (name.toLowerCase().includes("leader arrow")) {
      appendLine(group, -36, 0, 40, -24, 0.8);
      group.append(createSvgElement("polygon", { points: "-36,0 -23,-6 -25,7", fill: "currentColor" }));
      appendLine(group, 40, -24, 64, -24, 0.8);
    } else if (name.toLowerCase().includes("section tail")) {
      appendLine(group, -36, 0, 36, 0, 0.9);
      group.append(createSvgElement("polygon", { points: "-36,0 -23,-8 -23,8", fill: "currentColor" }));
      appendText(group, "A", -50, 4, 10);
    } else if (name.toLowerCase().includes("section")) {
      appendLine(group, -44, 0, 44, 0, 1.2);
      group.append(createSvgElement("polygon", { points: "-26,0 -18,-8 -18,8", fill: "currentColor" }));
      group.append(createSvgElement("polygon", { points: "26,0 18,-8 18,8", fill: "currentColor" }));
      appendText(group, "A", -34, -8, 9);
      appendText(group, "A", 34, -8, 9);
    } else if (name.toLowerCase().includes("arrow") || name.toLowerCase().includes("fall")) {
      appendLine(group, -46, 0, 38, 0, 1.4);
      group.append(createSvgElement("polygon", { points: "44,0 32,-7 32,7", fill: "currentColor" }));
    } else {
      appendCircle(group, 0, 0, 22, 1.2);
      appendLine(group, -28, 0, 28, 0, 1);
      appendLine(group, 0, -28, 0, 28, 1);
    }
  } else {
    appendRect(group, -45, -22, 90, 44, 1.1);
    appendLine(group, -35, 0, 35, 0, 0.9);
  }

  if (!["graphic", "weld", "boltGroup"].includes(kind)) {
    appendText(group, name, 0, 40, 7);
  }
  applyOpacity(group, group.dataset.opacity || 100);
}

function findManufacturerComponent(manufacturerId, familyId, sku) {
  const library = manufacturerLibraries[manufacturerId];
  const family = library?.families.find((item) => item.id === familyId);
  const variant = family?.variants.find((item) => item.sku === sku) || family?.variants[0];
  return library && family && variant ? { library, family, variant } : null;
}

function makeManufacturerComponent(manufacturerId, familyId, sku, view, point) {
  const found = findManufacturerComponent(manufacturerId, familyId, sku);
  if (!found) return null;
  const { library, family, variant } = found;
  const geometry = getManufacturerGeometryForView(variant, view);
  if (variant.geometry?.status !== "verified" || !geometry.elements.length) {
    showAlert(
      `${library.manufacturer.name} ${variant.sku}`,
      "Komponenten har ikke importeret/verificeret 1:1 CAD-geometri endnu. Importer producentens DXF/DWG/PDF foer den kan placeres som leverandoerbeslag."
    );
    return null;
  }
  const group = createSvgElement("g", {
    transform: `translate(${point.x} ${point.y})`,
    color: "#111111",
  });
  group.classList.add("draw-item");
  group.dataset.type = "manufacturerComponent";
  group.dataset.source = "manufacturer";
  group.dataset.manufacturerId = manufacturerId;
  group.dataset.manufacturer = library.manufacturer.name;
  group.dataset.familyId = family.id;
  group.dataset.family = family.family;
  group.dataset.variant = variant.sku;
  group.dataset.category = family.category;
  group.dataset.componentView = view;
  group.dataset.dimension = `${family.family} ${variant.sku}`;
  group.dataset.material = [variant.material?.steelGrade, variant.material?.coating].filter(Boolean).join(" + ") || family.name;
  group.dataset.sourceUrl = variant.sourceUrl || family.sourceUrl || "";
  group.dataset.color = "#111111";
  /* The traced primitives carry their own weights; this is only the fallback
     for anything drawn around them, so it sits at a normal ISO pen. */
  group.dataset.strokeWidth = "0.35";
  group.dataset.lineType = "solid";
  group.dataset.opacity = "100";
  group.dataset.metadata = JSON.stringify({
    retrievedAt: library.retrievedAt,
    name: family.name,
    dimensions: variant.dimensions || {},
    holes: variant.holes || {},
    fasteners: family.fasteners || [],
    weightKg: variant.weightKg || null,
  });
  renderManufacturerComponent(group);
  return applyLayer(group, family.category === "plates" || family.category === "angle_bracket" || family.category === "post_base" || family.category === "joist_hanger" ? "steel" : activeLayer.value);
}

function renderManufacturerComponent(group) {
  const found = findManufacturerComponent(group.dataset.manufacturerId, group.dataset.familyId, group.dataset.variant);
  if (!found) return;
  const { variant } = found;
  const geometry = getManufacturerGeometryForView(variant, group.dataset.componentView || "symbol");
  group.replaceChildren();
  group.setAttribute("color", group.dataset.color || "#111111");
  geometry.elements.forEach((element) => appendNativeGeometryElement(group, element));
  applyStrokeWidth(group, Number(group.dataset.strokeWidth || 1));
  applyOpacity(group, group.dataset.opacity || 100);
}

function getManufacturerGeometryForView(variant, view) {
  const geometry = variant.geometry || {};
  const viewAliases = {
    symbol: ["symbol", "elevation", "top", "side"],
    top: ["top", "elevation", "symbol"],
    side: ["side", "sideRight", "elevation", "symbol"],
    section: ["section", "bottom", "elevation", "symbol"],
    elevation: ["elevation", "front", "symbol"],
  };
  const aliases = viewAliases[view] || [view];
  for (const key of aliases) {
    const viewGeometry = geometry.views?.[key];
    if (viewGeometry?.elements?.length) return { key, bbox: viewGeometry.bbox || geometry.bbox, elements: viewGeometry.elements };
  }
  return { key: "default", bbox: geometry.bbox, elements: geometry.elements || [] };
}

function appendNativeGeometryElement(group, item) {
  const before = group.childElementCount;
  const attrs = item.attrs || {};
  /* The importer records pen weights in millimetres on paper (0.35 etc), so
     they have to go through the plot scale like every other lineweight. */
  const pen = paperMmToUnits(attrs.strokeWidth || 0.25);
  const claimOwnPen = () => {
    for (let i = before; i < group.childElementCount; i += 1) {
      group.children[i].dataset.pen = "own";
    }
  };
  if (item.type === "line") {
    appendLine(group, mmToDrawing(attrs.x1), mmToDrawing(attrs.y1), mmToDrawing(attrs.x2), mmToDrawing(attrs.y2), pen);
  }
  if (item.type === "circle") {
    appendCircle(group, mmToDrawing(attrs.cx), mmToDrawing(attrs.cy), mmToDrawing(attrs.r), pen);
  }
  if (item.type === "rect") {
    appendRect(group, mmToDrawing(attrs.x), mmToDrawing(attrs.y), mmToDrawing(attrs.width), mmToDrawing(attrs.height), pen, attrs.fill || "none");
  }
  if (item.type === "polyline" && Array.isArray(attrs.points) && attrs.points.length > 1) {
    const d = attrs.points
      .map(([x, y], index) => `${index ? "L" : "M"} ${mmToDrawing(x)} ${mmToDrawing(y)}`)
      .join(" ");
    group.append(createSvgElement("path", {
      d: attrs.closed ? `${d} Z` : d,
      fill: attrs.fill || "none",
      stroke: "currentColor",
      "stroke-width": pen,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }));
  }
  if (item.type === "path") {
    group.append(createSvgElement("path", {
      d: attrs.d,
      fill: attrs.fill || "none",
      stroke: "currentColor",
      "stroke-width": pen,
    }));
  }
  claimOwnPen();
}

function appendLocalHoleGrid(group, width, height, count, radius, side = "left") {
  const cols = Math.max(1, Math.min(2, Math.ceil(count / 8)));
  const rows = Math.ceil(count / cols);
  const xStart = side === "left" ? -width / 2 + width * 0.25 : width * 0.25;
  const xStep = cols > 1 ? width * 0.28 : 0;
  const yStep = rows > 1 ? height * 0.72 / (rows - 1) : 0;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (r * cols + c >= count) return;
      appendCircle(group, xStart + c * xStep, -height * 0.36 + r * yStep, radius, 0.8);
    }
  }
}





function insertSymbol(type) {
  beginObjectPlacement((point) => makeSymbol(type, point), detailSymbolLabel(type));
}

function populateComponentLibrary() {
  if (!componentCategory || !componentItem) return;
  componentManufacturer.replaceChildren();
  Object.entries(manufacturerLibraries).forEach(([key, library]) => {
    componentManufacturer.append(new Option(library.manufacturer.name, key));
  });
  componentCategory.replaceChildren();
  if (componentSource.value === "manufacturer") {
    const categories = manufacturerCategories();
    categories.forEach((category) => componentCategory.append(new Option(category.label, category.value)));
  } else {
    Object.entries(structuralLibrary).forEach(([key, category]) => {
      componentCategory.append(new Option(category.name, key));
    });
  }
  updateComponentItems();
}

function manufacturerFamilies() {
  const library = manufacturerLibraries[componentManufacturer.value];
  if (!library) return [];
  const query = (componentSearch.value || "").trim().toLowerCase();
  return library.families.filter((family) => {
    const haystack = [
      library.manufacturer.name,
      family.category,
      family.family,
      family.name,
      ...family.variants.map((variant) => variant.sku),
    ].join(" ").toLowerCase();
    return (!componentCategory.value || family.category === componentCategory.value) && (!query || haystack.includes(query));
  });
}

function manufacturerCategories() {
  const library = manufacturerLibraries[componentManufacturer.value];
  if (!library) return [];
  const labels = {
    angle_bracket: "Angle brackets",
    joist_hanger: "Joist hangers",
    post_base: "Post bases",
    hold_down: "Hold downs",
    straps: "Straps",
    plates: "Plates",
  };
  return Array.from(new Set(library.families.map((family) => family.category))).map((value) => ({
    value,
    label: labels[value] || value.replaceAll("_", " "),
  }));
}

function updateComponentItems() {
  if (!componentCategory || !componentItem) return;
  if (componentSource.value === "manufacturer") {
    const families = manufacturerFamilies();
    componentItem.replaceChildren();
    families.forEach((family) => componentItem.append(new Option(`${family.family} - ${family.name}`, family.id)));
    updateComponentVariants();
    updateComponentPreview();
    renderComponentBrowser();
    return;
  }
  const category = structuralLibrary[componentCategory.value] || Object.values(structuralLibrary)[0];
  componentItem.replaceChildren();
  category.items.forEach((item) => componentItem.append(new Option(item, item)));
  componentVariant.replaceChildren();
  componentVariant.disabled = true;
  updateComponentPreview();
  renderComponentBrowser();
}

function selectedManufacturerFamily() {
  const library = manufacturerLibraries[componentManufacturer.value];
  return library?.families.find((family) => family.id === componentItem.value) || null;
}

function selectedManufacturerVariant() {
  const family = selectedManufacturerFamily();
  return family?.variants.find((variant) => variant.sku === componentVariant.value) || family?.variants[0] || null;
}

function updateComponentVariants() {
  componentVariant.replaceChildren();
  if (componentSource.value !== "manufacturer") {
    componentVariant.disabled = true;
    return;
  }
  const family = selectedManufacturerFamily();
  componentVariant.disabled = !family;
  (family?.variants || []).forEach((variant) => componentVariant.append(new Option(variant.sku, variant.sku)));
  updateManufacturerViews();
}

function updateManufacturerViews() {
  if (componentSource.value !== "manufacturer") return;
  const family = selectedManufacturerFamily();
  const allowed = new Set(family?.representations || ["symbol"]);
  Array.from(componentView.options).forEach((option) => {
    option.disabled = !allowed.has(option.value);
  });
  if (!allowed.has(componentView.value)) componentView.value = family?.representations?.[0] || "symbol";
}

function updateComponentSourceUi() {
  const manufacturerMode = componentSource.value === "manufacturer";
  if (manufacturerMode) ensureComponentViewsLoaded();
  componentManufacturer.disabled = !manufacturerMode;
  componentSearch.placeholder = manufacturerMode ? "ABR, ABR9020, joist hanger..." : "Screw, plate, weld...";
  populateComponentLibrary();
}

function updateComponentPreview() {
  if (!componentPreview) return;
  const insertButton = document.getElementById("insertLibraryComponent");
  if (insertButton) insertButton.disabled = false;
  if (componentSource.value === "manufacturer") {
    const library = manufacturerLibraries[componentManufacturer.value];
    const family = selectedManufacturerFamily();
    const variant = selectedManufacturerVariant();
    if (!library || !family || !variant) {
      componentPreview.textContent = "No manufacturer component selected";
      return;
    }
    const dims = Object.entries(variant.dimensions || {}).map(([key, value]) => `${key}=${value}mm`).join(", ") || "Dimensions not imported yet";
    const geometry = getManufacturerGeometryForView(variant, componentView.value);
    const verified = variant.geometry?.status === "verified" && geometry.elements.length;
    if (insertButton) {
      insertButton.disabled = false;
      insertButton.textContent = verified ? "Indsaet komponent" : "CAD-import kraeves";
      insertButton.title = verified
        ? "Indsaet verificeret manufacturer component"
        : "Klik for at se hvorfor komponenten ikke kan placeres endnu";
    }
    componentPreview.innerHTML = `<strong>${library.manufacturer.name} ${variant.sku}</strong><span>${family.name}</span><span>${dims}</span><span>${verified ? `1:1 CAD geometry verified - ${geometry.key}` : "CAD geometry pending import - click button for explanation"}</span><span>${variant.geometry?.sourceAsset || "No source asset selected"}</span><span>${family.sourceUrl}</span>`;
    return;
  }
  if (insertButton) {
    insertButton.disabled = false;
    insertButton.textContent = "Indsaet komponent";
    insertButton.title = "";
  }
  componentPreview.innerHTML = `<strong>${componentItem.value || "Generic component"}</strong><span>${structuralLibrary[componentCategory.value]?.name || ""}</span><span>Native editable Omkreds symbol</span>`;
}

function fitThumbnailViewBox(svgElement, group, fallback = { x: -70, y: -52, width: 140, height: 104 }) {
  let box = fallback;
  try {
    const measured = group.getBBox();
    if (Number.isFinite(measured.width) && Number.isFinite(measured.height) && measured.width > 0 && measured.height > 0) {
      box = measured;
    }
  } catch (error) {
    box = fallback;
  }
  const pad = Math.max(8, Math.min(26, Math.max(box.width, box.height) * 0.1));
  svgElement.setAttribute("viewBox", `${box.x - pad} ${box.y - pad} ${box.width + pad * 2} ${box.height + pad * 2}`);
}

function makeComponentThumbSvg(group, fallback) {
  const thumb = createSvgElement("svg", {
    class: "component-thumb",
    viewBox: "-76 -54 152 108",
    "aria-hidden": "true",
    focusable: "false",
  });
  group.classList.remove("draw-item", "selected", "hovered", "marquee-hit");
  group.removeAttribute("transform");
  group.setAttribute("color", "#151515");
  thumb.append(group);
  fitThumbnailViewBox(thumb, group, fallback);
  return thumb;
}

function makeManufacturerThumb(family, variant, view) {
  const geometry = getManufacturerGeometryForView(variant, view);
  const group = createSvgElement("g", { color: "#151515" });
  if (variant.geometry?.status === "verified" && geometry.elements.length) {
    geometry.elements.forEach((element) => appendNativeGeometryElement(group, element));
    const width = mmToDrawing(geometry.bbox?.width || variant.geometry?.bbox?.width || 120);
    const height = mmToDrawing(geometry.bbox?.height || variant.geometry?.bbox?.height || 90);
    return makeComponentThumbSvg(group, { x: -width / 2, y: -height / 2, width, height });
  }
  appendRect(group, -42, -24, 84, 48, 1);
  appendLine(group, -34, -16, 34, 16, 0.8);
  appendLine(group, -34, 16, 34, -16, 0.8);
  appendText(group, "CAD", 0, 5, 11);
  return makeComponentThumbSvg(group);
}

function makeGenericComponentThumb(categoryKey, itemName) {
  const component = makeLibraryComponent(categoryKey, itemName, componentView.value || "symbol", { x: 0, y: 0 });
  if (component) return makeComponentThumbSvg(component);
  const group = createSvgElement("g", { color: "#151515" });
  appendRect(group, -42, -22, 84, 44, 1);
  appendText(group, "?", 0, 5, 16);
  return makeComponentThumbSvg(group);
}

function makeComponentCard({ key, title, subtitle, active, disabled, thumb, onSelect }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `component-card${active ? " active" : ""}${disabled ? " unverified" : ""}`;
  button.dataset.componentKey = key;
  button.title = [title, subtitle].filter(Boolean).join(" - ");
  button.append(thumb);
  const titleElement = document.createElement("strong");
  titleElement.textContent = title;
  const subtitleElement = document.createElement("span");
  subtitleElement.textContent = subtitle || "";
  button.append(titleElement, subtitleElement);
  button.addEventListener("click", onSelect);
  return button;
}

function renderComponentBrowser() {
  if (!componentBrowser) return;
  componentBrowser.replaceChildren();
  if (componentSource.value === "manufacturer") {
    const families = manufacturerFamilies();
    if (!families.length) {
      componentBrowser.textContent = "Ingen komponenter matcher soegningen.";
      return;
    }
    families.forEach((family) => {
      const selectedFamily = family.id === componentItem.value;
      const variant = selectedFamily ? selectedManufacturerVariant() : family.variants[0];
      const geometry = variant ? getManufacturerGeometryForView(variant, componentView.value) : { elements: [] };
      const verified = variant?.geometry?.status === "verified" && geometry.elements.length;
      componentBrowser.append(makeComponentCard({
        key: family.id,
        title: family.family,
        subtitle: `${variant?.sku || ""} ${family.name}`,
        active: selectedFamily,
        disabled: !verified,
        thumb: makeManufacturerThumb(family, variant || {}, componentView.value),
        onSelect: () => {
          componentItem.value = family.id;
          updateComponentVariants();
          updateComponentPreview();
          renderComponentBrowser();
        },
      }));
    });
    return;
  }

  const category = structuralLibrary[componentCategory.value] || Object.values(structuralLibrary)[0];
  category.items.forEach((item) => {
    componentBrowser.append(makeComponentCard({
      key: item,
      title: item,
      subtitle: category.name,
      active: item === componentItem.value,
      disabled: false,
      thumb: makeGenericComponentThumb(componentCategory.value, item),
      onSelect: () => {
        componentItem.value = item;
        updateComponentPreview();
        renderComponentBrowser();
      },
    }));
  });
}

function insertLibraryComponent() {
  const manufacturerMode = componentSource.value === "manufacturer";
  const view = componentView.value || "symbol";
  const label = manufacturerMode
    ? `${componentItem.value} ${componentVariant.value}`.trim()
    : componentItem.value;
  const category = componentCategory.value;
  const item = componentItem.value;
  const manufacturer = componentManufacturer.value;
  const variant = componentVariant.value;
  beginObjectPlacement((point) => (manufacturerMode
    ? makeManufacturerComponent(manufacturer, item, variant, view, point)
    : makeLibraryComponent(category, item, view, point)), label || "Komponent");
}

async function insertSheetFrame() {
  pushHistory();
  const existing = drawingLayer.querySelector('[data-type="sheetFrame"]');
  if (existing && !(await showConfirm("Tegningsramme findes allerede", "Vil du indsaette endnu en ramme?"))) return;
  const frame = makeSheetFrame();
  drawingLayer.prepend(frame);
  clearSelection();
  renderElementList();
  pushHistory();
  statusText.textContent = "Tegningsramme og titleblock indsat.";
}

async function insertDetailTitle() {
  const answers = await openDialog({
    title: "Detailtitel",
    fields: [
      { name: "id", label: "Detail ID", value: "D-01" },
      { name: "title", label: "Titel", value: "TRUSS CONNECTION DETAIL" },
      { name: "scale", label: "Skala", value: "SCALE 1:10" },
    ],
    confirmLabel: "Indsaet",
  });
  if (!answers) return;
  const id = answers.id || "D-01";
  const title = answers.title || "DETAIL";
  const scale = answers.scale || "SCALE 1:10";
  pushHistory();
  const detailTitle = makeDetailTitle(centerPoint(), id, title, scale);
  drawingLayer.append(detailTitle);
  selectOnly(detailTitle);
  pushHistory();
  statusText.textContent = `${id} detailtitel indsat.`;
}

async function insertDetailViewport() {
  const answers = await openDialog({
    title: "Detail viewport",
    fields: [
      { name: "id", label: "Detail ID", value: "D-01" },
      { name: "title", label: "Titel", value: "CONNECTION DETAIL" },
      { name: "scale", label: "Skala", value: "SCALE 1:10" },
    ],
    confirmLabel: "Indsaet",
  });
  if (!answers) return;
  const id = answers.id || "D-01";
  const title = answers.title || "CONNECTION DETAIL";
  const scale = answers.scale || "SCALE 1:10";
  pushHistory();
  const viewport = makeDetailViewport(centerPoint(), { id, title, scale });
  drawingLayer.append(viewport);
  selectOnly(viewport);
  setActiveTool("select");
  pushHistory();
  statusText.textContent = `${id} detail viewport indsat.`;
}

/* --- Bearing details ------------------------------------------------------
   Six load-path details, drawn the way the reference sheets draw them: timber
   with a tan body and grain along the member, steel solid grey, concrete
   stippled, a break line wherever a member runs on, hidden work dashed, and a
   red arrow in at the top and out at the bottom so the load path reads at a
   glance.

   Everything is built from ordinary drawing objects -- rects, polygons, lines,
   and the real bolt and screw generators -- so an inserted detail stays
   editable down to the last grain line rather than being a picture. */

const DETAIL_TIMBER = "#efe3ae";
const DETAIL_TIMBER_DARK = "#e6d691";
const DETAIL_STEEL = "#c9cdd0";
const DETAIL_CONCRETE = "#f0f0ee";
const DETAIL_LOAD = "#e2231a";

/* A rectangle whose flagged edges carry a break line -- the jag that says the
   member continues past the detail. Walked clockwise from the top left, with
   the jog inserted into any edge that is broken. */
function detailMemberPoints(x, y, w, h, breaks = {}) {
  const amp = Math.min(14, Math.min(w, h) * 0.055 + 3);
  const jog = (a, b) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const s = Math.min(len * 0.07, 16);
    return [
      [mx - ux * s * 1.9, my - uy * s * 1.9],
      [mx - ux * s * 0.7 + nx * amp, my - uy * s * 0.7 + ny * amp],
      [mx + ux * s * 0.7 - nx * amp, my + uy * s * 0.7 - ny * amp],
      [mx + ux * s * 1.9, my + uy * s * 1.9],
    ];
  };
  const corners = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  const flags = [breaks.top, breaks.right, breaks.bottom, breaks.left];
  const points = [];
  corners.forEach((corner, i) => {
    const next = corners[(i + 1) % 4];
    points.push(corner);
    if (flags[i]) jog(corner, next).forEach((point) => points.push(point));
  });
  return points;
}

/* One member: body, grain, and its break lines, as separate editable objects. */
function detailMember(elements, origin, x, y, w, h, options = {}) {
  const add = (element) => addTemplateElement(elements, element);
  const material = options.material || "timber";
  const fill = options.fill || (material === "steel" ? DETAIL_STEEL
    : material === "concrete" ? DETAIL_CONCRETE : DETAIL_TIMBER);
  const layer = material === "concrete" ? "masonry" : material === "steel" ? "steel" : "timber";
  const points = detailMemberPoints(x, y, w, h, options.breaks || {});
  add(makeTemplatePolygon(origin, points, {
    name: options.name || (material === "steel" ? "Staalprofil" : "Traeelement"),
    material: options.spec || (material === "steel" ? "S355" : material === "concrete" ? "C25/30" : "C24"),
    fill,
    width: options.width || 1.1,
    layer,
  }));
  if (material === "concrete") {
    add(makeTemplatePolygon(origin, points, {
      name: "Betonskravering",
      fill: "url(#hatch-concrete)",
      width: 0,
      layer: "masonry",
    }));
    return;
  }
  if (options.flangeLine) {
    add(makeTemplateLine(origin, x, y + options.flangeLine, x + w, y + options.flangeLine,
      { name: "Flangelinje", width: 0.7, layer }));
  }
  /* Steel and engineered members are shown as a clean body -- the reference
     sheets give them one line for the flange, not a run of grain. */
  if (options.grain === false || (material !== "timber" && !options.grain)) return;
  /* Lamellas run ALONG the member, and they are a HATCH, not a stack of loose
     lines: one fill that cannot drift out of step with the body it belongs to,
     and one object in the element list instead of seven. The pattern is in
     model millimetres, so a 40 mm lamella stays 40 mm when the plot scale
     changes -- unlike a section hatch, which is a paper convention. */
  const along = options.grain || (w >= h ? "x" : "y");
  add(makeTemplatePolygon(origin, points, {
    name: "Lameller",
    fill: along === "x" ? "url(#lam-h)" : "url(#lam-v)",
    width: 0,
    layer,
  }));
}

function detailHidden(elements, origin, x1, y1, x2, y2, name = "Skjult kant") {
  return addTemplateElement(elements, makeTemplateLine(origin, x1, y1, x2, y2, {
    name, width: 0.6, dash: "10 7", lineType: "hidden", layer: "steel",
  }));
}

function detailHiddenRect(elements, origin, x, y, w, h, name = "Skjult del") {
  return addTemplateElement(elements, makeTemplateRect(origin, x, y, w, h, {
    name, fill: "none", width: 0.6, dash: "10 7", lineType: "hidden", layer: "steel",
  }));
}

/* The load path. Red, and deliberately NOT a loadArrow: that type carries a
   "Last" caption, and these arrows are the diagram, not a labelled load. */
function detailLoadArrow(elements, origin, x1, y1, x2, y2, name = "Lastvej") {
  const arrow = makeArrow(templatePoint(origin, x1, y1), templatePoint(origin, x2, y2), { type: "arrow", headSize: 46 });
  arrow.dataset.dimension = name;
  applyColor(arrow, DETAIL_LOAD);
  applyStrokeWidth(arrow, 1.2);
  /* The head is filled, so it does not want the shaft pen around it as well --
     at 1:10 that turned a 4.6 mm arrowhead into a blob. */
  arrow.querySelectorAll("polygon").forEach((head) => {
    head.dataset.pen = "own";
    head.setAttribute("stroke-width", paperMmToUnits(0.2));
  });
  return addTemplateElement(elements, arrow);
}

function detailScrew(elements, origin, x, y, sku, rotation = 90, name = "") {
  return addTemplateElement(elements, makeTemplateScrew(origin, x, y, sku, "side", rotation, name));
}

function detailBolt(elements, origin, x, y, key = "M12", rotation = 0, options = {}) {
  return addTemplateElement(elements, makeBoltSideSymbol(key, templatePoint(origin, x, y), {
    rotation,
    length: options.length,
    threadLength: options.threadLength,
    extension: options.extension === undefined ? 6 : options.extension,
    nutWasher: true,
    headWasher: options.headWasher === undefined ? true : options.headWasher,
    strokeWidth: 0.3,
    name: options.name || (key + " gennemgaaende bolt"),
  }));
}

function detailBoltHead(elements, origin, x, y, key = "M12", name = "Bolt, set for enden") {
  const bolt = makeBoltSymbol(key, templatePoint(origin, x, y));
  bolt.dataset.showHead = "true";
  bolt.dataset.dimension = name;
  renderBoltSymbol(bolt);
  return addTemplateElement(elements, bolt);
}

function detailTitle(elements, origin, x, y, text, sub) {
  addTemplateElement(elements, makeTemplateText(origin, text, x, y, { size: 13, anchor: "middle", weight: "700" }));
  if (sub) addTemplateElement(elements, makeTemplateText(origin, sub, x, y + 17, { size: 9, anchor: "middle" }));
}

/* 13-5 -- two beams butt over a timber column and bear on its end grain. */
function buildBearingOnColumnDetail(origin = centerPoint()) {
  const elements = [];
  detailMember(elements, origin, -280, -220, 280, 220, { material: "steel", name: "Bjaelke, venstre", flangeLine: 16, breaks: { left: true } });
  detailMember(elements, origin, 0, -220, 280, 220, { material: "steel", name: "Bjaelke, hoejre", flangeLine: 16, breaks: { right: true } });
  addTemplateElement(elements, makeTemplateLine(origin, 0, -220, 0, 0, { name: "Stoedsamling", width: 1.1, layer: "steel" }));
  detailMember(elements, origin, -70, 0, 140, 400, { name: "Traesoejle 140 x 140", breaks: { bottom: true } });
  detailScrew(elements, origin, 14, -70, "WT12x300", 90, "WT 12 x 300 gennem bjaelke i soejle");
  detailLoadArrow(elements, origin, -150, -330, -150, -250);
  detailLoadArrow(elements, origin, 150, -330, 150, -250);
  detailLoadArrow(elements, origin, 0, 500, 0, 425);
  detailTitle(elements, origin, 0, 560, "BJAELKE BAERER PAA TRAESOEJLE", "13-5");
  return elements;
}

/* 13-6 -- the beam lands on the column through a steel angle. */
function buildBearingAngleDetail(origin = centerPoint()) {
  const elements = [];
  detailMember(elements, origin, -140, 0, 140, 400, { name: "Traesoejle 140 x 140", breaks: { bottom: true } });
  detailMember(elements, origin, 0, -216, 420, 200, { material: "steel", name: "Staalbjaelke", flangeLine: 14, breaks: { right: true } });
  addTemplateElement(elements, makeTemplateRect(origin, -95, -16, 95, 16, {
    name: "Vinkelbeslag, vandret ben", material: "S355", fill: DETAIL_STEEL, width: 1, layer: "steel",
  }));
  addTemplateElement(elements, makeTemplateRect(origin, -14, -216, 14, 200, {
    name: "Vinkelbeslag, lodret ben", material: "S355", fill: DETAIL_STEEL, width: 1, layer: "steel",
  }));
  detailHidden(elements, origin, -95, -8, -14, -8, "Vinkel, skjult bagkant");
  detailScrew(elements, origin, -55, 34, "CS10x100", 90, "CS 10 x 100 gennem vinkel i soejle");
  detailLoadArrow(elements, origin, 210, -320, 210, -235);
  detailLoadArrow(elements, origin, -70, 500, -70, 425);
  detailTitle(elements, origin, 60, 560, "BJAELKE PAA SOEJLE MED VINKEL", "13-6");
  return elements;
}

/* 13-7 -- the beam hangs off its top flange, which is what bears. */
function buildTopFlangeBearingDetail(origin = centerPoint()) {
  const elements = [];
  detailMember(elements, origin, -140, 0, 140, 400, { name: "Traesoejle 140 x 140", breaks: { bottom: true } });
  addTemplateElement(elements, makeTemplateRect(origin, -110, -16, 530, 16, {
    name: "Overflange baerer paa soejletop", material: "S355", fill: DETAIL_STEEL, width: 1, layer: "steel",
  }));
  detailMember(elements, origin, 0, 0, 420, 184, { material: "steel", name: "Staalbjaelke, krop og underflange", flangeLine: 168, breaks: { right: true } });
  detailHiddenRect(elements, origin, -110, 0, 110, 184, "Bjaelkeende skjult bag soejle");
  detailHidden(elements, origin, -110, 92, 0, 92, "Skjult kropslinje");
  detailScrew(elements, origin, -55, 34, "CS10x100", 90, "CS 10 x 100 gennem overflange i soejle");
  detailLoadArrow(elements, origin, 210, -320, 210, -235);
  detailLoadArrow(elements, origin, -70, 500, -70, 425);
  detailTitle(elements, origin, 60, 560, "OVERFLANGE BAERER PAA TRAESOEJLE", "13-7");
  return elements;
}

/* 9-11 -- steel seat and knife plates: the load goes through the steel. */
function buildKnifePlateSeatDetail(origin = centerPoint()) {
  const elements = [];
  detailMember(elements, origin, -170, -250, 170, 680, { name: "Traesoejle 170 x 170", breaks: { bottom: true } });
  detailMember(elements, origin, 0, -250, 430, 240, { name: "Traebjaelke", breaks: { right: true } });
  addTemplateElement(elements, makeTemplateRect(origin, -8, -10, 104, 14, {
    name: "Staalkonsol / oplaeg", material: "S355", fill: DETAIL_STEEL, width: 1, layer: "steel",
  }));
  addTemplateElement(elements, makeTemplateRect(origin, -22, -250, 14, 254, {
    name: "Staalplade mod soejle", material: "S355", fill: DETAIL_STEEL, width: 1, layer: "steel",
  }));
  detailHiddenRect(elements, origin, 0, -240, 150, 230, "Knivplade i slids");
  detailHidden(elements, origin, 0, -250, 96, -140, "Slids for knivplade");
  detailHidden(elements, origin, 96, -140, 96, -10, "Knivplade, bagkant");
  detailScrew(elements, origin, -60, -150, "WT10x200", 90, "WT 10 x 200 fra soejletop og ned");
  detailBoltHead(elements, origin, 78, -120, "M16", "M16 bolt gennem bjaelke og knivplade");
  detailLoadArrow(elements, origin, 150, -360, 150, -280);
  detailLoadArrow(elements, origin, -85, 500, -85, 440);
  detailTitle(elements, origin, 120, 560, "BJAELKE PAA STAALKONSOL MED KNIVPLADER", "9-11");
  return elements;
}

/* 9-7 -- beams bear on girder blocks fixed to a notched column. */
function buildNotchedColumnGirderDetail(origin = centerPoint()) {
  const elements = [];
  detailMember(elements, origin, -520, -300, 480, 220, { name: "Bjaelke, venstre", breaks: { left: true } });
  detailMember(elements, origin, 40, -300, 480, 220, { name: "Bjaelke, hoejre", breaks: { right: true } });
  detailMember(elements, origin, -35, -300, 70, 730, { name: "Soejletunge, gennemgaaende", breaks: { bottom: true } });
  detailMember(elements, origin, -175, -80, 140, 180, { fill: DETAIL_TIMBER_DARK, name: "Vederlagsklods, venstre" });
  detailMember(elements, origin, 35, -80, 140, 180, { fill: DETAIL_TIMBER_DARK, name: "Vederlagsklods, hoejre" });
  detailScrew(elements, origin, -105, -200, "WT10x200", 90, "WT 10 x 200 gennem bjaelke i klods");
  detailScrew(elements, origin, 105, -200, "WT10x200", 90, "WT 10 x 200 gennem bjaelke i klods");
  detailScrew(elements, origin, -95, -30, "WT8x160", 0, "WT 8 x 160 gennem klods i soejle");
  detailScrew(elements, origin, 95, 45, "WT8x160", 180, "WT 8 x 160 gennem klods i soejle");
  detailLoadArrow(elements, origin, -280, -420, -280, -330);
  detailLoadArrow(elements, origin, 280, -420, 280, -330);
  detailLoadArrow(elements, origin, 0, 520, 0, 450);
  detailTitle(elements, origin, 0, 600, "BJAELKER PAA KLODSER VED UDSKAARET SOEJLE", "9-7");
  return elements;
}

/* 15-3 -- column on a standoff, held down into the slab. */
function buildStandoffBaseDetail(origin = centerPoint()) {
  const elements = [];
  detailMember(elements, origin, -420, 120, 840, 200, { material: "concrete", name: "Betondaek", breaks: { left: true, right: true } });
  addTemplateElement(elements, makeTemplateLine(origin, -420, 120, 420, 120, { name: "Overside beton", width: 1.5, layer: "masonry" }));
  detailMember(elements, origin, -90, -320, 180, 324, { name: "Traesoejle 180 x 180", breaks: { top: true } });
  addTemplateElement(elements, makeTemplateRect(origin, -95, 4, 190, 16, {
    name: "Trykplade under soejle", material: "S355", fill: DETAIL_STEEL, width: 1, layer: "steel",
  }));
  addTemplateElement(elements, makeTemplateRect(origin, -35, 20, 70, 80, {
    name: "Standoff", material: "S355", fill: DETAIL_STEEL, width: 1, layer: "steel",
  }));
  addTemplateElement(elements, makeTemplateRect(origin, -110, 100, 220, 20, {
    name: "Fodplade", material: "S355", fill: DETAIL_STEEL, width: 1, layer: "steel",
  }));
  detailHidden(elements, origin, -75, 120, -75, 260, "Ankerbolt i beton");
  detailHidden(elements, origin, -63, 120, -63, 260, "Ankerbolt i beton");
  detailHidden(elements, origin, 63, 120, 63, 260, "Ankerbolt i beton");
  detailHidden(elements, origin, 75, 120, 75, 260, "Ankerbolt i beton");
  detailHidden(elements, origin, -80, 255, -58, 255, "Forankring, ende");
  detailHidden(elements, origin, 58, 255, 80, 255, "Forankring, ende");
  detailBoltHead(elements, origin, -69, 110, "M16", "M16 ankerbolt");
  detailBoltHead(elements, origin, 69, 110, "M16", "M16 ankerbolt");
  detailBolt(elements, origin, -120, -150, "M12", 0, { length: 240, threadLength: 90, extension: 10, name: "M12 gennemgaaende bolt i soejle" });
  detailLoadArrow(elements, origin, 0, -470, 0, -385);
  detailLoadArrow(elements, origin, 0, 420, 0, 340);
  detailTitle(elements, origin, 0, 480, "SOEJLEFOD PAA STANDOFF I BETON", "15-3");
  return elements;
}

const bearingDetailTemplates = {
  insertBearingOnColumn: { build: buildBearingOnColumnDetail, label: "Bjaelke paa traesoejle" },
  insertBearingAngle: { build: buildBearingAngleDetail, label: "Bjaelke paa soejle med vinkel" },
  insertTopFlangeBearing: { build: buildTopFlangeBearingDetail, label: "Overflange paa traesoejle" },
  insertKnifePlateSeat: { build: buildKnifePlateSeatDetail, label: "Staalkonsol med knivplader" },
  insertNotchedColumnGirder: { build: buildNotchedColumnGirderDetail, label: "Klodser ved udskaaret soejle" },
  insertStandoffBase: { build: buildStandoffBaseDetail, label: "Soejlefod paa standoff" },
};

function insertBearingDetail(key) {
  const entry = bearingDetailTemplates[key];
  if (!entry) return;
  pushHistory();
  const elements = entry.build(centerPoint());
  elements.forEach((element) => drawingLayer.append(element));
  clearSelection();
  elements.forEach(addToSelection);
  setActiveTool("select");
  /* A whole detail is around a metre across, which is wider than the default
     view at 1:10 -- inserted without this you land inside the middle of it and
     see a slab of timber rather than the detail. Frame what was just added. */
  const box = selectionBounds();
  if (box) fitBox(box, 0.12);
  pushHistory();
  statusText.textContent = entry.label + ": " + elements.length + " redigerbare elementer indsat.";
}

function insertTrussTemplate() {
  pushHistory();
  const elements = buildTrussConnectionTemplateElements(centerPoint());
  elements.forEach((element) => drawingLayer.append(element));
  clearSelection();
  elements.forEach(addToSelection);
  setActiveTool("select");
  pushHistory();
  statusText.textContent = `${elements.length} redigerbare detail-elementer indsat.`;
}

function insertBeamColumnTemplate() {
  pushHistory();
  const elements = buildBeamColumnConnectionTemplateElements(centerPoint());
  elements.forEach((element) => drawingLayer.append(element));
  clearSelection();
  elements.forEach(addToSelection);
  setActiveTool("select");
  pushHistory();
  statusText.textContent = `${elements.length} redigerbare beam-column elementer indsat.`;
}

function insertPolishedConnectionTemplate() {
  pushHistory();
  if (!drawingLayer.querySelector('[data-type="sheetFrame"]')) {
    drawingLayer.prepend(makeSheetFrame());
  }
  const elements = buildPolishedConnectionDetailElements(centerPoint());
  elements.forEach((element) => drawingLayer.append(element));
  clearSelection();
  elements.forEach(addToSelection);
  setActiveTool("select");
  pushHistory();
  statusText.textContent = `${elements.length} elementer indsat som flot Simpson/timber samlingsdetalje.`;
}

function placementLabel() {
  if (!placementState) return "";
  if (placementState.kind === "object") return placementState.label || "Objekt";
  if (placementState.kind === "profile") return profileCatalog[profileSelect.value]?.name || profileSelect.value;
  if (placementState.kind === "bolt") return `${boltSelect.value} ${boltGrade.value}`;
  if (placementState.kind === "screw") return screwByKey(selectedScrewKey()).screw.name;
  return "Kopi";
}

function makePlacementElement(point) {
  /* A placement that carries its own factory can be anything -- a timber
     member, a library component, a symbol, a whole detail template. Before
     this, only bolts, screws and profiles got a ghost that follows the cursor;
     everything else was dropped at the centre of the viewport and had to be
     dragged into place. Three different insert behaviours inside one panel is
     the main reason modelling felt awkward. */
  if (placementState.kind === "object") return placementState.factory(point);
  if (placementState.kind === "profile") return makeProfileSymbol(profileSelect.value, point);
  if (placementState.kind === "bolt") return makeBoltSymbol(boltSelect.value, point);
  if (placementState.kind === "screw") return makeScrewSymbol(selectedScrewKey(), point, { view: screwViewSelect?.value || "side" });
  if (placementState.kind === "copy") {
    const group = createSvgElement("g");
    const dx = placementState.anchor ? point.x - placementState.anchor.x : 0;
    const dy = placementState.anchor ? point.y - placementState.anchor.y : 0;
    placementState.sourceHtml.forEach((html) => {
      const template = document.createElement("template");
      template.innerHTML = `<svg>${html}</svg>`;
      const clone = document.importNode(template.content.querySelector("svg").firstElementChild, true);
      clone.classList.remove("selected", "hovered");
      stripElementIds(clone);
      moveElement(clone, dx, dy);
      group.append(clone);
    });
    return group;
  }
  return null;
}

function setPlacementTransform(element, point, rotation = 0) {
  element.dataset.rotation = String(rotation);
  element.setAttribute("transform", `translate(${point.x} ${point.y}) rotate(${rotation})`);
}

function renderPlacementPreview(point) {
  if (!placementState) return;
  previewLayer.querySelectorAll(".placement-ghost, .placement-anchor").forEach((element) => element.remove());
  const preview = makePlacementElement(point);
  if (!preview) return;
  preview.classList.add("placement-ghost");
  preview.classList.remove("draw-item", "selected", "hovered");
  const rotation = placementState.anchor
    ? Math.atan2(point.y - placementState.anchor.y, point.x - placementState.anchor.x) * 180 / Math.PI + placementState.rotation
    : placementState.rotation;
  const placementPoint = placementState.anchor || point;
  setPlacementTransform(preview, placementPoint, rotation);
  previewLayer.append(preview);
  if (placementState.anchor) {
    previewLayer.append(createSvgElement("circle", {
      cx: placementState.anchor.x,
      cy: placementState.anchor.y,
      r: 5 / zoom,
      class: "placement-anchor",
    }));
  }
}

/* Arm any object for click-to-place. The factory receives the snapped point and
   returns a finished element, so the ghost, wheel/R rotation, snapping and Esc
   all come for free -- the behaviour bolts already had, for everything else. */
function beginObjectPlacement(factory, label) {
  cancelCurrentInteraction({ keepSelection: true });
  placementState = { kind: "object", rotation: 0, anchor: null, factory, label };
  setActiveTool("placeObject");
  statusText.textContent = `${label}: klik for at placere. Wheel/R roterer, Esc afslutter.`;
}

function beginCatalogPlacement(kind) {
  cancelCurrentInteraction({ keepSelection: true });
  placementState = { kind, rotation: 0, anchor: null };
  setActiveTool(kind === "profile" ? "placeProfile" : kind === "screw" ? "placeScrew" : "placeBolt");
  openPanel("components");
  if (kind === "profile") statusText.textContent = "Profil klar: klik indsats, peg retning, klik igen.";
  else if (kind === "screw") statusText.textContent = "Skrue klar: klik for at placere. Wheel/R roterer, Esc annullerer.";
  else statusText.textContent = "Bolt klar: klik for at placere. Fortsaet med flere bolte eller Esc.";
}

function finishPlacement(point, event = null) {
  if (!placementState) return;
  if (placementState.kind === "copy") {
    if (!placementState.anchor) {
      placementState.anchor = point;
      renderPlacementPreview(point);
      statusText.textContent = "Flyt kopien til ny placering og klik.";
      return;
    }
    const dx = point.x - placementState.anchor.x;
    const dy = point.y - placementState.anchor.y;
    pushHistory();
    const clones = placementState.sourceHtml.map((html) => {
      const template = document.createElement("template");
      template.innerHTML = `<svg>${html}</svg>`;
      const clone = document.importNode(template.content.querySelector("svg").firstElementChild, true);
      clone.classList.remove("selected", "hovered");
      stripElementIds(clone);
      moveElement(clone, dx, dy);
      drawingLayer.append(clone);
      return clone;
    });
    clearSelection();
    clones.forEach(addToSelection);
    pushHistory();
    lastOperation = { type: "copy-reference", dx, dy };
    cancelPlacement();
    statusText.textContent = `${clones.length} elementer kopieret fra referencepunkt.`;
    return;
  }

  if (placementState.kind === "profile" && !placementState.anchor) {
    placementState.anchor = point;
    renderPlacementPreview(point);
    statusText.textContent = "Peg retningen for profilen. R drejer 90 grader, Esc annullerer.";
    return;
  }

  const element = makePlacementElement(placementState.anchor || point);
  if (!element) return;
  const rotation = placementState.anchor
    ? Math.atan2(point.y - placementState.anchor.y, point.x - placementState.anchor.x) * 180 / Math.PI + placementState.rotation
    : placementState.rotation;
  placementState.rotation = rotation;
  setPlacementTransform(element, placementState.anchor || point, rotation);
  pushHistory();
  drawingLayer.append(element);
  selectOnly(element);
  pushHistory();
  lastOperation = { type: "place", kind: placementState.kind, label: placementLabel() };
  placementState.anchor = null;
  renderPlacementPreview(point);
  statusText.textContent = `${placementLabel()} placeret. Klik videre eller Esc for at stoppe.`;
  if (event?.altKey) cancelPlacement();
}

function cancelPlacement() {
  placementState = null;
  previewLayer.querySelectorAll(".placement-ghost, .placement-anchor").forEach((element) => element.remove());
  showSnapMarker(null);
  setActiveTool("select");
  statusText.textContent = "Placering annulleret.";
}

function beginCopyWithReference() {
  if (!selectedElements.size) return;
  placementState = {
    kind: "copy",
    rotation: 0,
    anchor: null,
    sourceHtml: Array.from(selectedElements).map((element) => element.outerHTML),
  };
  setActiveTool("copyReference");
  statusText.textContent = "Klik basepunkt for kopien.";
}

function insertProfile() {
  beginCatalogPlacement("profile");
}

function insertBolt() {
  beginCatalogPlacement("bolt");
}

function insertScrew() {
  beginCatalogPlacement("screw");
}

function insertBoltSide() {
  const bolt = makeBoltSideSymbol(boltSelect.value, centerPoint(), boltUiOptions());
  pushHistory();
  drawingLayer.append(bolt);
  selectOnly(bolt);
  setActiveTool("select");
  statusText.textContent = `${boltSelect.value} side-view bolt indsat.`;
  pushHistory();
}

function populateScrewFamilies() {
  if (!screwFamilySelect || !screwSelect) return;
  screwFamilySelect.innerHTML = "";
  Object.entries(screwCatalog).forEach(([key, family]) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = family.name;
    screwFamilySelect.append(option);
  });
  screwFamilySelect.value = "connector";
  populateScrewSizes();
}

function populateScrewSizes() {
  if (!screwFamilySelect || !screwSelect) return;
  const family = selectedScrewFamily();
  const previous = screwSelect.value;
  screwSelect.innerHTML = "";
  Object.entries(family.items).forEach(([key, screw]) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = screw.name;
    screwSelect.append(option);
  });
  if (family.items[previous]) screwSelect.value = previous;
}

async function renderPdfPage() {
  if (!pdfDocument) return;
  underlayState.page = Number(pdfPageSelect.value || 1);
  underlayState.rotation = Number(pdfRotation.value || 0);
  const page = await pdfDocument.getPage(underlayState.page);
  const base = page.getViewport({ scale: 1, rotation: underlayState.rotation });
  underlayState.pageWidthPt = base.width;
  underlayState.pageHeightPt = base.height;
  underlayState.placement = underlayPlacementForPage(base.width, base.height, underlayState.drawingScale);
  underlayState.basePlacement = { ...underlayState.placement };
  underlayScale.value = "100";
  underlayScaleValue.textContent = "100%";
  underlayRasterScale = 0;
  underlayRasterRect = null;
  updateUnderlayScaleLabel();
  await renderUnderlayRegion(true);
  statusText.textContent = `PDF-side ${underlayState.page} placeret i 1:${underlayState.drawingScale}.`;
  pushHistory();
}

const pdfWorkerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

async function importPdfFile(file) {
  if (!window.pdfjsLib) {
    showAlert("PDF kunne ikke indlaeses", "PDF.js blev ikke hentet. Tjek internetforbindelsen og proev igen.");
    return;
  }
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
  currentPdfBytes = await file.arrayBuffer();
  pdfDocument = await window.pdfjsLib.getDocument({ data: currentPdfBytes.slice(0) }).promise;

  const firstPage = await pdfDocument.getPage(1);
  const base = firstPage.getViewport({ scale: 1, rotation: 0 });
  const drawingScale = await askUnderlayScale(base.width, base.height);
  if (drawingScale === null) {
    pdfDocument = null;
    currentPdfBytes = null;
    return;
  }

  clearUnderlay();
  underlayState.kind = "pdf";
  underlayState.name = file.name;
  underlayState.page = 1;
  underlayState.pageCount = pdfDocument.numPages;
  underlayState.rotation = 0;
  underlayState.drawingScale = drawingScale;
  underlayState.sourceKey = `underlay-${Date.now().toString(36)}`;
  await assetPut(underlayState.sourceKey, currentPdfBytes);
  populatePdfPages();
  await renderPdfPage();
}

function importPlanFile(file) {
  if (!file) return;
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    pushHistory();
    importPdfFile(file);
    return;
  }
  pushHistory();
  pdfDocument = null;
  currentPdfBytes = null;
  pdfControls.hidden = true;
  const reader = new FileReader();
  reader.onload = async () => {
    clearUnderlay();
    underlayState.kind = "image";
    underlayState.name = file.name;
    underlayState.drawingScale = 1;
    underlayState.placement = underlayBox();
    underlayState.basePlacement = { ...underlayState.placement };
    underlayState.sourceKey = `underlay-${Date.now().toString(36)}`;
    await assetPut(underlayState.sourceKey, reader.result);
    setImageUnderlayFromDataUrl(reader.result);
    updateUnderlayScaleLabel();
    statusText.textContent = "Billede importeret som underlag. Brug Kalibrer (K) for at saette maalestok.";
    pushHistory();
  };
  reader.readAsDataURL(file);
}

function updatePreview(end) {
  if (activeTool === "polyline") {
    if (polylineDraftActive()) renderPolylineDraft(end);
    return;
  }
  clearPreview();
  if (!startPoint) return;

  if (activeTool === "line") previewElement = makeLine(startPoint, end);
  if (activeTool === "arrow") previewElement = makeArrow(startPoint, end);
  if (activeTool === "loadArrow") previewElement = makeLoadArrow(startPoint, end);
  if (activeTool === "leader") previewElement = makeLeader(startPoint, end, "NOTE");
  if (activeTool === "weld") previewElement = makeWeld(startPoint, end);
  if (activeTool === "breakLine") previewElement = makeBreakLine(startPoint, end);
  if (activeTool === "calibrate") previewElement = makeLine(startPoint, end);
  if (activeTool === "measure") previewElement = makeMeasure(startPoint, end);
  if (activeTool === "rect") previewElement = makeRect(startPoint, end);
  if (activeTool === "hatch") previewElement = makeHatch(startPoint, end);
  if (activeTool === "circle") previewElement = makeCircle(startPoint, end);

  if (previewElement) {
    previewElement.setAttribute("opacity", "0.68");
    previewLayer.append(previewElement);
  }
}

async function finishShape(end) {
  /* This operation is over, so its anchor goes. The polyline chain re-arms and
     re-shows one afterwards; every other tool ends without a mark left behind. */
  clearDrawAnchor();
  let element = null;
  const origin = startPoint;
  const drawDistance = Math.hypot(end.x - origin.x, end.y - origin.y);
  if (activeTool === "calibrate") {
    startPoint = null;
    clearPreview();
    setActiveTool("select");
    if (drawDistance <= 0) return;
    const answer = await showPrompt("Kalibrer skala", "Kendt afstand [mm]", "2400", {
      type: "number",
      description: "Skriv den virkelige laengde af den streg du lige trak.",
    });
    const known = Number(answer);
    if (known > 0) {
      setScaleValue(known / drawDistance, "Kalibreret");
      statusText.textContent = `Skala kalibreret: 1 enhed = ${(known / drawDistance).toFixed(3)} mm.`;
    }
    return;
  }
  if (drawDistance < 3 / zoom) {
    startPoint = null;
    clearPreview();
    statusText.textContent = "Klik og traek for at tegne.";
    return;
  }
  if (activeTool === "line") element = makeLine(origin, end);
  if (activeTool === "arrow") element = makeArrow(origin, end);
  if (activeTool === "loadArrow") element = makeLoadArrow(origin, end);
  if (activeTool === "leader") {
    const taggedElement = topElementAtPoint(origin);
    startPoint = null;
    clearPreview();
    const label = await showPrompt("Leader note", "Tekst", taggedElement ? tagForElement(taggedElement) : "203 x 133 x 25 UB TRUSS");
    if (!label) return;
    element = makeLeader(origin, end, label);
    if (taggedElement) {
      element.dataset.tagSourceType = taggedElement.dataset.type || "";
      element.dataset.tagSource = describeElement(taggedElement);
    }
    pushHistory();
    drawingLayer.append(element);
    selectOnly(element);
    pushHistory();
    return;
  }
  if (activeTool === "weld") element = makeWeld(origin, end);
  if (activeTool === "breakLine") element = makeBreakLine(origin, end);
  if (activeTool === "measure") element = makeMeasure(origin, end);
  if (activeTool === "rect") element = makeRect(origin, end);
  if (activeTool === "hatch") element = makeHatch(origin, end);
  if (activeTool === "circle") element = makeCircle(origin, end);

  if (element) {
    pushHistory();
    drawingLayer.append(element);
    selectOnly(element);
    pushHistory();
  }
  startPoint = null;
  clearPreview();
}

function moveElement(element, dx, dy) {
  invalidateGeometry();
  const transform = element.transform.baseVal.consolidate();
  const matrix = transform ? transform.matrix : svg.createSVGMatrix();
  matrix.e += dx;
  matrix.f += dy;
  const svgTransform = svg.createSVGTransformFromMatrix(matrix);
  element.transform.baseVal.initialize(svgTransform);
}

function moveSelection(dx, dy) {
  selectedElements.forEach((element) => moveElement(element, dx, dy));
}

function makeRectFromPoints(a, b) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

function rectsIntersect(a, b) {
  return a.x <= b.x + b.width &&
    a.x + a.width >= b.x &&
    a.y <= b.y + b.height &&
    a.y + a.height >= b.y;
}

function pointInRect(point, rect, tolerance = 0) {
  return point.x >= rect.x - tolerance &&
    point.x <= rect.x + rect.width + tolerance &&
    point.y >= rect.y - tolerance &&
    point.y <= rect.y + rect.height + tolerance;
}

function isPassiveHitTarget(element) {
  return ["sheetFrame", "detailViewport"].includes(element?.dataset.type);
}

function topElementAtPoint(point, tolerance = 4 / zoom, options = {}) {
  return Array.from(drawingLayer.querySelectorAll(".draw-item"))
    .reverse()
    .find((element) => {
      if (isElementLocked(element) || element.style.display === "none") return false;
      if (options.skipPassive !== false && isPassiveHitTarget(element)) return false;
      return pointInRect(point, getElementBounds(element), tolerance);
    });
}

function pickTolerance(base = 10) {
  return isDrawingTool() || isPlacementTool() ? 2 : base;
}

function hitTestDrawItem(event, tolerancePx = 10) {
  const directTarget = event.target.closest?.(".draw-item");
  if (directTarget && !isElementLocked(directTarget) && directTarget.style.display !== "none") return directTarget;
  const point = svgPointFromScreen(event.clientX, event.clientY);
  return topElementAtPoint(point, tolerancePx / zoom, { skipPassive: true });
}

function setHoveredElement(element) {
  const nextElement = element && !isElementLocked(element) ? element : null;
  if (hoveredElement === nextElement) return;
  if (hoveredElement) hoveredElement.classList.remove("hovered");
  hoveredElement = nextElement;
  if (hoveredElement) hoveredElement.classList.add("hovered");
}

function updateHoverFromEvent(event) {
  if (panState || gripState || placementState || dragState || marqueeState || startPoint) return;
  setHoveredElement(hitTestDrawItem(event, pickTolerance(10)));
}

/* --- Status bar readouts ------------------------------------------------- */
const cursorReadout = document.getElementById("cursorReadout");
const lengthReadout = document.getElementById("lengthReadout");
const snapReadout = document.getElementById("snapReadout");

function formatReadout(value) {
  const mm = value * getScaleValue();
  return Math.abs(mm) >= 1000 ? `${(mm / 1000).toFixed(3)} m` : `${Math.round(mm)} mm`;
}

function updateCursorReadout(point) {
  if (!cursorReadout) return;
  cursorReadout.textContent = `${Math.round(point.x * getScaleValue())}, ${Math.round(point.y * getScaleValue())} mm`;
}

function updateLengthReadout(from, to) {
  if (!lengthReadout) return;
  if (numericEntryActive()) { renderNumericEntry(); return; }
  lengthReadout.classList.remove("typed");
  if (!from || !to) {
    lengthReadout.hidden = true;
    return;
  }
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  lengthReadout.hidden = false;
  lengthReadout.textContent = `${formatReadout(Math.hypot(dx, dy))} · ${angle.toFixed(1)}°`;
}


/* --- Dynamic numeric entry ------------------------------------------------
   A detailer states a dimension; they do not drag until the readout happens to
   agree. While a drawing operation is armed, digits are captured into the
   length/angle chip instead of firing tool shortcuts: type 2400, Enter. Tab
   moves between length and angle, so `2400 Tab 30 Enter` draws 2400 mm at 30
   degrees. Whichever field is left empty keeps following the cursor, which is
   what makes "lock the length, point the direction" work.

   This is deliberately not a command line -- there is no parser and no command
   vocabulary. It is transient entry attached to the operation already running,
   and it disappears the moment that operation commits or is cancelled. */
let numericEntry = null;   /* { field: "length"|"angle", length: str, angle: str } */
let lastDrawPoint = null;  /* last snapped cursor point while a draw is armed */

function numericEntryActive() {
  return Boolean(numericEntry && startPoint);
}

function clearNumericEntry() {
  numericEntry = null;
  lengthReadout?.classList.remove("typed");
}

/* The point the armed operation should commit to, given what has been typed.
   An empty field falls back to the live cursor value. */
function numericEntryPoint() {
  if (!startPoint) return null;
  const reference = lastDrawPoint || startPoint;
  const dx = reference.x - startPoint.x;
  const dy = reference.y - startPoint.y;
  const typedLength = parseFloat(String(numericEntry?.length ?? "").replace(",", "."));
  const typedAngle = parseFloat(String(numericEntry?.angle ?? "").replace(",", "."));
  const length = Number.isFinite(typedLength) ? mmToDrawing(typedLength) : Math.hypot(dx, dy);
  const angle = Number.isFinite(typedAngle) ? (typedAngle * Math.PI) / 180 : Math.atan2(dy, dx);
  return { x: startPoint.x + Math.cos(angle) * length, y: startPoint.y + Math.sin(angle) * length };
}

function renderNumericEntry() {
  if (!lengthReadout || !numericEntryActive()) return;
  const point = numericEntryPoint();
  const dx = point.x - startPoint.x;
  const dy = point.y - startPoint.y;
  const caret = (field) => (numericEntry.field === field ? "│" : "");
  const lengthText = numericEntry.length !== ""
    ? `${numericEntry.length}${caret("length")} mm`
    : `${formatReadout(Math.hypot(dx, dy))}${caret("length")}`;
  const angleText = numericEntry.angle !== ""
    ? `${numericEntry.angle}${caret("angle")}°`
    : `${((Math.atan2(dy, dx) * 180) / Math.PI).toFixed(1)}${caret("angle")}°`;
  lengthReadout.hidden = false;
  lengthReadout.classList.add("typed");
  lengthReadout.textContent = `${lengthText} · ${angleText}`;
}

function applyNumericEntry() {
  const point = numericEntryPoint();
  if (point) updatePreview(point);
  renderNumericEntry();
}

/* Returns true when the key belonged to numeric entry and must not fall
   through to the tool shortcuts. */
function handleNumericEntryKey(event) {
  if (!startPoint) return false;
  const key = event.key;

  if (/^[0-9]$/.test(key) || key === "." || key === ",") {
    if (!numericEntry) numericEntry = { field: "length", length: "", angle: "" };
    numericEntry[numericEntry.field] += key === "," ? "." : key;
    event.preventDefault();
    applyNumericEntry();
    return true;
  }
  if (!numericEntry) return false;

  if (key === "Backspace") {
    numericEntry[numericEntry.field] = numericEntry[numericEntry.field].slice(0, -1);
    event.preventDefault();
    applyNumericEntry();
    return true;
  }
  if (key === "Tab") {
    numericEntry.field = numericEntry.field === "length" ? "angle" : "length";
    event.preventDefault();
    applyNumericEntry();
    return true;
  }
  if (key === "-" && numericEntry.field === "angle") {
    numericEntry.angle = numericEntry.angle.startsWith("-")
      ? numericEntry.angle.slice(1)
      : `-${numericEntry.angle}`;
    event.preventDefault();
    applyNumericEntry();
    return true;
  }
  if (key === "Enter") {
    const point = numericEntryPoint();
    clearNumericEntry();
    event.preventDefault();
    if (point) finishShape(point);
    updateLengthReadout(null, null);
    return true;
  }
  /* Escape drops back to the mouse without abandoning the operation itself --
     the second Escape is what cancels the draw. */
  if (key === "Escape") {
    clearNumericEntry();
    event.preventDefault();
    if (lastDrawPoint) updatePreview(lastDrawPoint);
    updateLengthReadout(startPoint, lastDrawPoint);
    return true;
  }
  return false;
}

function updateSnapReadout() {
  if (!snapReadout) return;
  const enabled = snapToggle.checked;
  snapReadout.classList.toggle("off", !enabled);
  snapReadout.classList.toggle("hit", Boolean(enabled && activeSnapKind && activeSnapKind !== "grid"));
  snapReadout.textContent = !enabled
    ? "Snap fra"
    : activeSnapKind && snapKindLabel[activeSnapKind]
      ? snapKindLabel[activeSnapKind]
      : "Snap";
}

function svgPointFromScreen(x, y) {
  const point = svg.createSVGPoint();
  point.x = x;
  point.y = y;
  return point.matrixTransform(svg.getScreenCTM().inverse());
}

function getElementBounds(element) {
  const cached = boundsCache.get(element);
  if (cached && cached.epoch === boundsEpoch) return cached.box;
  const bounds = element.getBoundingClientRect();
  const p1 = svgPointFromScreen(bounds.left, bounds.top);
  const p2 = svgPointFromScreen(bounds.right, bounds.bottom);
  const box = makeRectFromPoints(p1, p2);
  boundsCache.set(element, { epoch: boundsEpoch, box });
  return box;
}

function isElementLocked(element) {
  return element?.dataset.locked === "true" || isLayerLocked(elementLayer(element));
}

/* Types whose geometry is dimensional data rather than free drawing. */
const CATALOGUE_TYPES = new Set([
  "profile", "bolt", "boltSide", "screw", "timber",
  "manufacturerComponent", "connection",
]);
/* fastenerMarker is deliberately NOT here: it has no registered render step, so
   taking its grips away would leave it with no way to be edited at all. */

function gripPointsFor(element) {
  const type = element.dataset.type;
  if (["line", "measure", "arrow", "loadArrow", "leader", "weld", "breakLine", "profileMember"].includes(type)) {
    const transform = element.transform?.baseVal?.consolidate();
    const dx = transform ? transform.matrix.e : 0;
    const dy = transform ? transform.matrix.f : 0;
    const start = type === "line"
      ? { x: Number(element.getAttribute("x1")), y: Number(element.getAttribute("y1")) }
      : { x: Number(element.dataset.startX), y: Number(element.dataset.startY) };
    const end = type === "line"
      ? { x: Number(element.getAttribute("x2")), y: Number(element.getAttribute("y2")) }
      : { x: Number(element.dataset.endX), y: Number(element.dataset.endY) };
    return [
      { role: "start", x: start.x + dx, y: start.y + dy },
      { role: "end", x: end.x + dx, y: end.y + dy },
    ];
  }
  /* Catalogue and manufacturer objects carry real dimensions -- an ABR9020 is
     70x70x55 mm, its hole count comes from the ETA, and its outline was traced
     from Simpson's own DXF. Corner grips applied a free non-uniform scale to
     that geometry while the object kept reporting its SKU, so a bracket
     squashed to 63% x 140% still exported as verified manufacturer geometry.
     These objects are re-specified through their properties, never stretched. */
  /* Catalogue objects are re-specified, never stretched -- but taking the grips
     away and offering nothing back left a stud editable only by typing into a
     text field. A registered parametric grip writes the parameter and
     re-renders, so a member can be dragged to length without its section
     growing with it. */
  const parametricGrips = defOf(element)?.grips;
  if (parametricGrips) {
    const points = parametricGrips(element);
    if (points && points.length) return points;
  }
  if (CATALOGUE_TYPES.has(type)) return [];

  const box = getElementBounds(element);
  if (box.width < 1 || box.height < 1) return [];
  return [
    { role: "resize-nw", x: box.x, y: box.y },
    { role: "resize-ne", x: box.x + box.width, y: box.y },
    { role: "resize-sw", x: box.x, y: box.y + box.height },
    { role: "resize-se", x: box.x + box.width, y: box.y + box.height },
  ];
}

function renderSelectionOverlay() {
  markUi("overlay");
}

function renderSelectionOverlayNow() {
  previewLayer.querySelectorAll(".selection-overlay").forEach((element) => element.remove());
  const elements = selectedArray();
  if (!elements.length || placementState) return;
  const overlay = createSvgElement("g", { class: "selection-overlay" });
  const box = selectionBounds(elements);
  if (box) {
    overlay.append(createSvgElement("rect", {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      class: "selection-box",
    }));
  }
  if (elements.length === 1 && !isElementLocked(elements[0])) {
    gripPointsFor(elements[0]).forEach((point) => {
      overlay.append(createSvgElement("circle", {
        cx: point.x,
        cy: point.y,
        r: 6 / zoom,
        class: `selection-grip ${point.role.startsWith("resize-") ? "resize-grip" : ""}`,
        "data-grip-role": point.role,
      }));
    });
  }
  previewLayer.append(overlay);
}

function resizeGripAnchor(box, role) {
  return {
    x: role.endsWith("w") ? box.x + box.width : box.x,
    y: role.includes("n") ? box.y + box.height : box.y,
  };
}

function resizeElementFromGrip(state, point, event = null) {
  invalidateGeometry();
  const { element, role, originalBox, originalMatrix } = state;
  const anchor = resizeGripAnchor(originalBox, role);
  const originalGrip = {
    x: role.endsWith("e") ? originalBox.x + originalBox.width : originalBox.x,
    y: role.includes("s") ? originalBox.y + originalBox.height : originalBox.y,
  };
  const baseWidth = Math.max(1, Math.abs(originalGrip.x - anchor.x));
  const baseHeight = Math.max(1, Math.abs(originalGrip.y - anchor.y));
  let sx = Math.max(0.05, Math.abs(point.x - anchor.x) / baseWidth);
  let sy = Math.max(0.05, Math.abs(point.y - anchor.y) / baseHeight);
  if (event?.shiftKey) {
    const uniform = Math.max(sx, sy);
    sx = uniform;
    sy = uniform;
  }
  const scale = svg.createSVGMatrix()
    .translate(anchor.x, anchor.y)
    .scaleNonUniform(sx, sy)
    .translate(-anchor.x, -anchor.y);
  const next = scale.multiply(originalMatrix);
  element.transform.baseVal.initialize(svg.createSVGTransformFromMatrix(next));
  element.dataset.scaleX = String(sx);
  element.dataset.scaleY = String(sy);
}

function updateGripTarget(element, role, point, event = null) {
  invalidateGeometry();
  if (role.startsWith("resize-")) {
    resizeElementFromGrip(gripState, point, event);
    renderSelectionOverlay();
    updatePropertyPanel();
    return;
  }
  if (role.startsWith("plate-")) {
    /* Distance from the plate centre to the cursor, in its own frame, doubled --
       so a corner drag sets length and width in millimetres and the hole grid
       simply re-centres on the new size. */
    const centre = pointInCanvasFromElement(element, 0, 0);
    const ax = pointInCanvasFromElement(element, 1, 0);
    const ay = pointInCanvasFromElement(element, 0, 1);
    const ux = ax.x - centre.x, uy = ax.y - centre.y;
    const vx = ay.x - centre.x, vy = ay.y - centre.y;
    const un = Math.hypot(ux, uy) || 1;
    const vn = Math.hypot(vx, vy) || 1;
    const localX = ((point.x - centre.x) * ux + (point.y - centre.y) * uy) / un;
    const localY = ((point.x - centre.x) * vx + (point.y - centre.y) * vy) / vn;
    element.dataset.lengthMm = String(Math.max(20, Math.round(Math.abs(localX) * 2 * getScaleValue())));
    element.dataset.widthMm = String(Math.max(20, Math.round(Math.abs(localY) * 2 * getScaleValue())));
    renderObject(element);
    statusText.textContent = `Plade ${element.dataset.lengthMm} \u00d7 ${element.dataset.widthMm} mm.`;
    renderSelectionOverlay();
    updatePropertyPanel();
    return;
  }

  if (role.startsWith("vertex-")) {
    const index = Number(role.slice(7));
    const points = polylinePoints(element);
    if (points[index]) {
      points[index] = [point.x, point.y];
      setPolylinePoints(element, points);
      renderPolyline(element);
      statusText.textContent = `Punkt ${index + 1} flyttet.`;
      renderSelectionOverlay();
      updatePropertyPanel();
    }
    return;
  }

  if (role === "bolt-length") {
    /* Measured along the bolt's own axis from the bearing face, so dragging
       sideways does not shorten it. Never below one diameter -- a bolt shorter
       than its own head is not a drawing, it is a glitch. */
    const bolt = boltCatalog[element.dataset.bolt] || boltCatalog.M16;
    const origin = pointInCanvasFromElement(element, 0, 0);
    const axis = pointInCanvasFromElement(element, 1, 0);
    const ux = axis.x - origin.x;
    const uy = axis.y - origin.y;
    const norm = Math.hypot(ux, uy) || 1;
    const along = ((point.x - origin.x) * ux + (point.y - origin.y) * uy) / norm;
    const lengthMm = Math.max(bolt.d, Math.round(along * getScaleValue()));
    element.dataset.lengthMm = String(lengthMm);
    renderObject(element);
    statusText.textContent = `Boltlaengde ${lengthMm} mm.`;
    renderSelectionOverlay();
    updatePropertyPanel();
    return;
  }

  const type = element.dataset.type;
  if (type === "line") {
    element.setAttribute(role === "start" ? "x1" : "x2", point.x);
    element.setAttribute(role === "start" ? "y1" : "y2", point.y);
  }
  if (type === "measure" || type === "arrow" || type === "loadArrow" || type === "leader" || type === "weld" || type === "breakLine" || type === "profileMember") {
    element.dataset[role === "start" ? "startX" : "endX"] = String(point.x);
    element.dataset[role === "start" ? "startY" : "endY"] = String(point.y);
    if (type === "measure") renderMeasure(element);
    else if (type === "leader") renderLeader(element);
    else if (type === "breakLine") renderBreakLine(element);
    else if (type === "weld") renderWeld(element);
    else if (type === "profileMember") renderTemplateProfileMember(element);
    else renderArrow(element);
  }
  renderSelectionOverlay();
  updatePropertyPanel();
}

function bakeEditableTransform(element) {
  invalidateGeometry();
  const transform = element.transform?.baseVal?.consolidate();
  if (!transform) return;
  const dx = transform.matrix.e;
  const dy = transform.matrix.f;
  if (!dx && !dy) return;
  const type = element.dataset.type;
  if (type === "line") {
    element.setAttribute("x1", Number(element.getAttribute("x1")) + dx);
    element.setAttribute("y1", Number(element.getAttribute("y1")) + dy);
    element.setAttribute("x2", Number(element.getAttribute("x2")) + dx);
    element.setAttribute("y2", Number(element.getAttribute("y2")) + dy);
    element.removeAttribute("transform");
  }
  if (type === "polyline") {
    setPolylinePoints(element, polylinePoints(element).map(([x, y]) => [x + dx, y + dy]));
    element.removeAttribute("transform");
    renderPolyline(element);
  }
  if (["measure", "arrow", "loadArrow", "leader", "weld", "breakLine", "profileMember"].includes(type)) {
    element.dataset.startX = String(Number(element.dataset.startX) + dx);
    element.dataset.startY = String(Number(element.dataset.startY) + dy);
    element.dataset.endX = String(Number(element.dataset.endX) + dx);
    element.dataset.endY = String(Number(element.dataset.endY) + dy);
    element.removeAttribute("transform");
    if (type === "measure") renderMeasure(element);
    else if (type === "leader") renderLeader(element);
    else if (type === "breakLine") renderBreakLine(element);
    else if (type === "weld") renderWeld(element);
    else if (type === "profileMember") renderTemplateProfileMember(element);
    else renderArrow(element);
  }
}

function beginGripDrag(event, grip) {
  const element = getSelectedPrimary();
  if (!element || isElementLocked(element)) return false;
  event.preventDefault();
  pushHistory();
  const role = grip.dataset.gripRole;
  if (!role.startsWith("resize-")) bakeEditableTransform(element);
  const transform = element.transform?.baseVal?.consolidate();
  gripState = {
    element,
    role,
    originalBox: getElementBounds(element),
    originalMatrix: transform ? transform.matrix : svg.createSVGMatrix(),
  };
  svg.setPointerCapture(event.pointerId);
  statusText.textContent = role.startsWith("resize-")
    ? "Traek hjoerne for at skalere objektet. Hold Shift for proportioner."
    : "Traek grip for at redigere geometri.";
  return true;
}

function beginMarquee(point, options = {}) {
  clearMarqueePreviewSelection();
  const rect = createSvgElement("rect", {
    x: point.x,
    y: point.y,
    width: 0,
    height: 0,
    class: "selection-marquee",
  });
  if (options.rightButton) rect.classList.add("right-marquee");
  previewLayer.append(rect);
  marqueeState = { start: point, current: point, rect, ...options };
}

function updateMarquee(point) {
  const box = makeRectFromPoints(marqueeState.start, point);
  Object.entries(box).forEach(([key, value]) => marqueeState.rect.setAttribute(key, value));
  marqueeState.current = point;
  clearMarqueePreviewSelection();
  if (box.width < 3 && box.height < 3) return;
  drawingLayer.querySelectorAll(".draw-item").forEach((element) => {
    if (!isElementLocked(element) && element.style.display !== "none" && rectsIntersect(box, getElementBounds(element))) {
      element.classList.add("marquee-hit");
    }
  });
}

function finishMarquee(additive = false) {
  const box = makeRectFromPoints(marqueeState.start, marqueeState.current);
  const isClick = box.width < dragThresholdPx && box.height < dragThresholdPx;
  marqueeState.rect.remove();
  marqueeState = null;
  clearMarqueePreviewSelection();

  if (isClick) {
    if (!additive) clearSelection();
    return;
  }

  if (!additive) clearSelection();
  const hits = Array.from(drawingLayer.querySelectorAll(".draw-item"))
    .filter((element) => !isElementLocked(element) && element.style.display !== "none" && rectsIntersect(box, getElementBounds(element)));
  addManyToSelection(hits);
}

function finishRightMarquee(event) {
  const state = marqueeState;
  const box = makeRectFromPoints(state.start, state.current);
  const isClick = box.width < dragThresholdPx && box.height < dragThresholdPx;
  const targetItem = state.contextTarget;
  state.rect.remove();
  marqueeState = null;
  clearMarqueePreviewSelection();

  if (isClick) {
    showContextMenu(event, targetItem);
    return;
  }

  if (!(event.shiftKey || event.ctrlKey || event.metaKey)) clearSelection();
  const hits = Array.from(drawingLayer.querySelectorAll(".draw-item"))
    .filter((element) => !isElementLocked(element) && element.style.display !== "none" && rectsIntersect(box, getElementBounds(element)));
  addManyToSelection(hits);
  statusText.textContent = selectedElements.size
    ? `${selectedElements.size} elementer valgt med hoejreklik-traek.`
    : "Ingen elementer i udvalg.";
}

/* Raster size is derived from the paper size at a target DPI, not from the
   drawing units -- at 1:10 an A3 sheet is 4200 units wide, and the old fixed
   4x multiplier turned that into a 16800px canvas. */
const exportDpi = 300;
const maxExportPixels = 12000;

function exportRasterScale(exportBox) {
  const page = exportPdfPageSize(exportBox);
  const targetPx = (page.widthMm / 25.4) * exportDpi;
  const scale = targetPx / exportBox.width;
  const capped = Math.min(scale, maxExportPixels / Math.max(exportBox.width, exportBox.height));
  return Math.max(0.05, capped);
}

function exportPng() {
  const exportBox = exportBounds();
  const scale = exportRasterScale(exportBox);
  const serialized = new XMLSerializer().serializeToString(cleanSvgClone(exportBox));
  const blob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(exportBox.width * scale);
    canvas.height = Math.round(exportBox.height * scale);
    const context = canvas.getContext("2d");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.fillStyle = "#fffefb";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);

    const link = document.createElement("a");
    link.download = "omkreds-tegning.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };
  image.src = url;
}

function downloadText(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = filename;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}

/* The sheet is the deliverable: if the drawing sits on it, that is the page.
   Only work that spills outside the sheet is exported by its own extent. */
function exportBounds() {
  const sheetBox = { x: 0, y: 0, width: sheet.width, height: sheet.height };
  if (drawingLayer.querySelector('[data-type="sheetFrame"]')) return sheetBox;
  try {
    const box = drawingLayer.getBBox();
    if (!(box.width > 1 && box.height > 1)) return sheetBox;
    const fitsOnSheet = box.x >= -1 && box.y >= -1
      && box.x + box.width <= sheet.width + 1
      && box.y + box.height <= sheet.height + 1;
    if (fitsOnSheet) return sheetBox;
    const margin = paperMmToUnits(6);
    return {
      x: box.x - margin,
      y: box.y - margin,
      width: box.width + margin * 2,
      height: box.height + margin * 2,
    };
  } catch (error) {
    /* Empty drawings have no bbox. */
  }
  return sheetBox;
}

function cleanSvgClone(bounds = exportBounds()) {
  const clone = svg.cloneNode(true);
  clone.querySelectorAll(".selected").forEach((element) => element.classList.remove("selected"));
  clone.querySelector("#previewLayer")?.replaceChildren();
  clone.setAttribute("xmlns", svgNS);
  clone.setAttribute("width", bounds.width);
  clone.setAttribute("height", bounds.height);
  clone.setAttribute("viewBox", `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`);
  clone.setAttribute("style", "background:#ffffff;color:#111111");
  clone.querySelector(".paper-bg")?.setAttribute("fill", "#ffffff");
  clone.querySelector(".grid-bg")?.remove();
  clone.querySelector(".sheet-shadow")?.remove();
  /* Blob URLs do not resolve once the SVG is loaded as an image, so the
     underlay is inlined as data for export. */
  if (underlayCanvas) {
    clone.querySelectorAll(".plan-underlay").forEach((element) => {
      element.setAttribute("href", underlayCanvas.toDataURL("image/png"));
    });
  }
  clone.querySelectorAll(".selection-overlay, .selection-marquee, .placement-ghost, .placement-anchor, .snap-marker").forEach((element) => element.remove());
  clone.querySelectorAll(".measure-line").forEach((element) => {
    element.setAttribute("stroke", "#111111");
    element.setAttribute("stroke-width", element.closest(".template-measure") ? "0.8" : "0.9");
    element.setAttribute("stroke-linecap", "round");
    element.setAttribute("fill", "none");
  });
  clone.querySelectorAll(".measure-extension, .measure-tick").forEach((element) => {
    element.setAttribute("stroke", "#111111");
    element.setAttribute("stroke-width", element.closest(".template-measure") ? "0.8" : "0.65");
    element.setAttribute("stroke-linecap", "round");
    element.setAttribute("fill", "none");
  });
  /* The mask tracks the theme on screen; on paper it is white. */
  clone.querySelectorAll(".break-mask").forEach((element) => { element.style.fill = "#ffffff"; });
  clone.querySelectorAll(".measure-label-bg").forEach((element) => {
    element.setAttribute("fill", "#ffffff");
    element.setAttribute("stroke", "#111111");
    element.setAttribute("stroke-width", element.closest(".template-measure") ? "0.6" : "0.45");
  });
  clone.querySelectorAll(".measure-label").forEach((element) => {
    element.setAttribute("fill", "#111111");
    element.setAttribute("font-family", "Arial, Helvetica, sans-serif");
    element.setAttribute("font-size", element.getAttribute("font-size") || (element.closest(".template-measure") ? "7" : "10"));
    element.setAttribute("font-weight", element.closest(".template-measure") ? "500" : "700");
    element.setAttribute("dominant-baseline", "central");
    element.setAttribute("text-anchor", "middle");
  });
  return clone;
}

function exportSvg() {
  const serialized = new XMLSerializer().serializeToString(cleanSvgClone(exportBounds()));
  downloadText("omkreds-tegning.svg", serialized, "image/svg+xml;charset=utf-8");
}

/* --- PDF export ----------------------------------------------------------
   The page is the real paper size in millimetres and the content is vector:
   selectable text, hairlines that stay hairlines, and a file measured in tens
   of kilobytes instead of a bitmap sized by guesswork. */
function exportPdfPageSize(box) {
  /* When the drawing is framed by a sheet, the page IS the sheet. Otherwise
     the page is the drawing extent converted to paper millimetres. */
  const framed = Math.abs(box.width - sheet.width) < 1 && Math.abs(box.height - sheet.height) < 1;
  if (framed) return { widthMm: sheet.widthMm, heightMm: sheet.heightMm };
  return { widthMm: unitsToPaperMm(box.width), heightMm: unitsToPaperMm(box.height) };
}

async function exportPdf() {
  const jsPdf = window.jspdf?.jsPDF;
  if (!jsPdf) {
    showAlert("PDF-eksport utilgaengelig", "jsPDF blev ikke hentet. Brug SVG- eller PNG-eksport.");
    return;
  }
  const exportBox = exportBounds();
  const page = exportPdfPageSize(exportBox);
  const pdf = new jsPdf({
    orientation: page.widthMm >= page.heightMm ? "landscape" : "portrait",
    unit: "mm",
    format: [page.widthMm, page.heightMm],
    compress: true,
  });

  const svg2pdf = window.svg2pdf?.svg2pdf || window.svg2pdf;
  if (typeof svg2pdf !== "function") {
    statusText.textContent = "Vektor-eksport utilgaengelig, bruger raster.";
    exportPdfRaster(pdf, exportBox, page);
    return;
  }

  const clone = cleanSvgClone(exportBox);
  /* svg2pdf needs the node in the document to resolve computed geometry, and
     so does getBBox() inside the hatch flattener -- attach before touching. */
  const holder = document.createElement("div");
  holder.setAttribute("style", "position:fixed;left:-10000px;top:0;width:0;height:0;overflow:hidden");
  holder.append(clone);
  document.body.append(holder);
  try {
    const hatch = flattenHatchPatterns(clone);
    if (hatch.skipped) {
      statusText.textContent = `${hatch.skipped} hatch-felt(er) var for tætte til vektor-eksport og er udeladt.`;
    }
    await svg2pdf(clone, pdf, { x: 0, y: 0, width: page.widthMm, height: page.heightMm });
    pdf.save("omkreds-tegning.pdf");
    statusText.textContent = `PDF eksporteret som vektor, ${Math.round(page.widthMm)} x ${Math.round(page.heightMm)} mm.`;
  } catch (error) {
    statusText.textContent = "Vektor-eksport fejlede, bruger raster.";
    exportPdfRaster(pdf, exportBox, page);
  } finally {
    holder.remove();
  }
}

/* Retained as a fallback so export never simply fails. */
function exportPdfRaster(pdf, exportBox, page) {
  const scale = exportRasterScale(exportBox);
  const serialized = new XMLSerializer().serializeToString(cleanSvgClone(exportBox));
  const blob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(exportBox.width * scale);
    canvas.height = Math.round(exportBox.height * scale);
    const context = canvas.getContext("2d");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, page.widthMm, page.heightMm);
    pdf.save("omkreds-tegning.pdf");
    URL.revokeObjectURL(url);
  };
  image.src = url;
}

/* svg2pdf cannot reproduce <pattern> fills, so each hatched area is replaced
   by the pattern's own geometry, tiled and clipped to the shape. The clip is
   applied outside the patternTransform and the tile range is computed in
   pattern space, so rotated hatches (steel, wood) land where they belong. */
const maxHatchTiles = 20000;

function flattenHatchPatterns(root) {
  const shapes = Array.from(root.querySelectorAll('[fill^="url(#hatch-"]'));
  if (!shapes.length) return { flattened: 0, skipped: 0 };
  let seq = 0;
  let flattened = 0;
  let skipped = 0;

  shapes.forEach((shape) => {
    const match = /url\(#([^)]+)\)/.exec(shape.getAttribute("fill") || "");
    const pattern = match && root.querySelector(`#${CSS.escape(match[1])}`);
    if (!pattern) return;
    const tileWidth = Number(pattern.getAttribute("width"));
    const tileHeight = Number(pattern.getAttribute("height"));
    if (!(tileWidth > 0 && tileHeight > 0)) return;

    let box;
    try {
      box = shape.getBBox();
    } catch (error) {
      return;
    }
    if (!(box.width > 0 && box.height > 0)) return;

    const transformList = pattern.patternTransform?.baseVal;
    const matrix = transformList && transformList.numberOfItems ? transformList.consolidate()?.matrix : null;
    const inverse = matrix ? matrix.inverse() : null;

    /* Tiling happens in pattern space; map the shape's box through the inverse
       of the pattern transform so a rotated hatch still covers every corner. */
    const corners = [
      [box.x, box.y],
      [box.x + box.width, box.y],
      [box.x, box.y + box.height],
      [box.x + box.width, box.y + box.height],
    ].map(([x, y]) => {
      if (!inverse) return { x, y };
      const point = root.createSVGPoint();
      point.x = x;
      point.y = y;
      return point.matrixTransform(inverse);
    });
    const minX = Math.min(...corners.map((c) => c.x));
    const maxX = Math.max(...corners.map((c) => c.x));
    const minY = Math.min(...corners.map((c) => c.y));
    const maxY = Math.max(...corners.map((c) => c.y));

    const startX = Math.floor(minX / tileWidth) * tileWidth;
    const startY = Math.floor(minY / tileHeight) * tileHeight;
    const cols = Math.ceil((maxX - startX) / tileWidth) + 1;
    const rows = Math.ceil((maxY - startY) / tileHeight) + 1;
    if (cols * rows > maxHatchTiles) {
      /* A partial hatch would be a wrong drawing; leave the pattern in place
         and let the caller decide, rather than silently truncating. */
      skipped += 1;
      return;
    }

    seq += 1;
    const clipId = `hatch-clip-${seq}`;
    const group = createSvgElement("g", { class: "hatch-flattened" });
    const clipPath = createSvgElement("clipPath", { id: clipId, clipPathUnits: "userSpaceOnUse" });
    const clipShape = shape.cloneNode(false);
    ["fill", "class", "stroke", "stroke-width", "stroke-dasharray", "opacity"].forEach((attr) => clipShape.removeAttribute(attr));
    clipPath.append(clipShape);
    group.append(clipPath);

    const clipped = createSvgElement("g", { "clip-path": `url(#${clipId})` });
    const host = matrix
      ? createSvgElement("g", { transform: pattern.getAttribute("patternTransform") })
      : clipped;
    for (let cx = 0; cx < cols; cx += 1) {
      for (let cy = 0; cy < rows; cy += 1) {
        const tile = createSvgElement("g", {
          transform: `translate(${startX + cx * tileWidth} ${startY + cy * tileHeight})`,
        });
        Array.from(pattern.children).forEach((child) => tile.append(child.cloneNode(true)));
        host.append(tile);
      }
    }
    if (matrix) clipped.append(host);
    group.append(clipped);

    shape.setAttribute("fill", "none");
    shape.parentNode?.insertBefore(group, shape.nextSibling);
    flattened += 1;
  });

  return { flattened, skipped };
}


/* --- Autosave ------------------------------------------------------------
   A refresh used to lose everything. The drawing is mirrored to localStorage a
   moment after each committed edit; the underlay is skipped when it is a large
   embedded image so the quota is not blown on a raster plan. */
const autosaveKey = "omkreds:autosave:v1";
const autosaveLimit = 4 * 1024 * 1024;
let autosaveTimer = 0;
let bootComplete = false;

function projectSnapshot(includeUnderlay = true) {
  return {
    version: 2,
    savedAt: new Date().toISOString(),
    sheet: {
      paper: sheet.paper,
      widthMm: sheet.widthMm,
      heightMm: sheet.heightMm,
      plotScale: sheet.plotScale,
      width: sheet.width,
      height: sheet.height,
    },
    scale: getScaleValue(),
    gridSize: gridSize.value,
    underlayScale: underlayScale.value,
    underlayOpacity: underlayOpacity.value,
    activeLayer: activeLayer.value,
    layers,
    underlay: underlayDescriptor(),
    underlaySource: includeUnderlay ? underlayState.sourceKey : null,
    drawing: drawingLayer.innerHTML,
  };
}

function scheduleAutosave() {
  /* Never write during boot: if a restore fails for any reason, an empty
     document must not be allowed to overwrite the saved session. */
  if (isRestoringHistory || !bootComplete) return;
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    autosaveTimer = 0;
    writeAutosave();
  }, 1200);
}

function writeAutosave() {
  try {
    let payload = JSON.stringify(projectSnapshot(true));
    if (payload.length > autosaveLimit) {
      setAutosaveStatus("Tegningen er for stor til autosave");
      return;
    }
    window.localStorage.setItem(autosaveKey, payload);
    setAutosaveStatus(`Gemt lokalt ${new Date().toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })}`);
  } catch (error) {
    setAutosaveStatus("Autosave mislykkedes");
  }
}

function setAutosaveStatus(text) {
  const node = document.getElementById("autosaveStatus");
  if (node) node.textContent = text;
}

function restoreAutosave() {
  let payload = null;
  try {
    payload = window.localStorage.getItem(autosaveKey);
  } catch (error) {
    return false;
  }
  if (!payload) return false;
  try {
    const data = JSON.parse(payload);
    if (!data.drawing || !data.drawing.trim()) {
      /* An underlay with no geometry is still a session worth restoring. */
      if (!data.underlay) return false;
    }
    applyProjectData(data);
    statusText.textContent = "Forrige session gendannet fra autosave.";
    setAutosaveStatus("Gendannet fra autosave");
    return true;
  } catch (error) {
    return false;
  }
}

function clearAutosave() {
  try {
    window.localStorage.removeItem(autosaveKey);
  } catch (error) {
    /* nothing to clear */
  }
  if (underlayState.sourceKey) assetDelete(underlayState.sourceKey);
  setAutosaveStatus("Autosave ryddet");
}

/* Shared by "open project" and autosave restore. */
function applyProjectData(data) {
  drawingLayer.innerHTML = data.drawing || "";
  if (typeof data.underlay === "string") {
    /* Projects saved before the underlay became a descriptor. */
    legacyUnderlayHtml = data.underlay;
    underlayLayer.innerHTML = data.underlay;
  } else {
    applyUnderlayDescriptor(data.underlay || null);
  }
  if (data.sheet) {
    if (data.sheet.widthMm) {
      setSheet({
        paper: data.sheet.paper || "custom",
        widthMm: Number(data.sheet.widthMm),
        heightMm: Number(data.sheet.heightMm),
        plotScale: Number(data.sheet.plotScale) || 1,
      }, { silent: true });
    } else if (data.sheet.width && data.sheet.height) {
      /* Pre-paper-model projects stored the sheet in drawing units. */
      setSheet({
        paper: "custom",
        widthMm: Number(data.sheet.width) * getScaleValue(),
        heightMm: Number(data.sheet.height) * getScaleValue(),
        plotScale: 1,
      }, { silent: true });
    }
  }
  gridSize.value = data.gridSize || gridSize.value;
  underlayScale.value = data.underlayScale || underlayScale.value;
  underlayOpacity.value = data.underlayOpacity || underlayOpacity.value;
  underlayScaleValue.textContent = `${underlayScale.value}%`;
  underlayOpacityValue.textContent = `${underlayOpacity.value}%`;
  activeLayer.value = data.activeLayer || activeLayer.value;
  if (data.layers) {
    Object.entries(data.layers).forEach(([key, value]) => {
      if (layers[key]) Object.assign(layers[key], value);
    });
    underlayLocked.checked = Boolean(layers.underlay.locked);
  }
  setScaleValue(data.scale || 1, "Projekt");
  clearSelection();
  ensureElementIds();
  ensureTextScaleMetadata();
  renderLayerList();
  underlayLayer.querySelectorAll(".plan-underlay").forEach((element) => {
    element.setAttribute("opacity", Number(underlayOpacity.value) / 100);
  });
  updateUnderlayView();
  updateUnderlayScaleLabel();
  updateLayerVisibility();
  updateDotGrid();
  renderElementList();
}

function saveProject() {
  downloadText("omkreds-projekt.json", JSON.stringify(projectSnapshot(true), null, 2), "application/json;charset=utf-8");
  writeAutosave();
  statusText.textContent = "Projekt gemt som JSON.";
}

function openProjectFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onerror = () => {
    statusText.textContent = "Filen kunne ikke laeses.";
  };
  reader.onload = () => {
    let data = null;
    try {
      data = JSON.parse(reader.result);
    } catch (error) {
      showAlert("Ugyldig projektfil", "Filen er ikke gyldig JSON og kunne ikke aabnes.");
      statusText.textContent = "Projektfilen kunne ikke laeses.";
      return;
    }
    if (!data || typeof data.drawing !== "string") {
      showAlert("Ugyldig projektfil", "Filen indeholder ikke en Omkreds-tegning.");
      return;
    }
    try {
      applyProjectData(data);
      historyStack.length = 0;
      historyPointer = -1;
      pushHistory();
      fitToContent();
      statusText.textContent = "Projekt aabnet.";
    } catch (error) {
      showAlert("Projektet kunne ikke aabnes", String(error?.message || error));
    }
  };
  reader.readAsText(file);
}

function svgClientSize() {
  const rect = svg.getBoundingClientRect();
  return { width: rect.width || 1, height: rect.height || 1, left: rect.left, top: rect.top };
}

/* Writes the current view rect to the viewBox and refreshes everything whose
   size is expressed in screen pixels (grips, snap markers, grid). */
function applyView() {
  const size = svgClientSize();
  view.width = Math.max(size.width / maxZoom, Math.min(size.width / minZoom, view.width));
  view.height = view.width * (size.height / size.width);
  zoom = size.width / view.width;
  svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.width} ${view.height}`);
  zoomLabel.textContent = `${formatZoom(zoom)}%`;
  updateDotGrid();
  scheduleUnderlayResolution();
  markUi("overlay");
}

function formatZoom(value) {
  const percent = value * 100;
  if (percent >= 100) return String(Math.round(percent));
  if (percent >= 10) return percent.toFixed(0);
  return percent.toFixed(1);
}

function scheduleView() {
  if (viewFrame) return;
  viewFrame = scheduleFrame(() => {
    viewFrame = 0;
    applyView();
  });
}

/* Absolute zoom. `focus` is an optional client-space point that stays put. */
function setZoom(nextZoom, focus = null) {
  const size = svgClientSize();
  const target = Math.min(maxZoom, Math.max(minZoom, nextZoom));
  const anchor = focus ? svgPointFromScreen(focus.x, focus.y) : null;
  const ratio = focus
    ? { x: (focus.x - size.left) / size.width, y: (focus.y - size.top) / size.height }
    : { x: 0.5, y: 0.5 };
  const center = anchor || { x: view.x + view.width / 2, y: view.y + view.height / 2 };
  view.width = size.width / target;
  view.height = view.width * (size.height / size.width);
  view.x = center.x - view.width * ratio.x;
  view.y = center.y - view.height * ratio.y;
  applyView();
}

function zoomByFactor(factor, focus = null) {
  setZoom(zoom * factor, focus);
}

function panByScreen(dxPx, dyPx) {
  view.x -= dxPx / zoom;
  view.y -= dyPx / zoom;
  scheduleView();
}

function fitBox(box, padding = 0.06) {
  if (!box || box.width <= 0 || box.height <= 0) return;
  const size = svgClientSize();
  const pad = 1 + padding * 2;
  const targetZoom = Math.min(size.width / (box.width * pad), size.height / (box.height * pad));
  view.width = size.width / Math.min(maxZoom, Math.max(minZoom, targetZoom));
  view.height = view.width * (size.height / size.width);
  view.x = box.x + box.width / 2 - view.width / 2;
  view.y = box.y + box.height / 2 - view.height / 2;
  applyView();
}

function fitToSheet() {
  fitBox({ x: 0, y: 0, width: sheet.width, height: sheet.height });
  statusText.textContent = "Zoomet til arket.";
}

function fitToContent() {
  let box = null;
  try {
    const bbox = drawingLayer.getBBox();
    if (bbox.width > 1 && bbox.height > 1) box = { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height };
  } catch (error) {
    box = null;
  }
  if (!box) {
    fitToSheet();
    return;
  }
  fitBox(box);
  statusText.textContent = "Zoomet til tegningen.";
}

function zoomToSelection() {
  const box = selectionBounds();
  if (!box) {
    fitToContent();
    return;
  }
  fitBox(box, 0.25);
  statusText.textContent = "Zoomet til valget.";
}

function resetZoom() {
  setZoom(1);
  statusText.textContent = "Zoom 100%.";
}

/* The dot grid follows the view and steps up in powers of two so the dots
   stay readable instead of turning into moire or golf balls. */
function updateDotGrid() {
  const dotGrid = document.getElementById("dotGrid");
  const majorDotGrid = document.getElementById("majorDotGrid");
  const gridRect = svg.querySelector(".grid-bg");
  if (!dotGrid || !majorDotGrid) return;
  const base = Number(gridSize.value) || 25;
  let step = base;
  while (step * zoom < 9) step *= 2;
  const major = step * 4;
  dotGrid.setAttribute("width", step);
  dotGrid.setAttribute("height", step);
  dotGrid.querySelector("circle")?.setAttribute("r", Math.min(step / 8, 1.45 / zoom));
  majorDotGrid.setAttribute("width", major);
  majorDotGrid.setAttribute("height", major);
  majorDotGrid.querySelector("rect").setAttribute("width", major);
  majorDotGrid.querySelector("rect").setAttribute("height", major);
  majorDotGrid.querySelector("circle")?.setAttribute("r", Math.min(step / 5, 2.35 / zoom));
  /* The grid belongs to the sheet: it reads as paper, and the void around it
     stays quiet instead of tiling dots across the whole viewport. */
  if (gridRect) {
    gridRect.setAttribute("x", 0);
    gridRect.setAttribute("y", 0);
    gridRect.setAttribute("width", sheet.width);
    gridRect.setAttribute("height", sheet.height);
    gridRect.style.display = step * zoom < 6 ? "none" : "";
  }
}

/* Keeps the view centre stable when the window or the panels resize. */
function handleViewportResize() {
  const size = svgClientSize();
  const centerX = view.x + view.width / 2;
  const centerY = view.y + view.height / 2;
  view.width = size.width / zoom;
  view.height = view.width * (size.height / size.width);
  view.x = centerX - view.width / 2;
  view.y = centerY - view.height / 2;
  applyView();
}

function updateLayerVisibility() {
  invalidateGeometry();
  underlayLayer.style.display = layers.underlay.visible ? "" : "none";
  drawingLayer.querySelectorAll(".draw-item").forEach((element) => {
    const layer = elementLayer(element);
    element.style.display = layers[layer]?.visible === false || element.dataset.isolationHidden === "true" ? "none" : "";
  });
}

function renderLayerList() {
  layerList.replaceChildren();
  Object.entries(layers).forEach(([key, layer]) => {
    const row = document.createElement("div");
    row.className = "layer-row";
    const name = document.createElement("span");
    name.textContent = layer.name;
    const visible = document.createElement("button");
    visible.type = "button";
    visible.textContent = layer.visible ? "Vis" : "Skjul";
    visible.addEventListener("click", () => {
      pushHistory();
      layer.visible = !layer.visible;
      renderLayerList();
      updateLayerVisibility();
    });
    const lock = document.createElement("button");
    lock.type = "button";
    lock.textContent = layer.locked ? "Laas" : "Fri";
    lock.addEventListener("click", () => {
      pushHistory();
      layer.locked = !layer.locked;
      if (key === "underlay") underlayLocked.checked = layer.locked;
      renderLayerList();
    });
    row.append(name, visible, lock);
    layerList.append(row);
  });
}

function applyColor(element, color) {
  element.dataset.color = color;
  if (element.matches("line, rect, circle, path, polygon, text")) {
    if (element.getAttribute("stroke") && element.getAttribute("stroke") !== "none") element.setAttribute("stroke", color);
    if (element.getAttribute("fill") && !element.getAttribute("fill").startsWith("url(") && element.getAttribute("fill") !== "none") {
      element.setAttribute("fill", color);
    }
  }
  element.setAttribute("color", color);
}

function updateSelectedFromProperties() {
  const element = getSelectedPrimary();
  if (!element) return;
  element.dataset.dimension = propDimension.value;
  element.dataset.material = propMaterial.value;
  applyLayer(element, propLayer.value);
  applyColor(element, propColor.value);
  /* A number input reports "" while its contents are not yet a valid number
     ("0." on the way to "0.35"), and the old fallback turned that into a 3 mm
     pen -- so typing a weight briefly slammed the line to the heaviest value
     on the scale. An empty field means "not finished", not "reset". */
  if (propStrokeWidth.value !== "") applyStrokeWidth(element, Number(propStrokeWidth.value));
  applyOpacity(element, Number(propOpacity.value || 100));
  applyLineType(element, propLineType.value);
  setElementRotation(element, Number(propRotation.value || 0));
  /* Panel fields that feed a specific object's parameters. These write the
     dataset only -- the rebuild below is shared. */
  if (element.dataset.type === "measure") {
    element.dataset.customText = propMeasureText.value;
    element.dataset.measureMode = propMeasureMode.value;
    element.dataset.measureOffset = propMeasureOffset.value;
  }
  if (element.dataset.type === "connection") {
    /* Dimension text carries the post size, so editing it resizes the member. */
    const meta = connectionMetadata(element);
    const parsed = /(\d+)\s*x\s*(\d+)/.exec(propDimension.value || "");
    if (parsed) {
      element.dataset.metadata = JSON.stringify({ ...meta, postWidth: Number(parsed[1]), postDepth: Number(parsed[2]) });
    }
  }

  /* One dispatch for every registered type. The chain this replaces had no
     branch for profile, bolt or boltSide, so editing those from the panel
     changed the dataset and never redrew the object. */
  renderObject(element);
  updateLayerVisibility();
  updatePropertyPanel();
  pushHistorySoon();
}

function isTypingTarget(target) {
  /* Keydown can arrive with a non-element target (window, document); those are
     never text fields, and calling matches() on them used to throw. */
  return Boolean(target?.matches?.("input, textarea, select") || target?.isContentEditable);
}

function selectAllUnlocked() {
  clearSelection();
  drawingLayer.querySelectorAll(".draw-item").forEach((element) => {
    if (!isElementLocked(element) && element.style.display !== "none") addToSelection(element);
  });
}

function isDrawingTool(tool = activeTool) {
  return ["line", "polyline", "arrow", "loadArrow", "leader", "weld", "breakLine", "timber", "measure", "calibrate", "rect", "hatch", "circle", "text"].includes(tool);
}

function isPlacementTool() {
  return Boolean(placementState);
}

function updateCanvasCursor() {
  const panReady = spacePressed && !panState;
  svg.classList.toggle("underlay-movable", underlayIsMovable() && !panReady && !dragState);
  svg.classList.toggle("is-calibrating", Boolean(underlayCalibrationState));
  svg.classList.toggle("tool-draw", (isDrawingTool() || isPlacementTool()) && !dragState && !panState && !panReady);
  svg.classList.toggle("tool-idle", !isDrawingTool() && !isPlacementTool() && !dragState && !panState && !panReady);
  svg.classList.toggle("is-moving", Boolean(dragState));
  svg.classList.toggle("is-panning", Boolean(panState));
  svg.classList.toggle("can-pan", panReady);
}

function hideContextMenu() {
  contextMenu.hidden = true;
}

function showContextMenu(event, targetItem) {
  event.preventDefault();
  if (targetItem) {
    if (!selectedElements.has(targetItem)) selectOnly(targetItem);
  }
  if (!selectedElements.size) {
    hideContextMenu();
    return;
  }
  contextMenu.style.left = `${event.clientX}px`;
  contextMenu.style.top = `${event.clientY}px`;
  contextMenu.hidden = false;
}

function duplicateSelection() {
  if (!selectedElements.size) return;
  pushHistory();
  const clones = Array.from(selectedElements).map((element) => {
    const clone = element.cloneNode(true);
    clone.classList.remove("selected", "hovered");
    stripElementIds(clone);
    moveElement(clone, 25, 25);
    drawingLayer.append(clone);
    return clone;
  });
  clearSelection();
  clones.forEach(addToSelection);
  pushHistory();
  statusText.textContent = `${clones.length} elementer duplikeret.`;
  lastOperation = { type: "duplicate-offset", dx: 25, dy: 25, count: 1, rotateStep: 0 };
}

function deleteSelection() {
  if (!selectedElements.size) return;
  pushHistory();
  selectedElements.forEach((element) => element.remove());
  selectedElements.clear();
  updateSelectionUi();
  pushHistory();
  statusText.textContent = "Valgte elementer slettet.";
}

function bringSelectionToFront() {
  if (!selectedElements.size) return;
  pushHistory();
  selectedElements.forEach((element) => drawingLayer.append(element));
  renderElementList();
  pushHistory();
  statusText.textContent = "Valg flyttet forrest.";
}

function sendSelectionToBack() {
  if (!selectedElements.size) return;
  pushHistory();
  Array.from(selectedElements).reverse().forEach((element) => drawingLayer.prepend(element));
  renderElementList();
  pushHistory();
  statusText.textContent = "Valg flyttet bagest.";
}

function bringSelectionForward() {
  const elements = selectedArray().reverse();
  if (!elements.length) return;
  pushHistory();
  elements.forEach((element) => {
    const next = element.nextElementSibling;
    if (next) drawingLayer.insertBefore(next, element);
  });
  renderElementList();
  pushHistory();
  statusText.textContent = "Valg flyttet et trin frem.";
}

function sendSelectionBackward() {
  const elements = selectedArray();
  if (!elements.length) return;
  pushHistory();
  elements.forEach((element) => {
    const previous = element.previousElementSibling;
    if (previous) drawingLayer.insertBefore(element, previous);
  });
  renderElementList();
  pushHistory();
  statusText.textContent = "Valg flyttet et trin tilbage.";
}

function copySelection() {
  clipboardHtml = Array.from(selectedElements).map((element) => element.outerHTML).join("");
  statusText.textContent = `${selectedElements.size} elementer kopieret.`;
}

function pasteSelection() {
  if (!clipboardHtml) return;
  pushHistory();
  const template = document.createElement("template");
  template.innerHTML = `<svg>${clipboardHtml}</svg>`;
  const clones = Array.from(template.content.querySelector("svg").children).map((node) => {
    const clone = document.importNode(node, true);
    clone.classList.remove("selected", "hovered");
    stripElementIds(clone);
    moveElement(clone, 25, 25);
    drawingLayer.append(clone);
    return clone;
  });
  clearSelection();
  clones.forEach(addToSelection);
  pushHistory();
}

function selectedArray() {
  return Array.from(selectedElements).filter((element) => element.parentNode === drawingLayer);
}

function similarityKey(element) {
  const type = element.dataset.type || element.tagName.toLowerCase();
  if (type === "manufacturerComponent") return [type, element.dataset.manufacturerId, element.dataset.familyId, element.dataset.variant, element.dataset.componentView].join("|");
  if (type === "libraryComponent") return [type, element.dataset.componentCategory, element.dataset.componentKind, element.dataset.dimension].join("|");
  if (type === "screw") return [type, element.dataset.screwFamily, element.dataset.screw, element.dataset.screwView].join("|");
  if (type === "profile" || type === "profileMember") return [type, element.dataset.profile].join("|");
  if (type === "bolt" || type === "boltSide") return [type, element.dataset.bolt, element.dataset.grade].join("|");
  if (type === "symbol") return [type, element.dataset.symbol].join("|");
  if (type === "hatch") return [type, element.dataset.hatch].join("|");
  return [type, element.dataset.lineType || "solid", element.dataset.strokeWidth || "", element.dataset.layer || ""].join("|");
}

function selectSimilarSelection() {
  const seed = selectedArray()[0];
  if (!seed) return;
  const key = similarityKey(seed);
  clearSelection();
  drawingLayer.querySelectorAll(".draw-item").forEach((element) => {
    if (!isElementLocked(element) && element.style.display !== "none" && similarityKey(element) === key) addToSelection(element);
  });
  updateSelectionUi();
  statusText.textContent = `${selectedElements.size} lignende elementer valgt.`;
}

function showAllElements() {
  drawingLayer.querySelectorAll(".draw-item").forEach((element) => {
    delete element.dataset.isolationHidden;
  });
  updateLayerVisibility();
  renderElementList();
  statusText.textContent = "Alle isolerede elementer vist igen.";
}

function isolateSelection() {
  const keep = new Set(selectedArray());
  if (!keep.size) return;
  drawingLayer.querySelectorAll(".draw-item").forEach((element) => {
    if (!keep.has(element)) element.dataset.isolationHidden = "true";
    else delete element.dataset.isolationHidden;
  });
  updateLayerVisibility();
  renderElementList();
  statusText.textContent = `${keep.size} elementer isoleret. Brug Show all for at vise resten.`;
}

function selectionBounds(elements = selectedArray()) {
  if (!elements.length) return null;
  return elements.reduce((bounds, element) => {
    const next = getElementBounds(element);
    if (!bounds) return next;
    const x1 = Math.min(bounds.x, next.x);
    const y1 = Math.min(bounds.y, next.y);
    const x2 = Math.max(bounds.x + bounds.width, next.x + next.width);
    const y2 = Math.max(bounds.y + bounds.height, next.y + next.height);
    return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  }, null);
}

function elementCenter(element) {
  const box = getElementBounds(element);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function alignSelection(axis, mode) {
  const elements = selectedArray();
  if (elements.length < 2) return;
  const primary = elements[0];
  const primaryBox = getElementBounds(primary);
  pushHistory();
  elements.slice(1).forEach((element) => {
    const box = getElementBounds(element);
    let dx = 0;
    let dy = 0;
    if (axis === "x" && mode === "start") dx = primaryBox.x - box.x;
    if (axis === "x" && mode === "center") dx = primaryBox.x + primaryBox.width / 2 - (box.x + box.width / 2);
    if (axis === "y" && mode === "start") dy = primaryBox.y - box.y;
    if (axis === "y" && mode === "center") dy = primaryBox.y + primaryBox.height / 2 - (box.y + box.height / 2);
    moveElement(element, dx, dy);
  });
  pushHistory();
  lastOperation = { type: "align", axis, mode };
  statusText.textContent = "Valg justeret efter foerste valgte objekt.";
}

function distributeSelection(axis) {
  const elements = selectedArray();
  if (elements.length < 3) return;
  const sorted = elements.sort((a, b) => elementCenter(a)[axis] - elementCenter(b)[axis]);
  const first = elementCenter(sorted[0])[axis];
  const last = elementCenter(sorted[sorted.length - 1])[axis];
  const step = (last - first) / (sorted.length - 1);
  pushHistory();
  sorted.forEach((element, index) => {
    if (index === 0 || index === sorted.length - 1) return;
    const center = elementCenter(element);
    const delta = first + step * index - center[axis];
    moveElement(element, axis === "x" ? delta : 0, axis === "y" ? delta : 0);
  });
  pushHistory();
  lastOperation = { type: "distribute", axis };
  statusText.textContent = axis === "x" ? "Valg fordelt vandret." : "Valg fordelt lodret.";
}

function rotateSelectionBy(degrees) {
  const elements = selectedArray();
  if (!elements.length) return;
  pushHistory();
  elements.forEach((element) => setElementRotation(element, Number(element.dataset.rotation || 0) + degrees));
  pushHistory();
  lastOperation = { type: "rotate", degrees };
}

function mirrorSelection(axis) {
  const elements = selectedArray();
  const box = selectionBounds(elements);
  if (!box) return;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  pushHistory();
  elements.forEach((element) => {
    element.dataset.mirrored = `${element.dataset.mirrored || ""}${axis}`;
    const transform = element.getAttribute("transform") || "";
    /* Reflect about the selection's own axis: x' = 2*cx - x. Appending a bare
       scale(-1 1) instead reflects about the drawing origin, which only looks
       right when the selection happens to straddle x=0 -- everything else flew
       across the sheet. The reflection also has to sit OUTSIDE any transform
       the element already carries, or it reflects in the element's local frame. */
    const reflect = axis === "x"
      ? `translate(${cx * 2} 0) scale(-1 1)`
      : `translate(0 ${cy * 2}) scale(1 -1)`;
    element.setAttribute("transform", `${reflect} ${transform}`.trim());
  });
  invalidateGeometry();
  pushHistory();
  lastOperation = { type: "mirror", axis };
  statusText.textContent = axis === "x" ? "Valg spejlet vandret." : "Valg spejlet lodret.";
}

function duplicateSelectionBy(dx, dy, count = 1, rotateStep = 0) {
  if (!selectedElements.size) return [];
  pushHistory();
  const source = selectedArray();
  const clones = [];
  for (let i = 1; i <= count; i += 1) {
    source.forEach((element) => {
      const clone = element.cloneNode(true);
      clone.classList.remove("selected", "hovered");
      stripElementIds(clone);
      moveElement(clone, dx * i, dy * i);
      if (rotateStep) setElementRotation(clone, Number(clone.dataset.rotation || 0) + rotateStep * i);
      drawingLayer.append(clone);
      clones.push(clone);
    });
  }
  clearSelection();
  clones.forEach(addToSelection);
  pushHistory();
  lastOperation = { type: "duplicate-offset", dx, dy, count, rotateStep };
  return clones;
}

/* A parallel copy at a stated distance -- what "offset" means in every other
   drafting tool. This used to duplicate the selection 100 mm diagonally, which
   is a different operation wearing the same name. Perpendicular for a line,
   concentric for a rectangle or circle; a negative value flips the side. */
function offsetElementBy(element, distance) {
  const tag = element.tagName.toLowerCase();
  const clone = element.cloneNode(true);
  clone.classList.remove("selected", "hovered");
  stripElementIds(clone);

  if (tag === "line") {
    const x1 = Number(element.getAttribute("x1"));
    const y1 = Number(element.getAttribute("y1"));
    const x2 = Number(element.getAttribute("x2"));
    const y2 = Number(element.getAttribute("y2"));
    const length = Math.hypot(x2 - x1, y2 - y1);
    if (!length) return null;
    const nx = -(y2 - y1) / length;
    const ny = (x2 - x1) / length;
    clone.setAttribute("x1", x1 + nx * distance);
    clone.setAttribute("y1", y1 + ny * distance);
    clone.setAttribute("x2", x2 + nx * distance);
    clone.setAttribute("y2", y2 + ny * distance);
    return clone;
  }
  if (tag === "rect") {
    const x = Number(element.getAttribute("x"));
    const y = Number(element.getAttribute("y"));
    const w = Number(element.getAttribute("width"));
    const h = Number(element.getAttribute("height"));
    if (w + distance * 2 <= 0 || h + distance * 2 <= 0) return null;
    clone.setAttribute("x", x - distance);
    clone.setAttribute("y", y - distance);
    clone.setAttribute("width", w + distance * 2);
    clone.setAttribute("height", h + distance * 2);
    return clone;
  }
  if (tag === "circle") {
    const r = Number(element.getAttribute("r")) + distance;
    if (r <= 0) return null;
    clone.setAttribute("r", r);
    return clone;
  }
  return null;
}

async function offsetSelection() {
  const elements = selectedArray();
  if (!elements.length) return;
  const answers = await openDialog({
    title: "Offset",
    description: "Parallel kopi i den angivne afstand. Negativ vaerdi vender siden.",
    fields: [{ name: "distance", label: "Afstand [mm]", type: "number", value: 100, step: 1 }],
    confirmLabel: "Offset",
  });
  if (!answers) return;
  const mm = Number(answers.distance);
  if (!mm) return;
  const distance = mmToDrawing(mm);

  pushHistory();
  const made = [];
  let skipped = 0;
  elements.forEach((element) => {
    const clone = offsetElementBy(element, distance);
    if (!clone) { skipped += 1; return; }
    drawingLayer.append(clone);
    made.push(clone);
  });
  if (!made.length) {
    statusText.textContent = "Offset virker paa linjer, rektangler og cirkler.";
    return;
  }
  clearSelection();
  made.forEach(addToSelection);
  pushHistory();
  invalidateGeometry();
  lastOperation = { type: "offset", distance: mm };
  statusText.textContent = skipped
    ? `Offset ${mm} mm: ${made.length} kopieret, ${skipped} sprunget over.`
    : `Offset ${mm} mm.`;
}

/* --- Trim / extend --------------------------------------------------------
   One gesture for both: click the part of the line you do not want. The clicked
   line is treated as infinite and crossed against every other line, and the end
   on the clicked side moves to the nearest crossing -- which pulls the line in
   when you click inside it, and pushes it out when you click past its end. Two
   commands' worth of behaviour without two commands to choose between. */
function trimSegments() {
  const segments = [];
  drawingLayer.querySelectorAll("line.draw-item").forEach((element) => {
    if (element.style.display === "none" || isElementLocked(element)) return;
    segments.push({
      element,
      x1: Number(element.getAttribute("x1")), y1: Number(element.getAttribute("y1")),
      x2: Number(element.getAttribute("x2")), y2: Number(element.getAttribute("y2")),
    });
  });
  return segments;
}

function distanceToSegment(point, s) {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const len2 = dx * dx + dy * dy;
  if (!len2) return Math.hypot(point.x - s.x1, point.y - s.y1);
  let t = ((point.x - s.x1) * dx + (point.y - s.y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(point.x - (s.x1 + t * dx), point.y - (s.y1 + t * dy));
}

/* `a` extended infinitely, `b` kept finite. */
function infiniteIntersection(a, b) {
  const d = (a.x1 - a.x2) * (b.y1 - b.y2) - (a.y1 - a.y2) * (b.x1 - b.x2);
  if (Math.abs(d) < 0.000001) return null;
  const px = ((a.x1 * a.y2 - a.y1 * a.x2) * (b.x1 - b.x2) - (a.x1 - a.x2) * (b.x1 * b.y2 - b.y1 * b.x2)) / d;
  const py = ((a.x1 * a.y2 - a.y1 * a.x2) * (b.y1 - b.y2) - (a.y1 - a.y2) * (b.x1 * b.y2 - b.y1 * b.x2)) / d;
  const onB =
    px >= Math.min(b.x1, b.x2) - 0.01 && px <= Math.max(b.x1, b.x2) + 0.01 &&
    py >= Math.min(b.y1, b.y2) - 0.01 && py <= Math.max(b.y1, b.y2) + 0.01;
  return onB ? { x: px, y: py } : null;
}

function performTrim(point) {
  const segments = trimSegments();
  const tolerance = 12 / zoom;
  let target = null;
  let nearest = Infinity;
  segments.forEach((s) => {
    const d = distanceToSegment(point, s);
    if (d < nearest && d <= tolerance) { nearest = d; target = s; }
  });
  if (!target) {
    statusText.textContent = "Klik paa den del af linjen der skal fjernes.";
    return;
  }

  const dx = target.x2 - target.x1;
  const dy = target.y2 - target.y1;
  const len2 = dx * dx + dy * dy;
  if (!len2) return;
  const paramOf = (q) => ((q.x - target.x1) * dx + (q.y - target.y1) * dy) / len2;
  const tClick = paramOf(point);

  let hit = null;
  let hitDistance = Infinity;
  segments.forEach((s) => {
    if (s.element === target.element) return;
    const crossing = infiniteIntersection(target, s);
    if (!crossing) return;
    const d = Math.hypot(crossing.x - point.x, crossing.y - point.y);
    if (d < hitDistance) { hitDistance = d; hit = crossing; }
  });
  if (!hit) {
    statusText.textContent = "Ingen skaering at trimme til.";
    return;
  }

  /* Where the crossing sits decides the operation, not where the click landed
     -- the click has to be on the line for it to be picked at all, so it can
     never be past the end. A crossing inside the segment is a trim, and the end
     on the clicked side retreats to it. A crossing beyond an end is an extend,
     and that end reaches out to it. */
  const tHit = paramOf(hit);
  const moveEnd = tHit > 1 ? true : tHit < 0 ? false : tClick > tHit;

  pushHistory();
  if (moveEnd) {
    target.element.setAttribute("x2", hit.x);
    target.element.setAttribute("y2", hit.y);
  } else {
    target.element.setAttribute("x1", hit.x);
    target.element.setAttribute("y1", hit.y);
  }
  pushHistory();
  invalidateGeometry();
  statusText.textContent = tHit > 1 || tHit < 0
    ? "Linje forlaenget til skaering."
    : "Linje trimmet til skaering.";
}

async function linearArraySelection() {
  const answers = await openDialog({
    title: "Linear array",
    description: "Kopierer valget langs en retning.",
    fields: [
      { name: "count", label: "Antal kopier", type: "number", value: 4, min: 1, step: 1 },
      { name: "spacing", label: "Afstand c/c [mm]", type: "number", value: 300, step: 1 },
      { name: "angle", label: "Retning [grader]", type: "number", value: 0, step: 1 },
    ],
    confirmLabel: "Opret",
  });
  if (!answers) return;
  const count = Math.max(1, Number(answers.count) || 0);
  const spacing = Number(answers.spacing) || 0;
  const angle = (Number(answers.angle) || 0) * Math.PI / 180;
  if (!count || !spacing) return;
  const distance = mmToDrawing(spacing);
  duplicateSelectionBy(Math.cos(angle) * distance, Math.sin(angle) * distance, count);
  statusText.textContent = `Linear array: ${count + 1} stk, ${spacing} mm c/c.`;
}

async function polarArraySelection() {
  const elements = selectedArray();
  const box = selectionBounds(elements);
  if (!box) return;
  const answers = await openDialog({
    title: "Polar array",
    description: "Kopierer valget rundt om dets eget centrum.",
    fields: [
      { name: "count", label: "Antal i alt", type: "number", value: 6, min: 2, step: 1 },
      { name: "sweep", label: "Vinkel [grader]", type: "number", value: 360, step: 1 },
    ],
    confirmLabel: "Opret",
  });
  if (!answers) return;
  const count = Math.max(2, Number(answers.count) || 0);
  const sweep = Number(answers.sweep) || 0;
  if (!count || !sweep) return;
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  pushHistory();
  const clones = [];
  const step = sweep / count;
  for (let i = 1; i < count; i += 1) {
    const angle = i * step * Math.PI / 180;
    elements.forEach((element) => {
      const clone = element.cloneNode(true);
      clone.classList.remove("selected", "hovered");
      stripElementIds(clone);
      const itemCenter = elementCenter(element);
      const rx = itemCenter.x - center.x;
      const ry = itemCenter.y - center.y;
      const target = {
        x: center.x + rx * Math.cos(angle) - ry * Math.sin(angle),
        y: center.y + rx * Math.sin(angle) + ry * Math.cos(angle),
      };
      moveElement(clone, target.x - itemCenter.x, target.y - itemCenter.y);
      setElementRotation(clone, Number(clone.dataset.rotation || 0) + i * step);
      drawingLayer.append(clone);
      clones.push(clone);
    });
  }
  clearSelection();
  clones.forEach(addToSelection);
  pushHistory();
  lastOperation = { type: "polar-array" };
  statusText.textContent = `Polar array: ${count} stk over ${sweep} grader.`;
}

async function fastenerRowSelection() {
  const elements = selectedArray().filter((element) => ["bolt", "boltSide", "screw"].includes(element.dataset.type));
  if (!elements.length) {
    statusText.textContent = "Marker en bolt eller skrue foerst.";
    return;
  }
  const answers = await openDialog({
    title: "Fastener row",
    description: "Gentager den valgte bolt eller skrue i en raekke.",
    fields: [
      { name: "count", label: "Antal i alt", type: "number", value: 6, min: 2, step: 1 },
      { name: "spacing", label: "Afstand c/c [mm]", type: "number", value: 40, step: 1 },
      { name: "angle", label: "Retning [grader]", type: "number", value: 0, step: 1 },
    ],
    confirmLabel: "Opret",
  });
  if (!answers) return;
  const count = Math.max(2, Number(answers.count) || 0);
  const spacing = Number(answers.spacing) || 0;
  const angle = (Number(answers.angle) || 0) * Math.PI / 180;
  if (!count || !spacing) return;
  duplicateSelectionBy(Math.cos(angle) * mmToDrawing(spacing), Math.sin(angle) * mmToDrawing(spacing), count - 1);
  statusText.textContent = `Fastener row: ${count} stk med ${spacing} mm c/c.`;
}

function autoLabelSelection() {
  const elements = selectedArray();
  if (!elements.length) return;
  pushHistory();
  const leaders = elements.map((element) => {
    const box = getElementBounds(element);
    const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const end = { x: box.x + box.width + 72, y: box.y - 18 };
    const label = tagForElement(element);
    const leader = makeLeader(start, end, label);
    leader.dataset.tagSourceType = element.dataset.type || "";
    leader.dataset.tagSource = describeElement(element);
    drawingLayer.append(leader);
    return leader;
  });
  clearSelection();
  leaders.forEach(addToSelection);
  pushHistory();
  statusText.textContent = `${leaders.length} type-tags oprettet med leaders.`;
}

function groupSelection() {
  const elements = selectedArray();
  if (elements.length < 2) return;
  pushHistory();
  const group = createSvgElement("g", {
    color: elements[0].dataset.color || strokeColor.value,
  });
  group.classList.add("draw-item");
  group.dataset.type = "group";
  group.dataset.layer = elementLayer(elements[0]);
  group.dataset.color = elements[0].dataset.color || strokeColor.value;
  elements.forEach((element) => {
    element.classList.remove("draw-item", "selected", "hovered");
    element.dataset.groupChild = "true";
    group.append(element);
  });
  drawingLayer.append(group);
  clearSelection();
  selectOnly(group);
  pushHistory();
  statusText.textContent = `${elements.length} elementer grupperet.`;
}

function ungroupSelection() {
  const groups = selectedArray().filter((element) => element.dataset.type === "group");
  if (!groups.length) return;
  pushHistory();
  const released = [];
  groups.forEach((group) => {
    Array.from(group.children).forEach((child) => {
      child.classList.add("draw-item");
      child.classList.remove("selected", "hovered");
      delete child.dataset.groupChild;
      drawingLayer.insertBefore(child, group);
      released.push(child);
    });
    group.remove();
  });
  clearSelection();
  released.forEach(addToSelection);
  pushHistory();
  statusText.textContent = `${released.length} elementer frigjort fra gruppe.`;
}

function lockSelection(locked) {
  const elements = selectedArray();
  if (!elements.length) return;
  pushHistory();
  elements.forEach((element) => {
    element.dataset.locked = locked ? "true" : "false";
    element.classList.toggle("locked", locked);
    if (locked) element.classList.remove("selected");
  });
  if (locked) selectedElements.clear();
  updateSelectionUi();
  pushHistory();
  statusText.textContent = locked ? "Valgte elementer laast." : "Valgte elementer laast op.";
}

function repeatLastOperation() {
  if (!lastOperation) return;
  if (lastOperation.type === "duplicate-offset") duplicateSelectionBy(lastOperation.dx, lastOperation.dy, lastOperation.count, lastOperation.rotateStep);
  if (lastOperation.type === "rotate") rotateSelectionBy(lastOperation.degrees);
  if (lastOperation.type === "align") alignSelection(lastOperation.axis, lastOperation.mode);
  if (lastOperation.type === "distribute") distributeSelection(lastOperation.axis);
}

function draftingStyleForElement(element) {
  const type = element.dataset.type || "";
  const layer = element.dataset.layer || "";
  const lineType = element.dataset.lineType || "solid";
  if (type === "measure") return { color: "#111111", width: 0.55, lineType: "solid", opacity: 100 };
  if (type === "weld") return { color: "#111111", width: 0.8, lineType: "solid", opacity: 100 };
  if (type === "breakLine") return { color: "#111111", width: 0.35, lineType: "solid", opacity: 100 };
  if (type === "polyline") return { color: strokeColor.value, width: Number(strokeWidth.value) || 0.35, lineType: "solid", opacity: 100 };
  if (type === "leader" || layer === "notes") return { color: "#111111", width: 0.65, lineType, opacity: 100 };
  if (type === "text" || type === "detailTitle") return { color: "#111111", width: 0.4, lineType: "solid", opacity: 100 };
  if (type === "manufacturerComponent") return { color: "#111111", width: 0.58, lineType: "solid", opacity: 100 };
  if (type === "screw") return { color: "#111111", width: element.dataset.manufacturer ? 0.35 : 0.75, lineType: "solid", opacity: 100 };
  if (type === "fastenerMarker" || type === "bolt" || type === "boltSide") return { color: "#111111", width: 0.75, lineType: "solid", opacity: 100 };
  if (type === "hatch" || layer === "timber" || layer === "masonry") return { color: "#111111", width: 0.65, lineType, opacity: 100 };
  if (lineType === "center" || lineType === "hidden" || lineType === "construction" || lineType === "phantom") {
    return { color: "#111111", width: 0.55, lineType, opacity: lineType === "construction" ? 38 : 65 };
  }
  return { color: "#111111", width: 1.05, lineType, opacity: 100 };
}

function polishSelection() {
  const elements = selectedArray();
  if (!elements.length) return;
  pushHistory();
  elements.forEach((element) => {
    applyDrawStyle(element, draftingStyleForElement(element));
    renderObject(element);
  });
  renderSelectionOverlay();
  renderElementList();
  updatePropertyPanel();
  pushHistory();
  statusText.textContent = `${elements.length} elementer fik teknisk lineweight-hierarki.`;
}

function syncHudStyleLabels() {
  strokeWidthValue.textContent = `${Number(strokeWidth.value).toFixed(2).replace(".", ",")} mm`;
  strokeOpacityValue.textContent = `${strokeOpacity.value}%`;
}

function pickStyleFromSelection() {
  const element = selectedArray()[0];
  if (!element) return;
  const style = elementStyle(element);
  strokeColor.value = style.color;
  strokeWidth.value = String(Math.max(Number(strokeWidth.min || 1), Math.min(Number(strokeWidth.max || 12), style.width)));
  strokeOpacity.value = String(style.opacity);
  if (lineStyleMap[style.lineType] !== undefined) lineTypeSelect.value = style.lineType;
  syncHudStyleLabels();
  statusText.textContent = `Style hentet fra ${describeElement(element)}.`;
}

function applyCurrentStyleToSelection() {
  const elements = selectedArray();
  if (!elements.length) return;
  pushHistory();
  elements.forEach((element) => {
    applyDrawStyle(element, currentDrawStyle());
    renderObject(element);
  });
  renderSelectionOverlay();
  updatePropertyPanel();
  pushHistory();
  statusText.textContent = `Aktiv style brugt paa ${elements.length} elementer.`;
}

/* --- Offset, mirror, typed move -------------------------------------------
   The three editing commands a drafter reaches for constantly and that had no
   equivalent here: a parallel copy at a stated distance, a reflection, and a
   move by a number rather than by dragging and hoping. */

/* Offset understands the objects whose geometry is points: everything else is
   reported rather than silently skipped. */
function offsetGeometry(element, distMm) {
  const d = distMm / getScaleValue();
  const type = element.dataset.type;
  const tag = element.tagName.toLowerCase();

  if (type === "line" || tag === "line") {
    const x1 = Number(element.getAttribute("x1"));
    const y1 = Number(element.getAttribute("y1"));
    const x2 = Number(element.getAttribute("x2"));
    const y2 = Number(element.getAttribute("y2"));
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const nx = -(y2 - y1) / len * d;
    const ny = (x2 - x1) / len * d;
    const clone = makeLine({ x: x1 + nx, y: y1 + ny }, { x: x2 + nx, y: y2 + ny });
    return clone;
  }

  if (type === "polyline") {
    const pts = polylinePoints(element);
    const closed = element.dataset.closed === "true";
    const ring = closed ? pts.concat([pts[0]]) : pts;
    /* On a closed shape the segment normal points inward or outward depending
       on which way the points happen to wind, so the same +100 grew one plate
       and shrank the next. Take the winding out of it: positive always grows. */
    let side = 1;
    if (closed) {
      let twiceArea = 0;
      for (let i = 0; i < ring.length - 1; i += 1) {
        twiceArea += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
      }
      side = twiceArea > 0 ? -1 : 1;
    }
    /* Offset every segment, then meet the neighbours at the mitre. Parallel
       neighbours have no intersection, so they keep the offset endpoint. */
    const segs = [];
    for (let i = 0; i < ring.length - 1; i += 1) {
      const [ax, ay] = ring[i];
      const [bx, by] = ring[i + 1];
      const len = Math.hypot(bx - ax, by - ay) || 1;
      const nx = -(by - ay) / len * d * side;
      const ny = (bx - ax) / len * d * side;
      segs.push([[ax + nx, ay + ny], [bx + nx, by + ny]]);
    }
    const meet = (s1, s2) => {
      const [[x1, y1], [x2, y2]] = s1;
      const [[x3, y3], [x4, y4]] = s2;
      const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
      if (Math.abs(den) < 1e-9) return null;
      const a = x1 * y2 - y1 * x2;
      const b = x3 * y4 - y3 * x4;
      return [(a * (x3 - x4) - (x1 - x2) * b) / den, (a * (y3 - y4) - (y1 - y2) * b) / den];
    };
    const out = [];
    if (!closed) out.push(segs[0][0]);
    for (let i = 0; i < segs.length - 1; i += 1) {
      out.push(meet(segs[i], segs[i + 1]) || segs[i][1]);
    }
    if (closed) {
      const corner = meet(segs.at(-1), segs[0]);
      if (corner) out.unshift(corner);
    } else {
      out.push(segs.at(-1)[1]);
    }
    return makePolyline(out, closed);
  }

  if (type === "rect" || type === "hatch") {
    if (tag !== "rect") return null;
    const x = Number(element.getAttribute("x"));
    const y = Number(element.getAttribute("y"));
    const w = Number(element.getAttribute("width"));
    const h = Number(element.getAttribute("height"));
    if (w + 2 * d <= 0 || h + 2 * d <= 0) return null;
    return makeRect({ x: x - d, y: y - d }, { x: x + w + d, y: y + h + d });
  }

  if (type === "circle" || tag === "circle") {
    const cx = Number(element.getAttribute("cx"));
    const cy = Number(element.getAttribute("cy"));
    const r = Number(element.getAttribute("r")) + d;
    if (r <= 0) return null;
    return makeCircle({ x: cx, y: cy }, { x: cx + r, y: cy });
  }

  return null;
}

async function offsetSelection() {
  const targets = selectedArray().filter((element) => !isElementLocked(element));
  if (!targets.length) return;
  const answers = await openDialog({
    title: "Offset",
    description: "Parallel kopi i den angivne afstand. Negativ afstand vender siden.",
    fields: [{ name: "distance", label: "Afstand [mm]", type: "number", value: 100, step: 1 }],
    confirmLabel: "Offset",
  });
  if (!answers) return;
  const dist = Number(answers.distance);
  if (!Number.isFinite(dist) || dist === 0) return;
  pushHistory();
  const made = [];
  let skipped = 0;
  targets.forEach((element) => {
    const clone = offsetGeometry(element, dist);
    if (!clone) { skipped += 1; return; }
    applyLayer(clone, elementLayer(element));
    drawingLayer.append(clone);
    made.push(clone);
  });
  if (!made.length) {
    statusText.textContent = "Offset virker paa linjer, polylinjer, rektangler og cirkler.";
    return;
  }
  clearSelection();
  made.forEach(addToSelection);
  pushHistory();
  statusText.textContent = `Offset ${dist} mm: ${made.length} kopier${skipped ? `, ${skipped} objekter sprunget over` : ""}.`;
}

async function mirrorSelection() {
  const targets = selectedArray().filter((element) => !isElementLocked(element));
  if (!targets.length) return;
  const answers = await openDialog({
    title: "Spejl",
    description: "Spejler om midten af det valgte.",
    fields: [
      { name: "axis", label: "Akse", type: "select", value: "vertical", options: [
        { value: "vertical", label: "Lodret akse (venstre/hoejre)" },
        { value: "horizontal", label: "Vandret akse (op/ned)" },
      ] },
      { name: "keep", label: "Behold originalen", type: "select", value: "copy", options: [
        { value: "copy", label: "Ja - lav en spejlet kopi" },
        { value: "move", label: "Nej - spejl det valgte" },
      ] },
    ],
    confirmLabel: "Spejl",
  });
  if (!answers) return;
  const box = selectionBounds(targets);
  if (!box) return;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const sx = answers.axis === "vertical" ? -1 : 1;
  const sy = answers.axis === "vertical" ? 1 : -1;
  pushHistory();
  const worked = [];
  targets.forEach((element) => {
    const node = answers.keep === "copy" ? element.cloneNode(true) : element;
    if (answers.keep === "copy") {
      node.classList.remove("selected", "hovered");
      stripElementIds(node);
      drawingLayer.append(node);
    }
    const current = node.transform?.baseVal?.consolidate();
    const base = current ? current.matrix : svg.createSVGMatrix();
    const mirror = svg.createSVGMatrix().translate(cx, cy).scaleNonUniform(sx, sy).translate(-cx, -cy);
    node.transform.baseVal.initialize(svg.createSVGTransformFromMatrix(mirror.multiply(base)));
    worked.push(node);
  });
  invalidateGeometry();
  clearSelection();
  worked.forEach(addToSelection);
  pushHistory();
  statusText.textContent = `Spejlet om ${answers.axis === "vertical" ? "lodret" : "vandret"} akse.`;
}

async function moveSelectionByNumbers() {
  const targets = selectedArray().filter((element) => !isElementLocked(element));
  if (!targets.length) return;
  const answers = await openDialog({
    title: "Flyt",
    description: "Flytter det valgte med en angivet afstand.",
    fields: [
      { name: "dx", label: "X [mm]", type: "number", value: 0, step: 1 },
      { name: "dy", label: "Y [mm] (positiv = ned)", type: "number", value: 0, step: 1 },
    ],
    confirmLabel: "Flyt",
  });
  if (!answers) return;
  const dx = Number(answers.dx) / getScaleValue();
  const dy = Number(answers.dy) / getScaleValue();
  if (!dx && !dy) return;
  pushHistory();
  targets.forEach((element) => moveElement(element, dx, dy));
  invalidateGeometry();
  renderSelectionOverlay();
  pushHistory();
  statusText.textContent = `Flyttet ${answers.dx} / ${answers.dy} mm.`;
}

/* --- Hatch angle and scale -------------------------------------------------
   The patterns are shared defs, so rotating one hatch rotated every hatch in
   the drawing. A hatch that states an angle or a scale gets its own pattern,
   cloned from the shared one, and points its fill at that. */
function hatchVariantId(base, angle, scale) {
  return `hatch-${base}-a${Math.round(angle)}-s${Math.round(scale * 100)}`;
}

function ensureHatchVariant(base, angle, scale) {
  const id = hatchVariantId(base, angle, scale);
  if (document.getElementById(id)) return id;
  const source = document.getElementById(`hatch-${base}`);
  if (!source) return null;
  const clone = source.cloneNode(true);
  clone.id = id;
  /* Store the intent, not the resolved transform: refreshHatchScale restates
     the plot scale on top of this every time the sheet scale changes. */
  const baseTransform = `rotate(${angle}) scale(${scale})`;
  clone.dataset.baseTransform = baseTransform;
  clone.setAttribute("patternTransform", `scale(${Math.max(0.05, Number(sheet.plotScale) || 1)}) ${baseTransform}`);
  source.parentNode.append(clone);
  return id;
}

function applyHatchAppearance(element) {
  const base = element.dataset.hatch;
  if (!base) return;
  const angle = Number(element.dataset.hatchAngle || 0);
  const scale = Number(element.dataset.hatchScale || 1);
  if (!angle && Math.abs(scale - 1) < 1e-6) {
    element.setAttribute("fill", `url(#hatch-${base})`);
    return;
  }
  const id = ensureHatchVariant(base, angle, scale);
  if (id) element.setAttribute("fill", `url(#${id})`);
}

function updateSelectedHatchAppearance() {
  const targets = selectedArray().filter((element) => element.dataset.type === "hatch");
  if (!targets.length) return;
  targets.forEach((element) => {
    element.dataset.hatchAngle = String(Number(hatchAngleInput?.value) || 0);
    element.dataset.hatchScale = String(Number(hatchScaleInput?.value) || 1);
    applyHatchAppearance(element);
  });
  pushHistorySoon();
  statusText.textContent = `Skravering: ${hatchAngleInput?.value || 0} grader, skala ${hatchScaleInput?.value || 1}.`;
}

function handleSelectionAction(action) {
  if (action === "show-all") {
    showAllElements();
    return;
  }
  if (!selectedElements.size) return;
  if (action === "duplicate") duplicateSelection();
  if (action === "offset") offsetSelection();
  if (action === "mirror") mirrorSelection();
  if (action === "move-by") moveSelectionByNumbers();
  if (action === "copy-ref") beginCopyWithReference();
  if (action === "leader-label") autoLabelSelection();
  if (action === "detail-polish") polishSelection();
  if (action === "pick-style") pickStyleFromSelection();
  if (action === "apply-style") applyCurrentStyleToSelection();
  if (action === "select-similar") selectSimilarSelection();
  if (action === "isolate") isolateSelection();
  if (action === "show-all") showAllElements();
  if (action === "group") groupSelection();
  if (action === "ungroup") ungroupSelection();
  if (action === "lock") lockSelection(true);
  if (action === "unlock") lockSelection(false);
  if (action === "bring-front") bringSelectionToFront();
  if (action === "send-back") sendSelectionToBack();
  if (action === "bring-forward") bringSelectionForward();
  if (action === "send-backward") sendSelectionBackward();
  if (action === "align-left") alignSelection("x", "start");
  if (action === "align-center") alignSelection("x", "center");
  if (action === "align-top") alignSelection("y", "start");
  if (action === "distribute-h") distributeSelection("x");
  if (action === "distribute-v") distributeSelection("y");
  if (action === "rotate-90") rotateSelectionBy(90);
  if (action === "mirror-h") mirrorSelection("x");
  if (action === "mirror-v") mirrorSelection("y");
  if (action === "offset") offsetSelection();
  if (action === "array-linear") linearArraySelection();
  if (action === "fastener-row") fastenerRowSelection();
  if (action === "array-polar") polarArraySelection();
}

function beginSelectionOrDrag(event, targetItem) {
  const point = getPointerPoint(event);
  if (isElementLocked(targetItem)) {
    statusText.textContent = "Objektet eller laget er laast.";
    return;
  }
  const alreadySelected = selectedElements.has(targetItem);
  if (event.shiftKey || event.ctrlKey || event.metaKey) {
    toggleSelection(targetItem);
    dragState = null;
    updateCanvasCursor();
    return;
  } else if (!alreadySelected) {
    selectOnly(targetItem);
  }
  dragState = {
    start: point,
    previous: point,
    screenStart: { x: event.clientX, y: event.clientY },
    started: false,
    additiveClick: event.shiftKey || event.ctrlKey || event.metaKey,
    target: targetItem,
  };
  svg.setPointerCapture(event.pointerId);
  updateCanvasCursor();
}

function cancelCurrentInteraction(options = {}) {
  if (underlayCalibrationState) {
    cancelUnderlayCalibration();
    return true;
  }
  if (placementState) {
    cancelPlacement();
    return true;
  }
  if (startPoint || previewElement || marqueeState || dragState || gripState) {
    clearNumericEntry();
    clearDrawAnchor();
    startPoint = null;
    dragState = null;
    gripState = null;
    clearMarqueePreviewSelection();
    if (marqueeState?.rect) marqueeState.rect.remove();
    marqueeState = null;
    clearPreview();
    statusText.textContent = "Kommando annulleret.";
    updateCanvasCursor();
    return true;
  }
  if (selectedElements.size && !options.keepSelection) {
    clearSelection();
    statusText.textContent = "Valg ryddet.";
    return true;
  }
  if (activeTool !== "select") {
    setActiveTool("select");
    return true;
  }
  return false;
}

document.querySelectorAll(".tool-button").forEach((button) => {
  button.addEventListener("click", () => setActiveTool(button.dataset.tool));
});

panelToggles.forEach((button) => {
  button.addEventListener("click", () => {
    const panelName = button.dataset.panelTarget;
    openPanel(document.body.dataset.openPanel === panelName ? "properties" : panelName);
  });
});

closePanelButton.addEventListener("click", closePanel);

selectionBar.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (!action) return;
  hideOverflowMenu();
  handleSelectionAction(action);
});

document.querySelectorAll(".symbol-button").forEach((button) => {
  button.addEventListener("click", () => insertSymbol(button.dataset.symbol));
});

document.getElementById("insertProfile").addEventListener("click", insertProfile);
document.getElementById("insertBolt").addEventListener("click", insertBolt);
document.getElementById("insertBoltSide").addEventListener("click", insertBoltSide);
document.getElementById("insertScrew").addEventListener("click", insertScrew);
document.getElementById("insertLibraryComponent").addEventListener("click", insertLibraryComponent);
document.getElementById("insertConnection")?.addEventListener("click", insertConnection);
componentSource.addEventListener("change", updateComponentSourceUi);
componentManufacturer.addEventListener("change", populateComponentLibrary);
componentCategory.addEventListener("change", updateComponentItems);
componentItem.addEventListener("change", () => {
  updateComponentVariants();
  updateComponentPreview();
  renderComponentBrowser();
});
componentVariant.addEventListener("change", () => {
  updateComponentPreview();
  renderComponentBrowser();
});
componentView.addEventListener("change", () => {
  ensureComponentViewsLoaded();
  updateComponentPreview();
  renderComponentBrowser();
});
componentSearch.addEventListener("input", updateComponentItems);
/* The same controls edit the selection, the way the Trae panel does. Without
   this the parameters would only be reachable at the moment of placement --
   which is how a bolt ends up being redrawn from scratch every time a detail
   changes. */
const boltControls = [boltSelect, boltGrade, boltViewSelect, boltHeadForm, boltLengthInput,
  boltThreadInput, boltExtensionInput, boltShowShank, boltShowNut, boltThinNut,
  boltNutWasher, boltHeadWasher, boltSpringWasher, boltSymbolic];
boltControls.forEach((control) => {
  control?.addEventListener("input", () => {
    const targets = selectedArray().filter((element) => element.dataset.type === "bolt" || element.dataset.type === "boltSide");
    if (!targets.length) return;
    const options = boltUiOptions();
    targets.forEach((element) => {
      const key = boltSelect.value;
      const bolt = boltCatalog[key];
      element.dataset.bolt = key;
      element.dataset.grade = boltGrade.value;
      writeBoltOptions(element, options);
      if (element.dataset.type === "bolt") {
        element.dataset.material = boltGrade.value;
        element.dataset.showHead = boltViewSelect.value === "head" ? "true" : "false";
        element.dataset.dimension = `${key}, hul ${boltHoleMm(bolt)} mm`;
      } else {
        element.dataset.material = `Grade ${boltGrade.value}`;
        /* Only the caption this file wrote itself is restated; a name typed by
           the user, or one carried in from a template, is left alone. */
        if (/side-view bolt assembly$/.test(element.dataset.dimension || "")) {
          element.dataset.dimension = `${key} side-view bolt assembly`;
        }
      }
      renderObject(element);
    });
    renderSelectionOverlay();
    updatePropertyPanel();
    pushHistorySoon();
  });
});

document.getElementById("insertSheetFrame").addEventListener("click", insertSheetFrame);
document.getElementById("insertDetailViewport").addEventListener("click", insertDetailViewport);
document.getElementById("insertDetailTitle").addEventListener("click", insertDetailTitle);
document.getElementById("insertTrussTemplate").addEventListener("click", insertTrussTemplate);
document.getElementById("insertBeamColumnTemplate").addEventListener("click", insertBeamColumnTemplate);
document.getElementById("insertPolishedConnectionTemplate").addEventListener("click", insertPolishedConnectionTemplate);
Object.keys(bearingDetailTemplates).forEach((key) => {
  document.getElementById(key)?.addEventListener("click", () => insertBearingDetail(key));
});
document.getElementById("importPlan").addEventListener("click", () => planImport.click());
planImport.addEventListener("change", () => {
  importPlanFile(planImport.files[0]);
  planImport.value = "";
});

pdfPageSelect.addEventListener("change", renderPdfPage);
pdfRotation.addEventListener("change", renderPdfPage);

contextMenu.addEventListener("click", (event) => {
  const action = event.target.dataset.contextAction;
  if (!action) return;
  if (action === "duplicate") duplicateSelection();
  if (action === "offset") offsetSelection();
  if (action === "mirror") mirrorSelection();
  if (action === "move-by") moveSelectionByNumbers();
  if (action === "flip-break") flipBreakLineSide();
  if (action === "copy-ref") beginCopyWithReference();
  if (action === "group") groupSelection();
  if (action === "ungroup") ungroupSelection();
  if (action === "lock") lockSelection(true);
  if (action === "unlock") lockSelection(false);
  if (action === "select-similar") selectSimilarSelection();
  if (action === "pick-style") pickStyleFromSelection();
  if (action === "apply-style") applyCurrentStyleToSelection();
  if (action === "isolate") isolateSelection();
  if (action === "show-all") showAllElements();
  if (action === "bring-front") bringSelectionToFront();
  if (action === "bring-forward") bringSelectionForward();
  if (action === "send-backward") sendSelectionBackward();
  if (action === "send-back") sendSelectionToBack();
  if (action === "delete") deleteSelection();
  hideContextMenu();
});

window.addEventListener("pointerdown", (event) => {
  if (!contextMenu.hidden && !contextMenu.contains(event.target)) hideContextMenu();
});

svg.addEventListener("pointerdown", (event) => {
  hideContextMenu();
  hideOverflowMenu();

  if (underlayCalibrationState && event.button === 0) {
    event.preventDefault();
    handleUnderlayCalibrationClick(getPointerPoint(event));
    return;
  }

  const grip = event.target.closest(".selection-grip");
  if (grip && beginGripDrag(event, grip)) return;
  const targetItem = hitTestDrawItem(event, pickTolerance(12));

  if (event.button === 1 || spacePressed) {
    event.preventDefault();
    panState = { x: event.clientX, y: event.clientY };
    svg.setPointerCapture(event.pointerId);
    updateCanvasCursor();
    return;
  }

  if (placementState) {
    event.preventDefault();
    if (event.button === 2) {
      cancelPlacement();
      return;
    }
    if (event.button === 0) {
      finishPlacement(getPointerPoint(event), event);
      return;
    }
  }

  if (event.button === 2) {
    event.preventDefault();
    suppressNativeContextMenu = true;
    if (startPoint || marqueeState || dragState) {
      cancelCurrentInteraction();
      return;
    }
    beginMarquee(getPointerPoint(event, false), { rightButton: true, contextTarget: targetItem });
    svg.setPointerCapture(event.pointerId);
    statusText.textContent = "Traek for at markere med hoejreklik. Slip uden at traekke for menu.";
    return;
  }

  /* An active drawing tool owns the canvas. Existing geometry is snap material
     while a tool is armed, never a drag target -- pressing L and clicking on a
     member has to start a line from it, not pick it up. The user already stated
     their intent by choosing the tool. */
  if (targetItem && !startPoint && !isDrawingTool()) {
    beginSelectionOrDrag(event, targetItem);
    return;
  }

  /* An unlocked underlay is grabbable on empty paper; drawing tools and real
     geometry still take precedence. */
  if (event.button === 0 && !isDrawingTool() && underlayIsMovable() && pointInUnderlay(getPointerPoint(event, false))) {
    event.preventDefault();
    beginUnderlayDrag(event, getPointerPoint(event, false));
    return;
  }

  if (activeTool === "select" || !isDrawingTool()) {
    beginMarquee(getPointerPoint(event, false));
    svg.setPointerCapture(event.pointerId);
    return;
  }

  if (activeTool === "text") {
    createTextAtPoint(getPointerPoint(event));
    return;
  }

  /* Click-click point entry. A drawing tool that is already armed treats this
     press as the second point and commits, which is what makes typed
     dimensions usable at all -- you cannot hold the mouse button down and type
     a length at the same time. Press-drag-release still works: a real drag
     travels further than DRAW_CLICK_SLOP and commits on pointerup instead. */
  if (activeTool === "trim" && event.button === 0) {
    event.preventDefault();
    performTrim(getPointerPoint(event, false));
    return;
  }

  if (startPoint && isDrawingTool() && activeTool !== "text") {
    const point = getPointerPoint(event);
    /* finishShape is async -- the leader branch awaits a dialog -- so the chain
       re-arms once it has actually committed rather than racing it. */
    Promise.resolve(finishShape(point)).then(() => {
      if (activeTool !== "line") return;
      /* A polyline is just the line tool refusing to let go: the segment that
         committed leaves its end armed as the next start. Esc ends the chain. */
      startPoint = point;
      lastDrawPoint = point;
      drawPressScreen = null;
      showDrawAnchor(point);
      statusText.textContent = "Fortsaet polylinjen, eller Esc for at afslutte.";
    });
    return;
  }

  if (activeTool === "polyline") {
    addPolylinePoint(getPointerPoint(event));
    svg.setPointerCapture(event.pointerId);
    return;
  }

  if (selectedElements.size) clearSelection();
  startPoint = getPointerPoint(event);
  /* Seed the cursor reference with the anchor itself. lastDrawPoint is only
     written while already armed, so without this the first typed length was
     resolved against wherever the PREVIOUS shape ended -- "click, type 2400,
     Enter" drew 2400 mm at an arbitrary inherited angle. Typing an angle too
     masked it, which is exactly how it got through testing. */
  lastDrawPoint = startPoint;
  drawPressScreen = { x: event.clientX, y: event.clientY };
  showDrawAnchor(startPoint);
  svg.setPointerCapture(event.pointerId);
  updateCanvasCursor();
});

svg.addEventListener("dblclick", async (event) => {
  if (polylineDraftActive()) {
    event.preventDefault();
    finishPolyline(false);
    return;
  }
  const target = hitTestDrawItem(event, 12);
  if (!target) {
    fitToContent();
    return;
  }
  selectOnly(target);
  const edited = await editElementText(target);
  if (!edited) zoomToSelection();
});

svg.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  if (suppressNativeContextMenu) {
    suppressNativeContextMenu = false;
    return;
  }
  showContextMenu(event, hitTestDrawItem(event, 12));
});

svg.addEventListener("pointerover", (event) => {
  updateHoverFromEvent(event);
});

svg.addEventListener("pointerout", (event) => {
  if (!svg.contains(event.relatedTarget)) setHoveredElement(null);
});

canvasWrap.addEventListener("wheel", (event) => {
  if (placementState) {
    event.preventDefault();
    placementState.rotation += event.deltaY < 0 ? 15 : -15;
    const point = svgPointFromScreen(event.clientX, event.clientY);
    renderPlacementPreview(snapPoint({ x: point.x, y: point.y }, event));
    statusText.textContent = `${placementLabel()} roteret til ${Math.round(placementState.rotation)} grader.`;
    return;
  }
  event.preventDefault();
  if (event.ctrlKey || event.metaKey) {
    zoomByFactor(Math.exp(-event.deltaY * 0.0022), { x: event.clientX, y: event.clientY });
    return;
  }
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? svgClientSize().height : 1;
  if (event.shiftKey) panByScreen(-event.deltaY * unit, 0);
  else panByScreen(-event.deltaX * unit, -event.deltaY * unit);
}, { passive: false });

svg.addEventListener("pointermove", (event) => {
  if (panState) {
    panByScreen(event.clientX - panState.x, event.clientY - panState.y);
    panState.x = event.clientX;
    panState.y = event.clientY;
    return;
  }

  if (underlayDragState) {
    updateUnderlayDrag(getPointerPoint(event, false));
    return;
  }

  if (underlayCalibrationState?.first) {
    renderCalibrationPreview(getPointerPoint(event));
    return;
  }

  if (gripState) {
    const gripPoint = getPointerPoint(event);
    updateGripTarget(gripState.element, gripState.role, gripPoint, event);
    updateCursorReadout(gripPoint);
    updateSnapReadout();
    return;
  }

  if (placementState) {
    renderPlacementPreview(getPointerPoint(event));
    return;
  }

  const point = getPointerPoint(event, !marqueeState);
  if (dragState) {
    const screenDistance = Math.hypot(event.clientX - dragState.screenStart.x, event.clientY - dragState.screenStart.y);
    if (!dragState.started && screenDistance < dragThresholdPx) return;
    if (!dragState.started) {
      dragState.started = true;
      pushHistory();
      statusText.textContent = `${selectedElements.size} elementer flyttes.`;
      updateCanvasCursor();
    }
    const dx = point.x - dragState.previous.x;
    const dy = point.y - dragState.previous.y;
    moveSelection(dx, dy);
    dragState.previous = point;
    updateCursorReadout(point);
    updateLengthReadout(dragState.start, point);
    return;
  }

  if (marqueeState) {
    updateMarquee(point);
    updateCursorReadout(point);
    return;
  }

  if (startPoint) {
    lastDrawPoint = point;
    updatePreview(numericEntryActive() ? numericEntryPoint() : point);
  }
  updateHoverFromEvent(event);
  updateCursorReadout(point);
  updateLengthReadout(startPoint, startPoint ? point : null);
  updateSnapReadout();
});

svg.addEventListener("pointerup", (event) => {
  if (underlayDragState) {
    finishUnderlayDrag();
    return;
  }

  if (panState) {
    panState = null;
    updateCanvasCursor();
    return;
  }

  if (gripState) {
    gripState = null;
    pushHistory();
    statusText.textContent = "Geometri opdateret.";
    return;
  }

  if (dragState) {
    const moved = dragState.started;
    dragState = null;
    updateCanvasCursor();
    if (moved) {
      pushHistory();
      statusText.textContent = "Valg flyttet.";
    }
    return;
  }

  if (marqueeState) {
    if (marqueeState.rightButton) {
      finishRightMarquee(event);
      return;
    }
    finishMarquee(event.shiftKey || event.ctrlKey || event.metaKey);
    return;
  }

  if (startPoint && activeTool !== "text") {
    /* Released without really moving: treat it as the first click of a
       click-click pair and stay armed, so the next click -- or a typed
       dimension -- sets the second point. */
    const travel = drawPressScreen
      ? Math.hypot(event.clientX - drawPressScreen.x, event.clientY - drawPressScreen.y)
      : Infinity;
    if (travel < DRAW_CLICK_SLOP) {
      svg.releasePointerCapture?.(event.pointerId);
      /* A click inside a region hatches that region; dragging still sweeps a
         rectangle for the cases where that is genuinely what you want. */
      if (activeTool === "hatch") {
        startPoint = null;
        clearPreview();
        hatchAtPoint(getPointerPoint(event));
        return;
      }
      statusText.textContent = "Saet naeste punkt, eller skriv laengde og tryk Enter.";
      return;
    }
    finishShape(getPointerPoint(event));
  }
  updateLengthReadout(null, null);
});

document.getElementById("deleteSelection").addEventListener("click", () => {
  deleteSelection();
});

document.getElementById("clearCanvas").addEventListener("click", async () => {
  const confirmed = await showConfirm("Ryd hele tegningen?", "Alle elementer slettes. Du kan fortryde med Ctrl+Z.", {
    confirmLabel: "Ryd alt",
    tone: "danger",
  });
  if (!confirmed) return;
  pushHistory();
  drawingLayer.replaceChildren();
  clearSelection();
  statusText.textContent = "Tegnefladen er ryddet.";
  pushHistory();
});

document.getElementById("exportPng").addEventListener("click", exportPng);
document.getElementById("exportSvg").addEventListener("click", exportSvg);
document.getElementById("exportPdf").addEventListener("click", exportPdf);
document.getElementById("undoAction").addEventListener("click", undo);
document.getElementById("redoAction").addEventListener("click", redo);
document.getElementById("saveProject").addEventListener("click", saveProject);
document.getElementById("openProject").addEventListener("click", () => projectImport.click());
projectImport.addEventListener("change", () => {
  openProjectFile(projectImport.files[0]);
  projectImport.value = "";
});
document.getElementById("zoomOut").addEventListener("click", () => zoomByFactor(1 / zoomStepFactor));
document.getElementById("zoomIn").addEventListener("click", () => zoomByFactor(zoomStepFactor));
document.getElementById("zoomFit")?.addEventListener("click", fitToContent);
zoomLabel.addEventListener("click", resetZoom);
gridSize.addEventListener("change", () => {
  updateDotGrid();
  invalidateSnapCache();
  pushHistory();
});
scaleFactor.addEventListener("change", () => setScaleValue(Number(scaleFactor.value), "Manuel"));
underlayOpacity.addEventListener("input", () => {
  underlayOpacityValue.textContent = `${underlayOpacity.value}%`;
  underlayLayer.querySelectorAll(".plan-underlay").forEach((element) => {
    element.setAttribute("opacity", Number(underlayOpacity.value) / 100);
  });
  pushHistorySoon();
});

underlayScale.addEventListener("input", () => {
  underlayScaleValue.textContent = `${underlayScale.value}%`;
  if (underlayState.kind) scaleUnderlayPlacement(underlayScale.value);
  else applyUnderlayBox();
  pushHistorySoon();
});
strokeWidth.addEventListener("input", () => {
  strokeWidthValue.textContent = `${Number(strokeWidth.value).toFixed(2).replace(".", ",")} mm`;
  if (placementState) renderPlacementPreview(placementState.anchor || centerPoint());
  pushHistorySoon();
});
strokeOpacity.addEventListener("input", () => {
  strokeOpacityValue.textContent = `${strokeOpacity.value}%`;
  if (placementState) renderPlacementPreview(placementState.anchor || centerPoint());
  pushHistorySoon();
});
lineTypeSelect.addEventListener("change", () => {
  if (placementState) renderPlacementPreview(placementState.anchor || centerPoint());
  pushHistory();
});
stylePreset.addEventListener("change", () => {
  const preset = stylePresets[stylePreset.value];
  if (!preset) return;
  strokeColor.value = preset.color;
  strokeWidth.value = String(preset.width);
  strokeWidthValue.textContent = `${Number(strokeWidth.value).toFixed(2).replace(".", ",")} mm`;
  strokeOpacity.value = String(preset.opacity);
  strokeOpacityValue.textContent = `${strokeOpacity.value}%`;
  lineTypeSelect.value = preset.lineType;
  if (placementState) renderPlacementPreview(placementState.anchor || centerPoint());
  pushHistory();
});
[profileSelect, boltSelect, boltGrade, boltViewSelect, boltHeadForm, boltLengthInput, boltThreadInput,
  boltExtensionInput, boltShowShank, boltShowNut, boltThinNut, boltNutWasher, boltHeadWasher,
  boltSpringWasher, boltSymbolic, screwSelect, screwViewSelect].forEach((control) => {
  if (!control) return;
  control.addEventListener("change", () => {
    if (placementState) {
      statusText.textContent = `${placementLabel()} klar.`;
      renderPlacementPreview(placementState.anchor || centerPoint());
    }
  });
});
screwFamilySelect?.addEventListener("change", () => {
  populateScrewSizes();
  if (placementState) {
    statusText.textContent = `${placementLabel()} klar.`;
    renderPlacementPreview(placementState.anchor || centerPoint());
  }
});
underlayLocked.addEventListener("change", () => {
  layers.underlay.locked = underlayLocked.checked;
  renderLayerList();
  pushHistory();
});
activeLayer.addEventListener("change", pushHistory);
[propDimension, propMaterial, propRotation, propStrokeWidth, propOpacity, propLayer, propColor, propLineType, propMeasureText, propMeasureMode, propMeasureOffset]
  .forEach((field) => field.addEventListener("input", updateSelectedFromProperties));
propLayer.addEventListener("change", updateSelectedFromProperties);
propLineType.addEventListener("change", updateSelectedFromProperties);
propMeasureMode.addEventListener("change", updateSelectedFromProperties);

[underlayOpacity, underlayScale, underlayLocked, gridSize, scaleFactor, activeLayer, strokeColor, strokeWidth,
  lineTypeSelect, strokeOpacity, stylePreset, pdfPageSelect, pdfRotation, propDimension, propMaterial, propRotation,
  propStrokeWidth, propOpacity, propLayer, propColor, propLineType,
  propMeasureText, propMeasureMode, propMeasureOffset].forEach(trackControlHistory);

window.addEventListener("keydown", (event) => {
  if (dialogOpen) return;
  if (typeof paletteIsOpen === "function" && paletteIsOpen()) return;
  const key = event.key.toLowerCase();
  const ctrl = event.ctrlKey || event.metaKey;

  /* Typed dimensions outrank tool shortcuts: with a line armed, "5" states a
     length, it does not switch tools. Ctrl combos and real inputs are left
     alone. */
  if (!ctrl && !isTypingTarget(event.target) && handleNumericEntryKey(event)) return;

  if (event.code === "Space" && !isTypingTarget(event.target)) {
    event.preventDefault();
    spacePressed = true;
    updateCanvasCursor();
    return;
  }

  if (ctrl && key === "z") {
    event.preventDefault();
    if (event.shiftKey) redo();
    else undo();
    return;
  }

  if (ctrl && key === "y") {
    event.preventDefault();
    redo();
    return;
  }

  if (ctrl && key === "s") {
    event.preventDefault();
    saveProject();
    return;
  }

  if (ctrl && key === "c" && selectedElements.size && !isTypingTarget(event.target)) {
    event.preventDefault();
    copySelection();
    return;
  }

  if (ctrl && key === "v" && !isTypingTarget(event.target)) {
    event.preventDefault();
    pasteSelection();
    return;
  }

  if (ctrl && key === "d" && selectedElements.size && !isTypingTarget(event.target)) {
    event.preventDefault();
    duplicateSelection();
    return;
  }

  if (ctrl && key === "g" && selectedElements.size && !isTypingTarget(event.target)) {
    event.preventDefault();
    if (event.shiftKey) ungroupSelection();
    else groupSelection();
    return;
  }

  if (ctrl && key === "]" && selectedElements.size && !isTypingTarget(event.target)) {
    event.preventDefault();
    if (event.shiftKey) bringSelectionToFront();
    else bringSelectionForward();
    return;
  }

  if (ctrl && key === "[" && selectedElements.size && !isTypingTarget(event.target)) {
    event.preventDefault();
    if (event.shiftKey) sendSelectionToBack();
    else sendSelectionBackward();
    return;
  }

  if (ctrl && event.shiftKey && key === "a" && selectedElements.size && !isTypingTarget(event.target)) {
    event.preventDefault();
    selectSimilarSelection();
    return;
  }

  if (ctrl && key === "i" && selectedElements.size && !isTypingTarget(event.target)) {
    event.preventDefault();
    if (event.shiftKey) showAllElements();
    else isolateSelection();
    return;
  }

  if (ctrl && (key === "+" || key === "=")) {
    event.preventDefault();
    zoomByFactor(zoomStepFactor);
    return;
  }

  if (ctrl && key === "-") {
    event.preventDefault();
    zoomByFactor(1 / zoomStepFactor);
    return;
  }

  if (ctrl && key === "o") {
    event.preventDefault();
    projectImport.click();
    return;
  }

  if (ctrl && key === "0") {
    event.preventDefault();
    resetZoom();
    return;
  }

  if (!ctrl && event.shiftKey && key === "f" && !isTypingTarget(event.target)) {
    event.preventDefault();
    fitToContent();
    return;
  }

  if (!ctrl && event.shiftKey && key === "s" && !isTypingTarget(event.target)) {
    event.preventDefault();
    zoomToSelection();
    return;
  }

  if (!ctrl && !isTypingTarget(event.target) && (event.key === "?" || event.key === "F1")) {
    event.preventDefault();
    toggleShortcuts();
    return;
  }

  if (ctrl && key === "a" && !isTypingTarget(event.target)) {
    event.preventDefault();
    selectAllUnlocked();
    return;
  }

  if (ctrl && key === "b") {
    event.preventDefault();
    pushHistory();
    snapToggle.checked = !snapToggle.checked;
    updateSnapReadout();
    statusText.textContent = snapToggle.checked ? "Snap er slaaet til." : "Snap er slaaet fra.";
    return;
  }

  if (placementState && !ctrl && !event.altKey && !isTypingTarget(event.target)) {
    if (key === "r") {
      event.preventDefault();
      placementState.rotation += event.shiftKey ? -15 : 90;
      renderPlacementPreview(placementState.anchor || centerPoint());
      statusText.textContent = `${placementLabel()} roteret til ${Math.round(placementState.rotation)} grader.`;
      return;
    }
  }

  if (!isTypingTarget(event.target) && polylineDraftActive()) {
    if (event.key === "Enter") { event.preventDefault(); finishPolyline(false); return; }
    if (event.key.toLowerCase() === "c") { event.preventDefault(); finishPolyline(true); return; }
    if (event.key === "Escape") { event.preventDefault(); cancelPolyline(); statusText.textContent = "Polylinje annulleret."; return; }
  }

  if (!isTypingTarget(event.target) && event.key === "Enter") {
    event.preventDefault();
    repeatLastOperation();
    return;
  }

  if (!ctrl && !event.altKey && selectedElements.size && !isTypingTarget(event.target)) {
    const nudges = {
      arrowleft: [-1, 0],
      arrowright: [1, 0],
      arrowup: [0, -1],
      arrowdown: [0, 1],
    };
    if (nudges[key]) {
      event.preventDefault();
      const step = event.shiftKey ? Number(gridSize.value) : Math.max(1, Number(gridSize.value) / 5);
      const [nx, ny] = nudges[key];
      pushHistory();
      moveSelection(nx * step, ny * step);
      renderSelectionOverlay();
      pushHistory();
      statusText.textContent = `Valg flyttet ${Math.round(step * getScaleValue())} mm.`;
      return;
    }
  }

  if (!ctrl && !event.altKey && !isTypingTarget(event.target)) {
    const toolShortcuts = {
      v: "select",
      a: "arrow",
      f: "loadArrow",
      n: "leader",
      w: "weld",
      b: "breakLine",
      l: "line",
      p: "polyline",
      m: "measure",
      k: "calibrate",
      r: "rect",
      h: "hatch",
      e: "circle",
      t: "text",
      x: "trim",
    };
    if (toolShortcuts[key]) {
      event.preventDefault();
      setActiveTool(toolShortcuts[key]);
      return;
    }
  }

  if (!isTypingTarget(event.target) && (event.key === "Delete" || event.key === "Backspace") && selectedElements.size) {
    event.preventDefault();
    deleteSelection();
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    if (shortcutsOverlay && !shortcutsOverlay.hidden) {
      toggleShortcuts(false);
      return;
    }
    if (overflowMenu && !overflowMenu.hidden) {
      hideOverflowMenu();
      return;
    }
    cancelCurrentInteraction();
  }
});

window.addEventListener("keyup", (event) => {
  if (event.code === "Space") {
    spacePressed = false;
    if (panState) panState = null;
    updateCanvasCursor();
  }
});



/* --- Underlay -------------------------------------------------------------
   The imported plan is a *source* (PDF bytes or an image) plus a placement --
   never a bitmap in the document. The <image> node is a cache rebuilt from
   that pair, which keeps multi-megabyte data URLs out of every history
   snapshot and out of the autosave payload, and lets the PDF be re-rasterised
   at whatever resolution the current zoom actually needs. */
const underlayState = {
  kind: null,
  name: "",
  page: 1,
  pageCount: 1,
  rotation: 0,
  pageWidthPt: 0,
  pageHeightPt: 0,
  drawingScale: 1,
  placement: null,
  sourceKey: null,
};

const maxUnderlayPixels = 4096;
const underlayMargin = 0.15;
let underlayCanvas = null;
let underlayRasterUrl = null;
let underlayRasterScale = 0;
let underlayRasterRect = null;
let underlayResolutionTimer = 0;
let underlayRenderToken = 0;
let underlayRenderTask = null;
let legacyUnderlayHtml = "";

const ptToMm = 25.4 / 72;

/* --- Asset store ---------------------------------------------------------
   Source bytes live in IndexedDB, not localStorage: they are binary, they are
   large, and they must not compete with the autosave quota. */
function idbOpen() {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open("omkreds-assets", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("assets")) request.result.createObjectStore("assets");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function assetPut(key, value) {
  try {
    const db = await idbOpen();
    await new Promise((resolve, reject) => {
      const tx = db.transaction("assets", "readwrite");
      tx.objectStore("assets").put(value, key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return true;
  } catch (error) {
    return false;
  }
}

async function assetGet(key) {
  try {
    const db = await idbOpen();
    const value = await new Promise((resolve, reject) => {
      const tx = db.transaction("assets", "readonly");
      const request = tx.objectStore("assets").get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return value;
  } catch (error) {
    return null;
  }
}

async function assetDelete(key) {
  try {
    const db = await idbOpen();
    await new Promise((resolve) => {
      const tx = db.transaction("assets", "readwrite");
      tx.objectStore("assets").delete(key);
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
    db.close();
  } catch (error) {
    /* nothing to delete */
  }
}

/* Removing an underlay keeps its bytes so undo can put it back, which leaves
   an orphan once the session ends. History dies with the reload, so boot is
   the moment to collect them -- but only the keys the user actually removed:
   a saved project stores its underlay as a key into this same store, so
   sweeping everything unreferenced would empty older project files. */
const orphanAssetKey = "omkreds:orphan-assets:v1";

function readOrphanAssets() {
  try {
    const raw = window.localStorage.getItem(orphanAssetKey);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (error) {
    return [];
  }
}

function markOrphanAsset(key) {
  if (!key) return;
  try {
    const list = readOrphanAssets();
    if (!list.includes(key)) list.push(key);
    window.localStorage.setItem(orphanAssetKey, JSON.stringify(list.slice(-20)));
  } catch (error) {
    /* storage is optional */
  }
}

async function sweepOrphanAssets(keepKey) {
  const list = readOrphanAssets();
  if (!list.length) return;
  const survivors = [];
  for (const key of list) {
    if (key === keepKey) survivors.push(key);
    else await assetDelete(key);
  }
  try {
    if (survivors.length) window.localStorage.setItem(orphanAssetKey, JSON.stringify(survivors));
    else window.localStorage.removeItem(orphanAssetKey);
  } catch (error) {
    /* storage is optional */
  }
}

/* --- Descriptor ---------------------------------------------------------- */
function underlayDescriptor() {
  if (!underlayState.kind) return legacyUnderlayHtml ? { legacy: true } : null;
  return {
    kind: underlayState.kind,
    name: underlayState.name,
    page: underlayState.page,
    pageCount: underlayState.pageCount,
    rotation: underlayState.rotation,
    pageWidthPt: underlayState.pageWidthPt,
    pageHeightPt: underlayState.pageHeightPt,
    drawingScale: underlayState.drawingScale,
    placement: underlayState.placement ? { ...underlayState.placement } : null,
    sourceKey: underlayState.sourceKey,
  };
}

function clearUnderlay() {
  underlayState.kind = null;
  underlayState.sourceKey = null;
  underlayState.placement = null;
  underlayCanvas = null;
  underlayRasterScale = 0;
  underlayRasterRect = null;
  legacyUnderlayHtml = "";
  if (underlayRasterUrl) {
    URL.revokeObjectURL(underlayRasterUrl);
    underlayRasterUrl = null;
  }
  underlayLayer.replaceChildren();
  pdfPageSelect.replaceChildren();
  pdfControls.hidden = true;
  updateUnderlayScaleLabel();
}

/* Restores an underlay from history/undo. Geometry-only changes reuse the
   cached raster; a page or source change re-renders. */
async function applyUnderlayDescriptor(descriptor) {
  if (!descriptor) {
    if (underlayState.kind || legacyUnderlayHtml) clearUnderlay();
    return;
  }
  if (descriptor.legacy) {
    underlayLayer.innerHTML = legacyUnderlayHtml;
    return;
  }
  const sameSource = underlayState.kind === descriptor.kind
    && underlayState.sourceKey === descriptor.sourceKey
    && underlayState.page === descriptor.page
    && underlayState.rotation === descriptor.rotation;
  Object.assign(underlayState, descriptor, {
    placement: descriptor.placement ? { ...descriptor.placement } : null,
  });
  if (sameSource && underlayCanvas) {
    updateUnderlayView();
    return;
  }
  await reopenUnderlaySource();
}

async function reopenUnderlaySource() {
  if (!underlayState.sourceKey) return;
  const source = await assetGet(underlayState.sourceKey);
  if (!source) {
    statusText.textContent = "Underlagets kildefil kunne ikke genindlaeses.";
    return;
  }
  if (underlayState.kind === "pdf") {
    if (!window.pdfjsLib) return;
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
    pdfDocument = await window.pdfjsLib.getDocument({ data: source.slice(0) }).promise;
    currentPdfBytes = source;
    populatePdfPages();
    await renderUnderlayRegion(true);
  } else {
    setImageUnderlayFromDataUrl(source);
  }
  /* The panel readouts were last written while the layer was empty; the reopen
     finishes a few ticks later, so they have to be told again. */
  updateUnderlayScaleLabel();
}

/* --- Placement ----------------------------------------------------------- */
function underlayPlacementForPage(widthPt, heightPt, drawingScale) {
  const widthUnits = mmToDrawing(widthPt * ptToMm * drawingScale);
  const heightUnits = mmToDrawing(heightPt * ptToMm * drawingScale);
  return {
    x: sheet.width / 2 - widthUnits / 2,
    y: sheet.height / 2 - heightUnits / 2,
    width: widthUnits,
    height: heightUnits,
  };
}

function scaleUnderlayPlacement(percent) {
  if (!underlayState.placement) return;
  const base = underlayState.basePlacement || underlayState.placement;
  underlayState.basePlacement = { ...base };
  const factor = Number(percent) / 100;
  const cx = base.x + base.width / 2;
  const cy = base.y + base.height / 2;
  underlayState.placement = {
    width: base.width * factor,
    height: base.height * factor,
    x: cx - (base.width * factor) / 2,
    y: cy - (base.height * factor) / 2,
  };
  updateUnderlayScaleLabel();
  updateUnderlayView();
  scheduleUnderlayResolution();
}

/* --- View node ----------------------------------------------------------- */
function underlayImageNode() {
  let node = underlayLayer.querySelector(".plan-underlay");
  if (!node) {
    node = createSvgElement("image", { class: "plan-underlay", preserveAspectRatio: "none" });
    underlayLayer.replaceChildren(node);
  }
  return node;
}

function updateUnderlayView() {
  if (!underlayState.placement || !underlayRasterUrl) return;
  const node = underlayImageNode();
  const rect = underlayRasterRect || underlayState.placement;
  node.setAttribute("href", underlayRasterUrl);
  node.setAttribute("x", rect.x);
  node.setAttribute("y", rect.y);
  node.setAttribute("width", rect.width);
  node.setAttribute("height", rect.height);
  node.setAttribute("opacity", Number(underlayOpacity.value) / 100);
}

/* --- Progressive rasterisation ------------------------------------------
   Only the visible slice of the page is rendered, at the resolution the
   current zoom actually resolves, so tracing at 400% is sharp instead of a
   stretched thumbnail. */
function scheduleUnderlayResolution() {
  if (underlayState.kind !== "pdf" || !pdfDocument) return;
  underlayRenderToken += 1;
  if (underlayRenderTask) {
    underlayRenderTask.cancel();
    underlayRenderTask = null;
  }
  if (underlayResolutionTimer) clearTimeout(underlayResolutionTimer);
  underlayResolutionTimer = setTimeout(() => {
    underlayResolutionTimer = 0;
    renderUnderlayRegion(false);
  }, 200);
}

function visibleUnderlayRect() {
  const p = underlayState.placement;
  if (!p) return null;
  const x1 = Math.max(p.x, view.x);
  const y1 = Math.max(p.y, view.y);
  const x2 = Math.min(p.x + p.width, view.x + view.width);
  const y2 = Math.min(p.y + p.height, view.y + view.height);
  if (x2 <= x1 || y2 <= y1) return null;
  const padX = (x2 - x1) * underlayMargin;
  const padY = (y2 - y1) * underlayMargin;
  return {
    x: Math.max(p.x, x1 - padX),
    y: Math.max(p.y, y1 - padY),
    width: Math.min(p.x + p.width, x2 + padX) - Math.max(p.x, x1 - padX),
    height: Math.min(p.y + p.height, y2 + padY) - Math.max(p.y, y1 - padY),
  };
}

function underlayRegionIsFresh(target, scale) {
  if (!underlayRasterRect || !underlayRasterScale) return false;
  if (scale > underlayRasterScale * 1.2) return false;
  if (scale < underlayRasterScale * 0.45) return false;
  const r = underlayRasterRect;
  return target.x >= r.x - 0.01 && target.y >= r.y - 0.01
    && target.x + target.width <= r.x + r.width + 0.01
    && target.y + target.height <= r.y + r.height + 0.01;
}

async function renderUnderlayRegion(force) {
  if (!pdfDocument || !underlayState.placement) return;
  const target = visibleUnderlayRect();
  if (!target) return;
  const dpr = window.devicePixelRatio || 1;
  const placement = underlayState.placement;
  let scale = (zoom * dpr * 1.25 * placement.width) / underlayState.pageWidthPt;
  if (!Number.isFinite(scale) || scale <= 0) return;
  if (!force && underlayRegionIsFresh(target, scale)) return;

  const entryToken = underlayRenderToken;
  const page = await pdfDocument.getPage(underlayState.page);
  if (entryToken !== underlayRenderToken) return;
  const viewport = page.getViewport({ scale, rotation: underlayState.rotation });
  const pxPerUnitX = viewport.width / placement.width;
  const pxPerUnitY = viewport.height / placement.height;
  let rx = (target.x - placement.x) * pxPerUnitX;
  let ry = (target.y - placement.y) * pxPerUnitY;
  let rw = target.width * pxPerUnitX;
  let rh = target.height * pxPerUnitY;

  /* Keep the canvas inside a sane texture budget; shrink the scale rather
     than the region so the whole visible slice stays covered. */
  const overflow = Math.max(rw / maxUnderlayPixels, rh / maxUnderlayPixels, 1);
  if (overflow > 1) {
    scale /= overflow;
    const shrunk = page.getViewport({ scale, rotation: underlayState.rotation });
    const sx = shrunk.width / placement.width;
    const sy = shrunk.height / placement.height;
    rx = (target.x - placement.x) * sx;
    ry = (target.y - placement.y) * sy;
    rw = target.width * sx;
    rh = target.height * sy;
  }

  const finalViewport = page.getViewport({ scale, rotation: underlayState.rotation });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(rw));
  canvas.height = Math.max(1, Math.round(rh));
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const token = underlayRenderToken;
  underlayRenderTask = page.render({
    canvasContext: context,
    viewport: finalViewport,
    transform: [1, 0, 0, 1, -Math.round(rx), -Math.round(ry)],
  });
  try {
    await underlayRenderTask.promise;
  } catch (error) {
    return; /* superseded by a newer viewport */
  } finally {
    underlayRenderTask = null;
  }
  if (token !== underlayRenderToken) return;

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (token !== underlayRenderToken || !blob) return;
  if (underlayRasterUrl) URL.revokeObjectURL(underlayRasterUrl);
  underlayCanvas = canvas;
  underlayRasterUrl = URL.createObjectURL(blob);
  underlayRasterScale = scale;
  underlayRasterRect = {
    x: placement.x + Math.round(rx) / (finalViewport.width / placement.width),
    y: placement.y + Math.round(ry) / (finalViewport.height / placement.height),
    width: canvas.width / (finalViewport.width / placement.width),
    height: canvas.height / (finalViewport.height / placement.height),
  };
  updateUnderlayView();
}

function populatePdfPages() {
  pdfPageSelect.replaceChildren();
  for (let i = 1; i <= pdfDocument.numPages; i += 1) {
    pdfPageSelect.append(new Option(`Side ${i}`, String(i)));
  }
  pdfPageSelect.value = String(underlayState.page);
  pdfRotation.value = String(underlayState.rotation);
  pdfControls.hidden = false;
}

function setImageUnderlayFromDataUrl(dataUrl) {
  const node = underlayImageNode();
  const placement = underlayState.placement;
  if (underlayRasterUrl) {
    URL.revokeObjectURL(underlayRasterUrl);
    underlayRasterUrl = null;
  }
  underlayRasterUrl = dataUrl;
  underlayRasterRect = placement;
  node.setAttribute("preserveAspectRatio", "xMidYMid meet");
  updateUnderlayView();
}

/* --- Scale dialog on import --------------------------------------------- */
async function askUnderlayScale(widthPt, heightPt) {
  const widthMm = Math.round(widthPt * ptToMm);
  const heightMm = Math.round(heightPt * ptToMm);
  const answers = await openDialog({
    title: "Underlagets maalestok",
    description: `Siden er ${widthMm} x ${heightMm} mm (${describePaperSize(widthMm, heightMm)}). Vaelg hvilken maalestok tegningen er i, saa maal passer med det samme.`,
    fields: [
      {
        name: "scale",
        label: "Maalestok",
        type: "select",
        value: "50",
        options: [
          { value: "1", label: "1:1" },
          { value: "5", label: "1:5" },
          { value: "10", label: "1:10" },
          { value: "20", label: "1:20" },
          { value: "50", label: "1:50" },
          { value: "100", label: "1:100" },
          { value: "200", label: "1:200" },
          { value: "custom", label: "Anden / kalibrer bagefter" },
        ],
      },
      { name: "custom", label: "Anden maalestok 1:", type: "number", value: 25, min: 1, step: 1 },
    ],
    confirmLabel: "Placer underlag",
  });
  if (!answers) return null;
  return answers.scale === "custom" ? Math.max(1, Number(answers.custom) || 1) : Number(answers.scale);
}

function describePaperSize(widthMm, heightMm) {
  const sizes = { A4: [210, 297], A3: [297, 420], A2: [420, 594], A1: [594, 841], A0: [841, 1189] };
  const w = Math.min(widthMm, heightMm);
  const h = Math.max(widthMm, heightMm);
  const hit = Object.entries(sizes).find(([, [sw, sh]]) => Math.abs(sw - w) <= 3 && Math.abs(sh - h) <= 3);
  return hit ? `${hit[0]} ${widthMm > heightMm ? "liggende" : "staaende"}` : "eget format";
}



/* --- Connections ---------------------------------------------------------
   A connection is a parametric object, not a pile of lines: it stores the
   members, the connector and the fasteners, and draws itself from them.
   Change the post size and the detail redraws, dimensions included.

   Fastener spacing note: for a proprietary connector the hole pattern is fixed
   by the manufacturer's ETA, and the generic EN 1995-1-1 Table 8.2 spacings do
   not apply to it. The generic minimums are still computed and reported for
   reference, and they DO govern any screws placed outside a connector plate.
   This is drafting support -- the engineer verifies the connection. */

const timberDensityClasses = {
  C14: 290, C18: 320, C24: 350, C30: 380, GL24h: 385, GL28h: 425,
};

/* EN 1995-1-1 Table 8.2, laterally loaded nails/screws d < 6 mm, rho_k <= 420.
   `angle` is the angle between force and grain, in degrees. */
function ec5MinimumSpacings(d, angle = 0, predrilled = false) {
  const rad = (angle * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const sn = Math.abs(Math.sin(rad));
  return predrilled
    ? {
        a1: (4 + Math.abs(Math.cos(rad))) * d,
        a2: (3 + Math.abs(Math.sin(rad))) * d,
        a3t: (7 + 5 * c) * d,
        a3c: 7 * d,
        a4t: Math.max((3 + 2 * sn) * d, 3 * d),
        a4c: 3 * d,
      }
    : {
        a1: (5 + 5 * c) * d,
        a2: 5 * d,
        a3t: (10 + 5 * c) * d,
        a3c: 10 * d,
        a4t: Math.max((5 + 2 * sn) * d, 5 * d),
        a4c: 5 * d,
      };
}

function connectionMetadata(group) {
  return safeMetadata(group);
}

function connectionScrew(sku) {
  const found = screwByKey(sku);
  return found?.screw || screwCatalog.connector.items["CSA5.0X40"];
}

function connectionBracket(sku) {
  const families = manufacturerLibraries["simpson-strong-tie"]?.families || [];
  for (const family of families) {
    const variant = (family.variants || []).find((item) => item.sku === sku);
    if (variant) return { family, variant };
  }
  return null;
}

/* Angle brackets suitable for a post base, largest first. */
function postBaseBracketOptions() {
  const families = manufacturerLibraries["simpson-strong-tie"]?.families || [];
  const options = [];
  families.forEach((family) => {
    if (family.category !== "angle_bracket") return;
    (family.variants || []).forEach((variant) => {
      if (!variant.dimensions?.A) return;
      options.push({ sku: variant.sku, family, variant });
    });
  });
  return options.sort((a, b) => (a.variant.dimensions.A || 0) - (b.variant.dimensions.A || 0));
}

/* Number of small (fastener) holes per flange declared by the manufacturer. */
function bracketFastenerHoles(variant) {
  const flange = variant.holes?.flangeA || {};
  const entries = Object.entries(flange).map(([dia, count]) => ({ dia: Number(dia), count: Number(count) }));
  const small = entries.filter((item) => item.dia <= 6);
  return small.reduce((sum, item) => sum + item.count, 0) || 4;
}

function bracketAnchorHole(variant) {
  const flange = variant.holes?.flangeB || variant.holes?.flangeA || {};
  const large = Object.keys(flange).map(Number).filter((dia) => dia > 6).sort((a, b) => b - a)[0];
  return large || 11;
}

/* --- Packed manufacturer geometry ---------------------------------------
   The importer's record is the auditable source of truth but costs ~17 KB per
   part; tools/suppliers/pack-geometry.py re-encodes it losslessly to ~1.4 KB.
   Holes keep full precision, outlines are rounded to 1 micron, and nothing is
   simplified unless the packer was explicitly run with a tolerance. */
const unpackedGeometryCache = new Map();

function packedGeometryInfo() {
  const packed = window.omkredsPackedGeometry;
  if (!packed?.parts) return null;
  return {
    count: Object.keys(packed.parts).length,
    toleranceMm: packed.toleranceMm ?? 0,
    lossless: Boolean(packed.lossless),
  };
}

/* One packed primitive list -> renderer elements. */
function decodePackedPrims(list, defaultPen) {
  const elements = [];
  (list || []).forEach((entry) => {
    const [kind, values] = entry;
    const strokeWidth = entry.length > 2 ? entry[2] : defaultPen;
    if (kind === "p" || kind === "P") {
      const points = [];
      for (let i = 0; i + 1 < values.length; i += 2) points.push([values[i], values[i + 1]]);
      if (points.length > 1) {
        elements.push({ type: "polyline", attrs: { points, strokeWidth, closed: kind === "P" } });
      }
    } else if (kind === "l") {
      elements.push({ type: "line", attrs: { x1: values[0], y1: values[1], x2: values[2], y2: values[3], strokeWidth } });
    } else if (kind === "c") {
      elements.push({ type: "circle", attrs: { cx: values[0], cy: values[1], r: values[2], strokeWidth } });
    } else if (kind === "r") {
      elements.push({ type: "rect", attrs: { x: values[0], y: values[1], width: values[2], height: values[3], strokeWidth } });
    }
  });
  return elements;
}

const packedBbox = (b) => (b ? { width: b[0], height: b[1] } : undefined);

/* Expands one packed part into the shape the renderer already understands.

   A part names its views in `vk` but ships only the default one; the rest
   arrive with the companion bundle. Views that are named but not yet loaded
   are simply absent here, and getManufacturerGeometryForView falls back down
   its alias chain to the default -- so the drawing is never empty, it is just
   the wrong angle until the bundle lands. */
function unpackGeometry(sku) {
  if (unpackedGeometryCache.has(sku)) return unpackedGeometryCache.get(sku);
  const packed = window.omkredsPackedGeometry;
  const part = packed?.parts?.[sku];
  if (!part) return null;
  const defaultPen = part.w ?? 0.25;
  const elements = decodePackedPrims(part.g, defaultPen);
  const bbox = packedBbox(part.b);

  const views = {};
  if (part.d) views[part.d] = { bbox, elements };
  const deferred = window.omkredsPackedGeometryViews?.parts?.[sku];
  if (deferred) {
    Object.keys(deferred).forEach((key) => {
      const view = deferred[key];
      views[key] = { bbox: packedBbox(view.b) || bbox, elements: decodePackedPrims(view.g, defaultPen) };
    });
  }

  const record = { status: "verified", units: part.u || "mm", elements, bbox };
  if (Object.keys(views).length) record.views = views;
  /* Named but unloaded views still have to be listed, or the picker offers
     only what happens to be on the page right now. */
  if (part.vk?.length) record.viewKeys = part.vk;
  unpackedGeometryCache.set(sku, record);
  return record;
}

/* The non-default views are 1.1 MB gzipped -- an order of magnitude more than
   everything else the page loads -- so they are fetched the first time someone
   actually looks at a component, not on boot. */
let componentViewsRequest = null;
function ensureComponentViewsLoaded() {
  if (componentViewsRequest) return componentViewsRequest;
  if (window.omkredsPackedGeometryViews) return Promise.resolve();
  const src = document.querySelector('script[src*="geometry.packed.js"]')?.getAttribute("src");
  if (!src) return Promise.resolve();
  componentViewsRequest = new Promise((resolve) => {
    const tag = document.createElement("script");
    tag.src = src.replace("geometry.packed.js", "geometry.views.packed.js");
    tag.addEventListener("load", () => {
      /* The cache holds records built without the extra views; drop it so the
         next read rebuilds them, then redraw whatever is already placed. */
      unpackedGeometryCache.clear();
      applyVerifiedManufacturerGeometry(packedGeometryByManufacturer() || window.omkredsVerifiedManufacturerGeometry);
      updateCatalogElements();
      updateComponentPreview();
      renderComponentBrowser();
      resolve();
    }, { once: true });
    tag.addEventListener("error", () => {
      /* Drop the memo so the next attempt actually refetches -- holding on to
         the settled promise made one failed load permanent for the session. */
      componentViewsRequest = null;
      tag.remove();
      statusText.textContent = "Kunne ikke indlaese komponentvisninger. Proev igen.";
      resolve();
    }, { once: true });
    document.head.append(tag);
  });
  return componentViewsRequest;
}

/* The manufacturer's own traced outline: every hole, the keyhole rib, the
   stiffening ribs. Prefers the packed bundle and falls back to the raw import
   so an un-packed library still works. */
function bracketVerifiedGeometry(sku) {
  const library = window.omkredsVerifiedManufacturerGeometry?.["simpson-strong-tie"] || {};
  const record = unpackGeometry(sku) || library[sku];
  if (!record || record.status !== "verified" || !record.elements?.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const note = (x, y) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  record.elements.forEach((item) => {
    const a = item.attrs || {};
    if (item.type === "polyline") (a.points || []).forEach(([x, y]) => note(x, y));
    else if (item.type === "line") {
      note(a.x1, a.y1);
      note(a.x2, a.y2);
    } else if (item.type === "circle") {
      note(a.cx - a.r, a.cy - a.r);
      note(a.cx + a.r, a.cy + a.r);
    }
  });
  if (!Number.isFinite(minX)) return null;
  return { elements: record.elements, bbox: { x: minX, y: minY, width: maxX - minX, height: maxY - minY } };
}

/* Seats the traced outline so its foot sits on `baseYmm` and its back edge on
   `edgeXmm`. Mirroring makes the pair symmetric about the post. */
function appendBracketGeometry(group, geometry, edgeXmm, baseYmm, mirror) {
  const b = geometry.bbox;
  const tx = mirror ? edgeXmm + b.x + b.width : edgeXmm - (b.x + b.width);
  const ty = baseYmm - (b.y + b.height);
  const holder = createSvgElement("g", {
    transform: `translate(${mmToDrawing(tx)} ${mmToDrawing(ty)})${mirror ? " scale(-1 1)" : ""}`,
    class: "connection-bracket",
  });
  geometry.elements.forEach((item) => appendNativeGeometryElement(holder, item));
  group.append(holder);
  return holder;
}

function makeConnection(point, params = {}) {
  const group = createSvgElement("g", { color: "#111111" });
  group.classList.add("draw-item");
  group.dataset.type = "connection";
  group.dataset.color = "#111111";
  group.dataset.metadata = JSON.stringify({
    kind: "timberPostBase",
    postWidth: 95,
    postDepth: 95,
    postGrade: "C24",
    postVisible: 420,
    bracketSku: "ABR9020",
    view: "elevation",
    screwSku: "CSA5.0X40",
    anchor: "M12",
    predrilled: false,
    baseThickness: 0,
    ...params,
  });
  group.setAttribute("transform", `translate(${point.x} ${point.y})`);
  renderConnection(group);
  return applyLayer(group, "timber");
}

/* Everything below is laid out in real millimetres and converted once, so the
   detail is dimensionally true at any plot scale. */
function renderConnection(group) {
  const meta = connectionMetadata(group);
  const mm = (value) => mmToDrawing(value);
  const paper = (value) => paperMmToUnits(value);
  const bracket = connectionBracket(meta.bracketSku) || connectionBracket("ABR9020");
  const screw = connectionScrew(meta.screwSku);
  const dims = bracket?.variant?.dimensions || { A: 88, B: 88, C: 65, t: 2 };
  const halfPost = Number(meta.postWidth) / 2;
  const postTop = -Number(meta.postVisible);
  const legHeight = dims.C || 65;
  const flangeLength = dims.A || 88;
  const plate = dims.t || 2;
  const holeCount = Math.max(2, Number(meta.screwCount) || bracketFastenerHoles(bracket?.variant || {}));
  const anchorDia = bracketAnchorHole(bracket?.variant || {});

  group.replaceChildren();
  group.setAttribute("color", group.dataset.color || "#111111");

  const view = meta.view || "elevation";
  const verified = bracketVerifiedGeometry(meta.bracketSku);

  const line = (x1, y1, x2, y2, weight, cls) => {
    const node = createSvgElement("line", {
      x1: mm(x1), y1: mm(y1), x2: mm(x2), y2: mm(y2),
      stroke: "currentColor", "stroke-width": paper(weight), fill: "none",
    });
    if (cls) node.setAttribute("class", cls);
    return node;
  };
  const rect = (x, y, w, h, weight) => createSvgElement("rect", {
    x: mm(x), y: mm(y), width: mm(w), height: mm(h),
    fill: "none", stroke: "currentColor", "stroke-width": paper(weight),
  });
  const circle = (cx, cy, r, weight) => createSvgElement("circle", {
    cx: mm(cx), cy: mm(cy), r: mm(r),
    fill: "none", stroke: "currentColor", "stroke-width": paper(weight),
  });

  /* --- timber post --- */
  group.append(rect(-halfPost, postTop, halfPost * 2, -postTop, 0.5));

  /* Face-on: draw the manufacturer's outline rather than an approximation of
     it. The DXF contains this view, so this is the one that can be exact. */
  if (view === "elevation" && verified) {
    appendBracketGeometry(group, verified, -halfPost, 0, false);
    appendBracketGeometry(group, verified, halfPost, 0, true);
    const required = ec5MinimumSpacings(screw.d, 0, Boolean(meta.predrilled));
    const check = evaluateConnection({ meta, screw, spacing: 0, legHeight, required, holeCount, rows: holeCount });
    group.dataset.ec5 = check.status;
    group.dataset.geometrySource = "verified";
    group.dataset.dimension = `${meta.postWidth} x ${meta.postDepth} ${meta.postGrade} soejlefod, ${meta.bracketSku}`;
    group.dataset.material = meta.postGrade;
    group.dataset.metadata = JSON.stringify({
      ...meta,
      check: check.summary,
      bracket: { sku: meta.bracketSku, widthMm: Math.round(verified.bbox.width), heightMm: Math.round(verified.bbox.height), source: "verified DXF" },
    });
    applyOpacity(group, group.dataset.opacity || 100);
    return;
  }
  group.dataset.geometrySource = "derived";

  /* --- bracket each side: vertical leg against the post, flange on the base --- */
  const screwRows = [];
  [-1, 1].forEach((side) => {
    const inner = side * halfPost;
    const outer = inner + side * plate;
    group.append(rect(Math.min(inner, outer), -legHeight, plate, legHeight, 0.35));
    const flangeStart = inner;
    const flangeEnd = inner + side * flangeLength;
    group.append(rect(Math.min(flangeStart, flangeEnd), 0, flangeLength, plate, 0.35));

    /* fastener holes spread over the leg, kept clear of both ends */
    const margin = Math.max(2 * screw.d, legHeight * 0.16);
    const usable = Math.max(0, legHeight - margin * 2);
    const rows = Math.min(4, Math.max(2, Math.round(legHeight / (6 * screw.d))));
    const pitch = rows > 1 ? usable / (rows - 1) : 0;
    for (let i = 0; i < rows; i += 1) {
      const y = -legHeight + margin + i * pitch;
      if (side < 0) screwRows.push(y);
      /* screw: shank into the post plus a head against the plate */
      group.append(line(outer, y, inner - side * Math.min(screw.length - plate, halfPost * 1.6), y, 0.25));
      group.append(circle(outer + side * screw.head / 4, y, screw.head / 2.6, 0.18));
    }

    /* anchor hole through the flange */
    const anchorX = inner + side * flangeLength * 0.62;
    group.append(circle(anchorX, plate / 2, anchorDia / 2, 0.25));
    group.append(line(anchorX, plate, anchorX, plate + 120, 0.13, "connection-hidden"));
  });

  group.querySelectorAll(".connection-hidden").forEach((node) => {
    node.setAttribute("stroke-dasharray", `${paper(1.5)} ${paper(1)}`);
  });

  const spacing = screwRows.length > 1 ? Math.abs(screwRows[1] - screwRows[0]) : 0;
  const required = ec5MinimumSpacings(screw.d, 0, Boolean(meta.predrilled));
  const check = evaluateConnection({ meta, screw, spacing, legHeight, required, holeCount, rows: screwRows.length });
  group.dataset.ec5 = check.status;
  group.dataset.dimension = `${meta.postWidth} x ${meta.postDepth} ${meta.postGrade} soejlefod, ${meta.bracketSku}`;
  group.dataset.material = meta.postGrade;
  group.dataset.metadata = JSON.stringify({ ...meta, check: check.summary, spacing: Math.round(spacing) });
  group.classList.toggle("connection-warning", check.status === "warning");
  applyOpacity(group, group.dataset.opacity || 100);
}

/* The verdict is deliberately explicit about which rule it applied. */
function evaluateConnection({ meta, screw, spacing, required, holeCount, rows }) {
  const notes = [];
  let status = "ok";
  notes.push(`${holeCount} x ${screw.name} pr. flange efter producentens ETA (${rows} raekker vist i snit).`);
  notes.push(`Generisk EC5 minimum (EN 1995-1-1 tabel 8.2, ${meta.predrilled ? "forboret" : "uden forboring"}, d = ${screw.d} mm): a1 = ${required.a1.toFixed(0)} mm, a4,c = ${required.a4c.toFixed(0)} mm.`);
  if (spacing > 0 && spacing < required.a1) {
    notes.push(`Raekkeafstand i beslaget er ${spacing.toFixed(0)} mm < a1 = ${required.a1.toFixed(0)} mm. For beslaget gaelder ETA'en; kontrollér selv hvis skruerne saettes uden for beslaget.`);
    status = "note";
  }
  return { status, summary: notes };
}

async function insertConnection() {
  const options = postBaseBracketOptions();
  const screwOptions = Object.entries(screwCatalog.connector.items).map(([key, item]) => ({ value: key, label: item.name }));
  const answers = await openDialog({
    title: "Samling: soejlefod",
    description: "Beslag, skruer og maal kommer fra biblioteket. Detaljen kan redigeres bagefter.",
    fields: [
      { name: "postWidth", label: "Soejle bredde [mm]", type: "number", value: 95, min: 45, step: 1 },
      { name: "postGrade", label: "Styrkeklasse", type: "select", value: "C24", options: Object.keys(timberDensityClasses).map((k) => ({ value: k, label: k })) },
      { name: "bracketSku", label: "Beslag", type: "select", value: "ABR9020", options: options.map((o) => ({ value: o.sku, label: `${o.family.family} ${o.sku} (A=${o.variant.dimensions.A} C=${o.variant.dimensions.C})` })) },
      { name: "screwSku", label: "Skrue", type: "select", value: "CSA5.0X40", options: screwOptions },
      { name: "view", label: "Visning", type: "select", value: "elevation", options: [
        { value: "elevation", label: "Opstalt - producentens 1:1 geometri" },
        { value: "section", label: "Snit - profil ud fra maal" },
      ] },
      { name: "predrilled", label: "Forboret", type: "select", value: "false", options: [{ value: "false", label: "Nej" }, { value: "true", label: "Ja" }] },
    ],
    confirmLabel: "Indsaet samling",
  });
  if (!answers) return;
  pushHistory();
  const connection = makeConnection(centerPoint(), {
    postWidth: Number(answers.postWidth) || 95,
    postDepth: Number(answers.postWidth) || 95,
    postGrade: answers.postGrade,
    bracketSku: answers.bracketSku,
    view: answers.view,
    screwSku: answers.screwSku,
    predrilled: answers.predrilled === "true",
  });
  drawingLayer.append(connection);
  selectOnly(connection);
  pushHistory();
  const meta = connectionMetadata(connection);
  statusText.textContent = `Soejlefod indsat: ${meta.bracketSku}, ${meta.postWidth} mm ${meta.postGrade}.`;
}

/* --- Underlay placement --------------------------------------------------
   Unlocking the underlay makes it draggable, and two-point calibration sets
   its scale from a known distance on the plan -- the gesture people already
   know from Bluebeam, and far more useful than a percentage slider. */
let underlayDragState = null;
let underlayCalibrationState = null;

function underlayIsMovable() {
  return Boolean(underlayState.kind && underlayState.placement && !underlayLocked.checked && layers.underlay.visible);
}

function pointInUnderlay(point) {
  const p = underlayState.placement;
  if (!p) return false;
  return point.x >= p.x && point.x <= p.x + p.width && point.y >= p.y && point.y <= p.y + p.height;
}

function beginUnderlayDrag(event, point) {
  underlayDragState = {
    origin: point,
    startX: underlayState.placement.x,
    startY: underlayState.placement.y,
    moved: false,
  };
  svg.setPointerCapture(event.pointerId);
  statusText.textContent = "Flytter underlag. Slip for at placere.";
}

function updateUnderlayDrag(point) {
  const drag = underlayDragState;
  const dx = point.x - drag.origin.x;
  const dy = point.y - drag.origin.y;
  if (!drag.moved && Math.hypot(dx, dy) * zoom < dragThresholdPx) return;
  drag.moved = true;
  underlayState.placement.x = drag.startX + dx;
  underlayState.placement.y = drag.startY + dy;
  if (underlayState.basePlacement) {
    underlayState.basePlacement.x = underlayState.placement.x;
    underlayState.basePlacement.y = underlayState.placement.y;
  }
  if (underlayRasterRect) {
    underlayRasterRect.x += dx - (drag.lastDx || 0);
    underlayRasterRect.y += dy - (drag.lastDy || 0);
  }
  drag.lastDx = dx;
  drag.lastDy = dy;
  updateUnderlayView();
}

function finishUnderlayDrag() {
  const moved = underlayDragState?.moved;
  underlayDragState = null;
  if (!moved) return;
  scheduleUnderlayResolution();
  pushHistory();
  statusText.textContent = "Underlag flyttet.";
}

/* --- Two-point calibration ----------------------------------------------- */
function beginUnderlayCalibration() {
  if (!underlayState.kind) {
    statusText.textContent = "Importer et underlag foerst.";
    return;
  }
  cancelCurrentInteraction({ keepSelection: true });
  underlayCalibrationState = { first: null };
  setActiveTool("select");
  updateCanvasCursor();
  statusText.textContent = "Klik foerste punkt paa underlaget.";
}

function cancelUnderlayCalibration() {
  underlayCalibrationState = null;
  previewLayer.querySelectorAll(".calibration-line, .calibration-point").forEach((element) => element.remove());
  statusText.textContent = "Kalibrering annulleret.";
}

function renderCalibrationPreview(point) {
  previewLayer.querySelectorAll(".calibration-line, .calibration-point").forEach((element) => element.remove());
  const first = underlayCalibrationState?.first;
  if (!first) return;
  previewLayer.append(createSvgElement("line", {
    x1: first.x, y1: first.y, x2: point.x, y2: point.y, class: "calibration-line",
  }));
  previewLayer.append(createSvgElement("circle", {
    cx: first.x, cy: first.y, r: 4 / zoom, class: "calibration-point",
  }));
}

async function handleUnderlayCalibrationClick(point) {
  if (!underlayCalibrationState.first) {
    underlayCalibrationState.first = point;
    renderCalibrationPreview(point);
    statusText.textContent = "Klik andet punkt, og skriv den virkelige afstand.";
    return;
  }
  const first = underlayCalibrationState.first;
  const measured = Math.hypot(point.x - first.x, point.y - first.y);
  cancelUnderlayCalibration();
  if (measured <= 0) return;
  const answer = await showPrompt("Kalibrer underlag", "Virkelig afstand [mm]", "1000", {
    type: "number",
    description: `Den maalte afstand er ${formatDistance(measured * getScaleValue())} med den nuvaerende placering.`,
  });
  const knownMm = Number(answer);
  if (!(knownMm > 0)) return;
  const factor = mmToDrawing(knownMm) / measured;
  const p = underlayState.placement;
  /* Scale about the first picked point so it stays put under the cursor. */
  underlayState.placement = {
    x: first.x + (p.x - first.x) * factor,
    y: first.y + (p.y - first.y) * factor,
    width: p.width * factor,
    height: p.height * factor,
  };
  underlayState.basePlacement = { ...underlayState.placement };
  underlayState.drawingScale = underlayDrawingScale();
  underlayScale.value = "100";
  underlayScaleValue.textContent = "100%";
  underlayRasterRect = null;
  underlayRasterScale = 0;
  updateUnderlayScaleLabel();
  await renderUnderlayRegion(true);
  pushHistory();
  statusText.textContent = `Underlag kalibreret til 1:${underlayState.drawingScale.toFixed(1)}.`;
}

function underlayDrawingScale() {
  if (!underlayState.placement || !underlayState.pageWidthPt) return underlayState.drawingScale;
  const pageMm = underlayState.pageWidthPt * ptToMm;
  return (underlayState.placement.width * getScaleValue()) / pageMm;
}

function updateUnderlayScaleLabel() {
  const node = document.getElementById("underlayScaleReadout");
  if (node) node.textContent = underlayState.kind ? `1:${underlayDrawingScale().toFixed(1)}` : "-";
  const present = Boolean(underlayState.kind || legacyUnderlayHtml);
  const nameNode = document.getElementById("underlayNameReadout");
  if (nameNode) nameNode.textContent = present ? (underlayState.name || "Uden navn") : "Intet";
  const removeButton = document.getElementById("removeUnderlay");
  if (removeButton) removeButton.disabled = !present;
}

/* The underlay is not a draw-item, so Delete and "Ryd tegning" never touched
   it -- an imported PDF could only be replaced, never removed. */
async function removeUnderlay() {
  if (!underlayState.kind && !legacyUnderlayHtml) {
    statusText.textContent = "Der er intet underlag at fjerne.";
    return;
  }
  const label = underlayState.name || "Underlaget";
  const confirmed = await showConfirm("Fjern underlag?", `${label} fjernes. Tegnede objekter beroeres ikke, og du kan fortryde med Ctrl+Z.`, {
    confirmLabel: "Fjern",
    tone: "danger",
  });
  if (!confirmed) return;
  pushHistory();
  markOrphanAsset(underlayState.sourceKey);
  clearUnderlay();
  underlayState.name = "";
  underlayState.page = 1;
  underlayState.pageCount = 0;
  underlayState.rotation = 0;
  pdfDocument = null;
  currentPdfBytes = null;
  underlayScale.value = "100";
  underlayScaleValue.textContent = "100%";
  updateUnderlayScaleLabel();
  invalidateGeometry();
  statusText.textContent = "Underlag fjernet.";
  pushHistory();
}

/* --- Dialogs -------------------------------------------------------------
   Replaces window.prompt/confirm/alert. Multi-field forms mean an operation
   like "linear array" asks its three questions once instead of three times in
   a row, and the canvas keeps its state while the dialog is open. */
let dialogOpen = false;
let dialogResolve = null;
const dialogRoot = document.createElement("div");
dialogRoot.className = "dialog-backdrop";
dialogRoot.hidden = true;
dialogRoot.innerHTML = `
  <form class="dialog" novalidate>
    <h3 class="dialog-title"></h3>
    <p class="dialog-description"></p>
    <div class="dialog-fields"></div>
    <div class="dialog-actions">
      <button type="button" class="action-button" data-dialog="cancel">Annuller</button>
      <button type="submit" class="action-button primary" data-dialog="confirm">OK</button>
    </div>
  </form>`;
document.body.append(dialogRoot);

const dialogForm = dialogRoot.querySelector(".dialog");
const dialogTitle = dialogRoot.querySelector(".dialog-title");
const dialogDescription = dialogRoot.querySelector(".dialog-description");
const dialogFields = dialogRoot.querySelector(".dialog-fields");
const dialogConfirmButton = dialogRoot.querySelector('[data-dialog="confirm"]');
const dialogCancelButton = dialogRoot.querySelector('[data-dialog="cancel"]');

function closeDialog(result) {
  if (!dialogOpen) return;
  dialogOpen = false;
  dialogRoot.hidden = true;
  document.body.classList.remove("dialog-open");
  const resolve = dialogResolve;
  dialogResolve = null;
  resolve?.(result);
}

function openDialog({ title, description = "", fields = [], confirmLabel = "OK", cancelLabel = "Annuller", tone = "" }) {
  closeDialog(null);
  return new Promise((resolve) => {
    dialogOpen = true;
    dialogResolve = resolve;
    dialogTitle.textContent = title;
    dialogDescription.textContent = description;
    dialogDescription.hidden = !description;
    dialogConfirmButton.textContent = confirmLabel;
    dialogConfirmButton.classList.toggle("danger", tone === "danger");
    dialogCancelButton.hidden = cancelLabel === null;
    if (cancelLabel) dialogCancelButton.textContent = cancelLabel;
    dialogFields.replaceChildren();
    fields.forEach((field) => {
      const label = document.createElement("label");
      label.className = "dialog-field";
      const caption = document.createElement("span");
      caption.textContent = field.label;
      let input;
      if (field.type === "textarea") {
        input = document.createElement("textarea");
        input.rows = field.rows || 3;
      } else if (field.type === "select") {
        input = document.createElement("select");
        (field.options || []).forEach((option) => {
          input.append(new Option(option.label, option.value));
        });
      } else {
        input = document.createElement("input");
        input.type = field.type || "text";
        if (field.min !== undefined) input.min = field.min;
        if (field.max !== undefined) input.max = field.max;
        if (field.step !== undefined) input.step = field.step;
      }
      input.value = field.value === undefined || field.value === null ? "" : String(field.value);
      input.name = field.name;
      if (field.suffix) label.dataset.suffix = field.suffix;
      label.append(caption, input);
      dialogFields.append(label);
    });
    dialogFields.hidden = !fields.length;
    dialogRoot.hidden = false;
    document.body.classList.add("dialog-open");
    const first = dialogFields.querySelector("input, textarea, select");
    if (first) {
      first.focus();
      first.select?.();
    } else {
      dialogConfirmButton.focus();
    }
  });
}

dialogForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const values = {};
  dialogFields.querySelectorAll("[name]").forEach((input) => {
    values[input.name] = input.value;
  });
  closeDialog(values);
});

dialogCancelButton.addEventListener("click", () => closeDialog(null));
dialogRoot.addEventListener("pointerdown", (event) => {
  if (event.target === dialogRoot) closeDialog(null);
});
dialogRoot.addEventListener("keydown", (event) => {
  event.stopPropagation();
  if (event.key === "Escape") {
    event.preventDefault();
    closeDialog(null);
  }
  if (event.key === "Enter" && event.target.tagName !== "TEXTAREA") {
    event.preventDefault();
    dialogForm.requestSubmit();
  }
});

async function showPrompt(title, label, value = "", options = {}) {
  const result = await openDialog({
    title,
    description: options.description || "",
    fields: [{ name: "value", label, value, type: options.type || "text", ...options.field }],
    confirmLabel: options.confirmLabel || "OK",
  });
  return result ? result.value : null;
}

async function showConfirm(title, description, options = {}) {
  const result = await openDialog({
    title,
    description,
    fields: [],
    confirmLabel: options.confirmLabel || "Ja",
    cancelLabel: options.cancelLabel || "Annuller",
    tone: options.tone || "",
  });
  return Boolean(result);
}

async function showAlert(title, description) {
  await openDialog({ title, description, fields: [], confirmLabel: "OK", cancelLabel: null });
}

/* --- Sheet size ----------------------------------------------------------
   The paper used to be hard-coded at 1400 x 900 in three places. */
const sheetPresets = {
  custom: { label: "Eget format", short: "Eget", width: 1400, height: 900 },
  a4p: { label: "A4 staaende (210 x 297)", short: "A4", width: 210, height: 297 },
  a4l: { label: "A4 liggende (297 x 210)", short: "A4", width: 297, height: 210 },
  a3p: { label: "A3 staaende (297 x 420)", short: "A3", width: 297, height: 420 },
  a3l: { label: "A3 liggende (420 x 297)", short: "A3", width: 420, height: 297 },
  a2p: { label: "A2 staaende (420 x 594)", short: "A2", width: 420, height: 594 },
  a2l: { label: "A2 liggende (594 x 420)", short: "A2", width: 594, height: 420 },
  a1p: { label: "A1 staaende (594 x 841)", short: "A1", width: 594, height: 841 },
  a1l: { label: "A1 liggende (841 x 594)", short: "A1", width: 841, height: 594 },
  a0l: { label: "A0 liggende (1189 x 841)", short: "A0", width: 1189, height: 841 },
};

/* ISO 128 pen set, in millimetres on the printed sheet. */
const penSet = [0.13, 0.18, 0.25, 0.35, 0.5, 0.7, 1.0, 1.4];

/* ISO 3098 text heights, also in millimetres on the printed sheet. */
const textStyles = {
  micro: 1.4,
  small: 1.8,
  note: 2.5,
  dimension: 2.5,
  subtitle: 3.5,
  title: 5,
};

function setTextSize(node, paperMm) {
  node.dataset.textMm = String(paperMm);
  node.setAttribute("font-size", paperMmToUnits(paperMm));
  return node;
}

/* Text created before the paper model existed carries its size in model units.
   Recording the equivalent paper height once preserves the drawing exactly as
   authored while making it scale correctly from then on. */
function ensureTextScaleMetadata(root = drawingLayer) {
  root.querySelectorAll("text").forEach((node) => {
    if (node.dataset.textMm) return;
    const current = Number(node.getAttribute("font-size"));
    if (!(current > 0)) return;
    node.dataset.textMm = String(unitsToPaperMm(current));
  });
}

function refreshTextScale() {
  drawingLayer.querySelectorAll("[data-text-mm]").forEach((node) => {
    node.setAttribute("font-size", paperMmToUnits(Number(node.dataset.textMm)));
  });
}

/* Re-applies every stored lineweight through the current plot scale. Stroke
   widths are authored in paper millimetres, so changing 1:10 to 1:50 has to
   restate them in model units or the drawing prints with the wrong weights. */
function refreshPenTable() {
  drawingLayer.querySelectorAll(".draw-item").forEach((element) => {
    if (element.dataset.strokeWidth) applyStrokeWidth(element, Number(element.dataset.strokeWidth));
  });
}

/* One millimetre measured on the printed sheet, expressed in drawing units.
   Everything authored in paper space -- lineweights, text, hatch spacing --
   goes through here, which is what keeps a drawing legible at both A1 and A3. */
function paperMmToUnits(mm) {
  return mmToDrawing(Number(mm) * sheet.plotScale);
}

function unitsToPaperMm(units) {
  return (Number(units) * getScaleValue()) / sheet.plotScale;
}

function recomputeSheetExtent() {
  sheet.width = mmToDrawing(sheet.widthMm * sheet.plotScale);
  sheet.height = mmToDrawing(sheet.heightMm * sheet.plotScale);
}

function sheetLabelText() {
  const name = sheetPresets[sheet.paper]?.short || `${Math.round(sheet.widthMm)} x ${Math.round(sheet.heightMm)} mm`;
  return `${name} · 1:${sheet.plotScale}`;
}

function setSheet({ widthMm, heightMm, plotScale, paper } = {}, options = {}) {
  if (widthMm) sheet.widthMm = Math.max(10, Number(widthMm));
  if (heightMm) sheet.heightMm = Math.max(10, Number(heightMm));
  if (plotScale) sheet.plotScale = Math.max(0.01, Number(plotScale));
  if (paper) sheet.paper = paper;
  recomputeSheetExtent();
  const previousScale = sheet.appliedPlotScale;
  const paperNode = svg.querySelector(".paper-bg");
  const shadowNode = svg.querySelector(".sheet-shadow");
  [paperNode, shadowNode].forEach((node) => {
    if (!node) return;
    node.setAttribute("width", sheet.width);
    node.setAttribute("height", sheet.height);
  });
  const sheetLabel = document.getElementById("sheetSizeValue");
  if (sheetLabel) sheetLabel.textContent = sheetLabelText();
  refreshPenTable();
  refreshHatchScale();
  /* Every catalogue object bakes paper-mm pen weights and real-mm geometry in at
     render time, so a plot-scale change has to rebuild all of them -- not just
     connections. Re-rendering one type here is what left screws, timber and
     manufacturer components carrying the previous scale's lineweights. */
  updateCatalogElements();
  ensureTextScaleMetadata();
  refreshTextScale();
  sheet.appliedPlotScale = sheet.plotScale;
  if (previousScale && previousScale !== sheet.plotScale) invalidateSnapCache();
  invalidateGeometry();
  applyView();
  if (!options.silent) {
    statusText.textContent = `Ark: ${sheetLabelText()}.`;
    pushHistory();
  }
}


async function promptSheetSize() {
  const result = await openDialog({
    title: "Ark og maalestok",
    description: "Papirformatet og maalestokken bestemmer baade tegningens udstraekning og hvor tykke stregerne bliver paa print.",
    fields: [
      {
        name: "preset",
        label: "Papirformat",
        type: "select",
        value: sheet.paper,
        options: Object.entries(sheetPresets).map(([key, preset]) => ({ value: key, label: preset.label })),
      },
      {
        name: "plotScale",
        label: "Maalestok 1:",
        type: "select",
        value: String(sheet.plotScale),
        options: [1, 2, 5, 10, 20, 25, 50, 100, 200].map((v) => ({ value: String(v), label: `1:${v}` })),
      },
      { name: "width", label: "Egen bredde [mm]", type: "number", value: Math.round(sheet.widthMm), min: 10, step: 1 },
      { name: "height", label: "Egen hoejde [mm]", type: "number", value: Math.round(sheet.heightMm), min: 10, step: 1 },
    ],
    confirmLabel: "Anvend",
  });
  if (!result) return;
  const preset = sheetPresets[result.preset];
  const useCustom = result.preset === "custom";
  setSheet({
    paper: result.preset,
    widthMm: useCustom ? Number(result.width) : preset.width,
    heightMm: useCustom ? Number(result.height) : preset.height,
    plotScale: Number(result.plotScale) || 1,
  });
  fitToSheet();
}

/* --- Inline text editing -------------------------------------------------
   Double-click any text-bearing item to edit it in place. */
function editableTextOf(element) {
  const type = element?.dataset.type;
  if (type === "text") return { get: () => element.textContent, set: (value) => { element.textContent = value; }, title: "Rediger tekst" };
  if (type === "measure") {
    return {
      get: () => element.dataset.customText || "",
      set: (value) => {
        element.dataset.customText = value;
        element.dataset.measureMode = value ? "custom" : "actual";
        renderMeasure(element);
      },
      title: "Maaltekst",
      description: "Tom tekst viser den faktiske maalte laengde.",
    };
  }
  /* Both of these read back through dataset.dimension, because that is the key
     renderLeader and renderDetailTitle actually draw from. Writing .label /
     .title instead meant editing the text of a leader silently did nothing. */
  if (type === "symbol" && element.dataset.symbol === "sectionCut") {
    return {
      get: () => element.dataset.sectionMark || "A",
      set: (value) => setSectionMark(element, value),
      title: "Snitbogstav",
      description: "Et enkelt bogstav. Snittet vises som X-X.",
    };
  }
  if (type === "leader") {
    return { get: () => element.dataset.dimension || "", set: (value) => { element.dataset.dimension = value; renderLeader(element); }, title: "Leader tekst" };
  }
  if (type === "detailTitle") {
    return { get: () => element.dataset.dimension || "", set: (value) => { element.dataset.dimension = value; renderDetailTitle(element); }, title: "Detailtitel" };
  }
  return null;
}

async function editElementText(element) {
  const editable = editableTextOf(element);
  if (!editable) return false;
  const value = await showPrompt(editable.title, "Tekst", editable.get(), { description: editable.description });
  if (value === null) return false;
  pushHistory();
  editable.set(value);
  invalidateGeometry();
  renderSelectionOverlay();
  updatePropertyPanel();
  renderElementList();
  pushHistory();
  return true;
}

/* --- Theme ---------------------------------------------------------------
   Dark by default because that is what the tool has always looked like; the
   paper stays paper-coloured in both themes. */
const themeKey = "omkreds:theme";

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem(themeKey, theme);
  } catch (error) {
    /* private mode: the theme simply will not persist */
  }
}

function initTheme() {
  let stored = null;
  try {
    stored = window.localStorage.getItem(themeKey);
  } catch (error) {
    stored = null;
  }
  applyTheme(stored === "light" || stored === "dark" ? stored : "dark");
}

document.getElementById("themeToggle")?.addEventListener("click", () => {
  applyTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");
});

/* --- Shortcut sheet ----------------------------------------------------- */
const shortcutsOverlay = document.getElementById("shortcutsOverlay");

function toggleShortcuts(force) {
  if (!shortcutsOverlay) return;
  const next = force === undefined ? shortcutsOverlay.hidden : force;
  shortcutsOverlay.hidden = !next;
}

document.getElementById("shortcutsButton")?.addEventListener("click", () => toggleShortcuts());
document.getElementById("shortcutsClose")?.addEventListener("click", () => toggleShortcuts(false));
shortcutsOverlay?.addEventListener("pointerdown", (event) => {
  if (event.target === shortcutsOverlay) toggleShortcuts(false);
});

/* --- Selection overflow menu -------------------------------------------- */
const overflowToggle = document.querySelector("[data-selection-more]");
const overflowMenu = document.querySelector(".overflow-menu");

function hideOverflowMenu() {
  if (overflowMenu) overflowMenu.hidden = true;
}

overflowToggle?.addEventListener("click", (event) => {
  event.stopPropagation();
  if (overflowMenu) overflowMenu.hidden = !overflowMenu.hidden;
});

document.addEventListener("pointerdown", (event) => {
  if (overflowMenu && !overflowMenu.hidden && !event.target.closest(".selection-overflow")) hideOverflowMenu();
});

/* --- Sheet size and autosave controls ----------------------------------- */
/* Packed geometry arrives before the heavy import; light it up immediately. */
function announcePackedGeometry() {
  const info = packedGeometryInfo();
  const node = document.getElementById("geometryStatus");
  if (!node) return;
  node.textContent = info
    ? `${info.count} komponenter med 1:1 producentgeometri${info.lossless ? " (tabsfri)" : ` (±${info.toleranceMm} mm)`}`
    : "Producentgeometri ikke indlaest";
}

document.getElementById("sheetSizeButton")?.addEventListener("click", promptSheetSize);
document.getElementById("calibrateUnderlay")?.addEventListener("click", beginUnderlayCalibration);
document.getElementById("removeUnderlay")?.addEventListener("click", removeUnderlay);
underlayLocked.addEventListener("change", () => {
  updateCanvasCursor();
  if (!underlayLocked.checked && underlayState.kind) {
    statusText.textContent = "Underlaget er laast op: traek for at flytte det.";
  }
});
document.getElementById("clearAutosave")?.addEventListener("click", async () => {
  const confirmed = await showConfirm("Ryd autosave?", "Den gemte session i browseren slettes. Tegningen paa skaermen roeres ikke.", {
    confirmLabel: "Ryd",
    tone: "danger",
  });
  if (confirmed) clearAutosave();
});

/* --- Late-loading manufacturer geometry ---------------------------------
   The generated Simpson geometry is 8 MB. It now loads async so it cannot
   delay first paint; when it lands the component library refreshes. */
/* The library marks a variant placeable by looking at variant.geometry.status,
   so the packed bundle has to be expanded into that same shape -- otherwise
   every component reports "CAD import required" despite being present. */
function packedGeometryByManufacturer() {
  const packed = window.omkredsPackedGeometry;
  if (!packed?.parts) return null;
  const manufacturerId = packed.manufacturer || "simpson-strong-tie";
  const bySku = {};
  Object.keys(packed.parts).forEach((sku) => {
    const record = unpackGeometry(sku);
    if (record) bySku[sku] = record;
  });
  return { [manufacturerId]: bySku };
}

function consumeGeneratedGeometry() {
  applyGeneratedManufacturerFamilies(window.omkredsPackedGeometry?.families || window.omkredsGeneratedManufacturerFamilies);
  unpackedGeometryCache.clear();
  applyVerifiedManufacturerGeometry(packedGeometryByManufacturer() || window.omkredsVerifiedManufacturerGeometry);
  updateComponentSourceUi();
  /* Deliberately silent: the component browser visibly fills in, and this
     lands after boot, where it would otherwise overwrite the restore notice. */
}

const verifiedGeometryScript = document.getElementById("verifiedGeometryScript");
if (window.omkredsPackedGeometry || window.omkredsVerifiedManufacturerGeometry || window.omkredsGeneratedManufacturerFamilies) {
  consumeGeneratedGeometry();
} else if (verifiedGeometryScript) {
  /* Only reached when the packed bundle is absent and the raw import is used. */
  verifiedGeometryScript.addEventListener("load", consumeGeneratedGeometry, { once: true });
}

/* Safety net: any drawing mutation that a call site forgets to announce still
   invalidates the caches on the next microtask. */
new MutationObserver(() => invalidateGeometry()).observe(drawingLayer, {
  childList: true,
  subtree: true,
  attributes: true,
});

initTheme();
announcePackedGeometry();
currentScaleValue = Number(scaleFactor.value);
recomputeSheetExtent();
setSheet({}, { silent: true });
populateScrewFamilies();
updateComponentSourceUi();
renderLayerList();
setActiveTool("select");
openPanel(document.body.dataset.openPanel || "properties");
document.body.dataset.panelOpen = "false";
updatePropertyPanel();
updateSnapReadout();

/* The viewport must be sized before anything measures the canvas. */
applyView();
new ResizeObserver(() => handleViewportResize()).observe(canvasWrap);

const restoredSession = restoreAutosave();
if (!restoredSession) {
  /* A new drawing starts on real paper so ISO text and pen sizes are right
     from the first stroke; restored work keeps whatever sheet it was made on. */
  setSheet({ paper: "a3l", widthMm: 420, heightMm: 297, plotScale: 10 }, { silent: true });
  setAutosaveStatus("Autosave klar");
}
if (restoredSession) fitToContent();
else fitToSheet();
flushUi();
pushHistory();
updateHistoryButtons();
bootComplete = true;
statusText.textContent = restoredSession
  ? "Forrige session gendannet. Tryk ? for tastaturgenveje."
  : "Klar. Tryk ? for tastaturgenveje.";
sweepOrphanAssets(underlayState.sourceKey);

[hatchAngleInput, hatchScaleInput].forEach((control) => {
  control?.addEventListener("input", updateSelectedHatchAppearance);
});

