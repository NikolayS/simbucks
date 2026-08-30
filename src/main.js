import * as THREE from 'three';
import { LAYOUT } from './core/layout.js';
import { createBus } from './core/bus.js';
import { mulberry32 } from './core/rng.js';

const errEl = document.getElementById('err');
const problems = [];
window.__simbucksError = (msg) => report('runtime', msg);
function report(where, e) {
  const line = `[${where}] ${e && e.stack ? e.stack : e}`;
  problems.push(line);
  console.error(line);
  if (new URLSearchParams(location.search).has('debug')) {
    errEl.style.display = 'block';
    errEl.textContent = problems.join('\n\n');
  }
}
// Import a module without letting one bad file kill the whole app.
async function soft(path) {
  try { return await import(path); }
  catch (e) { report(path, e); return {}; }
}
function guard(where, fn, fallback) {
  try { return fn(); } catch (e) { report(where, e); return fallback; }
}

const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
const coarse = matchMedia?.('(pointer: coarse)')?.matches || navigator.maxTouchPoints > 0;
renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = !coarse; // shadows are the first thing to cost a phone its frame rate
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xBFC4C9);
scene.fog = new THREE.Fog(0xC9CDD2, 26, 62);

const camera = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, 0.05, 220);
camera.position.set(LAYOUT.player.spawn.x, LAYOUT.player.eye, LAYOUT.player.spawn.z);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  ctx?.pipeline?.resize?.(innerWidth, innerHeight);
});

const [tex, materials, audio, terminal, props, kiosk, equipment, people, menu, orders,
       customers, gstate, controls, hands, stations, hud, renderMod] = await Promise.all([
  soft('./gfx/textures.js'), soft('./gfx/materials.js'), soft('./gfx/audio.js'),
  soft('./world/terminal.js'), soft('./world/props.js'),
  soft('./world/kiosk.js'), soft('./world/equipment.js'),
  soft('./entities/people.js'),
  soft('./game/menu.js'), soft('./game/orders.js'), soft('./game/customers.js'), soft('./game/state.js'),
  soft('./player/controls.js'), soft('./player/hands.js'), soft('./game/stations.js'),
  soft('./ui/hud.js'), soft('./gfx/render.js'),
]);

const ctx = {
  THREE, scene, camera, renderer,
  tex, mat: materials, audio, hud,
  bus: createBus(),
  rng: mulberry32(0xB4157A),
  layout: LAYOUT,
  menu, orders,
  state: guard('state.create', () => gstate.createState?.() ?? {}, {}),
  problems,
};
window.SIMBUCKS = ctx;

guard('materials.init', () => materials.initMaterials?.(ctx));
guard('audio.init', () => audio.initAudio?.(ctx));
guard('hud.init', () => hud.initHUD?.(ctx));

const colliders = [];
const interactables = [];
const updatables = [];

function mount(where, built) {
  if (!built) return;
  if (built.group) scene.add(built.group);
  if (built.colliders) colliders.push(...built.colliders);
  if (built.interactables) interactables.push(...built.interactables);
  if (typeof built.update === 'function') updatables.push(built.update.bind(built));
}

mount('lighting', guard('terminal.lighting', () => terminal.buildLighting?.(ctx)));
mount('terminal', guard('terminal', () => terminal.buildTerminal?.(ctx)));
mount('props', guard('props', () => props.buildProps?.(ctx)));
mount('kiosk', guard('kiosk', () => kiosk.buildKiosk?.(ctx)));
mount('equipment', guard('equipment', () => equipment.buildEquipment?.(ctx)));
mount('crowd', guard('people.crowd', () => people.buildCrowd?.(ctx)));
mount('baristas', guard('people.baristas', () => people.buildBaristaNPCs?.(ctx)));

function sceneHas(test) {
  let found = false;
  scene.traverse(o => { if (!found && test(o)) found = true; });
  return found;
}
// These must recurse: builders return Groups, so a top-level check never sees
// the lights or the floor inside them and the fallbacks get added on top.
if (!sceneHas(o => o.isLight)) {
  const hemi = new THREE.HemisphereLight(0xFFF6E8, 0x8C7F70, 2.1);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xFFFFFF, 1.1);
  dir.position.set(6, 12, 8);
  scene.add(dir);
}
if (!sceneHas(o => o.userData?.isFloor)) {
  const f = new THREE.Mesh(new THREE.PlaneGeometry(68, 60),
    new THREE.MeshStandardMaterial({ color: LAYOUT.palette.floor, roughness: 0.55 }));
  f.rotation.x = -Math.PI / 2; f.receiveShadow = true; f.userData.isFloor = true;
  scene.add(f);
}

const player = guard('player', () => controls.createPlayer?.(ctx, colliders), null);
ctx.player = player;
if (player?.object) scene.add(player.object);

const heldHands = guard('hands', () => hands.createHands?.(ctx), null);
if (heldHands?.group) camera.add(heldHands.group);
scene.add(camera);

const stationBrain = guard('stations', () => stations.createStations?.(ctx), null);
guard('stations.register', () => stationBrain?.register?.(interactables));
ctx.interactables = interactables;

mount('customers', guard('customers', () => customers.buildCustomers?.(ctx)));

// Fallback camera control so the scene is always inspectable, even mid-build.
if (!player) {
  let yaw = 0, pitch = 0, drag = false;
  const keys = new Set();
  addEventListener('keydown', e => keys.add(e.code));
  addEventListener('keyup', e => keys.delete(e.code));
  renderer.domElement.addEventListener('mousedown', () => drag = true);
  addEventListener('mouseup', () => drag = false);
  addEventListener('mousemove', e => {
    if (!drag) return;
    yaw -= e.movementX * 0.0026; pitch -= e.movementY * 0.0026;
    pitch = Math.max(-1.4, Math.min(1.4, pitch));
  });
  updatables.push((dt) => {
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    const s = (keys.has('ShiftLeft') ? 9 : 3.4) * dt;
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    if (keys.has('KeyW')) camera.position.addScaledVector(fwd, s);
    if (keys.has('KeyS')) camera.position.addScaledVector(fwd, -s);
    if (keys.has('KeyA')) camera.position.addScaledVector(right, -s);
    if (keys.has('KeyD')) camera.position.addScaledVector(right, s);
    if (keys.has('KeyQ')) camera.position.y -= s;
    if (keys.has('KeyE')) camera.position.y += s;
  });
}

// Environment map first: metals need something to reflect before they read as
// metal at all. Then the post chain. Either may fail without blanking the game.
const envMap = guard('render.environment', () => renderMod.buildEnvironment?.(ctx), null);
if (envMap) scene.environment = envMap;
const pipeline = guard('render.pipeline', () => renderMod.createRenderPipeline?.(ctx), null);
ctx.pipeline = pipeline;
const draw = () => {
  if (pipeline?.render) { try { return pipeline.render(); } catch (e) { report('pipeline.render', e); ctx.pipeline = null; } }
  renderer.render(scene, camera);
};

// The shift must not begin until the player dismisses the title card, or the
// clock (and the queue) runs while they are still reading the controls.
const beginShift = () => guard('state.start', () => gstate.startShift?.(ctx));
if (typeof hud.showTitle === 'function') guard('hud.showTitle', () => hud.showTitle(beginShift));
else beginShift();

document.getElementById('boot').style.display = 'none';

const clock = new THREE.Clock();
let acc = 0, frames = 0;

function frame(dt, t) {
  guard('player.update', () => player?.update?.(dt));
  guard('hands.update', () => heldHands?.update?.(dt));
  guard('stations.update', () => stationBrain?.update?.(dt));
  guard('state.update', () => gstate.updateState?.(ctx, dt));
  for (const u of updatables) { try { u(dt, t); } catch (e) { report('update', e); } }
}

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  frame(dt, clock.elapsedTime);
  draw();
  acc += dt; frames++;
  if (acc > 1) { ctx.fps = Math.round(frames / acc); acc = 0; frames = 0; }
});

// Advance the simulation deterministically, independent of requestAnimationFrame.
// Lets a test drive a whole shift in a throttled or hidden tab.
let stepT = 0;
ctx.step = (steps = 1, dt = 1 / 60) => {
  for (let i = 0; i < steps; i++) { stepT += dt; frame(dt, stepT); }
  draw();
  return { steps, simulated: +(steps * dt).toFixed(2) };
};

console.log('[simbucks] booted', {
  objects: scene.children.length, colliders: colliders.length,
  interactables: interactables.map(i => i.id), problems: problems.length,
});
