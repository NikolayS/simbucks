import { DRINKS, recipeFor, pickDrink } from '../../src/game/menu.js';
import { makeOrder, scoreOrder, orderText, setShiftTime, stepSimilarity } from '../../src/game/orders.js';

let s = 12345;
const rng = () => (s = (1664525*s + 1013904223) >>> 0) / 4294967296;
const ctx = { rng, state: { difficulty: 0, tSec: 0 } };

// build a "built" payload exactly the way stations.js would
function build(drinkId, size, opts = {}) {
  const d = DRINKS.find(x => x.id === drinkId);
  const steps = [];
  for (const st of recipeFor(d, size)) {
    if (st.station === 'grinder') { steps.push({station:'grinder',param:'grind',quality:opts.grind??1}); continue; }
    if (st.station === 'espresso') { steps.push({station:'espresso',param:'pull',quality:opts.shot??1}); continue; }
    if (st.station === 'steamWand' && st.param === 'steam') { steps.push({station:'steamWand',param:'steam',quality:opts.steam??1}); continue; }
    if (st.station === 'steamWand' && st.param === 'pour') {
      // hardware always steams before pouring
      if (!recipeFor(d,size).some(x=>x.station==='steamWand'&&x.param==='steam')) steps.push({station:'steamWand',param:'steam',quality:opts.steam??1});
      steps.push({station:'steamWand',param:'pour',quality:1}); continue;
    }
    steps.push({ station: st.station, param: st.param, quality: 1 });
  }
  return { size, steps, lidded:true, quality:1, seconds: opts.seconds ?? 10 };
}

console.log('=== recipe buildability (every ticket step must be producible by stations) ===');
const PRODUCIBLE = new Set(['cupStack:cup','cupStack:lid','grinder:grind','espresso:pull','steamWand:steam','steamWand:pour','blender:blend','iceWell:ice','sink:water','coldBrewTap:tap','superauto:shot']);
for (const d of DRINKS) {
  const bad = d.recipe.filter(st => st.station !== 'syrupRack' && !PRODUCIBLE.has(st.station+':'+st.param));
  console.log((bad.length?'FAIL':'ok  '), d.id.padEnd(20), d.recipe.length+' steps', bad.map(b=>b.station+':'+b.param).join(','));
}

console.log('\n=== perfect build of every drink, served fast ===');
for (const d of DRINKS) {
  const size = d.size.includes('grande') ? 'grande' : d.size[0];
  const o = { id:'x', drink:d, size, steps: recipeFor(d, size), price: d.price, patience: 80, t0: 0, mods: [] };
  setShiftTime(10);
  const r = scoreOrder(o, build(d.id, size, { seconds: 10 }));
  console.log((r.score>0.95&&r.correct?'ok  ':'FAIL'), d.id.padEnd(20), 'score', r.score.toFixed(2), 'tip', r.tip.toFixed(2), 'payout', r.payout.toFixed(2), 'correct', r.correct, r.notes.join(' | '));
}

console.log('\n=== cross-drink confusion matrix (built X vs ticket Y -> correct?) ===');
const ids = DRINKS.map(d=>d.id);
let bad = 0;
for (const ti of ids) {
  const td = DRINKS.find(d=>d.id===ti);
  const row = [];
  for (const bi of ids) {
    const bd = DRINKS.find(d=>d.id===bi);
    const size = td.size.includes('grande') && bd.size.includes('grande') ? 'grande' : 'tall';
    if (!td.size.includes(size) || !bd.size.includes(size)) { row.push('-'); continue; }
    const o = { id:'x', drink:td, size, steps: recipeFor(td, size), price: td.price, patience: 80, t0: 0, mods: [] };
    setShiftTime(5);
    const r = scoreOrder(o, build(bi, size, { seconds: 5 }));
    const ok = r.correct;
    if (ti !== bi && ok) bad++;
    row.push(ok ? (ti===bi?'=':'X') : '.');
  }
  console.log(ti.padEnd(20), row.join(' '));
}
console.log('false positives (wrong drink accepted):', bad);

console.log('\n=== error cases (ticket grande latte, patience 80) ===');
const latte = DRINKS.find(d=>d.id==='latte');
const tick = () => ({ id:'x', drink:latte, size:'grande', steps: recipeFor(latte,'grande'), price:4.10, patience:80, t0:0, mods:[] });
const cases = {
  'perfect fast':        [build('latte','grande'), 5],
  'perfect slow (70s)':  [build('latte','grande'), 70],
  'wrong size (tall)':   [build('latte','tall'), 5],
  'scorched milk':       [build('latte','grande',{steam:0.2}), 5],
  'bitter shot':         [build('latte','grande',{shot:0.25}), 5],
  'no lid':              [(()=>{const b=build('latte','grande'); b.steps=b.steps.filter(s=>!(s.station==='cupStack'&&s.param==='lid')); return b;})(), 5],
  'made an americano':   [build('americano','grande'), 5],
  'empty cup':           [{size:'grande',steps:[]}, 5],
};
for (const [k,[b,t]] of Object.entries(cases)) {
  setShiftTime(t);
  const r = scoreOrder(tick(), b);
  console.log(k.padEnd(22), 'score', r.score.toFixed(2), 'tip', r.tip.toFixed(2), 'payout', r.payout.toFixed(2), 'correct', String(r.correct).padEnd(5), r.notes.join(' | '));
}

console.log('\n=== generated tickets ===');
for (const dd of [0, 0.5, 1]) {
  ctx.state.difficulty = dd; ctx.state.tSec = dd*400;
  let pat = 0, steps = 0, mods = 0, price = 0;
  for (let i=0;i<400;i++) { const o = makeOrder(ctx, dd); pat+=o.patience; steps+=o.steps.length; mods+=o.mods.length; price+=o.price;
    if (i<4) console.log('  d='+dd, JSON.stringify(o.text)); }
  console.log(`  d=${dd} avg patience ${(pat/400).toFixed(1)}s steps ${(steps/400).toFixed(1)} mods ${(mods/400).toFixed(2)} price £${(price/400).toFixed(2)}`);
}
console.log('\n=== longest ticket text ===');
let longest='';
ctx.state.difficulty=1;
for (let i=0;i<3000;i++){ const o=makeOrder(ctx,1); if(o.text.length>longest.length) longest=o.text; }
console.log(longest.length, JSON.stringify(longest));
