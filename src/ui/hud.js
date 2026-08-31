// SIM*BUCKS HUD — deliberately DOM-only. Keep this module free of imports.

const CORAL = '#E2593C';
const PATIENCE_GREEN = '#3FA46A';
const AMBER = '#E0A526';
const BAD = '#C0392B';
const TOUCH_BUTTON_LABELS = { E: 'ACT', Q: 'DROP', L: 'LID' };
const SMALL_TICKET_QUERY = '(max-height: 480px), (max-width: 560px)';

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
let touchMode = false;
let lastTouchAt = 0;
let resetTouchInputs = null;
let trainingMirror = true;
let lastObservedTraining = undefined;
let latestGuideStep = null;
let stationAnchorsCache = null;
let stationAnchorsGetter = null;
let stationAnchorRefreshId = null;
let stationProjectionPoint = null;
let smallTicketMedia = null;

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
let recentServedFault = null;
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

function emitInput(name, payload) {
  try { bus?.emit?.(name, payload); }
  catch (error) { warn(name, error); }
}

function trainingIsOn() {
  return trainingMirror;
}

function observeTrainingState() {
  try {
    const ownedValue = ctxRef?.state?.training;
    if (typeof ownedValue !== 'boolean' || ownedValue === lastObservedTraining) return;
    trainingMirror = ownedValue;
    lastObservedTraining = ownedValue;
  } catch (error) {
    warn('training-state', error);
  }
}

function syncTrainingUI() {
  const on = trainingIsOn();
  toggleClass(hudRoot, 'sb-training', on);
  for (const button of [nodes.titleTrainingToggle, nodes.playTrainingToggle]) {
    if (!button) continue;
    button.setAttribute('aria-pressed', String(on));
    writeText(button.querySelector?.('.sb-training-toggle-state'), on ? 'ON' : 'OFF');
  }
}

function requestTrainingToggle() {
  const on = !trainingIsOn();
  trainingMirror = on;
  syncTrainingUI();
  // training:set is the HUD's request event; the contract only names guide:step.
  emitInput('training:set', { on });
}

function setTouchMode(on) {
  const next = Boolean(on);
  if (touchMode === next) {
    toggleClass(hudRoot, 'sb-touch', next);
    return;
  }
  if (!next) resetTouchInputs?.();
  touchMode = next;
  toggleClass(hudRoot, 'sb-touch', touchMode);
  lastResumeHintHidden = null;
  try { renderPrompt(pendingPrompt); } catch (error) { warn('touch-prompt', error); }
  try { renderToastText(); } catch (error) { warn('touch-toasts', error); }
  try { updatePointerLockHint(); } catch (error) { warn('touch-mode', error); }
}

function renderable(value, fallback = '') {
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function touchButtonText(value) {
  const text = String(value ?? '');
  if (!touchMode) return text;
  return text.replace(/\b(E|Q|L)\b/g, key => TOUCH_BUTTON_LABELS[key]);
}

function money(value) {
  return Math.max(0, finite(value, 0)).toFixed(2);
}

function timestamp() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now() : Date.now();
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

function foamLabel(foam) {
  if (foam !== 'wet' && foam !== 'micro' && foam !== 'dry') return '';
  let label = '';
  try { label = ctxRef?.menu?.foamLabel?.(foam) ?? ''; } catch (error) { label = ''; }
  if (typeof label !== 'string' || !label) {
    label = foam === 'wet' ? 'wet foam' : foam === 'micro' ? 'microfoam' : 'dry foam';
  }
  return label;
}

function orderFoam(order) {
  const steps = Array.isArray(order?.steps) ? order.steps : [];
  const step = steps.find(s => s?.station === 'steamWand' && Object.prototype.hasOwnProperty.call(s || {}, 'foam'));
  return foamLabel(step?.foam);
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
  writeText(nodes.promptHint, touchButtonText(prompt?.hint ?? ''));
  const key = prompt?.key ?? 'E';
  const mappedKey = Object.prototype.hasOwnProperty.call(TOUCH_BUTTON_LABELS, key)
    ? touchButtonText(key)
    : key;
  writeText(nodes.promptKey, mappedKey);
  nodes.promptHint.hidden = !prompt?.hint;
}

function buildTicketRail() {
  const rail = el('section', 'sb-ticket-rail');
  rail.setAttribute('aria-label', 'Outstanding orders');
  const more = el('div', 'sb-more-orders');
  more.hidden = true;
  const panel = el('section', 'sb-guide-panel');
  panel.hidden = true;
  panel.setAttribute('aria-live', 'polite');
  panel.setAttribute('aria-label', 'Training next step');
  const heading = el('div', 'sb-guide-heading');
  const label = el('strong', 'sb-guide-label');
  const counter = el('span', 'sb-guide-counter');
  heading.append(label, counter);
  const hint = el('div', 'sb-guide-hint');
  panel.append(heading, hint);
  rail.append(more, panel);
  hudRoot.append(rail);
  Object.assign(nodes, { ticketRail: rail, moreOrders: more, guidePanel: panel,
    guideLabel: label, guideCounter: counter, guideHint: hint });
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
  const modSource = Array.isArray(order?.mods) ? order.mods : [];
  const hasNoFoam = modSource.some(mod => mod && typeof mod === 'object' && mod.id === 'noFoam')
    || mods.some(mod => mod.trim().toLowerCase() === 'no foam');
  const foam = hasNoFoam ? '' : orderFoam(order);
  const signature = JSON.stringify({ foam, mods });
  if (record.modSignature === signature) return;
  record.modSignature = signature;
  record.mods.replaceChildren();
  const chips = [
    ...(foam ? [{ label: foam, className: 'sb-mod-chip sb-foam-chip' }] : []),
    ...mods.map(mod => ({ label: mod, className: 'sb-mod-chip' })),
  ];
  const shown = chips.slice(0, 4);
  for (const chip of shown) record.mods.append(el('span', chip.className, chip.label));
  if (chips.length > shown.length) record.mods.append(el('span', 'sb-mod-chip sb-mod-more', `+${chips.length - shown.length}`));
  record.mods.hidden = chips.length === 0;
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

function ticketCardCap() {
  return smallTicketMedia?.matches ? 3 : 5;
}

function wireTicketViewport() {
  if (typeof matchMedia !== 'function') return;
  try {
    smallTicketMedia = matchMedia(SMALL_TICKET_QUERY);
    const refreshTickets = () => {
      try { applyTickets(currentOrders); }
      catch (error) { warn('ticket-viewport-change', error); }
    };
    if (typeof smallTicketMedia?.addEventListener === 'function') {
      smallTicketMedia.addEventListener('change', refreshTickets);
    } else if (typeof smallTicketMedia?.addListener === 'function') {
      smallTicketMedia.addListener(refreshTickets);
    }
  } catch (error) { warn('ticket-viewport', error); }
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
  }

  const cap = ticketCardCap();
  const visibleKeys = keys.slice(0, cap);
  const visibleKeySet = new Set(visibleKeys);
  for (let index = 0; index < visibleKeys.length; index += 1) {
    const key = visibleKeys[index];
    const order = nextOrders[index];
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
    if (!visibleKeySet.has(key)) removeTicketRecord(record);
  }

  currentOrders = nextOrders;
  const rail = nodes.ticketRail;
  for (let index = 0; index < visibleKeys.length; index += 1) {
    const record = ticketRecords.get(visibleKeys[index]);
    if (!record) continue;
    toggleClass(record.el, 'sb-is-front', index === 0);
    rail?.insertBefore?.(record.el, nodes.moreOrders ?? null);
  }
  const extra = Math.max(0, nextOrders.length - cap);
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
  const visible = currentOrders.slice(0, ticketCardCap());
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
  const zoneLabel = el('span', 'sb-meter-zone-label');
  zoneLabel.hidden = true;
  zone.append(zoneLabel);
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
    meterNeedle: needle, meterPips: pips, meterZoneLabel: zoneLabel });
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
    if (nodes.meterZoneLabel && nodes.meterTrack) {
      nodes.meterTrack.append(nodes.meterZoneLabel);
      writeText(nodes.meterZoneLabel, 'this many');
      writeStyle(nodes.meterZoneLabel, 'left', `${clamp(((target - 0.5) / pipCount) * 100, 0, 100).toFixed(2)}%`);
      nodes.meterZoneLabel.hidden = target <= 0;
    }
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
  if (nodes.meterZoneLabel && nodes.meterZone) {
    nodes.meterZone.append(nodes.meterZoneLabel);
    writeText(nodes.meterZoneLabel, kind === 'dose' ? 'stop here'
      : kind === 'steam' || kind === 'shot' ? 'release here' : 'aim here');
    writeStyle(nodes.meterZoneLabel, 'left', '50%');
    nodes.meterZoneLabel.hidden = !zone;
  }
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
  const clock = statCell('SHIFT', '07:00', 'sb-stat-clock');
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
  const trainingToggle = makeTrainingToggle('sb-training-toggle-play', 'TRAINING MODE');
  const rush = el('div', 'sb-rush-banner');
  rush.hidden = true;
  region.append(strip, trainingToggle, rush);
  hudRoot.append(region);
  Object.assign(nodes, { statStrip: strip, statClock: clock.value, statCash: cash.value,
    statTips: tips.value, statServed: served.value, hearts: heartNodes, rush,
    playTrainingToggle: trainingToggle });
  trainingToggle.addEventListener('click', requestTrainingToggle);
}

function makeTrainingToggle(extraClass, label) {
  const button = el('button', `sb-training-toggle${extraClass ? ` ${extraClass}` : ''}`);
  button.type = 'button';
  button.append(el('span', 'sb-training-toggle-label', label),
    el('span', 'sb-training-toggle-state', 'ON'));
  return button;
}

function buildStationMarker() {
  const marker = el('div', 'sb-station-marker');
  marker.hidden = true;
  marker.setAttribute('aria-hidden', 'true');
  marker.append(el('span', 'sb-station-marker-ring'), el('span', 'sb-station-marker-arrow'));
  hudRoot.append(marker);
  nodes.stationMarker = marker;
}

function hideStationMarker() {
  if (nodes.stationMarker && !nodes.stationMarker.hidden) nodes.stationMarker.hidden = true;
}

function anchorFromMap(anchors, stationId) {
  if (!anchors) return null;
  try {
    if (typeof anchors.get === 'function') return anchors.get(stationId) ?? null;
    if (typeof anchors === 'object') return anchors[stationId] ?? null;
  } catch (_) { /* Anchor lookup is optional. */ }
  return null;
}

function refreshStationAnchors(getter, equipment) {
  try {
    const anchors = getter.call(equipment);
    stationAnchorsCache = anchors && typeof anchors === 'object' ? anchors : null;
  } catch (_) {
    stationAnchorsCache = null;
  }
}

function copyStationAnchor(anchor) {
  if (!stationProjectionPoint || !anchor) return false;
  const x = Number(anchor.x);
  const y = Number(anchor.y);
  const z = Number(anchor.z);
  if (![x, y, z].every(Number.isFinite)) return false;
  stationProjectionPoint.set(x, y, z);
  return true;
}

function resolveStationPosition(stationId) {
  if (!stationProjectionPoint) return false;
  const equipment = ctxRef?.equipment;
  const getter = equipment?.getStationAnchors;
  if (typeof getter === 'function') {
    if (getter !== stationAnchorsGetter) {
      stationAnchorsGetter = getter;
      stationAnchorsCache = null;
      stationAnchorRefreshId = null;
    }
    if (!stationAnchorsCache) refreshStationAnchors(getter, equipment);
    let anchor = anchorFromMap(stationAnchorsCache, stationId);
    if (!anchor && stationAnchorRefreshId !== stationId) {
      // A cached map can predate equipment construction, so retry a missing station once.
      stationAnchorRefreshId = stationId;
      refreshStationAnchors(getter, equipment);
      anchor = anchorFromMap(stationAnchorsCache, stationId);
    }
    if (copyStationAnchor(anchor)) return true;
  }

  // CONTRACT.md names getStationAnchors(), but equipment is not currently on ctx;
  // interactables are the HUD's import-free fallback until the coordinator exposes it.
  const interactables = ctxRef?.interactables;
  if (!Array.isArray(interactables)) return false;
  for (const entry of interactables) {
    if (entry?.id !== stationId || typeof entry?.object?.getWorldPosition !== 'function') continue;
    try {
      entry.object.getWorldPosition(stationProjectionPoint);
      return [stationProjectionPoint.x, stationProjectionPoint.y, stationProjectionPoint.z]
        .every(Number.isFinite);
    } catch (_) {
      return false;
    }
  }
  return false;
}

function updateStationMarkerFrame() {
  const marker = nodes.stationMarker;
  const stationId = renderable(latestGuideStep?.station, '');
  const screenOpen = !nodes.titleScreen?.hidden || !nodes.endScreen?.hidden;
  if (!marker || !trainingIsOn() || !latestGuideStep || !stationId || screenOpen || !ctxRef?.camera) {
    hideStationMarker();
    return;
  }

  try {
    if (!resolveStationPosition(stationId)) {
      hideStationMarker();
      return;
    }
    stationProjectionPoint.project(ctxRef.camera);
    const ndcX = stationProjectionPoint.x;
    const ndcY = stationProjectionPoint.y;
    const ndcZ = stationProjectionPoint.z;
    const canvas = ctxRef?.renderer?.domElement;
    const fallbackWidth = typeof innerWidth === 'number' ? innerWidth : 0;
    const fallbackHeight = typeof innerHeight === 'number' ? innerHeight : 0;
    const width = finite(canvas?.clientWidth, 0) || finite(fallbackWidth, 0);
    const height = finite(canvas?.clientHeight, 0) || finite(fallbackHeight, 0);
    if (![ndcX, ndcY, ndcZ, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
      hideStationMarker();
      return;
    }

    const projectedX = (ndcX * 0.5 + 0.5) * width;
    const projectedY = (-ndcY * 0.5 + 0.5) * height;
    if (![projectedX, projectedY].every(Number.isFinite)) {
      hideStationMarker();
      return;
    }

    const behind = ndcZ > 1;
    const offScreen = projectedX < 0 || projectedX > width || projectedY < 0 || projectedY > height;
    let x = projectedX;
    let y = projectedY;
    let angle = 0;
    if (behind || offScreen) {
      const centreX = width * 0.5;
      const centreY = height * 0.5;
      let directionX = projectedX - centreX;
      let directionY = projectedY - centreY;
      if (behind) {
        // Perspective projection mirrors points behind the camera.
        directionX = -directionX;
        directionY = -directionY;
      }
      if (Math.abs(directionX) + Math.abs(directionY) < 0.0001) directionY = -1;
      const margin = Math.max(1, Math.min(24, width * 0.5 - 1, height * 0.5 - 1));
      const halfWidth = Math.max(1, width * 0.5 - margin);
      const halfHeight = Math.max(1, height * 0.5 - margin);
      const edgeScale = 1 / Math.max(Math.abs(directionX) / halfWidth, Math.abs(directionY) / halfHeight);
      x = clamp(centreX + directionX * edgeScale, margin, width - margin);
      y = clamp(centreY + directionY * edgeScale, margin, height - margin);
      angle = Math.atan2(directionY, directionX) * 180 / Math.PI;
    }

    toggleClass(marker, 'sb-is-edge', behind || offScreen);
    const transform = behind || offScreen
      ? `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) translate(-50%, -50%) rotate(${angle.toFixed(2)}deg)`
      : `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) translate(-50%, -50%)`;
    writeStyle(marker, 'transform', transform);
    if (marker.hidden) marker.hidden = false;
  } catch (_) {
    hideStationMarker();
  }
}

function renderGuideStep(payload) {
  if (!nodes.guidePanel) return;
  const step = payload && typeof payload === 'object' ? payload : null;
  const label = renderable(step?.label, '');
  const hint = renderable(step?.hint, '');
  const hasCounter = Number.isFinite(step?.index) && Number.isFinite(step?.total);
  let counter = '';
  if (hasCounter) {
    const total = Math.max(1, Math.floor(step.total));
    counter = `${clamp(Math.floor(step.index), 1, total)} of ${total}`;
  }
  writeText(nodes.guideLabel, label);
  writeText(nodes.guideHint, hint);
  writeText(nodes.guideCounter, counter);
  nodes.guideLabel.hidden = !label;
  nodes.guideHint.hidden = !hint;
  nodes.guideCounter.hidden = !counter;
  nodes.guidePanel.hidden = !(label || hint || counter);
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
  const minutes = clamp(7 * 60 + (tSec / length) * 8 * 60, 7 * 60, 15 * 60);
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
  let source;
  let sourceIsArray;
  try {
    source = cup?.contents ?? cup?.items ?? cup?.parts ?? cup?.steps ?? [];
    sourceIsArray = Array.isArray(source);
  }
  catch (error) { return []; }

  if (sourceIsArray) {
    try {
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
    catch (error) { return []; }
  }

  if (!source || typeof source !== 'object') return [];
  const result = [];
  const ingredients = [
    ['espresso', 'espresso'],
    ['coldBrew', 'cold brew'],
    ['milk', 'milk'],
    ['foam', 'foam'],
    ['syrup', 'syrup'],
    ['mocha', 'mocha'],
    ['matcha', 'matcha'],
    ['chai', 'chai'],
    ['tea', 'tea'],
    ['ice', 'ice'],
    ['water', 'water'],
  ];
  for (const [key, label] of ingredients) {
    let value;
    try { value = source[key]; }
    catch (error) { continue; }
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) continue;
    if (key === 'espresso') {
      const shots = Math.round(value);
      result.push(`${shots} ${shots === 1 ? 'shot' : 'shots'}`);
    } else if (key === 'syrup') {
      result.push(`${value} ${value === 1 ? 'pump' : 'pumps'}`);
    } else if (key === 'ice') result.push(`${value} ice`);
    else result.push(label);
  }
  return result;
}

function cupFoam(cup) {
  const steps = Array.isArray(cup?.steps) ? cup.steps : [];
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index];
    if (step?.station !== 'steamWand') continue;
    if (step.foam === 'wet' || step.foam === 'micro' || step.foam === 'dry') {
      return foamLabel(step.foam);
    }
  }
  return '';
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
  const foam = cupFoam(cup);
  const cupContentItems = cupContents(cup);
  const contents = [
    ...(foam ? [{ label: foam, className: 'sb-cup-content sb-foam-chip' }] : []),
    ...cupContentItems
      .filter(item => !foam || item !== 'foam')
      .map(item => ({ label: item, className: 'sb-cup-content' })),
  ];
  nodes.cupContents.replaceChildren();
  const shown = contents.slice(0, 6);
  for (const item of shown) nodes.cupContents.append(el('span', item.className, item.label));
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

function addToast(text, ok, secondary, tertiary) {
  const message = renderable(text, '');
  const secondaryText = renderable(secondary, '');
  const tertiaryText = renderable(tertiary, '');
  if (!message || !nodes.toastStack) return;
  const now = timestamp();
  const duplicate = [...toastRecords].reverse().find(record => !record.exiting
    && record.text === message
    && record.secondaryText === secondaryText
    && record.tertiaryText === tertiaryText
    && now - record.lastAt <= 400);
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
  const body = el('span', 'sb-toast-body');
  const copy = el('span', 'sb-toast-copy', touchButtonText(message));
  const secondaryNode = secondaryText ? el('span', 'sb-toast-note', touchButtonText(secondaryText)) : null;
  const tertiaryNode = tertiaryText ? el('span', 'sb-toast-note', touchButtonText(tertiaryText)) : null;
  const count = el('span', 'sb-toast-count');
  count.hidden = true;
  body.append(copy);
  if (secondaryNode) body.append(secondaryNode);
  if (tertiaryNode) body.append(tertiaryNode);
  toastEl.append(body, count);
  const record = { id: nextToastId++, el: toastEl, copyNode: copy, secondaryNode, tertiaryNode,
    countNode: count, text: message, secondaryText, tertiaryText,
    count: 1, lastAt: now, exiting: false, lifeTimer: 0, removeTimer: 0 };
  toastRecords.push(record);
  nodes.toastStack.append(toastEl);
  armToast(record);
}

function renderToastText() {
  for (const record of toastRecords) {
    writeText(record?.copyNode, touchButtonText(record?.text));
    writeText(record?.secondaryNode, touchButtonText(record?.secondaryText));
    writeText(record?.tertiaryNode, touchButtonText(record?.tertiaryText));
  }
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
  const premise = el('p', 'sb-premise', 'Luton, 07:00. Two gates are boarding. Make the coffee.');
  const controls = el('div', 'sb-controls sb-controls-desktop');
  const bindings = [
    ['MOUSE', 'look'], ['WASD', 'move'], ['E', 'act'], ['HOLD E', 'meters'],
    ['Q', 'dump'], ['L', 'lid'], ['SHIFT', 'hurry'], ['ESC', 'release mouse'],
  ];
  for (const [key, description] of bindings) {
    const item = el('div', 'sb-control');
    item.append(keycap(key), el('span', 'sb-control-label', description));
    controls.append(item);
  }
  const touchControls = el('div', 'sb-controls sb-controls-touch');
  const touchBindings = [
    ['STICK', 'move'], ['ACT', 'act'], ['HOLD ACT', 'meters'],
    ['DROP', 'dump'], ['LID', 'lid'], ['DRAG', 'look'],
  ];
  for (const [key, description] of touchBindings) {
    const item = el('div', 'sb-control');
    item.append(keycap(key), el('span', 'sb-control-label', description));
    touchControls.append(item);
  }
  const trainingToggle = makeTrainingToggle('sb-training-toggle-title', 'TRAINING MODE');
  const start = el('button', 'sb-primary-button', 'START SHIFT');
  start.type = 'button';
  const footer = el('p', 'sb-screen-footer', 'no assets · everything drawn and synthesised at runtime');
  const source = el('a', 'sb-source-link', 'source on github');
  source.href = 'https://github.com/NikolayS/simbucks';
  source.target = '_blank';
  source.rel = 'noopener noreferrer';
  footer.append(document.createElement('br'), source);
  titleCard.append(wordmark, rule, premise, controls, touchControls, trainingToggle, start, footer);
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
  const endFaults = el('section', 'sb-end-faults');
  endFaults.hidden = true;
  const endFaultHeading = el('h3', 'sb-end-fault-heading', 'WATCH FOR');
  const endFaultList = el('div', 'sb-end-fault-list');
  endFaults.append(endFaultHeading, endFaultList);
  const replay = el('button', 'sb-primary-button', 'PLAY AGAIN');
  replay.type = 'button';
  endCard.append(endEyebrow, rank, grid, endFaults, replay);
  endScreen.append(endCard);
  hudRoot.append(titleScreen, endScreen);
  Object.assign(nodes, { titleScreen, titleStart: start, endScreen, endRank: rank,
    endFields, endFaults, endFaultList, replay, titleTrainingToggle: trainingToggle });

  trainingToggle.addEventListener('click', requestTrainingToggle);
  start.addEventListener('click', () => activateTitle());
  replay.addEventListener('click', () => {
    try { globalThis.location?.reload?.(); } catch (error) { warn('reload', error); }
  });
}

function updatePointerLockHint() {
  if (!nodes.resumeHint) return;
  const screenOpen = !nodes.titleScreen?.hidden || !nodes.endScreen?.hidden;
  const hidden = touchMode
    || Boolean(document.pointerLockElement)
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
  resetTouchInputs?.();
  titleCallback = typeof onStart === 'function' ? onStart : null;
  nodes.endScreen.hidden = true;
  nodes.titleScreen.hidden = false;
  titleDismissed = false;
  syncTrainingUI();
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
  if (!touchMode) {
    try {
      const canvas = ctxRef?.renderer?.domElement ?? document.querySelector('#app canvas');
      const result = canvas?.requestPointerLock?.();
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch (error) { warn('pointer-lock', error); }
  }
  try { bus?.emit?.('hud:start'); } catch (error) { warn('hud-start', error); }
}

function renderEndCard(summary) {
  if (!nodes.endScreen) return;
  resetTouchInputs?.();
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
  const topFaults = Array.isArray(safeSummary?.topFaults) ? safeSummary.topFaults
    .map(item => {
      const label = renderable(item?.label, '');
      return { label, count: Number.isFinite(item?.count) ? item.count : 1 };
    })
    .filter(item => item.label)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3) : [];
  nodes.endFaultList?.replaceChildren?.();
  for (const fault of topFaults) {
    const row = el('div', 'sb-end-fault');
    row.append(el('span', 'sb-end-fault-label', fault.label),
      el('span', 'sb-end-fault-count', `×${fault.count}`));
    nodes.endFaultList?.append(row);
  }
  if (nodes.endFaults) nodes.endFaults.hidden = topFaults.length === 0;
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

function buildTouchControls() {
  const lookLayer = el('div', 'sb-touch-look');
  lookLayer.setAttribute('aria-hidden', 'true');

  const controls = el('div', 'sb-touch-controls');
  const stick = el('div', 'sb-touch-stick');
  stick.setAttribute('role', 'application');
  stick.setAttribute('aria-label', 'Move');
  const stickKnob = el('div', 'sb-touch-stick-knob');
  stickKnob.setAttribute('aria-hidden', 'true');
  stick.append(stickKnob);

  const actions = el('div', 'sb-touch-actions');
  const act = el('button', 'sb-touch-button sb-touch-act', 'ACT');
  const drop = el('button', 'sb-touch-button sb-touch-small sb-touch-drop', 'DROP');
  const lid = el('button', 'sb-touch-button sb-touch-small sb-touch-lid', 'LID');
  for (const button of [act, drop, lid]) button.type = 'button';
  act.setAttribute('aria-label', 'Act or hold for meters');
  drop.setAttribute('aria-label', 'Drop cup');
  lid.setAttribute('aria-label', 'Add lid');
  actions.append(drop, lid, act);
  controls.append(stick, actions);
  hudRoot.append(lookLayer, controls);
  Object.assign(nodes, { touchLook: lookLayer, touchControls: controls, touchStick: stick,
    touchStickKnob: stickKnob, touchAct: act, touchDrop: drop, touchLid: lid });

  let stickPointerId = null;
  let stickCentreX = 0;
  let stickCentreY = 0;
  let stickVectorRadius = 1;
  let stickKnobRadius = 1;
  let lastMoveX = 0;
  let lastMoveY = 0;
  let lookPointerId = null;
  let lookX = 0;
  let lookY = 0;
  let actPointerId = null;
  let actHoldTimer = 0;
  let actHolding = false;

  const preventNativeTouch = event => {
    if (!touchMode) return;
    event.preventDefault?.();
  };
  for (const node of [stick, act, drop, lid, lookLayer]) {
    node.addEventListener('touchstart', preventNativeTouch, { passive: false });
    node.addEventListener('touchmove', preventNativeTouch, { passive: false });
  }

  const releaseCapture = (node, pointerId) => {
    if (pointerId == null) return;
    try {
      if (node?.hasPointerCapture?.(pointerId)) node.releasePointerCapture(pointerId);
    } catch (_) { /* capture may already have been released by the browser */ }
  };

  const emitMove = (x, y, force = false) => {
    const nextX = clamp(x, -1, 1);
    const nextY = clamp(y, -1, 1);
    if (!force && Math.abs(nextX - lastMoveX) < 0.02 && Math.abs(nextY - lastMoveY) < 0.02) return;
    lastMoveX = nextX;
    lastMoveY = nextY;
    emitInput('input:move', { x: nextX, y: nextY });
  };

  const moveStick = event => {
    if (event?.pointerId !== stickPointerId) return;
    const dx = finite(event?.clientX, stickCentreX) - stickCentreX;
    const dy = finite(event?.clientY, stickCentreY) - stickCentreY;
    const distance = Math.hypot(dx, dy);
    const scale = distance > stickKnobRadius ? stickKnobRadius / distance : 1;
    const offsetX = dx * scale;
    const offsetY = dy * scale;
    writeStyle(stickKnob, 'transform', `translate3d(${offsetX.toFixed(2)}px, ${offsetY.toFixed(2)}px, 0)`);
    if (distance < Math.max(stickVectorRadius * 0.15, 8)) emitMove(0, 0);
    else {
      const vectorScale = distance > stickVectorRadius ? stickVectorRadius / distance : 1;
      emitMove(dx * vectorScale / stickVectorRadius, -dy * vectorScale / stickVectorRadius);
    }
  };

  const releaseStick = () => {
    if (stickPointerId == null) return;
    const pointerId = stickPointerId;
    stickPointerId = null;
    toggleClass(stick, 'sb-is-pressed', false);
    writeStyle(stickKnob, 'transform', 'translate3d(0px, 0px, 0)');
    emitMove(0, 0, true);
    releaseCapture(stick, pointerId);
  };

  stick.addEventListener('pointerdown', event => {
    if (!touchMode || event?.pointerType === 'mouse' || stickPointerId != null) return;
    event.preventDefault?.();
    const rect = stick.getBoundingClientRect();
    const knobRect = stickKnob.getBoundingClientRect();
    stickCentreX = rect.left + rect.width / 2;
    stickCentreY = rect.top + rect.height / 2;
    stickVectorRadius = Math.max(1, Math.min(rect.width, rect.height) / 2);
    stickKnobRadius = Math.max(0, (Math.min(rect.width, rect.height) - Math.min(knobRect.width, knobRect.height)) / 2);
    stickPointerId = event.pointerId;
    toggleClass(stick, 'sb-is-pressed', true);
    try { stick.setPointerCapture?.(stickPointerId); } catch (_) { /* capture is best-effort */ }
    moveStick(event);
  });
  stick.addEventListener('pointermove', moveStick);
  stick.addEventListener('pointerup', event => {
    if (event?.pointerId === stickPointerId) releaseStick();
  });
  stick.addEventListener('pointercancel', event => {
    if (event?.pointerId === stickPointerId) releaseStick();
  });
  stick.addEventListener('lostpointercapture', event => {
    if (event?.pointerId === stickPointerId) releaseStick();
  });

  const finishAct = completed => {
    if (actPointerId == null) return;
    const pointerId = actPointerId;
    const wasHolding = actHolding;
    actPointerId = null;
    actHolding = false;
    if (actHoldTimer) clearTimeout(actHoldTimer);
    actHoldTimer = 0;
    toggleClass(act, 'sb-is-pressed', false);
    if (wasHolding) emitInput('input:action', { action: 'interact', phase: 'holdEnd' });
    else if (completed) emitInput('input:action', { action: 'interact', phase: 'tap' });
    releaseCapture(act, pointerId);
  };

  act.addEventListener('pointerdown', event => {
    if (!touchMode || event?.pointerType === 'mouse' || actPointerId != null) return;
    event.preventDefault?.();
    actPointerId = event.pointerId;
    actHolding = false;
    toggleClass(act, 'sb-is-pressed', true);
    try { act.setPointerCapture?.(actPointerId); } catch (_) { /* capture is best-effort */ }
    actHoldTimer = setTimeout(() => {
      try {
        if (actPointerId == null || actHolding) return;
        actHolding = true;
        emitInput('input:action', { action: 'interact', phase: 'holdStart' });
      } catch (error) { warn('touch-act-hold', error); }
    }, 180);
  });
  act.addEventListener('pointerup', event => {
    if (event?.pointerId === actPointerId) finishAct(true);
  });
  act.addEventListener('pointercancel', event => {
    if (event?.pointerId === actPointerId) finishAct(false);
  });
  act.addEventListener('lostpointercapture', event => {
    if (event?.pointerId === actPointerId) finishAct(false);
  });

  const tapCancellers = [];
  const wireTapAction = (button, action) => {
    let pointerId = null;
    const finish = completed => {
      if (pointerId == null) return;
      const releasedId = pointerId;
      pointerId = null;
      toggleClass(button, 'sb-is-pressed', false);
      if (completed) emitInput('input:action', { action, phase: 'tap' });
      releaseCapture(button, releasedId);
    };
    button.addEventListener('pointerdown', event => {
      if (!touchMode || event?.pointerType === 'mouse' || pointerId != null) return;
      event.preventDefault?.();
      pointerId = event.pointerId;
      toggleClass(button, 'sb-is-pressed', true);
      try { button.setPointerCapture?.(pointerId); } catch (_) { /* capture is best-effort */ }
    });
    button.addEventListener('pointerup', event => {
      if (event?.pointerId === pointerId) finish(true);
    });
    button.addEventListener('pointercancel', event => {
      if (event?.pointerId === pointerId) finish(false);
    });
    button.addEventListener('lostpointercapture', event => {
      if (event?.pointerId === pointerId) finish(false);
    });
    tapCancellers.push(() => finish(false));
  };
  wireTapAction(drop, 'drop');
  wireTapAction(lid, 'lid');

  const releaseLook = () => {
    if (lookPointerId == null) return;
    const pointerId = lookPointerId;
    lookPointerId = null;
    releaseCapture(lookLayer, pointerId);
  };
  lookLayer.addEventListener('pointerdown', event => {
    if (!touchMode || event?.pointerType === 'mouse' || lookPointerId != null) return;
    event.preventDefault?.();
    lookPointerId = event.pointerId;
    lookX = finite(event?.clientX, 0);
    lookY = finite(event?.clientY, 0);
    try { lookLayer.setPointerCapture?.(lookPointerId); } catch (_) { /* capture is best-effort */ }
  });
  lookLayer.addEventListener('pointermove', event => {
    if (event?.pointerId !== lookPointerId) return;
    const x = finite(event?.clientX, lookX);
    const y = finite(event?.clientY, lookY);
    const dx = x - lookX;
    const dy = y - lookY;
    lookX = x;
    lookY = y;
    emitInput('input:look', { dx, dy });
  });
  lookLayer.addEventListener('pointerup', event => {
    if (event?.pointerId === lookPointerId) releaseLook();
  });
  lookLayer.addEventListener('pointercancel', event => {
    if (event?.pointerId === lookPointerId) releaseLook();
  });
  lookLayer.addEventListener('lostpointercapture', event => {
    if (event?.pointerId === lookPointerId) releaseLook();
  });

  resetTouchInputs = () => {
    releaseStick();
    finishAct(false);
    for (const cancel of tapCancellers) cancel();
    releaseLook();
  };

  const markTouch = () => {
    lastTouchAt = Date.now();
    setTouchMode(true);
  };
  const detectPointer = event => {
    if (event?.pointerType === 'touch') {
      markTouch();
      return;
    }
    if (event?.pointerType === 'mouse' && Date.now() - lastTouchAt >= 700) setTouchMode(false);
  };
  const rememberTouchEnd = event => {
    if (event?.pointerType === 'touch') lastTouchAt = Date.now();
  };
  const rememberFallbackTouchEnd = () => { lastTouchAt = Date.now(); };
  window.addEventListener('pointerdown', detectPointer, { passive: true, capture: true });
  window.addEventListener('pointermove', detectPointer, { passive: true, capture: true });
  window.addEventListener('pointerup', rememberTouchEnd, { passive: true, capture: true });
  window.addEventListener('pointercancel', rememberTouchEnd, { passive: true, capture: true });
  document.addEventListener('touchstart', markTouch, { passive: true, capture: true });
  document.addEventListener('touchend', rememberFallbackTouchEnd, { passive: true, capture: true });
  document.addEventListener('touchcancel', rememberFallbackTouchEnd, { passive: true, capture: true });
  window.addEventListener('keydown', () => setTouchMode(false), { passive: true, capture: true });
  window.addEventListener('blur', () => resetTouchInputs?.(), { passive: true, capture: true });

  const initiallyTouch = (typeof navigator !== 'undefined' && finite(navigator.maxTouchPoints, 0) > 0)
    || (typeof window !== 'undefined' && 'ontouchstart' in window);
  setTouchMode(initiallyTouch);
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
    if (event?.code === 'KeyT' && !event?.repeat) {
      if (!nodes.titleScreen?.hidden || !nodes.endScreen?.hidden) return;
      event.preventDefault?.();
      requestTrainingToggle();
      return;
    }
    if (event?.target === nodes.titleTrainingToggle) return;
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
  subscribe('training:changed', payload => {
    const ownedValue = payload?.training;
    if (typeof ownedValue !== 'boolean') return;
    trainingMirror = ownedValue;
    lastObservedTraining = ownedValue;
    syncTrainingUI();
  });
  subscribe('guide:step', payload => {
    latestGuideStep = payload && typeof payload === 'object' ? payload : null;
    stationAnchorRefreshId = null;
    renderGuideStep(latestGuideStep);
  });
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
    const score = finite(payload?.score, NaN);
    let amount = finite(payload?.paid, NaN);
    if (!Number.isFinite(amount)) {
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
    const notes = Array.isArray(payload?.notes) ? payload.notes : [];
    const note = typeof notes[0] === 'string' ? notes[0].trim() : '';
    const fix = typeof payload?.tip_text === 'string' ? payload.tip_text.trim() : '';
    const hasCorrect = payload?.correct === true || payload?.correct === false;
    const hasScore = Number.isFinite(score);
    const notPerfect = payload?.correct === false || (hasScore && score < 1)
      || (!hasCorrect && !hasScore && Boolean(note || fix));
    const fault = notPerfect ? note : '';
    addToast(text, true, fault, notPerfect ? fix : '');
    if (fault) recentServedFault = { text: fault, at: timestamp() };
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
    if (!text) return;
    if (recentServedFault) {
      const elapsed = timestamp() - recentServedFault.at;
      if (elapsed >= 0 && elapsed <= 1200 && text === recentServedFault.text) {
        recentServedFault = null;
        return;
      }
      if (elapsed > 1200) recentServedFault = null;
    }
    addToast(text, payload?.ok);
  });
  subscribe('cup:changed', payload => { renderCup(payload?.cup); });
  subscribe('shift:start', () => {
    applyTickets([]);
    clearToasts();
    recentServedFault = null;
    lastLost = 0;
    if (!statsExplicit) lastStatsState = {};
    updateStatsFrame();
  });
  subscribe('shift:end', payload => { showEndCard(payload?.summary ?? payload); });
  subscribe('rush', payload => { showRush(payload); });
}

function frame() {
  if (!initialised) return;
  try { observeTrainingState(); } catch (error) { warn('training-observe-frame', error); }
  try { syncTrainingUI(); } catch (error) { warn('training-frame', error); }
  try { updateTicketsFrame(); } catch (error) { warn('ticket-frame', error); }
  try { updateStatsFrame(); } catch (error) { warn('stats-frame', error); }
  try { updatePointerLockHint(); } catch (error) { warn('pointer-lock-frame', error); }
  try { updateStationMarkerFrame(); } catch (error) { warn('station-marker-frame', error); }
  try { requestAnimationFrame(frame); } catch (error) { warn('raf', error); }
}

function applyPending() {
  renderGuideStep(latestGuideStep);
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
    trainingMirror = true;
    lastObservedTraining = undefined;
    observeTrainingState();
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
    try {
      if (typeof ctxRef?.THREE?.Vector3 === 'function') stationProjectionPoint = new ctxRef.THREE.Vector3();
    } catch (_) { stationProjectionPoint = null; }
    buildStationMarker();
    buildPrompt();
    buildTicketRail();
    wireTicketViewport();
    buildMeter();
    buildStats();
    buildCupChip();
    buildToasts();
    buildScreens();
    buildDebug(ctxRef?.layout);
    buildTouchControls();
    syncTrainingUI();
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
