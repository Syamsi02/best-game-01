# Lumenkeeper — Ember Tide

An original top-down arena game for make.fun's **best-game-01** ("Make the best game").
It runs offline in a desktop browser from static files under `game/`, with no network
request and no library.

## The game

You are a lantern keeper. Shadows rise from the dark in waves; your bolts of light
banish them, and they drop embers. Gather **10 embers to light one lantern** — light
**all five lanterns to win**. Fall, and the light goes out.

- **Move:** WASD or arrow keys · **Aim:** mouse · **Fire:** hold left click
- **Dash:** Shift (brief invulnerability, 2.2 s cooldown) · **Pause:** P · **Mute:** M
- **Between waves:** choose one of three boons (keys 1–3 or click a card) — more
  damage, faster fire, twin shots, speed, health, magnet, dash, double embers
- **Foes:** wisps that chase, spitters that shoot gloom from range, brutes that
  lumber in with heavy hits — growing waves up to wave 8, then the endless tide
- **Feel:** particles, screen shake, floating score text, hit flashes, wave banners,
  and fully synthesised WebAudio sound (no audio files)
- Best score is kept in `localStorage`.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

## Layout

- `game/index.html` — the page; `game/src/` — one job per file:
  `config.js` (tuning), `random.js` (seeded RNG), `audio.js` (synth sound),
  `input.js` (keyboard + mouse), `world.js` (rules), `render.js` (drawing),
  `shots.js` (deterministic screenshot scenes), `main.js` (loop + screens)
- `main.ts` — the entry program: copies `game/` + `screenshots/` to `/output` and
  writes `dossier.json` with the kit's `vendor/makefun-game.ts`
- `screenshots/` — real renders of the game's own code (`?shot=title|play|win|over`)

## License

MIT — see `LICENSE`.
