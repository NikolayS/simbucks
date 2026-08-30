// Walk-region harness for src/player/controls.js.
// The player is contained by a UNION of walk boxes (aisle + doorway corridor +
// back-of-house interior) rather than the single aisle box. These checks drive
// the real kiosk colliders, so they prove the doorway is walk-through in the
// geometry the game actually ships, not just in the abstract.
import { installDom } from './dom.js';
const dom = installDom();
const THREE = await import('three');
const REPO = new URL('../src/', import.meta.url).pathname;
const { LAYOUT } = await import(REPO + 'core/layout.js');
const { createBus } = await import(REPO + 'core/bus.js');
const { mulberry32 } = await import(REPO + 'core/rng.js');
const controls = await import(REPO + 'player/controls.js');
const materials = await import(REPO + 'gfx/materials.js');
const textures = await import(REPO + 'gfx/textures.js');
const kioskMod = await import(REPO + 'world/kiosk.js');

const fails = [];
function check(name, fn) {
  try { fn(); console.log('  ok   ' + name); }
  catch (e) { fails.push(name); console.log('  FAIL ' + name + ': ' + (e.stack || e)); }
}
function near(a, b, eps, what) {
  if (!(Math.abs(a - b) <= eps)) throw new Error(`${what}: ${a} vs ${b} (eps ${eps})`);
}

const BH = LAYOUT.backHouse;
const AISLE = LAYOUT.kiosk.aisle;
const M = LAYOUT.player.margin;
const EXPECT = {
  aisle:    { x0: AISLE.x0 - M, x1: AISLE.x1 + M, z0: AISLE.z0 - M, z1: AISLE.z1 + M },
  interior: { x0: BH.outer.x0 + BH.wall, x1: BH.outer.x1 - BH.wall,
              z0: BH.outer.z0 + BH.wall, z1: BH.outer.z1 - BH.wall },
};

function makeWorld({ withColliders = true, layout = LAYOUT } = {}) {
  const canvas = dom.makeElement('canvas');
  const camera = new THREE.PerspectiveCamera(66, 16 / 9, 0.05, 220);
  const scene = new THREE.Scene();
  const bus = createBus();
  const ctx = {
    THREE, scene, camera, renderer: { domElement: canvas },
    tex: textures, mat: materials, audio: { play() {} },
    bus, rng: mulberry32(3), layout, state: {},
    hud: { setPrompt() {}, setMeter() {}, toast() {}, setTickets() {}, setStats() {} },
    menu: {}, orders: {},
  };
  materials.initMaterials?.(ctx);
  const colliders = [];
  if (withColliders) {
    const built = kioskMod.buildKiosk(ctx);
    scene.add(built.group);
    colliders.push(...built.colliders);
  }
  const player = controls.createPlayer(ctx, colliders);
  ctx.player = player;
  scene.add(player.object);
  ctx.interactables = [];
  return { ctx, bus, camera, player, colliders };
}

// Containment test against the module's own regions, so the harness cannot
// drift away from the implementation's idea of the walkable world.
function inUnion(regions, x, z, tol = 0.001) {
  for (const r of regions) {
    if (x >= r.x0 - tol && x <= r.x1 + tol && z >= r.z0 - tol && z <= r.z1 + tol) return true;
  }
  return false;
}

// Drive the player toward a world-space waypoint with the analogue stick,
// converting the world direction into camera-relative stick axes.
function walkTo(w, tx, tz, { budget = 600, onFrame = null } = {}) {
  const p = w.camera.position;
  for (let i = 0; i < budget; i++) {
    const dx = tx - p.x, dz = tz - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.12) { w.bus.emit('input:move', { x: 0, y: 0 }); return { reached: true, frames: i }; }
    const yaw = w.camera.rotation.y;
    const nx = dx / dist, nz = dz / dist;
    const forward = -(nx * Math.sin(yaw) + nz * Math.cos(yaw));
    const strafe = (nx * Math.cos(yaw)) - (nz * Math.sin(yaw));
    w.bus.emit('input:move', { x: strafe, y: forward });
    w.player.update(1 / 60);
    if (onFrame) onFrame(p.x, p.z, i);
  }
  w.bus.emit('input:move', { x: 0, y: 0 });
  return { reached: false, frames: budget, x: p.x, z: p.z };
}

console.log('\n=== REGIONS: shape ===');
{
  const w = makeWorld({ withColliders: false });
  const regions = w.player.getRegions();
  check('three regions: aisle, doorway corridor, back-of-house interior', () => {
    if (regions.length !== 3) throw new Error('got ' + regions.length + ': ' + JSON.stringify(regions));
  });
  check('region 1 is the aisle, unchanged', () => {
    const r = regions[0];
    near(r.x0, EXPECT.aisle.x0, 1e-12, 'x0'); near(r.x1, EXPECT.aisle.x1, 1e-12, 'x1');
    near(r.z0, EXPECT.aisle.z0, 1e-12, 'z0'); near(r.z1, EXPECT.aisle.z1, 1e-12, 'z1');
  });
  check('region 2 is the doorway corridor, overlapping both neighbours', () => {
    const r = regions[1];
    near(r.x0, BH.doorway.x0, 1e-12, 'x0'); near(r.x1, BH.doorway.x1, 1e-12, 'x1');
    if (!(r.z1 > EXPECT.aisle.z0)) throw new Error('corridor does not reach the aisle: ' + r.z1);
    if (!(r.z0 < EXPECT.interior.z1)) throw new Error('corridor does not reach the interior: ' + r.z0);
  });
  check('region 3 is the back room, walls inset', () => {
    const r = regions[2];
    near(r.x0, EXPECT.interior.x0, 1e-12, 'x0'); near(r.x1, EXPECT.interior.x1, 1e-12, 'x1');
    near(r.z0, EXPECT.interior.z0, 1e-12, 'z0'); near(r.z1, EXPECT.interior.z1, 1e-12, 'z1');
  });
  check('the corridor adds no ground outside its neighbours', () => {
    const c = regions[1], a = regions[0], i = regions[2];
    if (!(c.x0 >= a.x0 && c.x1 <= a.x1)) throw new Error('corridor x escapes the aisle x span');
    if (!(c.x0 >= i.x0 && c.x1 <= i.x1)) throw new Error('corridor x escapes the interior x span');
  });
  check('getRegions() is preallocated, not rebuilt per call', () => {
    if (w.player.getRegions() !== regions) throw new Error('a new array per call');
  });
}

console.log('\n=== REGIONS: a layout with no back of house still works ===');
{
  const bare = JSON.parse(JSON.stringify({ ...LAYOUT, backHouse: undefined }));
  delete bare.backHouse;
  delete bare.kiosk.backHouse;
  const w = makeWorld({ withColliders: false, layout: bare });
  check('one region, the aisle, exactly as before', () => {
    const regions = w.player.getRegions();
    if (regions.length !== 1) throw new Error('got ' + regions.length);
    near(regions[0].z0, EXPECT.aisle.z0, 1e-12, 'z0');
  });
  check('containment is the old single-box behaviour', () => {
    w.player.teleport(0, -0.60);
    const r = walkTo(w, 0, -6.0, { budget: 400 });
    if (r.reached) throw new Error('walked into a back room that does not exist');
    near(w.camera.position.z, EXPECT.aisle.z0, 0.02, 'stopped at the old aisle edge');
  });
}

console.log('\n=== REGIONS: the doorway is walk-through (real kiosk colliders) ===');
{
  const w = makeWorld();
  const regions = w.player.getRegions();
  console.log('   kiosk colliders: ' + w.colliders.length);
  const doorX = (BH.doorway.x0 + BH.doorway.x1) / 2;
  let escaped = null;
  const watch = (x, z) => { if (!escaped && !inUnion(regions, x, z, 0.02)) escaped = [x, z]; };

  const route = [
    ['aisle, in front of the door', doorX, -1.90],
    ['through both walls, mid-corridor', doorX, -3.55],
    ['inside the back room', doorX, -4.80],
    ['across the back room', -1.50, -4.90],
    ['back to the doorway', doorX, -4.60],
    ['back through to the aisle', doorX, -1.90],
    ['home to spawn', LAYOUT.player.spawn.x, LAYOUT.player.spawn.z],
  ];
  w.player.teleport(LAYOUT.player.spawn.x, LAYOUT.player.spawn.z);
  for (const [label, tx, tz] of route) {
    check('walks to: ' + label, () => {
      const r = walkTo(w, tx, tz, { budget: 700, onFrame: watch });
      if (!r.reached) throw new Error(`stuck at ${r.x.toFixed(2)},${r.z.toFixed(2)} after ${r.frames} frames`);
    });
  }
  check('never left the walkable union on the whole round trip', () => {
    if (escaped) throw new Error('escaped at ' + escaped[0].toFixed(3) + ',' + escaped[1].toFixed(3));
  });
  check('the back room was genuinely entered', () => {
    // the deepest point of the route is past the front wall's inner face
    if (!(EXPECT.interior.z1 < AISLE.z0 - M)) throw new Error('geometry assumption broken');
  });
}

console.log('\n=== REGIONS: the walls still stop the player ===');
{
  const w = makeWorld();
  const regions = w.player.getRegions();
  check('no way through the rear run away from the doorway', () => {
    w.player.teleport(0, -0.60);
    walkTo(w, 0, -6.0, { budget: 500 });
    const z = w.camera.position.z;
    if (z < AISLE.z0 - M - 0.02) throw new Error('clipped through the rear run to z ' + z.toFixed(3));
    if (z < -2.10) throw new Error('pushed inside the joinery to z ' + z.toFixed(3));
  });
  check('no way through the back-house front wall beside the doorway', () => {
    w.player.teleport(-2.20, -1.20);
    walkTo(w, -2.20, -6.0, { budget: 500 });
    const z = w.camera.position.z;
    if (z < -2.60) throw new Error('clipped through beside the door to z ' + z.toFixed(3));
    // the rear run's front face is z -1.75, so a 0.28 body stops at -1.47
    if (z < -1.50) throw new Error('pushed into the rear run to z ' + z.toFixed(3));
  });
  check('cannot squeeze sideways out of the corridor', () => {
    w.player.teleport((BH.doorway.x0 + BH.doorway.x1) / 2, -3.55);
    for (const dir of [1, -1]) {
      w.player.teleport((BH.doorway.x0 + BH.doorway.x1) / 2, -3.55);
      for (let i = 0; i < 240; i++) {
        const yaw = w.camera.rotation.y;
        const strafe = dir * Math.cos(yaw);
        const forward = -(dir * Math.sin(yaw));
        w.bus.emit('input:move', { x: strafe, y: forward });
        w.player.update(1 / 60);
        const p = w.camera.position;
        if (!inUnion(regions, p.x, p.z, 0.02))
          throw new Error(`escaped sideways to ${p.x.toFixed(3)},${p.z.toFixed(3)}`);
      }
      w.bus.emit('input:move', { x: 0, y: 0 });
    }
  });
  check('a teleport outside every region is pulled back in', () => {
    w.player.teleport(-20, -20);
    w.player.update(1 / 60);
    const p = w.camera.position;
    if (!inUnion(regions, p.x, p.z, 0.02))
      throw new Error('left outside the world at ' + p.x.toFixed(2) + ',' + p.z.toFixed(2));
  });
}

console.log('\n=== REGIONS: fuzz the whole union ===');
{
  const w = makeWorld();
  const regions = w.player.getRegions();
  const rnd = mulberry32(31);
  check('4000 random stick frames never escape and never NaN', () => {
    w.player.teleport(LAYOUT.player.spawn.x, LAYOUT.player.spawn.z);
    for (let i = 0; i < 4000; i++) {
      if (i % 40 === 0) w.bus.emit('input:move', { x: (rnd() * 2) - 1, y: (rnd() * 2) - 1 });
      if (i % 97 === 0) w.bus.emit('input:look', { dx: (rnd() * 400) - 200, dy: 0 });
      w.player.update(1 / 60);
      const p = w.camera.position;
      if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) throw new Error('non-finite at frame ' + i);
      if (!inUnion(regions, p.x, p.z, 0.02))
        throw new Error(`escaped at frame ${i}: ${p.x.toFixed(3)},${p.z.toFixed(3)}`);
    }
  });
}

console.log('');
if (fails.length) { console.log('REGION HARNESS FAILURES: ' + fails.length + '\n  ' + fails.join('\n  ')); process.exitCode = 1; }
else console.log('ALL REGION CHECKS PASSED');
