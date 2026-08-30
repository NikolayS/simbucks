// With a Latte AND a Cappuccino AND a Flat White all queued, the foam selection alone must decide
// which ticket the cup satisfies.
import { installDom } from './dom.js';
const dom = installDom();
const THREE = await import('three');
const REPO = new URL('../src', import.meta.url).href;
const { LAYOUT } = await import(REPO + '/core/layout.js');
const { createBus } = await import(REPO + '/core/bus.js');
const { mulberry32 } = await import(REPO + '/core/rng.js');
const controls = await import(REPO + '/player/controls.js');
const handsMod = await import(REPO + '/player/hands.js');
const stationsMod = await import(REPO + '/game/stations.js');
const menu = await import(REPO + '/game/menu.js');
const orders = await import(REPO + '/game/orders.js');

const canvas = dom.makeElement('canvas');
const camera = new THREE.PerspectiveCamera(66, 16/9, 0.05, 220);
camera.position.set(0, LAYOUT.player.eye, -0.6);
const scene = new THREE.Scene();
const bus = createBus();
const served = [];
bus.on('order:served', p => served.push({ orderId: p?.order?.id, score: p?.score, correct: p?.correct,
  drinkId: p?.built?.drinkId, foam: (p?.built?.steps ?? []).find(s => s.param === 'steam')?.foam ?? '(none)',
  foamUnits: p?.built?.contents?.foam, notes: p?.notes ? [...p.notes] : [] }));
const ctx = { THREE, scene, camera, renderer: { domElement: canvas }, tex: {},
  mat: { get: () => new THREE.MeshStandardMaterial() }, audio: { play(){} }, bus,
  rng: mulberry32(11), layout: LAYOUT, state: {},
  hud: { setPrompt(){}, setMeter(){}, toast(){}, setTickets(){}, setStats(){} }, menu, orders };
const player = controls.createPlayer(ctx, []); ctx.player = player; scene.add(player.object);
const hands = handsMod.createHands(ctx); camera.add(hands.group); scene.add(camera);
const stations = stationsMod.createStations(ctx);
const IDS = ['cupStack','grinder','espresso','steamWand','superauto','syrupRack','blender','iceWell','sink','coldBrewTap','till','handoff'];
const interactables = IDS.map(id => { const object = new THREE.Mesh(new THREE.BoxGeometry(0.3,0.3,0.3), new THREE.MeshBasicMaterial());
  object.name = id; scene.add(object); return { id, kind:'station', label:id, object, hint:'', hold:false }; });
stations.register(interactables); ctx.interactables = interactables;
document.pointerLockElement = canvas; document.dispatchEvent({ type:'pointerlockchange' });
const byId = new Map(interactables.map(i => [i.id, i]));
const _f = new THREE.Vector3();
function frames(n){ for(let i=0;i<n;i++){ player.update(1/60); hands.update(1/60); stations.update(1/60);} }
function key(c,t='keydown'){ window.dispatchEvent({type:t,code:c,repeat:false,ctrlKey:false,metaKey:false,altKey:false,preventDefault(){}}); }
function aim(id){ const it=byId.get(id); for(const o of interactables) if(o!==it){o.object.position.set(0,-50,0);o.object.updateMatrixWorld(true);}
  camera.getWorldDirection(_f); it.object.position.copy(camera.position).addScaledVector(_f,1.0); it.object.updateMatrixWorld(true); frames(6); }
function tap(id){ aim(id); key('KeyE'); frames(6); key('KeyE','keyup'); frames(5); }
function hold(id,s){ aim(id); key('KeyE'); frames(Math.round(s*60)); key('KeyE','keyup'); frames(6); }
function hintOf(id){ aim(id); frames(10); return byId.get(id).hint; }

const drinks = ['latte','flatWhite','cappuccino'].map(id => menu.DRINKS.find(d => d.id === id));
// All three tickets queued at once, all the same size, so ONLY foam can separate them.
for (const d of drinks) bus.emit('order:new', { order: { id: 'tk-' + d.id, drink: d, size: 'tall',
  name: d.name, mods: [], price: d.price, patience: 120, t0: 0 } });

const problems = [];
function buildWithFoam(target) {
  bus.emit('interact', { id:'drop', phase:'tap', dt:0 }); frames(6);
  for (let i=0;i<5;i++){ aim('cupStack'); if((byId.get('cupStack').hint||'').toUpperCase().includes('TALL')) break; tap('cupStack'); }
  hold('cupStack', 0.45);
  tap('espresso'); hold('grinder', 1.04); tap('espresso'); hold('espresso', 2.60); tap('espresso');
  tap('steamWand');                       // take the pitcher
  // cycle the aeration target to what we want, reading the live hint
  let cycles = 0;
  while (!(byId.get('steamWand').hint || '').toUpperCase().includes(target.toUpperCase()) && cycles < 6) {
    tap('steamWand'); aim('steamWand'); frames(10); cycles++;
  }
  const hint = byId.get('steamWand').hint;
  hold('steamWand', 2.20);                // steam (temperature unchanged)
  tap('steamWand');                       // pour
  key('KeyL'); frames(5);
  const n0 = served.length;
  tap('handoff'); frames(8);
  const got = served.length > n0 ? served[served.length-1] : null;
  console.log('  target ' + target.padEnd(6) + ' hint="' + hint + '"');
  console.log('     -> served ' + (got ? got.orderId : 'NOTHING') + '  classified=' + got?.drinkId
    + '  foam=' + got?.foam + '  foamUnits=' + got?.foamUnits + '  score=' + got?.score
    + '  correct=' + got?.correct + '  notes=' + JSON.stringify(got?.notes));
  return got;
}
console.log('Three tickets queued at once (Latte, Flat White, Cappuccino), all tall:\n');
const want = { wet: 'latte', micro: 'flatWhite', dry: 'cappuccino' };
for (const target of ['dry', 'micro', 'wet']) {
  const got = buildWithFoam(target);
  if (!got) { problems.push(target + ': nothing served'); continue; }
  if (got.drinkId !== want[target]) problems.push(target + ' should classify as ' + want[target] + ', got ' + got.drinkId);
  if (got.orderId !== 'tk-' + want[target]) problems.push(target + ' should satisfy ticket tk-' + want[target] + ', got ' + got.orderId);
  if (got.foam !== target) problems.push(target + ': step foam is "' + got.foam + '"');
}
console.log('\nfoam units by target must differ (wet < micro < dry): ' +
  served.map(s => s.foam + '=' + s.foamUnits).join('  '));
console.log('\n' + (problems.length ? 'FAIL\n  ' + problems.join('\n  ') : 'foam disambiguation: ok'));
process.exit(problems.length ? 1 : 0);
