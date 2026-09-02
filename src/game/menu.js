// A step is {station, param}, with optional size, milk,
// foam ('wet'|'micro'|'dry'), temp, or note.
// Recipe vocabulary: cupStack cup/lid; grinder grind; espresso pull;
// steamWand steam/pour; superauto shot; syrupRack numeric pumps;
// blender blend; iceWell ice; sink water; coldBrewTap tap.
// Lids come from the cup stack. If a ticket needs syrup and steamed milk,
// shots use the superauto so a speed-bar build stays within six moves.

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export const STEP_VERBS = deepFreeze({
  cupStack: ['cup', 'lid'],
  grinder: ['grind'],
  espresso: ['pull'],
  steamWand: ['steam', 'pour'],
  superauto: ['shot'],
  syrupRack: 'number',
  blender: ['blend'],
  iceWell: ['ice'],
  sink: ['water'],
  coldBrewTap: ['tap'],
});

export const FOAMS = Object.freeze(['wet', 'micro', 'dry']);

export function foamLabel(foam) {
  if (foam === 'wet') return 'wet foam';
  if (foam === 'micro') return 'microfoam';
  if (foam === 'dry') return 'dry foam';
  return '';
}

export const SIZES = deepFreeze([
  { id: 'short', label: 'Short', ml: 236, delta: -0.30 },
  { id: 'tall', label: 'Tall', ml: 354, delta: 0.00 },
  { id: 'grande', label: 'Grande', ml: 473, delta: 0.55 },
  { id: 'venti', label: 'Venti', ml: 591, delta: 0.95 },
]);

export function sizeDelta(sizeId) {
  return SIZES.find(size => size.id === sizeId)?.delta ?? 0;
}

export function sizeLabel(sizeId) {
  return SIZES.find(size => size.id === sizeId)?.label ?? '';
}

const cup = () => ({ station: 'cupStack', param: 'cup' });
const lid = () => ({ station: 'cupStack', param: 'lid' });

// Latte, Flat White and Cappuccino are no longer interchangeable: wet foam,
// microfoam and dry foam distinguish their otherwise matching steps.
export const DRINKS = deepFreeze([
  {
    id: 'espresso', name: 'Espresso', price: 2.15, hot: true, tier: 1,
    size: ['short', 'tall'], tags: ['espresso'], w0: 3, w1: 2, milk: false,
    recipe: [cup(), { station: 'grinder', param: 'grind' },
      { station: 'espresso', param: 'pull' }, lid()],
  },
  {
    id: 'americano', name: 'Americano', price: 2.85, hot: true, tier: 1,
    size: ['tall', 'grande', 'venti'], tags: ['espresso'], w0: 9, w1: 4, milk: false,
    recipe: [cup(), { station: 'grinder', param: 'grind' },
      { station: 'espresso', param: 'pull' }, { station: 'sink', param: 'water' }, lid()],
  },
  {
    id: 'latte', name: 'Latte', price: 3.55, hot: true, tier: 1,
    size: ['tall', 'grande', 'venti'], tags: ['espresso', 'milk'], w0: 12, w1: 6, milk: true,
    recipe: [cup(), { station: 'grinder', param: 'grind' },
      { station: 'espresso', param: 'pull' },
      { station: 'steamWand', param: 'steam', foam: 'wet' },
      { station: 'steamWand', param: 'pour' }, lid()],
  },
  {
    id: 'flatWhite', name: 'Flat White', price: 3.65, hot: true, tier: 2,
    size: ['tall', 'grande'], tags: ['espresso', 'milk'], w0: 5, w1: 6, milk: true,
    recipe: [cup(), { station: 'grinder', param: 'grind' },
      { station: 'espresso', param: 'pull' },
      { station: 'steamWand', param: 'steam', foam: 'micro' },
      { station: 'steamWand', param: 'pour' }, lid()],
  },
  {
    id: 'cappuccino', name: 'Cappuccino', price: 3.55, hot: true, tier: 2,
    size: ['tall', 'grande', 'venti'], tags: ['espresso', 'milk'], w0: 6, w1: 5, milk: true,
    recipe: [cup(), { station: 'grinder', param: 'grind' },
      { station: 'espresso', param: 'pull' },
      { station: 'steamWand', param: 'steam', foam: 'dry' },
      { station: 'steamWand', param: 'pour' }, lid()],
  },
  {
    id: 'caramelMacchiato', name: 'Caramel Macchiato', price: 4.15, hot: true, tier: 3,
    size: ['tall', 'grande', 'venti'], tags: ['espresso', 'milk', 'fussy'],
    w0: 2, w1: 10, milk: true,
    recipe: [cup(), { station: 'syrupRack', param: 2, note: 'vanilla' },
      { station: 'steamWand', param: 'steam' }, { station: 'steamWand', param: 'pour' },
      { station: 'superauto', param: 'shot', note: 'shots on top' }, lid()],
  },
  {
    id: 'mocha', name: 'Mocha', price: 4.05, hot: true, tier: 2,
    size: ['tall', 'grande', 'venti'], tags: ['espresso', 'milk', 'fussy'],
    w0: 3, w1: 8, milk: true,
    recipe: [cup(), { station: 'syrupRack', param: 2, note: 'mocha sauce' },
      { station: 'superauto', param: 'shot' }, { station: 'steamWand', param: 'steam' },
      { station: 'steamWand', param: 'pour' }, lid()],
  },
  {
    id: 'coldBrew', name: 'Cold Brew', price: 3.75, hot: false, tier: 2,
    size: ['tall', 'grande', 'venti'], tags: ['iced'], w0: 5, w1: 5, milk: false,
    recipe: [cup(), { station: 'iceWell', param: 'ice' },
      { station: 'coldBrewTap', param: 'tap' }, lid()],
  },
  {
    id: 'icedLatte', name: 'Iced Latte', price: 3.85, hot: false, tier: 2,
    size: ['tall', 'grande', 'venti'], tags: ['espresso', 'milk', 'iced'],
    w0: 4, w1: 7, milk: true,
    recipe: [cup(), { station: 'iceWell', param: 'ice' },
      { station: 'grinder', param: 'grind' }, { station: 'espresso', param: 'pull' },
      { station: 'steamWand', param: 'pour', note: 'cold milk' }, lid()],
  },
  {
    id: 'caramelFrappuccino', name: 'Caramel Frappuccino', price: 4.75, hot: false, tier: 3,
    size: ['tall', 'grande', 'venti'], tags: ['iced', 'blended', 'fussy'],
    w0: 1, w1: 11, milk: true,
    recipe: [cup(), { station: 'iceWell', param: 'ice' },
      { station: 'steamWand', param: 'pour', note: 'milk base' },
      { station: 'syrupRack', param: 3, note: 'caramel' },
      { station: 'blender', param: 'blend' }, lid()],
  },
  {
    id: 'matchaLatte', name: 'Matcha Latte', price: 4.05, hot: true, tier: 3,
    size: ['tall', 'grande', 'venti'], tags: ['milk', 'fussy'], w0: 1, w1: 9, milk: true,
    recipe: [cup(), { station: 'syrupRack', param: 3, note: 'matcha scoops' },
      { station: 'sink', param: 'water', note: 'hot water first' },
      { station: 'steamWand', param: 'steam' },
      { station: 'steamWand', param: 'pour' }, lid()],
  },
  {
    id: 'chaiLatte', name: 'Chai Latte', price: 3.85, hot: true, tier: 2,
    size: ['tall', 'grande', 'venti'], tags: ['milk', 'tea'], w0: 3, w1: 6, milk: true,
    recipe: [cup(), { station: 'syrupRack', param: 2, note: 'chai concentrate' },
      { station: 'steamWand', param: 'steam' },
      { station: 'steamWand', param: 'pour' }, lid()],
  },
  {
    id: 'breakfastTea', name: 'English Breakfast Tea', price: 2.45, hot: true, tier: 1,
    size: ['tall', 'grande', 'venti'], tags: ['tea'], w0: 10, w1: 3, milk: false,
    recipe: [cup(), { station: 'sink', param: 'water' }, lid()],
  },
]);

export const FOOD = deepFreeze([
  { id: 'croissant', name: 'Butter Croissant', price: 2.75 },
  { id: 'painAuChocolat', name: 'Pain au Chocolat', price: 2.95 },
  { id: 'breakfastWrap', name: 'Breakfast Wrap', price: 4.95 },
  { id: 'muffin', name: 'Blueberry Muffin', price: 2.85 },
]);

let fallbackSeed = 0x51F15EED;

function fallbackRng() {
  fallbackSeed = (1664525 * fallbackSeed + 1013904223) >>> 0;
  return fallbackSeed / 4294967296;
}

function randomUnit(rng) {
  if (typeof rng === 'function') {
    try {
      const value = rng();
      if (Number.isFinite(value)) return Math.max(0, Math.min(1 - Number.EPSILON, value));
    } catch (_) {
      // Use the deterministic fallback below.
    }
  }
  return fallbackRng();
}

function clamp01(value) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

export function getDrink(id) {
  return DRINKS.find(drink => drink.id === id) ?? null;
}

export function pickDrink(rng, difficulty, maxTier = 3) {
  const d = clamp01(difficulty);
  const eligible = DRINKS.filter(drink => drink.tier <= maxTier);
  const drinks = eligible.length > 0 ? eligible : DRINKS;
  const weights = drinks.map(drink => Math.max(0, drink.w0 + (drink.w1 - drink.w0) * d));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (!(total > 0)) return drinks[0];

  let cursor = randomUnit(rng) * total;
  for (let i = 0; i < drinks.length; i++) {
    cursor -= weights[i];
    if (cursor < 0) return drinks[i];
  }
  return drinks[drinks.length - 1];
}

export function pickFood(rng) {
  const index = Math.min(FOOD.length - 1, Math.floor(randomUnit(rng) * FOOD.length));
  return FOOD[index];
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, clone(child)]));
  }
  return value;
}

export function recipeFor(drink, size) {
  const source = typeof drink === 'string' ? getDrink(drink) : drink;
  if (!source || !Array.isArray(source.recipe)) return [];
  const recipe = clone(source.recipe);
  for (const step of recipe) {
    if (step?.station === 'cupStack' && (step.param === 'cup' || step.param === 'lid')) {
      step.size = size;
    }
  }
  return recipe;
}
