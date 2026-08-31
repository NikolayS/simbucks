// Forgiving aim must rescue hollow stations without weakening centre-screen authority.
import { installDom } from './dom.js';
const dom = installDom();
const THREE = await import('three');
const REPO = new URL('../src', import.meta.url).href;
const { LAYOUT } = await import(REPO + '/core/layout.js');
const { createBus } = await import(REPO + '/core/bus.js');
const { mulberry32 } = await import(REPO + '/core/rng.js');
const { createPlayer } = await import(REPO + '/player/controls.js');

const canvas = dom.makeElement('canvas');
const camera = new THREE.PerspectiveCamera(66, 16 / 9, 0.05, 220);
camera.position.set(LAYOUT.player.spawn.x, LAYOUT.player.eye, LAYOUT.player.spawn.z);
const scene = new THREE.Scene();
const bus = createBus();
const ctx = {
  THREE, scene, camera, renderer: { domElement: canvas },
  tex: {}, mat: { get: () => new THREE.MeshStandardMaterial() }, audio: { play() {} },
  bus, rng: mulberry32(3), layout: LAYOUT, state: {},
  hud: { setPrompt() {}, setMeter() {}, toast() {}, setTickets() {}, setStats() {} },
  menu: {}, orders: {}, interactables: [],
};
const player = createPlayer(ctx, []); ctx.player = player; scene.add(player.object); scene.add(camera);
document.pointerLockElement = canvas; document.dispatchEvent({ type: 'pointerlockchange' });

function frames(n) { for (let i = 0; i < n; i++) player.update(1/60); }

const problems = [];
function check(label, passed, detail = '') {
  console.log(`  ${passed ? 'ok  ' : 'FAIL'} ${label}${detail ? `: ${detail}` : ''}`);
  if (!passed) problems.push(`${label}${detail ? `: ${detail}` : ''}`);
}

const targetMaterial = new THREE.MeshBasicMaterial();
function station(id, object) {
  object.name = id;
  return { id, kind: 'station', label: id, object, hint: '', hold: false };
}
function hollowTarget(id) {
  const group = new THREE.Group();
  const geometry = new THREE.BoxGeometry(0.055, 0.07, 0.08);
  const left = new THREE.Mesh(geometry, targetMaterial);
  const right = new THREE.Mesh(geometry, targetMaterial);
  left.position.x = -0.0425;
  right.position.x = 0.0425;
  group.add(left, right);
  return station(id, group);
}
function solidTarget(id) {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.08), targetMaterial));
  return station(id, group);
}

let activeTargets = [];
function replaceTargets(...targets) {
  for (const target of activeTargets) scene.remove(target.object);
  activeTargets = targets;
  for (const target of targets) scene.add(target.object);
  ctx.interactables = targets;
  scene.updateMatrixWorld(true);
}

const cameraPosition = new THREE.Vector3();
const cameraForward = new THREE.Vector3();
const targetCenter = new THREE.Vector3();
const rayDirection = new THREE.Vector3();
const targetBox = new THREE.Box3();
function bboxCenter(target, out = targetCenter) {
  scene.updateMatrixWorld(true);
  return targetBox.setFromObject(target.object).getCenter(out);
}
function aimAtBBox(target) {
  const center = bboxCenter(target);
  camera.lookAt(center);
  camera.updateMatrixWorld(true);
  scene.updateMatrixWorld(true);
  return center;
}
function placeAhead(target, distance) {
  camera.getWorldPosition(cameraPosition);
  camera.getWorldDirection(cameraForward);
  target.object.position.copy(cameraPosition).addScaledVector(cameraForward, distance);
  scene.updateMatrixWorld(true);
  aimAtBBox(target);
}
function placeAtNdc(target, distance, x, y = 0) {
  camera.getWorldPosition(cameraPosition);
  rayDirection.set(x, y, 0.5).unproject(camera).sub(cameraPosition).normalize();
  target.object.position.copy(cameraPosition).addScaledVector(rayDirection, distance);
  scene.updateMatrixWorld(true);
}
function centreHits(target) {
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster();
  raycaster.far = 2.4;
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  return raycaster.intersectObject(target.object, true);
}
function acquired(id) { return player.getHeldTargetId() === id; }

frames(6);
const distances = [0.5, 0.7, 1.0, 1.4];

console.log('\n1. Hollow targets are rescued by the aim ring');
for (const distance of distances) {
  const target = hollowTarget(`hollow-${distance}`);
  replaceTargets(target);
  placeAhead(target, distance);
  const hits = centreHits(target);
  check(`plain centre ray misses hollow target at ${distance.toFixed(1)} m`, hits.length === 0,
    `${hits.length} hit(s)`);
  frames(6);
  check(`aim ring acquires hollow target at ${distance.toFixed(1)} m`, acquired(target.id),
    `target=${JSON.stringify(player.getHeldTargetId())}`);
}

console.log('\n2. Solid centre targets keep the fast path');
for (const distance of distances) {
  const target = solidTarget(`solid-${distance}`);
  replaceTargets(target);
  placeAhead(target, distance);
  frames(6);
  check(`solid target is acquired at ${distance.toFixed(1)} m`, acquired(target.id),
    `target=${JSON.stringify(player.getHeldTargetId())}`);
}

console.log('\n3. The ring does not reach far off-axis');
{
  const target = solidTarget('off-axis');
  replaceTargets(target);
  placeAtNdc(target, 1.0, 0.5);
  const projected = bboxCenter(target, new THREE.Vector3()).project(camera);
  frames(6);
  check('far off-axis target is not acquired', player.getHeldTargetId() === null,
    `bbox NDC x=${projected.x.toFixed(3)}, target=${JSON.stringify(player.getHeldTargetId())}`);
}

console.log('\n4. Reach remains capped');
{
  const target = solidTarget('beyond-reach');
  replaceTargets(target);
  placeAhead(target, 3.0);
  frames(6);
  check('solid target at 3.0 m is not acquired', player.getHeldTargetId() === null,
    `target=${JSON.stringify(player.getHeldTargetId())}`);
}

console.log('\n5. The nearest resolved ring hit wins');
{
  const near = hollowTarget('hollow-near');
  const far = hollowTarget('hollow-far');
  replaceTargets(near, far);
  placeAhead(near, 0.8);
  placeAhead(far, 1.5);
  check('plain centre ray misses both hollow targets', centreHits(near).length === 0 && centreHits(far).length === 0);
  frames(6);
  check('nearer hollow target wins', acquired(near.id),
    `target=${JSON.stringify(player.getHeldTargetId())}`);
}

console.log('\n6. Invisible ancestors remain untargetable');
{
  const target = hollowTarget('hidden-hollow');
  replaceTargets(target);
  placeAhead(target, 1.0);
  target.object.visible = false;
  scene.updateMatrixWorld(true);
  frames(6);
  check('hidden hollow target is not acquired', player.getHeldTargetId() === null,
    `target=${JSON.stringify(player.getHeldTargetId())}`);
}

console.log('\n7. The centre ray has authority over the ring');
{
  const centre = solidTarget('centre-solid');
  const ring = hollowTarget('near-ring-hollow');
  replaceTargets(centre, ring);
  placeAhead(centre, 1.8);
  placeAtNdc(ring, 0.8, 0.012);
  frames(6);
  check('centre target beats a nearer ring target', acquired(centre.id),
    `target=${JSON.stringify(player.getHeldTargetId())}`);
}

console.log('\n' + (problems.length ? `FAIL\n  ${problems.join('\n  ')}` : 'forgiving aim ring: ok'));
process.exit(problems.length ? 1 : 0);
