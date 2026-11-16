// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between six screens: title, play, upgrade, paused, game over and
// victory. Sounds answer the world's events.
//
// ?seed=N fixes the tide's pattern. ?shot=title|play|win|over (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady for a
// screenshot.
import { BEST_KEY, FIELD, STEP, UPGRADE_CARDS } from './config.js';
import { createRandom } from './random.js';
import { createAudio } from './audio.js';
import {
  EVENT_DASH,
  EVENT_EMBER,
  EVENT_HIT,
  EVENT_KILL,
  EVENT_LANTERN,
  EVENT_OVER,
  EVENT_SHOOT,
  EVENT_WAVE_CLEAR,
  EVENT_WIN,
  WAVE_BETWEEN,
  createWorld,
} from './world.js';
import {
  ACTION_CONFIRM,
  ACTION_DASH,
  ACTION_MUTE,
  ACTION_PAUSE,
  createInput,
} from './input.js';
import {
  SCREEN_OVER,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_TITLE,
  SCREEN_UPGRADE,
  SCREEN_WIN,
  createRenderer,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

// Surface page errors in the title so a headless play-test can see them.
window.addEventListener('error', (event) => {
  document.title = `PAGEERROR: ${event.message}`;
});

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, { aim: { x: 860, y: 300 } });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let dashQueued = false;

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.unlock();
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Gather embers and light all five lanterns.');
  }

  function endGame(won) {
    screen = won ? SCREEN_WIN : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    if (won) {
      audio.win();
      announce(`Victory! All lanterns lit. Score ${world.state.score}. Best ${best}.`);
    } else {
      audio.lose();
      announce(`Game over. Score ${world.state.score}. Best ${best}.`);
    }
  }

  function handleEvents(events) {
    if (events & EVENT_SHOOT) audio.shoot();
    if (events & EVENT_HIT) audio.hit();
    if (events & EVENT_KILL) audio.kill();
    if (events & EVENT_EMBER) audio.ember();
    if (events & EVENT_LANTERN) audio.lantern();
    if (events & EVENT_DASH) audio.dash();
    if (events & EVENT_WAVE_CLEAR) {
      audio.wave();
      announce(`Wave ${world.state.wave} clear. Choose a boon.`);
    }
    if (events & EVENT_WIN) endGame(true);
    else if (events & EVENT_OVER) endGame(false);
  }

  function pickUpgrade(pick) {
    if (screen !== SCREEN_UPGRADE) return;
    const upgrade = world.applyUpgrade(pick - 1);
    if (upgrade) {
      audio.upgrade();
      screen = SCREEN_PLAY;
      announce(`${upgrade.name}. Wave ${world.state.wave}.`);
    }
  }

  function upgradeCardAt(point) {
    if (!point || world.state.upgradeChoices.length === 0) return 0;
    const total = 3 * UPGRADE_CARDS.width + 2 * UPGRADE_CARDS.gap;
    const startX = (FIELD.width - total) / 2;
    for (let i = 0; i < 3; i += 1) {
      const x = startX + i * (UPGRADE_CARDS.width + UPGRADE_CARDS.gap);
      if (point.x >= x && point.x <= x + UPGRADE_CARDS.width && point.y >= UPGRADE_CARDS.y && point.y <= UPGRADE_CARDS.y + UPGRADE_CARDS.height) {
        return i + 1;
      }
    }
    return 0;
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (actions & ACTION_DASH) dashQueued = true;
    const click = input.takeClick();
    if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN) {
      if (actions & ACTION_CONFIRM) startGame();
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      }
    } else if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    } else if (screen === SCREEN_UPGRADE) {
      const pick = input.takeUpgradePick() || upgradeCardAt(click);
      if (pick >= 1 && pick <= 3) pickUpgrade(pick);
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { mx: 0, my: 0, aimX: 640, aimY: 300, firing: false, dash: false }, true);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const move = input.movement();
    const aim = input.aim();
    const dash = dashQueued;
    dashQueued = false;
    const events = world.step(
      STEP,
      { mx: move.x, my: move.y, aimX: aim.x, aimY: aim.y, firing: input.firing(), dash },
      false,
    );
    handleEvents(events);
    if (world.state.waveState === WAVE_BETWEEN && screen === SCREEN_PLAY) {
      screen = SCREEN_UPGRADE;
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, { aim: input.aim() });
  }

  // Leaving the tab pauses a running game rather than letting shadows close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Lumenkeeper. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
