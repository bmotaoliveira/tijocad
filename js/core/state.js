// ── SHARED MUTABLE STATE ───────────────────────────────────────────────────
// All modules import S and access/mutate state as S.varName

export const S = {
  // ── Brick config ──────────────────────────────────────────────────────
  cellCm: 12.5,
  brickHCm: 7,
  wallHCm: 250,
  brickOpacity: 1.0,
  drawMode: 'wall',
  openingInf: 0,
  openingSup: 210,
  vistaMode: 'planta',
  currentCourse: 0,

  // ── History (undo/redo) ───────────────────────────────────────────────
  hist: [[]],
  hi: 0,
  histOpen: [{}],
  histWH: [{}],
  histGrout: [[]],
  histConduits: [[]],
  histElecBoxes: [[]],
  histHydroPoints: [[]],
  histGasPoints: [[]],
  histSlopedKeys: [[]],
  histDims: [[]],
  histElevViews: [[]],

  // ── Data ─────────────────────────────────────────────────────────────
  dims: [],
  is3d: false,
  wallHMap: {},
  openMap: {},
  doorOrient: {},

  // ── Fiada tools ───────────────────────────────────────────────────────
  fiadaTool: 'grout',
  brickInstMap: new Map(),
  manualGrout: new Set(),
  groutExclude: new Set(),

  // ── Installations ─────────────────────────────────────────────────────
  manualElec: new Set(),
  manualWater: new Set(),
  elecBoxes: new Map(),
  hydroPoints: new Map(),
  gasPoints: new Map(),
  electricalSubtool: 'elec',
  conduits: [],
  pendingConduit: null,

  // ── Geometry ─────────────────────────────────────────────────────────
  slopedKeys: new Set(),

  // ── Elevation ─────────────────────────────────────────────────────────
  elevViews: [],
  currentElevId: null,
  elevPicking: true,
  elevOx: 0,
  elevOy: 0,
  elevSc: 1,
  elevPanning: false,
  elevPanSX: 0,
  elevPanSY: 0,
  elevPanOX: 0,
  elevPanOY: 0,

  // ── Background image ──────────────────────────────────────────────────
  bgImg: {
    img: null,
    x: 0, y: 0,
    scale: 1,
    opacity: 0.3,
    locked: false,
    fileName: '',
    dragging: false,
    resizing: false,
    dragStartX: 0, dragStartY: 0,
    dragImgX: 0, dragImgY: 0,
    resizeStartX: 0, resizeStartY: 0, resizeStartScale: 1,
  },

  // ── Move segment ──────────────────────────────────────────────────────
  moveMode: false,
  moveRun: [],
  moveSC: 0,
  moveSR: 0,
  moveDC: 0,
  moveDR: 0,

  // ── Run selection ─────────────────────────────────────────────────────
  selectedRun: [],
  selectedRunDir: 'H',
  selectedRunType: 'wall',
  drawStartedOnExisting: false,

  // ── Stretch ───────────────────────────────────────────────────────────
  stretchMode: false,
  stretchEnd: 'start',
  stretchRun: [],
  stretchDir: 'H',
  stretchBaseSet: null,
  stretchBaseOpenMap: null,

  // ── Project / autosave ────────────────────────────────────────────────
  projectName: '',
  lastSavedState: '',
  autosaveTimer: null,

  // ── Settings ──────────────────────────────────────────────────────────
  elecLow: 30,
  elecMid: 120,
  elecHigh: 180,
  hydroLow: 30,
  hydroMid: 110,
  hydroHigh: 180,
  stdSill: 110,
  stdHead: 210,

  // ── Canvas / 2D render ────────────────────────────────────────────────
  cv2: null,   // set in app.js after DOM ready
  cx2: null,
  sc2: 1,
  ox: 0,
  oy: 0,
  hcell: null,
  panning: false,
  panSX: 0,
  panSY: 0,
  panOX: 0,
  panOY: 0,
  lastSX: 0,
  lastSY: 0,
  drawing: false,
  dS: null,
  dE: null,

  // ── Ruler / height tool ───────────────────────────────────────────────
  rulerOn: false,
  rPt1: null,
  snapPt: null,
  hovDim: -1,
  selDim: -1,
  heightMode: false,
  hovRun: [],

  // ── 3D ────────────────────────────────────────────────────────────────
  r3: null,
  s3: null,
  c3: null,
  animId3: null,
  brick3dOpacity: 1.0,
  infra3dOpacity: 1.0,
  th3: 0.6,
  ph3: 0.85,
  rad3: 14,
  tgt3x: 0,
  tgt3y: 1.25,
  tgt3z: 0,
  m3: { lb: false, rb: false, x: 0, y: 0 },
};
