// Plays every recipe in the REAL menu.js through the REAL controls.js input path, hands the cup
// off against a matching order, and scores it with the REAL orders.js scoreOrder.
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
const menu = await import(REPO + '/game/menu.js');
const orders = await import(REPO + '/game/orders.js');

const canvas = dom.makeElement('canvas');
const camera = new THREE.PerspectiveCamera(66, 16 / 9, 0.05, 220);
camera.position.set(LAYOUT.player.spawn.x, LAYOUT.player.eye, LAYOUT.player.spawn.z);
const scene = new THREE.Scene();
const bus = createBus();
const served = [];
const feedback = [];
bus.on('order:served', (p) => served.push({
  orderId: p?.order?.id, score: p?.score, tip: p?.tip, correct: p?.correct, notes: p?.notes ? [...p.notes] : [],
  drinkId: p?.built?.drinkId ?? '', drinkRef: (typeof p?.built?.drink === 'string' ? p.built.drink : p?.built?.drink?.id) ?? null,
  steps: (p?.built?.steps ?? []).map(st => st.station + ':' + st.param).join(' '),
  identity: p,
}));
bus.on('order:served', (p) => { setTimeout(() => {}, 0); });
bus.on('station:feedback', (p) => feedback.push(p));
const ctx = {
  THREE, scene, camera, renderer: { domElement: canvas },
  tex: {}, mat: { get: () => new THREE.MeshStandardMaterial() }, audio: { play() {} },
  bus, rng: mulberry32(7), layout: LAYOUT, state: {},
  hud: { setPrompt() {}, setMeter() {}, toast() {}, setTickets() {}, setStats() {} },
  menu, orders,
};
const player = controls.createPlayer(ctx, []);
ctx.player = player; scene.add(player.object);
const hands = handsMod.createHands(ctx); camera.add(hands.group); scene.add(camera);
const stations = stationsMod.createStations(ctx);
const IDS = ['cupStack','grinder','espresso','steamWand','superauto','syrupRack','blender','iceWell','sink','coldBrewTap','till','handoff'];
const interactables = IDS.map((id) => {
  const object = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshBasicMaterial());
  object.name = id; scene.add(object);
  return { id, kind: 'station', label: id, object, hint: '', hold: false };
});
stations.register(interactables); ctx.interactables = interactables;
document.pointerLockElement = canvas; document.dispatchEvent({ type: 'pointerlockchange' });

const byId = new Map(interactables.map(i => [i.id, i]));
const _fwd = new THREE.Vector3();
function frames(n) { for (let i = 0; i < n; i++) { player.update(1 / 60); hands.update(1 / 60); stations.update(1 / 60); } }
function key(code, type = 'keydown') { window.dispatchEvent({ type, code, repeat: false, ctrlKey: false, metaKey: false, altKey: false, preventDefault() {} }); }
function aim(id) {
  const it = byId.get(id); if (!it) return;
  for (const o of interactables) { if (o !== it) { o.object.position.set(0, -50, 0); o.object.updateMatrixWorld(true); } }
  camera.getWorldDirection(_fwd);
  it.object.position.copy(camera.position).addScaledVector(_fwd, 1.0);
  it.object.updateMatrixWorld(true); frames(6);
}
function tap(id) { aim(id); key('KeyE'); frames(6); key('KeyE', 'keyup'); frames(5); }
function hold(id, s) { aim(id); key('KeyE'); frames(Math.round(s * 60)); key('KeyE', 'keyup'); frames(6); }
function cupState() { let c = null; const off = bus.on('cup:changed', p => { c = p.cup; }); bus.emit('interact', { id: '__probe', phase: 'nudge' }); off(); return c; }

// Drive one recipe. Returns nothing; leaves a finished cup in hand.
function playRecipe(drink) {
  const size = (drink.size && drink.size[0]) || 'grande';
  // cycle the cup stack to the wanted size (read the live hint to know where we are)
  for (let i = 0; i < 5; i++) {
    aim('cupStack');
    if ((byId.get('cupStack').hint || '').toUpperCase().includes(size.toUpperCase())) break;
    tap('cupStack');
  }
  hold('cupStack', 0.45);
  let pfTaken = false, pitcherTaken = false, steamed = false;
  for (const step of drink.recipe) {
    const { station, param } = step;
    if (station === 'cupStack' && param === 'cup') continue;
    if (station === 'cupStack' && param === 'lid') { key('KeyL'); frames(5); continue; }
    if (station === 'grinder') { if (!pfTaken) { tap('espresso'); pfTaken = true; } hold('grinder', 1.04); continue; }
    if (station === 'espresso' && param === 'pull') { tap('espresso'); hold('espresso', 2.60); tap('espresso'); pfTaken = false; continue; }
    if (station === 'steamWand' && param === 'steam') {
      if (!pitcherTaken) { tap('steamWand'); pitcherTaken = true; }
      // Honour the ticket's aeration: a recipe with no `foam` field means wet (that is the Latte).
      const wantFoam = (step.foam || 'wet').toUpperCase();
      for (let c = 0; c < 6; c++) {
        aim('steamWand'); frames(8);
        if ((byId.get('steamWand').hint || '').toUpperCase().includes(wantFoam)) break;
        tap('steamWand');
      }
      hold('steamWand', 2.20); steamed = true; continue;
    }
    if (station === 'steamWand' && param === 'pour') { if (!pitcherTaken) { tap('steamWand'); pitcherTaken = true; } tap('steamWand'); pitcherTaken = false; steamed = false; continue; }
    if (station === 'superauto' && param === 'shot') { tap('superauto'); frames(90); continue; }
    if (station === 'superauto' && param === 'chai') { hold('superauto', 1.1); continue; }
    if (station === 'syrupRack') { for (let i = 0; i < Number(param); i++) tap('syrupRack'); continue; }
    if (station === 'blender') { hold('blender', 3.15); continue; }
    if (station === 'iceWell') { tap('iceWell'); continue; }
    if (station === 'sink' && param === 'water') { tap('sink'); continue; }
    if (station === 'sink' && param === 'whisk') { hold('sink', 1.35); continue; }
    if (station === 'coldBrewTap') { hold('coldBrewTap', 1.85); continue; }
    console.log('   !! no driver for step ' + station + '/' + param);
  }
}

let pass = 0, fail = 0;
const rows = [];
for (const drink of menu.DRINKS) {
  const size = (drink.size && drink.size[0]) || 'grande';
  bus.emit('interact', { id: 'drop', phase: 'tap', dt: 0 }); frames(6);
  // No `steps: []` — orders.js prefers order.steps over the recipe, and an empty array would make
  // every real step read as "extra". Real orders come from makeOrder(), which populates it.
  const order = { id: 'ord-' + drink.id, drink, size, name: 'Test', mods: [], progress: [],
                  price: drink.price, patience: 90, t0: 0 };
  bus.emit('order:new', { order });
  const n0 = served.length;
  playRecipe(drink);
  tap('handoff'); frames(8);
  const got = served.length > n0 ? served[served.length - 1] : null;
  const ok = got && got.orderId === order.id && got.score > 0;
  const note = got?.notes?.[0] || '';
  const sig = got ? got.steps : '(no built)';
  rows.push([drink.name.padEnd(22), size.padEnd(7), ok ? 'PASS' : 'FAIL',
    'score=' + (got ? Number(got.score).toFixed(2) : '-'),
    'tip=' + (got ? Number(got.tip).toFixed(2) : '-'),
    'notes=' + JSON.stringify(got ? got.notes : [])].join(' ') + '\n      ' 
       );
  if (ok) pass++; else fail++;
}
console.log(rows.join('\n'));
console.log('\n' + pass + ' of ' + (pass + fail) + ' menu drinks build and score.');
const unreachable = feedback.filter(f => !f.ok).map(f => f.id + ': ' + f.text);
const counts = new Map();
for (const u of unreachable) counts.set(u, (counts.get(u) || 0) + 1);
console.log('\nrejections seen while building (should be few and explicable):');
for (const [k, v] of [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log('  x' + v + '  ' + k);

// --- retained order:served payloads must not mutate as later handoffs happen ---
const retained = served.map(r => r.identity);
const problems = [];
const ids = retained.map(p => p?.order?.id);
if (new Set(ids).size !== ids.length) problems.push('retained payloads share an order: ' + ids.join(','));
const objs = new Set(retained); if (objs.size !== retained.length) problems.push('the SAME payload object was emitted more than once');
const builts = new Set(retained.map(p => p?.built)); if (builts.size !== retained.length) problems.push('the SAME built object was emitted more than once');
const stepArrays = new Set(retained.map(p => p?.built?.steps)); if (stepArrays.size !== retained.length) problems.push('the SAME steps array was emitted more than once');
const contentObjs = new Set(retained.map(p => p?.built?.contents)); if (contentObjs.size !== retained.length) problems.push('the SAME contents object was emitted more than once');
// every retained payload must still describe the drink it was emitted for
for (let i = 0; i < retained.length; i++) {
  const p = retained[i], snap = served[i];
  if (p?.built?.drinkId !== snap.drinkId) problems.push('retained drinkId drifted for ' + snap.orderId + ': now "' + p?.built?.drinkId + '", was "' + snap.drinkId + '"');
  const nowSteps = (p?.built?.steps ?? []).map(st => st.station + ':' + st.param).join(' ');
  if (nowSteps !== snap.steps) problems.push('retained steps drifted for ' + snap.orderId);
  if (p?.score !== snap.score) problems.push('retained score drifted for ' + snap.orderId);
}
console.log('\nretained-payload isolation over ' + retained.length + ' handoffs: ' + (problems.length ? 'FAIL' : 'ok'));
for (const pr of problems) console.log('   ' + pr);
if (problems.length) process.exitCode = 1;

process.exit((fail || process.exitCode) ? 1 : 0);
