import { makeOrder, scoreOrder, setShiftTime } from '../../src/game/orders.js';
let s=99; const rng=()=>(s=(1664525*s+1013904223)>>>0)/4294967296;
const ctx={rng,state:{difficulty:0.4,tSec:100}};
for (let i=0;i<5;i++){
  const o = makeOrder(ctx,0.4);
  const steps = o.steps.map(st=>({station:st.station,param:st.param,quality:0.95}));
  setShiftTime(124);
  const r = scoreOrder(o,{size:o.size,steps,drink:o.drink,seconds:24});
  console.log(o.text, '\n   score',r.score.toFixed(2),'tip',r.tip.toFixed(2),'payout',r.payout.toFixed(2),'| t0',o.t0,'patience',o.patience,'| notes:',r.notes.join(' | '));
}
