// Keyboard and mouse, read as the game needs them: movement as a -1..1 pair, the aim in
// playfield coordinates, held buttons, and one-shot actions (confirm, pause, dash, mute,
// upgrade picks) that the caller drains once a frame.
import { FIELD } from './config.js';

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_DASH = 4;
export const ACTION_MUTE = 8;

const MOVE_KEYS = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  KeyD: [1, 0],
  KeyW: [0, -1],
  KeyS: [0, 1],
};

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseX = FIELD.width / 2;
  let mouseY = FIELD.height / 2 - 120;
  let mouseDown = false;
  let clicked = null;
  let upgradePick = 0;

  function toField(event) {
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / FIELD.width, rect.height / FIELD.height);
    const offsetX = (rect.width - FIELD.width * scale) / 2;
    const offsetY = (rect.height - FIELD.height * scale) / 2;
    return {
      x: (event.clientX - rect.left - offsetX) / scale,
      y: (event.clientY - rect.top - offsetY) / scale,
    };
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    keys.add(event.code);
    if (event.code === 'Enter' || event.code === 'Space') actions |= ACTION_CONFIRM;
    if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACTION_PAUSE;
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') actions |= ACTION_DASH;
    if (event.code === 'KeyM') actions |= ACTION_MUTE;
    if (event.code === 'Digit1') upgradePick = 1;
    if (event.code === 'Digit2') upgradePick = 2;
    if (event.code === 'Digit3') upgradePick = 3;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(event.code)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('mousemove', (event) => {
    const point = toField(event);
    mouseX = point.x;
    mouseY = point.y;
  });
  canvas.addEventListener('mousedown', (event) => {
    const point = toField(event);
    mouseX = point.x;
    mouseY = point.y;
    mouseDown = true;
    clicked = { x: point.x, y: point.y };
    if (event.button === 0) actions |= ACTION_CONFIRM;
  });
  window.addEventListener('mouseup', () => {
    mouseDown = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  function movement() {
    let x = 0;
    let y = 0;
    for (const code of keys) {
      const delta = MOVE_KEYS[code];
      if (delta) {
        x += delta[0];
        y += delta[1];
      }
    }
    if (x !== 0 && y !== 0) {
      const length = Math.hypot(x, y);
      x /= length;
      y /= length;
    }
    return { x, y };
  }

  return {
    movement,
    aim() {
      return { x: mouseX, y: mouseY };
    },
    firing() {
      return mouseDown;
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    takeClick() {
      const taken = clicked;
      clicked = null;
      return taken;
    },
    takeUpgradePick() {
      const taken = upgradePick;
      upgradePick = 0;
      return taken;
    },
  };
}
