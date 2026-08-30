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
RAIL A       top rail y 1.02 along z = +3.60, x from -8.50 to -1.00
RAIL B       around merch shelf: x [+6.00 .. +8.60], z [+0.60 .. +3.00]

FRONT COUNTER FURNITURE (all sitting on y = 1.05)
  till            x -2.40, z +1.15      (kind 'till')
  cakeStand       x -0.60, z +1.20
  pastryCase      x [-0.20 .. +1.60], z [+0.95 .. +1.55]
  caddy           x +2.20, z +1.20
  handoff plane   x [+3.00 .. +4.60], z [+0.90 .. +1.50]   (kind 'pickup')

BAR-BACK STATIONS (on worktop y = 0.95, centred near z = -2.20)
  cupStack   x -4.60      grinder    x -3.60
  espresso   x -1.80  (two group heads at x -2.25 and x -1.35)
  steamWand  x -0.95      superauto  x +0.20
  syrupRack  x +1.40      blender    x +2.20
  iceWell    x +3.00      sink       x +3.90
  coldBrewTap  x +4.30, z -1.00 (on the inner east face, tap spout y 1.25)

PLAYER   spawn (0, 0, -0.60); eye height 1.62; walk speed 2.6 m/s
         confined to the inner aisle plus a 0.4 m margin

QUEUE    order queue slots i=0..7 at  (x = -2.40 - 0.85*i, z = +2.55), facing -Z
         pickup wait slots j=0..5 at  (x = +3.20 + 0.70*j, z = +2.70), facing -Z
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
  communal tables two, 4.60 x 0.80, tops y 1.05, centres (-11.60, +1.20) and (-11.60, +3.40)
  merch shelf     x [+6.20 .. +8.40], z [+0.80 .. +2.80], three tiers y 0.75/1.05/1.35
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
export function setMeter(cfg)     // {kind:'dose'|'shot'|'steam'|'blend', value, zone:[a,b]} | null
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
