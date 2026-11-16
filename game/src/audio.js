// All sound is synthesised with WebAudio: short oscillators and filtered noise, no audio
// files. The context is created on the first user gesture; until then every call is a
// no-op, so the title screen and the screenshot scenes stay silent.

function tone(context, master, frequency, duration, type, volume, slideTo) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, context.currentTime);
  if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(slideTo, context.currentTime + duration);
  gain.gain.setValueAtTime(volume, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
  oscillator.connect(gain);
  gain.connect(master);
  oscillator.start();
  oscillator.stop(context.currentTime + duration);
}

function noise(context, master, duration, volume, frequency) {
  const length = Math.max(1, Math.floor(context.sampleRate * duration));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const source = context.createBufferSource();
  source.buffer = buffer;
  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = frequency;
  const gain = context.createGain();
  gain.gain.setValueAtTime(volume, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  source.start();
}

export function createAudio() {
  let context = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume();
      return true;
    }
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.35;
      master.connect(context.destination);
      return true;
    } catch {
      return false;
    }
  }

  function play(fn) {
    if (muted || !ensure()) return;
    try {
      fn(context, master);
    } catch {
      // Sound is garnish: never let a synthesis failure touch the game.
    }
  }

  return {
    unlock() {
      ensure();
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.35;
      return muted;
    },
    shoot() {
      play((c, m) => tone(c, m, 720, 0.07, 'square', 0.08, 340));
    },
    hit() {
      play((c, m) => {
        tone(c, m, 160, 0.14, 'sawtooth', 0.16, 70);
        noise(c, m, 0.1, 0.1, 900);
      });
    },
    kill() {
      play((c, m) => {
        tone(c, m, 420, 0.12, 'triangle', 0.14, 90);
        noise(c, m, 0.16, 0.12, 1400);
      });
    },
    ember() {
      play((c, m) => tone(c, m, 880, 0.12, 'sine', 0.14, 1320));
    },
    lantern() {
      play((c, m) => {
        [523, 659, 784, 1047].forEach((f, i) => {
          setTimeout(() => tone(c, m, f, 0.3, 'sine', 0.14), i * 90);
        });
      });
    },
    wave() {
      play((c, m) => tone(c, m, 196, 0.4, 'triangle', 0.16, 392));
    },
    dash() {
      play((c, m) => noise(c, m, 0.14, 0.1, 2400));
    },
    upgrade() {
      play((c, m) => {
        tone(c, m, 659, 0.12, 'sine', 0.14);
        setTimeout(() => tone(c, m, 880, 0.18, 'sine', 0.14), 100);
      });
    },
    win() {
      play((c, m) => {
        [523, 659, 784, 1047, 1319].forEach((f, i) => {
          setTimeout(() => tone(c, m, f, 0.4, 'sine', 0.15), i * 120);
        });
      });
    },
    lose() {
      play((c, m) => {
        [392, 330, 262, 196].forEach((f, i) => {
          setTimeout(() => tone(c, m, f, 0.4, 'triangle', 0.14), i * 150);
        });
      });
    },
  };
}
