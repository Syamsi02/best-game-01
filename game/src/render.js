// Drawing only: the world's state and the current screen in, pixels out. The 1280x720
// playfield is scaled to fit the window and centred, the margin filled with the backdrop
// colour. A night sky with stars, glowing lantern posts, ember light and shadow foes, all
// drawn with canvas shapes and gradients — no image files. Text that holds a number is
// rebuilt only when the number changes, so a frame allocates nothing.
import { EMBERS_PER_LANTERN, FIELD, FONT, LANTERNS_TO_WIN, PALETTE, UPGRADE_CARDS } from './config.js';
import { WAVE_BETWEEN } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_UPGRADE = 'upgrade';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const PANEL = { width: 640, top: 150, line: 32, bottom: 76 };

// Ninety stars, fixed by a tiny generator so every run paints the same sky.
const STARS = [];
{
  let seed = 7;
  const next = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 90; i += 1) {
    STARS.push({ x: next() * FIELD.width, y: next() * FIELD.height * 0.75, r: 0.6 + next() * 1.6, tw: next() * Math.PI * 2 });
  }
}

function cachedLabel(prefix) {
  let value = -1;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const scoreLabel = cachedLabel('Score ');
  const waveLabel = cachedLabel('Wave ');
  const finalLabel = cachedLabel('Score ');
  const bestLabel = cachedLabel('Best ');
  const killsLabel = cachedLabel('Shadows banished: ');

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  function glow(x, y, radius, color, alpha) {
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    context.globalAlpha = alpha;
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 1;
  }

  function drawSky(state) {
    const gradient = context.createLinearGradient(0, 0, 0, FIELD.height);
    gradient.addColorStop(0, PALETTE.skyTop);
    gradient.addColorStop(1, PALETTE.skyBottom);
    context.fillStyle = gradient;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    const t = state.time;
    for (const star of STARS) {
      context.globalAlpha = 0.35 + 0.35 * Math.sin(t * 1.4 + star.tw);
      context.fillStyle = PALETTE.star;
      context.beginPath();
      context.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    // A soft moon in the bottom-right corner, clear of the HUD.
    glow(1205, 645, 70, '#e8ecff', 0.5);
    context.fillStyle = '#e8ecff';
    context.beginPath();
    context.arc(1205, 645, 30, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.skyTop;
    context.beginPath();
    context.arc(1218, 636, 26, 0, Math.PI * 2);
    context.fill();
  }

  function drawLanterns(state) {
    for (const lantern of state.lanterns) {
      if (lantern.lit) glow(lantern.x, lantern.y - 18, 130, '#ffc95e', 0.5);
      else glow(lantern.x, lantern.y - 18, 40, '#5a6aa8', 0.25);
      context.fillStyle = '#2a2f4a';
      context.fillRect(lantern.x - 4, lantern.y - 34, 8, 40);
      context.fillStyle = lantern.lit ? PALETTE.lanternLit : PALETTE.lanternUnlit;
      context.beginPath();
      context.arc(lantern.x, lantern.y - 40, 13, 0, Math.PI * 2);
      context.fill();
      if (lantern.lit) {
        context.fillStyle = '#fff3c4';
        context.beginPath();
        context.arc(lantern.x, lantern.y - 40, 6, 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  function drawEmbers(state) {
    for (const ember of state.embers) {
      if (!ember.active) continue;
      const pulse = 1 + 0.15 * Math.sin(state.time * 6 + ember.x);
      glow(ember.x, ember.y, 26 * pulse, '#ff9d2e', 0.55);
      context.fillStyle = PALETTE.ember;
      context.save();
      context.translate(ember.x, ember.y);
      context.rotate(Math.PI / 4);
      const s = 8 * pulse;
      context.fillRect(-s / 2, -s / 2, s, s);
      context.restore();
      context.fillStyle = PALETTE.emberCore;
      context.beginPath();
      context.arc(ember.x, ember.y, 3, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawEnemies(state) {
    for (const e of state.enemies) {
      if (!e.active) continue;
      const body = e.kind === 'spitter' ? PALETTE.spitter : e.kind === 'brute' ? PALETTE.brute : PALETTE.wisp;
      const eye = e.kind === 'spitter' ? PALETTE.spitterEye : e.kind === 'brute' ? PALETTE.bruteEye : PALETTE.wispEye;
      glow(e.x, e.y, e.radius * 2.4, body, 0.45);
      context.fillStyle = e.flash > 0 ? '#ffffff' : body;
      context.beginPath();
      context.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
      context.fill();
      // Wobbling rim for the wisps, horns for the brutes.
      if (e.kind === 'brute') {
        context.fillStyle = '#3a2c1e';
        context.beginPath();
        context.moveTo(e.x - e.radius, e.y - e.radius * 0.4);
        context.lineTo(e.x - e.radius - 12, e.y - e.radius - 8);
        context.lineTo(e.x - e.radius * 0.4, e.y - e.radius * 0.7);
        context.closePath();
        context.fill();
        context.beginPath();
        context.moveTo(e.x + e.radius, e.y - e.radius * 0.4);
        context.lineTo(e.x + e.radius + 12, e.y - e.radius - 8);
        context.lineTo(e.x + e.radius * 0.4, e.y - e.radius * 0.7);
        context.closePath();
        context.fill();
      }
      const eyeY = e.y - e.radius * 0.15;
      const eyeGap = e.radius * 0.42;
      const eyeR = Math.max(2.5, e.radius * 0.16);
      context.fillStyle = eye;
      context.beginPath();
      context.arc(e.x - eyeGap, eyeY, eyeR, 0, Math.PI * 2);
      context.arc(e.x + eyeGap, eyeY, eyeR, 0, Math.PI * 2);
      context.fill();
      // Health bar over hurt foes.
      if (e.hp < e.maxHp) {
        const w = e.radius * 2;
        context.fillStyle = 'rgba(0,0,0,0.55)';
        context.fillRect(e.x - w / 2, e.y - e.radius - 12, w, 5);
        context.fillStyle = PALETTE.danger;
        context.fillRect(e.x - w / 2, e.y - e.radius - 12, w * (e.hp / e.maxHp), 5);
      }
    }
  }

  function drawShots(state) {
    for (const bolt of state.bolts) {
      if (!bolt.active) continue;
      glow(bolt.x, bolt.y, 18, '#ffe9a8', 0.7);
      context.fillStyle = PALETTE.bolt;
      context.beginPath();
      context.arc(bolt.x, bolt.y, 5, 0, Math.PI * 2);
      context.fill();
    }
    for (const gloom of state.glooms) {
      if (!gloom.active) continue;
      glow(gloom.x, gloom.y, 22, '#b388ff', 0.6);
      context.fillStyle = PALETTE.gloom;
      context.beginPath();
      context.arc(gloom.x, gloom.y, 8, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawPlayer(state, aim) {
    const player = state.player;
    if (state.over) return;
    glow(player.x, player.y, 90, '#ffc95e', 0.35);
    // Blink while invulnerable after a hit.
    if (player.invuln > 0 && Math.floor(state.time * 12) % 2 === 0) return;
    // Cloak: a hooded keeper, facing the aim point.
    const angle = Math.atan2(aim.y - player.y, aim.x - player.x);
    context.save();
    context.translate(player.x, player.y);
    context.rotate(angle);
    context.fillStyle = PALETTE.playerCloak;
    context.beginPath();
    context.moveTo(18, 0);
    context.lineTo(-12, -14);
    context.lineTo(-16, 0);
    context.lineTo(-12, 14);
    context.closePath();
    context.fill();
    context.restore();
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.arc(player.x, player.y, 10, 0, Math.PI * 2);
    context.fill();
    // The keeper's lantern, swinging ahead.
    const lx = player.x + Math.cos(angle) * 24;
    const ly = player.y + Math.sin(angle) * 24;
    glow(lx, ly, 26, '#ffc95e', 0.8);
    context.fillStyle = '#fff3c4';
    context.beginPath();
    context.arc(lx, ly, 5, 0, Math.PI * 2);
    context.fill();
    // Aim reticle.
    context.strokeStyle = 'rgba(255,233,168,0.85)';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(aim.x, aim.y, 11, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.moveTo(aim.x - 16, aim.y);
    context.lineTo(aim.x - 6, aim.y);
    context.moveTo(aim.x + 6, aim.y);
    context.lineTo(aim.x + 16, aim.y);
    context.moveTo(aim.x, aim.y - 16);
    context.lineTo(aim.x, aim.y - 6);
    context.moveTo(aim.x, aim.y + 6);
    context.lineTo(aim.x, aim.y + 16);
    context.stroke();
  }

  function drawParticles(state) {
    for (const p of state.particles) {
      if (!p.active) continue;
      context.globalAlpha = Math.max(0, p.life / p.maxLife);
      context.fillStyle = p.color;
      context.beginPath();
      context.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    for (const f of state.floats) {
      if (!f.active) continue;
      context.globalAlpha = Math.max(0, f.life / 0.9);
      text(f.text, f.x, f.y, 20, f.color, 'center');
    }
    context.globalAlpha = 1;
  }

  function drawHud(state) {
    context.textBaseline = 'top';
    // Hearts (capped on screen; the number is what matters, not the row's length).
    const hearts = Math.min(state.player.maxHp, 12);
    for (let i = 0; i < hearts; i += 1) {
      const x = 26 + i * 30;
      const y = 26;
      context.fillStyle = i < state.player.hp ? PALETTE.heart : 'rgba(255,93,115,0.25)';
      context.beginPath();
      context.arc(x, y, 9, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.arc(x + 9, y, 9, 0, Math.PI * 2);
      context.fill();
      context.fillRect(x - 1, y + 2, 20, 12);
      context.beginPath();
      context.moveTo(x - 1, y + 6);
      context.lineTo(x + 9, y + 20);
      context.lineTo(x + 19, y + 6);
      context.closePath();
      context.fill();
    }
    text(scoreLabel(state.score), 24, 52, 26, PALETTE.text, 'left');
    text(waveLabel(state.wave), FIELD.width / 2, 20, 26, PALETTE.text, 'center');
    // Lantern pips and the ember charge toward the next one.
    const pipX = FIELD.width - 24 - LANTERNS_TO_WIN * 30;
    for (let i = 0; i < LANTERNS_TO_WIN; i += 1) {
      const x = pipX + i * 30;
      context.fillStyle = i < state.lanternsLit ? PALETTE.lanternLit : PALETTE.lanternUnlit;
      context.beginPath();
      context.arc(x + 10, 30, 10, 0, Math.PI * 2);
      context.fill();
      if (i < state.lanternsLit) {
        context.fillStyle = '#fff3c4';
        context.beginPath();
        context.arc(x + 10, 30, 4, 0, Math.PI * 2);
        context.fill();
      }
    }
    const barW = LANTERNS_TO_WIN * 30 - 10;
    context.fillStyle = 'rgba(255,255,255,0.15)';
    context.fillRect(pipX, 48, barW, 7);
    context.fillStyle = PALETTE.ember;
    const charge = state.lanternsLit >= LANTERNS_TO_WIN ? 1 : state.emberCharge / EMBERS_PER_LANTERN;
    context.fillRect(pipX, 48, barW * Math.min(1, charge), 7);
    // Dash cooldown.
    const dashReady = state.player.dashCd <= 0;
    context.fillStyle = 'rgba(255,255,255,0.15)';
    context.fillRect(24, FIELD.height - 34, 120, 8);
    context.fillStyle = dashReady ? '#7dffb0' : '#5a6aa8';
    const dashFill = dashReady ? 1 : 1 - state.player.dashCd / state.player.dashCooldown;
    context.fillRect(24, FIELD.height - 34, 120 * dashFill, 8);
    text(dashReady ? 'Dash ready  [Shift]' : 'Dash…', 24, FIELD.height - 62, 16, PALETTE.muted, 'left');
    text('WASD move · Mouse aim · Hold click to fire · P pause · M mute', FIELD.width / 2, FIELD.height - 30, 15, PALETTE.muted, 'center');
    // Wave banner.
    if (state.banner.timer > 0) {
      context.globalAlpha = Math.min(1, state.banner.timer);
      text(state.banner.text, FIELD.width / 2, 120, 40, PALETTE.gold, 'center');
      context.globalAlpha = 1;
    }
  }

  function drawPanel(title, lines, prompt) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(7,10,24,0.72)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x, y, PANEL.width, height);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 78, 46, PALETTE.text, 'center');
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], FIELD.width / 2, y + PANEL.top + i * PANEL.line, 21, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 36, 23, PALETTE.gold, 'center');
  }

  function drawUpgrade(state) {
    context.fillStyle = 'rgba(7,10,24,0.6)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    text('Choose a boon', FIELD.width / 2, 120, 44, PALETTE.text, 'center');
    text('Press 1, 2 or 3 — or click a card', FIELD.width / 2, 168, 20, PALETTE.muted, 'center');
    const total = 3 * UPGRADE_CARDS.width + 2 * UPGRADE_CARDS.gap;
    const startX = (FIELD.width - total) / 2;
    state.upgradeChoices.forEach((upgrade, index) => {
      const x = startX + index * (UPGRADE_CARDS.width + UPGRADE_CARDS.gap);
      const y = UPGRADE_CARDS.y;
      context.fillStyle = PALETTE.panel;
      context.fillRect(x, y, UPGRADE_CARDS.width, UPGRADE_CARDS.height);
      context.strokeStyle = PALETTE.panelEdge;
      context.lineWidth = 2;
      context.strokeRect(x, y, UPGRADE_CARDS.width, UPGRADE_CARDS.height);
      context.textBaseline = 'alphabetic';
      text(`[${index + 1}]`, x + UPGRADE_CARDS.width / 2, y + 52, 22, PALETTE.gold, 'center');
      text(upgrade.name, x + UPGRADE_CARDS.width / 2, y + 96, 26, PALETTE.text, 'center');
      // Word-wrap the description into the card.
      const words = upgrade.desc.split(' ');
      const lines = [''];
      for (const word of words) {
        const last = lines[lines.length - 1];
        if ((last + ' ' + word).trim().length > 26) lines.push(word);
        else lines[lines.length - 1] = (last + ' ' + word).trim();
      }
      lines.forEach((line, li) => {
        text(line, x + UPGRADE_CARDS.width / 2, y + 140 + li * 26, 19, PALETTE.muted, 'center');
      });
    });
  }

  const TITLE_LINES = [
    'Gather embers from the shadows and light all five lanterns.',
    'WASD or arrows to move · Mouse to aim · Hold click to fire light',
    'Shift to dash through danger · P to pause · M to mute',
    'Between waves, choose a boon. Fall, and the tide takes the light.',
    '',
  ];
  const PAUSED_LINES = ['The tide waits in the dark.'];
  const OVER_LINES = ['', '', ''];
  const WIN_LINES = ['', '', '', ''];

  /** Paint one frame: the field, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, best, extras) {
    const aim = extras && extras.aim ? extras.aim : { x: FIELD.width / 2, y: FIELD.height / 2 - 120 };
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const shakeX = state.shake > 0 ? Math.sin(state.time * 47.3) * state.shake : 0;
    const shakeY = state.shake > 0 ? Math.cos(state.time * 39.7) * state.shake : 0;
    context.setTransform(view.scale, 0, 0, view.scale, view.x + shakeX * view.scale, view.y + shakeY * view.scale);
    drawSky(state);
    drawLanterns(state);
    drawEmbers(state);
    drawEnemies(state);
    drawShots(state);
    drawPlayer(state, aim);
    drawParticles(state);
    if (screen === SCREEN_TITLE) {
      TITLE_LINES[4] = best > 0 ? bestLabel(best) : 'A new keeper takes up the lantern.';
      drawPanel('LUMENKEEPER', TITLE_LINES, 'Press Enter or click to begin');
      return;
    }
    drawHud(state);
    if (screen === SCREEN_UPGRADE && state.waveState === WAVE_BETWEEN) drawUpgrade(state);
    else if (screen === SCREEN_PAUSED) drawPanel('Paused', PAUSED_LINES, 'Press P to resume');
    else if (screen === SCREEN_OVER) {
      OVER_LINES[0] = finalLabel(state.score);
      OVER_LINES[1] = killsLabel(state.kills);
      OVER_LINES[2] = bestLabel(best);
      drawPanel('The light goes out', OVER_LINES, 'Press Enter or click to try again');
    } else if (screen === SCREEN_WIN) {
      WIN_LINES[0] = `All ${LANTERNS_TO_WIN} lanterns burn bright.`;
      WIN_LINES[1] = finalLabel(state.score);
      WIN_LINES[2] = killsLabel(state.kills);
      WIN_LINES[3] = bestLabel(best);
      drawPanel('The Ember Tide breaks!', WIN_LINES, 'Press Enter or click to play again');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
