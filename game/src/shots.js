// The screenshot scenes behind ?shot=title|play|win|over. Each one plays the real rules
// forward from a fresh world for a fixed number of steps, steered by a simple autopilot
// (chase the nearest ember, otherwise close on the nearest shadow and fire at it, dash
// when one gets too close), so the frame is what a short game really looks like and the
// same seed always gives the same frame.
import { EMBERS_PER_LANTERN, FIELD, STEP } from './config.js';
import { EVENT_OVER, EVENT_WIN } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 24;
const LIMIT_SECONDS = 300;
const DASH_RANGE = 90;

/** Steer the keeper: nearest ember first, else the nearest shadow, firing all the while. */
function autopilot(state) {
  const player = state.player;
  let target = null;
  let best = Infinity;
  for (const ember of state.embers) {
    if (!ember.active) continue;
    const d = Math.hypot(ember.x - player.x, ember.y - player.y);
    if (d < best) { best = d; target = ember; }
  }
  let foe = null;
  let foeDist = Infinity;
  for (const enemy of state.enemies) {
    if (!enemy.active) continue;
    const d = Math.hypot(enemy.x - player.x, enemy.y - player.y);
    if (d < foeDist) { foeDist = d; foe = enemy; }
  }
  const goal = target || foe || { x: FIELD.width / 2, y: FIELD.height / 2 };
  const dx = goal.x - player.x;
  const dy = goal.y - player.y;
  const dist = Math.hypot(dx, dy) || 1;
  // Keep a little range from the foe instead of walking into it.
  const want = foe && !target && foeDist < 150 ? -1 : 1;
  const aim = foe || goal;
  return {
    mx: want * dx / dist,
    my: want * dy / dist,
    aimX: aim.x,
    aimY: aim.y,
    firing: foe !== null,
    dash: foe !== null && foeDist < DASH_RANGE && player.dashCd <= 0,
  };
}

function runFor(world, seconds, steer) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    // Between waves the autopilot takes the first boon and the tide rolls on.
    if (world.state.waveState === 'between') world.applyUpgrade(0);
    const events = world.step(STEP, steer(world.state), false);
    if (events & (EVENT_OVER | EVENT_WIN)) return events;
  }
  return 0;
}

/**
 * Set `world` to the named scene (title, play, win or over; any other name is title) and
 * return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'win' && name !== 'over') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) world.step(STEP, { mx: 0, my: 0, aimX: 640, aimY: 300, firing: false, dash: false }, true);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'over') {
    // A keeper who never moves and never fires is caught by the tide.
    const events = runFor(world, LIMIT_SECONDS, () => ({ mx: 0, my: 0, aimX: 640, aimY: 300, firing: false, dash: false }));
    const over = (events & EVENT_OVER) !== 0 || world.state.over;
    return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'win') {
    // Four lanterns already burn; the keeper gathers the last embers under a strong light.
    const state = world.state;
    state.player.hp = 99;
    state.player.damage = 3;
    for (let i = 0; i < 4; i += 1) {
      state.lanterns[i].lit = true;
      state.lanternsLit = i + 1;
    }
    state.emberCharge = EMBERS_PER_LANTERN - 2;
    const events = runFor(world, LIMIT_SECONDS, autopilot);
    const won = (events & EVENT_WIN) !== 0 || world.state.won;
    return { screen: won ? SCREEN_WIN : SCREEN_PLAY, best: world.state.score };
  }
  runFor(world, PLAY_SECONDS, autopilot);
  return { screen: SCREEN_PLAY, best: world.state.score };
}
