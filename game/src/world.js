// The game's rules and state, with no drawing and no browser in it: the keeper, the
// shadow tide, bolts and gloom, embers and lanterns, waves and upgrades. step() advances
// one fixed step and returns what happened as bit flags, so the caller can react (sounds,
// screens) without the world knowing about them. Pools are allocated once, at boot.
import {
  EMBERS_PER_LANTERN,
  ENEMY,
  FIELD,
  FINAL_WAVE,
  LANTERNS_TO_WIN,
  LANTERN_SPOTS,
  PLAYER,
  POOLS,
  SCORE,
  waveMix,
  waveSize,
} from './config.js';

export const EVENT_SHOOT = 1;
export const EVENT_HIT = 2;
export const EVENT_KILL = 4;
export const EVENT_EMBER = 8;
export const EVENT_LANTERN = 16;
export const EVENT_WAVE_CLEAR = 32;
export const EVENT_WIN = 64;
export const EVENT_OVER = 128;
export const EVENT_DASH = 256;

export const WAVE_FIGHTING = 'fighting';
export const WAVE_BETWEEN = 'between';

/** The upgrades offered between waves: three drawn at random, one chosen. */
export const UPGRADES = [
  { id: 'bright', name: 'Bright Bolts', desc: '+1 damage on every bolt', apply(p) { p.damage += 1; } },
  { id: 'rapid', name: 'Rapid Lantern', desc: 'Fire 18% faster', apply(p) { p.fireInterval *= 0.82; } },
  { id: 'twin', name: 'Twin Flame', desc: '+1 bolt on every shot', apply(p) { p.projectiles += 1; } },
  { id: 'swift', name: 'Swift Boots', desc: '+12% movement speed', apply(p) { p.speed *= 1.12; } },
  { id: 'cloak', name: 'Sturdy Cloak', desc: '+1 max health, and heal 1', apply(p) { p.maxHp += 1; p.hp = Math.min(p.maxHp, p.hp + 1); } },
  { id: 'magnet', name: 'Ember Magnet', desc: 'Embers fly to you from farther away', apply(p) { p.magnet *= 1.6; } },
  { id: 'dash', name: 'Quick Step', desc: 'Dash recharges 35% faster', apply(p) { p.dashCooldown *= 0.65; } },
  { id: 'hoard', name: 'Ember Hoard', desc: 'Every ember counts double toward a lantern', apply(p) { p.emberValue *= 2; } },
];

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function createWorld(random) {
  const player = {
    x: FIELD.width / 2, y: FIELD.height / 2, hp: PLAYER.maxHp, maxHp: PLAYER.maxHp,
    speed: PLAYER.speed, damage: PLAYER.boltDamage, fireInterval: PLAYER.fireInterval,
    projectiles: PLAYER.projectiles, magnet: PLAYER.magnet, emberValue: PLAYER.emberValue,
    dashCooldown: PLAYER.dashCooldown, radius: PLAYER.radius,
    fireTimer: 0, dashTimer: 0, dashCd: 0, dashX: 0, dashY: 0, invuln: 0,
  };
  const enemies = [];
  for (let i = 0; i < POOLS.enemy; i += 1) {
    enemies.push({ active: false, kind: 'wisp', x: 0, y: 0, hp: 1, maxHp: 1, speed: 0, radius: 15, shotTimer: 0, flash: 0, touch: 1 });
  }
  const bolts = [];
  for (let i = 0; i < POOLS.bolt; i += 1) bolts.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0 });
  const glooms = [];
  for (let i = 0; i < POOLS.gloom; i += 1) glooms.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0 });
  const embers = [];
  for (let i = 0; i < POOLS.ember; i += 1) embers.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, value: 1 });
  const particles = [];
  for (let i = 0; i < POOLS.particle; i += 1) {
    particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 3, color: '#fff' });
  }
  const floats = [];
  for (let i = 0; i < POOLS.float; i += 1) floats.push({ active: false, x: 0, y: 0, life: 0, text: '', color: '#fff' });

  const lanterns = LANTERN_SPOTS.map((spot) => ({ x: spot.x, y: spot.y, lit: false }));
  const state = {
    player, enemies, bolts, glooms, embers, particles, floats, lanterns,
    score: 0, kills: 0, wave: 1, waveState: WAVE_FIGHTING, spawnQueue: [], spawnTimer: 0,
    emberCharge: 0, lanternsLit: 0, time: 0, shake: 0, banner: { text: '', timer: 0 },
    upgradeChoices: [], ambientTimer: 0, won: false, over: false,
  };

  function free(pool) {
    for (let i = 0; i < pool.length; i += 1) if (!pool[i].active) return pool[i];
    return null;
  }

  function burst(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const p = free(particles);
      if (!p) return;
      const angle = random() * Math.PI * 2;
      const v = speed * (0.4 + random() * 0.8);
      p.active = true;
      p.x = x; p.y = y;
      p.vx = Math.cos(angle) * v; p.vy = Math.sin(angle) * v;
      p.maxLife = 0.35 + random() * 0.4;
      p.life = p.maxLife;
      p.size = 2 + random() * 3;
      p.color = color;
    }
  }

  function addFloat(x, y, text, color) {
    const f = free(floats);
    if (!f) return;
    f.active = true; f.x = x; f.y = y; f.life = 0.9; f.text = text; f.color = color;
  }

  function spawnEnemy(kind) {
    const e = free(enemies);
    if (!e) return;
    const spec = ENEMY[kind];
    // Appear at a field edge, away from the keeper where possible.
    let x = 0;
    let y = 0;
    for (let tries = 0; tries < 8; tries += 1) {
      const edge = Math.floor(random() * 4);
      if (edge === 0) { x = random() * FIELD.width; y = -30; }
      else if (edge === 1) { x = random() * FIELD.width; y = FIELD.height + 30; }
      else if (edge === 2) { x = -30; y = random() * FIELD.height; }
      else { x = FIELD.width + 30; y = random() * FIELD.height; }
      if (distance({ x, y }, player) > 260) break;
    }
    e.active = true; e.kind = kind; e.x = x; e.y = y;
    e.hp = spec.hp; e.maxHp = spec.hp; e.speed = spec.speed * (1 + (state.wave - 1) * 0.04);
    e.radius = spec.radius; e.touch = spec.touch; e.flash = 0;
    e.shotTimer = 1 + random() * 1.5;
  }

  function buildQueue(wave) {
    const queue = [];
    const { brutes, spitters } = waveMix(wave);
    const size = waveSize(wave);
    for (let i = 0; i < size - brutes - spitters; i += 1) queue.push('wisp');
    for (let i = 0; i < spitters; i += 1) queue.push('spitter');
    for (let i = 0; i < brutes; i += 1) queue.push('brute');
    for (let i = queue.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
    return queue;
  }

  function rollUpgrades() {
    const pool = UPGRADES.slice();
    const picks = [];
    for (let i = 0; i < 3; i += 1) {
      const index = Math.floor(random() * pool.length);
      picks.push(pool.splice(index, 1)[0]);
    }
    return picks;
  }

  function startWave(wave) {
    state.wave = wave;
    state.spawnQueue = buildQueue(wave);
    state.spawnTimer = 0.6;
    state.waveState = WAVE_FIGHTING;
    state.banner = { text: wave > FINAL_WAVE ? `Endless Tide — Wave ${wave}` : `Wave ${wave} of ${FINAL_WAVE}`, timer: 2.2 };
  }

  function damagePlayer(amount, events) {
    if (player.invuln > 0 || state.won || state.over) return events;
    player.hp -= amount;
    player.invuln = PLAYER.invulnerable;
    state.shake = 10;
    burst(player.x, player.y, '#ff5d73', 14, 220);
    events |= EVENT_HIT;
    if (player.hp <= 0) {
      player.hp = 0;
      state.over = true;
      state.waveState = 'over';
      events |= EVENT_OVER;
      burst(player.x, player.y, '#ffe9a8', 40, 320);
    }
    return events;
  }

  function dropEmber(x, y, chance) {
    if (random() > chance) return;
    const ember = free(embers);
    if (!ember) return;
    ember.active = true;
    ember.x = x; ember.y = y;
    const angle = random() * Math.PI * 2;
    ember.vx = Math.cos(angle) * 60; ember.vy = Math.sin(angle) * 60;
    ember.value = 1;
  }

  function lightLantern(events) {
    const lantern = lanterns.find((item) => !item.lit);
    if (!lantern) return events;
    lantern.lit = true;
    state.lanternsLit += 1;
    state.score += SCORE.lantern;
    burst(lantern.x, lantern.y, '#ffc95e', 36, 260);
    addFloat(lantern.x, lantern.y - 40, 'Lantern lit!', '#ffc95e');
    events |= EVENT_LANTERN;
    if (state.lanternsLit >= LANTERNS_TO_WIN) {
      state.won = true;
      state.waveState = 'won';
      state.score += 500;
      events |= EVENT_WIN;
    }
    return events;
  }

  function reset() {
    player.x = FIELD.width / 2; player.y = FIELD.height / 2;
    player.hp = PLAYER.maxHp; player.maxHp = PLAYER.maxHp;
    player.speed = PLAYER.speed; player.damage = PLAYER.boltDamage;
    player.fireInterval = PLAYER.fireInterval; player.projectiles = PLAYER.projectiles;
    player.magnet = PLAYER.magnet; player.emberValue = PLAYER.emberValue;
    player.dashCooldown = PLAYER.dashCooldown;
    player.fireTimer = 0; player.dashTimer = 0; player.dashCd = 0; player.invuln = 0;
    for (const pool of [enemies, bolts, glooms, embers, particles, floats]) {
      for (const item of pool) item.active = false;
    }
    for (const lantern of lanterns) lantern.lit = false;
    state.score = 0; state.kills = 0; state.emberCharge = 0; state.lanternsLit = 0;
    state.time = 0; state.shake = 0; state.upgradeChoices = [];
    state.won = false; state.over = false;
    startWave(1);
  }

  function applyUpgrade(index) {
    const upgrade = state.upgradeChoices[index];
    if (!upgrade) return null;
    upgrade.apply(player);
    state.upgradeChoices = [];
    startWave(state.wave + 1);
    return upgrade;
  }

  function stepAmbient(dt) {
    state.ambientTimer -= dt;
    if (state.ambientTimer <= 0) {
      state.ambientTimer = 1.2;
      let count = 0;
      for (const e of enemies) if (e.active) count += 1;
      if (count < 6) spawnEnemy(random() < 0.8 ? 'wisp' : 'spitter');
    }
    for (const e of enemies) {
      if (!e.active) continue;
      e.x += Math.sin(state.time * 0.7 + e.y * 0.01) * 20 * dt;
      e.y += 24 * dt;
      if (e.y > FIELD.height + 40) e.active = false;
    }
    for (const p of particles) {
      if (!p.active) continue;
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.life <= 0) p.active = false;
    }
  }

  /**
   * One fixed step. `ctl` carries movement (-1..1), the aim point, whether the fire button
   * is held and whether a dash was requested. With `harmless` set (the title screen's
   * backdrop) shadows drift by and nothing can hurt or score.
   */
  function step(dt, ctl, harmless) {
    state.time += dt;
    if (state.banner.timer > 0) state.banner.timer -= dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 30);
    if (harmless) {
      stepAmbient(dt);
      return 0;
    }
    if (state.won || state.over || state.waveState === WAVE_BETWEEN) return 0;

    let events = 0;
    const aimDx = ctl.aimX - player.x;
    const aimDy = ctl.aimY - player.y;
    const aimLen = Math.hypot(aimDx, aimDy) || 1;

    // Movement and dash.
    if (player.dashTimer > 0) {
      player.dashTimer -= dt;
      player.x += player.dashX * PLAYER.dashSpeed * dt;
      player.y += player.dashY * PLAYER.dashSpeed * dt;
    } else {
      player.x += ctl.mx * player.speed * dt;
      player.y += ctl.my * player.speed * dt;
      if (ctl.dash && player.dashCd <= 0) {
        const dx = ctl.mx || aimDx / aimLen;
        const dy = ctl.my || aimDy / aimLen;
        const len = Math.hypot(dx, dy) || 1;
        player.dashX = dx / len; player.dashY = dy / len;
        player.dashTimer = PLAYER.dashTime;
        player.dashCd = player.dashCooldown;
        player.invuln = Math.max(player.invuln, 0.3);
        events |= EVENT_DASH;
      }
    }
    player.x = Math.min(FIELD.width - 24, Math.max(24, player.x));
    player.y = Math.min(FIELD.height - 24, Math.max(24, player.y));
    if (player.dashCd > 0) player.dashCd -= dt;
    if (player.invuln > 0) player.invuln -= dt;
    if (player.fireTimer > 0) player.fireTimer -= dt;

    // Firing: a spread of light bolts toward the aim point.
    if (ctl.firing && player.fireTimer <= 0) {
      player.fireTimer = player.fireInterval;
      const base = Math.atan2(aimDy, aimDx);
      const count = player.projectiles;
      for (let i = 0; i < count; i += 1) {
        const bolt = free(bolts);
        if (!bolt) break;
        const spread = (i - (count - 1) / 2) * 0.14;
        const angle = base + spread;
        bolt.active = true;
        bolt.x = player.x + Math.cos(angle) * 22;
        bolt.y = player.y + Math.sin(angle) * 22;
        bolt.vx = Math.cos(angle) * PLAYER.boltSpeed;
        bolt.vy = Math.sin(angle) * PLAYER.boltSpeed;
        bolt.life = 0.9;
      }
      events |= EVENT_SHOOT;
    }

    // Spawning.
    if (state.spawnQueue.length > 0) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        state.spawnTimer = Math.max(0.28, 0.75 - state.wave * 0.04);
        spawnEnemy(state.spawnQueue.shift());
      }
    }

    // Enemies: chase, keep range and shoot, or lumber in.
    for (const e of enemies) {
      if (!e.active) continue;
      if (e.flash > 0) e.flash -= dt;
      const dx = player.x - e.x;
      const dy = player.y - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (e.kind === 'spitter') {
        if (dist > 300) { e.x += (dx / dist) * e.speed * dt; e.y += (dy / dist) * e.speed * dt; }
        else if (dist < 200) { e.x -= (dx / dist) * e.speed * 0.6 * dt; e.y -= (dy / dist) * e.speed * 0.6 * dt; }
        e.shotTimer -= dt;
        if (e.shotTimer <= 0 && dist < 520) {
          e.shotTimer = ENEMY.spitter.shotInterval;
          const gloom = free(glooms);
          if (gloom) {
            gloom.active = true;
            gloom.x = e.x; gloom.y = e.y;
            gloom.vx = (dx / dist) * ENEMY.spitter.gloomSpeed;
            gloom.vy = (dy / dist) * ENEMY.spitter.gloomSpeed;
            gloom.life = 4;
          }
        }
      } else {
        e.x += (dx / dist) * e.speed * dt;
        e.y += (dy / dist) * e.speed * dt;
      }
    }
    // Gentle separation so shadows do not stack on one point.
    for (let i = 0; i < enemies.length; i += 1) {
      const a = enemies[i];
      if (!a.active) continue;
      for (let j = i + 1; j < enemies.length; j += 1) {
        const b = enemies[j];
        if (!b.active) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const min = a.radius + b.radius;
        if (dist > 0 && dist < min) {
          const push = (min - dist) / 2;
          const nx = dx / dist;
          const ny = dy / dist;
          a.x -= nx * push; a.y -= ny * push;
          b.x += nx * push; b.y += ny * push;
        }
      }
    }

    // Bolts fly and strike shadows.
    for (const bolt of bolts) {
      if (!bolt.active) continue;
      bolt.x += bolt.vx * dt;
      bolt.y += bolt.vy * dt;
      bolt.life -= dt;
      if (bolt.life <= 0 || bolt.x < -20 || bolt.x > FIELD.width + 20 || bolt.y < -20 || bolt.y > FIELD.height + 20) {
        bolt.active = false;
        continue;
      }
      for (const e of enemies) {
        if (!e.active) continue;
        const dx = bolt.x - e.x;
        const dy = bolt.y - e.y;
        if (dx * dx + dy * dy < (e.radius + 6) * (e.radius + 6)) {
          bolt.active = false;
          e.hp -= player.damage;
          e.flash = 0.12;
          burst(bolt.x, bolt.y, '#ffe9a8', 4, 140);
          if (e.hp <= 0) {
            e.active = false;
            state.kills += 1;
            state.score += SCORE[e.kind === 'wisp' ? 'killWisp' : e.kind === 'spitter' ? 'killSpitter' : 'killBrute'];
            addFloat(e.x, e.y - 20, `+${SCORE[e.kind === 'wisp' ? 'killWisp' : e.kind === 'spitter' ? 'killSpitter' : 'killBrute']}`, '#ffe9a8');
            burst(e.x, e.y, e.kind === 'brute' ? '#ff8a3d' : '#8f7bff', 18, 240);
            dropEmber(e.x, e.y, ENEMY[e.kind].emberChance);
            events |= EVENT_KILL;
          }
          break;
        }
      }
    }

    // Gloom orbs drift and hurt the keeper.
    for (const gloom of glooms) {
      if (!gloom.active) continue;
      gloom.x += gloom.vx * dt;
      gloom.y += gloom.vy * dt;
      gloom.life -= dt;
      if (gloom.life <= 0 || gloom.x < -20 || gloom.x > FIELD.width + 20 || gloom.y < -20 || gloom.y > FIELD.height + 20) {
        gloom.active = false;
        continue;
      }
      const dx = gloom.x - player.x;
      const dy = gloom.y - player.y;
      if (dx * dx + dy * dy < (player.radius + 8) * (player.radius + 8)) {
        gloom.active = false;
        events = damagePlayer(1, events);
      }
    }

    // Touch damage from shadows.
    for (const e of enemies) {
      if (!e.active) continue;
      const dx = player.x - e.x;
      const dy = player.y - e.y;
      if (dx * dx + dy * dy < (player.radius + e.radius) * (player.radius + e.radius)) {
        const before = player.hp;
        events = damagePlayer(e.touch, events);
        if (player.hp < before) {
          const dist = Math.hypot(dx, dy) || 1;
          e.x -= (dx / dist) * 40;
          e.y -= (dy / dist) * 40;
        }
        if (state.over) break;
      }
    }

    // Embers drift, get magnetised, and are gathered.
    for (const ember of embers) {
      if (!ember.active) continue;
      const dx = player.x - ember.x;
      const dy = player.y - ember.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist < player.magnet) {
        ember.vx += (dx / dist) * 900 * dt;
        ember.vy += (dy / dist) * 900 * dt;
      } else {
        ember.vx *= 0.96;
        ember.vy *= 0.96;
      }
      ember.x += ember.vx * dt;
      ember.y += ember.vy * dt;
      if (dist < player.radius + 14) {
        ember.active = false;
        state.emberCharge += player.emberValue;
        state.score += SCORE.ember;
        burst(ember.x, ember.y, '#ffb347', 6, 160);
        events |= EVENT_EMBER;
        if (state.emberCharge >= EMBERS_PER_LANTERN) {
          state.emberCharge -= EMBERS_PER_LANTERN;
          events = lightLantern(events);
        }
      }
    }

    // Particles and floating score text fade out.
    for (const p of particles) {
      if (!p.active) continue;
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.96; p.vy *= 0.96;
      if (p.life <= 0) p.active = false;
    }
    for (const f of floats) {
      if (!f.active) continue;
      f.life -= dt;
      f.y -= 34 * dt;
      if (f.life <= 0) f.active = false;
    }

    // Wave cleared: the tide is gone and the keeper chooses a boon.
    if (!state.over && !state.won && state.spawnQueue.length === 0) {
      let alive = false;
      for (const e of enemies) if (e.active) { alive = true; break; }
      if (!alive) {
        state.waveState = WAVE_BETWEEN;
        state.score += SCORE.waveClear + state.wave * 25;
        state.upgradeChoices = rollUpgrades();
        state.banner = { text: `Wave ${state.wave} clear!`, timer: 1.6 };
        events |= EVENT_WAVE_CLEAR;
      }
    }
    return events;
  }

  reset();
  return { state, reset, step, startWave, applyUpgrade, UPGRADES };
}
