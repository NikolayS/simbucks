function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function round2(value) {
  const number = Number.isFinite(value) ? value : 0;
  return Math.round((number + Number.EPSILON) * 100) / 100;
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
    clock: '05:00',
    accuracy: 1,
    ordersTaken: 0,
    perfect: 0,
    shiftLength: 480,
    flightIndex: 0,
    nextFlight: null,
  };
}

export const FLIGHTS = Object.freeze([
  { time: 42, flight: 'BA1442', gate: '12', dest: 'Edinburgh', size: 2 },
  { time: 108, flight: 'FR8213', gate: '31', dest: 'Dublin', size: 2 },
  { time: 176, flight: 'U27714', gate: '6', dest: 'Geneva', size: 3 },
  { time: 244, flight: 'KL1006', gate: '24', dest: 'Amsterdam', size: 3 },
  { time: 312, flight: 'LH0921', gate: '38', dest: 'Frankfurt', size: 3 },
  { time: 378, flight: 'VY6203', gate: '17', dest: 'Barcelona', size: 4 },
  { time: 436, flight: 'AF1181', gate: '41', dest: 'Paris CDG', size: 3 },
].map(Object.freeze));

const wiredContexts = new WeakSet();

function emit(ctx, name, payload) {
  try {
    ctx?.bus?.emit?.(name, payload);
  } catch (_) {
    // The game state remains usable without a bus.
  }
}

function updateAccuracy(state) {
  const served = Number.isFinite(state?.served) ? state.served : 0;
  const lost = Number.isFinite(state?.lost) ? state.lost : 0;
  state.accuracy = clamp(served / Math.max(1, served + lost), 0, 1);
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
      if (state.lost >= 3) endShift(ctx, 'walkouts');
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
  wireBus(ctx);
  emit(ctx, 'shift:start', { shiftLength: state.shiftLength });
}

export function shownClock(tSec) {
  const elapsedMinutes = Math.floor(Math.max(0, Number.isFinite(tSec) ? tSec : 0));
  const totalMinutes = 5 * 60 + elapsedMinutes;
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
  state.difficulty = clamp(state.tSec / (shiftLength * 0.8), 0, 1);

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
  };
  emit(ctx, 'shift:end', { summary });
}
