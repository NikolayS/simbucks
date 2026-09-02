import {
  DRINKS, SIZES, pickDrink, pickFood, recipeFor, sizeLabel, sizeDelta, getDrink, foamLabel,
} from './menu.js';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function round2(value) {
  const number = Number.isFinite(value) ? value : 0;
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

let nowSec = 0;

export function setShiftTime(t) {
  if (Number.isFinite(t)) nowSec = t;
}

let fallbackSeed = 0x0A17B4A5;

function fallbackRng() {
  fallbackSeed = (1664525 * fallbackSeed + 1013904223) >>> 0;
  return fallbackSeed / 4294967296;
}

function randomUnit(rng) {
  if (typeof rng === 'function') {
    try {
      const value = rng();
      if (Number.isFinite(value)) return clamp(value, 0, 1 - Number.EPSILON);
    } catch (_) {
      // Keep order generation alive with the deterministic stream.
    }
  }
  return fallbackRng();
}

export const NAMES = deepFreeze([
  { name: 'Siobhan', misheard: 'SHIVON' },
  { name: 'Niamh', misheard: 'NEEV' },
  { name: 'Aoife', misheard: 'EEFA' },
  { name: 'Saoirse', misheard: 'SEERSHA' },
  { name: 'Eilidh', misheard: 'AYLEE' },
  { name: 'Caoimhe', misheard: 'KEEVA' },
  { name: 'Ffion', misheard: 'FEE-ON' },
  { name: 'Grzegorz', misheard: 'GREG' },
  { name: 'Agnieszka', misheard: 'AGNES' },
  { name: 'Oleksandr', misheard: 'ALEX' },
  { name: 'Katarzyna', misheard: 'KASIA' },
  { name: 'Ruaridh', misheard: 'ROORY' },
  { name: 'Xanthe', misheard: 'ZANTHY' },
  { name: 'Bartholomew', misheard: 'BARTH' },
  { name: 'Mhairi', misheard: 'VAA-REE' },
  { name: 'Deborah' }, { name: 'Graham' }, { name: 'Fiona' }, { name: 'Tariq' },
  { name: 'Priya' }, { name: 'Amara' }, { name: 'Kwame' }, { name: 'Ines' },
  { name: 'Hattie' }, { name: 'Yusuf' }, { name: 'Zainab' }, { name: 'Hamish' },
  { name: 'Imogen' }, { name: 'Nikhil' }, { name: 'Marta' }, { name: 'Duncan' },
  { name: 'Seren' }, { name: 'Maeve' }, { name: 'Rowan' }, { name: 'Bethan' },
  { name: 'Gus' }, { name: 'Clementine' }, { name: 'Wilf' }, { name: 'Nia' },
  { name: 'Beatrix' }, { name: 'Lorna' }, { name: 'Morag' }, { name: 'Tamsin' },
  { name: 'Csaba' }, { name: 'Inigo' }, { name: 'Bjorn' }, { name: 'Padraig' },
  { name: 'Eoghan' }, { name: 'Osian' }, { name: 'Sinead' }, { name: 'Dougal' },
  { name: 'Nigel' }, { name: 'Ottoline' }, { name: 'Bertie' },
]);

export const MODS = deepFreeze([
  { id: 'extraShot', label: 'extra shot', price: 0.80 },
  { id: 'decaf', label: 'decaf', price: 0.00 },
  { id: 'oat', label: 'oat', price: 0.45 },
  { id: 'noFoam', label: 'no foam', price: 0.00 },
  { id: 'extraHot', label: 'extra hot', price: 0.00 },
  { id: 'syrup', label: 'syrup', price: 0.40 },
]);

export const FAULT_LABELS = Object.freeze({
  wrongDrink: 'Wrong drink',
  wrongSize: 'Wrong size',
  wrongMilk: 'Wrong milk',
  wrongFoam: 'Wrong foam',
  syrup: 'Syrup count',
  missingStep: 'Missed step',
  extraStep: 'Extra step',
  milkTemp: 'Milk temperature',
  shotTime: 'Shot timing',
  sloppy: 'Rushed step',
  noTicket: 'No ticket',
  empty: 'Empty cup',
});

const FLAVOURS = ['vanilla', 'caramel', 'hazelnut', 'gingerbread'];

function hasStep(steps, station, param) {
  return Array.isArray(steps) && steps.some(step => step?.station === station && step.param === param);
}

function grindPullIndex(steps) {
  if (!Array.isArray(steps)) return -1;
  return steps.findIndex((step, i) => step?.station === 'grinder' && step.param === 'grind'
    && steps[i + 1]?.station === 'espresso' && steps[i + 1]?.param === 'pull');
}

function available(def, drink, steps) {
  switch (def.id) {
    case 'extraShot':
      return hasStep(steps, 'espresso', 'pull') || hasStep(steps, 'superauto', 'shot');
    case 'decaf':
      return grindPullIndex(steps) >= 0;
    case 'oat':
      return drink?.milk === true;
    case 'noFoam':
    case 'extraHot':
      return hasStep(steps, 'steamWand', 'steam');
    case 'syrup':
      return true;
    default:
      return false;
  }
}

function modWeight(id, difficulty) {
  const d = clamp(difficulty, 0, 1);
  const weights = {
    extraShot: 1.0 + d * 0.9,
    decaf: 0.8 + d * 0.4,
    oat: 1.25 + d * 0.35,
    noFoam: 0.7 + d * 0.55,
    extraHot: 0.65 + d * 0.65,
    syrup: 0.9 + d * 0.8,
  };
  return weights[id] ?? 0;
}

function weightedPick(items, weightFor, rng) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const weights = items.map(item => Math.max(0, weightFor(item)));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (!(total > 0)) return items[0];
  let cursor = randomUnit(rng) * total;
  for (let i = 0; i < items.length; i++) {
    cursor -= weights[i];
    if (cursor < 0) return items[i];
  }
  return items[items.length - 1];
}

function modCount(difficulty, rng) {
  const d = clamp(difficulty, 0, 1);
  const probabilities = [
    0.74 - 0.56 * d,
    0.22 + 0.10 * d,
    0.035 + 0.305 * d,
    0.005 + 0.155 * d,
  ];
  let cursor = randomUnit(rng);
  for (let i = 0; i < probabilities.length; i++) {
    cursor -= probabilities[i];
    if (cursor < 0) return i;
  }
  return 3;
}

function applyMod(def, steps, rng) {
  const applied = { id: def.id, label: def.label, price: def.price };
  if (!Array.isArray(steps)) return applied;

  if (def.id === 'extraShot') {
    let index = -1;
    for (let i = 0; i < steps.length; i++) {
      if (steps[i]?.station === 'espresso' && steps[i]?.param === 'pull') index = i;
    }
    if (index >= 0) {
      steps.splice(index + 1, 0,
        { station: 'grinder', param: 'grind' },
        { station: 'espresso', param: 'pull' });
    } else {
      for (let i = 0; i < steps.length; i++) {
        if (steps[i]?.station === 'superauto' && steps[i]?.param === 'shot') index = i;
      }
      if (index >= 0) steps.splice(index + 1, 0, { station: 'superauto', param: 'shot' });
    }
  } else if (def.id === 'decaf') {
    const index = grindPullIndex(steps);
    if (index >= 0) {
      steps.splice(index, 2, { station: 'superauto', param: 'shot', note: 'decaf' });
    }
  } else if (def.id === 'oat') {
    for (const step of steps) if (step?.station === 'steamWand') step.milk = 'oat';
  } else if (def.id === 'noFoam') {
    const step = steps.find(item => item?.station === 'steamWand' && item.param === 'steam');
    if (step) step.foam = 'wet';
  } else if (def.id === 'extraHot') {
    const step = steps.find(item => item?.station === 'steamWand' && item.param === 'steam');
    if (step) step.temp = 'extraHot';
  } else if (def.id === 'syrup') {
    const syrup = steps.find(step => step?.station === 'syrupRack' && Number.isFinite(step.param));
    if (syrup) {
      syrup.param = clamp(syrup.param + (randomUnit(rng) < 0.5 ? -1 : 1), 1, 6);
      const flavour = typeof syrup.note === 'string' ? syrup.note.split(' ')[0] : '';
      Object.assign(applied, {
        label: `${syrup.param} pumps${flavour ? ` ${flavour}` : ''}`,
        price: 0,
        pumps: syrup.param,
        flavour,
        baseSyrup: true,
      });
    } else {
      const pumps = 1 + Math.floor(randomUnit(rng) * 4);
      const flavour = FLAVOURS[Math.floor(randomUnit(rng) * FLAVOURS.length)];
      const cupIndex = steps.findIndex(step => step?.station === 'cupStack' && step.param === 'cup');
      steps.splice(Math.max(0, cupIndex + 1), 0,
        { station: 'syrupRack', param: pumps, note: flavour });
      Object.assign(applied, {
        label: `${pumps} ${pumps === 1 ? 'pump' : 'pumps'} ${flavour}`,
        pumps,
        flavour,
        baseSyrup: false,
      });
    }
  }
  return applied;
}

function pickSize(drink, difficulty, rng) {
  const legal = Array.isArray(drink?.size) ? drink.size : [];
  if (legal.length === 0) return 'tall';
  const d = clamp(difficulty, 0, 1);
  const bySize = {
    short: 0.65 - 0.45 * d,
    tall: 5.0 - 3.6 * d,
    grande: 1.7 + 1.5 * d,
    venti: 0.55 + 4.45 * d,
  };
  return weightedPick(legal, id => bySize[id] ?? 1, rng) ?? legal[0];
}

let seq = 0;

export function makeOrder(ctx, difficulty) {
  const sourceRng = typeof ctx?.rng === 'function' ? ctx.rng : fallbackRng;
  const rng = () => randomUnit(sourceRng);
  const rawDifficulty = difficulty ?? ctx?.state?.difficulty ?? 0;
  const d = clamp(rawDifficulty, 0, 1);
  const ramp = ctx?.state?.ramp ?? {};
  const maxTier = Number.isFinite(ramp.maxTier) ? ramp.maxTier : 3;
  const maxMods = Number.isFinite(ramp.maxMods) ? ramp.maxMods : 3;
  const drink = pickDrink(rng, d, maxTier);
  const size = pickSize(drink, d, rng);
  const entry = NAMES[Math.floor(rng() * NAMES.length)] ?? NAMES[0];
  const trueName = entry?.name ?? 'Passenger';
  const name = String(entry?.misheard ?? trueName).toUpperCase();
  const steps = recipeFor(drink, size);
  const selected = [];
  const target = Math.min(modCount(d, rng), maxMods);

  while (selected.length < target) {
    const chosenIds = new Set(selected.map(mod => mod.id));
    const candidates = MODS.filter(def => !chosenIds.has(def.id)
      && available(def, drink, steps)
      && !(def.id === 'decaf' && chosenIds.has('extraShot'))
      && !(def.id === 'extraShot' && chosenIds.has('decaf')));
    if (candidates.length === 0) break;
    const def = weightedPick(candidates, item => modWeight(item.id, d), rng);
    if (!def) break;
    selected.push(applyMod(def, steps, rng));
  }

  const food = rng() < 0.18 ? pickFood(rng) : null;
  const modPrice = selected.reduce((sum, mod) => sum + (Number.isFinite(mod?.price) ? mod.price : 0), 0);
  const price = round2((drink?.price ?? 0) + sizeDelta(size) + modPrice + (food?.price ?? 0));
  const basePatience = 88 - 30 * d;
  const buildGrace = 3.0 * Math.max(0, steps.length - 4);
  const patience = Math.round(clamp(basePatience + buildGrace + rng() * 8 - 4, 46, 108) * 10) / 10;
  const t0 = Number.isFinite(ctx?.state?.tSec) ? ctx.state.tSec : 0;
  const order = {
    id: `o${++seq}`,
    drink,
    size,
    name,
    trueName,
    mods: selected,
    steps,
    progress: [],
    price,
    patience,
    t0,
    text: '',
    food,
    difficulty: d,
    act: ramp.act,
  };
  order.text = orderText(order);
  order.short = `${sizeLabel(size)} ${drink?.name ?? ''} — ${name}`.trim();
  return order;
}

function cleanText(value) {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function orderText(order) {
  try {
    if (!order || typeof order !== 'object') return '';
    const drink = typeof order.drink === 'string' ? getDrink(order.drink) : order.drink;
    const drinkName = cleanText(drink?.name);
    const size = sizeLabel(order.size);
    const name = cleanText(order.name).toUpperCase();
    if (!drinkName || !size || !name) return '';

    const mods = Array.isArray(order.mods) ? order.mods : [];
    const leadingOrder = ['decaf', 'oat', 'extraHot'];
    const trailingOrder = ['extraShot', 'noFoam'];
    const leading = leadingOrder.map(id => mods.find(mod => mod?.id === id)?.label)
      .filter(Boolean).map(cleanText);
    const trailing = trailingOrder.map(id => mods.find(mod => mod?.id === id)?.label)
      .filter(Boolean).map(cleanText);
    const syrup = mods.find(mod => mod?.id === 'syrup');
    if (syrup) {
      const pumps = Number.isFinite(syrup.pumps) ? syrup.pumps : null;
      if (pumps !== null) {
        const count = `${pumps} ${pumps === 1 ? 'pump' : 'pumps'}`;
        trailing.push(syrup.baseSyrup ? count : `${count} ${cleanText(syrup.flavour)}`.trim());
      } else if (syrup.label) {
        trailing.push(cleanText(syrup.label));
      }
    }
    // Foam is build-critical, so it outlasts optional modifier clauses when trimming.
    let foamClause = '';
    if (!mods.some(mod => mod?.id === 'noFoam')) {
      const foamStep = Array.isArray(order.steps)
        ? order.steps.find(step => step?.station === 'steamWand' && step.param === 'steam')
        : null;
      const foam = foamLabel(foamStep?.foam);
      if (foam) foamClause = foam;
    }

    const prefix = `${size}${leading.length ? ` ${leading.join(' ')}` : ''}`;
    const suffix = ` — for ${name}`;
    const shownTrailing = trailing.slice();
    let foodClause = order.food?.name ? ` + ${cleanText(order.food.name)}` : '';
    const render = currentDrink => cleanText(`${prefix} ${currentDrink}`
      + `${shownTrailing.length || foamClause
        ? `, ${[...shownTrailing, foamClause].filter(Boolean).join(', ')}` : ''}`
      + `${foodClause}${suffix}`);

    let text = render(drinkName);
    if (text.length > 90) {
      foodClause = '';
      text = render(drinkName);
    }
    while (text.length > 90 && shownTrailing.length) {
      shownTrailing.pop();
      text = render(drinkName);
    }
    if (text.length > 90 && foamClause) {
      foamClause = '';
      text = render(drinkName);
    }
    if (text.length > 90) {
      const fixedLength = render('').length;
      const available = Math.max(0, 90 - fixedLength - 1);
      const shortenedDrink = available <= 0 ? ''
        : available === 1 ? '…'
          : `${drinkName.slice(0, available - 1).trimEnd()}…`;
      text = render(shortenedDrink);
    }
    return text;
  } catch (_) {
    return '';
  }
}

const STEP_NOTE = {
  'cupStack:cup': 'No cup',
  'cupStack:lid': 'No lid',
  'grinder:grind': 'Forgot to grind the coffee',
  'espresso:pull': 'No espresso shot',
  'steamWand:steam': 'Forgot to steam the milk',
  'steamWand:pour': 'Forgot to pour the milk',
  'superauto:shot': 'No espresso shot',
  'superauto:chai': 'Forgot the chai',
  'superauto:decaf': 'Forgot the decaf shot',
  'blender:blend': 'Forgot to blend it',
  'iceWell:ice': 'Forgot the ice',
  'sink:water': 'Forgot the water',
  'sink:whisk': 'Forgot to whisk it',
  'coldBrewTap:tap': 'Forgot the cold brew',
};

const STEP_TIP = {
  'cupStack:cup': 'Hold E at the cup stack for about 1 second to take a cup before anything else.',
  'cupStack:lid': 'Press L to lid the cup — 1 tap, before you tap the handoff.',
  'grinder:grind': 'Lock the portafilter, then hold E at the grinder until the dose meter is green, about 1 second.',
  'espresso:pull': 'Hold E at the espresso machine and stop the shot between 22 and 30 seconds.',
  'steamWand:steam': 'Take the pitcher, then hold E at the wand until the milk reads 60 to 68 °C.',
  'steamWand:pour': 'Tap the wand 1 more time after steaming to pour the milk into the cup.',
  'superauto:shot': 'Tap the superauto once — it drops 1 shot straight into the cup.',
  'superauto:chai': 'Tap the superauto for the chai — 1 tap before you steam.',
  'superauto:decaf': 'Tap the superauto for the decaf shot — 1 tap.',
  'blender:blend': 'Hold E at the blender for about 3 seconds, until the meter fills.',
  'iceWell:ice': 'Tap the ice well before you pour — up to 3 scoops.',
  'sink:water': 'Tap the sink to add hot water — 1 tap.',
  'sink:whisk': 'Hold E at the sink about 1 second to whisk the matcha smooth.',
  'coldBrewTap:tap': 'Hold the cold brew tap about 2 seconds, stopping before it overflows.',
};

const MISSING_STEP_NOTES = new Set([...Object.values(STEP_NOTE), 'Missed step']);

const WRONG_DRINK_ACTION = {
  'cupStack:cup': 'take a cup',
  'cupStack:lid': 'lid the cup',
  'grinder:grind': 'grind the coffee',
  'espresso:pull': 'pull the espresso',
  'steamWand:steam': 'steam the milk',
  'steamWand:pour': 'pour it',
  'superauto:shot': 'add the superauto shot',
  'superauto:chai': 'add the chai',
  'superauto:decaf': 'add the decaf shot',
  'blender:blend': 'blend it',
  'iceWell:ice': 'add the ice',
  'sink:water': 'add the water',
  'sink:whisk': 'whisk the matcha',
  'coldBrewTap:tap': 'pour the cold brew',
};

const WRONG_DRINK_EXTRA = {
  'cupStack:cup': 'the cup',
  'cupStack:lid': 'the lid',
  'grinder:grind': 'the grind',
  'espresso:pull': 'the espresso shot',
  'steamWand:steam': 'the steamed milk',
  'steamWand:pour': 'the milk pour',
  'superauto:shot': 'the superauto shot',
  'superauto:chai': 'the chai',
  'superauto:decaf': 'the decaf shot',
  'blender:blend': 'the blend',
  'iceWell:ice': 'the ice',
  'sink:water': 'the water',
  'sink:whisk': 'the whisk',
  'coldBrewTap:tap': 'the cold brew',
};

// Steps that define what the drink IS. Getting these wrong is a different drink,
// not a sloppy version of the right one.
const DEFINING = new Set(['iceWell:ice', 'blender:blend', 'coldBrewTap:tap', 'superauto:shot']);

const DEFINING_EXTRA_NOTE = {
  'iceWell:ice': 'Iced — the ticket is a hot drink',
  'blender:blend': 'Blended — the ticket does not say blended',
  'coldBrewTap:tap': 'Cold brew in the cup — the ticket wants espresso',
};

const DEFINING_EXTRA_TIP = {
  'iceWell:ice': 'Skip the ice well on this ticket — 0 scoops.',
  'blender:blend': 'Do not use the blender here — this ticket takes 0 blends.',
  'coldBrewTap:tap': 'Pull espresso instead: grind, then stop the shot between 22 and 30 seconds.',
};

const DEFINING_EXTRA_NOTES = new Set(Object.values(DEFINING_EXTRA_NOTE));

const EXTRA_NOUN = {
  'espresso:pull': 'espresso shots',
  'superauto:shot': 'superauto shots',
  'iceWell:ice': 'scoops of ice',
  'sink:water': 'pours of water',
  'steamWand:steam': 'steamed pitchers',
  'steamWand:pour': 'milk pours',
  'blender:blend': 'blends',
  'coldBrewTap:tap': 'cold brew pours',
  'cupStack:cup': 'cups',
  'cupStack:lid': 'lids',
  'grinder:grind': 'grinds',
  'sink:whisk': 'whisks',
};

const SLOPPY_NOTE = {
  grind: 'Dose off — the grinder meter missed the green',
  blend: 'Under-blended — the meter never filled',
  whisk: 'Lumpy matcha — the whisk stopped early',
  tap: 'Cold brew overflowed the cup',
};

const SLOPPY_TIP = {
  grind: 'Hold at the grinder about 1 second, releasing inside the green band.',
  blend: 'Hold the blender the full 3 seconds until the meter fills.',
  whisk: 'Hold at the sink about 1 second longer, until the whisk meter fills.',
  tap: 'Release the cold brew tap as the cup fills — stop before it spills over 1 cup.',
};

const SLOPPY_NOTES = new Set(Object.values(SLOPPY_NOTE));

export function faultsFromNotes(notes) {
  if (!Array.isArray(notes)) return [];
  const matchers = [
    ['missingStep', text => MISSING_STEP_NOTES.has(text)],
    ['extraStep', text => DEFINING_EXTRA_NOTES.has(text) || /the ticket takes \d/.test(text)],
    ['wrongDrink', text => /^Wrong drink/.test(text)],
    ['wrongSize', text => /^Wrong size/.test(text)],
    ['wrongMilk', text => /^Wrong milk/.test(text)],
    ['wrongFoam', text => /^Wrong foam/.test(text)],
    ['syrup', text => /syrup/i.test(text)],
    ['milkTemp', text => /^Milk /.test(text)],
    ['shotTime', text => /^Shot /.test(text)],
    ['sloppy', text => SLOPPY_NOTES.has(text) || /^Rushed /.test(text)],
    ['noTicket', text => /^No ticket/.test(text)],
    ['empty', text => /^Nothing handed over/.test(text) || /empty/i.test(text)],
  ];
  const seen = new Set();
  const faults = [];
  for (const note of notes) {
    if (typeof note !== 'string') continue;
    const match = matchers.find(([, test]) => test(note));
    const code = match?.[0];
    if (!code || seen.has(code)) continue;
    seen.add(code);
    faults.push({ code, label: FAULT_LABELS[code] });
  }
  return faults;
}

function drinkId(value) {
  if (typeof value === 'string') return value;
  return value && typeof value === 'object' && typeof value.id === 'string' ? value.id : '';
}

function drinkName(value, id) {
  if (value && typeof value === 'object' && typeof value.name === 'string') return value.name;
  return getDrink(id)?.name ?? (id || 'nothing');
}

function article(name) {
  return /^[aeiou]/i.test(String(name ?? '')) ? 'an' : 'a';
}

function stepKey(step) {
  return `${String(step?.station ?? '')}:${String(step?.param ?? '')}`;
}

function similarityStepKey(step) {
  return step?.station === 'syrupRack' ? 'syrupRack:*' : stepKey(step);
}

export function stepSimilarity(ticketSteps, builtSteps) {
  const ticketKeys = Array.isArray(ticketSteps) ? ticketSteps.map(similarityStepKey) : [];
  const builtKeys = Array.isArray(builtSteps) ? builtSteps.map(similarityStepKey) : [];
  if (builtKeys.length === 0) return 0;

  const ticketCounts = new Map();
  const builtCounts = new Map();
  for (const key of ticketKeys) ticketCounts.set(key, (ticketCounts.get(key) ?? 0) + 1);
  for (const key of builtKeys) builtCounts.set(key, (builtCounts.get(key) ?? 0) + 1);
  const keys = new Set([...ticketCounts.keys(), ...builtCounts.keys()]);
  let intersection = 0;
  let union = 0;
  for (const key of keys) {
    const ticketCount = ticketCounts.get(key) ?? 0;
    const builtCount = builtCounts.get(key) ?? 0;
    intersection += Math.min(ticketCount, builtCount);
    union += Math.max(ticketCount, builtCount);
  }
  const jaccard = union > 0 ? intersection / union : 0;

  let previous = new Array(builtKeys.length + 1).fill(0);
  for (let i = 0; i < ticketKeys.length; i++) {
    const current = new Array(builtKeys.length + 1).fill(0);
    for (let j = 0; j < builtKeys.length; j++) {
      current[j + 1] = ticketKeys[i] === builtKeys[j]
        ? previous[j] + 1
        : Math.max(previous[j + 1], current[j]);
    }
    previous = current;
  }
  const lcs = previous[builtKeys.length] / Math.max(ticketKeys.length, builtKeys.length, 1);
  return 0.5 * jaccard + 0.5 * lcs;
}

function syrupTotal(steps) {
  if (!Array.isArray(steps)) return 0;
  return steps.reduce((sum, step) => step?.station === 'syrupRack' && Number.isFinite(step.param)
    ? sum + step.param : sum, 0);
}

function stepCounts(steps) {
  const counts = new Map();
  if (!Array.isArray(steps)) return counts;
  for (const step of steps) {
    if (!step || step.station === 'syrupRack') continue;
    const key = stepKey(step);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

const NO_TICKET_TIP = 'Take an order at the till first — tap the till 1 time for each customer waiting.';

function zeroScore(note, code, tipText) {
  return {
    score: 0,
    tip: 0,
    correct: false,
    payout: 0,
    notes: [note],
    tip_text: tipText,
    faults: code && FAULT_LABELS[code] ? [{ code, label: FAULT_LABELS[code] }] : [],
  };
}

function emptyCupTip(order) {
  const id = drinkId(order?.drink);
  const drink = getDrink(id);
  const steps = Array.isArray(order?.steps) && order.steps.length ? order.steps
    : drink ? recipeFor(drink, order?.size) : [];
  return steps.length
    ? `That cup was empty — build all ${steps.length} steps of the ticket before you tap the handoff.`
    : 'That cup was empty — build at least 3 steps of the ticket before you tap the handoff.';
}

function stepCountMap(steps) {
  const counts = new Map();
  if (!Array.isArray(steps)) return counts;
  for (const step of steps) {
    const key = stepKey(step);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function differenceKeys(primary, secondary) {
  const primaryCounts = stepCountMap(primary);
  const secondaryCounts = stepCountMap(secondary);
  const keys = [];
  for (const [key, count] of primaryCounts) {
    const difference = Math.max(0, count - (secondaryCounts.get(key) ?? 0));
    for (let i = 0; i < difference; i++) keys.push(key);
  }
  return keys;
}

function wrongDrinkPhrase(key, extra = false) {
  const table = extra ? WRONG_DRINK_EXTRA : WRONG_DRINK_ACTION;
  if (table[key]) return table[key];
  if (key.startsWith('syrupRack:')) return extra ? 'the syrup' : 'pump the syrup';
  const [station, param] = key.split(':');
  return extra ? `the ${cleanText(param) || 'step'}`
    : `do the ${cleanText(param) || cleanText(station) || 'next'} step`;
}

function wrongDrinkFallback(ticket, ticketSteps) {
  if (ticketSteps.length === 0) {
    return `Check the ticket before you build: it says ${ticket} — read it once more before your 1st step.`;
  }
  return `Check the ticket before you build: it says ${ticket}, ${ticketSteps.length} steps.`;
}

function boundedWrongDrinkTip(render, actions, fallback) {
  let tip = render(actions.slice(0, 2));
  if (tip.length <= 120) return tip;
  tip = render(actions.slice(0, 1));
  return tip.length <= 120 ? tip : fallback;
}

function wrongDrinkTip(madeDrink, ticketName, ticketSteps, builtSteps) {
  const ticket = `${article(ticketName)} ${ticketName}`;
  const made = `${article(madeDrink)} ${madeDrink}`;
  const fallback = wrongDrinkFallback(ticket, ticketSteps);
  const missing = differenceKeys(ticketSteps, builtSteps);
  if (missing.length) {
    const actions = missing.map(key => wrongDrinkPhrase(key));
    const steps = missing.length === 1 ? 'step' : 'steps';
    return boundedWrongDrinkTip(
      shown => `That is ${made} — ${ticket} needs ${missing.length} ${steps} you skipped: ${shown.join(', then ')}.`,
      actions,
      fallback,
    );
  }
  const extra = differenceKeys(builtSteps, ticketSteps);
  if (extra.length) {
    const actions = extra.map(key => wrongDrinkPhrase(key, true));
    const steps = extra.length === 1 ? 'step' : 'steps';
    return boundedWrongDrinkTip(
      shown => `That is ${made} — ${ticket} does not take the ${extra.length} extra ${steps} you added: ${shown.join(', then ')}.`,
      actions,
      fallback,
    );
  }
  return fallback;
}

function scoreOrderSafe(order, built) {
  if (order === null || order === undefined) {
    return zeroScore('No ticket for that cup', 'noTicket', NO_TICKET_TIP);
  }
  if (built === null || built === undefined
    || !Array.isArray(built.steps) || built.steps.length === 0) {
    return zeroScore('Nothing handed over', 'empty', emptyCupTip(order));
  }

  const orderDrink = order?.drink;
  const ticketId = drinkId(orderDrink);
  const primaryBuiltDrink = built.drink;
  // An explicit drink from the caller wins; a null/absent one falls through to
  // step inference, which is what stations.js sends when it is unsure.
  const explicitBuiltDrink = (typeof primaryBuiltDrink === 'string' && primaryBuiltDrink)
    || (primaryBuiltDrink && typeof primaryBuiltDrink === 'object'
      && typeof primaryBuiltDrink.id === 'string' ? primaryBuiltDrink : null)
    || (typeof built.drinkId === 'string' && built.drinkId)
    || null;
  const madeId = drinkId(explicitBuiltDrink);
  const ticketDrink = getDrink(ticketId);
  // An empty steps array is not a ticket with no steps — it is a ticket that was
  // never filled in, so fall back to the recipe rather than calling every real
  // step in the cup an extra.
  const ticketSteps = Array.isArray(order?.steps) && order.steps.length ? order.steps
    : ticketDrink ? recipeFor(ticketDrink, order?.size) : [];
  const builtSteps = built.steps;
  const wrongDrink = madeDrink => {
    const ticketName = drinkName(orderDrink, ticketId);
    const note = `Wrong drink — that is ${article(madeDrink)} ${madeDrink}, the ticket says ${article(ticketName)} ${ticketName}`;
    return zeroScore(note, 'wrongDrink', wrongDrinkTip(madeDrink, ticketName, ticketSteps, builtSteps));
  };

  if (!ticketId) {
    return zeroScore('No ticket for that cup', 'noTicket', NO_TICKET_TIP);
  }

  const hasExplicitDrink = explicitBuiltDrink !== null;
  if (hasExplicitDrink) {
    if (madeId !== ticketId) return wrongDrink(drinkName(explicitBuiltDrink, madeId));
  } else {
    const simTicket = stepSimilarity(ticketSteps, builtSteps);
    let bestOther = null;
    let simOther = -1;
    for (const drink of DRINKS) {
      if (drink.id === ticketId) continue;
      const similarity = stepSimilarity(recipeFor(drink, built.size), builtSteps);
      if (similarity > simOther) {
        bestOther = drink;
        simOther = similarity;
      }
    }
    if (simTicket < simOther || simTicket < 0.34) {
      return wrongDrink(bestOther?.name ?? 'unknown drink');
    }
  }

  let score = 1;
  const noteItems = [];
  let noteOrder = 0;
  const addNote = (text, priority, code, tipText) => {
    noteItems.push({ text, priority, order: noteOrder++, code, tip: tipText });
  };

  // Hardware allowance: pouring unsteamed-ticket milk still records the paired steam action.
  const ignorePairedSteam = hasStep(ticketSteps, 'steamWand', 'pour')
    && !hasStep(ticketSteps, 'steamWand', 'steam');
  const penaltyBuiltSteps = ignorePairedSteam
    ? builtSteps.filter(step => step?.station !== 'steamWand' || step.param !== 'steam')
    : builtSteps;

  if (built.size !== order?.size) {
    score -= 0.35;
    const made = sizeLabel(built.size) || cleanText(built.size) || 'no size';
    const asked = sizeLabel(order?.size) || cleanText(order?.size) || 'unknown';
    const madeMl = SIZES.find(size => size.id === built.size)?.ml;
    const askedMl = SIZES.find(size => size.id === order?.size)?.ml;
    const hasMl = Number.isFinite(madeMl) && Number.isFinite(askedMl);
    addNote(
      hasMl
        ? `Wrong size — ${made} ${madeMl} ml, the ticket says ${asked} ${askedMl} ml`
        : `Wrong size — ${made}, the ticket says ${asked}`,
      100,
      'wrongSize',
      hasMl
        ? `You poured a ${made} (${madeMl} ml); the ticket says ${asked} (${askedMl} ml) — tap the cup stack until it reads ${asked.toUpperCase()}.`
        : 'Set the size first: 1 tap on the cup stack cycles Short, Tall, Grande, Venti.',
    );
  }

  let wrongMilk = null;
  for (const ticketStep of ticketSteps) {
    if (!ticketStep || !Object.prototype.hasOwnProperty.call(ticketStep, 'milk')) continue;
    const madeStep = builtSteps.find(step => step?.station === ticketStep.station
      && step.param === ticketStep.param
      && Object.prototype.hasOwnProperty.call(step, 'milk'));
    if (madeStep && madeStep.milk !== ticketStep.milk) {
      wrongMilk = { made: madeStep.milk, asked: ticketStep.milk };
      break;
    }
  }
  if (wrongMilk) {
    score -= 0.15;
    addNote(
      `Wrong milk — ${wrongMilk.made}, the ticket says ${wrongMilk.asked}`,
      95,
      'wrongMilk',
      `The ticket asks for ${wrongMilk.asked} milk — swap the pitcher before the 1 steam step.`,
    );
  }

  let wrongFoam = null;
  for (const ticketStep of ticketSteps) {
    if (ticketStep?.station !== 'steamWand' || ticketStep.param !== 'steam'
      || !Object.prototype.hasOwnProperty.call(ticketStep, 'foam')) continue;
    const madeStep = builtSteps.find(step => step?.station === ticketStep.station
      && step.param === ticketStep.param
      && Object.prototype.hasOwnProperty.call(step, 'foam'));
    if (madeStep && madeStep.foam !== ticketStep.foam) {
      const made = foamLabel(madeStep.foam);
      const asked = foamLabel(ticketStep.foam);
      if (made && asked) wrongFoam = { made, asked };
      break;
    }
  }
  if (wrongFoam) {
    score -= 0.14;
    const setting = wrongFoam.asked === 'wet foam' ? 'WET'
      : wrongFoam.asked === 'microfoam' ? 'MICRO' : 'DRY';
    addNote(
      `Wrong foam — ${wrongFoam.made}, the ticket says ${wrongFoam.asked}`,
      80,
      'wrongFoam',
      `Tap the steam wand to cycle its 3 foam settings to ${setting}, then hold to steam.`,
    );
  }

  const madeSyrup = syrupTotal(builtSteps);
  const askedSyrup = syrupTotal(ticketSteps);
  const syrupDifference = madeSyrup - askedSyrup;
  if (syrupDifference !== 0) {
    const amount = Math.abs(syrupDifference);
    score -= Math.min(0.40, amount * 0.14);
    const madePumps = `${madeSyrup} ${madeSyrup === 1 ? 'pump' : 'pumps'}`;
    const askedPumps = `${askedSyrup} ${askedSyrup === 1 ? 'pump' : 'pumps'}`;
    addNote(
      `${madePumps} of syrup — the ticket says ${askedSyrup}`,
      80,
      'syrup',
      syrupDifference > 0
        ? `You pumped ${madePumps} of syrup; the ticket asked for ${askedSyrup} — stop at ${askedSyrup}.`
        : `You pumped ${madePumps} of syrup; the ticket asked for ${askedSyrup} — hold the pump until the meter reads ${askedSyrup}.`,
    );
  }

  const requiredCounts = stepCounts(ticketSteps);
  const madeCounts = stepCounts(penaltyBuiltSteps);
  let missingPenalty = 0;
  for (const [key, required] of requiredCounts) {
    const count = Math.max(0, required - (madeCounts.get(key) ?? 0));
    const penalty = DEFINING.has(key) ? 0.30
      : key === 'cupStack:cup' || key === 'cupStack:lid' ? 0.22 : 0.18;
    missingPenalty += count * penalty;
    for (let i = 0; i < count; i++) {
      const station = key.split(':')[0];
      addNote(
        STEP_NOTE[key] ?? 'Missed step',
        90,
        'missingStep',
        STEP_TIP[key] ?? `The ticket has 1 more step at the ${station} — go back for it.`,
      );
    }
  }
  score -= Math.min(0.60, missingPenalty);

  let extraPenalty = 0;
  let firstExtra = '';
  for (const [key, made] of madeCounts) {
    const count = Math.max(0, made - (requiredCounts.get(key) ?? 0));
    if (count > 0 && !firstExtra) firstExtra = key;
    extraPenalty += count * (DEFINING.has(key) ? 0.30 : 0.10);
  }
  score -= Math.min(0.45, extraPenalty);
  if (firstExtra) {
    const made = madeCounts.get(firstExtra) ?? 0;
    const required = requiredCounts.get(firstExtra) ?? 0;
    const param = firstExtra.split(':').slice(1).join(':');
    const noun = EXTRA_NOUN[firstExtra] ?? `${param} steps`;
    const ticketName = drinkName(orderDrink, ticketId);
    const specialNote = DEFINING_EXTRA_NOTE[firstExtra];
    const note = specialNote ?? `The cup has ${made} ${noun}; the ticket takes ${required}`;
    const tipText = DEFINING_EXTRA_TIP[firstExtra]
      ?? (firstExtra === 'superauto:shot'
        ? `You added ${made - required} superauto ${made - required === 1 ? 'shot' : 'shots'} the ticket does not have — this ticket takes ${required}.`
        : firstExtra === 'espresso:pull'
        ? `You pulled ${made} ${noun}; ${article(ticketName)} ${ticketName} takes ${required} — one pull per cup.`
        : `The cup has ${made} ${noun}; this ticket takes ${required} — leave them out.`);
    addNote(note, 40, 'extraStep', tipText);
  }

  const worstByStation = new Map();
  for (const step of penaltyBuiltSteps) {
    if (!step || typeof step.quality !== 'number' || !Number.isFinite(step.quality)) continue;
    const q = clamp(step.quality, 0, 1);
    let penalty = 0;
    let note = '';
    let code = '';
    let tipText = '';
    if (step.station === 'steamWand' && step.param === 'steam') {
      const temperature = Number.isFinite(step.temp) ? Math.round(step.temp) : null;
      if (q < 0.7) {
        penalty = q < 0.4 ? 0.25 : 0.08;
        code = 'milkTemp';
        if (temperature === null) {
          note = q < 0.4 ? 'Milk scorched above 75 °C' : 'Milk off the 60 to 68 °C band';
          tipText = q < 0.4
            ? 'You took the milk past 75 °C — release the wand between 60 and 68 °C.'
            : 'Release the steam wand between 60 and 68 °C.';
        } else if (temperature >= 75) {
          note = `Milk hit ${temperature} °C — scorched above 75 °C`;
          tipText = `Milk hit ${temperature} °C — release the wand between 60 and 68 °C.`;
        } else if (temperature > 68) {
          note = `Milk hit ${temperature} °C — the band is 60 to 68 °C`;
          tipText = `Milk hit ${temperature} °C — release the wand between 60 and 68 °C.`;
        } else if (temperature < 60) {
          note = `Milk stopped at ${temperature} °C — the band is 60 to 68 °C`;
          tipText = `Milk stopped at ${temperature} °C — hold the wand until it reads 60 to 68 °C.`;
        } else {
          note = 'Milk off the 60 to 68 °C band';
          tipText = 'Release the steam wand between 60 and 68 °C.';
        }
      }
    } else if (step.station === 'espresso' && step.param === 'pull') {
      const seconds = Number.isFinite(step.seconds) ? Math.round(step.seconds) : null;
      if (q < 0.35) {
        penalty = 0.25;
        code = 'shotTime';
        if (seconds !== null && seconds > 30) {
          note = `Shot ran ${seconds} s — the window is 22 to 30 s`;
          tipText = `The shot ran ${seconds} seconds; stop it between 22 and 30.`;
        } else if (seconds !== null && seconds < 22) {
          note = `Shot ran ${seconds} s — the window is 22 to 30 s`;
          tipText = `The shot ran ${seconds} seconds; let it run 22 to 30.`;
        } else if (seconds !== null) {
          note = `Shot weak at ${seconds} s — the dose was off, not the clock`;
          tipText = `The shot ran ${seconds} seconds, so fix the dose: hold at the grinder until the meter is green.`;
        } else if (q < 0.15) {
          note = 'Shot sour — pulled short of 22 s';
          tipText = 'Let the shot run 22 to 30 seconds before you stop it.';
        } else {
          note = 'Shot bitter — pulled past 30 s';
          tipText = 'Stop the shot between 22 and 30 seconds.';
        }
      } else if (q < 0.7) {
        penalty = 0.08;
        code = 'shotTime';
        if (seconds !== null && seconds > 30) {
          note = `Shot ran ${seconds} s — the window is 22 to 30 s`;
          tipText = `The shot ran ${seconds} seconds; stop it between 22 and 30.`;
        } else if (seconds !== null && seconds < 22) {
          note = `Shot ran ${seconds} s — the window is 22 to 30 s`;
          tipText = `The shot ran ${seconds} seconds; let it run 22 to 30.`;
        } else if (seconds !== null) {
          note = `Shot weak at ${seconds} s — the dose was off, not the clock`;
          tipText = `The shot ran ${seconds} seconds, so fix the dose: hold at the grinder until the meter is green.`;
        } else {
          note = 'Shot outside the 22 to 30 s window';
          tipText = 'Stop the shot between 22 and 30 seconds.';
        }
      }
    } else if (q < 0.35) {
      penalty = 0.10;
      code = 'sloppy';
      const param = cleanText(step.param);
      const station = cleanText(step.station);
      note = SLOPPY_NOTE[param] ?? `Rushed ${param} — the meter missed its zone`;
      tipText = SLOPPY_TIP[param]
        ?? `Hold the ${station} until its meter reaches the green zone, about 1 second.`;
    }
    if (!penalty) continue;
    score -= penalty;
    const old = worstByStation.get(step.station);
    if (!old || penalty > old.penalty || (penalty === old.penalty && q < old.q)) {
      worstByStation.set(step.station, { penalty, q, note, code, tip: tipText });
    }
  }
  for (const issue of worstByStation.values()) {
    addNote(issue.note, issue.penalty >= 0.25 ? 85 : 60, issue.code, issue.tip);
  }

  score = clamp(score, 0, 1);
  const t0 = Number.isFinite(order?.t0) ? order.t0 : 0;
  let elapsed;
  if (Number.isFinite(built.elapsed)) {
    elapsed = Math.max(0, built.elapsed);
  } else {
    const servedAt = Number.isFinite(built.tServed) ? built.tServed
      : Number.isFinite(order?.tServed) ? order.tServed
        : nowSec >= t0 ? nowSec : t0;
    elapsed = Math.max(0, servedAt - t0);
  }
  const patience = Number.isFinite(order?.patience) && order.patience > 0 ? order.patience : 1;
  const speed = clamp(1 - elapsed / (patience * 0.5), 0, 1);
  const quality = clamp((score - 0.55) / 0.45, 0, 1);
  const price = Math.max(0, Number.isFinite(order?.price) ? order.price : 0);
  const tip = quality > 0 ? round2(Math.min(1.40, price * (0.06 + 0.26 * speed) * quality)) : 0;
  const payout = score >= 0.55 ? round2(price) : score >= 0.25 ? round2(price * 0.5) : 0;
  const sortedItems = noteItems.sort((a, b) => b.priority - a.priority || a.order - b.order);
  const visibleItems = sortedItems.slice(0, 5);
  const notes = visibleItems.map(item => item.text);
  const tip_text = sortedItems.find(item => item.tip)?.tip ?? '';
  const seenFaults = new Set();
  const faults = [];
  for (const item of visibleItems) {
    if (!item.code || seenFaults.has(item.code) || !FAULT_LABELS[item.code]) continue;
    seenFaults.add(item.code);
    faults.push({ code: item.code, label: FAULT_LABELS[item.code] });
  }

  return {
    score,
    tip,
    // Wrong aeration costs only 0.14, so the cup still pays — but Latte, Flat
    // White and Cappuccino are separated by nothing else, and `correct` is what
    // stations.js matches a cup to a ticket with. A dry-foam cup is plainly not
    // the Latte's, so it must never satisfy that ticket.
    correct: score >= 0.8 && !wrongFoam,
    notes,
    payout,
    tip_text,
    faults,
  };
}

export function scoreOrder(order, built) {
  try {
    return scoreOrderSafe(order, built);
  } catch (_) {
    return zeroScore('No ticket for that cup', 'noTicket', NO_TICKET_TIP);
  }
}
