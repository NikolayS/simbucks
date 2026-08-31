# SIM*BUCKS — INTERFACE CONTRACT (authoritative; do not deviate)

Seven modules are written in parallel by different agents. This file is the
only thing that keeps them compatible. **If you think the contract is wrong,
implement it anyway and note the objection in your final report.** Never edit
a file you do not own. Never edit this file.

## 0. Conventions
- Units are metres. **Y is up.** +X is "east" (toward the handoff / merch end).
  **+Z is the public side** (where customers stand). -Z is behind the bar.
- Angles in radians. Colours as hex ints (`0xE2593C`).
- ES modules only. `import * as THREE from 'three'`. No default exports.
- Deterministic: use `ctx.rng()` (0..1), never `Math.random()`.
- No `await import`, no network, no external assets, no npm packages.
- Every file must pass `node --check <file>`.

## 1. The context object
Every builder receives one `ctx`:

```js
ctx = {
  THREE,      // three.js namespace
  scene,      // THREE.Scene
  camera,     // THREE.PerspectiveCamera
  renderer,   // THREE.WebGLRenderer
  tex,        // namespace of src/gfx/textures.js
  mat,        // namespace of src/gfx/materials.js  (mat.get('oak') etc.)
  audio,      // namespace of src/gfx/audio.js
  bus,        // event bus: bus.on(name, fn), bus.off(name, fn), bus.emit(name, payload)
  rng,        // () => float in [0,1)
  state,      // live game state (src/game/state.js)
  hud,        // namespace of src/ui/hud.js
  layout,     // frozen object from src/core/layout.js — ALL hard coordinates
}
```

## 2. Builder signature
Every world/entity module exports at least one builder:

```js
export function buildSomething(ctx) {
  return {
    group,          // THREE.Group  (caller adds it to the scene)
    colliders: [],  // array of THREE.Box3 in world space, blocks the player
    interactables: [], // see below; may be empty
    update(dt, t) {},  // optional; dt seconds, t total seconds
    dispose() {},      // optional
  };
}
```

## 3. Interactable
```js
{
  id: 'grinder',            // unique string
  kind: 'station',          // 'station' | 'pickup' | 'till' | 'prop'
  label: 'Grinder',         // shown in the HUD prompt
  object: THREE.Object3D,   // raycast target (must be in the returned group)
  hint: 'Hold E to dose',   // optional secondary line
  hold: false,              // true if the action is hold-to-act rather than tap
}
```
Interaction is dispatched by `src/game/stations.js`, which listens for
`bus.emit('interact', { id, phase })` where phase is `'tap' | 'holdStart' |
'holdEnd'`. Builders never implement gameplay; they only expose meshes.

**Amended in build.** `till` is shared: `customers.js` also subscribes to
`interact` for that id and is the module that creates the order, while
`stations.js` supplies the beep and the toast. Two subscribers on one id is
deliberate, not a bug.

## 4. Event bus names (the only cross-module coupling)
| event | payload | emitted by | consumed by |
|---|---|---|---|
| `interact` | `{id, phase, dt}` | player | stations |
| `order:new` | `{order}` | customers | hud, state |
| `order:served` | `{order, score, tip}` | stations | customers, hud, state |
| `order:lost` | `{order, reason}` | customers | hud, state |
| `cup:changed` | `{cup}` | stations | hud, hands |
| `station:feedback` | `{id, ok, text}` | stations | hud, audio |
| `sfx` | `{name, vol?}` | anyone | audio |
| `shift:start` / `shift:end` | `{summary?}` | state | hud, customers |
| `rush` | `{flight, size}` | state | customers, hud |
| `debug:teleport` | `{x,z}` | hud | player |

## 5. LAYOUT — hard coordinates (src/core/layout.js, written by the coordinator)
Read these from `ctx.layout`; never hard-code your own.

```
KIOSK ISLAND  — a rounded-rectangle ring of joinery; the player works inside.
  outer footprint: x [-6.60 .. +5.40], z [-2.60 .. +1.60], corner radius 1.20
  wall thickness 0.75  →  inner aisle x [-5.60 .. +4.40], z [-1.75 .. +0.75]
  service counter top  y = 1.05   (front run, front face z = +1.60)
  bar-back worktop top y = 0.95   (rear run, top slab z [-2.60 .. -1.85])
  toe kick 0.10 high, set back 0.06

FASCIA (black soffit)  face z = +1.75, y [2.95 .. 3.65], x [-4.50 .. +3.50]
  wordmark centred at x = +0.10 ; roundel centre (x -3.60, y 3.30, z +1.86) r 0.31

MENU SCREENS  face z = +1.72, tilt -6 deg about X
  menuA   x [-4.30 .. -2.90]  y [1.95 .. 2.75]
  menuB   x [-2.75 .. -1.35]  y [1.95 .. 2.75]
  frappo  x [-1.20 .. +0.40]  y [1.95 .. 2.75]
  wrap    x [+0.70 .. +1.90]  y [2.40 .. 3.10]

CORAL ARCH   arc in plane x = -6.90, centre (z -0.50, y 0.40), radius 2.90,
             from z=-3.40 to z=+2.40, tube radius 0.028
RAIL A       top rail y 1.02 along z = +3.60, x from -8.50 to -1.00,
             with a queue entrance gap at x -5.20 .. -4.00
RAIL B       around merch shelf: x [+6.00 .. +8.60], z [+0.60 .. +3.00]

FRONT COUNTER FURNITURE (all sitting on y = 1.05)
  till            x -2.40, z +1.15      (kind 'till')
  cakeStand       x -0.60, z +1.20
  pastryCase      x [-0.20 .. +1.60], z [+0.95 .. +1.55]
  caddy           x +2.20, z +1.20
  handoff plane   x [+3.00 .. +4.60], z [+0.90 .. +1.50]   (kind 'pickup')

BAR-BACK STATIONS (on worktop y = 0.95, centred near z = -2.20)
  cupStack   x -5.15      grinder    x -3.60   (cupStack moved west to clear the doorway)
  espresso   x -1.80  (two group heads at x -2.25 and x -1.35)
  steamWand  x -0.95      superauto  x +0.20
  syrupRack  x +1.40      blender    x +2.20
  iceWell    x +3.00      sink       x +3.90
  coldBrewTap  x +4.30, z -1.00 (on the inner east face, tap spout y 1.25)

BACK-OF-HOUSE (layout.backHouse, aliased at layout.kiosk.backHouse)
  outer x [-6.60 .. +0.60], z [-6.40 .. -3.20], corner radius 1.10, wall 0.70
  bench tops y 0.95 ; screen wall to y 1.55 on the public side
  doorway x [-4.90 .. -4.00], cut through BOTH the back-of-house front face
    and the main ring's rear run, so the two halves are one connected space
  interior therefore x [-5.90 .. -0.10], z [-5.70 .. -3.90]
  fittings: prep bench, dish sink, three-tier stock shelving, upright fridge,
    crate stack, and the two blue water jugs (moved here from the front)
  The mural continues onto its west elevation: that is what makes the front
  and back halves read as one shop rather than two objects.

PLAYER   spawn (0, 0, -0.60); eye height 1.62; walk speed 2.6 m/s
         walkable region is the UNION of: the inner aisle plus a 0.4 m margin,
         the doorway corridor, and the back-of-house interior

QUEUE    order queue slots i=0..7 at  (x = -2.40 - 0.85*i, z = +2.55), facing -Z
         pickup wait slots j=0..4 at  (x = +3.20 + 0.70*j, z = +2.70), facing -Z
         customers enter at (x -16, z +6.5) and leave at (x +14, z +6.5)

TERMINAL SHELL
  floor plane y 0, x [-34 .. +34], z [-30 .. +30]; ceiling y 6.00
  far shopfront wall z = +16.50 ;  rear wall z = -12.00
  discoverLondon  x [+2 .. +14] on the far wall
  jet2 billboard  x [+4 .. +16], y [3.60 .. 5.60], z = +16.40
  inMotion store  opening x [-8 .. +6] in the rear wall; yellow banner y [3.40 .. 4.20]
  brandPlaques    column at x -9.40, z -11.80, y [1.20 .. 4.00]
  gate gantry     panel centre (x -1.00, y 4.60, z -8.50), 7.20 x 1.50, faces +Z
  aelia dutyfree  x [-30 .. -16], z [-12 .. -2]
  seating pods    x [-20 .. -11], z [-6 .. +8]
  communal tables two, 4.60 x 0.80, tops y 1.05, centres (-9.40, -0.60) and (-9.40, +5.40),
                  each rotated 90 deg so their length runs parallel to the mural face
  merch shelf     x [+6.80 .. +9.00], z [+0.80 .. +2.80], three tiers y 0.75/1.05/1.35
```

## 6. Module ownership (do not touch another owner's files)
| module | files | owner |
|---|---|---|
| TEX | `src/gfx/textures.js`, `src/gfx/materials.js` | agent-tex |
| TERMINAL | `src/world/terminal.js`, `src/world/props.js` | agent-terminal |
| KIOSK | `src/world/kiosk.js`, `src/world/equipment.js` | agent-kiosk |
| PEOPLE | `src/entities/people.js` | agent-people |
| GAME | `src/game/menu.js`, `src/game/orders.js`, `src/game/customers.js`, `src/game/state.js` | agent-game |
| PLAY | `src/player/controls.js`, `src/player/hands.js`, `src/game/stations.js` | agent-play |
| UI | `src/ui/hud.js`, `src/ui/hud.css`, `src/gfx/audio.js` | agent-ui |
| CORE | `index.html`, `src/main.js`, `src/core/*` | coordinator |

## 7. Required exports per module

### src/gfx/textures.js
Every function returns a `THREE.CanvasTexture`, is memoised by name, and takes
no required arguments. Canvases 512x512 unless noted.
```
floorTile(), oakSlat(), worktop(), mural(1024x1024), roundel(512, transparent),
fasciaWordmark(1024x256, transparent), menuBoardA(1024x600), menuBoardB(1024x600),
frappoPromo(1024x600), wrapPromo(768x480), jet2(2048x512), inMotionBanner(2048x256),
brandPlaques(256x1024), gateSign(2048x420), discoverLondon(1024x512),
aeliaFront(1024x512), posScreen(512x384), pastryTray(512x512), cupSleeve(256x256),
beans(256x256), ceilingPanel(256x256), tumblerLid(128x128), apronPatch(128x128),
noise(256x256)
```
Also `export function clearTextureCache()`.

### src/gfx/materials.js
```
export function initMaterials(ctx)   // builds the cache; call once
export function get(name)            // memoised THREE.Material
```
Names that MUST exist: `oak, oakDark, worktop, mural, coral, blackMatte,
blackGloss, chrome, steel, glass, screen, screenDim, floor, ceiling, wallWhite,
apronGreen, skin, cloth, cardboard, ice, milk, espresso, foam, paperCup,
plasticLid, greenSign, redSign, yellowSign, rubber`.

### src/gfx/audio.js
```
export function initAudio(ctx)       // lazy; resumes AudioContext on first gesture
export function play(name, opts)     // 'grind','steam','pour','beep','thunk','ding',
                                     // 'blend','chime','pa','crowd','coin','pageturn'
export function setAmbience(on)
export function isReady()
```
All sounds synthesised (oscillators + filtered noise). No files.

### src/world/terminal.js
`export function buildTerminal(ctx)` — floor, ceiling, lights, walls,
shopfronts, billboards, signage. Must also export
`export function buildLighting(ctx)` returning `{group, update}`.

### src/world/props.js
`export function buildProps(ctx)` — chairs, stanchions, wet-floor cones,
crates, communal tables, stools, merch shelf, bins, cabin bags.

### src/world/kiosk.js
`export function buildKiosk(ctx)` — the joinery ring, mural panels, coral arch
and rails, fascia, menu screens, front-counter furniture, pastry case.

### src/world/equipment.js
`export function buildEquipment(ctx)` — every bar-back machine. Each machine
that the player uses must appear in `interactables` with the exact ids:
`cupStack, grinder, espresso, steamWand, superauto, syrupRack, blender,
iceWell, sink, coldBrewTap, till, handoff`.
Also `export function getStationAnchors()` → `{ [id]: THREE.Vector3 }` world
positions where held items/particles should appear.

### src/entities/people.js
**Transform ownership (amended in build):** the CALLER owns the root
transform. `customers.js` calls `person.update(dt)` and then writes
`group.position` and `group.rotation.y` itself; `update` must not fight it.
`walkTo`/`face` are for people.js's own ambient crowd, which nobody else
drives. People are built facing **+Z** with feet at y = 0, so a driver can
orient them with `rotation.y = atan2(dir.x, dir.z)`.

```
export function makePerson(ctx, opts)  // opts: {role:'barista'|'passenger'|'customer',
                                       //  palette?, bag?, scale?, seed?}
  -> { group, update(dt), walkTo(vec3, speed), face(vec3), setPose('idle'|'walk'|'sit'|'work'),
       say(text), isMoving() }
export function buildCrowd(ctx)        // ambient background passengers + seated idlers
export function buildBaristaNPCs(ctx)  // 2 co-workers who mime work behind the bar
```
`say(text)` shows a small sprite speech bubble for ~2.5 s (draw it yourself).

### src/game/menu.js
`export const DRINKS` — array of
`{id, name, price, hot, recipe:[steps], size:['tall','grande','venti'], tags}`
where a step is `{station, param}` e.g. `{station:'syrupRack', param:3}`.
`export const FOOD`, `export function pickDrink(rng, difficulty)`.

### src/game/orders.js
`export function makeOrder(ctx, difficulty)` → order object
`{id, drink, size, name, mods:[], steps:[], progress:[], price, patience, t0}`
`export function scoreOrder(order, built)` → `{score, tip, correct, notes[]}`
where `built` is `{drink, drinkId, size, steps:[{station, param, quality, foam?}]}`.
`built.drink` may be absent, in which case the drink is inferred from the step
log. `foam` (`'wet'|'micro'|'dry'`) is strictly additive: a step without it is
never penalised. Latte = wet, Flat White = micro, Cappuccino = dry; wrong
aeration costs 0.14 and clears the `correct` predicate, which is what keeps the
three from being interchangeable.

### src/game/customers.js
`export function buildCustomers(ctx)` → `{group, update(dt,t), colliders:[]}`
Owns spawning, queue shuffling, patience, walk-outs, pickup and departure.
Uses `makePerson` from people.js. Emits `order:new`, `order:lost`.

### src/game/state.js
```
export function createState()   // {money, tips, served, lost, rep, tSec, phase, rank}
export function startShift(ctx)
export function updateState(ctx, dt)   // drives the clock, flight rushes, end of shift
export const FLIGHTS   // [{time, flight, gate, dest, size}]
```

### src/player/controls.js
`export function createPlayer(ctx, colliders)` → `{object, update(dt), teleport(x,z),
 getHeldTargetId()}` — pointer lock, WASD, head bob, collision against colliders,
raycast at screen centre against interactables, emits `interact`.

### src/player/hands.js
`export function createHands(ctx)` → `{group, update(dt), setHeld(cupOrNull),
 playGesture(name)}` — camera-attached; renders the held cup/portafilter/pitcher.

### src/game/stations.js
`export function createStations(ctx)` → `{update(dt), register(interactables)}`
The gameplay brain: owns the cup being built, the mini-games (dose meter, shot
timer, steam temperature, syrup pump count, blend), validates against the
ticket, emits `order:served` and `station:feedback`.

### src/ui/hud.js
```
export function initHUD(ctx)      // builds DOM into #hud, injects hud.css
export function setPrompt(text)   // crosshair prompt, '' to clear
export function setTickets(list)
export function setMeter(cfg)     // {kind, value, zone:[a,b], text?, label?} | null
                                  // kinds in use: dose, shot, steam, blend, pour, syrup.
                                  // Treat the list as a floor, render any kind as a bar,
                                  // and always prefer `text` over deriving a readout from
                                  // `value` — 'shot' sends value 0.66 with text '26.4s'.
export function toast(text, ok)
export function setStats(state)
export function showEndCard(summary)
export function showTitle(onStart)
```

## 8. Definition of done for an agent
1. Your files exist, pass `node --check`, and export exactly the names above.
2. Nothing you write throws when called with a context whose other modules are
   stubs (guard optional lookups).
3. Geometry sits at the layout coordinates; nothing intersects the player aisle.
4. You report: what you built, anything you could not do, and any contract
   objection.

## 9. TOUCH INPUT (added after the first touch-device report)
The game must be playable on a touch screen with no keyboard, no mouse and no
pointer lock. Desktop behaviour must not change.

**Detection.** Touch UI appears when the device reports touch
(`navigator.maxTouchPoints > 0` or `'ontouchstart' in window`) OR when the
first real `touchstart` is seen. Hybrid laptops must work both ways: seeing a
touch shows the touch UI, seeing a mouse or key event hides it again. Never
gate on user-agent sniffing or on screen width.

**Ownership.** `src/ui/hud.js` owns every on-screen control (the DOM). It
never moves the player and never raycasts. `src/player/controls.js` owns all
movement, looking and interaction dispatch, exactly as it does for keyboard.
The HUD talks to controls only through the bus:

| event | payload | meaning |
|---|---|---|
| `input:move` | `{x, y}` | stick vector, each -1..1, y positive = forward. `{x:0,y:0}` on release |
| `input:look` | `{dx, dy}` | look delta in CSS pixels since the last event |
| `input:action` | `{action, phase}` | `action` is `'interact' \| 'drop' \| 'lid'`; `phase` is `'tap' \| 'holdStart' \| 'holdEnd'` |

**`input:action` carries no duration, deliberately.** A HUD `tap` reaches
controls with an elapsed press time of zero, so the emitted `interact` has
`dt: 0`. That is safe only because `stations.js`'s `handleTap(id)` ignores
duration entirely. If a tap ever becomes duration-sensitive, this event needs
a `dt` field and every HUD button has to start timing its press. `holdStart`
is different: it seeds `pressDuration` with `CONFIG.holdThreshold` so the
meters receive the same `dt: 0.180` the E key produces at its threshold.

`controls.js` treats `input:action` with `action:'interact'` exactly as it
treats the E key — it resolves the current centre-screen raycast target and
emits the existing `interact` event, so `stations.js` needs no change at all.
`'drop'` maps to Q and `'lid'` to L.

**Required touch UI** (HUD): a left-thumb virtual stick; a right-side primary
ACT button that supports both tap and hold, sized for a thumb (min 64 px, in
the lower right, clear of the meter); small DROP and LID buttons; and
drag-anywhere-else-to-look. The crosshair stays centre-screen and the prompt
must remain readable — on a touch device, aiming is done by dragging the view,
so the prompt has to be visible while a thumb is on the stick.

**Pointer lock must never be required.** On a touch device the title card's
START must begin the shift without requesting a lock, and the "CLICK TO
RESUME" overlay must never appear.

**Layout.** All touch controls scale with `vmin`, sit inside `env(safe-area-inset-*)`,
and must not overlap the ticket rail, stat strip, meter or cup chip in either
orientation from 360x640 up.

## 10. RENDER PIPELINE (added after a visual-quality comparison)
The game looked flat next to commercial coffee sims. The cause was not
geometry count — it was that metals had nothing to reflect, emissives did not
bloom, nothing had contact shadows, and every surface had a single uniform
roughness. This section adds a render pipeline to fix that without a single
external asset.

**Ownership.** `src/gfx/render.js` (new) owns the environment map and the
post-processing chain. `src/gfx/materials.js` and `src/gfx/textures.js` own
PBR inputs. `src/main.js` owns wiring only.

### src/gfx/render.js
```
export function buildEnvironment(ctx)   // -> THREE.Texture, a PMREM-prefiltered
                                        // procedural room. Assign to scene.environment.
export function createRenderPipeline(ctx)
  -> { render(dt), resize(w, h), setQuality(name), quality, composer, dispose() }
```
`setQuality('high'|'medium'|'low')`. Coarse-pointer devices start at 'low'.
`render()` replaces `renderer.render(scene, camera)` everywhere, including in
`ctx.step()`. If this module fails to load, main.js falls back to plain
rendering — the game must never go black because a post pass threw.

**Vendored addons available** (`three/addons/...`): EffectComposer, RenderPass,
ShaderPass, MaskPass, OutputPass, UnrealBloomPass, SAOPass, SSAOPass, SMAAPass,
Reflector, SimplexNoise, and their shaders. Nothing else may be fetched.

**Budget.** The pipeline must hold 60 fps at 1600x900 on an M-series laptop at
'high', and must not drop the phone below 30 fps at 'low' — where the honest
answer is usually no SAO and no bloom, just tone mapping and the environment
map, which is where most of the gain is anyway.

### Environment map
A procedural room built in code — bright ceiling band, warm floor bounce, a
cool window wall, and a few bright rectangles standing in for the ceiling slot
lights — rendered to a cube and prefiltered through `PMREMGenerator`. This is
the single highest-value change in this section: chrome, steel and glass
currently have nothing to reflect and therefore read as grey plastic.

### Materials must then earn it
Every metal needs a real `metalness` (0.9+) with low `roughness` and an
`envMapIntensity`; every large flat surface needs roughness variation from a
procedural map, or it reads as vinyl. Uniform roughness is what makes a scene
look like programmer art.

## 11. FEEDBACK AND TRAINING MODE (added after user testing)
Two failures reported by the user, with one root cause: **the simulation knows
exactly what happened and does not tell the player.**

> "'americano needed work' — but what work?! ... unclear"

`scoreOrder` already returns a prioritised `notes[]` with specific text such as
"Wrong drink — that is an Americano, the ticket says a Latte". None of it ever
reaches the screen: the HUD renders `+£3.55 AMERICANO` and discards the rest.

### 11.1 Say what was wrong
- `scoreOrder` gains `tip_text`: ONE actionable sentence naming the single
  biggest loss and how to fix it — "You pulled 2 shots; an Americano takes 1"
  or "Milk hit 78 °C; release the wand between 60 and 68". Never vague, never
  "needed work", always a number or a named action the player can repeat.
- `order:served` must carry
  `{order, score, tip, notes, tip_text, correct, faults}`.
  Whoever emits it may not drop fields it was given.
  **`faults: [{code, label}]` is the structured form** and the shift tally must
  read it. Without it, `state.js` has to reconstruct fault categories by
  regex-matching the English of `notes[]` — which makes note WORDING
  load-bearing, so rephrasing "Milk hit 78 °C" would silently re-file it. That
  is the same "the simulation knows and does not say" shape as the bug this
  section exists to fix, one layer down. Parse the fact, never the sentence.
  (Naming regret, kept for consistency now that four files use it: `tip_text`
  is snake_case in a camelCase codebase and reads as a sibling of the money
  `tip` on the same payload. `coachingText` would have been the better name.)
- The HUD renders the top note on the toast, and `tip_text` under it when the
  drink was not perfect. The end-of-shift card lists the three most common
  faults of the shift, so a player learns their own pattern.

### 11.2 Training mode
A mode the player can turn on from the title card and toggle in play, for
learning the bar. It is not a difficulty setting; it is a coach.

- **Always-on next step.** A persistent panel names the next unsatisfied step
  of the front ticket in plain language — "GRIND: hold at the grinder until
  the dose meter is in the green" — with a step counter (3 of 5).
- **Point at it.** The HUD projects the target station's world anchor
  (`getStationAnchors()`) to screen space and draws a marker there, with an
  off-screen edge arrow when it is behind you. This is why it belongs to the
  HUD and not to a material tint: no module has to touch another's meshes.
- **Explain the meters while they run.** When a meter is live in training
  mode, the target zone carries a plain-language label — "release here" —
  rather than only a coloured band.
- **No failure while learning.** Patience drains at 40% and walk-outs do not
  end the shift. Money and tips still accrue, so the loop still teaches value.
- Training state lives in `ctx.state.training` and persists across shifts in
  `localStorage`. It is ON by default until the player completes one shift.

### 11.3 Ownership
| piece | file | owner |
|---|---|---|
| `tip_text`, richer notes, fault tally | `src/game/orders.js`, `state.js` | game |
| next-step computation, `guide:step` event | `src/game/stations.js` | play |
| panel, marker, meter labels, toggle, end-card faults | `src/ui/hud.js`, `hud.css` | ui |

New bus event: `guide:step` with
`{station, label, hint, index, total, param}` — emitted by stations.js whenever
the held cup or the front ticket changes, and `null` when there is nothing to
do. The HUD renders it only in training mode, but stations.js emits it always,
so the panel cannot go stale when the mode is switched on mid-drink.

## 12. THINGS A FUTURE SESSION SHOULD KNOW
Hazards found during the build that are not obvious from the code.

**Note wording in `orders.js` is a fallback path, no longer load-bearing.**
`faultsFromNotes` classifies by prefix — a milk note must start `Milk `, a
shot note `Shot ` — and rephrasing one would silently re-file it. That path is
now only the fallback: `stations.js` forwards structured `faults` on
`order:served` and `state.js` prefers it. Keep it that way. The completeness
test catches a note with NO code, but not one that matches the WRONG code, so
the prose path can never be fully trusted.

**The pickup-overflow bug's shape will recur.** Customers piling up east of
the last pickup slot stood inside the merch shelf. It was latent for the whole
project and only became reachable when training mode removed the walk-out
shift-end that had been truncating the queue at about six orders. Any future
change that lets a shift run longer, or lets more customers accumulate, can
expose more code written under the old assumption.
`test/sim/geo.mjs` and `test/sim/slots.mjs` are what would catch the next one.

**Measure the scene after `updateMatrixWorld`.** `window.SIMBUCKS` is set
before the first render, so world matrices are identity and every fitting sits
stacked at the origin. Three separate measurements in this project produced
confident, wrong answers that way. Call `scene.updateMatrixWorld(true)` first.

**A hidden tab lies in two directions.** `requestAnimationFrame` is throttled,
so the render loop and the HUD's own frame loop stop — a HUD flag can read
stale forever. And `document.hidden` gates player input, so a console driver
sees the sim advance under `ctx.step()` while every input is silently dropped.
Spoof `document.hidden` and dispatch `visibilitychange` before driving input.

**Guards that test `scene.children` do not work.** Every builder returns a
Group, so a top-level check never sees the lights or the floor inside them.
This shipped a double-lit scene and a duplicate floor plane for most of the
build. Recurse.

**Bounding boxes have eaten three props.** A circumscribed circle rejected a
0.05 m sliver as if it were 1 m wide; an unrotated AABB nearly sat three stool
sitters across a rotated table. Use the rectangle, and rotate it.
