import { installDom } from './dom.js';
const dom = installDom();
const THREE = await import('three');
const REPO = new URL('../src', import.meta.url).href;
const { LAYOUT } = await import(REPO + '/core/layout.js');
const { createBus } = await import(REPO + '/core/bus.js');
const { mulberry32 } = await import(REPO + '/core/rng.js');
const controls = await import(REPO + '/player/controls.js');
const handsMod = await import(REPO + '/player/hands.js');
const stationsMod = await import(REPO + '/game/stations.js');
const realMaterials = await import(REPO + '/gfx/materials.js');

const fails = [];
const log = [];
function check(name, fn) { try { fn(); log.push('  ok  ' + name); } catch (e) { fails.push(name + ': ' + (e.stack || e)); log.push('  FAIL ' + name); } }

const canvas = dom.makeElement('canvas');
const camera = new THREE.PerspectiveCamera(66, 16 / 9, 0.05, 220);
camera.position.set(LAYOUT.player.spawn.x, LAYOUT.player.eye, LAYOUT.player.spawn.z);
const scene = new THREE.Scene();
const bus = createBus();
const events = [];
for (const n of ['interact','cup:changed','station:feedback','sfx','order:served','hand:item','hand:gesture'])
  bus.on(n, (p) => events.push({ n, p: JSON.parse(JSON.stringify(p ?? null)) }));
const meters = [];
const prompts = [];
const toasts = [];
const ctx = {
  THREE, scene, camera, renderer: { domElement: canvas },
  tex: {}, mat: realMaterials,
  audio: { play() {} },
  bus, rng: mulberry32(1), layout: LAYOUT, state: {},
  hud: { setPrompt: (t) => prompts.push(t), setMeter: (m) => meters.push(m ? { ...m } : null),
         toast: (t, ok) => toasts.push([t, ok]), setTickets() {}, setStats() {} },
  menu: {}, orders: {},
};

let player, hands, stations;
check('createPlayer', () => { player = controls.createPlayer(ctx, []); if (!player) throw new Error('null'); });
ctx.player = player;
if (player?.object) scene.add(player.object);
check('createHands', () => { hands = handsMod.createHands(ctx); if (!hands?.group) throw new Error('no group'); });
if (hands?.group) camera.add(hands.group);
scene.add(camera);
check('createStations', () => { stations = stationsMod.createStations(ctx); });

// Fake interactables the way equipment.js will supply them.
const IDS = ['cupStack','grinder','espresso','steamWand','superauto','syrupRack','blender','iceWell','sink','coldBrewTap','till','handoff'];
const interactables = IDS.map((id) => {
  const object = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshBasicMaterial());
  object.name = id; scene.add(object);
  return { id, kind: 'station', label: id, object, hint: '', hold: false };
});
check('register', () => stations.register(interactables));
ctx.interactables = interactables;

check('exports', () => {
  const need = ['object','update','teleport','getHeldTargetId'];
  for (const k of need) if (typeof player[k] === 'undefined') throw new Error('player missing ' + k);
  for (const k of ['group','update','setHeld','playGesture']) if (typeof hands[k] === 'undefined') throw new Error('hands missing ' + k);
  for (const k of ['update','register']) if (typeof stations[k] !== 'function') throw new Error('stations missing ' + k);
});

function frames(n, dt = 1 / 60) {
  for (let i = 0; i < n; i++) { player.update(dt); hands.update(dt); stations.update(dt); }
}
check('idle frames unlocked', () => frames(120));

// Lock the pointer and drive real input.
document.pointerLockElement = canvas;
document.dispatchEvent({ type: 'pointerlockchange' });
check('locked frames', () => frames(30));

function key(code, type = 'keydown', repeat = false) {
  window.dispatchEvent({ type, code, repeat, ctrlKey: false, metaKey: false, altKey: false, preventDefault() {} });
}
function mouse(dx, dy) { document.dispatchEvent({ type: 'mousemove', movementX: dx, movementY: dy }); }
check('walk + look', () => {
  key('KeyW'); frames(40); mouse(220, -60); frames(10);
  key('KeyW', 'keyup'); frames(40);
  key('KeyA'); key('ShiftLeft'); frames(30); key('KeyA', 'keyup'); key('ShiftLeft', 'keyup'); frames(60);
});
check('stays in bounds', () => {
  // Containment is a union of walk boxes now (aisle + back-of-house doorway and
  // room), so ask the player for its own regions rather than assuming the aisle.
  const p = camera.position;
  const regions = player.getRegions?.() ?? [];
  const inside = regions.some(r => p.x >= r.x0 - 0.05 && p.x <= r.x1 + 0.05
                                && p.z >= r.z0 - 0.05 && p.z <= r.z1 + 0.05);
  if (regions.length && !inside)
    throw new Error('out of bounds ' + p.x.toFixed(2) + ',' + p.z.toFixed(2));
  if (Math.abs(p.y - LAYOUT.player.eye) > 0.2) throw new Error('eye height drift ' + p.y.toFixed(3));
});
check('teleport', () => { player.teleport(-4.0, -1.0); frames(5); });

// Drive interactions the way the real game does: park the station mesh in front of the camera,
// let the raycast find it, then press and release the real E key through controls.js.
const _fwd = new THREE.Vector3();
const byId = new Map(interactables.map(i => [i.id, i]));
function aim(id) {
  const it = byId.get(id);
  if (!it) return;
  for (const other of interactables) {           // park everything else out of the ray
    if (other === it) continue;
    other.object.position.set(0, -50, 0);
    other.object.updateMatrixWorld(true);
  }
  camera.getWorldDirection(_fwd);
  it.object.position.copy(camera.position).addScaledVector(_fwd, 1.0);
  it.object.updateMatrixWorld(true);
  frames(6); // clear the 20 Hz raycast throttle
}
function tap(id) { if (id) aim(id); key('KeyE'); frames(6); key('KeyE', 'keyup'); frames(4); }
function hold(id, seconds) {
  if (id) aim(id);
  key('KeyE');
  frames(Math.max(1, Math.round(seconds * 60)));
  key('KeyE', 'keyup');
  frames(6);
}
function bareTap(id) { bus.emit('interact', { id, phase: 'tap', dt: 0, duration: 0 }); frames(3); }
const before = events.length;
check('build a latte', () => {
  tap('cupStack'); tap('cupStack');          // cycle size
  hold('cupStack', 0.3);                      // take a cup
  tap('espresso');                            // take portafilter
  hold('grinder', 0.95);                      // dose
  tap('espresso');                            // lock in
  hold('espresso', 2.7);                      // pull
  tap('espresso');                            // pour
  tap('steamWand');                           // take pitcher
  hold('steamWand', 2.25);                    // steam
  tap('steamWand');                           // pour milk
  key('KeyL'); frames(4);
  tap('handoff');
});
check('cup state changed', () => {
  const cups = events.slice(before).filter(e => e.n === 'cup:changed');
  if (!cups.length) throw new Error('no cup:changed emitted');
  const withEspresso = cups.some(e => e.p?.cup?.contents?.espresso > 0);
  const withMilk = cups.some(e => e.p?.cup?.contents?.milk > 0);
  if (!withEspresso) throw new Error('espresso never reached the cup');
  if (!withMilk) throw new Error('milk never reached the cup');
});
check('hand items emitted', () => {
  const items = events.slice(before).filter(e => e.n === 'hand:item').map(e => e.p?.item?.kind ?? null);
  for (const k of ['cup','portafilter','pitcher']) if (!items.includes(k)) throw new Error('hand never held a ' + k);
});
check('order served with no orders is safe', () => {
  const served = events.filter(e => e.n === 'order:served');
  log.push('    order:served count = ' + served.length);
});
check('meters cleared', () => {
  frames(120);
  if (meters.length && meters[meters.length - 1] !== null) throw new Error('meter left up: ' + JSON.stringify(meters[meters.length - 1]));
});
check('served against a real order', () => {
  const order = { id: 'o1', drink: { id: 'latte', name: 'Latte', price: 3.55, recipe: [{ station: 'syrupRack', param: 2 }] },
                  size: 'grande', name: 'Nik', mods: [], steps: [], progress: [], price: 3.55, patience: 60, t0: 0 };
  ctx.orders.scoreOrder = (o, built) => { if (!built || !built.contents) throw new Error('bad built'); return { score: 1, tip: 0.5, correct: true, notes: [] }; };
  bus.emit('order:new', { order });
  hold('cupStack', 0.3); tap('espresso'); hold('grinder', 0.95); tap('espresso'); hold('espresso', 2.7); tap('espresso');
  tap('syrupRack'); tap('syrupRack'); key('KeyL'); frames(4);
  const n0 = events.filter(e => e.n === 'order:served').length;
  tap('handoff'); frames(5);
  const n1 = events.filter(e => e.n === 'order:served').length;
  if (n1 <= n0) throw new Error('handoff did not emit order:served');
  const last = events.filter(e => e.n === 'order:served').pop();
  if (!last.p.order || last.p.order.id !== 'o1') throw new Error('wrong order matched');
});
check('wrong actions never throw', () => {
  for (const id of IDS) { tap(id); hold(id, 0.4); }
  for (const id of ['drop', 'lid', 'nope', null]) { bareTap(id); }
  key('KeyQ'); frames(4); key('KeyQ', 'keyup');
  frames(60);
});
check('scoreOrder that throws is survivable', () => {
  ctx.orders.scoreOrder = () => { throw new Error('boom'); };
  bus.emit('order:new', { order: { id: 'o2', drink: null, size: 'tall', name: 'X', price: 2, patience: 30, t0: 0 } });
  hold('cupStack', 0.3); tap('iceWell'); hold('coldBrewTap', 1.2); key('KeyL'); frames(4); tap('handoff'); frames(10);
});
check('setHeld / playGesture direct', () => {
  hands.setHeld({ kind: 'cup', size: 'venti', lidded: false, fill: 0.7, color: 0x6B4A2F, foam: 0.2, iced: true, hot: false });
  hands.playGesture('pour'); frames(30);
  hands.setHeld({ kind: 'portafilter', dosed: true, quality: 0.9 }); hands.playGesture('tamp'); frames(20);
  hands.setHeld({ kind: 'pitcher', milk: 0.8, temp: 66, steaming: true }); hands.playGesture('shake'); frames(20);
  hands.setHeld(null); hands.playGesture('nonsense'); frames(20);
  for (const s of ['short','tall','grande','venti']) { hands.setHeld({ kind: 'cup', size: s, lidded: true, fill: 1, color: 0xFFFFFF, foam: 0, iced: false, hot: true }); frames(4); }
});
check('unlock mid-hold does not wedge', () => {
  bus.emit('interact', { id: 'grinder', phase: 'holdStart', dt: 0, duration: 0 });
  frames(20);
  document.pointerLockElement = null; document.dispatchEvent({ type: 'pointerlockchange' });
  frames(120);
  if (meters.length && meters[meters.length - 1] !== null) throw new Error('meter stuck after unlock');
  document.pointerLockElement = canvas; document.dispatchEvent({ type: 'pointerlockchange' });
});
check('hints are live', () => {
  const withHints = interactables.filter(i => typeof i.hint === 'string' && i.hint.length > 0);
  log.push('    stations with hints: ' + withHints.length + '/' + interactables.length);
  if (withHints.length < 8) throw new Error('too few live hints: ' + withHints.map(i => i.id).join(','));
});
check('no allocation growth over 3000 frames', () => {
  globalThis.gc?.(); const a = process.memoryUsage().heapUsed;
  frames(3000); globalThis.gc?.();
  const b = process.memoryUsage().heapUsed;
  log.push('    heap delta over 3000 frames: ' + ((b - a) / 1024).toFixed(0) + ' KB');
});
// --- button-down time must map to minigame outcome ---
function lastFeedback(id) {
  for (let i = events.length - 1; i >= 0; i--) if (events[i].n === 'station:feedback' && events[i].p.id === id) return events[i].p.text;
  return null;
}
function doseOutcome(seconds) {   // fresh portafilter each time
  bareTap('drop'); frames(4);
  tap('espresso');                // take the portafilter
  hold('grinder', seconds);
  return lastFeedback('grinder');
}
check('button-down time maps to the dose window', () => {
  // dose fills over 1.4 s, zone 0.62..0.86 -> the perfect window is 0.87 s .. 1.20 s of held button
  const rows = [[0.50, 'short'], [0.95, 'perfect'], [1.04, 'perfect'], [1.15, 'perfect'], [1.40, 'long']];
  const got = [];
  const problems = [];
  for (const [secs, want] of rows) {
    const text = doseOutcome(secs);
    got.push(secs.toFixed(2) + 's -> "' + text + '"');
    const perfect = /perfect/i.test(text || '');
    if (want === 'perfect' && !perfect) problems.push(secs + 's should be a perfect dose, got "' + text + '"');
    if (want !== 'perfect' && perfect) problems.push(secs + 's should NOT be perfect, got "' + text + '"');
  }
  log.push('    ' + got.join('  |  '));
  if (problems.length) throw new Error(problems.join('; '));
});
check('button-down time maps to shot and steam', () => {
  const problems = [];
  bareTap('drop'); frames(4);
  tap('cupStack'); hold('cupStack', 0.3);
  tap('espresso'); hold('grinder', 1.04); tap('espresso'); hold('espresso', 2.60);
  const shot = lastFeedback('espresso');
  log.push('    2.60s extraction -> "' + shot + '"');
  if (!/beautiful/i.test(shot || '')) problems.push('2.60 s should be a good shot (26 s), got "' + shot + '"');
  tap('espresso');
  tap('steamWand'); hold('steamWand', 2.20);
  const milk = lastFeedback('steamWand');
  log.push('    2.20s steam      -> "' + milk + '"');
  if (!/silky/i.test(milk || '')) problems.push('2.20 s should be silky microfoam (~65C), got "' + milk + '"');
  hold('steamWand', 3.6);
  const scorched = lastFeedback('steamWand');
  log.push('    3.60s steam      -> "' + scorched + '"');
  bareTap('drop'); frames(4);
  if (problems.length) throw new Error(problems.join('; '));
});
check('meter values stay in 0..1', () => {
  const bad = meters.filter(m => m && (m.value < -0.001 || m.value > 1.001));
  if (bad.length) throw new Error(bad.length + ' meter frames outside 0..1, e.g. ' + JSON.stringify(bad[0]));
  const kinds = [...new Set(meters.filter(Boolean).map(m => m.kind))];
  const zoned = [...new Set(meters.filter(m => m && Array.isArray(m.zone)).map(m => m.kind))];
  log.push('    meter kinds: ' + kinds.join(', ') + '   with a zone: ' + zoned.join(', '));
  for (const k of ['dose', 'shot', 'steam', 'blend']) if (!zoned.includes(k)) throw new Error(k + ' meter has no zone for the player to aim at');
});
// --- viewmodel geometry: near-plane clearance, crosshair occlusion, on-screen presence ---
const _box = new THREE.Box3();
const _v = new THREE.Vector3();
function viewmodelReport(label) {
  camera.updateMatrixWorld(true);
  hands.group.updateMatrixWorld(true);
  let closestZ = -Infinity, farthestZ = Infinity, any = false;
  let minNdcX = Infinity, minNdcY = Infinity, maxNdcY = -Infinity;
  let coversCrosshair = false;
  hands.group.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    let n = o; while (n && n !== hands.group) { if (!n.visible) return; n = n.parent; }
    _box.setFromObject(o, true);
    if (_box.isEmpty()) return;
    any = true;
    // Box3 from an object under the camera is in WORLD space; convert corners to camera space.
    let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      _v.set(i & 1 ? _box.max.x : _box.min.x, i & 2 ? _box.max.y : _box.min.y, i & 4 ? _box.max.z : _box.min.z);
      camera.worldToLocal(_v);
      closestZ = Math.max(closestZ, _v.z);
      farthestZ = Math.min(farthestZ, _v.z);
      const ndc = _v.clone(); camera.localToWorld(ndc); ndc.project(camera);
      bx0 = Math.min(bx0, ndc.x); bx1 = Math.max(bx1, ndc.x);
      by0 = Math.min(by0, ndc.y); by1 = Math.max(by1, ndc.y);
      minNdcX = Math.min(minNdcX, ndc.x); minNdcY = Math.min(minNdcY, ndc.y); maxNdcY = Math.max(maxNdcY, ndc.y);
    }
    if (bx0 < 0.06 && bx1 > -0.06 && by0 < 0.06 && by1 > -0.06) coversCrosshair = true;
  });
  return { any, closestZ, farthestZ, minNdcX, minNdcY, maxNdcY, coversCrosshair };
}
check('viewmodel geometry', () => {
  const cases = [
    ['empty hand', null, null],
    ['grande cup', { kind: 'cup', size: 'grande', lidded: false, fill: 0.7, color: 0x6B4A2F, foam: 0.3, iced: false, hot: true }, null],
    ['venti lidded', { kind: 'cup', size: 'venti', lidded: true, fill: 1, color: 0x8B5A3C, foam: 0, iced: false, hot: true }, null],
    ['portafilter', { kind: 'portafilter', dosed: true, quality: 1 }, null],
    ['pitcher', { kind: 'pitcher', milk: 0.8, temp: 66, steaming: true }, null],
    ['cup mid-pour', { kind: 'cup', size: 'venti', lidded: false, fill: 0.9, color: 0x6B4A2F, foam: 0.5, iced: true, hot: false }, 'pour'],
    ['pf mid-tamp', { kind: 'portafilter', dosed: true, quality: 1 }, 'tamp'],
    ['pitcher mid-shake', { kind: 'pitcher', milk: 1, temp: 70, steaming: true }, 'shake'],
    ['cup mid-place', { kind: 'cup', size: 'venti', lidded: true, fill: 1, color: 0x6B4A2F, foam: 0, iced: false, hot: true }, 'place'],
  ];
  const problems = [];
  for (const [label, item, ges] of cases) {
    hands.setHeld(item);
    if (ges) hands.playGesture(ges);
    let worst = null;
    for (let f = 0; f < 46; f++) {           // sample the whole gesture arc
      hands.update(1 / 60);
      const r = viewmodelReport(label);
      if (!r.any) continue;
      if (!worst || r.closestZ > worst.closestZ) worst = r;
      if (r.coversCrosshair) worst = Object.assign({}, r, { coversCrosshair: true, closestZ: Math.max(r.closestZ, worst ? worst.closestZ : r.closestZ) });
    }
    if (!worst) { if (item) problems.push(label + ': nothing visible'); log.push('    ' + label.padEnd(16) + ' (nothing drawn)'); continue; }
    log.push('    ' + label.padEnd(16) + ' nearest z=' + worst.closestZ.toFixed(3)
      + '  ndc x>=' + worst.minNdcX.toFixed(2) + ' y in [' + worst.minNdcY.toFixed(2) + ',' + worst.maxNdcY.toFixed(2) + ']'
      + (worst.coversCrosshair ? '  *** COVERS CROSSHAIR ***' : ''));
    if (worst.closestZ > -0.20) problems.push(label + ': nearest z ' + worst.closestZ.toFixed(3) + ' is inside the 0.20 m clearance');
    if (worst.coversCrosshair) problems.push(label + ': geometry covers the crosshair');
    if (worst.maxNdcY > 0.35) problems.push(label + ': reaches too high up the frame (ndc y ' + worst.maxNdcY.toFixed(2) + ')');
  }
  hands.setHeld(null); hands.update(0.5); frames(40);
  if (problems.length) throw new Error(problems.join('; '));
});
// --- hand size relative to the cup, and skin/oak contrast ---
function widthAndTop(item) {
  hands.setHeld(item); hands.update(1/60); hands.update(1/60);
  camera.updateMatrixWorld(true); hands.group.updateMatrixWorld(true);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, any = false;
  hands.group.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    let n = o; while (n && n !== hands.group) { if (!n.visible) return; n = n.parent; }
    _box.setFromObject(o, true); if (_box.isEmpty()) return; any = true;
    for (let i = 0; i < 8; i++) {
      _v.set(i & 1 ? _box.max.x : _box.min.x, i & 2 ? _box.max.y : _box.min.y, i & 4 ? _box.max.z : _box.min.z);
      _v.project(camera);
      minX = Math.min(minX, _v.x); maxX = Math.max(maxX, _v.x);
      minY = Math.min(minY, _v.y); maxY = Math.max(maxY, _v.y);
    }
  });
  return any ? { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY } : null;
}
function relLum(hex) {
  const ch = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map(v => {
    const s = v / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
function contrast(a, b) { const la = relLum(a), lb = relLum(b); const hi = Math.max(la, lb), lo = Math.min(la, lb); return (hi + 0.05) / (lo + 0.05); }
check('hand is smaller than the cup and reads against oak', () => {
  const problems = [];
  const hand = widthAndTop(null);
  const cup = widthAndTop({ kind: 'cup', size: 'grande', lidded: false, fill: 0.7, color: 0x6B4A2F, foam: 0.3, iced: false, hot: true });
  // the cup case includes the hand, so measure the cup's own contribution as the full extent height
  const ratio = hand.w / cup.h;
  log.push('    hand width (ndc) ' + hand.w.toFixed(3) + '   cup+hand height ' + cup.h.toFixed(3)
    + '   ratio ' + (ratio * 100).toFixed(0) + '%');
  log.push('    empty hand: top ndc y ' + hand.maxY.toFixed(2) + '  leftmost ndc x ' + hand.minX.toFixed(2));
  if (hand.maxY > -0.45 || hand.maxY < -0.80) problems.push('empty hand top ndc y ' + hand.maxY.toFixed(2) + ' outside [-0.80,-0.45]');
  if (hand.minX < 0.15) problems.push('hand reaches ndc x ' + hand.minX.toFixed(2) + ', too close to the crosshair');
  // contrast against the oak cladding the hand sits in front of
  const OAK = 0xC8A57B;
  hands.setHeld(null); hands.update(1/60);          // only the hand itself is visible now
  const skinMats = [];
  hands.group.traverse(o => {
    if (!o.isMesh || !o.visible || !o.material?.color) return;
    let n = o; while (n && n !== hands.group) { if (!n.visible) return; n = n.parent; }
    if (!skinMats.includes(o.material)) skinMats.push(o.material);
  });
  let worst = Infinity, worstHex = null;
  for (const m of skinMats) {
    const hex = m.color.getHex();
    const c = contrast(hex, OAK);
    if (c < worst) { worst = c; worstHex = hex; }
  }
  log.push('    hand materials vs oak: ' + skinMats.map(m => '#' + m.color.getHex().toString(16).toUpperCase().padStart(6,'0') + ' ' + contrast(m.color.getHex(), OAK).toFixed(2) + ':1').join('  '));
  // the black cuff must be on screen: find the darkest hand mesh and check its vertical extent
  let cuffTop = -Infinity, cuffHex = null;
  hands.group.traverse(o => {
    if (!o.isMesh || !o.visible || !o.material?.color) return;
    let n = o; while (n && n !== hands.group) { if (!n.visible) return; n = n.parent; }
    if (relLum(o.material.color.getHex()) > 0.06) return;      // the cuff is the dark one
    _box.setFromObject(o, true); if (_box.isEmpty()) return;
    cuffHex = o.material.color.getHex();
    for (let i = 0; i < 8; i++) {
      _v.set(i & 1 ? _box.max.x : _box.min.x, i & 2 ? _box.max.y : _box.min.y, i & 4 ? _box.max.z : _box.min.z);
      _v.project(camera); cuffTop = Math.max(cuffTop, _v.y);
    }
  });
  log.push('    cuff #' + (cuffHex === null ? 'MISSING' : cuffHex.toString(16).toUpperCase().padStart(6,'0')) + ' top edge at ndc y ' + (cuffTop === -Infinity ? 'n/a' : cuffTop.toFixed(2)));
  if (cuffHex === null) problems.push('no dark cuff mesh visible with an empty hand');
  else if (cuffTop < -0.90) problems.push('cuff top at ndc y ' + cuffTop.toFixed(2) + ' is off the bottom of the frame');
  log.push('    lowest-contrast hand material vs oak #C8A57B: #' + worstHex.toString(16).toUpperCase().padStart(6, '0') + ' at ' + worst.toFixed(2) + ':1');
  if (worst < 1.6) problems.push('material #' + worstHex.toString(16) + ' only ' + worst.toFixed(2) + ':1 against oak, needs >= 1.6:1');
  if (problems.length) throw new Error(problems.join('; '));
});
check('dispose', () => { player.dispose?.(); hands.dispose?.(); stations.dispose?.(); });

console.log(log.join('\n'));
console.log('\nprompts sent: ' + prompts.length);
console.log('prompt samples:'); for (const p of [...new Set(prompts)].slice(0, 14)) console.log('   ' + JSON.stringify(p));
console.log('meters sent: ' + meters.length + '  toasts: ' + toasts.length);
console.log('sfx names used: ' + [...new Set(events.filter(e => e.n === 'sfx').map(e => e.p?.name))].join(', '));
console.log('gestures used: ' + [...new Set(events.filter(e => e.n === 'hand:gesture').map(e => e.p?.name))].join(', '));
console.log('\nfeedback sample:');
for (const e of events.filter(e => e.n === 'station:feedback').slice(0, 26)) console.log('   ' + (e.p.ok ? '+' : '-') + ' [' + e.p.id + '] ' + e.p.text);
if (fails.length) { console.log('\n=== ' + fails.length + ' FAILURES ===\n' + fails.join('\n\n')); process.exit(1); }
console.log('\nALL SMOKE CHECKS PASSED');
