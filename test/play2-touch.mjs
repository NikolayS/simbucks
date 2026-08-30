// Touch-input harness for src/player/controls.js (agent-play2).
// Everything here drives the module through the bus contract of CONTRACT.md §9,
// with pointer lock NEVER acquired.
import { installDom } from './dom.js';
const dom = installDom();
const THREE = await import('three');
const REPO = new URL('../src', import.meta.url).href;
const { LAYOUT } = await import(REPO + '/core/layout.js');
const { createBus } = await import(REPO + '/core/bus.js');
const { mulberry32 } = await import(REPO + '/core/rng.js');
const controls = await import(REPO + '/player/controls.js');
const stationsMod = await import(REPO + '/game/stations.js');
const realMaterials = await import(REPO + '/gfx/materials.js');

const fails = [];
function check(name, fn) {
  try { fn(); console.log('  ok   ' + name); }
  catch (e) { fails.push(name); console.log('  FAIL ' + name + ': ' + (e.stack || e)); }
}
// The player is contained by a UNION of walk boxes (aisle + back-of-house
// doorway + back room), not by the aisle alone. Ask the module for its own
// regions so this harness cannot drift from the implementation.
function inWalkable(player, x, z, tol = 0.05) {
  const regions = player.getRegions?.() ?? [];
  for (const r of regions) {
    if (x >= r.x0 - tol && x <= r.x1 + tol && z >= r.z0 - tol && z <= r.z1 + tol) return true;
  }
  return false;
}

function near(a, b, eps, what) {
  if (!(Math.abs(a - b) <= eps)) throw new Error(`${what}: ${a} vs ${b} (eps ${eps})`);
}
function finite(...vals) { for (const v of vals) if (!Number.isFinite(v)) throw new Error('non-finite ' + v); }

function makeWorld() {
  const canvas = dom.makeElement('canvas');
  const camera = new THREE.PerspectiveCamera(66, 16 / 9, 0.05, 220);
  camera.position.set(LAYOUT.player.spawn.x, LAYOUT.player.eye, LAYOUT.player.spawn.z);
  const scene = new THREE.Scene();
  const bus = createBus();
  const events = [];
  for (const n of ['interact', 'cup:changed', 'station:feedback', 'order:served'])
    bus.on(n, (p) => events.push({ n, p: JSON.parse(JSON.stringify(p ?? null)) }));
  const ctx = {
    THREE, scene, camera, renderer: { domElement: canvas },
    tex: {}, mat: realMaterials, audio: { play() {} },
    bus, rng: mulberry32(1), layout: LAYOUT, state: {},
    hud: { setPrompt() {}, setMeter() {}, toast() {}, setTickets() {}, setStats() {} },
    menu: {}, orders: {},
  };
  const player = controls.createPlayer(ctx, []);
  ctx.player = player;
  scene.add(player.object);
  scene.add(camera);
  const stations = stationsMod.createStations(ctx);
  const IDS = ['cupStack','grinder','espresso','steamWand','superauto','syrupRack','blender','iceWell','sink','coldBrewTap','till','handoff'];
  const interactables = IDS.map((id) => {
    const object = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshBasicMaterial());
    object.name = id; scene.add(object);
    return { id, kind: 'station', label: id, object, hint: '', hold: false };
  });
  stations.register(interactables);
  ctx.interactables = interactables;
  const byId = new Map(interactables.map(i => [i.id, i]));
  const fwd = new THREE.Vector3();
  function frames(n, dt = 1 / 60) { for (let i = 0; i < n; i++) { player.update(dt); stations.update(dt); } }
  function aim(id) {
    const it = byId.get(id);
    for (const other of interactables) {
      if (other === it) continue;
      other.object.position.set(0, -50, 0); other.object.updateMatrixWorld(true);
    }
    camera.getWorldDirection(fwd);
    it.object.position.copy(camera.position).addScaledVector(fwd, 1.0);
    it.object.updateMatrixWorld(true);
    frames(6);
  }
  return { canvas, camera, bus, ctx, player, stations, interactables, events, frames, aim, IDS };
}

console.log('\n=== TOUCH: look ===');
{
  const w = makeWorld();
  const yaw0 = w.camera.rotation.y;
  check('input:look turns the camera with no pointer lock', () => {
    if (document.pointerLockElement) throw new Error('pointer got locked');
    w.bus.emit('input:look', { dx: 40, dy: 0 });
    w.frames(1);
    const d = w.camera.rotation.y - yaw0;
    if (!(d < -0.05)) throw new Error('yaw did not turn: delta ' + d);
    near(d, -40 * 0.0042, 1e-9, 'yaw delta');
  });
  check('pitch clamps and never NaNs', () => {
    for (let i = 0; i < 400; i++) w.bus.emit('input:look', { dx: 0, dy: -1000 });
    w.frames(1);
    near(w.camera.rotation.x, 1.4835, 1e-9, 'pitch max');
    for (let i = 0; i < 400; i++) w.bus.emit('input:look', { dx: 0, dy: 1000 });
    w.frames(1);
    near(w.camera.rotation.x, -1.4835, 1e-9, 'pitch min');
    finite(w.camera.rotation.x, w.camera.rotation.y);
  });
  check('malformed look payloads are inert', () => {
    const y = w.camera.rotation.y, p = w.camera.rotation.x;
    for (const bad of [null, undefined, 0, 'x', [], {}, { dx: NaN, dy: NaN }, { dx: Infinity }, { dx: '5' }, { dy: {} }]) {
      w.bus.emit('input:look', bad);
    }
    w.frames(1);
    near(w.camera.rotation.y, y, 1e-12, 'yaw unchanged');
    near(w.camera.rotation.x, p, 1e-12, 'pitch unchanged');
  });
  check('dispose unsubscribes the touch bus', () => {
    const y = w.camera.rotation.y;
    w.player.dispose();
    w.bus.emit('input:look', { dx: 500, dy: 500 });
    w.frames(1);
    near(w.camera.rotation.y, y, 1e-12, 'yaw after dispose');
  });
}

console.log('\n=== TOUCH: movement ===');
{
  const w = makeWorld();
  check('stick walks the player forward with no pointer lock', () => {
    const z0 = w.camera.position.z;
    w.bus.emit('input:move', { x: 0, y: 1 });
    w.frames(30);
    w.bus.emit('input:move', { x: 0, y: 0 });
    if (!(w.camera.position.z > z0 + 0.4)) throw new Error('did not walk: z ' + z0 + ' -> ' + w.camera.position.z);
  });
  check('release decelerates to a stop', () => {
    w.frames(90);
    if (w.player.getSpeed() !== 0) throw new Error('still moving at ' + w.player.getSpeed());
  });
  check('analogue magnitude scales speed', () => {
    w.player.teleport(0, -0.6);
    w.bus.emit('input:move', { x: 0, y: 1 }); w.frames(20);   // 20 frames: at target, not yet at the wall
    const full = w.player.getSpeed();
    w.player.teleport(0, -0.6);
    w.bus.emit('input:move', { x: 0, y: 0.5 }); w.frames(20);
    const half = w.player.getSpeed();
    w.bus.emit('input:move', { x: 0, y: 0 }); w.frames(60);
    near(full, LAYOUT.player.speed, 0.02, 'full-stick speed');
    near(half, LAYOUT.player.speed * 0.5, 0.02, 'half-stick speed');
  });
  check('deadzone kills stick jitter', () => {
    w.bus.emit('input:move', { x: 0.005, y: -0.005 }); w.frames(30);
    if (w.player.getSpeed() !== 0) throw new Error('jitter moved the player: ' + w.player.getSpeed());
    const s = w.player.getStick();
    if (s.x !== 0 || s.y !== 0) throw new Error('stick not zeroed: ' + JSON.stringify(s));
  });
  check('stick stays inside the walkable region over 1800 frames', () => {
    for (let i = 0; i < 1800; i++) {
      const t = i / 40;
      w.bus.emit('input:move', { x: Math.sin(t), y: Math.cos(t * 0.7) });
      if (i % 3 === 0) w.bus.emit('input:look', { dx: Math.sin(t * 2) * 30, dy: Math.cos(t) * 12 });
      w.frames(1);
      const p = w.camera.position;
      finite(p.x, p.y, p.z);
      if (!inWalkable(w.player, p.x, p.z))
        throw new Error(`out of bounds at frame ${i}: ${p.x.toFixed(2)},${p.z.toFixed(2)}`);
      if (Math.abs(p.y - LAYOUT.player.eye) > 0.2) throw new Error('eye drift ' + p.y);
    }
    w.bus.emit('input:move', { x: 0, y: 0 });
  });
  check('malformed move payloads are inert', () => {
    for (const bad of [null, undefined, 'go', 7, [], {}, { x: NaN, y: NaN }, { x: Infinity, y: -Infinity }, { x: '1' }, { y: {} }]) {
      w.bus.emit('input:move', bad);
    }
    w.frames(60);
    if (w.player.getSpeed() !== 0) throw new Error('garbage moved the player');
    finite(w.camera.position.x, w.camera.position.z);
  });
  check('stick is clamped to the unit square', () => {
    w.player.teleport(0, -0.6);
    w.bus.emit('input:move', { x: 9, y: 9 }); w.frames(20);
    near(w.player.getSpeed(), LAYOUT.player.speed, 0.02, 'over-range stick speed');
    w.bus.emit('input:move', { x: 0, y: 0 }); w.frames(60);
  });
}

console.log('\n=== TOUCH: keyboard parity (touch mode must not alter WASD) ===');
{
  function walkWithKeys(enableTouchFirst) {
    const w = makeWorld();
    if (enableTouchFirst) { w.bus.emit('input:move', { x: 0, y: 0 }); w.bus.emit('input:look', { dx: 0, dy: 0 }); }
    document.pointerLockElement = w.canvas;
    document.dispatchEvent({ type: 'pointerlockchange' });
    const key = (code, type) => window.dispatchEvent({ type, code, repeat: false, ctrlKey: false, metaKey: false, altKey: false, preventDefault() {} });
    key('KeyW', 'keydown'); w.frames(40);
    document.dispatchEvent({ type: 'mousemove', movementX: 220, movementY: -60 }); w.frames(10);
    key('KeyW', 'keyup'); w.frames(40);
    key('KeyA', 'keydown'); key('ShiftLeft', 'keydown'); w.frames(30);
    key('KeyA', 'keyup'); key('ShiftLeft', 'keyup'); w.frames(60);
    document.pointerLockElement = null;
    document.dispatchEvent({ type: 'pointerlockchange' });
    return [w.camera.position.x, w.camera.position.z, w.camera.rotation.x, w.camera.rotation.y];
  }
  check('identical WASD trajectory with touch mode on and off', () => {
    const a = walkWithKeys(false);
    const b = walkWithKeys(true);
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) throw new Error(`component ${i}: ${a[i]} vs ${b[i]}`);
  });
}

console.log('\n=== TOUCH: interaction dispatch ===');
{
  const w = makeWorld();
  const act = (action, phase) => w.bus.emit('input:action', { action, phase });
  const lastInteract = () => w.events.filter(e => e.n === 'interact').pop();

  check('interact tap emits the same event as E', () => {
    w.bus.emit('input:look', { dx: 0, dy: 0 });   // switch on touch mode
    w.aim('cupStack');
    act('interact', 'tap');
    w.frames(4);
    const e = lastInteract();
    if (!e || e.p.id !== 'cupStack' || e.p.phase !== 'tap') throw new Error('got ' + JSON.stringify(e?.p));
  });
  check('interact holdStart seeds dt with the keyboard hold threshold', () => {
    w.aim('grinder');
    act('interact', 'holdStart');
    const e = lastInteract();
    if (!e || e.p.id !== 'grinder' || e.p.phase !== 'holdStart') throw new Error('got ' + JSON.stringify(e?.p));
    near(e.p.dt, 0.18, 1e-9, 'holdStart dt');
    if (!w.player.isHolding()) throw new Error('isHolding() false during a touch hold');
    if (w.player.getHeldTargetId() !== 'grinder') throw new Error('getHeldTargetId wrong');
  });
  check('hold duration accumulates then holdEnd reports it', () => {
    w.frames(60);
    act('interact', 'holdEnd');
    const e = lastInteract();
    if (!e || e.p.phase !== 'holdEnd') throw new Error('got ' + JSON.stringify(e?.p));
    near(e.p.dt, 0.18 + 1.0, 0.02, 'holdEnd dt');
    if (w.player.isHolding()) throw new Error('still holding after holdEnd');
  });
  check('drop and lid map to Q and L', () => {
    const n = w.events.length;
    act('drop', 'tap'); w.frames(2);
    act('lid', 'tap'); w.frames(2);
    const got = w.events.slice(n).filter(e => e.n === 'interact').map(e => e.p.id + ':' + e.p.phase);
    if (got[0] !== 'drop:tap' || got[1] !== 'lid:tap') throw new Error(got.join(','));
  });
  check('a held DROP button fires exactly once', () => {
    const n = w.events.length;
    act('drop', 'holdStart'); w.frames(2);
    act('drop', 'holdEnd'); w.frames(2);
    const got = w.events.slice(n).filter(e => e.n === 'interact' && e.p.id === 'drop');
    if (got.length !== 1) throw new Error('fired ' + got.length + ' times');
  });
  check('unknown actions and phases are ignored', () => {
    const n = w.events.length;
    for (const bad of [null, undefined, 'x', 3, {}, { action: 'nuke', phase: 'tap' }, { action: 'interact' },
                       { action: 'interact', phase: 'wat' }, { action: 'drop', phase: null }, { phase: 'tap' }]) {
      w.bus.emit('input:action', bad);
    }
    w.frames(4);
    if (w.events.slice(n).some(e => e.n === 'interact')) throw new Error('a garbage action dispatched');
  });
  check('an orphan holdEnd is a no-op', () => {
    const n = w.events.length;
    act('interact', 'holdEnd'); w.frames(4);
    if (w.events.slice(n).some(e => e.n === 'interact')) throw new Error('orphan holdEnd emitted');
  });
}

console.log('\n=== TOUCH: a whole latte built with fingers only ===');
{
  const w = makeWorld();
  const act = (action, phase) => w.bus.emit('input:action', { action, phase });
  function tTap(id) { w.aim(id); act('interact', 'tap'); w.frames(6); }
  function tHold(id, seconds) {
    w.aim(id);
    act('interact', 'holdStart');
    w.frames(Math.max(1, Math.round((seconds - 0.18) * 60)));
    act('interact', 'holdEnd');
    w.frames(6);
  }
  check('touch-only build reaches order:served', () => {
    w.bus.emit('input:look', { dx: 0, dy: 0 });
    w.ctx.orders.scoreOrder = (o, built) => {
      if (!built || !built.contents) throw new Error('stations passed a bad built object');
      return { score: 1, tip: 0.5, correct: true, notes: [] };
    };
    w.bus.emit('order:new', { order: { id: 'touch-1', drink: { id: 'latte', name: 'Latte', price: 3.55, recipe: [] },
      size: 'grande', name: 'Nik', mods: [], steps: [], progress: [], price: 3.55, patience: 60, t0: 0 } });
    tHold('cupStack', 0.35);
    tTap('espresso');
    tHold('grinder', 0.95);
    tTap('espresso');
    tHold('espresso', 2.7);
    tTap('espresso');
    tTap('steamWand');
    tHold('steamWand', 2.25);
    tTap('steamWand');
    act('lid', 'tap'); w.frames(4);
    tTap('handoff'); w.frames(6);
    const served = w.events.filter(e => e.n === 'order:served');
    if (!served.length) throw new Error('never served');
    if (served.pop().p.order.id !== 'touch-1') throw new Error('wrong order');
    const cups = w.events.filter(e => e.n === 'cup:changed');
    if (!cups.some(e => e.p?.cup?.contents?.espresso > 0)) throw new Error('no espresso in the cup');
    if (!cups.some(e => e.p?.cup?.contents?.milk > 0)) throw new Error('no milk in the cup');
  });
  check('walking between stations with the stick, still in bounds', () => {
    w.bus.emit('input:move', { x: -1, y: 0 }); w.frames(120);
    w.bus.emit('input:move', { x: 1, y: 0.4 }); w.frames(120);
    w.bus.emit('input:move', { x: 0, y: 0 }); w.frames(30);
    const p = w.camera.position;
    if (!inWalkable(w.player, p.x, p.z))
      throw new Error('out of bounds ' + p.x.toFixed(2) + ',' + p.z.toFixed(2));
  });
}

console.log('\n=== TOUCH: pointer lock is never requested ===');
{
  const w = makeWorld();
  check('a touch-originated canvas click does not request lock', () => {
    window.dispatchEvent({ type: 'touchstart' });
    w.canvas.dispatchEvent({ type: 'click' });
    if (document.pointerLockElement) throw new Error('pointer lock was requested from a touch');
    if (!w.player.isTouchActive()) throw new Error('touch mode not detected from touchstart');
  });
  check('a pen pointerdown also suppresses lock', () => {
    window.dispatchEvent({ type: 'pointerdown', pointerType: 'pen' });
    w.canvas.dispatchEvent({ type: 'click' });
    if (document.pointerLockElement) throw new Error('lock requested after a pen tap');
  });
  check('a mouse click on the same hybrid device still locks', () => {
    window.dispatchEvent({ type: 'pointerdown', pointerType: 'mouse' });
    w.canvas.dispatchEvent({ type: 'click' });
    if (document.pointerLockElement !== w.canvas) throw new Error('mouse click failed to lock');
    document.pointerLockElement = null;
    document.dispatchEvent({ type: 'pointerlockchange' });
  });
  check('touch input still works while unlocked after that mouse click', () => {
    const z0 = w.camera.position.z;
    w.bus.emit('input:move', { x: 0, y: 1 }); w.frames(30); w.bus.emit('input:move', { x: 0, y: 0 });
    if (!(w.camera.position.z > z0 + 0.3)) throw new Error('stick stopped working');
  });
}

console.log('\n=== TOUCH: canvas drag fallback (only when the HUD is silent) ===');
{
  const w = makeWorld();
  const touch = (type, x, y) => w.canvas.dispatchEvent({
    type, target: w.canvas, touches: type === 'touchend' ? [] : [{ identifier: 1, clientX: x, clientY: y }],
    preventDefault() {},
  });
  check('dragging the bare canvas looks around', () => {
    const y0 = w.camera.rotation.y;
    touch('touchstart', 100, 300);
    touch('touchmove', 160, 300);
    w.frames(1);
    near(w.camera.rotation.y - y0, -60 * 0.0042, 1e-9, 'fallback yaw delta');
    touch('touchend', 160, 300);
  });
  check('the fallback goes silent once the HUD speaks', () => {
    w.bus.emit('input:look', { dx: 0, dy: 0 });
    const y0 = w.camera.rotation.y;
    touch('touchstart', 100, 300);
    touch('touchmove', 400, 300);
    w.frames(1);
    near(w.camera.rotation.y, y0, 1e-12, 'yaw after HUD took over');
  });
}

console.log('\n=== TOUCH: hidden tab and blur ===');
{
  const w = makeWorld();
  check('a hidden document freezes touch input', () => {
    w.bus.emit('input:move', { x: 0, y: 1 }); w.frames(20);
    document.hidden = true;
    document.dispatchEvent({ type: 'visibilitychange' });
    w.frames(20);
    const p0 = w.camera.position.z;
    w.bus.emit('input:move', { x: 0, y: 1 });
    w.bus.emit('input:look', { dx: 300, dy: 0 });
    w.frames(30);
    near(w.camera.position.z, p0, 1e-12, 'moved while hidden');
    document.hidden = false;
    document.dispatchEvent({ type: 'visibilitychange' });
  });
  check('blur clears the stick but touch recovers without a focus event', () => {
    w.bus.emit('input:move', { x: 0, y: 1 }); w.frames(10);
    window.dispatchEvent({ type: 'blur' });
    w.frames(60);
    if (w.player.getSpeed() !== 0) throw new Error('stick survived blur');
    const z0 = w.camera.position.z;
    w.bus.emit('input:move', { x: 0, y: 1 }); w.frames(40);
    if (!(Math.abs(w.camera.position.z - z0) > 0.2)) throw new Error('touch never recovered after blur');
    w.bus.emit('input:move', { x: 0, y: 0 });
  });
}

console.log('\n=== TOUCH: fuzz ===');
{
  const w = makeWorld();
  const rnd = mulberry32(99);
  const actions = ['interact', 'drop', 'lid', 'nope', null, 42];
  const phases = ['tap', 'holdStart', 'holdEnd', 'bogus', undefined];
  check('12000 random touch events never throw or corrupt the player', () => {
    for (let i = 0; i < 12000; i++) {
      const r = rnd();
      if (r < 0.34) w.bus.emit('input:move', { x: (rnd() * 4) - 2, y: (rnd() * 4) - 2 });
      else if (r < 0.68) w.bus.emit('input:look', { dx: (rnd() * 900) - 450, dy: (rnd() * 900) - 450 });
      else w.bus.emit('input:action', { action: actions[(rnd() * actions.length) | 0], phase: phases[(rnd() * phases.length) | 0] });
      if (i % 4 === 0) { w.aim(w.IDS[(rnd() * w.IDS.length) | 0]); }
      w.frames(1);
      const p = w.camera.position, r2 = w.camera.rotation;
      finite(p.x, p.y, p.z, r2.x, r2.y, r2.z);
    }
    const p = w.camera.position;
    if (!inWalkable(w.player, p.x, p.z))
      throw new Error('fuzz escaped the walkable region: ' + p.x + ',' + p.z);
    if (Math.abs(w.camera.rotation.x) > 1.4836) throw new Error('pitch escaped the clamp: ' + w.camera.rotation.x);
  });
}

console.log('');
if (fails.length) { console.log('TOUCH HARNESS FAILURES: ' + fails.length + '\n  ' + fails.join('\n  ')); process.exitCode = 1; }
else console.log('ALL TOUCH CHECKS PASSED');
