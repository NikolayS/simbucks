// Forgiving aim must fall back to a small ray ring without weakening centre priority.
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
camera.position.set(0, LAYOUT.player.eye, -0.6);
const scene = new THREE.Scene();
const bus = createBus();
const ctx = {
  THREE, scene, camera, renderer: { domElement: canvas },
  tex: {}, mat: { get: () => new THREE.MeshStandardMaterial() }, audio: { play() {} },
  bus, rng: mulberry32(3), layout: LAYOUT, state: {}, interactables: [],
  hud: { setPrompt() {}, setMeter() {}, toast() {}, setTickets() {}, setStats() {} },
  menu: {}, orders: {},
};
const player = createPlayer(ctx, []); ctx.player = player;
scene.add(player.object); scene.add(camera);
document.pointerLockElement = canvas; document.dispatchEvent({ type: 'pointerlockchange' });

const boxGeometry = new THREE.BoxGeometry(0.296, 0.12, 0.08);
const boxMaterial = new THREE.MeshBasicMaterial();
const forward = new THREE.Vector3();
const bounds = new THREE.Box3();
const centre = new THREE.Vector3();
let current = [];

function station(id, object) {
  return { id, kind: 'station', label: id, object, hint: '', hold: false };
}
function placeAhead(group, dist) {
  camera.getWorldDirection(forward);
  group.position.copy(camera.position).addScaledVector(forward, dist);
  return group;
}
function hollow(id, dist) {
  const group = placeAhead(new THREE.Group(), dist);
  for (const x of [-0.16, 0.16]) {
    const box = new THREE.Mesh(boxGeometry, boxMaterial);
    box.position.x = x;
    group.add(box);
  }
  group.name = id;
  return station(id, group);
}
function solid(id, dist) {
  const group = placeAhead(new THREE.Group(), dist);
  group.add(new THREE.Mesh(boxGeometry, boxMaterial));
  group.name = id;
  return station(id, group);
}
function frames(n) { for (let i = 0; i < n; i++) player.update(1 / 60); }
function rebuildTargets(entries) {
  for (const entry of current) scene.remove(entry.object);
  current = entries;
  for (const entry of current) scene.add(entry.object);
  ctx.interactables = entries;
  scene.updateMatrixWorld(true);
}
function worldCentre(entry, out = centre) {
  scene.updateMatrixWorld(true);
  return bounds.setFromObject(entry.object).getCenter(out);
}
function aimAt(entry) {
  camera.lookAt(worldCentre(entry));
  scene.updateMatrixWorld(true);
}
function moveCentreToNdc(entry, x, y) {
  const from = worldCentre(entry, new THREE.Vector3());
  const projected = from.clone().project(camera);
  const to = new THREE.Vector3(x, y, projected.z).unproject(camera);
  entry.object.position.add(to.sub(from));
  scene.updateMatrixWorld(true);
}
function centreHitCount(entry) {
  scene.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster();
  raycaster.far = 2.4;
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  return raycaster.intersectObject(entry.object, true).length;
}
function ringHitCount(entry) {
  scene.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster();
  raycaster.near = 0.05;
  raycaster.far = 2.4;
  const ndc = new THREE.Vector2();
  let hits = 0;
  for (let i = 0; i < 12; i++) {
    const angle = i * Math.PI * 2 / 12;
    ndc.set(Math.cos(angle) * 0.06 / camera.aspect, Math.sin(angle) * 0.06);
    raycaster.setFromCamera(ndc, camera);
    hits += raycaster.intersectObject(entry.object, true).length;
  }
  return hits;
}

const problems = [];
function check(number, label, test) {
  try {
    const detail = test();
    console.log(`  ok   ${number}. ${label}${detail ? ` (${detail})` : ''}`);
  } catch (error) {
    const detail = error?.message || String(error);
    problems.push(`${number}. ${label}: ${detail}`);
    console.log(`  FAIL ${number}. ${label}: ${detail}`);
  }
}
function expect(condition, message) { if (!condition) throw new Error(message); }

check(1, 'hollow targets are acquired by the fallback ring at every distance', () => {
  const seen = [];
  for (const dist of [0.5, 0.7, 1.0, 1.4]) {
    const target = hollow(`hollow-${dist}`, dist);
    rebuildTargets([target]);
    aimAt(target);
    const centreHits = centreHitCount(target);
    expect(centreHits === 0, `${dist}m centre-only ray got ${centreHits} hits`);
    frames(6);
    const held = player.getHeldTargetId();
    expect(held === target.id, `${dist}m returned ${JSON.stringify(held)}`);
    seen.push(`${dist}m`);
  }
  return seen.join(', ');
});

check(2, 'solid targets are acquired dead centre at every distance', () => {
  const seen = [];
  for (const dist of [0.5, 0.7, 1.0, 1.4]) {
    const target = solid(`solid-${dist}`, dist);
    rebuildTargets([target]);
    aimAt(target);
    frames(6);
    const held = player.getHeldTargetId();
    expect(held === target.id, `${dist}m returned ${JSON.stringify(held)}`);
    seen.push(`${dist}m`);
  }
  return seen.join(', ');
});

check(3, 'a solid target about 0.5 NDC off-centre is not acquired', () => {
  const target = solid('solid-off-centre', 1.0);
  rebuildTargets([target]);
  moveCentreToNdc(target, 0.5, 0);
  const ndcX = worldCentre(target, new THREE.Vector3()).project(camera).x;
  frames(6);
  const held = player.getHeldTargetId();
  expect(Math.abs(ndcX - 0.5) < 0.01, `target projected to NDC x=${ndcX}`);
  expect(held === null, `returned ${JSON.stringify(held)}`);
  return `NDC x=${ndcX.toFixed(3)}`;
});

check(4, 'a solid target at 3.0m is beyond the 2.4m ray limit', () => {
  const target = solid('solid-too-far', 3.0);
  rebuildTargets([target]);
  aimAt(target);
  frames(6);
  const held = player.getHeldTargetId();
  expect(held === null, `returned ${JSON.stringify(held)}`);
});

check(5, 'the nearer of two ring-only hollow targets wins', () => {
  const near = hollow('hollow-near', 0.8);
  const far = hollow('hollow-far', 1.5);
  rebuildTargets([far, near]);
  aimAt(near);
  expect(centreHitCount(near) === 0 && centreHitCount(far) === 0, 'a centre ray hit a hollow target');
  expect(ringHitCount(near) > 0 && ringHitCount(far) > 0, 'a hollow target was not ring-reachable');
  frames(6);
  const held = player.getHeldTargetId();
  expect(held === near.id, `returned ${JSON.stringify(held)}`);
});

check(6, 'an invisible hollow group is not acquired', () => {
  const target = hollow('hollow-hidden', 0.8);
  target.object.visible = false;
  rebuildTargets([target]);
  aimAt(target);
  frames(6);
  const held = player.getHeldTargetId();
  expect(held === null, `returned ${JSON.stringify(held)}`);
});

check(7, 'a dead-centre solid target beats a nearer off-axis ring target', () => {
  const centreTarget = solid('solid-centre', 1.8);
  const ringTarget = hollow('hollow-nearer-ring', 0.8);
  rebuildTargets([ringTarget, centreTarget]);
  moveCentreToNdc(ringTarget, 0, 0.05);
  aimAt(centreTarget);
  const projected = worldCentre(ringTarget, new THREE.Vector3()).project(camera);
  expect(projected.y > 0 && projected.y < 0.06, `hollow target projected to NDC y=${projected.y}`);
  expect(centreHitCount(ringTarget) === 0, 'centre ray hit the hollow target');
  expect(ringHitCount(ringTarget) > 0, 'off-axis hollow target was not ring-reachable');
  frames(6);
  const held = player.getHeldTargetId();
  expect(held === centreTarget.id, `returned ${JSON.stringify(held)}`);
});

process.exit(problems.length ? 1 : 0);
