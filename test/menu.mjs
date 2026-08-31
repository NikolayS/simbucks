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

// --- score feedback, note classification, fault tally, and training-mode coverage ---
const state = await import(REPO + '/game/state.js');
const customers = await import(REPO + '/game/customers.js');
const coverageFailures = [];
function coverageCheck(ok, message) {
  console.log((ok ? 'ok' : 'FAIL') + ' ' + message);
  if (!ok) coverageFailures.push(message);
}
function sameValue(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

console.log('\nserved-note coverage:');
let coveredNoteCount = 0;
function checkCoveredNote(note, source) {
  coveredNoteCount++;
  const shown = JSON.stringify(note);
  const maxLength = typeof note === 'string' && note.startsWith('Wrong drink — ') ? 96 : 72;
  coverageCheck(typeof note === 'string' && note.length <= maxLength,
    `${source} note is at most ${maxLength} characters: ${shown}`);
  const classified = orders.faultsFromNotes([note]);
  coverageCheck(classified.length === 1
    && typeof classified[0]?.code === 'string' && classified[0].code.length > 0
    && typeof classified[0]?.label === 'string' && classified[0].label.length > 0,
  `${source} note classifies exactly once: ${shown}`);
}
for (const entry of served) {
  for (const note of entry.identity?.notes ?? []) {
    checkCoveredNote(note, 'served');
  }
}

function syntheticOrder(drinkId) {
  const drink = menu.getDrink(drinkId);
  return {
    drink,
    size: 'tall',
    steps: menu.recipeFor(drink, 'tall'),
    price: drink.price,
    patience: 90,
    t0: 0,
  };
}
function syntheticSteps(drinkId) {
  return menu.recipeFor(menu.getDrink(drinkId), 'tall')
    .map(step => ({ station: step.station, param: step.param, quality: 1 }));
}
function syntheticBuild(drinkId, size = 'tall', alterSteps = steps => steps) {
  return {
    drink: drinkId,
    size,
    steps: alterSteps(syntheticSteps(drinkId)),
    elapsed: 0,
  };
}
function scoreSynthetic(ticketId, builtId, alterSteps = steps => steps) {
  return orders.scoreOrder(syntheticOrder(ticketId), syntheticBuild(builtId, 'tall', alterSteps));
}

console.log('\ndirect scoreOrder tip_text coverage:');
const directResults = {
  perfect: scoreSynthetic('americano', 'americano'),
  'wrong drink': scoreSynthetic('latte', 'americano'),
  'scorched milk': scoreSynthetic('latte', 'latte', steps => steps.map(step =>
    step.station === 'steamWand' && step.param === 'steam'
      ? { ...step, quality: 0.2, temp: 78 } : step)),
  'cold milk': scoreSynthetic('latte', 'latte', steps => steps.map(step =>
    step.station === 'steamWand' && step.param === 'steam'
      ? { ...step, quality: 0.2, temp: 50 } : step)),
  'wrong syrup count': scoreSynthetic('chaiLatte', 'chaiLatte', steps => steps.map(step =>
    step.station === 'syrupRack' ? { ...step, param: 3 } : step)),
  'over-extracted shot': scoreSynthetic('americano', 'americano', steps => steps.map(step =>
    step.station === 'espresso' && step.param === 'pull'
      ? { ...step, quality: 0.3, seconds: 34 } : step)),
  'extra shot': scoreSynthetic('americano', 'americano', steps => [
    ...steps,
    { station: 'espresso', param: 'pull', quality: 1 },
  ]),
};
for (const [name, result] of Object.entries(directResults)) {
  console.log(`${name}: ${result.tip_text}`);
  for (const note of result.notes) checkCoveredNote(note, `direct ${name}`);
}

const perfectResult = directResults.perfect;
coverageCheck(perfectResult.score === 1, 'perfect Americano score is exactly 1');
coverageCheck(perfectResult.notes.length === 0, 'perfect Americano has no notes');
coverageCheck(perfectResult.tip_text === '', 'perfect Americano tip_text is strictly empty');

const wrongDrinkResult = directResults['wrong drink'];
coverageCheck(wrongDrinkResult.notes[0]?.startsWith('Wrong drink — that is an Americano'),
  'wrong-drink note names the built Americano');
coverageCheck(wrongDrinkResult.tip_text.length > 0 && /\d/.test(wrongDrinkResult.tip_text),
  'wrong-drink tip_text is non-empty and contains a digit');

const scorchedResult = directResults['scorched milk'];
coverageCheck(scorchedResult.tip_text.includes('78') && scorchedResult.tip_text.includes('60')
  && scorchedResult.tip_text.includes('68'),
'scorched-milk tip_text names 78 and the 60–68 °C target');

const coldResult = directResults['cold milk'];
coverageCheck(coldResult.notes.some(note => note.includes('50')) && coldResult.tip_text.includes('50')
  && !coldResult.notes.some(note => /scorched/i.test(note)) && !/scorched/i.test(coldResult.tip_text),
'cold-milk note and tip name 50 without calling the milk scorched');

const syrupResult = directResults['wrong syrup count'];
coverageCheck(syrupResult.tip_text.includes('3') && syrupResult.tip_text.includes('2')
  && /syrup/i.test(syrupResult.tip_text),
'wrong-syrup tip_text names 3, 2, and syrup');

const shotResult = directResults['over-extracted shot'];
coverageCheck(shotResult.tip_text.includes('34') && shotResult.tip_text.includes('22')
  && shotResult.tip_text.includes('30'),
'over-extracted-shot tip_text names 34 and the 22–30 second target');

const extraShotResult = directResults['extra shot'];
coverageCheck(extraShotResult.tip_text.includes('2') && extraShotResult.tip_text.includes('1'),
  'extra-shot tip_text names both the built count 2 and ticket count 1');

for (const [name, result] of Object.entries(directResults).filter(([key]) => key !== 'perfect')) {
  coverageCheck(result.score < 1 && result.notes.length > 0
    && typeof result.tip_text === 'string' && result.tip_text.length > 0
    && result.tip_text.length <= 120 && /\d/.test(result.tip_text)
    && typeof result.faults?.[0]?.code === 'string' && result.faults[0].code.length > 0,
  `${name} obeys the universal imperfect-order feedback rule`);
}

console.log('\nadditional fault-code scenarios:');
const additionalScenarios = {
  wrongSize: {
    expectedCode: 'wrongSize',
    result: orders.scoreOrder(syntheticOrder('americano'), syntheticBuild('americano', 'grande')),
  },
  wrongFoam: {
    expectedCode: 'wrongFoam',
    result: orders.scoreOrder(syntheticOrder('latte'), syntheticBuild('latte', 'tall', steps =>
      steps.map(step => step.station === 'steamWand' && step.param === 'steam'
        ? { ...step, foam: 'dry' } : step))),
  },
  missingStep: {
    expectedCode: 'missingStep',
    result: orders.scoreOrder(syntheticOrder('latte'), syntheticBuild('latte', 'tall', steps =>
      steps.filter(step => step.station !== 'steamWand' || step.param !== 'pour'))),
  },
  sloppy: {
    expectedCode: 'sloppy',
    result: orders.scoreOrder(syntheticOrder('caramelFrappuccino'),
      syntheticBuild('caramelFrappuccino', 'tall', steps => steps.map(step =>
        step.station === 'blender' && step.param === 'blend'
          ? { ...step, quality: 0.2 } : step))),
  },
  noTicket: {
    expectedCode: 'noTicket',
    result: orders.scoreOrder(null, syntheticBuild('americano')),
  },
  empty: {
    expectedCode: 'empty',
    result: orders.scoreOrder(syntheticOrder('americano'), { steps: [], size: 'tall' }),
  },
};
for (const [name, scenario] of Object.entries(additionalScenarios)) {
  const { expectedCode, result } = scenario;
  console.log(`${name} note: ${result.notes[0]}`);
  console.log(`${name} tip_text: ${result.tip_text}`);
  for (const note of result.notes) checkCoveredNote(note, `direct ${name}`);
  const classifications = result.notes.map(note => orders.faultsFromNotes([note]));
  coverageCheck(result.notes.length > 0 && classifications.every(classified =>
    classified.length === 1 && classified[0]?.code === expectedCode),
  `${name} notes all classify as ${expectedCode}`);
  coverageCheck(typeof result.tip_text === 'string' && result.tip_text.length > 0
    && result.tip_text.length <= 120 && /\d/.test(result.tip_text),
  `${name} tip_text is non-empty, at most 120 characters, and contains a digit`);
}
coverageCheck(coveredNoteCount >= 8,
  `served and direct scoreOrder note coverage sees at least 8 notes (saw ${coveredNoteCount})`);

const allScenarioResults = [
  ...Object.values(directResults),
  ...Object.values(additionalScenarios).map(scenario => scenario.result),
];
const producedScenarioCodes = new Set(allScenarioResults.flatMap(result =>
  (result.faults ?? []).map(fault => fault.code)));

console.log('\nstate fault-tally and training coverage:');
const stateBus = createBus();
const stateCtx = { bus: stateBus, state: state.createState() };
let shiftSummary = null;
let trainingChanged = null;
stateBus.on('shift:end', payload => { shiftSummary = payload?.summary ?? null; });
stateBus.on('training:changed', payload => { trainingChanged = payload; });
const emitServedNotes = notes => stateBus.emit('order:served', {
  order: { price: 0 }, score: 1, tip: 0, notes,
});

state.startShift(stateCtx);
const wrongSizeNote = 'Wrong size — Grande 473 ml, the ticket says Tall 354 ml';
const syrupNote = '3 pumps of syrup — the ticket says 2';
const milkTemperatureNote = 'Milk stopped at 50 °C — the band is 60 to 68 °C';
for (let i = 0; i < 3; i++) emitServedNotes([wrongSizeNote]);
for (let i = 0; i < 2; i++) emitServedNotes([syrupNote]);
emitServedNotes([milkTemperatureNote]);
emitServedNotes([syrupNote, syrupNote]);
state.endShift(stateCtx, 'time');
const expectedTopFaults = [
  { label: 'Wrong size', count: 3 },
  { label: 'Syrup count', count: 3 },
  { label: 'Milk temperature', count: 1 },
];
coverageCheck(sameValue(shiftSummary?.topFaults, expectedTopFaults),
  'shift topFaults has the expected ordered top three');
coverageCheck(stateCtx.state.faults?.syrup === 3,
  'duplicate syrup notes on one drink contribute exactly once');

state.startShift(stateCtx);
emitServedNotes([]);
state.endShift(stateCtx, 'time');
coverageCheck(sameValue(shiftSummary?.topFaults, []), 'a clean shift ends with no top faults');

state.startShift(stateCtx);
coverageCheck(stateCtx.state.training === true,
  'training defaults on when localStorage is unavailable');
for (let i = 0; i < 3; i++) stateBus.emit('order:lost', {});
coverageCheck(stateCtx.state.phase === 'playing' && stateCtx.state.lost === 3,
  'three training walk-outs are counted without ending the shift');
state.setTraining(stateCtx, false);
coverageCheck(stateCtx.state.training === false, 'setTraining disables training');
coverageCheck(sameValue(trainingChanged, { training: false }),
  'setTraining emits training:changed with {training:false}');
for (let i = 0; i < 3; i++) stateBus.emit('order:lost', {});
coverageCheck(stateCtx.state.phase === 'over', 'walk-outs end the shift after training is disabled');
coverageCheck(state.patienceScale({ training: true }) === 0.4,
  'training patience scale is 0.4');
coverageCheck(state.patienceScale({ training: false }) === 1,
  'non-training patience scale is 1');

function makeCustomerPatienceProbe(training) {
  const probeBus = createBus();
  const probeState = state.createState();
  probeState.phase = 'playing';
  probeState.training = training;
  const probeCtx = {
    THREE,
    scene: new THREE.Scene(),
    layout: LAYOUT,
    mat: { get: () => new THREE.MeshStandardMaterial() },
    tex: {},
    audio: { play() {} },
    bus: probeBus,
    rng: mulberry32(101),
    state: probeState,
  };
  let order = null;
  probeBus.on('order:new', payload => { order = payload?.order ?? null; });
  const module = customers.buildCustomers(probeCtx);
  probeCtx.scene.add(module.group);
  return { ctx: probeCtx, bus: probeBus, module, get order() { return order; } };
}

const trainingPatienceProbe = makeCustomerPatienceProbe(true);
const regularPatienceProbe = makeCustomerPatienceProbe(false);
const customerApproachDts = [0.1, 0.08, 0.06, 0.09];
for (let frame = 0; frame < 500
    && (!trainingPatienceProbe.order || !regularPatienceProbe.order); frame++) {
  const dt = customerApproachDts[frame % customerApproachDts.length];
  for (const probe of [trainingPatienceProbe, regularPatienceProbe]) {
    probe.ctx.state.tSec += dt;
    probe.module.update(dt, probe.ctx.state.tSec);
    probe.bus.emit('interact', { id: 'till', phase: 'tap' });
  }
}
coverageCheck(Boolean(trainingPatienceProbe.order && regularPatienceProbe.order),
  'real customer loops reach the pickup patience timer');
if (trainingPatienceProbe.order && regularPatienceProbe.order) {
  const pickupDts = [0.1, 0.075, 0.05, 0.1];
  for (const dt of pickupDts) {
    for (const probe of [trainingPatienceProbe, regularPatienceProbe]) {
      probe.ctx.state.tSec += dt;
      probe.module.update(dt, probe.ctx.state.tSec);
    }
  }
  const trainingDrain = trainingPatienceProbe.order.patience
    - trainingPatienceProbe.order.tLeft;
  const regularDrain = regularPatienceProbe.order.patience
    - regularPatienceProbe.order.tLeft;
  coverageCheck(Math.abs(trainingDrain - regularDrain * 0.4) < 1e-8,
    'real customer pickup patience drains at 40% in training');
}
trainingPatienceProbe.module.dispose();
regularPatienceProbe.module.dispose();

state.startShift(stateCtx);
const moneyBeforeTrainingServe = stateCtx.state.money;
const tipsBeforeTrainingServe = stateCtx.state.tips;
stateBus.emit('order:served', {
  order: { price: 12.34 }, score: 1, tip: 2.25, notes: [],
});
coverageCheck(stateCtx.state.training === true && stateCtx.state.money === moneyBeforeTrainingServe + 12.34
  && stateCtx.state.tips === tipsBeforeTrainingServe + 2.25,
'money and tips accrue while training is on');

const missingScenarioCodes = Object.keys(orders.FAULT_LABELS)
  .filter(code => code !== 'wrongMilk' && !producedScenarioCodes.has(code));
coverageCheck(missingScenarioCodes.length === 0,
  missingScenarioCodes.length
    ? `scoreOrder scenarios are missing FAULT_LABELS codes: ${missingScenarioCodes.join(', ')}`
    : 'scoreOrder scenarios cover every FAULT_LABELS code except wrongMilk');

console.log('\npickup overflow geometry coverage:');
const pileupBus = createBus();
const pileupState = state.createState();
pileupState.phase = 'playing';
pileupState.training = true;
const pileupCtx = {
  THREE,
  scene: new THREE.Scene(),
  layout: LAYOUT,
  mat: { get: () => new THREE.MeshStandardMaterial() },
  tex: {},
  audio: { play() {} },
  bus: pileupBus,
  rng: mulberry32(31337),
  state: pileupState,
};
const pileupCustomers = customers.buildCustomers(pileupCtx);
pileupCtx.scene.add(pileupCustomers.group);
const pickupGroups = new Map();
const orderSlot = LAYOUT.queue.order;
pileupBus.on('order:new', ({ order }) => {
  let nearest = null;
  let nearestDistance = Infinity;
  const assigned = new Set(pickupGroups.values());
  for (const group of pileupCustomers.group.children) {
    if (!group.visible || assigned.has(group)) continue;
    const dx = group.position.x - orderSlot.x;
    const dz = group.position.z - orderSlot.z;
    const distance = dx * dx + dz * dz;
    if (distance < nearestDistance) {
      nearest = group;
      nearestDistance = distance;
    }
  }
  if (order?.id != null && nearest) pickupGroups.set(order.id, nearest);
});
pileupBus.on('order:lost', ({ order }) => pickupGroups.delete(order?.id));

const merch = LAYOUT.terminal.merch;
const pickup = LAYOUT.queue.pickup;
const pickupCount = Math.max(0, Math.floor(pickup.n));
const lastPickupX = pickup.x + pickup.dx * Math.max(0, pickupCount - 1);
const pickupTolerance = 0.07;
let shelfIntrusionFrames = 0;
let eastOfPickupFrames = 0;
let peakPickupWaiting = 0;
const pileupDt = 1 / 30;
for (let frame = 0; frame < 300 / pileupDt; frame++) {
  state.updateState(pileupCtx, pileupDt);
  if (pileupState.phase === 'playing') {
    pileupBus.emit('interact', { id: 'till', phase: 'tap' });
  }
  pileupCustomers.update(pileupDt, pileupState.tSec);

  for (const group of pileupCustomers.group.children) {
    if (!group.visible) continue;
    const { x, z } = group.position;
    if (x > merch.x0 && x < merch.x1 && z > merch.z0 && z < merch.z1) {
      shelfIntrusionFrames++;
    }
  }

  let waitingNow = 0;
  for (const group of pickupGroups.values()) {
    if (!group.visible || group.position.z < pickup.z - pickupTolerance) continue;
    waitingNow++;
    if (group.position.x > lastPickupX + pickupTolerance) eastOfPickupFrames++;
  }
  peakPickupWaiting = Math.max(peakPickupWaiting, waitingNow);
}
pileupCustomers.dispose();
coverageCheck(shelfIntrusionFrames === 0,
  'training pile-up keeps every visible customer body centre out of the merch shelf');
coverageCheck(eastOfPickupFrames === 0,
  'customers waiting at pickup stay at or west of the last pickup slot');
coverageCheck(peakPickupWaiting > pickupCount,
  `training pile-up exceeds the ${pickupCount} pickup slots (peak ${peakPickupWaiting})`);

if (coverageFailures.length) process.exitCode = 1;

process.exit((fail || process.exitCode) ? 1 : 0);
