// SIM*BUCKS HUD — deliberately DOM-only. Keep this module free of imports.

const CORAL = '#E2593C';
const PATIENCE_GREEN = '#3FA46A';
const AMBER = '#E0A526';
const BAD = '#C0392B';

let initialised = false;
let hudRoot = null;
let bus = null;
let ctxRef = null;
let nodes = {};
let lastStatsState = null;
let statsExplicit = false;
let lastLost = null;
let heartFlashTimer = 0;
let rushTimer = 0;
let titleCallback = null;
let titleDismissed = false;
let resumeHintReadyAt = 0;
let lastResumeHintHidden = null;
let debugOpen = false;

let pendingPrompt = null;
let pendingTickets = [];
let pendingMeter = undefined;
let pendingCup = undefined;
let pendingCupSet = false;
let pendingTitleCallback = undefined;
let pendingEndSummary = undefined;
let pendingEndCard = false;
const pendingToasts = [];

let currentOrders = [];
const ticketRecords = new Map();
const orderObjectKeys = new WeakMap();
let nextObjectKey = 1;
let nextPrimitiveKey = 1;
let toastRecords = [];
let nextToastId = 1;
let meterPipCount = -1;
const textCache = new WeakMap();
const styleCache = new WeakMap();
const classCache = new WeakMap();

function warn(where, error) {
  try { console.warn(`[hud:${where}]`, error); } catch (_) { /* console may be stubbed */ }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}

function writeText(node, value) {
  if (!node) return;
  const next = String(value ?? '');
  if (textCache.get(node) === next) return;
  node.textContent = next;
  textCache.set(node, next);
}

function writeStyle(node, property, value) {
  if (!node) return;
  let record = styleCache.get(node);
  if (!record) {
    record = Object.create(null);
    styleCache.set(node, record);
  }
  const next = String(value ?? '');
  if (record[property] === next) return;
  node.style[property] = next;
  record[property] = next;
}

function toggleClass(node, className, on) {
  if (!node) return;
  let record = classCache.get(node);
  if (!record) {
    record = Object.create(null);
    classCache.set(node, record);
  }
  const next = Boolean(on);
  if (record[className] === next) return;
  node.classList.toggle(className, next);
  record[className] = next;
}

function finite(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, finite(value, low)));
}

function renderable(value, fallback = '') {
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function money(value) {
  return Math.max(0, finite(value, 0)).toFixed(2);
}

function orderKey(order) {
  const id = order?.id;
  if ((typeof id === 'string' && id.length) || (typeof id === 'number' && Number.isFinite(id))) {
    return `id:${typeof id}:${String(id)}`;
  }
  if (order && (typeof order === 'object' || typeof order === 'function')) {
    let key = orderObjectKeys.get(order);
    if (!key) {
      key = `object:${nextObjectKey++}`;
      orderObjectKeys.set(order, key);
    }
    return key;
  }
  return `primitive:${typeof order}:${String(order)}:${nextPrimitiveKey++}`;
}

function orderName(order) {
  return renderable(order?.name ?? order?.customer ?? order?.customerName, 'GUEST');
}

function orderDrink(order) {
  const raw = order?.drink?.name ?? order?.drink?.id ?? order?.drinkName ?? order?.drink;
  return renderable(raw, 'Drink');
}

function orderSize(order) {
  let raw = order?.size ?? order?.drink?.size;
  if (Array.isArray(raw)) raw = raw[0];
  return renderable(raw, '').toUpperCase();
}

function orderMods(order) {
  const source = Array.isArray(order?.mods) ? order.mods : [];
  const result = [];
  for (const mod of source) {
    if (typeof mod === 'string') {
      const text = mod.trim();
      if (text) result.push(text);
      continue;
    }
    if (!mod || typeof mod !== 'object') continue;
    let raw = mod?.label ?? mod?.text ?? mod?.name;
    if (raw == null && renderable(mod?.station, '')) {
      raw = `${renderable(mod?.station)}${mod?.param != null ? ` x${renderable(mod.param)}` : ''}`;
    }
    const text = renderable(raw, '');
    if (text) result.push(text);
  }
  return result;
}

function buildPrompt() {
  const wrap = el('div', 'sb-prompt-wrap');
  const crosshair = el('div', 'sb-crosshair');
  crosshair.setAttribute('aria-hidden', 'true');
  const resumeHint = el('div', 'sb-resume-hint', 'CLICK TO RESUME');
  resumeHint.hidden = true;
  const panel = el('div', 'sb-prompt-panel');
  const copy = el('div', 'sb-prompt-copy');
  const label = el('div', 'sb-prompt-label');
  const hint = el('div', 'sb-prompt-hint');
  const key = el('kbd', 'sb-keycap sb-prompt-key', 'E');
  copy.append(label, hint);
  panel.append(copy, key);
  wrap.append(crosshair, panel, resumeHint);
  hudRoot.append(wrap);
  nodes.promptWrap = wrap;
  nodes.promptLabel = label;
  nodes.promptHint = hint;
  nodes.promptKey = key;
  nodes.resumeHint = resumeHint;
}

function parsePrompt(input) {
  if (typeof input === 'string') {
    const text = input.trim();
    if (!text) return null;
    const divider = text.match(/\s+—\s+|\s+-\s+|\r?\n/);
    if (!divider || divider.index == null) return { label: text, hint: '', key: 'E' };
    return {
      label: text.slice(0, divider.index).trim(),
      hint: text.slice(divider.index + divider[0].length).trim(),
      key: 'E',
    };
  }
  if (!input || typeof input !== 'object') return null;
  const label = renderable(input?.label, '');
  const hint = renderable(input?.hint, '');
  if (!label && !hint) return null;
  return { label, hint, key: renderable(input?.key, 'E') };
}

function renderPrompt(input) {
  const prompt = parsePrompt(input);
  const active = Boolean(prompt);
  toggleClass(nodes.promptWrap, 'sb-is-active', active);
  if (!active) {
    writeText(nodes.promptLabel, '');
    writeText(nodes.promptHint, '');
    if (nodes.promptHint) nodes.promptHint.hidden = true;
    return;
  }
  writeText(nodes.promptLabel, prompt?.label ?? '');
  writeText(nodes.promptHint, prompt?.hint ?? '');
  writeText(nodes.promptKey, prompt?.key ?? 'E');
  nodes.promptHint.hidden = !prompt?.hint;
}

function buildTicketRail() {
  const rail = el('section', 'sb-ticket-rail');
  rail.setAttribute('aria-label', 'Outstanding orders');
  const more = el('div', 'sb-more-orders');
  more.hidden = true;
  rail.append(more);
  hudRoot.append(rail);
  nodes.ticketRail = rail;
  nodes.moreOrders = more;
}

function makeTicket(order, key) {
  const card = el('article', 'sb-ticket sb-ticket-in');
  const customer = el('div', 'sb-ticket-customer');
  const drink = el('div', 'sb-ticket-drink');
  const mods = el('div', 'sb-ticket-mods');
  const patience = el('div', 'sb-patience-track');
  const bar = el('div', 'sb-patience-bar');
  patience.append(bar);
  card.append(customer, drink, mods, patience);
  const record = {
    key,
    order,
    el: card,
    customer,
    drink,
    mods,
    bar,
    modSignature: null,
    initialPatience: undefined,
    removing: false,
    removeTimer: 0,
    lastWidth: null,
    lastColour: null,
    lastPulse: null,
  };
  refreshTicket(record, order);
  return record;
}

function refreshTicket(record, order) {
  if (!record) return;
  record.order = order;
  writeText(record.customer, orderName(order).toUpperCase());
  const size = orderSize(order);
  writeText(record.drink, `${size}${size ? '  ' : ''}${orderDrink(order)}`);
  const mods = orderMods(order);
  const signature = JSON.stringify(mods);
  if (record.modSignature === signature) return;
  record.modSignature = signature;
  record.mods.replaceChildren();
  const shown = mods.slice(0, 4);
  for (const mod of shown) record.mods.append(el('span', 'sb-mod-chip', mod));
  if (mods.length > shown.length) record.mods.append(el('span', 'sb-mod-chip sb-mod-more', `+${mods.length - shown.length}`));
  record.mods.hidden = mods.length === 0;
}

function restoreTicket(record) {
  if (!record?.removing) return;
  record.removing = false;
  if (record.removeTimer) clearTimeout(record.removeTimer);
  record.removeTimer = 0;
  toggleClass(record.el, 'sb-ticket-out', false);
}

function removeTicketRecord(record) {
  if (!record || record.removing) return;
  record.removing = true;
  toggleClass(record.el, 'sb-ticket-out', true);
  record.removeTimer = setTimeout(() => {
    try {
      if (!record.removing) return;
      record.el?.remove?.();
      if (ticketRecords.get(record.key) === record) ticketRecords.delete(record.key);
    } catch (error) { warn('ticket-remove', error); }
  }, 230);
}

function applyTickets(list) {
  const source = Array.isArray(list) ? list : [];
  const nextOrders = [];
  const keys = [];
  const seen = new Set();
  for (const order of source) {
    if (order == null) continue;
    const key = orderKey(order);
    if (seen.has(key)) continue;
    seen.add(key);
    nextOrders.push(order);
    keys.push(key);
    let record = ticketRecords.get(key);
    if (!record) {
      record = makeTicket(order, key);
      ticketRecords.set(key, record);
    } else {
      restoreTicket(record);
      refreshTicket(record, order);
    }
  }

  for (const [key, record] of ticketRecords) {
    if (!seen.has(key)) removeTicketRecord(record);
  }

  currentOrders = nextOrders;
  const rail = nodes.ticketRail;
  for (let index = 0; index < keys.length; index += 1) {
    const record = ticketRecords.get(keys[index]);
    if (!record) continue;
    toggleClass(record.el, 'sb-is-front', index === 0);
    record.el.hidden = index >= 5;
    rail?.insertBefore?.(record.el, nodes.moreOrders ?? null);
  }
  const extra = Math.max(0, nextOrders.length - 5);
  writeText(nodes.moreOrders, `+${extra} MORE`);
  if (nodes.moreOrders) nodes.moreOrders.hidden = extra === 0;
}

function patienceFor(record) {
  const order = record?.order;
  const direct = order?.patience01 ?? order?.patienceFrac ?? order?.frac;
  if (typeof direct === 'number' && Number.isFinite(direct)) return { fraction: clamp(direct, 0, 1), live: true };
  const patience = order?.patience;
  if (typeof patience !== 'number' || !Number.isFinite(patience)) return { fraction: 1, live: false };
  const statedMax = order?.patienceMax ?? order?.patience0;
  if (typeof statedMax === 'number' && Number.isFinite(statedMax) && statedMax > 0) {
    return { fraction: clamp(patience / statedMax, 0, 1), live: true };
  }
  if (!(typeof record?.initialPatience === 'number' && Number.isFinite(record.initialPatience))) {
    record.initialPatience = patience <= 1 ? 1 : Math.max(patience, Number.EPSILON);
  }
  return { fraction: clamp(patience / record.initialPatience, 0, 1), live: true };
}

function updateTicketsFrame() {
  const visible = currentOrders.slice(0, 5);
  for (const order of visible) {
    const record = ticketRecords.get(orderKey(order));
    if (!record || record.removing) continue;
    record.order = order;
    const patience = patienceFor(record);
    const width = `${(patience.fraction * 100).toFixed(2)}%`;
    const colour = patience.fraction > 0.55 ? PATIENCE_GREEN : patience.fraction >= 0.28 ? AMBER : BAD;
    if (record.lastWidth !== width) {
      writeStyle(record.bar, 'width', width);
      record.lastWidth = width;
    }
    if (record.lastColour !== colour) {
      writeStyle(record.bar, 'backgroundColor', colour);
      record.lastColour = colour;
    }
    const pulse = patience.live && patience.fraction < 0.15;
    if (record.lastPulse !== pulse) {
      toggleClass(record.bar, 'sb-is-critical', pulse);
      record.lastPulse = pulse;
    }
  }
}

function buildMeter() {
  const meter = el('section', 'sb-meter');
  meter.hidden = true;
  const meta = el('div', 'sb-meter-meta');
  const caption = el('span', 'sb-meter-caption', 'DOSE');
  const readout = el('span', 'sb-meter-readout', '0%');
  const good = el('span', 'sb-meter-good', 'IN THE ZONE');
  good.hidden = true;
  meta.append(caption, readout);
  const barWrap = el('div', 'sb-meter-bar-wrap');
  const track = el('div', 'sb-meter-track');
  const zone = el('div', 'sb-meter-zone');
  const fill = el('div', 'sb-meter-fill');
  const needle = el('div', 'sb-meter-needle');
  track.append(zone, fill, needle);
  barWrap.append(good, track);
  const pips = el('div', 'sb-meter-pips');
  pips.hidden = true;
  meter.append(meta, barWrap, pips);
  hudRoot.append(meter);
  Object.assign(nodes, { meter, meterCaption: caption, meterReadout: readout, meterGood: good,
    meterBarWrap: barWrap, meterTrack: track, meterZone: zone, meterFill: fill,
    meterNeedle: needle, meterPips: pips });
}

function rawZone(cfg) {
  const zone = cfg?.zone;
  if (Array.isArray(zone)) {
    const a = finite(zone?.[0], NaN);
    const b = finite(zone?.[1], NaN);
    return Number.isFinite(a) && Number.isFinite(b) ? [Math.min(a, b), Math.max(a, b)] : null;
  }
  if (zone && typeof zone === 'object') {
    const a = finite(zone?.min, NaN);
    const b = finite(zone?.max, NaN);
    return Number.isFinite(a) && Number.isFinite(b) ? [Math.min(a, b), Math.max(a, b)] : null;
  }
  if (typeof zone === 'number' && Number.isFinite(zone)) return zone;
  return null;
}

function ensurePips(count) {
  if (meterPipCount === count) return;
  meterPipCount = count;
  nodes.meterPips?.replaceChildren?.();
  for (let index = 1; index <= count; index += 1) {
    const pip = el('span', 'sb-meter-pip');
    pip.dataset.sbIndex = String(index);
    nodes.meterPips?.append?.(pip);
  }
}

function renderMeter(cfg) {
  if (!nodes.meter) return;
  if (!cfg || typeof cfg !== 'object') {
    nodes.meter.hidden = true;
    return;
  }
  const requestedKind = renderable(cfg?.kind, '').toLowerCase();
  if (!requestedKind) {
    nodes.meter.hidden = true;
    return;
  }
  const kind = requestedKind === 'pump' ? 'syrup' : requestedKind;
  nodes.meter.hidden = false;
  toggleClass(nodes.meter, 'sb-is-syrup', kind === 'syrup');
  const value = finite(cfg?.value, 0);
  const suppliedText = typeof cfg?.text === 'string' && cfg.text.trim() ? cfg.text : null;

  if (kind === 'syrup') {
    const pipCount = clamp(Math.round(cfg?.max ?? 8), 1, 32);
    const toPumps = v => (Number.isFinite(v) && v > 0 && v < 1)
      ? Math.round(v * pipCount)
      : Math.round(Math.max(0, finite(v, 0)));
    const target = toPumps(cfg?.target ?? (Array.isArray(cfg?.zone)
      ? cfg.zone[0]
      : (typeof cfg?.zone === 'number' ? cfg.zone : cfg?.zone?.min)));
    const done = toPumps(cfg?.value);
    ensurePips(pipCount);
    for (const pip of nodes.meterPips?.children ?? []) {
      const index = finite(Number(pip?.dataset?.sbIndex), 0);
      toggleClass(pip, 'sb-is-filled', index <= done);
      toggleClass(pip, 'sb-is-target', index === target);
      toggleClass(pip, 'sb-is-over', index > target);
    }
    writeText(nodes.meterCaption, renderable(cfg?.label, 'SYRUP').toUpperCase());
    writeText(nodes.meterReadout, suppliedText ?? (target > 0 ? `${done} / ${target}` : `${done}`));
    nodes.meterGood.hidden = true;
    toggleClass(nodes.meter, 'sb-is-in-zone', done === target && target > 0);
    toggleClass(nodes.meter, 'sb-is-over', done > target && target > 0);
    return;
  }

  const zoneValue = rawZone(cfg);
  const hasZone = Array.isArray(zoneValue) || typeof zoneValue === 'number';
  const zoneHigh = Array.isArray(zoneValue) ? zoneValue[1] : typeof zoneValue === 'number' ? zoneValue : 1;
  const configuredMax = finite(cfg?.max, NaN);
  const max = Number.isFinite(configuredMax) && configuredMax > 0
    ? configuredMax
    : hasZone
      ? zoneHigh <= 1 ? 1 : Math.max(zoneHigh * 1.3, value)
      : value > 1.6 ? value : 1;
  let zone = null;
  if (Array.isArray(zoneValue)) zone = zoneValue;
  else if (typeof zoneValue === 'number') zone = [zoneValue - 0.04 * max, zoneValue + 0.04 * max];
  if (zone) zone = [clamp(zone[0], 0, max), clamp(zone[1], 0, max)];
  const visualValue = clamp(value, 0, max);
  const percent = clamp((visualValue / max) * 100, 0, 100);
  const inZone = Boolean(zone && value >= zone[0] && value <= zone[1]);
  const overZone = Boolean(!inZone && (zone ? value > zone[1] : value > 1));
  const captions = { dose: 'DOSE', shot: 'EXTRACTION', steam: 'STEAM', blend: 'BLEND', pour: 'POUR' };
  const label = renderable(cfg?.label, captions[kind] ?? kind.toUpperCase()).toUpperCase();
  const hasUnitOverride = typeof cfg?.unit === 'string';
  const unit = hasUnitOverride ? cfg.unit : kind === 'shot' ? 's' : kind === 'steam' ? '°C' : '';
  const readout = suppliedText ?? (max <= 1.001 ? `${Math.round(value * 100)}%` : `${value.toFixed(1)}${unit}`);
  writeText(nodes.meterCaption, label);
  writeText(nodes.meterReadout, readout);
  writeStyle(nodes.meterFill, 'width', `${percent.toFixed(2)}%`);
  writeStyle(nodes.meterNeedle, 'left', `${percent.toFixed(2)}%`);
  nodes.meterZone.hidden = !zone;
  if (zone) {
    writeStyle(nodes.meterZone, 'left', `${((zone[0] / max) * 100).toFixed(2)}%`);
    writeStyle(nodes.meterZone, 'width', `${(((zone[1] - zone[0]) / max) * 100).toFixed(2)}%`);
  }
  toggleClass(nodes.meter, 'sb-is-in-zone', inZone);
  toggleClass(nodes.meter, 'sb-is-over', overZone);
  writeText(nodes.meterGood, kind === 'shot' ? 'PERFECT' : 'IN THE ZONE');
  nodes.meterGood.hidden = !inZone;
}

function buildStats() {
  const region = el('section', 'sb-stat-region');
  const strip = el('div', 'sb-stat-strip');
  const clock = statCell('SHIFT', '05:00', 'sb-stat-clock');
  const cash = statCell('TAKINGS', '£0.00');
  const tips = statCell('TIPS', '£0.00', 'sb-stat-tips');
  const served = statCell('SERVED', '0', 'sb-stat-served');
  const heartsCell = el('div', 'sb-stat-cell sb-stat-hearts');
  const heartsLabel = el('span', 'sb-stat-label', 'WALK-OUTS');
  const hearts = el('span', 'sb-hearts');
  const heartNodes = [];
  for (let index = 0; index < 3; index += 1) {
    const heart = el('span', 'sb-heart', '♥');
    hearts.append(heart);
    heartNodes.push(heart);
  }
  heartsCell.append(heartsLabel, hearts);
  strip.append(clock.cell, cash.cell, tips.cell, served.cell, heartsCell);
  const rush = el('div', 'sb-rush-banner');
  rush.hidden = true;
  region.append(strip, rush);
  hudRoot.append(region);
  Object.assign(nodes, { statStrip: strip, statClock: clock.value, statCash: cash.value,
    statTips: tips.value, statServed: served.value, hearts: heartNodes, rush });
}

function statCell(label, value, extraClass = '') {
  const cell = el('div', `sb-stat-cell${extraClass ? ` ${extraClass}` : ''}`);
  const labelNode = el('span', 'sb-stat-label', label);
  const valueNode = el('span', 'sb-stat-value', value);
  cell.append(labelNode, valueNode);
  return { cell, value: valueNode };
}

function clockText(state) {
  if (typeof state?.clockText === 'string') return state.clockText;
  if (typeof state?.clock === 'string') return state.clock;
  const tSec = Math.max(0, finite(state?.tSec, 0));
  const rawLength = finite(state?.shiftLength, finite(state?.duration, 480));
  const length = rawLength > 0 ? rawLength : 480;
  const minutes = clamp(5 * 60 + (tSec / length) * 8 * 60, 5 * 60, 13 * 60);
  const rounded = Math.floor(minutes);
  const hour = Math.floor(rounded / 60);
  const minute = rounded % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function lostCount(state) {
  return clamp(Math.floor(finite(state?.lost, finite(state?.walkouts, 0))), 0, 3);
}

function updateStatsFrame() {
  const state = (statsExplicit && lastStatsState) || ctxRef?.state || lastStatsState || {};
  writeText(nodes.statClock, clockText(state));
  writeText(nodes.statCash, `£${money(state?.money)}`);
  writeText(nodes.statTips, `£${money(state?.tips)}`);
  writeText(nodes.statServed, String(Math.max(0, Math.floor(finite(state?.served, 0)))));
  const lost = lostCount(state);
  if (lastLost != null && lost > lastLost) flashHearts();
  lastLost = lost;
  const left = 3 - lost;
  for (let index = 0; index < (nodes.hearts?.length ?? 0); index += 1) {
    const alive = index < left;
    writeText(nodes.hearts[index], alive ? '♥' : '♡');
    toggleClass(nodes.hearts[index], 'sb-is-lost', !alive);
  }
}

function flashHearts() {
  toggleClass(nodes.statStrip, 'sb-hearts-flash', true);
  if (heartFlashTimer) clearTimeout(heartFlashTimer);
  heartFlashTimer = setTimeout(() => {
    try { toggleClass(nodes.statStrip, 'sb-hearts-flash', false); }
    catch (error) { warn('heart-flash', error); }
  }, 520);
}

function showRush(payload) {
  const flightValue = payload?.flight;
  const flightObject = flightValue && typeof flightValue === 'object' ? flightValue : null;
  const flight = renderable(flightObject?.flight ?? flightValue, '');
  const gate = renderable(flightObject?.gate ?? payload?.gate, '');
  const dest = renderable(flightObject?.dest ?? payload?.dest, '');
  const parts = ['BOARDING'];
  if (flight) parts.push(flight);
  if (gate) parts.push(`GATE ${gate}`);
  if (dest) parts.push(dest);
  writeText(nodes.rush, parts.join(' · ').toUpperCase());
  nodes.rush.hidden = false;
  toggleClass(nodes.rush, 'sb-is-visible', true);
  if (rushTimer) clearTimeout(rushTimer);
  rushTimer = setTimeout(() => {
    try {
      toggleClass(nodes.rush, 'sb-is-visible', false);
      setTimeout(() => {
        try { if (nodes.rush) nodes.rush.hidden = true; }
        catch (error) { warn('rush-hide', error); }
      }, 230);
    } catch (error) { warn('rush-exit', error); }
  }, 4500);
}

function buildCupChip() {
  const chip = el('section', 'sb-cup-chip');
  chip.hidden = true;
  const drawing = el('div', 'sb-cup-drawing');
  const lid = el('div', 'sb-cup-lid');
  const body = el('div', 'sb-cup-body');
  drawing.append(lid, body);
  const copy = el('div', 'sb-cup-copy');
  const heading = el('div', 'sb-cup-heading');
  const size = el('span', 'sb-cup-size', 'CUP');
  const badge = el('span', 'sb-lidded-badge', 'LIDDED');
  heading.append(size, badge);
  const contents = el('div', 'sb-cup-contents');
  copy.append(heading, contents);
  chip.append(drawing, copy);
  hudRoot.append(chip);
  Object.assign(nodes, { cupChip: chip, cupDrawing: drawing, cupSize: size,
    cupBadge: badge, cupContents: contents });
}

function cupContents(cup) {
  const source = cup?.contents ?? cup?.items ?? cup?.parts ?? cup?.steps ?? [];
  if (!Array.isArray(source)) return [];
  const result = [];
  for (const item of source) {
    if (typeof item === 'string') {
      const text = item.trim();
      if (text) result.push(text);
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const label = renderable(item?.name ?? item?.id ?? item?.station, '');
    if (!label) continue;
    const count = item?.n ?? item?.count;
    const param = item?.param;
    if (typeof count === 'number' && Number.isFinite(count)) result.push(`${label} x${count}`);
    else if (typeof param === 'number' && Number.isFinite(param)) {
      result.push(/milk|steam/i.test(label) ? `${label} ${param}°` : `${label} x${param}`);
    } else if (renderable(param, '')) result.push(`${label} ${renderable(param)}`);
    else result.push(label);
  }
  return result;
}

function renderCup(cup) {
  if (!nodes.cupChip) return;
  if (cup == null) {
    toggleClass(nodes.cupChip, 'sb-is-visible', false);
    setTimeout(() => {
      try {
        if (!nodes.cupChip?.classList?.contains('sb-is-visible')) nodes.cupChip.hidden = true;
      } catch (error) { warn('cup-hide', error); }
    }, 180);
    return;
  }
  nodes.cupChip.hidden = false;
  toggleClass(nodes.cupChip, 'sb-is-visible', true);
  const lidded = Boolean(cup?.lid ?? cup?.lidded ?? cup?.hasLid);
  toggleClass(nodes.cupDrawing, 'sb-is-lidded', lidded);
  nodes.cupBadge.hidden = !lidded;
  writeText(nodes.cupSize, renderable(cup?.size, 'CUP').toUpperCase());
  const contents = cupContents(cup);
  nodes.cupContents.replaceChildren();
  const shown = contents.slice(0, 6);
  for (const item of shown) nodes.cupContents.append(el('span', 'sb-cup-content', item));
  if (contents.length > shown.length) nodes.cupContents.append(el('span', 'sb-cup-content', `+${contents.length - shown.length}`));
}

function buildToasts() {
  const stack = el('div', 'sb-toast-stack');
  stack.setAttribute('aria-live', 'polite');
  stack.setAttribute('aria-atomic', 'false');
  hudRoot.append(stack);
  nodes.toastStack = stack;
}

function clearToastTimer(record) {
  if (record?.lifeTimer) clearTimeout(record.lifeTimer);
  if (record?.removeTimer) clearTimeout(record.removeTimer);
  if (record) {
    record.lifeTimer = 0;
    record.removeTimer = 0;
  }
}

function scheduleToastExit(record) {
  if (!record || record.exiting) return;
  record.exiting = true;
  if (record.lifeTimer) clearTimeout(record.lifeTimer);
  toggleClass(record.el, 'sb-toast-out', true);
  record.removeTimer = setTimeout(() => {
    try {
      record.el?.remove?.();
      toastRecords = toastRecords.filter(item => item !== record);
    } catch (error) { warn('toast-remove', error); }
  }, 330);
}

function armToast(record) {
  if (!record) return;
  if (record.lifeTimer) clearTimeout(record.lifeTimer);
  record.lifeTimer = setTimeout(() => {
    try { scheduleToastExit(record); }
    catch (error) { warn('toast-life', error); }
  }, 2200);
}

function addToast(text, ok) {
  const message = renderable(text, '');
  if (!message || !nodes.toastStack) return;
  const now = typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now() : Date.now();
  const duplicate = [...toastRecords].reverse().find(record => !record.exiting && record.text === message && now - record.lastAt <= 400);
  if (duplicate) {
    duplicate.count += 1;
    duplicate.lastAt = now;
    writeText(duplicate.countNode, `×${duplicate.count}`);
    duplicate.countNode.hidden = false;
    toggleClass(duplicate.el, 'sb-toast-bump', false);
    setTimeout(() => {
      try { toggleClass(duplicate.el, 'sb-toast-bump', true); }
      catch (error) { warn('toast-bump', error); }
    }, 0);
    armToast(duplicate);
    return;
  }
  const active = toastRecords.filter(record => !record.exiting);
  if (active.length >= 2) scheduleToastExit(active[0]);
  const toastEl = el('div', `sb-toast ${ok === true ? 'sb-toast-ok' : ok === false ? 'sb-toast-bad' : 'sb-toast-neutral'}`);
  const copy = el('span', 'sb-toast-copy', message);
  const count = el('span', 'sb-toast-count');
  count.hidden = true;
  toastEl.append(copy, count);
  const record = { id: nextToastId++, el: toastEl, countNode: count, text: message,
    count: 1, lastAt: now, exiting: false, lifeTimer: 0, removeTimer: 0 };
  toastRecords.push(record);
  nodes.toastStack.append(toastEl);
  armToast(record);
}

function clearToasts() {
  for (const record of toastRecords) clearToastTimer(record);
  toastRecords = [];
  nodes.toastStack?.replaceChildren?.();
}

function keycap(text) {
  return el('kbd', 'sb-keycap', text);
}

function buildScreens() {
  const titleScreen = el('section', 'sb-screen sb-title-screen');
  titleScreen.hidden = true;
  const titleCard = el('div', 'sb-screen-card sb-title-card');
  const wordmark = el('h1', 'sb-wordmark');
  wordmark.append(document.createTextNode('SIM'), el('span', 'sb-wordmark-star', '✱'), document.createTextNode('BUCKS'));
  const rule = el('div', 'sb-title-rule');
  const premise = el('p', 'sb-premise', 'Gatwick, 05:00. Two gates are boarding. Make the coffee.');
  const controls = el('div', 'sb-controls');
  const bindings = [
    ['MOUSE', 'look'], ['WASD', 'move'], ['E', 'act'], ['HOLD E', 'meters'],
    ['Q', 'dump'], ['L', 'lid'], ['SHIFT', 'hurry'], ['ESC', 'release mouse'],
  ];
  for (const [key, description] of bindings) {
    const item = el('div', 'sb-control');
    item.append(keycap(key), el('span', 'sb-control-label', description));
    controls.append(item);
  }
  const start = el('button', 'sb-primary-button', 'START SHIFT');
  start.type = 'button';
  const footer = el('p', 'sb-screen-footer', 'no assets · everything drawn and synthesised at runtime');
  titleCard.append(wordmark, rule, premise, controls, start, footer);
  titleScreen.append(titleCard);

  const endScreen = el('section', 'sb-screen sb-end-screen');
  endScreen.hidden = true;
  const endCard = el('div', 'sb-screen-card sb-end-card');
  const endEyebrow = el('div', 'sb-end-eyebrow', 'SHIFT COMPLETE');
  const rank = el('h2', 'sb-end-rank', 'GREEN APRON');
  const grid = el('div', 'sb-end-grid');
  const endFields = {};
  const summaries = [
    ['served', 'DRINKS SERVED'], ['accuracy', 'ACCURACY'], ['tips', 'TIPS'],
    ['money', 'TOTAL MONEY'], ['lost', 'WALK-OUTS'],
  ];
  for (const [name, label] of summaries) {
    const item = el('div', 'sb-end-stat');
    const labelNode = el('span', 'sb-end-label', label);
    const valueNode = el('span', 'sb-end-value', '0');
    item.append(labelNode, valueNode);
    grid.append(item);
    endFields[name] = valueNode;
  }
  const replay = el('button', 'sb-primary-button', 'PLAY AGAIN');
  replay.type = 'button';
  endCard.append(endEyebrow, rank, grid, replay);
  endScreen.append(endCard);
  hudRoot.append(titleScreen, endScreen);
  Object.assign(nodes, { titleScreen, titleStart: start, endScreen, endRank: rank,
    endFields, replay });

  start.addEventListener('click', () => activateTitle());
  replay.addEventListener('click', () => {
    try { globalThis.location?.reload?.(); } catch (error) { warn('reload', error); }
  });
}

function updatePointerLockHint() {
  if (!nodes.resumeHint) return;
  const screenOpen = !nodes.titleScreen?.hidden || !nodes.endScreen?.hidden;
  const hidden = Boolean(document.pointerLockElement)
    || !titleDismissed
    || screenOpen
    || Date.now() < resumeHintReadyAt;
  if (hidden === lastResumeHintHidden) return;
  nodes.resumeHint.hidden = hidden;
  lastResumeHintHidden = hidden;
}

function onPointerLockChange() {
  try { updatePointerLockHint(); }
  catch (error) { warn('pointer-lock-change', error); }
}

function showTitleInternal(onStart) {
  if (!nodes.titleScreen) return;
  titleCallback = typeof onStart === 'function' ? onStart : null;
  nodes.endScreen.hidden = true;
  nodes.titleScreen.hidden = false;
  titleDismissed = false;
  toggleClass(hudRoot, 'sb-screen-open', true);
  updatePointerLockHint();
  try { nodes.titleStart?.focus?.({ preventScroll: true }); } catch (_) { /* focus is optional */ }
}

function activateTitle() {
  if (!nodes.titleScreen || nodes.titleScreen.hidden) return;
  nodes.titleScreen.hidden = true;
  titleDismissed = true;
  resumeHintReadyAt = Date.now() + 900;
  toggleClass(hudRoot, 'sb-screen-open', false);
  updatePointerLockHint();
  const callback = titleCallback;
  titleCallback = null;
  if (typeof callback === 'function') {
    try { callback(); } catch (error) { warn('start-callback', error); }
  }
  try {
    const canvas = ctxRef?.renderer?.domElement ?? document.querySelector('#app canvas');
    const result = canvas?.requestPointerLock?.();
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch (error) { warn('pointer-lock', error); }
  try { bus?.emit?.('hud:start'); } catch (error) { warn('hud-start', error); }
}

function renderEndCard(summary) {
  if (!nodes.endScreen) return;
  renderMeter(null);
  renderPrompt(null);
  renderCup(null);
  applyTickets([]);
  clearToasts();
  const safeSummary = summary && typeof summary === 'object' ? summary : {};
  const state = (statsExplicit && lastStatsState) || ctxRef?.state || lastStatsState || {};
  const served = Math.max(0, Math.floor(finite(safeSummary?.served, finite(state?.served, 0))));
  let accuracy = finite(safeSummary?.accuracy, finite(state?.accuracy, 0));
  if (accuracy <= 1) accuracy *= 100;
  accuracy = clamp(accuracy, 0, 100);
  const tips = finite(safeSummary?.tips, finite(state?.tips, 0));
  const total = finite(safeSummary?.money, finite(safeSummary?.total, finite(state?.money, 0)));
  const lost = Math.max(0, Math.floor(finite(safeSummary?.lost,
    finite(safeSummary?.walkouts, finite(state?.lost, finite(state?.walkouts, 0))))));
  const suppliedRank = renderable(safeSummary?.rank, '');
  const rank = suppliedRank || (served >= 18 && accuracy >= 90 ? 'BLACK APRON' : served >= 10 ? 'COFFEE MASTER' : 'GREEN APRON');
  writeText(nodes.endRank, rank.toUpperCase());
  writeText(nodes.endFields?.served, String(served));
  writeText(nodes.endFields?.accuracy, `${Math.round(accuracy)}%`);
  writeText(nodes.endFields?.tips, `£${money(tips)}`);
  writeText(nodes.endFields?.money, `£${money(total)}`);
  writeText(nodes.endFields?.lost, String(lost));
  nodes.titleScreen.hidden = true;
  nodes.endScreen.hidden = false;
  titleDismissed = true;
  toggleClass(hudRoot, 'sb-screen-open', true);
  updatePointerLockHint();
  try { document.exitPointerLock?.(); } catch (error) { warn('exit-pointer-lock', error); }
  try { nodes.replay?.focus?.({ preventScroll: true }); } catch (_) { /* focus is optional */ }
}

function teleportCoordinates(layout) {
  const aisleFront = finite(layout?.kiosk?.aisle?.z1, 0.75) - 0.15;
  const aisleBack = finite(layout?.kiosk?.aisle?.z0, -1.75) + 0.55;
  const merch = layout?.terminal?.merch;
  const merchX = (finite(merch?.x0, 6.2) + finite(merch?.x1, 8.4)) / 2 - 0.3;
  const merchZ = (finite(merch?.z0, 0.8) + finite(merch?.z1, 2.8)) / 2;
  return [
    ['Till', finite(layout?.front?.till?.x, -2.4), aisleFront],
    ['Grinder', finite(layout?.back?.grinder?.x, -3.6), aisleBack],
    ['Espresso', finite(layout?.back?.espresso?.x, -1.8), aisleBack],
    ['Handoff', finite(layout?.front?.handoff?.x1, 4.6) - 1, aisleFront],
    ['Merch', merchX, merchZ],
    ['Spawn', finite(layout?.player?.spawn?.x, 0), finite(layout?.player?.spawn?.z, -0.6)],
  ];
}

function buildDebug(layout) {
  const panel = el('aside', 'sb-debug-panel');
  panel.setAttribute('aria-label', 'Debug teleport');
  panel.append(el('div', 'sb-debug-title', 'TELEPORT'));
  for (const [label, x, z] of teleportCoordinates(layout)) {
    const button = el('button', 'sb-debug-button', `${label}  ${x.toFixed(2)}, ${z.toFixed(2)}`);
    button.type = 'button';
    button.addEventListener('click', () => {
      try { bus?.emit?.('debug:teleport', { x, z }); }
      catch (error) { warn('debug-teleport', error); }
    });
    panel.append(button);
  }
  hudRoot.append(panel);
  nodes.debugPanel = panel;
}

function toggleDebug() {
  debugOpen = !debugOpen;
  toggleClass(nodes.debugPanel, 'sb-is-open', debugOpen);
}

function onKeyDown(event) {
  try {
    if (event?.code === 'Backquote' && !event?.repeat) {
      event.preventDefault?.();
      toggleDebug();
      return;
    }
    if (!nodes.titleScreen?.hidden && (event?.code === 'Enter' || event?.code === 'Space')) {
      event.preventDefault?.();
      activateTitle();
    }
  } catch (error) { warn('keydown', error); }
}

function removeOrder(order) {
  if (order == null) return;
  const target = orderKey(order);
  applyTickets(currentOrders.filter(item => orderKey(item) !== target));
}

function subscribe(name, handler) {
  if (typeof bus?.on !== 'function') return;
  const listener = payload => {
    try { handler(payload); }
    catch (error) { warn(name, error); }
  };
  try { bus.on(name, listener); } catch (error) { warn(`subscribe:${name}`, error); }
}

function wireBus() {
  subscribe('order:new', payload => {
    const order = payload?.order;
    if (order != null) {
      const key = orderKey(order);
      const exists = currentOrders.some(item => orderKey(item) === key);
      applyTickets(exists ? currentOrders.map(item => orderKey(item) === key ? order : item) : [...currentOrders, order]);
    }
    bus?.emit?.('sfx', { name: 'pageturn' });
  });
  subscribe('order:served', payload => {
    const order = payload?.order;
    removeOrder(order);
    let amount = finite(payload?.paid, NaN);
    if (!Number.isFinite(amount)) {
      const score = finite(payload?.score, NaN);
      const price = finite(payload?.order?.price, NaN);
      if (Number.isFinite(score) && score > 1.5) amount = score;
      else if (Number.isFinite(score) && Number.isFinite(price)) amount = score * price;
      else if (Number.isFinite(price)) amount = price;
      else amount = NaN;
    }
    const tip = Math.max(0, finite(payload?.tip, 0));
    const tipText = tip > 0 ? `  +£${tip.toFixed(2)} TIP` : '';
    const drink = orderDrink(order).toUpperCase();
    const text = Number.isFinite(amount) ? `+£${amount.toFixed(2)}  ${drink}${tipText}` : `SERVED · ${drink}`;
    addToast(text, true);
  });
  subscribe('order:lost', payload => {
    const order = payload?.order;
    removeOrder(order);
    const reason = typeof payload?.reason === 'string' ? payload.reason.trim() : '';
    addToast(`${orderName(order).toUpperCase()} WALKED OUT${reason ? ` · ${reason}` : ''}`, false);
    flashHearts();
  });
  subscribe('station:feedback', payload => {
    const text = typeof payload?.text === 'string' ? payload.text.trim() : '';
    if (text) addToast(text, payload?.ok);
  });
  subscribe('cup:changed', payload => { renderCup(payload?.cup); });
  subscribe('shift:start', () => {
    applyTickets([]);
    clearToasts();
    lastLost = 0;
    if (!statsExplicit) lastStatsState = {};
    updateStatsFrame();
  });
  subscribe('shift:end', payload => { showEndCard(payload?.summary ?? payload); });
  subscribe('rush', payload => { showRush(payload); });
}

function frame() {
  if (!initialised) return;
  try { updateTicketsFrame(); } catch (error) { warn('ticket-frame', error); }
  try { updateStatsFrame(); } catch (error) { warn('stats-frame', error); }
  try { updatePointerLockHint(); } catch (error) { warn('pointer-lock-frame', error); }
  try { requestAnimationFrame(frame); } catch (error) { warn('raf', error); }
}

function applyPending() {
  renderPrompt(pendingPrompt);
  applyTickets(pendingTickets);
  if (pendingMeter !== undefined) renderMeter(pendingMeter);
  if (pendingCupSet) renderCup(pendingCup);
  const queuedToasts = pendingToasts.splice(0);
  for (const item of queuedToasts) addToast(item?.text, item?.ok);
  if (!pendingEndCard) showTitleInternal(pendingTitleCallback);
  if (pendingEndCard) renderEndCard(pendingEndSummary);
}

export function initHUD(ctx) {
  try {
    if (initialised) return;
    if (typeof document === 'undefined') return;
    ctxRef = ctx && typeof ctx === 'object' ? ctx : {};
    bus = ctxRef?.bus ?? null;
    lastStatsState = lastStatsState ?? {};
    let css = document.getElementById('sb-hud-css');
    if (!css) {
      css = document.createElement('link');
      css.id = 'sb-hud-css';
      css.rel = 'stylesheet';
      css.href = './src/ui/hud.css';
      document.head?.append?.(css);
    }
    hudRoot = document.getElementById('hud');
    if (!hudRoot) {
      hudRoot = document.createElement('div');
      hudRoot.id = 'hud';
      document.body?.append?.(hudRoot);
    }
    hudRoot.classList.add('sb-hud');
    buildPrompt();
    buildTicketRail();
    buildMeter();
    buildStats();
    buildCupChip();
    buildToasts();
    buildScreens();
    buildDebug(ctxRef?.layout);
    addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    wireBus();
    initialised = true;
    applyPending();
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(frame);
  } catch (error) { warn('init', error); }
}

export function setPrompt(textOrObj) {
  try {
    pendingPrompt = textOrObj ?? null;
    if (initialised) renderPrompt(pendingPrompt);
  } catch (error) { warn('setPrompt', error); }
}

export function setTickets(list) {
  try {
    pendingTickets = Array.isArray(list) ? list : [];
    if (initialised) applyTickets(pendingTickets);
  } catch (error) { warn('setTickets', error); }
}

export function setMeter(cfgOrNull) {
  try {
    pendingMeter = cfgOrNull ?? null;
    if (initialised) renderMeter(pendingMeter);
  } catch (error) { warn('setMeter', error); }
}

export function toast(text, ok) {
  try {
    if (!initialised) {
      if (renderable(text, '')) {
        pendingToasts.push({ text, ok });
        if (pendingToasts.length > 4) pendingToasts.splice(0, pendingToasts.length - 4);
      }
      return;
    }
    addToast(text, ok);
  } catch (error) { warn('toast', error); }
}

export function setStats(state) {
  try {
    statsExplicit = true;
    lastStatsState = state ?? {};
    if (initialised) updateStatsFrame();
  } catch (error) { warn('setStats', error); }
}

export function showEndCard(summary) {
  try {
    pendingEndCard = true;
    pendingEndSummary = summary;
    if (initialised) renderEndCard(summary);
  } catch (error) { warn('showEndCard', error); }
}

export function showTitle(onStart) {
  try {
    pendingTitleCallback = typeof onStart === 'function' ? onStart : undefined;
    if (initialised) showTitleInternal(pendingTitleCallback);
  } catch (error) { warn('showTitle', error); }
}
