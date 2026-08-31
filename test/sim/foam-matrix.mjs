import { DRINKS, recipeFor, foamLabel } from '../../src/game/menu.js';
import { scoreOrder, makeOrder, setShiftTime } from '../../src/game/orders.js';

// emitFoam=false simulates stations.js BEFORE agent-play's selector lands
function build(drinkId, size, emitFoam) {
  const d = DRINKS.find(x => x.id === drinkId);
  const rec = recipeFor(d, size);
  const steps = [];
  for (const st of rec) {
    if (st.station === 'steamWand' && st.param === 'steam') {
      const s = { station:'steamWand', param:'steam', quality:1 };
      if (emitFoam) s.foam = st.foam ?? 'micro';   // selector default is micro
      steps.push(s); continue;
    }
    steps.push({ station: st.station, param: st.param, quality: 1 });
  }
  return { size, steps };  // no drink: exercise the inference fallback
}
const ids = DRINKS.map(d=>d.id);
function matrix(emitFoam) {
  let fp = 0;
  const rows = [];
  for (const ti of ids) {
    const td = DRINKS.find(d=>d.id===ti); const row = [];
    for (const bi of ids) {
      const bd = DRINKS.find(d=>d.id===bi);
      const size = (td.size.includes('grande') && bd.size.includes('grande')) ? 'grande' : 'tall';
      if (!td.size.includes(size) || !bd.size.includes(size)) { row.push('-'); continue; }
      const o = { id:'x', drink:td, size, steps:recipeFor(td,size), price:td.price, patience:80, t0:0, mods:[] };
      setShiftTime(5);
      const r = scoreOrder(o, build(bi, size, emitFoam));
      if (ti !== bi && r.correct) fp++;
      row.push(r.correct ? (ti===bi?'=':'X') : '.');
    }
    rows.push(ti.padEnd(20) + row.join(' '));
  }
  return { fp, rows };
}
for (const [label, emit] of [['stations WITHOUT foam (additive check)', false], ['stations WITH foam selector', true]]) {
  const m = matrix(emit);
  console.log('===', label, '-> false positives:', m.fp);
  for (const r of m.rows) if (/latte|flatWhite|cappuccino/i.test(r.split(' ')[0])) console.log('  ' + r);
}
console.log('\n=== the three milk drinks, right drink wrong foam ===');
for (const [t, b] of [['latte','cappuccino'], ['cappuccino','latte'], ['flatWhite','latte']]) {
  const td = DRINKS.find(d=>d.id===t), bd = DRINKS.find(d=>d.id===b);
  const o = { id:'x', drink:td, size:'grande', steps:recipeFor(td,'grande'), price:4.10, patience:80, t0:0, mods:[] };
  const built = build(b,'grande',true); built.drink = td;   // right drink, wrong aeration
  setShiftTime(5);
  const r = scoreOrder(o, built);
  console.log(`  ${t} ticket, ${bd.recipe.find(s=>s.foam)?.foam} foam -> score ${r.score.toFixed(2)} correct ${r.correct} | ${r.notes.join(', ')}`);
}
console.log('\n=== foam on tickets ===');
let s=7; const rng=()=>(s=(1664525*s+1013904223)>>>0)/4294967296;
const ctx={rng,state:{difficulty:0.6,tSec:200}};
let shown=0;
for (let i=0;i<400 && shown<6;i++){ const o=makeOrder(ctx,0.6);
  if (/Latte|Flat White|Cappuccino/.test(o.drink.name)) { console.log('  '+o.text); shown++; } }
console.log('\nfoamLabel:', ['wet','micro','dry','none',undefined].map(f=>`${f}->"${foamLabel(f)}"`).join(' '));
