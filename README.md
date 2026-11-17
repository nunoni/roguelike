# Neon Heartstorm

A neon roguelike arena shooter. You fly a heart-shaped ship that fires hearts, fight through 20 waves across 4 sectors and pick upgrades as you level. Max out two partner skills and they **fuse** into something new. Each sector ends with a boss, and beating the last one unlocks endless mode.

Everything is hand-written WebGL2 and WebAudio: no dependencies, no build step, no asset files.

## Run it

```sh
node tools/serve.js          # then open http://localhost:8080
# or any static server, e.g.  python3 -m http.server 8080
```

It needs a browser with WebGL2 (any current Firefox, Chrome, Edge or Safari).

## Controls

| Input | Action |
|---|---|
| `WASD` / arrows | Move |
| Mouse | Aim. Hold left button to fire (`F` toggles auto-fire) |
| `Space` / `Shift` | Dash. You can't be hurt mid-dash |
| Right click / `E` | **Love Bomb**: charged by kills; clears bullets and blasts everything nearby |
| `1` `2` `3`, `R` | Pick an upgrade card, reroll |
| `Esc` / `P` | Pause (shows your build, settings, codex) |
| `M` | Mute |

## The game

**Enemies (the Heartless).** New types unlock as the waves go on:
- **Drifter** and **Motes** swarm you.
- **Lancer** telegraphs, then dashes.
- **Spitter** keeps its distance and shoots.
- **Splitter** breaks into 2, then 4.
- **Bomber** blows up when it reaches you.
- **Warden** has a shield that blocks hearts and breaks after enough hits.
- **Pinwheel** fires spiral bullet streams.
- **Phantom** blinks next to you and can't be hit while faded.
- **Ray** fires a sniper laser.
- **Leech** tethers to you and drains.
- **Hive** births Motes.
- **Wyrm** is a segmented serpent; only its head can be hurt.

From wave 6, elite variants (Swift, Armored, Volatile, Regenerating) can appear.

**Bosses:**
- **The Monolith:** shield plates, spinning lasers, bullet bursts.
- **Binary:** twin stars joined by a deadly beam; the survivor enrages.
- **Ouroboros:** a giant serpent that sheds its tail as it weakens.
- **The Hollow Heart:** three phases; the last closes the arena in on you.

**Skills.** There are 24 skills: stats, techniques that change how your hearts behave, and spells that act on their own. They form 12 fusion pairs:

| | | Fusion |
|---|---|---|
| Twin Flame | Cupid's Aim | **Heartstorm** |
| Racing Pulse | Piercing Gaze | **Love Beam** |
| Heartburst | Heartburn | **Supernova** |
| Cold Shoulder | Sparks Fly | **Absolute Zero** |
| Rebound | Heartbreak | **Kaleidoscope** |
| Heartbeat | Guardian Hearts | **Pulsar** |
| Lovestruck | Cherubs | **Entourage** |
| Irresistible | Attraction | **Event Horizon** |
| Guarded Heart | Skip a Beat | **Comet Heart** |
| Big Heart | Stolen Heart | **Bleeding Heart** |
| Crush | Passion | **Heartstopper** |
| Lighthearted | Shooting Stars | **Stardust Waltz** |

Every card shows its fusion partner. Fusions you discover are saved to the Fusion Codex on the title screen. Your best score, settings and codex are kept in `localStorage`.

## Project layout

```
index.html, style.css     page, HUD and menus (DOM over the canvas)
src/main.js               boot, main loop, glue
src/config.js             tunables: arena, player stats, XP curve, sector palettes
src/core/                 math, seeded RNG, spatial grid, input, save
src/gfx/                  WebGL2 renderer: instanced SDF shapes, bloom, distortion, particles
src/audio/                procedural sound effects and generative synthwave music
src/game/                 the simulation: game, player, weapons, enemies, bosses, waves, upgrades
src/ui/                   HUD, menus, SVG icons
tools/                    dev server, headless test suite, shape gallery
```

`src/game/` never touches the DOM or WebGL. Visuals and sound are injected, so the whole simulation runs in Node.

## Testing

```sh
node tools/sim-test.js               # headless suite (~20 s)
node tools/sim-test.js --balance 8   # also survey 8 seeded bot runs
```

The suite checks:
- the skill and fusion catalogue;
- a full 20-wave run into endless mode, with every enemy and boss spawning;
- a build with every skill and fusion active;
- each boss being beatable;
- no NaNs and bounded entity counts throughout.

### Debug URL parameters

These are for development. Add them to the URL, e.g. `index.html?debug&wave=10`.

| Param | Effect |
|---|---|
| `debug` | FPS and entity counters |
| `wave=N` | Start at wave N (5/10/15/20 are bosses) |
| `god` | Invulnerable |
| `half` / `max` / `max=beam` | Start with a mid-run build, or every skill and fusion (Love Beam only with `max=beam`) |
| `stress` | Spawn about 400 enemies |
| `bot` | Let the autopilot play |
| `seed=N` | Deterministic run |
