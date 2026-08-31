import { installDom } from './dom.js';

installDom();

const THREE = await import('three');
const { LAYOUT } = await import('../src/core/layout.js');
const { createBus } = await import('../src/core/bus.js');
const { createState, startShift, updateState } = await import('../src/game/state.js');
const { scoreOrder, setShiftTime } = await import('../src/game/orders.js');
const { buildCustomers } = await import('../src/game/customers.js');

const CONFIGS = [[18, 2], [24, 2], [28, 2], [34, 2], [45, 1], [60, 1]];
const SEEDS = [7, 99, 4242];

function run(buildTime, maxHold, seed, training) {
  let s = seed >>> 0;
  const rng = () => (s = (1664525 * s + 1013904223) >>> 0) / 4294967296;
  const bus = createBus();
  const ctx = {
    THREE,
    scene: new THREE.Scene(),
    layout: LAYOUT,
    mat: { get: () => new THREE.MeshStandardMaterial() },
    tex: {},
    audio: { play() {} },
    bus,
    rng,
    state: createState(),
  };
  const cust = buildCustomers(ctx);
  ctx.scene.add(cust.group);
  const pending = [];
  let arrivals = 0, walkouts = 0, queueLost = 0, ended = null, endT = 0;
  bus.on('order:new', ({ order }) => { pending.push(order); arrivals++; });
  bus.on('order:lost', ({ order, reason }) => {
    const i = pending.findIndex(o => o.id === order?.id); if (i >= 0) pending.splice(i, 1);
    if (reason === 'walkout') walkouts++; else queueLost++;
  });
  bus.on('shift:end', ({ summary }) => { if (!ended) { ended = summary; endT = ctx.state.tSec; } });
  startShift(ctx);
  ctx.state.training = training;

  let building = null, buildLeft = 0;
  const dt = 1 / 30;
  for (let step = 0; step < 480 / dt + 60; step++) {
    updateState(ctx, dt);
    setShiftTime(ctx.state.tSec);
    // fake player: take an order whenever holding fewer than maxHold
    if (ctx.state.phase === 'playing' && pending.length < maxHold) bus.emit('interact', { id: 'till', phase: 'tap' });
    if (!building && pending.length) { building = pending[0]; buildLeft = buildTime; }
    if (building) {
      buildLeft -= dt;
      if (buildLeft <= 0) {
        const steps = [];
        for (const st of building.steps) {
          if (st.station === 'steamWand' && st.param === 'pour'
              && !building.steps.some(x => x.station === 'steamWand' && x.param === 'steam')) {
            steps.push({ station: 'steamWand', param: 'steam', quality: 1 });
          }
          steps.push({ station: st.station, param: st.param, quality: 0.95 });
        }
        const built = { size: building.size, steps, seconds: buildTime };
        const r = scoreOrder(building, built);
        const i = pending.indexOf(building); if (i >= 0) pending.splice(i, 1);
        bus.emit('order:served', { order: building, score: r.score, tip: r.tip, built });
        building = null;
      }
    }
    cust.update(dt, ctx.state.tSec);
    if (ctx.state.phase !== 'playing') break;
  }
  const st = ctx.state;
  return {
    buildTime,
    served: st.served,
    lost: st.lost,
    walkouts,
    queueLost,
    money: st.money,
    tips: st.tips,
    rep: st.rep,
    rank: st.rank,
    ended: ended?.reason,
    endT: endT.toFixed(0),
    ordersTaken: st.ordersTaken,
    arrivals,
  };
}

function printTable(training, rows) {
  console.log(`\nTraining ${training ? 'ON' : 'OFF'}`);
  console.log('buildT hold seed | served lost(walk/queue) | money  tips  rep rank            | end@   reason');
  for (const { hold, seed, result: r } of rows) {
    console.log(String(r.buildTime).padStart(5), String(hold).padStart(4), String(seed).padStart(5), '|',
      String(r.served).padStart(6), String(r.lost).padStart(4), `(${r.walkouts}/${r.queueLost})`.padStart(7), '|',
      ('£' + r.money.toFixed(2)).padStart(7), ('£' + r.tips.toFixed(2)).padStart(6), String(r.rep).padStart(4), (r.rank || '').padEnd(14), '|',
      String(r.endT).padStart(4) + 's', r.ended);
  }
}

function sweep(training) {
  const rows = [];
  for (const [buildTime, hold] of CONFIGS) {
    for (const seed of SEEDS) rows.push({ hold, seed, result: run(buildTime, hold, seed, training) });
  }
  printTable(training, rows);
  return rows;
}

const regular = sweep(false);
const training = sweep(true);
const failures = [];

function resultsAt(rows, buildTime) {
  return rows.filter(row => row.result.buildTime === buildTime);
}

function check(message, passed) {
  console.log(`  ${passed ? 'ok  ' : 'FAIL'} ${message}`);
  if (!passed) failures.push(message);
}

console.log('\nBalance checks');
check('competent 24 s player reaches time with at least 14 served and no losses',
  resultsAt(regular, 24).every(({ result }) => result.ended === 'time'
    && Number(result.endT) >= 479 && result.lost === 0 && result.served >= 14));
check('struggling 34 s player ends in walkouts before 460 s without training',
  resultsAt(regular, 34).every(({ result }) => result.ended === 'walkouts'
    && Number(result.endT) < 460));
check('a player who dies without training survives with it',
  resultsAt(training, 34).every(({ result }) => result.ended === 'time'
    && Number(result.endT) >= 479 && result.lost === 0));
check('training never ends a shift in walkouts',
  training.every(({ result }) => result.ended !== 'walkouts'));
check('training at 60 s still earns money and tips',
  resultsAt(training, 60).every(({ result }) => result.money > 0 && result.tips > 0));
check('both modes serve at least as many drinks at 18 s as at 60 s',
  [regular, training].every(rows => SEEDS.every(seed => {
    const fast = rows.find(row => row.seed === seed && row.result.buildTime === 18)?.result;
    const slow = rows.find(row => row.seed === seed && row.result.buildTime === 60)?.result;
    return fast && slow && fast.served >= slow.served;
  })));

console.log(`\n${6 - failures.length} passed, ${failures.length} failed, 6 total`);
process.exit(failures.length ? 1 : 0);
