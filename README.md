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

**Sectors and the route.** A run crosses 5 tiers of 5 waves. After each boss, two **warp gates** open; fly into one to choose the next sector. Every sector has its own hazard, and each one is as much a weapon as a threat:

| Tier | Sector options | Hazard |
|---|---|---|
| 1 | Azure Drift | **Comets** streak across the arena and hit enemies too |
| 2 | Verdant Rift / *Crystal Cascade* | **Spore pods** pop when you get close (shoot them for XP) / **Prisms** split your hearts and enemy bullets in three |
| 3 | Ember Reach / *Static Storm* | **Solar flares** scorch the ground and burn enemies / **Tesla pylons** arc lightning that shocks everything between them |
| 4 | The Hollow / *Tidal Nebula* | **Rifts** drag you, enemies and bullets in / **Currents** push everything and keep turning |
| 5 | Black Corona | **Dimming**: the light fails and enemies hide in the dark |

Hazards pause during boss fights.

**Bosses.** Tiers 1 to 3 each pick one of two bosses per run, independent of the sector you chose:

| Tier | Boss |
|---|---|
| 1 | **The Monolith** (shield plates it hurls at you, spinning lasers, chasing slams; enraged, it falls from the sky) or **Shatterheart** (bursts into shards that heal it if they fly home; locks you in a crystal prison) |
| 2 | **Binary** (twin stars joined by a deadly tether that sheds bullet walls and scissors shut; the survivor enrages) or **The Weaver** (a cage of laser threads, pounces, and egg sacs that hatch) |
| 3 | **Ouroboros** (charges, mines, and coils around you) or **The Metronome** (on the beat: pendulum lasers, checkerboard tiles, and bullets that only move on the beat) |
| 4 | **The Hollow Heart** (three phases: seeking hearts, gapped rings, a Flatline wall to ride through, a closing arena) |
| 5 | **The Eclipse**, the final boss (hunts you from the dark, Blackouts, walls of coronal fire, then burns as a diamond ring) |

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
src/game/                 the simulation: game, player, weapons, enemies, bosses, hazards, waves, upgrades
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
- a full 25-wave run into endless mode, with every enemy and the planned bosses spawning and the warp-gate route being followed;
- every sector's hazard firing without stalling its waves;
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
| `sector=ID` | Play that sector, e.g. `sector=storm&wave=12` (ids: azure, verdant, crystal, ember, storm, hollow, tidal, corona) |
| `route=a,b,c` | Fix the sectors after the first, e.g. `route=crystal,storm,tidal` |
| `skills=a,b` / `fus=x,y` | Start with those skills maxed and those fusions |
| `god` | Invulnerable |
| `half` / `max` / `max=beam` | Start with a mid-run build, or every skill and fusion (Love Beam only with `max=beam`) |
| `stress` | Spawn about 400 enemies |
| `bot` | Let the autopilot play |
| `seed=N` | Deterministic run |
