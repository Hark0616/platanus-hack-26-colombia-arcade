// PARCHE PARTY — El arcade colombiano
// Platanus Hack 26: Bogotá

const W = 800, H = 600;
const HALF = W / 2;
const STORAGE_KEY = 'parche-party-scores';

// ─── COLORES (paleta retro CRT arcade) ────────────────────────────────────
const C = {
  bg:      0x000000, panel:   0x03030a, div:     0x1a1a3a,
  p1:      0xFFE600, p1d:     0xB8A800, p1t:     '#FFE600',
  p2:      0xFF44AA, p2d:     0xAA2266, p2t:     '#FF44AA',
  neon:    0x00FF41, neont:   '#00FF41',
  white:   0xFFFFFF, wt:      '#FFFFFF',
  green:   0x00FF41, red:     0xFF2222, rt:      '#FF2222',
  grey:    0x666666, dark:    0x111122,
  // Confeti bandera Colombia
  col1:    0xFFE600, col2:    0x003087, col3:    0xCC0001,
  // Arepas
  arepa:   0xF4A800, arepaDk: 0xC47800, carbon:  0x222222,
  // Chiva
  ch1:     0xFF2200, ch2:     0xFFDD00, ch3:     0x0044FF, ch4: 0x00AA44,
  // Tejo
  tejo:    0x8B6355, mecha:   0xFF3300, mechaG:  0xFFAA00,
  // Café
  cafe:    0x5C2E0A, pocillo: 0xF0EAD6, liquid:  0x3B1A06,
};

// ─── CONTROLES ─────────────────────────────────────────────────────────────
// DO NOT replace existing keys — they match the physical arcade cabinet wiring.
const CABINET_KEYS = {
  P1_U: ['w'], P1_D: ['s'], P1_L: ['a'], P1_R: ['d'],
  P1_1: ['u'], P1_2: ['i'], P1_3: ['o'],
  P1_4: ['j'], P1_5: ['k'], P1_6: ['l'],
  P2_U: ['ArrowUp'], P2_D: ['ArrowDown'], P2_L: ['ArrowLeft'], P2_R: ['ArrowRight'],
  P2_1: ['r'], P2_2: ['t'], P2_3: ['y'],
  P2_4: ['f'], P2_5: ['g'], P2_6: ['h'],
  START1: ['Enter'], START2: ['2'],
};

const KEY_MAP = {};
for (const [code, keys] of Object.entries(CABINET_KEYS)) {
  for (const k of keys) KEY_MAP[k.length === 1 ? k.toLowerCase() : k] = code;
}

// ─── MICROJUEGOS DISPONIBLES ───────────────────────────────────────────────
const MG_POOL = ['arepa', 'chiva', 'tejo', 'cafe'];

// ─── ESTADO GLOBAL ─────────────────────────────────────────────────────────
let G; // scene ref
let ST; // state

function mkState() {
  return {
    phase: 'loading',  // loading|intro|transition|playing|result|final|name
    round: 0,
    totalRounds: 4,
    queue: shuffle(MG_POOL.slice()),
    scores: { p1: 0, p2: 0 },
    roundResult: null, // {p1, p2, winner}
    currentMg: null,
    highScores: [],
    nameEntry: { letters: [], row: 0, col: 0, who: 'p1', cooldown: 0 },
    shakeFrames: 0,
    input: { held: Object.create(null), pressed: Object.create(null) },
  };
}

// ─── PHASER CONFIG ─────────────────────────────────────────────────────────
const config = {
  type: Phaser.AUTO,
  width: W, height: H,
  parent: 'game-root',
  backgroundColor: '#07080f',
  physics: { default: 'arcade', arcade: { gravity: { y: 0 }, debug: false } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H },
  scene: { preload, create, update },
};

new Phaser.Game(config);

function preload() {}

function create() {
  G = this;
  ST = mkState();

  setupInput(G);
  buildUI(G);
  addCRTEffect(G);

  loadScores().then(s => {
    ST.highScores = s;
    showIntro();
  }).catch(() => { ST.highScores = []; showIntro(); });
}

function update(time, delta) {
  if (!ST) return;
  clearPressed();

  if (ST.shakeFrames > 0) {
    ST.shakeFrames--;
    G.cameras.main.setScroll(
      (Math.random() - 0.5) * 8,
      (Math.random() - 0.5) * 8
    );
    if (ST.shakeFrames === 0) G.cameras.main.setScroll(0, 0);
  }

  const ph = ST.phase;
  if (ph === 'intro')      handleIntro(time);
  else if (ph === 'transition') handleTransition(time);
  else if (ph === 'playing')    handlePlaying(time, delta);
  else if (ph === 'result')     handleResult(time);
  else if (ph === 'name')       handleName(time);
  else if (ph === 'final')      handleFinal(time);
}

// ─── INPUT ─────────────────────────────────────────────────────────────────
function setupInput(scene) {
  const onDown = (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const code = KEY_MAP[k];
    if (!code) return;
    if (!ST.input.held[code]) ST.input.pressed[code] = true;
    ST.input.held[code] = true;
  };
  const onUp = (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const code = KEY_MAP[k];
    if (!code) return;
    ST.input.held[code] = false;
  };
  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);
  scene.events.once('shutdown', () => {
    window.removeEventListener('keydown', onDown);
    window.removeEventListener('keyup', onUp);
  });
}

function clearPressed() {
  // pressed is consumed by consumers via consume()
}

function held(code) { return !!ST.input.held[code]; }

function consume(codes) {
  for (const c of codes) {
    if (ST.input.pressed[c]) { ST.input.pressed[c] = false; return true; }
  }
  return false;
}

function consumeAll() {
  for (const k in ST.input.pressed) ST.input.pressed[k] = false;
}

// ─── AUDIO ─────────────────────────────────────────────────────────────────
function getCtx() {
  return G && G.sound && G.sound.context ? G.sound.context : null;
}

function tone(freq, dur, type, vol, delay) {
  const ctx = getCtx(); if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.connect(g); g.connect(ctx.destination);
    osc.type = type || 'square';
    osc.frequency.value = freq;
    const t = ctx.currentTime + (delay || 0);
    g.gain.setValueAtTime(vol || 0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.start(t); osc.stop(t + dur + 0.01);
  } catch (_) {}
}

function sweepTone(f1, f2, dur, type, vol) {
  const ctx = getCtx(); if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.connect(g); g.connect(ctx.destination);
    osc.type = type || 'square';
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(f1, t);
    osc.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.start(t); osc.stop(t + dur + 0.01);
  } catch (_) {}
}

function playJingle(type) {
  if (type === 'win') {
    tone(523, 0.1, 'square', 0.2, 0);
    tone(659, 0.1, 'square', 0.2, 0.1);
    tone(784, 0.15, 'square', 0.25, 0.2);
    tone(1047, 0.3, 'square', 0.25, 0.35);
  } else if (type === 'fail') {
    sweepTone(400, 120, 0.4, 'sawtooth', 0.2);
  } else if (type === 'tick') {
    tone(880, 0.05, 'square', 0.08);
  } else if (type === 'catch') {
    sweepTone(440, 880, 0.08, 'square', 0.15);
  } else if (type === 'burn') {
    sweepTone(300, 80, 0.25, 'sawtooth', 0.18);
  } else if (type === 'hit') {
    sweepTone(200, 900, 0.12, 'sawtooth', 0.22);
  } else if (type === 'horn') {
    tone(440, 0.12, 'sawtooth', 0.2);
  } else if (type === 'crash') {
    sweepTone(600, 50, 0.3, 'sawtooth', 0.3);
  } else if (type === 'launch') {
    sweepTone(150, 600, 0.18, 'sawtooth', 0.2);
  } else if (type === 'explode') {
    sweepTone(800, 100, 0.35, 'sawtooth', 0.3);
  } else if (type === 'click') {
    tone(1200, 0.04, 'square', 0.1);
  } else if (type === 'start') {
    tone(330, 0.08, 'square', 0.2, 0);
    tone(440, 0.08, 'square', 0.2, 0.09);
    tone(550, 0.15, 'square', 0.25, 0.18);
  }
}

// ─── UTILIDADES ────────────────────────────────────────────────────────────
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function shake(frames) {
  ST.shakeFrames = frames || 8;
}

function pad2(n) { return String(Math.max(0, Math.floor(n))).padStart(2, '0'); }

// txt() — texto con stroke negro para legibilidad retro
function txt(x, y, s, size, color, origin, bold) {
  return G.add.text(x, y, s, {
    fontFamily: 'monospace', fontSize: (size || 16) + 'px',
    color: color || '#FFFFFF', fontStyle: bold ? 'bold' : 'normal',
    stroke: '#000000', strokeThickness: bold ? 4 : 2,
  }).setOrigin(origin !== undefined ? origin : 0.5);
}

// retT() — texto retro con glow-shadow y stroke fuerte (para UI del juego)
function retT(x, y, s, size, colHex, origin) {
  return G.add.text(x, y, s, {
    fontFamily: 'monospace', fontSize: (size || 14) + 'px',
    color: colHex || '#FFFFFF', fontStyle: 'bold',
    stroke: '#000000', strokeThickness: 4,
    shadow: { offsetX: 0, offsetY: 0, color: colHex || '#FFFFFF', blur: 8, fill: true },
  }).setOrigin(origin !== undefined ? origin : 0.5);
}

// scorePanel() — panel retro detrás de un texto de puntuación
function scorePanel(x, y, w, h, colHex) {
  const bg = rect(x, y, w, h, 0x000000, 0.85);
  bg.setStrokeStyle(1, colHex === C.p1t ? C.p1 : C.p2, 0.7);
  bg.setDepth(4);
  return bg;
}

// drawArenaFrame() — marco neon alrededor del área de juego de un jugador
function drawArenaFrame(arena) {
  const g = G.add.graphics();
  g.setDepth(6);
  const col = arena === 0 ? C.p1 : C.p2;
  const ax = arena === 0 ? 2 : HALF + 2;
  const aw = HALF - 4;
  // Marco exterior
  g.lineStyle(2, col, 0.5);
  g.strokeRect(ax, 58, aw, H - 64);
  // Marco interior más sutil
  g.lineStyle(1, col, 0.12);
  g.strokeRect(ax + 4, 62, aw - 8, H - 72);
  // Esquinas pixel-art (pequeños cuadrados en cada esquina)
  g.fillStyle(col, 0.9);
  [[ax, 58],[ax + aw - 4, 58],[ax, H - 6],[ax + aw - 4, H - 6]].forEach(([cx, cy]) => {
    g.fillRect(cx, cy, 4, 4);
  });
  mgObjects.push(g);
  return g;
}

function rect(x, y, w, h, col, alpha) {
  const r = G.add.rectangle(x, y, w, h, col, alpha !== undefined ? alpha : 1);
  return r;
}

function circ(x, y, r, col, alpha) {
  return G.add.circle(x, y, r, col, alpha !== undefined ? alpha : 1);
}

// ─── PIXEL ART HELPERS ──────────────────────────────────────────────────────
// Helper to draw a pixel grid from a multi-line string pattern
function drawPixelMatrix(g, matrix, palette, startX, startY, pixelSize = 2) {
  for (let r = 0; r < matrix.length; r++) {
    const row = matrix[r];
    for (let c = 0; c < row.length; c++) {
      const char = row[c];
      if (char !== '.' && palette[char] !== undefined) {
        g.fillStyle(palette[char], 1);
        g.fillRect(startX + c * pixelSize, startY + r * pixelSize, pixelSize, pixelSize);
      }
    }
  }
}

// Procedural pixel-art Arepa
function createPixelArepa(x, y) {
  const g = G.add.graphics({ x, y });
  // Octagonal chunky 8-bit arepa with toasted grill marks
  // 12x12 grid (pixelSize = 2 -> 24x24px)
  const pattern = [
    '..YYYYYY....',
    '.YYYYYYYYY..',
    'YYYYYYYYYYY.',
    'YYDDYYYYDDYY',
    'YYDDYYYYDDYY',
    'YYYYYYYYYYYY',
    'YYDDYYYYDDYY',
    'YYDDYYYYDDYY',
    'YYYYYYYYYYYY',
    'YYYYYYYYYYY.',
    '.YYYYYYYYY..',
    '..YYYYYY....',
  ];
  const palette = {
    Y: 0xF7B32B, // Golden corn dough
    D: 0x8D5B18, // Toasted brown grill marks
  };
  drawPixelMatrix(g, pattern, palette, -12, -12, 2);
  g.setDepth(5);
  return g;
}

// Procedural pixel-art Carbón (Burnt ember)
function createPixelCarbon(x, y) {
  const g = G.add.graphics({ x, y });
  const pattern = [
    '..KKKKKK....',
    '.KKRRRRKKK..',
    'KKRRFFRRKKK.',
    'KKRFFFFRKKKK',
    'KKRFFFFRKKKK',
    'KKKRRRRKKKKK',
    'KKKKKKRRKKKK',
    'KKKKKKRRKKKK',
    'KKKRRRRKKKKK',
    'KKKKKKKKKKK.',
    '.KKKKKKKKK..',
    '..KKKKKK....',
  ];
  const palette = {
    K: 0x1A1A1A, // Pitch black crust
    R: 0x881100, // Dark red ember
    F: 0xFF4400, // Fiery glow
  };
  drawPixelMatrix(g, pattern, palette, -12, -12, 2);
  g.setDepth(5);
  return g;
}

// Procedural pixel-art Tejo Puck (Heavy metal puck)
function createPixelTejo(x, y) {
  const g = G.add.graphics({ x, y });
  const pattern = [
    '..SSSS..',
    '.SMMMMSS',
    'SMMHHMMSS',
    'SMMHHMMSS',
    'SMMMMMMSS',
    '.SSSSSS.',
  ];
  const palette = {
    S: 0x333344, // Dark iron shadow
    M: 0x777788, // Cast iron body
    H: 0xCCCCDD, // Metal highlight reflection
  };
  drawPixelMatrix(g, pattern, palette, -9, -9, 2);
  g.setDepth(15);
  return g;
}

// Procedural pixel-art Mecha (Triangle gunpowder packet)
function createPixelMecha(x, y) {
  const g = G.add.graphics({ x, y });
  // Diamond/Triangle gunpowder mecha with white paper wrapper & red core
  const pattern = [
    '....WW....',
    '...WRRW...',
    '..WRRRRW..',
    '.WRRFFRRW.',
    '..WRRRRW..',
    '...WRRW...',
    '....WW....',
  ];
  const palette = {
    W: 0xEEEEEE, // White paper wrapper
    R: 0xDD2200, // Red gunpowder sign
    F: 0xFFFF00, // Sparking yellow core
  };
  drawPixelMatrix(g, pattern, palette, -10, -7, 2);
  g.setDepth(6);
  return g;
}

// Procedural pixel-art Pocillo de Peltre (Colombian enamel mug)
function createPixelPocillo(g, x, y, tiltAngle) {
  g.clear();
  g.save();
  g.translateCanvas(x, y);
  g.rotateCanvas((tiltAngle * Math.PI) / 180);

  // Mug Body: White/Cream with classic Blue Enamel Rim
  const pattern = [
    'BBBBBBBBBBBB....',
    'WWWWWWWWWWWW.BB.',
    'WWWWWWWWWWWW.WW.',
    'WWWWWWWWWWWW.WW.',
    'WWWWWWWWWWWW.BB.',
    'WWWWWWWWWWWW....',
    'WWWWWWWWWWWW....',
    'WWWWWWWWWWWW....',
    'BBBBBBBBBBBB....',
  ];
  const palette = {
    B: 0x0038A8, // Blue enamel rim and handle
    W: 0xF0EAD6, // Cream mug body
  };
  drawPixelMatrix(g, pattern, palette, -16, -18, 2);

  // Coffee liquid level inside
  g.fillStyle(0x3B1A06, 1);
  g.fillRect(-14, -10, 20, 14);

  g.restore();
}

// Procedural pixel-art Chiva Bus
function createPixelChiva(x, y, isP1) {
  const g = G.add.graphics({ x, y });
  // Chiva Colombiana: Luggage roof rack, colored body stripes, windshield, tires
  const pattern = [
    '..YYYYGGGGCCCC..', // Roof rack with bananas/luggage
    '.RRRRRRRRRRRRRR.', // Roof ladder / rack base
    'CWWWWWWWWWWWWWWC', // Windshield visor
    'CWWCCCCCCWWWWWWC', // Glass windows
    'YYYYYYYYYYYYYYYY', // Yellow flag stripe
    'BBBBBBBBBBBBBBBB', // Blue flag stripe
    'RRRRRRRRRRRRRRRR', // Red flag stripe
    'TT.LLLLLLLLLL.TT', // Wheel wells & wooden ladder
    'TT............TT', // Chunky square tires
  ];
  const palette = {
    Y: 0xFFD700, // Yellow stripe / bananas
    G: 0x00AA44, // Green luggage / plantains
    C: 0x00E5FF, // Cyan windshield / mirrors
    R: 0xDD1100, // Red stripe / roof rack
    W: 0xFFFFFF, // Window frame / lights
    B: isP1 ? 0x0033AA : 0x8800AA, // Blue stripe (P1) or Purple stripe (P2)
    L: 0x8B4513, // Wooden ladder
    T: 0x111111, // Square black tires
  };
  drawPixelMatrix(g, pattern, palette, -24, -18, 3);
  g.setDepth(10);
  return g;
}

// Procedural pixel-art Obstacle (Rock / Crag)
function createPixelObstacle(x, y) {
  const g = G.add.graphics({ x, y });
  const pattern = [
    '....GGGG....',
    '..GGMMMMGG..',
    '.GMMHHHHMMG.',
    'GMMHHSSHHMMG',
    'GMMSSSSSSMMG',
    '.GMMMMMMMMG.',
    '..GGGGGGGG..',
  ];
  const palette = {
    G: 0x222222, // Dark stone outline
    M: 0x555566, // Mid stone grey
    H: 0x888899, // Highlight rock face
    S: 0x333344, // Shadow facet
  };
  drawPixelMatrix(g, pattern, palette, -18, -10, 3);
  g.setDepth(5);
  return g;
}

// ─── CONFETI ───────────────────────────────────────────────────────────────
function spawnConfetti(count) {
  const colors = [C.col1, C.col2, C.col3, C.white, C.p1, C.p2];
  for (let i = 0; i < (count || 60); i++) {
    const x = Math.random() * W;
    const col = colors[Math.floor(Math.random() * colors.length)];
    const p = G.add.rectangle(x, -10, 6, 10, col);
    p.setDepth(50);
    const dur = 1200 + Math.random() * 1200;
    G.tweens.add({
      targets: p,
      y: H + 20,
      x: x + (Math.random() - 0.5) * 120,
      angle: Math.random() * 360,
      duration: dur,
      ease: 'Linear',
      onComplete: () => p.destroy(),
    });
  }
}

// ─── EFECTO CRT ─────────────────────────────────────────────────────────────
function addCRTEffect(scene) {
  // Scanlines — líneas horizontales semi-transparentes cada 3px (efecto CRT)
  const sl = scene.add.graphics();
  sl.setDepth(92);
  for (let y = 0; y < H; y += 3) {
    sl.fillStyle(0x000000, 0.22);
    sl.fillRect(0, y, W, 1);
  }

  // Vignette — oscurecer bordes como pantalla CRT curva
  const vig = scene.add.graphics();
  vig.setDepth(91);
  const steps = 28;
  for (let i = 0; i < steps; i++) {
    const a = ((steps - i) / steps) * 0.55;
    vig.fillStyle(0x000000, a);
    vig.fillRect(i, i, W - i*2, 3);              // top
    vig.fillRect(i, H - i - 3, W - i*2, 3);     // bottom
    vig.fillRect(i, i, 3, H - i*2);             // left
    vig.fillRect(W - i - 3, i, 3, H - i*2);    // right
  }

  // Phosphor border glow
  const border = scene.add.graphics();
  border.setDepth(90);
  border.lineStyle(4, C.neon, 0.06);
  border.strokeRect(0, 0, W, H);
  border.lineStyle(2, C.p1, 0.04);
  border.strokeRect(4, 4, W - 8, H - 8);
}

// ─── UI CONTAINERS ─────────────────────────────────────────────────────────
let UI = {};

function buildUI(scene) {
  // Background — true black CRT
  UI.bg = rect(W / 2, H / 2, W, H, C.bg);
  UI.bg.setDepth(0);

  // ── INTRO SCREEN (attract mode)
  UI.intro = scene.add.container(0, 0).setDepth(30).setVisible(false);
  UI.intro.add(rect(W/2, H/2, W, H, C.bg, 1));

  // Top banner line
  UI.intro.add(rect(W/2, 44, W, 2, C.p1, 0.8));
  UI.intro.add(scene.add.text(W/2, 22, '★  PLATANUS HACK 26 · BOGOTÁ  ★', {
    fontFamily: 'monospace', fontSize: '13px', color: C.p1t,
  }).setOrigin(0.5));

  // Stars scattered
  const starG = scene.add.graphics();
  for (let i = 0; i < 60; i++) {
    starG.fillStyle(0xFFFFFF, 0.08 + Math.random() * 0.18);
    starG.fillRect(Math.random() * W, 50 + Math.random() * (H - 80), Math.random() < 0.7 ? 1 : 2, Math.random() < 0.7 ? 1 : 2);
  }
  UI.intro.add(starG);

  // Title shadow (offset 3px)
  const titleShadow = scene.add.text(W/2 + 4, 164, 'PARCHE\nPARTY', {
    fontFamily: 'monospace', fontSize: '80px', color: '#220000', fontStyle: 'bold',
    align: 'center', lineSpacing: -14,
  }).setOrigin(0.5);
  UI.intro.add(titleShadow);

  UI.introTitle = scene.add.text(W/2, 160, 'PARCHE\nPARTY', {
    fontFamily: 'monospace', fontSize: '80px', color: C.p1t, fontStyle: 'bold',
    align: 'center', lineSpacing: -14,
  }).setOrigin(0.5);
  UI.intro.add(UI.introTitle);

  // Subtitle
  UI.introPulse = scene.add.text(W/2, 298, '— EL ARCADE COLOMBIANO —', {
    fontFamily: 'monospace', fontSize: '15px', color: C.p2t,
  }).setOrigin(0.5);
  UI.intro.add(UI.introPulse);

  // Separator line
  UI.intro.add(rect(W/2, 322, 520, 1, C.div, 1));

  // High score label
  UI.intro.add(scene.add.text(W/2, 342, 'MEJORES PUNTAJES', {
    fontFamily: 'monospace', fontSize: '12px', color: C.neont,
  }).setOrigin(0.5));

  UI.introScores = scene.add.text(W/2, 386, '', {
    fontFamily: 'monospace', fontSize: '14px', color: '#aaaaaa',
    align: 'center', lineSpacing: 6,
  }).setOrigin(0.5);
  UI.intro.add(UI.introScores);

  // Separator
  UI.intro.add(rect(W/2, 440, 520, 1, C.div, 1));

  // Insert coin / press start (blink target)
  UI.introBtn = scene.add.text(W/2, 468, '★  PRESIONA  START  ★', {
    fontFamily: 'monospace', fontSize: '22px', color: C.wt, fontStyle: 'bold',
  }).setOrigin(0.5);
  UI.intro.add(UI.introBtn);

  // Controls hint
  UI.intro.add(scene.add.text(W/2, 502, 'P1: ENTER    ·    P2: TECLA 2', {
    fontFamily: 'monospace', fontSize: '12px', color: '#444466',
  }).setOrigin(0.5));

  // Bottom border
  UI.intro.add(rect(W/2, H - 16, W, 2, C.p2, 0.4));
  UI.intro.add(scene.add.text(W/2, H - 8, 'PARCHE PARTY  ©2026  HARK0616', {
    fontFamily: 'monospace', fontSize: '9px', color: '#333355',
  }).setOrigin(0.5));

  // ── TRANSITION SCREEN
  UI.trans = scene.add.container(0, 0).setDepth(40).setVisible(false);
  UI.trans.add(rect(W/2, H/2, W, H, C.bg, 0.97));
  // Top/bottom neon bars
  UI.trans.add(rect(W/2, 3, W, 6, C.p1, 0.9));
  UI.trans.add(rect(W/2, H-3, W, 6, C.p1, 0.9));

  UI.transRound = scene.add.text(W/2, 130, '', {
    fontFamily: 'monospace', fontSize: '16px', color: C.neont,
  }).setOrigin(0.5);
  UI.trans.add(UI.transRound);

  UI.trans.add(rect(W/2, 160, 600, 1, C.div, 0.8));

  UI.transName = scene.add.text(W/2, 260, '', {
    fontFamily: 'monospace', fontSize: '58px', color: C.p1t, fontStyle: 'bold',
    align: 'center',
  }).setOrigin(0.5);
  UI.trans.add(UI.transName);

  UI.trans.add(rect(W/2, 370, 600, 1, C.div, 0.8));

  UI.transHint = scene.add.text(W/2, 400, '', {
    fontFamily: 'monospace', fontSize: '14px', color: '#888888', align: 'center',
  }).setOrigin(0.5);
  UI.trans.add(UI.transHint);

  UI.transTimer = scene.add.text(W/2, H - 50, '', {
    fontFamily: 'monospace', fontSize: '20px', color: C.neont, fontStyle: 'bold',
  }).setOrigin(0.5);
  UI.trans.add(UI.transTimer);

  // ── HUD — estilo 1UP / 2UP retro arcade
  UI.hud = scene.add.container(0, 0).setDepth(10).setVisible(false);

  // Header band
  UI.hudBg = rect(W/2, 28, W, 56, 0x000000); UI.hud.add(UI.hudBg);
  UI.hud.add(rect(W/2, 56, W, 2, C.div, 0.9));

  // 1UP label + score
  UI.hud.add(scene.add.text(80, 10, '1UP', {
    fontFamily: 'monospace', fontSize: '12px', color: C.neont,
  }).setOrigin(0.5, 0));
  UI.hudP1 = scene.add.text(80, 26, '000000', {
    fontFamily: 'monospace', fontSize: '22px', color: C.p1t, fontStyle: 'bold',
  }).setOrigin(0.5, 0); UI.hud.add(UI.hudP1);

  // 2UP label + score
  UI.hud.add(scene.add.text(W - 80, 10, '2UP', {
    fontFamily: 'monospace', fontSize: '12px', color: C.neont,
  }).setOrigin(0.5, 0));
  UI.hudP2 = scene.add.text(W - 80, 26, '000000', {
    fontFamily: 'monospace', fontSize: '22px', color: C.p2t, fontStyle: 'bold',
  }).setOrigin(0.5, 0); UI.hud.add(UI.hudP2);

  // Round indicator (center top)
  UI.hudRound = scene.add.text(W/2, 10, 'RONDA 1/4', {
    fontFamily: 'monospace', fontSize: '11px', color: '#666688',
  }).setOrigin(0.5, 0); UI.hud.add(UI.hudRound);

  // Minigame name (center, small)
  UI.hudMgName = scene.add.text(W/2, 26, '', {
    fontFamily: 'monospace', fontSize: '13px', color: '#555577',
  }).setOrigin(0.5, 0); UI.hud.add(UI.hudMgName);

  // Vertical divider
  UI.divLine = rect(HALF, H/2 + 30, 2, H - 60, C.div, 0.4); UI.hud.add(UI.divLine);

  // Timer — big, at bottom center
  UI.hud.add(rect(W/2, H - 22, 80, 28, 0x000000));
  UI.hud.add(rect(W/2, H - 22, 80, 28, C.div, 0.5));
  UI.hudTimer = scene.add.text(W/2, H - 22, '10', {
    fontFamily: 'monospace', fontSize: '26px', color: C.wt, fontStyle: 'bold',
  }).setOrigin(0.5); UI.hud.add(UI.hudTimer);

  // ── RESULT SCREEN
  UI.result = scene.add.container(0, 0).setDepth(35).setVisible(false);
  UI.result.add(rect(W/2, H/2, W, H, C.bg, 0.97));
  // Neon bars top/bottom
  UI.result.add(rect(W/2, 3, W, 6, C.p1, 0.7));
  UI.result.add(rect(W/2, H-3, W, 6, C.p2, 0.7));
  // Decorative side lines
  UI.result.add(rect(3, H/2, 6, H, C.p1, 0.2));
  UI.result.add(rect(W-3, H/2, 6, H, C.p2, 0.2));

  UI.resultTitle = scene.add.text(W/2, 80, '', {
    fontFamily: 'monospace', fontSize: '16px', color: C.neont, fontStyle: 'bold',
    stroke: '#000000', strokeThickness: 3,
    shadow: { offsetX: 0, offsetY: 0, color: C.neont, blur: 6, fill: true },
  }).setOrigin(0.5); UI.result.add(UI.resultTitle);

  UI.result.add(scene.add.text(W/2, 113, '────────────────────────', {
    fontFamily: 'monospace', fontSize: '14px', color: '#333355',
  }).setOrigin(0.5));

  UI.resultWinner = scene.add.text(W/2, 200, '', {
    fontFamily: 'monospace', fontSize: '42px', color: C.p1t, fontStyle: 'bold',
    align: 'center', stroke: '#000000', strokeThickness: 5,
    shadow: { offsetX: 0, offsetY: 0, color: C.p1t, blur: 12, fill: true },
  }).setOrigin(0.5); UI.result.add(UI.resultWinner);

  UI.result.add(scene.add.text(W/2, 267, '────────────────────────', {
    fontFamily: 'monospace', fontSize: '14px', color: '#333355',
  }).setOrigin(0.5));

  UI.resultPts = scene.add.text(W/2, 310, '', {
    fontFamily: 'monospace', fontSize: '20px', color: '#dddddd',
    align: 'center', stroke: '#000000', strokeThickness: 3,
  }).setOrigin(0.5); UI.result.add(UI.resultPts);

  UI.resultTotal = scene.add.text(W/2, 385, '', {
    fontFamily: 'monospace', fontSize: '15px', color: '#666688',
    align: 'center', stroke: '#000000', strokeThickness: 2,
  }).setOrigin(0.5); UI.result.add(UI.resultTotal);

  UI.resultNext = scene.add.text(W/2, H - 35, '', {
    fontFamily: 'monospace', fontSize: '13px', color: '#444466',
    stroke: '#000000', strokeThickness: 2,
  }).setOrigin(0.5); UI.result.add(UI.resultNext);

  // ── FINAL SCREEN
  UI.final = scene.add.container(0, 0).setDepth(45).setVisible(false);
  UI.final.add(rect(W/2, H/2, W, H, C.bg, 1));
  // Neon frame
  const fg = scene.add.graphics(); fg.setDepth(1);
  fg.lineStyle(3, C.p1, 0.6); fg.strokeRect(8, 8, W-16, H-16);
  fg.lineStyle(1, C.p2, 0.3); fg.strokeRect(14, 14, W-28, H-28);
  // Corner squares
  fg.fillStyle(C.p1, 1);
  [[8,8],[W-12,8],[8,H-12],[W-12,H-12]].forEach(([cx,cy])=>fg.fillRect(cx,cy,4,4));
  UI.final.add(fg);

  UI.final.add(rect(W/2, 50, 700, 2, C.p1, 0.4));

  UI.finalWinner = scene.add.text(W/2, 100, '', {
    fontFamily: 'monospace', fontSize: '38px', color: C.p1t, fontStyle: 'bold',
    align: 'center', stroke: '#000000', strokeThickness: 5,
    shadow: { offsetX: 0, offsetY: 0, color: C.p1t, blur: 16, fill: true },
  }).setOrigin(0.5); UI.final.add(UI.finalWinner);

  UI.finalSub = scene.add.text(W/2, 176, '', {
    fontFamily: 'monospace', fontSize: '16px', color: C.neont,
    align: 'center', stroke: '#000000', strokeThickness: 3,
  }).setOrigin(0.5); UI.final.add(UI.finalSub);

  UI.final.add(rect(W/2, 210, 700, 2, C.div, 0.6));

  UI.finalScores = scene.add.text(W/2, 270, '', {
    fontFamily: 'monospace', fontSize: '40px', fontStyle: 'bold', align: 'center',
    color: '#FFFFFF', stroke: '#000000', strokeThickness: 5,
  }).setOrigin(0.5); UI.final.add(UI.finalScores);

  UI.final.add(rect(W/2, 330, 700, 2, C.div, 0.6));

  UI.final.add(scene.add.text(W/2, 355, '◄  TOP SCORES  ►', {
    fontFamily: 'monospace', fontSize: '12px', color: C.neont,
    stroke: '#000000', strokeThickness: 2,
  }).setOrigin(0.5));

  UI.finalBoard = scene.add.text(W/2, 400, '', {
    fontFamily: 'monospace', fontSize: '15px', color: '#bbbbcc',
    align: 'center', lineSpacing: 6, stroke: '#000000', strokeThickness: 2,
  }).setOrigin(0.5); UI.final.add(UI.finalBoard);

  UI.finalBtn = scene.add.text(W/2, H - 30, '►  PRESIONA START PARA JUGAR DE NUEVO  ◄', {
    fontFamily: 'monospace', fontSize: '12px', color: '#555577',
    stroke: '#000000', strokeThickness: 2,
  }).setOrigin(0.5); UI.final.add(UI.finalBtn);

  // ── NAME ENTRY (letras para highscore)
  UI.name = scene.add.container(0, 0).setDepth(46).setVisible(false);
  UI.name.add(rect(W/2, H/2, W, H, C.bg, 0.98));
  UI.nameTitle = scene.add.text(W/2, 70, '¡INGRESA TUS INICIALES!', {
    fontFamily: 'monospace', fontSize: '20px', color: C.p1t, fontStyle: 'bold',
  }).setOrigin(0.5); UI.name.add(UI.nameTitle);
  UI.nameWho = scene.add.text(W/2, 108, '', {
    fontFamily: 'monospace', fontSize: '14px', color: '#888888',
  }).setOrigin(0.5); UI.name.add(UI.nameWho);
  UI.nameVal = scene.add.text(W/2, 168, '_ _ _', {
    fontFamily: 'monospace', fontSize: '48px', color: '#FFFFFF', fontStyle: 'bold', letterSpacing: 12,
  }).setOrigin(0.5); UI.name.add(UI.nameVal);
  // Letter grid
  const LGRID = [
    ['A','B','C','D','E','F','G'],
    ['H','I','J','K','L','M','N'],
    ['O','P','Q','R','S','T','U'],
    ['V','W','X','Y','Z','.','↵'],
    ['DEL','END'],
  ];
  UI.nameGrid = [];
  for (let row = 0; row < LGRID.length; row++) {
    const cols = LGRID[row];
    const totalW = cols.length * 52;
    for (let col = 0; col < cols.length; col++) {
      const val = cols[col];
      const cx = W/2 - totalW/2 + 26 + col * 52;
      const cy = 260 + row * 36;
      const bg = G.add.rectangle(cx, cy, val.length > 1 ? 58 : 44, 30, C.dark);
      bg.setStrokeStyle(1, C.div, 0.7);
      const lb = G.add.text(cx, cy, val, {
        fontFamily: 'monospace', fontSize: val.length > 1 ? '12px' : '17px',
        color: '#cccccc', fontStyle: 'bold',
      }).setOrigin(0.5);
      UI.name.add(bg); UI.name.add(lb);
      UI.nameGrid.push({ bg, lb, row, col, val, lgrid: LGRID });
    }
  }
  UI.nameHint = scene.add.text(W/2, H - 40, 'MOVER JOYSTICK · BOTÓN 1 PARA CONFIRMAR', {
    fontFamily: 'monospace', fontSize: '11px', color: '#444444',
  }).setOrigin(0.5); UI.name.add(UI.nameHint);
}

function refreshHud() {
  UI.hudP1.setText(String(ST.scores.p1).padStart(6, '0'));
  UI.hudP2.setText(String(ST.scores.p2).padStart(6, '0'));
  UI.hudRound.setText('RONDA ' + ST.round + '/' + ST.totalRounds);
}

// ─── INTRO ─────────────────────────────────────────────────────────────────
let introData = {};

function showIntro() {
  ST.phase = 'intro';
  UI.intro.setVisible(true);
  UI.hud.setVisible(false);
  UI.trans.setVisible(false);
  UI.result.setVisible(false);
  UI.final.setVisible(false);
  UI.name.setVisible(false);

  // show top 3 highscores
  if (ST.highScores.length) {
    const lines = ST.highScores.slice(0, 3).map((e, i) =>
      (i + 1) + '.  ' + (e.name || '???').padEnd(4,' ') + '  ' + String(e.score).padStart(6, '0')
    );
    UI.introScores.setText(lines.join('\n'));
  } else {
    UI.introScores.setText('');
  }

  // pulse the button text
  G.tweens.killTweensOf(UI.introBtn);
  G.tweens.add({ targets: UI.introBtn, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 });

  // pulse title
  G.tweens.killTweensOf(UI.introTitle);
  G.tweens.add({ targets: UI.introTitle, scale: 1.03, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

  introData = { ready: false };
}

function handleIntro(time) {
  if (consume(['START1', 'START2', 'P1_1', 'P2_1'])) {
    G.tweens.killAll();
    playJingle('start');
    startGame();
  }
}

// ─── GAME START ─────────────────────────────────────────────────────────────
function startGame() {
  ST.round = 0;
  ST.scores = { p1: 0, p2: 0 };
  ST.queue = shuffle(MG_POOL.slice());
  nextRound();
}

function nextRound() {
  ST.round++;
  if (ST.round > ST.totalRounds) {
    showFinal();
    return;
  }
  ST.currentMg = ST.queue[ST.round - 1] || MG_POOL[0];
  showTransition(ST.currentMg);
}

// ─── TRANSITION ─────────────────────────────────────────────────────────────
const MG_NAMES = {
  arepa: 'AREPA\nVOLADORA',
  chiva: 'CHIVA\nLOCA',
  tejo:  'TEJO\nTURBO',
  cafe:  'CAFÉ EN\nEQUILIBRIO',
};
const MG_HINTS = {
  arepa: 'Atrapa las arepas doradas ·  ← → · Evita los carbones',
  chiva: 'Esquiva los obstáculos ·  ← → para cambiar carril',
  tejo:  'Apunta con ← → · Mantén botón para cargar · Suelta para lanzar',
  cafe:  'Balancea el pocillo con ← →  · No derrames el café',
};

let transData = {};

function showTransition(mg) {
  ST.phase = 'transition';
  UI.intro.setVisible(false);
  UI.trans.setVisible(true);
  UI.hud.setVisible(false);
  UI.result.setVisible(false);
  UI.final.setVisible(false);
  UI.name.setVisible(false);

  UI.transRound.setText('RONDA ' + ST.round + ' DE ' + ST.totalRounds);
  UI.transName.setText(MG_NAMES[mg] || mg.toUpperCase());
  UI.transHint.setText(MG_HINTS[mg] || '');
  UI.transTimer.setText('¡PREPÁRENSE!');
  UI.transName.setScale(0.5).setAlpha(0);
  G.tweens.add({ targets: UI.transName, scale: 1, alpha: 1, duration: 400, ease: 'Back.Out' });

  playJingle('start');
  transData = { startTime: G.time.now, duration: 2800 };
}

function handleTransition(time) {
  const elapsed = time - transData.startTime;
  const left = Math.ceil((transData.duration - elapsed) / 1000);
  UI.transTimer.setText(left > 0 ? '¡EMPIEZAN EN ' + left + '!' : '¡YA!');
  if (elapsed >= transData.duration) {
    UI.trans.setVisible(false);
    startMinigame(ST.currentMg);
  }
}

// ─── PLAYING ────────────────────────────────────────────────────────────────
let mgData = {}; // minigame-specific data
let mgObjects = []; // phaser objects to destroy after

const MG_DURATION = 10000; // 10 seconds per minigame

function startMinigame(mg) {
  ST.phase = 'playing';
  mgObjects = [];
  UI.hud.setVisible(true);
  UI.hudMgName.setText(MG_NAMES[mg] || '');
  refreshHud();

  mgData = {
    mg: mg,
    startTime: G.time.now,
    duration: MG_DURATION,
    localScores: { p1: 0, p2: 0 },
    done: false,
  };

  if (mg === 'arepa')  initArepa();
  else if (mg === 'chiva') initChiva();
  else if (mg === 'tejo')  initTejo();
  else if (mg === 'cafe')  initCafe();
}

function handlePlaying(time, delta) {
  const elapsed = time - mgData.startTime;
  const remaining = Math.max(0, (mgData.duration - elapsed) / 1000);
  UI.hudTimer.setText(pad2(remaining));

  // tick sound in last 3 seconds
  if (remaining <= 3 && remaining > 0) {
    const prevSec = Math.ceil((mgData.duration - (elapsed - delta)) / 1000);
    if (Math.ceil(remaining) < prevSec) playJingle('tick');
  }

  if (!mgData.done) {
    if (mgData.mg === 'arepa')  tickArepa(time, delta);
    else if (mgData.mg === 'chiva') tickChiva(time, delta);
    else if (mgData.mg === 'tejo')  tickTejo(time, delta);
    else if (mgData.mg === 'cafe')  tickCafe(time, delta);
  }

  if (elapsed >= mgData.duration && !mgData.done) {
    finishMinigame();
  }
}

function finishMinigame() {
  mgData.done = true;
  destroyMgObjects();
  UI.hud.setVisible(false);

  const ls = mgData.localScores;
  const winner = ls.p1 > ls.p2 ? 'p1' : ls.p2 > ls.p1 ? 'p2' : 'draw';
  const bonus = 500;
  let p1bonus = 0, p2bonus = 0;
  if (winner === 'p1') { p1bonus = bonus; shake(10); }
  else if (winner === 'p2') { p2bonus = bonus; shake(10); }
  else { p1bonus = 200; p2bonus = 200; }

  ST.scores.p1 += p1bonus;
  ST.scores.p2 += p2bonus;
  ST.roundResult = { ls, winner, p1bonus, p2bonus };

  showResult();
}

function destroyMgObjects() {
  for (const o of mgObjects) { try { if (o && o.destroy) o.destroy(); } catch (_) {} }
  mgObjects = [];
}

// ─── RESULT ─────────────────────────────────────────────────────────────────
let resultData = {};

function showResult() {
  ST.phase = 'result';
  UI.result.setVisible(true);

  const rr = ST.roundResult;
  const mg = MG_NAMES[mgData.mg] || mgData.mg;
  UI.resultTitle.setText(mg.replace('\n', ' '));

  if (rr.winner === 'p1') {
    UI.resultWinner.setText('¡PLAYER 1 GANA!').setColor(C.p1t);
    playJingle('win');
    spawnConfetti(40);
  } else if (rr.winner === 'p2') {
    UI.resultWinner.setText('¡PLAYER 2 GANA!').setColor(C.p2t);
    playJingle('win');
    spawnConfetti(40);
  } else {
    UI.resultWinner.setText('¡EMPATE!').setColor('#FFFFFF');
    playJingle('fail');
  }

  UI.resultPts.setText(
    'P1  +' + rr.p1bonus + '     P2  +' + rr.p2bonus
  );
  UI.resultTotal.setText(
    'TOTAL →  P1 ' + ST.scores.p1 + '   P2 ' + ST.scores.p2
  );

  const isLast = ST.round >= ST.totalRounds;
  UI.resultNext.setText(isLast ? 'ÚLTIMA RONDA — ¡RESULTADOS FINALES!' : 'SIGUIENTE RONDA...');

  resultData = { startTime: G.time.now, duration: 3200 };
}

function handleResult(time) {
  if (time - resultData.startTime >= resultData.duration) {
    UI.result.setVisible(false);
    nextRound();
  }
}

// ─── FINAL ─────────────────────────────────────────────────────────────────
let finalData = {};

function showFinal() {
  ST.phase = 'final';
  UI.final.setVisible(true);

  const p1 = ST.scores.p1, p2 = ST.scores.p2;
  const isDraw = p1 === p2;
  const winnerKey = p1 > p2 ? 'p1' : p2 > p1 ? 'p2' : 'draw';

  if (winnerKey === 'p1') {
    UI.finalWinner.setText('¡P1 ES EL\nREY DEL PARCHE!').setColor(C.p1t);
  } else if (winnerKey === 'p2') {
    UI.finalWinner.setText('¡P2 ES EL\nREY DEL PARCHE!').setColor(C.p2t);
  } else {
    UI.finalWinner.setText('¡EMPATE\nEPICO!').setColor('#FFFFFF');
  }

  UI.finalSub.setText('PUNTAJE FINAL');
  UI.finalScores.setText(
    'P1  ' + String(p1).padStart(4, ' ') +
    '   vs   ' +
    String(p2).padStart(4, ' ') + '  P2'
  );

  // show highscores
  const lines = ST.highScores.length
    ? ST.highScores.slice(0, 5).map((e, i) =>
        (i+1) + '. ' + e.name.padEnd(3,' ') + '  ' + String(e.score).padStart(4,' ')
      )
    : ['SIN RÉCORDS TODAVÍA'];
  UI.finalBoard.setText('TOP SCORES\n' + lines.join('\n'));

  playJingle('win');
  spawnConfetti(80);
  shake(15);

  // Save score for winner
  const winScore = Math.max(p1, p2);
  const winName = winnerKey === 'p1' ? 'P1' : winnerKey === 'p2' ? 'P2' : 'EMP';
  const entry = { name: winName, score: winScore, date: new Date().toISOString().slice(0,10) };
  saveScore(entry).then(s => {
    ST.highScores = s;
    const lines2 = ST.highScores.slice(0, 5).map((e, i) =>
      (i+1) + '. ' + e.name.padEnd(3,' ') + '  ' + String(e.score).padStart(4,' ')
    );
    UI.finalBoard.setText('TOP SCORES\n' + lines2.join('\n'));
  }).catch(() => {});

  G.tweens.killTweensOf(UI.finalBtn);
  G.tweens.add({ targets: UI.finalBtn, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 });

  finalData = { startTime: G.time.now };
}

function handleFinal(time) {
  // extra confetti bursts
  if ((time - finalData.startTime) % 2000 < 50) {
    spawnConfetti(20);
  }
  if (consume(['START1', 'START2', 'P1_1', 'P2_1'])) {
    G.tweens.killAll();
    UI.final.setVisible(false);
    ST = mkState();
    loadScores().then(s => { ST.highScores = s; showIntro(); }).catch(() => showIntro());
  }
}

// ─── NAME ENTRY (not needed for auto-save, but keeping minimal) ─────────────
function handleName(time) {
  // simplified — just show final
  showFinal();
}

// ─── STORAGE ───────────────────────────────────────────────────────────────
function getStorage() {
  if (window.platanusArcadeStorage) return window.platanusArcadeStorage;
  return {
    async get(k) {
      try {
        const r = localStorage.getItem(k);
        return r === null ? { found: false, value: null } : { found: true, value: JSON.parse(r) };
      } catch { return { found: false, value: null }; }
    },
    async set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
  };
}

async function loadScores() {
  const r = await getStorage().get(STORAGE_KEY);
  if (!r.found || !Array.isArray(r.value)) return [];
  return r.value.slice(0, 10);
}

async function saveScore(entry) {
  const existing = await loadScores();
  const next = existing.concat(entry)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  await getStorage().set(STORAGE_KEY, next);
  return next;
}

// ═══════════════════════════════════════════════════════════════════════════
// MICROJUEGO 1: AREPA VOLADORA
// ═══════════════════════════════════════════════════════════════════════════
const ARP = {
  BASKET_Y: H - 90, BASKET_W: 70, BASKET_H: 14,
  ITEM_R: 12, CATCH_DIST: 34,
  SPAWN_INTERVAL: 900,
  BASE_SPEED: 160,
};

function initArepa() {
  const d = mgData;
  d.baskets = [
    { x: HALF / 2, col: C.p1, player: 'p1' },
    { x: HALF + HALF / 2, col: C.p2, player: 'p2' },
  ];
  d.items = [];
  d.nextSpawn = G.time.now + 400;
  d.speed = ARP.BASE_SPEED;

  // Arena backgrounds
  const left = G.add.rectangle(HALF / 2, H / 2, HALF - 4, H, C.panel, 0.5);
  const right = G.add.rectangle(HALF + HALF / 2, H / 2, HALF - 4, H, C.panel, 0.5);
  mgObjects.push(left, right);

  // Neon arena frames
  drawArenaFrame(0);
  drawArenaFrame(1);

  // Player labels retro style
  const lbl1 = retT(HALF / 2, 76, '◄ PLAYER 1 ►', 12, C.p1t, 0.5);
  const lbl2 = retT(HALF + HALF / 2, 76, '◄ PLAYER 2 ►', 12, C.p2t, 0.5);
  lbl1.setDepth(7); lbl2.setDepth(7);
  mgObjects.push(lbl1, lbl2);

  // Draw baskets
  for (const b of d.baskets) {
    b.gfx = G.add.rectangle(b.x, ARP.BASKET_Y, ARP.BASKET_W, ARP.BASKET_H, b.col);
    b.gfx.setDepth(5);
    // Score panel retro
    const isP1 = b.col === C.p1;
    const sx = isP1 ? HALF / 2 : HALF + HALF / 2;
    const sp = scorePanel(sx, ARP.BASKET_Y - 32, 72, 22, isP1 ? C.p1t : C.p2t);
    b.scoreTxt = retT(sx, ARP.BASKET_Y - 32, '0', 16, isP1 ? C.p1t : C.p2t, 0.5);
    b.scoreTxt.setDepth(5);
    mgObjects.push(b.gfx, sp, b.scoreTxt);
  }
}

function tickArepa(time, delta) {
  const d = mgData;
  const dt = delta / 1000;
  const elapsed = time - d.startTime;
  d.speed = ARP.BASE_SPEED + elapsed * 0.04;

  // Move baskets
  const SPEED = 340;
  const [b1, b2] = d.baskets;
  const xMin1 = 20, xMax1 = HALF - 20;
  const xMin2 = HALF + 20, xMax2 = W - 20;

  if (held('P1_L')) b1.x = Math.max(xMin1, b1.x - SPEED * dt);
  if (held('P1_R')) b1.x = Math.min(xMax1, b1.x + SPEED * dt);
  if (held('P2_L')) b2.x = Math.max(xMin2, b2.x - SPEED * dt);
  if (held('P2_R')) b2.x = Math.min(xMax2, b2.x + SPEED * dt);

  b1.gfx.setX(b1.x);
  b2.gfx.setX(b2.x);

  // Spawn items
  if (time >= d.nextSpawn) {
    spawnArepaItem(time);
    const interval = Math.max(400, ARP.SPAWN_INTERVAL - elapsed * 0.03);
    d.nextSpawn = time + interval;
  }

  // Move and check items
  for (let i = d.items.length - 1; i >= 0; i--) {
    const item = d.items[i];
    item.y += d.speed * dt;
    item.gfx.setY(item.y);

    let hit = false;
    for (const basket of d.baskets) {
      const arena = basket.player === 'p1' ? 0 : 1;
      if (item.arena !== arena) continue; // each item belongs to one side
      const dx = Math.abs(item.x - basket.x);
      const dy = Math.abs(item.y - ARP.BASKET_Y);
      if (dx < ARP.CATCH_DIST && dy < 30) {
        hit = true;
        if (item.type === 'arepa') {
          d.localScores[basket.player] += 10;
          basket.scoreTxt.setText(d.localScores[basket.player]);
          playJingle('catch');
          // flash green
          G.tweens.add({ targets: basket.gfx, fillColor: C.green, duration: 80, yoyo: true });
        } else {
          d.localScores[basket.player] = Math.max(0, d.localScores[basket.player] - 5);
          basket.scoreTxt.setText(d.localScores[basket.player]);
          playJingle('burn');
          shake(5);
          G.tweens.add({ targets: basket.gfx, fillColor: C.red, duration: 80, yoyo: true });
        }
        break;
      }
    }

    if (hit || item.y > H + 20) {
      item.gfx.destroy();
      d.items.splice(i, 1);
    }
  }
}

function spawnArepaItem(time) {
  const d = mgData;
  // Each item spawns in one of the two arenas
  const arena = Math.random() < 0.5 ? 0 : 1;
  const xMin = arena === 0 ? 20 : HALF + 20;
  const xMax = arena === 0 ? HALF - 20 : W - 20;
  const x = xMin + Math.random() * (xMax - xMin);
  const isArepa = Math.random() < 0.68;

  const gfx = isArepa ? createPixelArepa(x, 55) : createPixelCarbon(x, 55);

  mgObjects.push(gfx);
  d.items.push({ x, y: 55, gfx, type: isArepa ? 'arepa' : 'carbon', arena });
}

// ═══════════════════════════════════════════════════════════════════════════
// MICROJUEGO 2: CHIVA LOCA
// ═══════════════════════════════════════════════════════════════════════════
const CH = {
  LANES: 3,
  LANE_W: 72,
  CHIVA_W: 52, CHIVA_H: 36,
  OBS_W: 52, OBS_H: 18,
  MAX_LIVES: 3,
  BASE_SPEED: 200,
};

function laneX(arena, lane) {
  // arena: 0=left(P1), 1=right(P2)
  const areaW = HALF - 8;
  const areaX = arena === 0 ? 4 : HALF + 4;
  const totalLanesW = CH.LANES * CH.LANE_W;
  const offsetX = (areaW - totalLanesW) / 2;
  return areaX + offsetX + lane * CH.LANE_W + CH.LANE_W / 2;
}

function initChiva() {
  const d = mgData;
  d.players = [
    { lane: 1, lives: CH.MAX_LIVES, arena: 0, player: 'p1', col: C.p1, alive: true, laneCD: 0 },
    { lane: 1, lives: CH.MAX_LIVES, arena: 1, player: 'p2', col: C.p2, alive: true, laneCD: 0 },
  ];
  d.obstacles = [];
  d.nextSpawn = G.time.now + 600;
  d.speed = CH.BASE_SPEED;
  d.chivas = [];
  d.livesGfx = [];
  d.laneLines = [];

  // Arena backgrounds
  const bg1 = G.add.rectangle(HALF / 2, H / 2, HALF - 4, H, C.panel, 0.5);
  const bg2 = G.add.rectangle(HALF + HALF / 2, H / 2, HALF - 4, H, C.panel, 0.5);
  mgObjects.push(bg1, bg2);

  // Neon arena frames
  drawArenaFrame(0);
  drawArenaFrame(1);

  // Lane lines (retro dashed feel)
  for (let ar = 0; ar < 2; ar++) {
    for (let ln = 1; ln < CH.LANES; ln++) {
      const x = laneX(ar, ln) - CH.LANE_W / 2;
      const line = G.add.rectangle(x, H / 2, 2, H, C.div, 0.5);
      mgObjects.push(line);
    }
  }

  // Retro Player labels
  const l1 = retT(HALF / 2, 76, '◄ PLAYER 1 ►', 12, C.p1t, 0.5);
  const l2 = retT(HALF + HALF / 2, 76, '◄ PLAYER 2 ►', 12, C.p2t, 0.5);
  l1.setDepth(7); l2.setDepth(7);
  mgObjects.push(l1, l2);

  // Draw pixel-art chivas and life indicators
  for (const p of d.players) {
    const cx = laneX(p.arena, p.lane);
    const cy = H - 100;
    // Pixel art chiva
    p.gfx = createPixelChiva(cx, cy, p.player === 'p1');
    p.targetX = cx;
    p.currentX = cx;
    mgObjects.push(p.gfx);

    // Lives in pixel hearts
    const livesArr = [];
    for (let i = 0; i < CH.MAX_LIVES; i++) {
      const hx = (p.arena === 0 ? 20 : HALF + 20) + i * 24;
      const h = retT(hx, H - 24, '♥', 18, '#FF2222', 0);
      livesArr.push(h);
      mgObjects.push(h);
    }
    p.livesGfx = livesArr;
  }
}

function tickChiva(time, delta) {
  const d = mgData;
  const dt = delta / 1000;
  const elapsed = time - d.startTime;
  d.speed = CH.BASE_SPEED + elapsed * 0.05;

  // Player input
  for (const p of d.players) {
    if (!p.alive) continue;
    const isP1 = p.player === 'p1';
    const lBtn = isP1 ? 'P1_L' : 'P2_L';
    const rBtn = isP1 ? 'P1_R' : 'P2_R';

    if (time > p.laneCD) {
      if (held(lBtn) && p.lane > 0) {
        p.lane--;
        p.laneCD = time + 220;
        playJingle('horn');
      } else if (held(rBtn) && p.lane < CH.LANES - 1) {
        p.lane++;
        p.laneCD = time + 220;
        playJingle('horn');
      }
    }
    p.targetX = laneX(p.arena, p.lane);
    p.currentX += (p.targetX - p.currentX) * Math.min(1, dt * 12);

    // Move gfx
    if (p.gfx) {
      p.gfx.setX(p.currentX);
    }
  }

  // Spawn obstacles
  if (time >= d.nextSpawn) {
    spawnChivaObs(time);
    const interval = Math.max(350, 700 - elapsed * 0.025);
    d.nextSpawn = time + interval;
  }

  // Move obstacles + collision
  for (let i = d.obstacles.length - 1; i >= 0; i--) {
    const obs = d.obstacles[i];
    obs.y += d.speed * dt;
    obs.gfx.setY(obs.y);

    for (const p of d.players) {
      if (!p.alive || obs.hit) continue;
      if (obs.arena !== p.arena) continue;
      const obsLaneX = laneX(p.arena, obs.lane);
      const dx = Math.abs(p.currentX - obsLaneX);
      const dy = Math.abs(obs.y - (H - 100));
      if (dx < CH.CHIVA_W * 0.55 && dy < 36) {
        obs.hit = true;
        p.lives--;
        updateChivaLives(p);
        playJingle('crash');
        shake(6);
        // flash the chiva
        if (p.gfx) {
          G.tweens.add({ targets: p.gfx, alpha: 0.2, duration: 80, yoyo: true, repeat: 2,
            onComplete: () => p.gfx.setAlpha(1) });
        }
        if (p.lives <= 0) {
          p.alive = false;
          if (p.gfx) p.gfx.setAlpha(0.2);
          d.localScores[p.player] = 0; // penalty for dying
        } else {
          d.localScores[p.player] += 5; // survive points
        }
        break;
      }
    }

    // survival score
    if (!obs.hit && obs.y > H - 110 && !obs.scored) {
      obs.scored = true;
      // players who survived this obstacle get points
      for (const p of d.players) {
        if (p.alive && obs.arena === p.arena) {
          const obsLX = laneX(p.arena, obs.lane);
          if (Math.abs(p.currentX - obsLX) > CH.LANE_W * 0.4) {
            d.localScores[p.player] += 8;
          }
        }
      }
    }

    if (obs.y > H + 30) {
      obs.gfx.destroy();
      d.obstacles.splice(i, 1);
    }
  }

  // alive score every frame
  for (const p of d.players) {
    if (p.alive) d.localScores[p.player] += dt * 2;
  }
}

function spawnChivaObs(time) {
  const d = mgData;
  for (let arena = 0; arena < 2; arena++) {
    const lane = Math.floor(Math.random() * CH.LANES);
    const x = laneX(arena, lane);
    const gfx = createPixelObstacle(x, 70);
    mgObjects.push(gfx);
    d.obstacles.push({ arena, lane, x, y: 70, gfx, hit: false, scored: false });
  }
}

function updateChivaLives(p) {
  for (let i = 0; i < CH.MAX_LIVES; i++) {
    if (p.livesGfx[i]) {
      p.livesGfx[i].setColor(i < p.lives ? '#FF4444' : '#333333');
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MICROJUEGO 3: TEJO TURBO
// ═══════════════════════════════════════════════════════════════════════════
const TJ = {
  MECHA_R: 14, TEJO_R: 9,
  MAX_THROWS: 3,
  CHARGE_TIME: 1800,
  MIN_SPEED: 280, MAX_SPEED: 700,
  ARENA_H: H - 100,
};

function initTejo() {
  const d = mgData;
  d.players = [
    {
      arena: 0, player: 'p1', col: C.p1,
      angle: -90, charge: 0, charging: false,
      tejos: TJ.MAX_THROWS, score: 0,
      tejo: null, flying: false, tx: 0, ty: 0, vx: 0, vy: 0,
      throwCD: 0,
    },
    {
      arena: 1, player: 'p2', col: C.p2,
      angle: -90, charge: 0, charging: false,
      tejos: TJ.MAX_THROWS, score: 0,
      tejo: null, flying: false, tx: 0, ty: 0, vx: 0, vy: 0,
      throwCD: 0,
    },
  ];
  d.mechas = [];
  d.particles = [];
  d.aimLines = [];

  const MECHAS_PER_ARENA = 3;
  // Arena backgrounds
  const bg1 = G.add.rectangle(HALF / 2, H / 2, HALF - 4, H, C.panel, 0.5);
  const bg2 = G.add.rectangle(HALF + HALF / 2, H / 2, HALF - 4, H, C.panel, 0.5);
  mgObjects.push(bg1, bg2);

  // Neon arena frames
  drawArenaFrame(0);
  drawArenaFrame(1);

  // Retro Player labels
  const l1 = retT(HALF / 2, 76, '◄ PLAYER 1 ►', 12, C.p1t, 0.5);
  const l2 = retT(HALF + HALF / 2, 76, '◄ PLAYER 2 ►', 12, C.p2t, 0.5);
  l1.setDepth(7); l2.setDepth(7);
  mgObjects.push(l1, l2);

  // Spawn pixel-art clay court & mechas in each arena
  for (let ar = 0; ar < 2; ar++) {
    const aX = ar === 0 ? 20 : HALF + 20;
    const aW = HALF - 40;
    for (let i = 0; i < MECHAS_PER_ARENA; i++) {
      const mx = aX + 40 + Math.random() * (aW - 80);
      const my = 120 + Math.random() * 200;
      // Clay box (caja de greda)
      const clayBox = G.add.rectangle(mx, my, TJ.MECHA_R * 2 + 10, TJ.MECHA_R * 2 + 10, 0x5C2E0A);
      clayBox.setStrokeStyle(2, 0x3D1E07);
      // Pixel mecha
      const mechaGfx = createPixelMecha(mx, my);
      // Pulse animation
      G.tweens.add({ targets: mechaGfx, scale: 1.25, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      mgObjects.push(clayBox, mechaGfx);
      d.mechas.push({ x: mx, y: my, arena: ar, active: true, gfx: mechaGfx, box: clayBox });
    }
  }

  // Launch pads (visual)
  for (let ar = 0; ar < 2; ar++) {
    const px = ar === 0 ? HALF / 2 : HALF + HALF / 2;
    const py = H - 80;
    const pad = G.add.rectangle(px, py, 60, 10, ar === 0 ? C.p1 : C.p2);
    mgObjects.push(pad);
    d.players[ar].launchX = px;
    d.players[ar].launchY = py;

    // Throw counter
    const cntTxt = retT(px, py + 26, 'TIROS: ' + TJ.MAX_THROWS, 12, ar === 0 ? C.p1t : C.p2t, 0.5);
    mgObjects.push(cntTxt);
    d.players[ar].throwTxt = cntTxt;

    // Score text
    const sTxt = retT(px, py + 44, '0 pts', 15, ar === 0 ? C.p1t : C.p2t, 0.5);
    mgObjects.push(sTxt);
    d.players[ar].scoreTxt = sTxt;

    // Charge bar bg
    const barBg = G.add.rectangle(px, py - 22, 80, 8, 0x111122);
    barBg.setStrokeStyle(1, C.div, 0.8);
    const barFg = G.add.rectangle(px - 40, py - 22, 0, 8, ar === 0 ? C.p1 : C.p2);
    barFg.setOrigin(0, 0.5);
    mgObjects.push(barBg, barFg);
    d.players[ar].barFg = barFg;

    // Aim line (graphics)
    const aimGfx = G.add.graphics();
    mgObjects.push(aimGfx);
    d.players[ar].aimGfx = aimGfx;
  }
}

function tickTejo(time, delta) {
  const d = mgData;
  const dt = delta / 1000;

  for (const p of d.players) {
    const isP1 = p.player === 'p1';
    const lBtn = isP1 ? 'P1_L' : 'P2_L';
    const rBtn = isP1 ? 'P1_R' : 'P2_R';
    const btn1 = isP1 ? 'P1_1' : 'P2_1';

    if (!p.flying && p.tejos > 0 && time > p.throwCD) {
      // Aim
      if (held(lBtn)) p.angle = Math.max(-160, p.angle - 120 * dt);
      if (held(rBtn)) p.angle = Math.min(-20, p.angle + 120 * dt);

      // Charge
      if (held(btn1)) {
        p.charging = true;
        p.charge = Math.min(1, p.charge + dt * (1000 / TJ.CHARGE_TIME));
        p.barFg.setSize(p.charge * 80, 8);
      } else if (p.charging) {
        // Release → launch
        p.charging = false;
        const speed = TJ.MIN_SPEED + p.charge * (TJ.MAX_SPEED - TJ.MIN_SPEED);
        const rad = (p.angle * Math.PI) / 180;
        p.vx = Math.cos(rad) * speed;
        p.vy = Math.sin(rad) * speed;
        p.tx = p.launchX;
        p.ty = p.launchY;
        p.flying = true;
        p.tejos--;
        p.throwTxt.setText('TIROS: ' + p.tejos);
        p.charge = 0;
        p.barFg.setSize(0, 8);
        if (!p.tejo) {
          p.tejo = createPixelTejo(p.tx, p.ty);
          mgObjects.push(p.tejo);
        } else {
          p.tejo.setPosition(p.tx, p.ty).setAlpha(1);
        }
        playJingle('launch');
      }

      // Draw aim line (retro pixel dots)
      if (p.aimGfx) {
        p.aimGfx.clear();
        if (!p.charging && p.tejos > 0) {
          const rad = (p.angle * Math.PI) / 180;
          p.aimGfx.fillStyle(p.arena === 0 ? C.p1 : C.p2, 0.7);
          for (let seg = 1; seg <= 7; seg++) {
            const sx = p.launchX + Math.cos(rad) * seg * 22;
            const sy = p.launchY + Math.sin(rad) * seg * 22;
            p.aimGfx.fillRect(sx - 2, sy - 2, 4, 4); // Square pixel dots
          }
        } else if (p.charging) {
          // Show charge box in chunky pixels
          p.aimGfx.lineStyle(2, p.arena === 0 ? C.p1 : C.p2, p.charge);
          const sz = 16 + p.charge * 24;
          p.aimGfx.strokeRect(p.launchX - sz/2, p.launchY - sz/2, sz, sz);
        }
      }
    } else if (p.flying && p.tejo) {
      // Gravity
      p.vy += 350 * dt;
      p.tx += p.vx * dt;
      p.ty += p.vy * dt;
      p.tejo.setPosition(p.tx, p.ty);

      // Check mecha hits
      for (const m of d.mechas) {
        if (!m.active || m.arena !== p.arena) continue;
        const dx = p.tx - m.x, dy = p.ty - m.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < TJ.MECHA_R + TJ.TEJO_R + 6) {
          // HIT!
          m.active = false;
          m.gfx.setAlpha(0.2);
          G.tweens.killTweensOf(m.gfx);
          const pts = Math.round(100 + (1 - dist / (TJ.MECHA_R * 3)) * 300);
          p.score += pts;
          d.localScores[p.player] = p.score;
          p.scoreTxt.setText(p.score + ' pts');
          playJingle('explode');
          shake(8);
          spawnTejoParticles(m.x, m.y);
          p.flying = false;
          p.tejo.setAlpha(0);
          p.aimGfx.clear();
          p.throwCD = time + 400;
          break;
        }
      }

      // Out of arena
      const areaXMin = p.arena === 0 ? 0 : HALF;
      const areaXMax = p.arena === 0 ? HALF : W;
      if (p.tx < areaXMin || p.tx > areaXMax || p.ty > H - 60 || p.ty < 55) {
        p.flying = false;
        if (p.tejo) p.tejo.setAlpha(0);
        if (p.aimGfx) p.aimGfx.clear();
        p.throwCD = time + 300;
      }
    }

    // No more throws: clear aim
    if (p.tejos <= 0 && !p.flying && p.aimGfx) p.aimGfx.clear();
  }
}

function spawnTejoParticles(x, y) {
  const colors = [C.mecha, C.mechaG, C.col1, C.white];
  for (let i = 0; i < 14; i++) {
    const col = colors[Math.floor(Math.random() * colors.length)];
    // Square pixel sparks
    const p = G.add.rectangle(x, y, 4, 4, col);
    p.setDepth(20);
    const angle = Math.random() * Math.PI * 2;
    const dist = 20 + Math.random() * 55;
    G.tweens.add({
      targets: p, x: x + Math.cos(angle) * dist, y: y + Math.sin(angle) * dist,
      alpha: 0, scale: 0.2, duration: 350 + Math.random() * 200,
      onComplete: () => p.destroy(),
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MICROJUEGO 4: CAFÉ EN EQUILIBRIO
// ═══════════════════════════════════════════════════════════════════════════
const CF = {
  TRAY_W: 110, TRAY_H: 8,
  CUP_W: 30, CUP_H: 36,
  MAX_ANGLE: 32, // degrees
  SPILL_ANGLE: 26,
  TRAY_Y: H - 130,
};

function initCafe() {
  const d = mgData;
  d.players = [
    { arena: 0, player: 'p1', col: C.p1, angle: 0, angVel: 0, coffee: 1.0, trayX: HALF / 2 },
    { arena: 1, player: 'p2', col: C.p2, angle: 0, angVel: 0, coffee: 1.0, trayX: HALF + HALF / 2 },
  ];
  d.oscillators = [
    { phase: 0, freq: 0.9, amp: 0.45 },
    { phase: Math.PI * 0.7, freq: 1.1, amp: 0.45 },
  ];
  d.gfxParts = [[], []];

  // Arena backgrounds
  const bg1 = G.add.rectangle(HALF / 2, H / 2, HALF - 4, H, C.panel, 0.5);
  const bg2 = G.add.rectangle(HALF + HALF / 2, H / 2, HALF - 4, H, C.panel, 0.5);
  mgObjects.push(bg1, bg2);

  // Neon arena frames
  drawArenaFrame(0);
  drawArenaFrame(1);

  // Retro Player labels
  const l1 = retT(HALF / 2, 76, '◄ PLAYER 1 ►', 12, C.p1t, 0.5);
  const l2 = retT(HALF + HALF / 2, 76, '◄ PLAYER 2 ►', 12, C.p2t, 0.5);
  l1.setDepth(7); l2.setDepth(7);
  mgObjects.push(l1, l2);

  // Per-player graphics
  for (let i = 0; i < 2; i++) {
    const p = d.players[i];
    // Tray (wood grain bar)
    p.trayGfx = G.add.rectangle(p.trayX, CF.TRAY_Y, CF.TRAY_W, CF.TRAY_H, 0x8B4513);
    p.trayGfx.setStrokeStyle(2, 0x5C2E0A);
    p.trayGfx.setDepth(8);

    // Pixel Mug (pocillo de peltre)
    p.cupGfx = G.add.graphics();
    p.cupGfx.setDepth(10);
    createPixelPocillo(p.cupGfx, p.trayX, CF.TRAY_Y - 24, p.angle);

    // Coffee % text
    p.pctTxt = retT(p.trayX, CF.TRAY_Y + 30, 'CAFÉ: 100%', 15, i === 0 ? C.p1t : C.p2t, 0.5);
    // Score text
    p.scoreTxt = retT(p.trayX, CF.TRAY_Y + 52, '0 pts', 14, i === 0 ? C.p1t : C.p2t, 0.5);
    // "EQUILIBRIO" hint
    const hint = retT(p.trayX, H - 26, '◄ JOYSTICK: EQUILIBRA ►', 11, '#666688', 0.5);

    mgObjects.push(p.trayGfx, p.cupGfx, p.pctTxt, p.scoreTxt, hint);
  }
}

function tickCafe(time, delta) {
  const d = mgData;
  const dt = delta / 1000;
  const elapsed = (time - d.startTime) / 1000;

  for (let i = 0; i < 2; i++) {
    const p = d.players[i];
    const osc = d.oscillators[i];

    // Oscillator drives the tray
    osc.phase += osc.freq * dt * (1 + elapsed * 0.07);
    const externalForce = Math.sin(osc.phase) * osc.amp * (1 + elapsed * 0.05);

    // Player counter-force via joystick
    const isP1 = p.player === 'p1';
    const lBtn = isP1 ? 'P1_L' : 'P2_L';
    const rBtn = isP1 ? 'P1_R' : 'P2_R';
    let playerForce = 0;
    if (held(lBtn)) playerForce -= 1.4;
    if (held(rBtn)) playerForce += 1.4;

    // Angular physics
    const totalForce = externalForce + playerForce;
    p.angVel += totalForce * 100 * dt;
    p.angVel *= 0.88; // damping
    p.angle += p.angVel * dt;
    p.angle = Math.max(-CF.MAX_ANGLE, Math.min(CF.MAX_ANGLE, p.angle));

    // Spill
    if (Math.abs(p.angle) > CF.SPILL_ANGLE && p.coffee > 0) {
      const spillRate = (Math.abs(p.angle) - CF.SPILL_ANGLE) / (CF.MAX_ANGLE - CF.SPILL_ANGLE);
      p.coffee = Math.max(0, p.coffee - spillRate * 0.025);
      if (Math.random() < 0.16) {
        // Square pixel splash drop
        const side = p.angle > 0 ? 1 : -1;
        const px2 = p.trayX + side * 48;
        const sp = G.add.rectangle(px2, CF.TRAY_Y - 5, 4, 4, 0x3B1A06);
        sp.setDepth(15);
        G.tweens.add({
          targets: sp, x: px2 + side * 20, y: CF.TRAY_Y + 24, alpha: 0, duration: 300,
          onComplete: () => sp.destroy(),
        });
        playJingle('fail');
      }
    }

    // Score: points per frame for keeping coffee
    d.localScores[p.player] += p.coffee * dt * 40;

    // Update graphics
    const rad = (p.angle * Math.PI) / 180;
    p.trayGfx.setRotation(rad);

    // Redraw pixel pocillo with updated angle
    createPixelPocillo(p.cupGfx, p.trayX, CF.TRAY_Y - 24, p.angle);

    // Text update with retro gauge
    const pct = Math.round(p.coffee * 100);
    const bars = Math.round(p.coffee * 8);
    const barStr = '■'.repeat(bars) + '░'.repeat(8 - bars);
    p.pctTxt.setText('CAFÉ [' + barStr + '] ' + pct + '%');
    p.pctTxt.setColor(pct > 60 ? (i === 0 ? C.p1t : C.p2t) : pct > 30 ? '#FFAA00' : C.rt);
    p.scoreTxt.setText(Math.floor(d.localScores[p.player]) + ' pts');
  }
}
