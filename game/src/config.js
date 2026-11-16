// Every tuning number and colour in one place. The playfield is a fixed 1280x720 logical
// area; the renderer scales it to the window, so no rule below depends on the screen size.
// Lumenkeeper: a lantern keeper gathers embers, lights five lanterns and survives the
// shadow tide. Lighting the fifth lantern wins the game; losing all health ends it.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Embers needed to light one lantern, and how many lanterns win the game. */
export const LANTERNS_TO_WIN = 5;
export const EMBERS_PER_LANTERN = 10;

/** The last numbered wave; after it the tide keeps coming until the lanterns are lit. */
export const FINAL_WAVE = 8;

export const PLAYER = {
  radius: 16,
  speed: 300,
  maxHp: 5,
  boltSpeed: 660,
  boltDamage: 1,
  fireInterval: 0.24,
  projectiles: 1,
  dashSpeed: 920,
  dashTime: 0.16,
  dashCooldown: 2.2,
  invulnerable: 1.25,
  magnet: 90,
  emberValue: 1,
};

export const ENEMY = {
  wisp: { hp: 2, speed: 118, radius: 15, score: 25, emberChance: 0.5, touch: 1 },
  spitter: { hp: 3, speed: 72, radius: 17, score: 40, emberChance: 0.65, touch: 1, shotInterval: 2.4, gloomSpeed: 210 },
  brute: { hp: 11, speed: 52, radius: 26, score: 90, emberChance: 1.0, touch: 2 },
};

/** Wave n (1-based) spawns this many shadows, mixed by wave. */
export function waveSize(wave) {
  return 5 + wave * 2;
}

export function waveMix(wave) {
  const brutes = wave >= 4 ? Math.min(3, wave - 3) : 0;
  const spitters = wave >= 2 ? Math.min(6, 1 + Math.floor(wave / 2)) : 0;
  return { brutes, spitters };
}

export const SCORE = {
  killWisp: 25,
  killSpitter: 40,
  killBrute: 90,
  ember: 15,
  lantern: 250,
  waveClear: 100,
};

export const POOLS = { enemy: 48, bolt: 64, gloom: 48, ember: 64, particle: 220, float: 24 };

/** The five lantern posts around the arena, lit one by one as embers are gathered. */
export const LANTERN_SPOTS = [
  { x: 150, y: 130 },
  { x: 1130, y: 130 },
  { x: 640, y: 110 },
  { x: 220, y: 600 },
  { x: 1060, y: 600 },
];

export const PALETTE = {
  backdrop: '#070a18',
  skyTop: '#0d1230',
  skyBottom: '#1a1440',
  ground: '#12172e',
  star: '#cdd7ff',
  lanternUnlit: '#3a3f5e',
  lanternLit: '#ffc95e',
  ember: '#ffb347',
  emberCore: '#fff3c4',
  player: '#ffe9a8',
  playerCloak: '#4f7cff',
  bolt: '#ffe9a8',
  wisp: '#232946',
  wispEye: '#ff5d73',
  spitter: '#2e1a4d',
  spitterEye: '#c77dff',
  brute: '#1c2438',
  bruteEye: '#ff8a3d',
  gloom: '#b388ff',
  heart: '#ff5d73',
  panel: '#141a33',
  panelEdge: '#3d4a7a',
  text: '#f2f4ff',
  muted: '#9aa3c7',
  gold: '#ffc95e',
  danger: '#ff5d73',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'lumenkeeper.best';

/** Geometry of the three upgrade cards, shared by the renderer and the click handling. */
export const UPGRADE_CARDS = { width: 300, height: 210, y: 250, gap: 36 };
