// CONTRACT.md section 11.1 — stations.js must say what was actually wrong, and
// must forward every field it was given on order:served.
import { installDom } from './dom.js';
const dom = installDom();
const THREE = await import('three');
const REPO = new URL('../src/', import.meta.url).pathname;
const { LAYOUT } = await import(REPO + 'core/layout.js');
const { createBus } = await import(REPO + 'core/bus.js');
const { mulberry32 } = await import(REPO + 'core/rng.js');
const controls = await import(REPO + 'player/controls.js');
const stationsMod = await import(REPO + 'game/stations.js');
const materials = await import(REPO + 'gfx/materials.js');

const fails = [];
function check(name, fn) {
  try { fn(); console.log('  ok   ' + name); }
  catch (e) { fails.push(name); console.log('  FAIL ' + name + ': ' + (e.stack || e)); }
}
const clone = (v) => JSON.parse(JSON.stringify(v ?? null));

const IDS = ['cupStack','grinder','espresso','steamWand','superauto','syrupRack',
             'blender','iceWell','sink','coldBrewTap','till','handoff'];

function makeWorld() {
  const canvas = dom.makeElement('canvas');
  const camera = new THREE.PerspectiveCamera(66, 16 / 9, 0.05, 220);
  camera.position.set(LAYOUT.player.spawn.x, LAYOUT.player.eye, LAYOUT.player.spawn.z);
  const scene = new THREE.Scene();
  const bus = createBus();
  const served = [];
  const feedback = [];
  bus.on('order:served', (p) => served.push({ raw: p, snap: clone(p) }));
  bus.on('station:feedback', (p) => feedback.push(clone(p)));
  const ctx = {
    THREE, scene, camera, renderer: { domElement: canvas },
    tex: {}, mat: materials, audio: { play() {} },
    bus, rng: mulberry32(5), layout: LAYOUT, state: {},
    hud: { setPrompt() {}, setMeter() {}, toast() {}, setTickets() {}, setStats() {} },
    menu: {}, orders: {},
  };
  const player = controls.createPlayer(ctx, []);
  ctx.player = player;
  scene.add(player.object);
  scene.add(camera);
  const stations = stationsMod.createStations(ctx);
  const interactables = IDS.map((id) => {
    const object = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshBasicMaterial());
    object.name = id; scene.add(object);
    return { id, kind: 'station', label: id, object, hint: '', hold: false };
  });
  stations.register(interactables);
  ctx.interactables = interactables;

  document.pointerLockElement = canvas;
  document.dispatchEvent({ type: 'pointerlockchange' });

  const byId = new Map(interactables.map(i => [i.id, i]));
  const fwd = new THREE.Vector3();
  function frames(n) { for (let i = 0; i < n; i++) { player.update(1 / 60); stations.update(1 / 60); } }
  function key(code, type) {
    window.dispatchEvent({ type, code, repeat: false, ctrlKey: false, metaKey: false, altKey: false, preventDefault() {} });
  }
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
  function tap(id) { aim(id); key('KeyE', 'keydown'); frames(6); key('KeyE', 'keyup'); frames(4); }
  function hold(id, seconds) {
    aim(id);
    key('KeyE', 'keydown');
    frames(Math.max(1, Math.round(seconds * 60)));
    key('KeyE', 'keyup');
    frames(6);
  }
  // Capture what stations actually hands to scoreOrder, deep-copied because the
  // step objects it passes are the live cup's and are reset straight after.
  const scored = [];
  ctx.orders.scoreOrder = (order, built) => {
    scored.push(clone(built));
    return ctx.orders.__next ?? { score: 1, tip: 0.5, correct: true, notes: [] };
  };
  function order(id) {
    return { id, drink: { id: 'latte', name: 'Latte', price: 3.55, recipe: [] }, size: 'grande',
             name: 'Nik', mods: [], steps: [], progress: [], price: 3.55, patience: 60, t0: 0 };
  }
  return { ctx, bus, camera, player, stations, served, feedback, scored, frames, tap, hold, key, order };
}

console.log('\n=== 11.1: order:served carries every field ===');
{
  const w = makeWorld();
  w.ctx.orders.__next = { score: 0.42, tip: 0.11, correct: false,
    notes: ['Wrong drink — that is an Americano, the ticket says a Latte', 'second note'],
    tip_text: 'You pulled 2 shots; an Americano takes 1' };
  w.bus.emit('order:new', { order: w.order('o-fields') });
  w.hold('cupStack', 0.35);
  w.tap('handoff'); w.frames(6);

  check('order:served was emitted', () => {
    if (!w.served.length) throw new Error('never served');
  });
  check('carries order, score, tip, notes, tip_text, correct', () => {
    const p = w.served[0].snap;
    for (const k of ['order', 'score', 'tip', 'notes', 'tip_text', 'correct']) {
      if (!(k in p)) throw new Error('missing field: ' + k);
    }
  });
  check('tip_text is forwarded verbatim', () => {
    if (w.served[0].snap.tip_text !== 'You pulled 2 shots; an Americano takes 1')
      throw new Error('got ' + JSON.stringify(w.served[0].snap.tip_text));
  });
  check('correct is forwarded, not recomputed', () => {
    if (w.served[0].snap.correct !== false) throw new Error('got ' + w.served[0].snap.correct);
  });
  check('built is still present — fields added, none dropped', () => {
    if (!w.served[0].snap.built) throw new Error('built was dropped');
    if (!w.served[0].snap.built.contents) throw new Error('built.contents was dropped');
  });
  check('score and tip survive as given', () => {
    const p = w.served[0].snap;
    if (p.score !== 0.42 || p.tip !== 0.11) throw new Error(JSON.stringify([p.score, p.tip]));
  });
}

console.log('\n=== 11.1: a scoreOrder with no tip_text still works ===');
{
  const w = makeWorld();
  w.ctx.orders.__next = { score: 1, tip: 0.5, correct: true, notes: [] };
  w.bus.emit('order:new', { order: w.order('o-notext') });
  w.hold('cupStack', 0.35);
  w.tap('handoff'); w.frames(6);
  check('tip_text degrades to an empty string, never undefined', () => {
    const p = w.served[0].snap;
    if (p.tip_text !== '') throw new Error('got ' + JSON.stringify(p.tip_text));
  });
  check('a non-string tip_text is rejected rather than forwarded', () => {
    const w2 = makeWorld();
    w2.ctx.orders.__next = { score: 1, tip: 0.5, correct: false, notes: [], tip_text: { evil: true } };
    w2.bus.emit('order:new', { order: w2.order('o-bad') });
    w2.hold('cupStack', 0.35);
    w2.tap('handoff'); w2.frames(6);
    if (w2.served[0].snap.tip_text !== '') throw new Error('got ' + JSON.stringify(w2.served[0].snap.tip_text));
  });
}

console.log('\n=== 11.1: the handoff no longer says "needed work" ===');
{
  const w = makeWorld();
  const NOTE = 'Wrong drink — that is an Americano, the ticket says a Latte';
  w.ctx.orders.__next = { score: 0.4, tip: 0, correct: false, notes: [NOTE, 'lower priority'] };
  w.bus.emit('order:new', { order: w.order('o-note') });
  w.hold('cupStack', 0.35);
  w.tap('handoff'); w.frames(6);
  const handoffs = () => w.feedback.filter(f => f.id === 'handoff');
  check('a wrong drink reports the top note, not "needed work"', () => {
    const last = handoffs().pop();
    if (!last) throw new Error('no handoff feedback');
    if (last.text !== NOTE) throw new Error('got ' + JSON.stringify(last.text));
    if (/needed work/.test(last.text)) throw new Error('still says "needed work"');
  });
  check('a correct drink still reports "<drink> served"', () => {
    const w2 = makeWorld();
    w2.ctx.orders.__next = { score: 1, tip: 1, correct: true, notes: [] };
    w2.bus.emit('order:new', { order: w2.order('o-ok') });
    w2.hold('cupStack', 0.35);
    w2.tap('handoff'); w2.frames(6);
    const last = w2.feedback.filter(f => f.id === 'handoff').pop();
    if (!/ served$/.test(last.text)) throw new Error('got ' + JSON.stringify(last.text));
    if (last.ok !== true) throw new Error('ok flag wrong');
  });
  check('with no notes at all it still falls back to "needed work"', () => {
    const w2 = makeWorld();
    w2.ctx.orders.__next = { score: 0.3, tip: 0, correct: false, notes: [] };
    w2.bus.emit('order:new', { order: w2.order('o-empty') });
    w2.hold('cupStack', 0.35);
    w2.tap('handoff'); w2.frames(6);
    const last = w2.feedback.filter(f => f.id === 'handoff').pop();
    if (!/needed work$/.test(last.text)) throw new Error('got ' + JSON.stringify(last.text));
  });
}

console.log('\n=== 11.1: raw metrics reach scoreOrder on the steps ===');
{
  const w = makeWorld();
  w.ctx.orders.__next = { score: 1, tip: 0.5, correct: true, notes: [] };
  w.bus.emit('order:new', { order: w.order('o-metrics') });
  w.hold('cupStack', 0.35);
  w.tap('espresso');            // portafilter
  w.hold('grinder', 0.95);      // dose
  w.tap('espresso');            // lock in
  w.hold('espresso', 2.7);      // pull
  w.tap('espresso');            // pour
  w.tap('steamWand');           // pitcher
  w.hold('steamWand', 2.25);    // steam
  w.tap('steamWand');           // pour milk
  w.tap('syrupRack'); w.frames(4);
  w.tap('syrupRack'); w.frames(4);
  w.tap('handoff'); w.frames(6);

  const built = w.scored[w.scored.length - 1];
  const stepFor = (station, param) =>
    (built?.steps || []).find(s => s.station === station && (param === undefined || s.param === param));

  check('the espresso pull step carries the real shot seconds', () => {
    const s = stepFor('espresso', 'pull');
    if (!s) throw new Error('no espresso pull step: ' + JSON.stringify(built?.steps));
    if (!Number.isFinite(s.seconds)) throw new Error('no seconds on the step: ' + JSON.stringify(s));
    if (!(s.seconds > 0)) throw new Error('seconds not positive: ' + s.seconds);
  });
  check('the steam step carries the real milk temperature', () => {
    const s = stepFor('steamWand', 'steam');
    if (!s) throw new Error('no steam step');
    if (!Number.isFinite(s.temp)) throw new Error('no temp on the step: ' + JSON.stringify(s));
    if (!(s.temp > 20 && s.temp < 120)) throw new Error('implausible temp: ' + s.temp);
  });
  check('the steam step keeps its foam field', () => {
    const s = stepFor('steamWand', 'steam');
    if (typeof s.foam !== 'string') throw new Error('foam lost: ' + JSON.stringify(s));
  });
  check('the syrup step names its pump count', () => {
    const s = (built.steps || []).find(x => x.station === 'syrupRack');
    if (!s) throw new Error('no syrup step');
    if (s.pumps !== s.param) throw new Error('pumps ' + s.pumps + ' vs param ' + s.param);
    if (!(s.pumps >= 1)) throw new Error('pumps not counted: ' + s.pumps);
  });
  check('a longer pull records more seconds than a shorter one', () => {
    function pullFor(seconds) {
      const t = makeWorld();
      t.ctx.orders.__next = { score: 1, tip: 0.5, correct: true, notes: [] };
      t.bus.emit('order:new', { order: t.order('o-' + seconds) });
      t.hold('cupStack', 0.35);
      t.tap('espresso'); t.hold('grinder', 0.95); t.tap('espresso');
      t.hold('espresso', seconds); t.tap('espresso');
      t.tap('handoff'); t.frames(6);
      const b = t.scored[t.scored.length - 1];
      return (b.steps || []).find(s => s.station === 'espresso' && s.param === 'pull')?.seconds;
    }
    const short = pullFor(1.2), long = pullFor(3.4);
    if (!Number.isFinite(short) || !Number.isFinite(long)) throw new Error(short + ' / ' + long);
    if (!(long > short)) throw new Error('not a real metric: short ' + short + ' vs long ' + long);
  });
}

console.log('\n=== 11.1: no stale metric leaks into the next drink ===');
{
  const w = makeWorld();
  w.ctx.orders.__next = { score: 1, tip: 0.5, correct: true, notes: [] };
  // drink 1: a real shot
  w.bus.emit('order:new', { order: w.order('o-first') });
  w.hold('cupStack', 0.35);
  w.tap('espresso'); w.hold('grinder', 0.95); w.tap('espresso');
  w.hold('espresso', 2.7); w.tap('espresso');
  w.tap('handoff'); w.frames(6);
  const first = w.scored[w.scored.length - 1];
  // drink 2: no espresso at all
  w.bus.emit('order:new', { order: w.order('o-second') });
  w.hold('cupStack', 0.35);
  w.tap('syrupRack'); w.frames(4);
  w.tap('handoff'); w.frames(6);
  const second = w.scored[w.scored.length - 1];

  check('drink 1 recorded its shot', () => {
    const s = (first.steps || []).find(x => x.station === 'espresso');
    if (!Number.isFinite(s?.seconds)) throw new Error('drink 1 lost its seconds');
  });
  check('drink 2 has no espresso step and no leaked seconds', () => {
    const anyEspresso = (second.steps || []).some(x => x.station === 'espresso');
    if (anyEspresso) throw new Error('drink 2 grew an espresso step');
    const leaked = (second.steps || []).filter(x => 'seconds' in x);
    if (leaked.length) throw new Error('stale seconds leaked: ' + JSON.stringify(leaked));
  });
}

console.log('');
if (fails.length) { console.log('FEEDBACK HARNESS FAILURES: ' + fails.length + '\n  ' + fails.join('\n  ')); process.exitCode = 1; }
else console.log('ALL FEEDBACK CHECKS PASSED');
