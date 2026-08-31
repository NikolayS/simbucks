import { makeOrder } from '../../src/game/orders.js';
const FOAMY = new Set(['latte','flatWhite','cappuccino']);
let missing = 0, checked = 0, longest = '', examples = [];
for (let seed = 1; seed <= 60; seed++) {
  let s = seed >>> 0; const rng = () => (s = (1664525*s + 1013904223) >>> 0) / 4294967296;
  const ctx = { rng, state: { difficulty: 1, tSec: 400 } };
  for (let i = 0; i < 500; i++) {
    const o = makeOrder(ctx, 1);
    if (o.text.length > longest.length) longest = o.text;
    if (!FOAMY.has(o.drink.id)) continue;
    checked++;
    const noFoamMod = o.mods.some(m => m.id === 'noFoam');
    const stated = /wet foam|microfoam|dry foam/.test(o.text) || (noFoamMod && /no foam/.test(o.text));
    if (!stated) { missing++; if (examples.length < 5) examples.push(`${o.text.length}ch  ${o.text}`); }
    if (!o.text.includes(`for ${o.name}`)) { console.log('NAME LOST:', o.text); }
  }
}
console.log(`foam-bearing tickets checked: ${checked}`);
console.log(`tickets missing their foam instruction: ${missing}`, missing ? 'FAIL' : 'ok');
for (const e of examples) console.log('   ', e);
console.log(`longest ticket text: ${longest.length} chars`);
console.log('   ', longest);
