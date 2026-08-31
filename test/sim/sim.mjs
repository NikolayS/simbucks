import { LAYOUT } from '../../src/core/layout.js';
import { createBus } from '../../src/core/bus.js';
import { createState, startShift, updateState } from '../../src/game/state.js';
import { scoreOrder, setShiftTime } from '../../src/game/orders.js';
import { recipeFor } from '../../src/game/menu.js';
const { buildCustomers } = await import('./customers.sim.js');

function run(buildTime, maxHold, seed, verbose) {
  let s = seed >>> 0;
  const rng = () => (s = (1664525*s + 1013904223) >>> 0) / 4294967296;
  const bus = createBus();
  const ctx = { bus, rng, layout: LAYOUT, state: createState() };
  const cust = buildCustomers(ctx);
  const pending = [];
  let arrivals = 0, walkouts = 0, queueLost = 0, ended = null, endT = 0;
  bus.on('order:new', ({order}) => { pending.push(order); arrivals++; });
  bus.on('order:lost', ({order, reason}) => {
    const i = pending.findIndex(o => o.id === order?.id); if (i >= 0) pending.splice(i,1);
    if (reason === 'walkout') walkouts++; else queueLost++;
  });
  bus.on('shift:end', ({summary}) => { if (!ended) { ended = summary; endT = ctx.state.tSec; } });
  startShift(ctx);
  ctx.state.training = process.env.TRAINING === '1';

  let building = null, buildLeft = 0, spawned = 0, maxQ = 0;
  const origSpawnCount = () => cust.group.children.length;
  const dt = 1/30;
  for (let step = 0; step < 480/dt + 60; step++) {
    updateState(ctx, dt);
    setShiftTime(ctx.state.tSec);
    // fake player: take an order whenever holding fewer than maxHold
    if (ctx.state.phase === 'playing' && pending.length < maxHold) bus.emit('interact', { id:'till', phase:'tap' });
    if (!building && pending.length) { building = pending[0]; buildLeft = buildTime; }
    if (building) {
      buildLeft -= dt;
      if (buildLeft <= 0) {
        const d = building.drink;
        const steps = [];
        for (const st of building.steps) {
          if (st.station === 'steamWand' && st.param === 'pour' && !building.steps.some(x=>x.station==='steamWand'&&x.param==='steam')) steps.push({station:'steamWand',param:'steam',quality:1});
          steps.push({ station: st.station, param: st.param, quality: 0.95 });
        }
        const built = { size: building.size, steps, seconds: buildTime };
        const r = scoreOrder(building, built);
        const i = pending.indexOf(building); if (i>=0) pending.splice(i,1);
        bus.emit('order:served', { order: building, score: r.score, tip: r.tip, built });
        building = null;
      }
    }
    cust.update(dt, ctx.state.tSec);
    if (ctx.state.phase !== 'playing') break;
  }
  const st = ctx.state;
  return { buildTime, served: st.served, lost: st.lost, walkouts, queueLost, money: st.money, tips: st.tips,
           rep: st.rep, rank: st.rank, ended: ended?.reason, endT: endT.toFixed(0), ordersTaken: st.ordersTaken, arrivals };
}

console.log('buildT hold seed | served lost(walk/queue) | money  tips  rep rank            | end@   reason');
for (const [bt, hold] of [[18,2],[24,2],[28,2],[34,2],[45,1],[60,1]]) {
  for (const seed of [7, 99, 4242]) {
    const r = run(bt, hold, seed);
    console.log(String(bt).padStart(5), String(hold).padStart(4), String(seed).padStart(5), '|',
      String(r.served).padStart(6), String(r.lost).padStart(4), `(${r.walkouts}/${r.queueLost})`.padStart(7), '|',
      ('£'+r.money.toFixed(2)).padStart(7), ('£'+r.tips.toFixed(2)).padStart(6), String(r.rep).padStart(4), (r.rank||'').padEnd(14), '|',
      String(r.endT).padStart(4)+'s', r.ended);
  }
}
