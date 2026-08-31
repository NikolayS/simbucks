import * as THREE from 'three';
import { makeOrder, setShiftTime } from './orders.js';
import { patienceScale } from './state.js';
import { makePerson } from '../entities/people.js';

const SPEED = 1.25, MAX_ACTIVE = 14, POOL_CAP = 18;
const MIN_PUBLIC_Z = 2.2, CORRIDOR_Z = 5.4;

const MUTTERS = Object.freeze([
  'Another gate change. Splendid.', 'Delayed. What a novelty.',
  'Airport coffee prices, honestly.', 'Which boarding group are we?',
  'Dublin appears to be delayed.', 'Is that gate 41 or 4-1?',
  'The app says something else.', 'I packed for the wrong weather.',
  'Priority seems a broad term.', 'Still no gate on the screen.',
  'That queue moved in theory.', 'A very leisurely departure.',
]);
const RUSH_LINES = Object.freeze([
  'Ah. That will be our flight.', 'Boarding already? Naturally.',
  'That sounded rather urgent.', 'Gate change. Bags up, then.',
  'So much for a quiet coffee.', 'Final call. Excellent timing.',
]);
const THANKS = Object.freeze([
  'Cheers, much appreciated.', 'Lovely, thank you.',
  'Perfect. Off to the gate.', 'Ta. That should keep me awake.',
  'Thanks. Eventually, then.', 'Just in time. More or less.',
  'Grand, that is mine.', 'Much obliged.',
]);
const WALKOUT_LINES = Object.freeze([
  'I shall risk the trolley.', 'Never mind, boarding calls.',
  'Time has rather got away.', 'I will go without, then.',
  'Perhaps coffee at the gate.', 'A noble attempt. Goodbye.',
]);
const QUEUE_LINES = Object.freeze([
  'Could I order, please?', 'Hello? Still here.', 'No rush. Apart from my flight.',
  'Ready when you are.', 'The gate will not wait, sadly.',
]);
const IDLES = Object.freeze(['phone', 'menu', 'shift', 'ahead']);
const BAGS = Object.freeze(['backpack', 'tote', 'roller', null]);
const PEOPLE_PALETTES = Object.freeze([
  Object.freeze({ cloth: 0x59636B, accent: 0x7E3F49, skin: 0xD8A17C }), // slate grey / maroon
  Object.freeze({ cloth: 0x53615A, accent: 0xB28A55, skin: 0xB97855 }), // moss grey / tan
  Object.freeze({ cloth: 0x6A6175, accent: 0x46647B, skin: 0x8B5A43 }), // mauve / steel blue
  Object.freeze({ cloth: 0x746658, accent: 0x6B7D52, skin: 0xE0B18A }), // taupe / olive
  Object.freeze({ cloth: 0x2E3B52, accent: 0x3A3F47, skin: 0xEFC6A2 }), // navy / charcoal
  Object.freeze({ cloth: 0xE4DCC8, accent: 0x36435C, skin: 0xA06A4A }), // cream / navy
  Object.freeze({ cloth: 0x3B3F44, accent: 0x9C5B3A, skin: 0x6E4630 }), // charcoal / rust
  Object.freeze({ cloth: 0x7C93A6, accent: 0xD9D2C2, skin: 0xC98D68 }), // dusty blue / cream
  Object.freeze({ cloth: 0x5D6647, accent: 0xA79A7B, skin: 0x9A674E }), // olive / khaki
  Object.freeze({ cloth: 0x6B3B45, accent: 0x6E747A, skin: 0xE8C9A8 }), // burgundy / grey
]);

// Shared movement scratch: customer records keep their own canonical position.
const MOVE = new THREE.Vector3();
const clamp = (value, min, max) => Math.max(min,
  Math.min(max, Number.isFinite(value) ? value : min));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const QUEUE_PATIENCE = difficulty => 168 - 48 * clamp(difficulty, 0, 1);

export function buildCustomers(ctx) {
  const group = new THREE.Group();
  group.name = 'customers';
  const layout = ctx?.layout ?? {};
  const orderCfg = layout.queue?.order ?? {};
  const pickupCfg = layout.queue?.pickup ?? {};
  const enter = layout.queue?.enter ?? {};
  const exit = layout.queue?.exit ?? {};
  const railA = layout.rails?.a ?? {};
  const railB = layout.rails?.b ?? {};
  const till = layout.front?.till ?? {};
  const handoff = layout.front?.handoff ?? {};
  const menuPanel = layout.menu?.panels?.[1] ?? {};
  const handoffX = (finite(handoff.x0) + finite(handoff.x1)) * 0.5;
  const handoffZ = (finite(handoff.z0) + finite(handoff.z1)) * 0.5;
  const menuX = (finite(menuPanel.x0) + finite(menuPanel.x1)) * 0.5;
  const orderN = Math.max(0, Math.floor(finite(orderCfg.n)));
  const configuredPickupN = Math.max(0, Math.floor(finite(pickupCfg.n)));
  // Use every pickup slot the layout offers, up to the merch shelf. Standing at
  // the guard rail's west edge is fine; standing inside its footprint is not.
  let pickupN = 0;
  while (pickupN < configuredPickupN
      && finite(pickupCfg.x) + finite(pickupCfg.dx) * pickupN <= finite(railB.x0, Infinity)) {
    pickupN++;
  }
  const orderZ = finite(orderCfg.z, MIN_PUBLIC_Z);
  const railWestX = finite(railA.x0) - 0.35;
  const railEastX = finite(railA.x1) + 0.55;
  const railMidX = (finite(railA.x0) + finite(railA.x1)) * 0.5;
  const gapA = layout.rails?.a?.gap;
  const hasGapA = Number.isFinite(gapA?.x0) && Number.isFinite(gapA?.x1);
  const gapX = hasGapA ? (gapA.x0 + gapA.x1) * 0.5 : railWestX;
  const active = [], pool = [], queue = [];
  const pickupSlots = new Array(pickupN).fill(null);
  const pendingSpawns = [], unsubs = [];
  let fallbackTorsoGeometry = null, fallbackHeadGeometry = null, fallbackMaterials = null;
  let customerSeq = 0, directorNow = finite(ctx?.state?.tSec), nextTrickle = 6;
  let spawning = ctx?.state?.phase === 'playing';
  let lastTill = -Infinity, mutterTimer = 12, lastMutter = -Infinity, queueLineTimer = 9;

  const rand = () => { const v = ctx?.rng?.(); return Number.isFinite(v) ? v : 0.5; };
  const randRange = (a, b) => a + (b - a) * rand();
  const pick = arr => arr[Math.min(arr.length - 1, Math.floor(rand() * arr.length))];

  const safePersonCall = (person, method, arg) => {
    try { person?.[method]?.(arg); } catch (_) { /* A stub person stays harmless. */ }
  };
  const emit = (name, payload) => {
    try { ctx?.bus?.emit?.(name, payload); } catch (_) { /* Partial contexts are valid. */ }
  };
  const point = (x, z) => new THREE.Vector3(finite(x), 0,
    Math.max(MIN_PUBLIC_Z, finite(z, MIN_PUBLIC_Z)));
  const orderX = i => finite(orderCfg.x) + finite(orderCfg.dx) * i;
  const pickupX = i => finite(pickupCfg.x) + finite(pickupCfg.dx) * i;
  const orderPoint = i => point(orderX(i), orderCfg.z);
  const pickupPoint = (i, offset = 0) => point(pickupX(i) + offset, pickupCfg.z);
  const holdPoint = k => point(finite(enter.x) + 2.2 + k * 0.95,
    CORRIDOR_Z + (k % 2) * 0.7);

  // Person pool and the shared fallback body used while people.js is a stub.
  function dummyPerson() {
    return {
      group: new THREE.Group(), update() {}, walkTo() {}, face() {}, setPose() {},
      say() {}, isMoving() { return false; },
    };
  }
  function addFallbackBody(person) {
    const root = person?.group;
    if (!root || root.children.length !== 0) return;
    if (!fallbackTorsoGeometry) {
      fallbackTorsoGeometry = new THREE.CapsuleGeometry(0.28, 0.49, 4, 8);
      fallbackHeadGeometry = new THREE.SphereGeometry(0.19, 10, 7);
      fallbackMaterials = {
        travel: PEOPLE_PALETTES.map(palette => palette.cloth).map(color =>
          new THREE.MeshStandardMaterial({ color, roughness: 0.86 })),
        skin: PEOPLE_PALETTES.map(palette => palette.skin).map(color =>
          new THREE.MeshStandardMaterial({ color, roughness: 0.9 })),
      };
    }
    const torso = new THREE.Mesh(fallbackTorsoGeometry, pick(fallbackMaterials.travel));
    const head = new THREE.Mesh(fallbackHeadGeometry, pick(fallbackMaterials.skin));
    torso.position.y = 0.56; head.position.y = 1.27;
    torso.castShadow = head.castShadow = true;
    root.add(torso, head);
    root.userData.fallbackBody = true;
  }
  function acquire() {
    let person = pool.pop();
    if (!person) {
      try {
        person = makePerson(ctx, {
          role: 'customer', seed: Math.floor(rand() * 1e6),
          palette: pick(PEOPLE_PALETTES), bag: pick(BAGS),
        });
      } catch (_) { person = dummyPerson(); }
    }
    if (!person?.group?.position || !person?.group?.rotation) person = dummyPerson();
    addFallbackBody(person);
    person.group.visible = true;
    if (person.group.parent !== group) group.add(person.group);
    return person;
  }
  function release(person) {
    if (!person) return;
    if (person.group) person.group.visible = false;
    if (pool.length < POOL_CAP) pool.push(person);
    else {
      safePersonCall(person, 'dispose');
      try { person.group?.parent?.remove?.(person.group); } catch (_) { /* Optional cleanup. */ }
    }
  }
  function setPose(c, pose) {
    if (c.poseNow === pose) return;
    c.poseNow = pose; safePersonCall(c.person, 'setPose', pose);
  }
  function setMode(c, mode) {
    if (c.mode !== mode) {
      c.mode = mode;
      c.tMode = 0;
    }
    setPose(c, mode === 'walkIn' || mode === 'toPickup' || mode === 'leaving'
      ? 'walk' : 'idle');
  }
  function setPath(c, path) { c.path = path; c.pathIndex = 0; }

  // Queue, pickup and departure paths never cross the counter-side boundary.
  function pathIntoQueue(c, i, fromHold = false) {
    const x = orderX(i);
    if (!hasGapA) {
      setPath(c, fromHold
        ? [point(railWestX, c.pos.z), point(railWestX, orderZ), point(x, orderZ)]
        : [point(enter.x, CORRIDOR_Z), point(railWestX, CORRIDOR_Z),
          point(railWestX, orderZ), point(x, orderZ)]);
      return;
    }
    setPath(c, fromHold
      ? [point(c.pos.x, CORRIDOR_Z), point(gapX, CORRIDOR_Z),
        point(gapX, orderZ), point(x, orderZ)]
      : [point(enter.x, CORRIDOR_Z), point(gapX, CORRIDOR_Z),
        point(gapX, orderZ), point(x, orderZ)]);
  }
  function freePickup(c) {
    for (let i = 0; i < pickupSlots.length; i++) if (pickupSlots[i] === c) pickupSlots[i] = null;
    c.pickupOverflow = 0;
  }
  function promoteHolds() {
    while (queue.length < orderN) {
      let held = null;
      for (const c of active) {
        if (c.mode === 'hold') { held = c; break; }
      }
      if (!held) break;
      held.slot = queue.length;
      queue.push(held);
      pathIntoQueue(held, held.slot, true);
      setMode(held, 'walkIn');
    }
  }
  function retargetQueue() {
    for (let i = 0; i < queue.length; i++) {
      const c = queue[i];
      c.slot = i;
      // Someone already in the channel just shuffles forward. Anyone still
      // approaching moves sideways first, then enters through the rail gap.
      if (c.pos.z <= finite(orderCfg.z) + 0.6) {
        setPath(c, [orderPoint(i)]);
      } else {
        setPath(c, [point(gapX, c.pos.z), point(gapX, orderCfg.z), orderPoint(i)]);
      }
      setMode(c, 'walkIn');
    }
    promoteHolds();
  }
  function removeFromQueue(c) {
    const index = queue.indexOf(c);
    if (index < 0) return;
    queue.splice(index, 1);
    retargetQueue();
  }
  function startLeaving(c) {
    removeFromQueue(c);
    freePickup(c);
    c.slot = -1;
    const insideQueueChannel = c.pos.x >= finite(railA.x0) - 0.3
      && c.pos.x <= finite(railA.x1) + 0.3;
    if (insideQueueChannel) {
      const escapeX = hasGapA ? gapX : (c.pos.x < railMidX ? railWestX : railEastX);
      setPath(c, [point(escapeX, c.pos.z), point(escapeX, CORRIDOR_Z),
        point(exit.x, CORRIDOR_Z), point(exit.x, exit.z)]);
    } else {
      setPath(c, [point(c.pos.x, 4.9), point(exit.x, CORRIDOR_Z), point(exit.x, exit.z)]);
    }
    setMode(c, 'leaving');
  }
  function assignPickup(c) {
    let slot = -1;
    for (let i = 0; i < pickupSlots.length; i++) {
      if (!pickupSlots[i]) { slot = i; break; }
    }
    let offset = 0;
    if (slot >= 0) pickupSlots[slot] = c;
    else {
      slot = Math.max(0, pickupN - 1);
      let overflow = 1;
      for (const other of active) {
        if (other !== c && other.pickupOverflow > 0) overflow++;
      }
      c.pickupOverflow = overflow;
      offset = overflow * 0.24;
    }
    c.slot = slot;
    const x = pickupX(slot) + offset;
    setPath(c, [point(x, orderZ), pickupPoint(slot, offset)]);
    setMode(c, 'toPickup');
  }
  function spawnCustomer() {
    const person = acquire();
    const c = {
      person, id: `c${++customerSeq}`, order: null, mode: 'walkIn', slot: -1,
      tMode: 0, qWait: 0, tLeft: 0, dwell: 0, path: [], pathIndex: 0,
      idleKind: 'ahead', idleT: randRange(3, 6.5), sway: randRange(0, Math.PI * 2),
      yawOffset: 0, poseNow: '', speed: SPEED * randRange(0.92, 1.1),
      pos: point(enter.x, enter.z), yaw: Math.PI, lostEmitted: false,
      pickupOverflow: 0,
    };
    active.push(c);
    if (queue.length < orderN) {
      c.slot = queue.length;
      queue.push(c);
      pathIntoQueue(c, c.slot);
      setMode(c, 'walkIn');
    } else {
      let k = 0;
      for (; k < 6; k++) {
        let used = false;
        for (const other of active) {
          if (other !== c && other.mode === 'hold' && other.slot === k) { used = true; break; }
        }
        if (!used) break;
      }
      c.slot = Math.min(k, 5);
      setPath(c, [point(enter.x, CORRIDOR_Z), holdPoint(c.slot)]);
      setMode(c, 'hold');
    }
  }
  function safeMakeOrder() {
    try { return makeOrder(ctx, ctx?.state?.difficulty ?? 0); } catch (_) { return null; }
  }
  function lose(c, reason) {
    if (c.lostEmitted) return;
    if (!c.order) {
      c.order = safeMakeOrder();
      if (c.order) c.order.customerId = c.id;
    }
    if (!c.order) return;
    c.lostEmitted = true;
    safePersonCall(c.person, 'say', pick(WALKOUT_LINES));
    emit('order:lost', { order: c.order, reason });
    if (reason === 'walkout') emit('sfx', { name: 'thunk' });
    startLeaving(c);
  }
  function followPath(c, dt) {
    while (c.pathIndex < c.path.length) {
      const target = c.path[c.pathIndex];
      MOVE.set(target.x - c.pos.x, 0, target.z - c.pos.z);
      const distance = MOVE.length();
      if (distance <= 0.14) {
        c.pos.copy(target);
        c.pathIndex++;
        continue;
      }
      const targetYaw = Math.atan2(MOVE.x, MOVE.z);
      const deltaYaw = Math.atan2(Math.sin(targetYaw - c.yaw), Math.cos(targetYaw - c.yaw));
      c.yaw += deltaYaw * Math.min(1, dt * 7);
      c.pos.addScaledVector(MOVE, Math.min(distance, c.speed * dt) / distance);
      return false;
    }
    return true;
  }
  function finishPath(c) {
    if (c.mode === 'walkIn') {
      setMode(c, queue.indexOf(c) === 0 ? 'ordering' : 'queue');
    } else if (c.mode === 'toPickup') setMode(c, 'waiting');
  }
  function updateIdle(c, dt, t) {
    let xOffset = 0;
    let yOffset = 0;
    let targetYaw = c.yaw;
    const idle = c.mode === 'queue' || c.mode === 'ordering'
      || c.mode === 'hold' || c.mode === 'waiting';
    if (idle && c.pathIndex >= c.path.length) {
      c.idleT -= dt;
      if (c.idleT <= 0) {
        c.idleKind = pick(IDLES);
        c.idleT = randRange(3, 6.5);
        c.yawOffset = c.idleKind === 'phone'
          ? (rand() < 0.5 ? -1 : 1) * randRange(0.07, 0.11) : 0;
      }
      if (c.mode === 'ordering') {
        targetYaw = Math.atan2(finite(till.x) - c.pos.x, finite(till.z) - c.pos.z);
      } else if (c.mode === 'waiting') {
        targetYaw = Math.atan2(handoffX - c.pos.x, handoffZ - c.pos.z);
      } else targetYaw = Math.PI;
      if (c.idleKind === 'menu') {
        targetYaw = Math.atan2(menuX - c.pos.x, finite(layout.menu?.z) - c.pos.z);
      } else if (c.idleKind === 'phone') {
        targetYaw += c.yawOffset;
        // Feet sit at y ~ 0, so the bob may only lift.
        yOffset = (Math.sin(t * 2.2 + c.sway) * 0.5 + 0.5) * 0.012;
      } else if (c.idleKind === 'shift') {
        xOffset = Math.sin(t * (Math.PI * 2 / 2.6) + c.sway) * 0.06;
      } else if (c.idleKind === 'ahead') {
        targetYaw = Math.PI;
      }
      const turn = Math.atan2(Math.sin(targetYaw - c.yaw), Math.cos(targetYaw - c.yaw));
      c.yaw += turn * Math.min(1, dt * 4);
    }
    try {
      c.person.group.position.set(c.pos.x + xOffset, yOffset, c.pos.z);
      // makePerson meshes face +Z; yaw toward a direction is atan2(dir.x, dir.z).
      c.person.group.rotation.y = c.yaw;
    } catch (_) { /* Even a malformed stub must not stop the director. */ }
  }
  // Per-customer and global idle speech stays sparse during a rush.
  function releaseAt(index) {
    const c = active[index];
    if (!c) return;
    removeFromQueue(c); freePickup(c);
    active.splice(index, 1);
    release(c.person);
  }
  function updateSpeech(dt) {
    mutterTimer -= dt;
    if (mutterTimer <= 0 && directorNow - lastMutter >= 6) {
      let chosen = null;
      let seen = 0;
      for (const c of active) {
        if (c.mode !== 'queue' && c.mode !== 'ordering'
            && c.mode !== 'hold' && c.mode !== 'waiting') continue;
        seen++;
        if (rand() < 1 / seen) chosen = c;
      }
      if (chosen) safePersonCall(chosen.person, 'say', pick(MUTTERS));
      lastMutter = directorNow;
      mutterTimer = randRange(9, 20);
    }
    queueLineTimer -= dt;
    if (queueLineTimer <= 0) {
      const front = queue[0];
      if (front?.mode === 'ordering' && !front.order) {
        safePersonCall(front.person, 'say', pick(QUEUE_LINES));
      }
      queueLineTimer = randRange(8, 15);
    }
  }
  // Spawn scheduling consumes due entries only when the active cap permits it.
  function processSpawns() {
    for (;;) {
      let dueIndex = -1;
      let dueTime = Infinity;
      for (let i = 0; i < pendingSpawns.length; i++) {
        if (pendingSpawns[i] <= directorNow && pendingSpawns[i] < dueTime) {
          dueTime = pendingSpawns[i];
          dueIndex = i;
        }
      }
      if (dueIndex < 0) break;
      if (active.length >= MAX_ACTIVE) {
        pendingSpawns[dueIndex] = directorNow + 2;
        break;
      }
      pendingSpawns.splice(dueIndex, 1);
      spawnCustomer();
    }
    if (directorNow < nextTrickle) return;
    if (active.length >= MAX_ACTIVE) {
      nextTrickle = directorNow + 2;
      return;
    }
    spawnCustomer();
    const difficulty = clamp(ctx?.state?.difficulty ?? 0, 0, 1);
    nextTrickle = directorNow + (88 + (55 - 88) * difficulty) + randRange(-6, 6);
  }
  function resetShift() {
    for (let i = active.length - 1; i >= 0; i--) release(active[i].person);
    active.length = 0; queue.length = 0;
    for (let i = 0; i < pickupSlots.length; i++) pickupSlots[i] = null;
    pendingSpawns.length = 0;
    directorNow = finite(ctx?.state?.tSec);
    nextTrickle = 6; spawning = true; lastTill = lastMutter = -Infinity;
    mutterTimer = randRange(9, 20);
    queueLineTimer = randRange(8, 15);
  }
  // Bus wiring: till orders, handoff collection, rushes, and shift lifecycle.
  function listen(name, fn) {
    try {
      const off = ctx?.bus?.on?.(name, fn);
      if (typeof off === 'function') unsubs.push(off);
    } catch (_) { /* A missing bus simply disables interaction. */ }
  }
  listen('interact', payload => {
    if (ctx?.state?.phase !== 'playing' || payload?.id !== 'till'
        || (payload.phase !== 'tap' && payload.phase !== 'holdEnd')) return;
    const now = finite(ctx?.state?.tSec, directorNow);
    if (now - lastTill < 0.35) return;
    lastTill = now;
    const c = queue[0];
    if (!c || c.mode !== 'ordering' || c.order) return;
    const order = safeMakeOrder();
    if (!order) return;
    order.customerId = c.id;
    c.order = order;
    c.tLeft = order.patience;
    emit('order:new', { order });
    emit('sfx', { name: 'beep' });
    safePersonCall(c.person, 'say', order.short || order.text);
    removeFromQueue(c);
    assignPickup(c);
  });
  listen('order:served', payload => {
    const id = payload?.order?.id ?? payload?.orderId;
    if (id == null) return;
    for (const c of active) {
      if (c.order?.id !== id || (c.mode !== 'toPickup' && c.mode !== 'waiting')) continue;
      safePersonCall(c.person, 'say', pick(THANKS));
      emit('sfx', { name: 'coin' });
      freePickup(c);
      c.path.length = 0;
      c.pathIndex = 0;
      c.dwell = 1.1;
      setMode(c, 'collect');
      break;
    }
  });
  listen('rush', payload => {
    const n = Math.floor(clamp(payload?.size ?? 2, 1, 6));
    const now = finite(ctx?.state?.tSec, directorNow);
    for (let i = 0; i < n; i++) pendingSpawns.push(now + i * (18 / n) + rand() * 2.5);
    let spoken = 0;
    for (const c of active) {
      if (c.mode !== 'waiting') continue;
      safePersonCall(c.person, 'say', pick(RUSH_LINES));
      if (++spoken >= 2) break;
    }
  });
  listen('shift:start', resetShift);
  listen('shift:end', () => {
    spawning = false;
    nextTrickle = Infinity;
    pendingSpawns.length = 0;
    for (const c of active) startLeaving(c);
  });
  function update(dt, t) {
    setShiftTime(ctx?.state?.tSec ?? 0);
    dt = clamp(dt, 0, 0.1);
    directorNow = finite(ctx?.state?.tSec, finite(t, directorNow));
    if (spawning && ctx?.state?.phase === 'playing') processSpawns();
    promoteHolds();
    const playing = ctx?.state?.phase === 'playing';
    const scale = patienceScale(ctx?.state);
    for (let i = active.length - 1; i >= 0; i--) {
      const c = active[i];
      safePersonCall(c.person, 'update', dt);
      c.tMode += dt;
      if (playing && (c.mode === 'walkIn' || c.mode === 'hold'
          || c.mode === 'queue' || c.mode === 'ordering')) {
        c.qWait += dt * scale;
        if (c.qWait > QUEUE_PATIENCE(ctx?.state?.difficulty)) lose(c, 'queue');
      }
      if (playing && (c.mode === 'toPickup' || c.mode === 'waiting')) {
        c.tLeft -= dt * scale;
        if (c.order) {
          c.order.tLeft = c.tLeft;
          c.order.patienceFrac = clamp(c.tLeft / c.order.patience, 0, 1);
        }
        if (c.tLeft <= 0) lose(c, 'walkout');
      }
      if (c.mode === 'collect') {
        c.dwell -= dt;
        if (c.dwell <= 0) startLeaving(c);
      }
      const finished = followPath(c, dt);
      if (finished && c.mode === 'leaving') {
        releaseAt(i);
        continue;
      }
      if (finished) finishPath(c);
      updateIdle(c, dt, finite(t, directorNow));
    }
    if (playing) updateSpeech(dt);
  }
  function dispose() {
    for (const off of unsubs.splice(0)) {
      try { off?.(); } catch (_) { /* Disposal is best-effort. */ }
    }
    for (const c of active) safePersonCall(c.person, 'dispose');
    for (const person of pool) safePersonCall(person, 'dispose');
    active.length = pool.length = queue.length = pendingSpawns.length = 0;
    while (group.children.length) group.remove(group.children[group.children.length - 1]);
    fallbackTorsoGeometry?.dispose();
    fallbackHeadGeometry?.dispose();
    if (fallbackMaterials) {
      for (const material of fallbackMaterials.travel) material.dispose();
      for (const material of fallbackMaterials.skin) material.dispose();
    }
  }

  return { group, update,
    // Customers remain outside the player aisle and deliberately never collide.
    colliders: [], dispose,
  };
}
