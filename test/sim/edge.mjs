import { scoreOrder } from '../../src/game/orders.js';
import { DRINKS, recipeFor } from '../../src/game/menu.js';
const latte = DRINKS.find(d=>d.id==='latte');
const built = { size:'grande', drink:'latte', drinkId:'latte',
  steps: recipeFor(latte,'grande').map(s=>({station:s.station,param:s.param,quality:1})) };
// agent-play's hand-built order with an empty steps array
const a = scoreOrder({id:'x',drink:latte,size:'grande',steps:[],price:4.10,patience:80,t0:0,mods:[]}, built);
console.log('empty order.steps      ->', a.score.toFixed(2), 'correct', a.correct, '|', a.notes.join(', ') || 'no notes');
// object drink (the branch agent-play reported)
const b = scoreOrder({id:'x',drink:latte,size:'grande',steps:recipeFor(latte,'grande'),price:4.10,patience:80,t0:0,mods:[]},
  { size:'grande', drink:latte, steps: built.steps });
console.log('built.drink as object  ->', b.score.toFixed(2), 'correct', b.correct, '|', b.notes.join(', ') || 'no notes');
// id string only (what stations sends today)
const c = scoreOrder({id:'x',drink:latte,size:'grande',steps:recipeFor(latte,'grande'),price:4.10,patience:80,t0:0,mods:[]}, built);
console.log('built.drink as id      ->', c.score.toFixed(2), 'correct', c.correct, '|', c.notes.join(', ') || 'no notes');
