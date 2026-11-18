# Neon Heartstorm

A neon roguelike arena shooter. You fly a heart-shaped ship that fires hearts, fight through 25 waves across 5 sectors and pick upgrades as you level. Max out two partner skills and they **fuse** into something new. Each sector ends with a boss, and beating the last one unlocks endless mode.

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

**Bosses.** Sectors 1 to 3 each pick one of two bosses per run, so runs differ:

| Sector | Boss |
|---|---|
| 1 Azure Drift | **The Monolith** (shield plates, spinning lasers, chasing slams) or **Shatterheart** (a crystal heart that bursts into shards; kill them before they fly home and heal it) |
| 2 Verdant Rift | **Binary** (twin stars joined by a deadly beam; the survivor enrages) or **The Weaver** (spins a cage of laser threads around you; every anchor you cut wounds it) |
| 3 Ember Reach | **Ouroboros** (a giant serpent that charges and sheds its tail) or **The Metronome** (attacks on the music's beat: a swinging pendulum and checkerboard floor tiles) |
| 4 The Hollow | **The Hollow Heart** (three phases; the last closes the arena in on you) |
| 5 Black Corona | **The Eclipse**, the final boss (swallows the light; it hunts you from the dark, sends decoys, then burns as a diamond ring) |

Touching a boss costs two hearts.

**Skills.** There are 28 skills: stats, techniques that change how your hearts behave, and spells that act on their own. A few work together:
- Racing Pulse also makes spells cast faster.
- Cherubs copy your extra hearts, fire rate and heart effects.
- Burn stacks with every hit.

Each skill has a **signature partner**:

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
| On the Beat | Butterflies | **Ballroom** |
| Jealousy | Heartstrings | **Soulmates** |

There are also 14 **cross-fusions** that mix skills from different pairs: Thermal Shock, Wildfire, Fever Pitch, Starburst, Singularity, Halo, Thunderstruck, Skipping Heart, Serenade, Choir, Encore, Butterfly Kiss, Live Wire and Heartache. Each skill can only be spent on **one** fusion per run, so when two are ready at once you have to choose.

Every card shows its fusion partners. Fusions you discover are saved to the Fusion Codex on the title screen. Your best score, settings and codex are kept in `localStorage`.

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
- a full 25-wave run into endless mode, with every enemy and the planned bosses spawning;
- a build with every skill and fusion active;
- each of the 9 bosses being beatable;
- no NaNs and bounded entity counts throughout.

### Debug URL parameters

These are for development. Add them to the URL, e.g. `index.html?debug&wave=10`.

| Param | Effect |
|---|---|
| `debug` | FPS and entity counters |
| `wave=N` | Start at wave N (5/10/15/20/25 are bosses) |
| `boss=TYPE` | Force a boss for its sector, e.g. `boss=weaver&wave=10` |
| `skills=a,b` / `fus=x,y` | Start with those skills maxed and those fusions |
| `god` | Invulnerable |
| `half` / `max` / `max=beam` | Start with a mid-run build, or every skill and fusion (Love Beam only with `max=beam`) |
| `stress` | Spawn about 400 enemies |
| `bot` | Let the autopilot play |
| `seed=N` | Deterministic run |
