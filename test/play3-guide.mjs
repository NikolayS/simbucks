// The build guide must follow the oldest ticket, the cup's real progress, and training mode.
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
camera.position.set(0, LAYOUT.player.eye, -0.6);
const scene = new THREE.Scene();
const bus = createBus();
const guides = [];
bus.on('guide:step', p => guides.push(p));
const meters = [];
const ctx = {
  THREE, scene, camera, renderer: { domElement: canvas },
  tex: {}, mat: { get: () => new THREE.MeshStandardMaterial() }, audio: { play() {} },
  bus, rng: mulberry32(3), layout: LAYOUT, state: {},
  hud: { setPrompt() {}, setMeter: (m) => meters.push(m ? { ...m } : null), toast() {}, setTickets() {}, setStats() {} },
  menu, orders,
};
const player = controls.createPlayer(ctx, []); ctx.player = player; scene.add(player.object);
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
const _f = new THREE.Vector3();
function frames(n) { for (let i = 0; i < n; i++) { player.update(1/60); hands.update(1/60); stations.update(1/60); } }
function key(c, t='keydown') { window.dispatchEvent({ type: t, code: c, repeat: false, ctrlKey:false, metaKey:false, altKey:false, preventDefault(){} }); }
function aim(id) { const it = byId.get(id);
  for (const o of interactables) if (o !== it) { o.object.position.set(0,-50,0); o.object.updateMatrixWorld(true); }
  camera.getWorldDirection(_f); it.object.position.copy(camera.position).addScaledVector(_f, 1.0);
  it.object.updateMatrixWorld(true); frames(6); }
function tap(id) { aim(id); key('KeyE'); frames(6); key('KeyE','keyup'); frames(5); }
function hold(id, s) { aim(id); key('KeyE'); frames(Math.round(s*60)); key('KeyE','keyup'); frames(6); }

const problems = [];
function last() { return guides[guides.length - 1]; }
function actualGuide(g = last()) {
  return g ? `${g.label} / ${g.index} of ${g.total}` : 'null';
}
function expect(what, { station, label, index, total, hintMatch }) {
  const guide = last();
  const failures = [];
  if (!guide) failures.push('guide is null');
  if (guide && guide.station !== station) failures.push(`station ${JSON.stringify(guide.station)} !== ${JSON.stringify(station)}`);
  if (guide && guide.label !== label) failures.push(`label ${JSON.stringify(guide.label)} !== ${JSON.stringify(label)}`);
  if (guide && guide.index !== index) failures.push(`index ${guide.index} !== ${index}`);
  if (guide && guide.total !== total) failures.push(`total ${guide.total} !== ${total}`);
  if (guide && hintMatch && !hintMatch.test(guide.hint)) failures.push(`hint ${JSON.stringify(guide.hint)} does not match ${hintMatch}`);
  console.log(`  ${failures.length ? 'FAIL' : 'ok  '} ${what}: ${actualGuide(guide)}`);
  if (failures.length) problems.push(`${what}: ${failures.join('; ')}`);
  return guide;
}
function check(what, passed, detail = '') {
  console.log(`  ${passed ? 'ok  ' : 'FAIL'} ${what}${detail ? `: ${detail}` : ''}`);
  if (!passed) problems.push(`${what}${detail ? `: ${detail}` : ''}`);
}
function ticket(id, drinkId, size) {
  const drink = menu.DRINKS.find(d => d.id === drinkId);
  return { id, drink, size, name: 'TEST', mods: [], steps: menu.recipeFor(drink, size),
           progress: [], price: drink.price, patience: 90, t0: 0 };
}
function clearAndRetire(...tickets) {
  bus.emit('interact', { id: 'drop', phase: 'tap', dt: 0 });
  frames(6);
  for (const order of tickets) {
    bus.emit('order:lost', { order, reason: 'test' });
    frames(6);
  }
}
function espressoHalf() {
  tap('espresso');
  hold('grinder', 1.0);
  tap('espresso');
  hold('espresso', 2.6);
  tap('espresso');
}
function steamAndPour() {
  tap('steamWand');
  tap('steamWand');
  tap('steamWand');
  hold('steamWand', 2.2);
  tap('steamWand');
}

console.log('Scenario 1 — full Grande Latte');
frames(6);
check('no ticket has no guide', guides.length === 0 || guides.every(g => g === null), actualGuide());
const latteGrande = ticket('guide-latte-1', 'latte', 'grande');
bus.emit('order:new', { order: latteGrande });
frames(10);
const sequence = [];
sequence.push(expect('before any action', { station: 'cupStack', label: 'TAKE A GRANDE CUP', index: 1, total: 7, hintMatch: /hold at the cup stack/ }));
hold('cupStack', 0.45);
sequence.push(expect('after taking the cup', { station: 'espresso', label: 'GRIND', index: 2, total: 7, hintMatch: /take the portafilter/ }));
tap('espresso');
sequence.push(expect('after taking the portafilter', { station: 'grinder', label: 'GRIND', index: 2, total: 7, hintMatch: /dose meter is in the green/ }));
hold('grinder', 1.0);
sequence.push(expect('after grinding', { station: 'espresso', label: 'LOCK IT IN', index: 3, total: 7 }));
tap('espresso');
sequence.push(expect('after locking in', { station: 'espresso', label: 'PULL SHOT', index: 3, total: 7, hintMatch: /release at 22-30 seconds/ }));
hold('espresso', 2.6);
sequence.push(expect('after pulling the shot', { station: 'espresso', label: 'POUR THE SHOT', index: 3, total: 7 }));
tap('espresso');
sequence.push(expect('after pouring the shot', { station: 'steamWand', label: 'STEAM MILK', index: 4, total: 7, hintMatch: /pick up the milk pitcher/ }));
tap('steamWand');
sequence.push(expect('after taking the pitcher', { station: 'steamWand', label: 'STEAM MILK', index: 4, total: 7, hintMatch: /reads WET/ }));
tap('steamWand');
tap('steamWand');
sequence.push(expect('at WET foam', { station: 'steamWand', label: 'STEAM MILK', index: 4, total: 7, hintMatch: /release between 60 and 68/ }));
hold('steamWand', 2.2);
sequence.push(expect('after steaming', { station: 'steamWand', label: 'POUR THE MILK', index: 5, total: 7 }));
tap('steamWand');
sequence.push(expect('after pouring the milk', { station: 'cupStack', label: 'LID IT', index: 6, total: 7 }));
tap('cupStack');
sequence.push(expect('after adding the lid', { station: 'handoff', label: 'SERVE IT', index: 7, total: 7 }));
tap('handoff');
check('after serving the guide is null', last() === null, actualGuide());
console.log('\n  Coaching sequence');
sequence.forEach((guide, i) => console.log(`    ${i + 1}. ${guide ? `${guide.label} — ${guide.hint}` : 'null'}`));

clearAndRetire(latteGrande);
console.log('\nScenario 2 — out of order');
const latteOutOfOrder = ticket('guide-latte-2', 'latte', 'grande');
bus.emit('order:new', { order: latteOutOfOrder });
frames(10);
hold('cupStack', 0.45);
steamAndPour();
expect('milk first does not skip grind', { station: 'espresso', label: 'GRIND', index: 2, total: 7, hintMatch: /take the portafilter/ });
espressoHalf();
expect('espresso catches up past completed milk', { station: 'cupStack', label: 'LID IT', index: 6, total: 7 });

console.log('\nScenario 3 — dump mid-build');
bus.emit('interact', { id: 'drop', phase: 'tap', dt: 0 });
frames(6);
expect('dump recomputes from the cup', { station: 'cupStack', label: 'TAKE A GRANDE CUP', index: 1, total: 7, hintMatch: /hold at the cup stack/ });

clearAndRetire(latteOutOfOrder);
console.log('\nScenario 4 — second ticket takes over');
const latteFirst = ticket('guide-latte-3', 'latte', 'grande');
const americanoTall = ticket('guide-americano-1', 'americano', 'tall');
bus.emit('order:new', { order: latteFirst });
bus.emit('order:new', { order: americanoTall });
frames(10);
hold('cupStack', 0.45);
espressoHalf();
steamAndPour();
tap('cupStack');
tap('handoff');
expect('second ticket becomes the guide', { station: 'cupStack', label: 'TAKE A TALL CUP', index: 1, total: 6, hintMatch: /until it says Tall/ });

clearAndRetire(latteFirst, americanoTall);
console.log('\nScenario 5 — syrup pumps');
const macchiatoGrande = ticket('guide-macchiato-1', 'caramelMacchiato', 'grande');
bus.emit('order:new', { order: macchiatoGrande });
frames(10);
hold('cupStack', 0.45);
const macchiatoTotal = macchiatoGrande.steps.length + 1;
expect('syrup step starts at zero pumps', { station: 'syrupRack', label: '2 PUMPS OF VANILLA', index: 2, total: macchiatoTotal, hintMatch: /2 times/ });
tap('syrupRack');
expect('one syrup pump remains', { station: 'syrupRack', label: '2 PUMPS OF VANILLA', index: 2, total: macchiatoTotal, hintMatch: /^(?=[\s\S]*1 more time)(?=[\s\S]*1 of 2 in)/ });
tap('syrupRack');
const afterSyrup = last();
check('two pumps move off the syrup step', !!afterSyrup && afterSyrup.index === 3 && afterSyrup.station !== 'syrupRack', actualGuide(afterSyrup));

console.log('\nScenario 6 — hygiene');
function auditGuidePayloads(label) {
  const payloads = guides.filter(g => g !== null);
  const expectedKeys = ['hint', 'index', 'label', 'param', 'station', 'total'];
  check(`${label}: payload keys`, payloads.every(g => JSON.stringify(Object.keys(g).sort()) === JSON.stringify(expectedKeys)), `${payloads.length} payloads`);
  check(`${label}: payloads are frozen`, payloads.every(g => Object.isFrozen(g)), `${payloads.length} payloads`);
  check(`${label}: labels are non-empty and upper-case`, payloads.every(g => typeof g.label === 'string' && g.label.trim() && g.label === g.label.toUpperCase()));
  check(`${label}: hints are non-empty`, payloads.every(g => typeof g.hint === 'string' && g.hint.trim()));
  check(`${label}: indices are within totals`, payloads.every(g => Number.isInteger(g.index) && Number.isInteger(g.total) && g.index >= 1 && g.index <= g.total));
  const knownStations = new Set([...IDS, 'handoff']);
  check(`${label}: stations are known`, payloads.every(g => knownStations.has(g.station)));
}
auditGuidePayloads('guide payloads so far');
const settledGuideCount = guides.length;
frames(180);
check('guide emits on change only', guides.length === settledGuideCount, `${settledGuideCount} before, ${guides.length} after`);

clearAndRetire(macchiatoGrande);
console.log('\nScenario 7 — training-mode meter text');
function startOrder(order) {
  bus.emit('order:new', { order });
  frames(10);
  hold('cupStack', 0.45);
}
function sampleHoldMeter(id, seconds, kind) {
  meters.length = 0;
  aim(id);
  key('KeyE');
  frames(Math.round(seconds * 60));
  const meter = meters.filter(m => m && m.kind === kind).pop();
  key('KeyE', 'keyup');
  frames(6);
  return meter;
}
function prepareSteam(order) {
  startOrder(order);
  tap('steamWand');
  tap('steamWand');
  tap('steamWand');
}
function prepareShot(order) {
  startOrder(order);
  tap('espresso');
  hold('grinder', 1.0);
  tap('espresso');
}

delete ctx.state.training;
const steamNormalOrder = ticket('meter-steam-normal', 'latte', 'grande');
prepareSteam(steamNormalOrder);
const steamNormal = sampleHoldMeter('steamWand', 0.4, 'steam');
check('normal steam meter keeps temperature-only text', !!steamNormal && /^\d+C$/.test(steamNormal.text), JSON.stringify(steamNormal?.text));
clearAndRetire(steamNormalOrder);

ctx.state.training = true;
const steamTrainingOrder = ticket('meter-steam-training', 'latte', 'grande');
prepareSteam(steamTrainingOrder);
const steamTraining = sampleHoldMeter('steamWand', 0.4, 'steam');
check('training steam meter adds release range', !!steamTraining && /release at 60-68/.test(steamTraining.text) && /\d+°?C/.test(steamTraining.text), JSON.stringify(steamTraining?.text));
clearAndRetire(steamTrainingOrder);

delete ctx.state.training;
const shotNormalOrder = ticket('meter-shot-normal', 'latte', 'grande');
prepareShot(shotNormalOrder);
const shotNormal = sampleHoldMeter('espresso', 0.4, 'shot');
check('normal shot meter keeps time-only text', !!shotNormal && /^\d+\.\d+s$/.test(shotNormal.text), JSON.stringify(shotNormal?.text));
clearAndRetire(shotNormalOrder);

ctx.state.training = true;
const shotTrainingOrder = ticket('meter-shot-training', 'latte', 'grande');
prepareShot(shotTrainingOrder);
const shotTraining = sampleHoldMeter('espresso', 0.4, 'shot');
check('training shot meter adds release range', !!shotTraining && /release at 22-30s/.test(shotTraining.text) && /\d+\.\d+s/.test(shotTraining.text), JSON.stringify(shotTraining?.text));
clearAndRetire(shotTrainingOrder);

auditGuidePayloads('all guide payloads across the run');

console.log('\n' + (problems.length ? `FAIL\n  ${problems.join('\n  ')}` : 'play3 guide: ok'));
process.exit(problems.length ? 1 : 0);
