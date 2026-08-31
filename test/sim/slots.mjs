import { LAYOUT } from '../../src/core/layout.js';
import { createBus } from '../../src/core/bus.js';
import { createState, startShift, updateState } from '../../src/game/state.js';
const { buildCustomers } = await import('./customers.sim.js');
let s = 31337; const rng = () => (s = (1664525*s + 1013904223) >>> 0) / 4294967296;
const bus = createBus();
const ctx = { bus, rng, layout: LAYOUT, state: createState() };
const cust = buildCustomers(ctx);
const pending = [];
bus.on('order:new', ({order}) => pending.push(order));
startShift(ctx);
// player takes every order but never builds one: everyone piles into the pickup area
const M = LAYOUT.terminal.merch, dt = 1/30;
const seen = new Set(); let deepIntrusion = 0, maxX = -Infinity;
for (let i = 0; i < 300/dt; i++) {
  updateState(ctx, dt);
  if (ctx.state.phase === 'playing') bus.emit('interact', { id:'till', phase:'tap' });
  cust.update(dt, ctx.state.tSec);
  for (const g of cust.group.children) {
    if (!g.visible) continue;
    if (g.position.z > 2.4 && g.position.x > 2.5) { seen.add(g.position.x.toFixed(2)); maxX = Math.max(maxX, g.position.x); }
    // a real intrusion: body centre inside the shelf proper
    if (g.position.x > M.x0 && g.position.x < M.x1 && g.position.z > M.z0 && g.position.z < M.z1) deepIntrusion++;
  }
  if (ctx.state.phase !== 'playing') break;
}
const slots = [...seen].map(Number).filter(x => x >= 3.15).sort((a,b)=>a-b);
console.log('distinct pickup x positions occupied:', slots.join(', '));
console.log('furthest east a customer stood      :', maxX.toFixed(2), '(merch shelf starts at', M.x0 + ')');
console.log('frames with body centre in the shelf:', deepIntrusion, deepIntrusion ? 'FAIL' : 'ok');
console.log('orders outstanding at end           :', pending.length, '| lost', ctx.state.lost, '| ended', ctx.state.phase);
