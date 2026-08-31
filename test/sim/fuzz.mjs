import { scoreOrder, makeOrder, orderText } from '../../src/game/orders.js';
import { DRINKS, recipeFor, pickDrink } from '../../src/game/menu.js';
const bad = [undefined, null, 0, '', 'latte', [], {}, {drink:null}, {drink:'nope'}, {drink:{}},
  {drink:'latte', steps:null, size:undefined}, {drink:DRINKS[2]}, Object.freeze({drink:DRINKS[2],mods:Object.freeze([])}),
  {drink:DRINKS[2], steps:'x', size:'venti', price:'a', patience:0, t0:NaN, mods:null}];
let fails = 0, n = 0;
for (const o of bad) for (const b of bad.concat([{steps:[{}]}, {steps:[{station:'x',param:1,quality:NaN}]},
    {size:'grande', steps:recipeFor(DRINKS[2],'grande'), drinkId:'latte'},
    {size:'grande', steps:recipeFor(DRINKS[2],'grande'), drink:null, drinkId:null}])) {
  n++;
  try {
    const r = scoreOrder(o, b);
    const ok = r && Number.isFinite(r.score) && Number.isFinite(r.tip) && typeof r.correct === 'boolean'
      && Array.isArray(r.notes) && Number.isFinite(r.payout) && r.score>=0 && r.score<=1 && r.tip>=0;
    if (!ok) { fails++; console.log('BAD SHAPE', JSON.stringify(o), JSON.stringify(b), JSON.stringify(r)); }
  } catch (e) { fails++; console.log('THREW', e.message, JSON.stringify(o), JSON.stringify(b)); }
}
console.log(`scoreOrder fuzz: ${n} combos, ${fails} failures`);

// makeOrder / orderText with broken contexts
let f2 = 0, n2 = 0;
for (const ctx of [undefined, null, {}, {rng:null}, {rng:()=>NaN}, {rng:()=>{throw new Error('x')}}, {state:null}, {rng:Math.random, state:{}}])
  for (const d of [undefined, null, NaN, -5, 0, 0.5, 1, 99, 'x']) {
    n2++;
    try { const o = makeOrder(ctx, d);
      const t = orderText(o);
      if (!o || !o.id || !o.drink || !Array.isArray(o.steps) || !Number.isFinite(o.price) || !Number.isFinite(o.patience) || typeof t !== 'string') { f2++; console.log('BAD ORDER', JSON.stringify(ctx), d, JSON.stringify(o)?.slice(0,120)); }
    } catch (e) { f2++; console.log('THREW', e.message, String(ctx), d); }
  }
console.log(`makeOrder fuzz: ${n2} combos, ${f2} failures`);
// determinism
const mk = (seed) => { let s=seed; const rng=()=>(s=(1664525*s+1013904223)>>>0)/4294967296; const c={rng,state:{difficulty:0.5,tSec:100}}; return Array.from({length:20},()=>makeOrder(c,0.5).text); };
console.log('deterministic:', JSON.stringify(mk(5))===JSON.stringify(mk(5)), '| differs by seed:', JSON.stringify(mk(5))!==JSON.stringify(mk(6)));
