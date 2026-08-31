import { LAYOUT as L } from '../../src/core/layout.js';
const p = L.queue.pickup, rb = L.rails.b, m = L.terminal.merch;
let n = 0; while (n < p.n && p.x + p.dx * n <= rb.x0) n++;
console.log('layout pickup.n =', p.n, '| slots customers.js will use =', n);
console.log('slot x positions:', Array.from({length:n}, (_,j) => (p.x + p.dx*j).toFixed(2)).join(', '));
console.log('rail B x0 =', rb.x0, '| merch x0 =', m.x0, '| last slot clears merch by', (m.x0 - (p.x + p.dx*(n-1))).toFixed(2), 'm');
