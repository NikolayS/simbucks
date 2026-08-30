// A modified ticket must drive the syrup meter's target zone, not the drink's base recipe.
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
const camera = new THREE.PerspectiveCamera(66, 16 / 9, 0.05, 220);
camera.position.set(0, LAYOUT.player.eye, -0.6);
const scene = new THREE.Scene();
const bus = createBus();
const meters = [];
const ctx = {
  THREE, scene, camera, renderer: { domElement: canvas },
  tex: {}, mat: { get: () => new THREE.MeshStandardMaterial() }, audio: { play() {} },
  bus, rng: mulberry32(3), layout: LAYOUT, state: {},
  hud: { setPrompt() {}, setMeter: (m) => meters.push(m ? { ...m } : null), toast() {}, setTickets() {}, setStats() {} },
  menu, orders,
};
const player = controls.createPlayer(ctx, []); ctx.player = player; scene.add(player.object);
const hands = handsMod.createHands(ctx); camera.add(hands.group); scene.add(camera);
const stations = stationsMod.createStations(ctx);
const IDS = ['cupStack','grinder','espresso','steamWand','superauto','syrupRack','blender','iceWell','sink','coldBrewTap','till','handoff'];
const interactables = IDS.map((id) => {
  const object = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshBasicMaterial());
  object.name = id; scene.add(object);
  return { id, kind: 'station', label: id, object, hint: '', hold: false };
});
stations.register(interactables); ctx.interactables = interactables;
document.pointerLockElement = canvas; document.dispatchEvent({ type: 'pointerlockchange' });
const byId = new Map(interactables.map(i => [i.id, i]));
const _f = new THREE.Vector3();
function frames(n) { for (let i = 0; i < n; i++) { player.update(1/60); hands.update(1/60); stations.update(1/60); } }
function key(c, t='keydown') { window.dispatchEvent({ type: t, code: c, repeat: false, ctrlKey:false, metaKey:false, altKey:false, preventDefault(){} }); }
function aim(id) { const it = byId.get(id);
  for (const o of interactables) if (o !== it) { o.object.position.set(0,-50,0); o.object.updateMatrixWorld(true); }
  camera.getWorldDirection(_f); it.object.position.copy(camera.position).addScaledVector(_f, 1.0);
  it.object.updateMatrixWorld(true); frames(6); }
function tap(id) { aim(id); key('KeyE'); frames(6); key('KeyE','keyup'); frames(5); }
function hold(id, s) { aim(id); key('KeyE'); frames(Math.round(s*60)); key('KeyE','keyup'); frames(6); }

const macchiato = menu.DRINKS.find(d => d.id === 'caramelMacchiato');
const baseParam = macchiato.recipe.find(s => s.station === 'syrupRack')?.param;
const problems = [];
function targetFor(order, label) {
  bus.emit('interact', { id: 'drop', phase: 'tap', dt: 0 }); frames(6);
  bus.emit('order:new', { order });
  hold('cupStack', 0.45);
  meters.length = 0;
  tap('syrupRack'); frames(4);
  const m = meters.filter(x => x && x.kind === 'syrup').pop();
  const zone = m?.zone;
  const target = Array.isArray(zone) ? Math.round(zone[1] * 8) : null;
  console.log('  ' + label.padEnd(38) + ' meter zone=' + JSON.stringify(zone) + '  => target ' + target + ' pumps');
  bus.emit('order:lost', { order, reason: 'test' }); frames(4);
  return target;
}
console.log('Caramel Macchiato base recipe syrup param = ' + baseParam + '\n');
const t1 = targetFor({ id: 'o-base', drink: macchiato, size: 'grande', name: 'A', mods: [], price: 4.15, patience: 90, t0: 0 },
  'ticket with NO steps (base recipe)');
if (t1 !== baseParam) problems.push('base ticket should target ' + baseParam + ', got ' + t1);

// A ticket whose modifier rewrote the pump count to 5.
const modSteps = macchiato.recipe.map(s => (s.station === 'syrupRack' ? { station: 'syrupRack', param: 5 } : s));
const t2 = targetFor({ id: 'o-mod', drink: macchiato, size: 'grande', name: 'B', mods: ['extra syrup'],
                       steps: modSteps, price: 4.15, patience: 90, t0: 0 },
  'ticket MODIFIED to 5 pumps');
if (t2 !== 5) problems.push('modified ticket should target 5, got ' + t2);

// A drink with no syrup at all that gains a syrup step from a mod.
const tea = menu.DRINKS.find(d => d.id === 'breakfastTea');
const teaSteps = [...tea.recipe.slice(0, 1), { station: 'syrupRack', param: 2 }, ...tea.recipe.slice(1)];
const t3 = targetFor({ id: 'o-tea', drink: tea, size: 'grande', name: 'C', mods: ['vanilla'],
                       steps: teaSteps, price: 2.45, patience: 90, t0: 0 },
  'syrup-free drink GAINING 2 pumps by mod');
if (t3 !== 2) problems.push('modded tea should target 2, got ' + t3);

// An empty steps array must not mask the base recipe.
const t4 = targetFor({ id: 'o-empty', drink: macchiato, size: 'grande', name: 'D', mods: [], steps: [],
                       price: 4.15, patience: 90, t0: 0 },
  'ticket with an EMPTY steps array');
if (t4 !== baseParam) problems.push('empty steps should fall back to ' + baseParam + ', got ' + t4);

console.log('\n' + (problems.length ? 'FAIL\n  ' + problems.join('\n  ') : 'syrup meter target: ok'));
process.exit(problems.length ? 1 : 0);
