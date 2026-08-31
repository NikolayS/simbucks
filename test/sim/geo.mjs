import { LAYOUT } from '../../src/core/layout.js';
import { createBus } from '../../src/core/bus.js';
import { createState, startShift, updateState } from '../../src/game/state.js';
import { scoreOrder, setShiftTime } from '../../src/game/orders.js';
const { buildCustomers } = await import('./customers.sim.js');

let s = 20260830 >>> 0;
const rng = () => (s = (1664525*s + 1013904223) >>> 0) / 4294967296;
const bus = createBus();
const ctx = { bus, rng, layout: LAYOUT, state: createState() };
const cust = buildCustomers(ctx);
const pending = [];
bus.on('order:new', ({order}) => pending.push(order));
bus.on('order:lost', ({order}) => { const i = pending.findIndex(o=>o.id===order?.id); if(i>=0) pending.splice(i,1); });
startShift(ctx);

const R = LAYOUT.rails.a, M = LAYOUT.terminal.merch;
let railCross = 0, gapUse = 0, belowFloor = 0, minY = Infinity, maxY = -Infinity, behindCounter = 0, inMerch = 0, maxChildren = 0, peak = 0, nan = 0;
const prev = new Map();
let building = null, buildLeft = 0;
const dt = 1/30;
for (let step = 0; step < 480/dt + 30; step++) {
  updateState(ctx, dt); setShiftTime(ctx.state.tSec);
  if (ctx.state.phase === 'playing' && pending.length < 2) bus.emit('interact', { id:'till', phase:'tap' });
  if (!building && pending.length) { building = pending[0]; buildLeft = 24; }
  if (building) { buildLeft -= dt; if (buildLeft <= 0) {
    const steps = building.steps.map(st => ({station:st.station, param:st.param, quality:0.95}));
    const built = { size: building.size, steps, drink: building.drink, seconds: 24 };
    const r = scoreOrder(building, built);
    pending.splice(pending.indexOf(building),1);
    bus.emit('order:served', { order: building, score: r.score, tip: r.tip, built }); building = null; } }
  cust.update(dt, ctx.state.tSec);

  let visible = 0;
  for (const g of cust.group.children) {
    if (!g.visible) continue; visible++;
    const p = g.position;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.z) || !Number.isFinite(g.rotation.y)) nan++;
    if (p.z < 2.2 - 1e-6) behindCounter++;
    if (p.y < -1e-9) belowFloor++;
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    if (p.x > M.x0 - 0.35 && p.x < M.x1 && p.z > M.z0 && p.z < M.z1) inMerch++;
    const q = prev.get(g);
    if (q && ((q.z - R.z) * (p.z - R.z) < 0)) {
      const x = (p.x + q.x) / 2;
      const inGap = R.gap && x >= R.gap.x0 && x <= R.gap.x1;
      if (!inGap && x >= R.x0 - 0.3 && x <= R.x1 + 0.3) railCross++; else if (inGap) gapUse++;
    }
    prev.set(g, { x: p.x, z: p.z });
  }
  peak = Math.max(peak, visible);
  maxChildren = Math.max(maxChildren, cust.group.children.length);
  if (ctx.state.phase !== 'playing') break;
}
console.log('illegal rail-A crossings          :', railCross, railCross ? 'FAIL' : 'ok');
console.log('legal passages through the gap    :', gapUse, gapUse ? 'ok' : 'FAIL (gap unused)');
console.log('frames behind the counter (z<2.2):', behindCounter, behindCounter ? 'FAIL' : 'ok');
console.log('frames standing in the merch shelf:', inMerch, inMerch ? 'FAIL' : 'ok');
console.log('frames with feet below the floor  :', belowFloor, belowFloor ? 'FAIL' : 'ok', '| y range', minY.toFixed(4), 'to', maxY.toFixed(4));
console.log('non-finite transforms            :', nan, nan ? 'FAIL' : 'ok');
console.log('peak visible customers           :', peak, '(cap 14)');
console.log('person objects ever allocated    :', maxChildren, '(pool cap 18) ->', maxChildren <= 18 ? 'ok recycling' : 'FAIL');
console.log('served', ctx.state.served, 'lost', ctx.state.lost, 'money £'+ctx.state.money.toFixed(2), 'rank', ctx.state.rank, 'clock', ctx.state.clock);

// restart + dispose
startShift(ctx);
for (let i=0;i<600;i++){ updateState(ctx,dt); cust.update(dt, ctx.state.tSec); }
console.log('after restart: tSec', ctx.state.tSec.toFixed(1), 'served', ctx.state.served, 'visible', cust.group.children.filter(c=>c.visible).length);
cust.dispose();
bus.emit('interact', {id:'till', phase:'tap'}); bus.emit('rush', {size:4}); cust.update(dt, 1);
console.log('post-dispose children:', cust.group.children.length, '| survived stray events: yes');
