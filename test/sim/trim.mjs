import { orderText } from '../../src/game/orders.js';
import { DRINKS, recipeFor } from '../../src/game/menu.js';
const capp = DRINKS.find(d=>d.id==='cappuccino');
const steps = recipeFor(capp,'venti');
const mk = mods => ({ drink: capp, size:'venti', name:'BARTHOLOMEW', steps, mods,
  food:{name:'Pain au Chocolat', price:2.95} });
const M = {
  decaf:{id:'decaf',label:'decaf'}, oat:{id:'oat',label:'oat'},
  extraHot:{id:'extraHot',label:'extra hot'}, extraShot:{id:'extraShot',label:'extra shot'},
  syrup:{id:'syrup',label:'4 pumps gingerbread',pumps:4,flavour:'gingerbread',baseSyrup:false},
};
const sets = [
  ['none', []],
  ['1 mod', [M.extraShot]],
  ['3 mods', [M.decaf, M.oat, M.extraShot]],
  ['4 mods', [M.decaf, M.oat, M.extraHot, M.extraShot]],
  ['5 mods + syrup', [M.decaf, M.oat, M.extraHot, M.extraShot, M.syrup]],
];
let fails = 0;
for (const [label, mods] of sets) {
  const t = orderText(mk(mods));
  const hasFoam = /dry foam/.test(t);
  const hasName = /for BARTHOLOMEW/.test(t);
  if (!hasFoam || !hasName || t.length > 90) fails++;
  console.log(`${label.padEnd(15)} ${String(t.length).padStart(3)}ch foam:${hasFoam?'Y':'N'} name:${hasName?'Y':'N'}  ${t}`);
}
console.log(fails ? `FAIL (${fails})` : 'ok — foam and name survive every trim level');
