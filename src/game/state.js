import { FAULT_LABELS, faultsFromNotes } from './orders.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function round2(value) {
  const number = Number.isFinite(value) ? value : 0;
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

function readStoredValue(key) {
  try {
    const storage = globalThis.localStorage;
    if (!storage || typeof storage.getItem !== 'function') return null;
    return storage.getItem(key);
  } catch (_) {
    return null;
  }
}

function writeStoredValue(key, value) {
  try {
    const storage = globalThis.localStorage;
    if (!storage || typeof storage.setItem !== 'function') return;
    storage.setItem(key, value);
  } catch (_) {
    // State changes still apply when persistence is unavailable.
  }
}

function resolvedTraining() {
  const stored = readStoredValue('simbucks.training');
  if (stored === '1') return true;
  if (stored === '0') return false;
  return readStoredValue('simbucks.trainingDone') !== '1';
}

export function createState() {
  return {
    money: 0,
    tips: 0,
    served: 0,
    lost: 0,
    rep: 100,
    tSec: 0,
    phase: 'title',
    rank: 'Green Apron',
    difficulty: 0,
    act: 1,
    ramp: ACTS[0],
    clock: '07:00',
    accuracy: 1,
    ordersTaken: 0,
    perfect: 0,
    faults: {},
    faultLabels: {},
    faultOrder: [],
    topFaults: [],
    training: resolvedTraining(),
    shiftLength: 480,
    flightIndex: 0,
    nextFlight: null,
  };
}

// The shift is three acts. Act 1 is one customer at a time so a beginner can
// find the grinder; act 3 is the morning rush and is as hard as it ever was.
export const ACTS = Object.freeze([
  // maxPickup is 2, not 1, so a customer can be walking in while the previous
  // drink is still being made. The walk from the entrance takes ~11 s, and gating
  // it behind the single pickup slot serialised that walk with every build, which
  // cost a fast player two drinks a shift. One ticket at a time is still the norm
  // in act 1 - a beginner only reaches two by choosing to take the second order.
  Object.freeze({ act: 1, until: 100, gap: [18, 22], maxOrdering: 1, maxPickup: 2, maxMods: 0, maxTier: 1 }),
  Object.freeze({ act: 2, until: 260, gap: null, maxOrdering: 2, maxPickup: 3, maxMods: 1, maxTier: 2 }),
  Object.freeze({ act: 3, until: Infinity, gap: null, maxOrdering: 99, maxPickup: 99, maxMods: 3, maxTier: 3 }),
]);

export function actFor(tSec) {
  return ACTS.find(entry => entry.until > tSec) ?? ACTS[ACTS.length - 1];
}

export const FLIGHTS = Object.freeze([
  { time: 132, flight: 'BA1442', gate: '12', dest: 'Edinburgh', size: 2 },
  { time: 196, flight: 'FR8213', gate: '31', dest: 'Dublin', size: 2 },
  { time: 252, flight: 'U27714', gate: '6', dest: 'Geneva', size: 3 },
  { time: 305, flight: 'KL1006', gate: '24', dest: 'Amsterdam', size: 3 },
  { time: 352, flight: 'LH0921', gate: '38', dest: 'Frankfurt', size: 4 },
  { time: 402, flight: 'VY6203', gate: '17', dest: 'Barcelona', size: 4 },
  { time: 444, flight: 'AF1181', gate: '41', dest: 'Paris CDG', size: 4 },
].map(Object.freeze));

const wiredContexts = new WeakSet();
const attachedStateContexts = new WeakSet();

function emit(ctx, name, payload) {
  try {
    ctx?.bus?.emit?.(name, payload);
  } catch (_) {
    // The game state remains usable without a bus.
  }
}

export function setTraining(ctx, on) {
  const state = ctx?.state;
  if (!state || typeof state !== 'object') return;
  const training = Boolean(on);
  state.training = training;
  writeStoredValue('simbucks.training', training ? '1' : '0');
  emit(ctx, 'training:changed', { training });
}

// Main or the HUD host calls this at startup so title-card toggles are captured.
export function attachState(ctx) {
  if (!ctx || typeof ctx !== 'object' || attachedStateContexts.has(ctx)
      || typeof ctx?.bus?.on !== 'function') return;
  attachedStateContexts.add(ctx);

  try {
    ctx.bus.on('training:set', payload => {
      try {
        const on = payload && typeof payload === 'object'
          ? (Object.prototype.hasOwnProperty.call(payload, 'on') ? payload.on : payload.training)
          : payload;
        setTraining(ctx, on);
      } catch (_) {
        // Ignore malformed training messages.
      }
    });
  } catch (_) {
    // A partial bus must not prevent state from attaching.
  }
}

export function isTraining(state) {
  return state?.training === true;
}

// customers.js uses this to slow patience drain while the coach is active.
export function patienceScale(state) {
  return state?.training === true ? 0.4 : 1;
}

function updateAccuracy(state) {
  const served = Number.isFinite(state?.served) ? state.served : 0;
  const lost = Number.isFinite(state?.lost) ? state.lost : 0;
  state.accuracy = clamp(served / Math.max(1, served + lost), 0, 1);
}

function tallyFaults(state, payload) {
  try {
    const entries = Array.isArray(payload?.faults)
      ? payload.faults
      : faultsFromNotes(payload?.notes);
    if (!Array.isArray(entries)) return;
    const faults = state.faults && typeof state.faults === 'object'
      && !Array.isArray(state.faults) ? state.faults : (state.faults = {});
    const labels = state.faultLabels && typeof state.faultLabels === 'object'
      && !Array.isArray(state.faultLabels) ? state.faultLabels : (state.faultLabels = {});
    const order = Array.isArray(state.faultOrder) ? state.faultOrder : (state.faultOrder = []);
    const seen = new Set();

    for (const entry of entries) {
      const rawCode = entry && typeof entry === 'object' ? entry.code : null;
      if (!rawCode) continue;
      const code = String(rawCode);
      if (seen.has(code)) continue;
      seen.add(code);

      if (!Object.prototype.hasOwnProperty.call(faults, code)) {
        Object.defineProperty(faults, code, {
          value: 0,
          writable: true,
          enumerable: true,
          configurable: true,
        });
        order.push(code);
      }
      const count = Number.isFinite(faults[code]) ? faults[code] : 0;
      faults[code] = Math.max(0, Math.floor(count)) + 1;

      const payloadLabel = typeof entry.label === 'string' && entry.label ? entry.label : null;
      Object.defineProperty(labels, code, {
        value: payloadLabel ?? FAULT_LABELS[code] ?? code,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
  } catch (_) {
    // Malformed fault data must not interrupt shift bookkeeping.
  }
}

function topFaultsFor(state) {
  const faults = state.faults && typeof state.faults === 'object'
    && !Array.isArray(state.faults) ? state.faults : {};
  const labels = state.faultLabels && typeof state.faultLabels === 'object'
    && !Array.isArray(state.faultLabels) ? state.faultLabels : {};
  const order = Array.isArray(state.faultOrder) ? state.faultOrder : [];
  return order
    .map((code, index) => ({
      code,
      index,
      count: Number.isFinite(faults[code]) ? Math.max(0, Math.floor(faults[code])) : 0,
    }))
    .filter(fault => fault.count > 0)
    .sort((a, b) => b.count - a.count || a.index - b.index)
    .slice(0, 3)
    .map(fault => ({ label: labels[fault.code] ?? fault.code, count: fault.count }));
}

function wireBus(ctx) {
  if (!ctx || typeof ctx !== 'object' || wiredContexts.has(ctx)
      || typeof ctx?.bus?.on !== 'function') return;
  wiredContexts.add(ctx);

  try {
    ctx.bus.on('order:new', () => {
      const state = ctx?.state;
      if (!state || typeof state !== 'object') return;
      state.ordersTaken = (Number.isFinite(state.ordersTaken) ? state.ordersTaken : 0) + 1;
    });
  } catch (_) {
    // A partial bus must not prevent the shift from starting.
  }

  try {
    ctx.bus.on('order:served', payload => {
      const state = ctx?.state;
      if (!state || typeof state !== 'object') return;
      const { order, score, tip } = payload && typeof payload === 'object' ? payload : {};
      const rawScore = typeof score === 'number' ? score : (score?.score ?? 0);
      const s = Number.isFinite(rawScore) ? rawScore : 0;
      const rawTip = tip ?? score?.tip ?? 0;
      const t = Number.isFinite(rawTip) ? rawTip : 0;
      const orderPrice = Number.isFinite(order?.price) ? order.price : 0;
      const rawPayout = score?.payout
        ?? (s >= 0.55 ? orderPrice : s >= 0.25 ? orderPrice * 0.5 : 0);
      const payout = Number.isFinite(rawPayout) ? rawPayout : 0;

      state.served = (Number.isFinite(state.served) ? state.served : 0) + 1;
      state.money = round2((Number.isFinite(state.money) ? state.money : 0) + payout);
      state.tips = round2((Number.isFinite(state.tips) ? state.tips : 0) + t);
      state.rep = clamp((Number.isFinite(state.rep) ? state.rep : 100)
        + (s >= 0.9 ? 2 : s >= 0.55 ? 0 : -4), 0, 100);
      state.perfect = (Number.isFinite(state.perfect) ? state.perfect : 0) + (s >= 0.9 ? 1 : 0);
      updateAccuracy(state);
      tallyFaults(state, payload);
    });
  } catch (_) {
    // A partial bus must not prevent the shift from starting.
  }

  try {
    ctx.bus.on('order:lost', () => {
      const state = ctx?.state;
      if (!state || typeof state !== 'object') return;
      state.lost = (Number.isFinite(state.lost) ? state.lost : 0) + 1;
      state.rep = clamp((Number.isFinite(state.rep) ? state.rep : 100) - 12, 0, 100);
      updateAccuracy(state);
      if (state.lost >= 3 && state.training !== true) endShift(ctx, 'walkouts');
    });
  } catch (_) {
    // A partial bus must not prevent the shift from starting.
  }
}

export function startShift(ctx) {
  const state = ctx?.state;
  if (!state || typeof state !== 'object') return;
  Object.assign(state, createState(), {
    phase: 'playing',
    nextFlight: FLIGHTS[0],
  });
  // Re-resolve here so training toggles made mid-session carry into the next shift.
  state.training = resolvedTraining();
  attachState(ctx);
  wireBus(ctx);
  emit(ctx, 'shift:start', { shiftLength: state.shiftLength });
}

export function shownClock(tSec) {
  const elapsedMinutes = Math.floor(Math.max(0, Number.isFinite(tSec) ? tSec : 0));
  const totalMinutes = 7 * 60 + elapsedMinutes;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function updateState(ctx, dt) {
  const state = ctx?.state;
  if (!state || state.phase !== 'playing' || !Number.isFinite(dt)) return;
  const shiftLength = Number.isFinite(state.shiftLength) && state.shiftLength > 0
    ? state.shiftLength : 480;
  const current = Number.isFinite(state.tSec) ? state.tSec : 0;
  state.tSec = clamp(current + Math.max(0, dt), 0, shiftLength);
  state.clock = shownClock(state.tSec);
  state.ramp = actFor(state.tSec);
  state.act = state.ramp.act;
  const rampStart = ACTS[0].until;
  const rampEnd = shiftLength * 0.8;
  state.difficulty = clamp((state.tSec - rampStart) / Math.max(1, rampEnd - rampStart), 0, 1);

  let index = Number.isInteger(state.flightIndex) ? state.flightIndex : 0;
  index = clamp(index, 0, FLIGHTS.length);
  while (index < FLIGHTS.length && state.tSec >= FLIGHTS[index].time) {
    const flight = FLIGHTS[index];
    emit(ctx, 'rush', {
      flight: flight.flight,
      size: flight.size,
      gate: flight.gate,
      dest: flight.dest,
      time: flight.time,
    });
    emit(ctx, 'sfx', { name: 'pa' });
    index++;
  }
  state.flightIndex = index;
  state.nextFlight = FLIGHTS[index] ?? null;

  if (state.tSec >= shiftLength) endShift(ctx, 'time');
}

export function rankFor(state) {
  const served = Number.isFinite(state?.served) ? state.served : 0;
  const perfect = Number.isFinite(state?.perfect) ? state.perfect : 0;
  const tips = Number.isFinite(state?.tips) ? state.tips : 0;
  const lost = Number.isFinite(state?.lost) ? state.lost : 0;
  const points = served * 10 + perfect * 6 + tips * 8 - lost * 18;
  if (points >= 330) return 'Black Apron';
  if (points >= 180) return 'Coffee Master';
  return 'Green Apron';
}

export function endShift(ctx, reason) {
  const state = ctx?.state;
  if (!state || typeof state !== 'object' || state.phase === 'over') return;
  state.phase = 'over';
  updateAccuracy(state);
  state.rank = rankFor(state);
  state.topFaults = topFaultsFor(state);
  if (reason === 'time') writeStoredValue('simbucks.trainingDone', '1');
  const summary = {
    served: Number.isFinite(state.served) ? state.served : 0,
    lost: Number.isFinite(state.lost) ? state.lost : 0,
    accuracy: round2(state.accuracy),
    tips: round2(state.tips),
    money: round2(state.money),
    rank: state.rank,
    reason: reason ?? 'time',
    perfect: Number.isFinite(state.perfect) ? state.perfect : 0,
    orders: Number.isFinite(state.ordersTaken) ? state.ordersTaken : 0,
    clock: typeof state.clock === 'string' ? state.clock : shownClock(state.tSec),
    topFaults: state.topFaults,
    training: state.training === true,
    act: state.act,
  };
  emit(ctx, 'shift:end', { summary });
}
