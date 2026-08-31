// All station timings and thresholds live here so the game feel can be tuned in one place.
export const CONFIG = {
  // Shared interaction cadence and recovery.
  hintInterval: 0.125,
  lostHoldGrace: 0.15,
  meterClearDelay: 0.45,

  // Cup capacities are expressed in the same abstract units as drink contents.
  capacity: { short: 4, tall: 5, grande: 6, venti: 7 },

  // Traditional espresso minigames.
  dose: {
    seconds: 1.4,
    max: 1.15,
    zone: [0.62, 0.86],
    falloff: 0.30,
    minQuality: 0.15,
    goodQuality: 0.85,
  },
  shot: {
    shots: 2,
    simSeconds: 40,
    realSeconds: 4.0,
    zoneSeconds: [22, 30],
    zone: [22 / 40, 30 / 40],
    falloff: 12,
    minQuality: 0.10,
    goodQuality: 0.85,
  },

  // Milk temperature and texture minigame.
  steam: {
    from: 20,
    to: 90,
    seconds: 3.5,
    steaming: 45,
    zoneTemp: [60, 68],
    zone: [(60 - 20) / 70, (68 - 20) / 70],
    scorch: 75,
    scorchQuality: 0.2,
    falloff: 10,
    minQuality: 0.2,
    milkUnits: 2,
    foamUnits: 0.6,
    foamUnitsByTarget: { wet: 0.35, micro: 0.6, dry: 1.0 },
    coldFoamUnits: 0.1,
    scorchedFoamUnits: 0.15,
  },

  // Countertop additions and other hold operations.
  syrup: { maxPumps: 8, meterHold: 1.4 },
  blend: { seconds: 3.0, done: 0.9, minQuality: 0.2 },
  whisk: { seconds: 1.2, done: 0.85, matchaUnits: 1 },
  chai: { seconds: 1.0, units: 2 },
  ice: { max: 3 },
  water: { units: 2 },
  coldBrew: { seconds: 1.8, max: 1.25, unitsAtFull: 3, overflowQuality: 0.5 },
  superauto: { seconds: 1.1, shots: 1, quality: 0.62 },

  // Per-action audio levels (full-volume actions use 1).
  volume: { full: 1, click: 0.35, size: 0.4, low: 0.4, ice: 0.5 },
};

const DOSE_METER_ZONE = Object.freeze([
  CONFIG.dose.zone[0] / CONFIG.dose.max,
  CONFIG.dose.zone[1] / CONFIG.dose.max,
]);
const BLEND_METER_ZONE = Object.freeze([CONFIG.blend.done, 1]);
const WHISK_METER_ZONE = Object.freeze([CONFIG.whisk.done, 1]);
const COLD_BREW_METER_ZONE = Object.freeze([0, 1 / CONFIG.coldBrew.max]);
const CLASSIFIER_MIN_SCORE = 0.34;
const CLASSIFIER_PUMP_PENALTY = 0.06;
const CLASSIFIER_SIZE_BONUS = 0.04;
const CLASSIFIER_TEMP_BONUS = 0.04;
const CLASSIFIER_FOAM_BONUS = 0.06;
const SCORE_TIE_EPSILON = 1e-9;

const EMPTY_CONTEXT = Object.freeze({});
const SIZES = Object.freeze(['short', 'tall', 'grande', 'venti']);
const SIZE_LABELS = Object.freeze(['Short', 'Tall', 'Grande', 'Venti']);
const SIZE_HINTS = Object.freeze([
  'Size: SHORT · tap to change · hold to take',
  'Size: TALL · tap to change · hold to take',
  'Size: GRANDE · tap to change · hold to take',
  'Size: VENTI · tap to change · hold to take',
]);
const FOAM_TARGETS = Object.freeze(['wet', 'micro', 'dry']);
const FOAM_FEEDBACK = Object.freeze(['Wet foam', 'Microfoam', 'Dry foam']);
const FOAM_HINTS = Object.freeze([
  'Foam: WET · tap to change · hold to steam',
  'Foam: MICRO · tap to change · hold to steam',
  'Foam: DRY · tap to change · hold to steam',
]);
const SYRUP_HINTS = Object.freeze([
  'E: pump syrup (0)', 'E: pump syrup (1)', 'E: pump syrup (2)',
  'E: pump syrup (3)', 'E: pump syrup (4)', 'E: pump syrup (5)',
  'E: pump syrup (6)', 'E: pump syrup (7)', 'E: pump syrup (8)',
]);
const PUMP_TEXT = Object.freeze([
  '0 pumps', '1 pump', '2 pumps', '3 pumps', '4 pumps',
  '5 pumps', '6 pumps', '7 pumps', '8 pumps',
]);
const CONTENT_KEYS = Object.freeze([
  'espresso', 'milk', 'foam', 'water', 'ice', 'syrup',
  'coldBrew', 'matcha', 'chai', 'tea', 'mocha',
]);
const CONTENT_COLORS = Object.freeze({
  espresso: 0x3A211A,
  coldBrew: 0x2E1B14,
  milk: 0xFAF6EE,
  foam: 0xF3E6CE,
  water: 0xD9CDB8,
  syrup: 0xC98A4B,
  matcha: 0x7FA65C,
  chai: 0xB98454,
  mocha: 0x4A2C1E,
  tea: 0x9A5B2A,
  ice: 0xDCEEF5,
});
const EMPTY_CUP_COLOR = 0xF6F3EC;

const HINT = Object.freeze({
  cupLid: 'E: lid it',
  grinderTake: 'Take the portafilter from the machine',
  grinderDosed: 'Dosed — lock it into the group head',
  grinderDose: 'Hold E to dose',
  espressoPour: 'E: pour the shot',
  espressoCup: 'Shot ready — grab a cup',
  espressoLock: 'E: lock it in',
  espressoDose: 'Dose it at the grinder first',
  espressoPull: 'Hold E to pull the shot',
  espressoTake: 'E: take the portafilter',
  steamPour: 'E: pour the milk',
  steamCup: 'Steamed — grab a cup',
  steamCold: 'E: pour it cold',
  steamTake: 'E: take the pitcher',
  blender: 'Hold E to blend',
  ice: 'E: scoop ice',
  rinse: 'E: rinse the pitcher',
  water: 'E: hot water · hold to whisk',
  coldBrew: 'Hold E to pour cold brew',
  grinding: 'Grinding…',
  superauto: 'E: one-touch shot · hold for chai',
  till: 'E: take the order',
  handoff: 'E: hand it over',
  emptyHandoff: 'Nothing to hand over',
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function zoneQuality(value, zone, falloff, floor) {
  if (value < zone[0]) return Math.max(floor, 1 - (zone[0] - value) / falloff);
  if (value > zone[1]) return Math.max(floor, 1 - (value - zone[1]) / falloff);
  return 1;
}

export function createStations(context) {
  const ctx = context && typeof context === 'object' ? context : EMPTY_CONTEXT;

  let now = Number.isFinite(ctx.state?.tSec) ? ctx.state.tSec : 0;
  let selectedSizeIndex = 2;
  let selectedFoamIndex = 1;
  let cup = null;
  let hand = null;

  const portafilter = { dosed: false, quality: 0, locked: false };
  const pitcher = {
    milk: 1,
    temp: CONFIG.steam.from,
    steamed: false,
    quality: 0,
    scorched: false,
  };

  let shotReady = false;
  let shotQuality = 0;
  let shotSeconds = 0;
  let liveMeter = null;
  let liveElapsed = 0;
  let liveValue = 0;
  let lostHoldTime = 0;
  let sawHold = false;
  let meterClearTime = -1;
  let syrupHoldTime = 0;
  let meterVisible = false;
  let ignoreNextHoldEnd = false;
  let ignoredHoldId = null;

  let superautoTime = 0;
  let superautoCup = null;

  let registeredList = null;
  let registeredLength = -1;
  const interactableMap = new Map();
  let hintTime = 0;

  const pending = [];
  let lastGuide;

  // High-frequency event objects are shared because the event bus delivers synchronously.
  const feedbackPayload = { id: null, ok: false, text: '' };
  const sfxPayload = { name: 'thunk', vol: 1 };
  const gesturePayload = { name: 'tap' };
  const handEventPayload = { item: null };
  const cupEventPayload = { cup: null };
  const builtPayload = {
    drink: null,
    drinkId: '',
    size: 'grande',
    lidded: false,
    blended: false,
    steps: null,
    contents: null,
    quality: 1,
    seconds: 0,
  };
  const cupHandItem = {
    kind: 'cup',
    size: 'grande',
    lidded: false,
    fill: 0,
    color: EMPTY_CUP_COLOR,
    foam: 0,
    iced: false,
    hot: true,
  };
  const portafilterHandItem = { kind: 'portafilter', dosed: false, quality: 0 };
  const pitcherHandItem = {
    kind: 'pitcher',
    milk: 1,
    temp: CONFIG.steam.from,
    steaming: false,
  };
  const meterPayload = { kind: 'dose', value: 0, zone: undefined, label: '', text: '' };
  const syrupZone = [0, 0];
  const builtSignature = {
    counts: new Map(),
    keyCount: 0,
    syrupPumps: 0,
    hasSyrup: false,
    steamFoam: null,
  };
  let drinkSignatures = null;

  function emit(name, payload) {
    try {
      ctx.bus?.emit?.(name, payload);
    } catch (_error) {
      // Foreign modules are optional; station state must remain playable without them.
    }
  }

  function sound(name, vol) {
    sfxPayload.name = name;
    sfxPayload.vol = Number.isFinite(vol) ? vol : CONFIG.volume.full;
    emit('sfx', sfxPayload);
  }

  function feedback(id, ok, text) {
    feedbackPayload.id = id ?? null;
    feedbackPayload.ok = Boolean(ok);
    feedbackPayload.text = text;
    emit('station:feedback', feedbackPayload);
  }

  function reject(id, text, vol) {
    feedback(id, false, text);
    sound('thunk', vol);
  }

  function gesture(name) {
    gesturePayload.name = name;
    emit('hand:gesture', gesturePayload);
  }

  function showMeter(kind, value, zone, label, text) {
    meterPayload.kind = kind;
    meterPayload.value = clamp01(value);
    meterPayload.zone = zone;
    meterPayload.label = label;
    meterPayload.text = text;
    try {
      ctx.hud?.setMeter?.(meterPayload);
      meterVisible = true;
    } catch (_error) {
      // The HUD is deliberately non-essential.
    }
  }

  function trainingOn() {
    try {
      // Strict === true keeps an absent flag off instead of using a truthy test.
      return ctx.state?.training === true;
    } catch (_error) {
      return false;
    }
  }

  function clearMeterDisplay() {
    if (!meterVisible) return;
    try {
      ctx.hud?.setMeter?.(null);
    } catch (_error) {
      // The HUD is deliberately non-essential.
    }
    meterVisible = false;
  }

  function toast(text, ok) {
    try {
      ctx.hud?.toast?.(text, ok);
    } catch (_error) {
      // The HUD is deliberately non-essential.
    }
  }

  function emitHandItem() {
    let item = null;
    if (hand === 'cup' && cup) {
      cupHandItem.size = cup.size;
      cupHandItem.lidded = cup.lidded;
      cupHandItem.fill = cup.fill;
      cupHandItem.color = cup.color;
      cupHandItem.foam = cup.foam;
      cupHandItem.iced = cup.iced;
      cupHandItem.hot = cup.hot;
      item = cupHandItem;
    } else if (hand === 'portafilter') {
      portafilterHandItem.dosed = portafilter.dosed;
      portafilterHandItem.quality = portafilter.quality;
      item = portafilterHandItem;
    } else if (hand === 'pitcher') {
      pitcherHandItem.milk = pitcher.milk;
      pitcherHandItem.temp = pitcher.temp;
      pitcherHandItem.steaming = pitcher.temp > CONFIG.steam.steaming;
      item = pitcherHandItem;
    }
    handEventPayload.item = item;
    emit('hand:item', handEventPayload);
  }

  function recomputeCup() {
    if (!cup) return;
    let total = 0;
    let red = 0;
    let green = 0;
    let blue = 0;

    for (let i = 0; i < CONTENT_KEYS.length; i += 1) {
      const key = CONTENT_KEYS[i];
      const units = Number.isFinite(cup.contents[key]) ? Math.max(0, cup.contents[key]) : 0;
      if (units <= 0) continue;
      const color = CONTENT_COLORS[key];
      total += units;
      red += ((color >> 16) & 0xFF) * units;
      green += ((color >> 8) & 0xFF) * units;
      blue += (color & 0xFF) * units;
    }

    const capacity = CONFIG.capacity[cup.size] || CONFIG.capacity.grande;
    cup.fill = clamp01(total / capacity);
    cup.color = total > 0
      ? (Math.round(red / total) << 16) | (Math.round(green / total) << 8) | Math.round(blue / total)
      : EMPTY_CUP_COLOR;
    cup.foam = cup.contents.foam / capacity;
    cup.iced = cup.contents.ice > 0;
    cup.hot = !cup.iced;
  }

  function emitCupChanged() {
    cupEventPayload.cup = cup;
    emit('cup:changed', cupEventPayload);
    if (hand === 'cup') emitHandItem();
  }

  function addStep(station, param, quality) {
    if (!cup) return null;
    const q = clamp01(quality);
    const step = { station, param, quality: q };
    cup.steps.push(step);
    cup.quality = clamp01(cup.quality * q);
    return step;
  }

  function contentsTotal() {
    if (!cup) return 0;
    let total = 0;
    for (let i = 0; i < CONTENT_KEYS.length; i += 1) {
      const amount = cup.contents[CONTENT_KEYS[i]];
      if (Number.isFinite(amount) && amount > 0) total += amount;
    }
    return total;
  }

  function resetPortafilter() {
    portafilter.dosed = false;
    portafilter.quality = 0;
    portafilter.locked = false;
  }

  function resetPitcher() {
    pitcher.milk = 1;
    pitcher.temp = CONFIG.steam.from;
    pitcher.steamed = false;
    pitcher.quality = 0;
    pitcher.scorched = false;
  }

  function markIgnoredHold(id) {
    ignoreNextHoldEnd = true;
    ignoredHoldId = id ?? null;
  }

  function cancelLiveMeter(ignoreRelease) {
    if (liveMeter !== null && ignoreRelease) markIgnoredHold(liveMeter);
    liveMeter = null;
    liveElapsed = 0;
    liveValue = 0;
    lostHoldTime = 0;
    meterClearTime = -1;
    syrupHoldTime = 0;
    clearMeterDisplay();
  }

  function resetAll() {
    const discardedShot = superautoTime > 0 && superautoCup !== null;
    cancelLiveMeter(true);
    cup = null;
    hand = null;
    shotReady = false;
    shotQuality = 0;
    shotSeconds = 0;
    superautoTime = 0;
    superautoCup = null;
    resetPortafilter();
    resetPitcher();
    emitCupChanged();
    emitHandItem();
    if (discardedShot) feedback('superauto', false, 'Shot went in the drip tray');
  }

  function freshCup() {
    const size = SIZES[selectedSizeIndex];
    const next = {
      size,
      lidded: false,
      steps: [],
      contents: {
        espresso: 0,
        milk: 0,
        foam: 0,
        water: 0,
        ice: 0,
        syrup: 0,
        coldBrew: 0,
        matcha: 0,
        chai: 0,
        tea: 0,
        mocha: 0,
      },
      blended: false,
      quality: 1,
      t0: now,
      fill: 0,
      color: EMPTY_CUP_COLOR,
      foam: 0,
      iced: false,
      hot: true,
    };
    return next;
  }

  function putHeldToolHome() {
    if (hand === 'portafilter') resetPortafilter();
    else if (hand === 'pitcher') resetPitcher();
  }

  function lidCup(id) {
    if (!cup || contentsTotal() <= 0) {
      reject(id, 'Nothing to lid');
      return;
    }
    if (cup.lidded) {
      reject(id, 'Already lidded');
      return;
    }
    cup.lidded = true;
    addStep('cupStack', 'lid', 1);
    emitCupChanged();
    gesture('place');
    sound('pageturn');
    feedback(id, true, 'Lidded');
  }

  function takeFreshCup() {
    const hadCup = cup !== null;
    const discardedShot = superautoTime > 0 && superautoCup !== null;
    if (liveMeter !== null || syrupHoldTime > 0) cancelLiveMeter(true);
    if (hand === 'portafilter' || hand === 'pitcher') putHeldToolHome();
    superautoTime = 0;
    superautoCup = null;
    cup = freshCup();
    addStep('cupStack', 'cup', 1);
    recomputeCup();
    hand = 'cup';
    emitCupChanged();
    gesture('place');
    sound('pageturn');
    feedback('cupStack', true, hadCup ? 'Fresh cup' : SIZE_LABELS[selectedSizeIndex] + ' cup');
    if (discardedShot) feedback('superauto', false, 'Shot went in the drip tray');
  }

  function tapCupStack() {
    if (hand === 'cup' && cup && contentsTotal() > 0 && !cup.lidded) {
      lidCup('cupStack');
      return;
    }
    selectedSizeIndex = (selectedSizeIndex + 1) % SIZES.length;
    sound('beep', CONFIG.volume.size);
    feedback('cupStack', true, SIZE_LABELS[selectedSizeIndex] + ' cup');
  }

  function beginMeter(id, elapsed = 0) {
    if (liveMeter !== null) {
      reject(id, 'Finish the current machine first');
      markIgnoredHold(id);
      return false;
    }
    liveMeter = id;
    liveElapsed = clamp(elapsed, 0, 0.35);
    liveValue = 0;
    lostHoldTime = 0;
    sawHold = false;
    meterClearTime = -1;
    syrupHoldTime = 0;
    ignoreNextHoldEnd = false;
    clearMeterDisplay();
    advanceLiveMeter(0);
    return true;
  }

  function beginDose(elapsed = 0) {
    if (hand !== 'portafilter') {
      reject('grinder', 'Grab the portafilter from the group head');
      markIgnoredHold('grinder');
      return;
    }
    if (portafilter.dosed) {
      reject('grinder', 'Already dosed — lock it in');
      markIgnoredHold('grinder');
      return;
    }
    if (!beginMeter('grinder', elapsed)) return;
    sound('grind');
    gesture('shake');
  }

  function finishDose() {
    const value = liveValue;
    const quality = zoneQuality(
      value,
      CONFIG.dose.zone,
      CONFIG.dose.falloff,
      CONFIG.dose.minQuality,
    );
    portafilter.dosed = true;
    portafilter.quality = quality;
    liveMeter = null;
    meterClearTime = CONFIG.meterClearDelay;
    lostHoldTime = 0;
    emitHandItem();
    gesture('tamp');
    sound(quality > CONFIG.dose.goodQuality ? 'ding' : 'thunk',
      quality > CONFIG.dose.goodQuality ? CONFIG.volume.full : CONFIG.volume.low);
    feedback('grinder', true, value < CONFIG.dose.zone[0]
      ? 'Light dose' : value > CONFIG.dose.zone[1] ? 'Choked — too much' : 'Perfect dose');
  }

  function tapEspresso() {
    if (shotReady) {
      if (!cup) {
        reject('espresso', 'Grab a cup first');
        return;
      }
      if (hand === 'pitcher') resetPitcher();
      addStep('grinder', 'grind', portafilter.quality);
      const pullStep = addStep('espresso', 'pull', shotQuality);
      if (pullStep && shotSeconds > 0) pullStep.seconds = shotSeconds;
      cup.contents.espresso += CONFIG.shot.shots;
      recomputeCup();
      shotReady = false;
      shotQuality = 0;
      shotSeconds = 0;
      resetPortafilter();
      hand = 'cup';
      emitCupChanged();
      gesture('pour');
      sound('pour');
      feedback('espresso', true, 'Double shot in');
      return;
    }

    if (hand === 'portafilter' && portafilter.dosed) {
      portafilter.locked = true;
      hand = null;
      emitHandItem();
      gesture('place');
      sound('beep');
      feedback('espresso', true, 'Locked in — hold to pull');
      return;
    }
    if (hand === 'portafilter' && !portafilter.dosed) {
      reject('espresso', 'Dose it at the grinder');
      return;
    }
    if (!portafilter.locked && (hand === null || hand === 'cup')) {
      hand = 'portafilter';
      emitHandItem();
      gesture('tap');
      sound('beep');
      feedback('espresso', true, 'Portafilter');
      return;
    }
    if (hand === 'pitcher' && !portafilter.locked) {
      reject('espresso', 'Put the pitcher back first');
      return;
    }
    reject('espresso', 'Hold E to pull the shot');
  }

  function beginShot(elapsed = 0) {
    if (shotReady) {
      reject('espresso', cup ? 'Tap E to pour the shot' : 'Grab a cup first');
      markIgnoredHold('espresso');
      return;
    }
    if (!portafilter.locked || !portafilter.dosed) {
      let advice = 'Take the portafilter first';
      if (hand === 'portafilter') {
        advice = portafilter.dosed ? 'Tap E to lock it in' : 'Dose it at the grinder';
      } else if (portafilter.locked) {
        advice = 'Dose it at the grinder';
      }
      reject('espresso', advice);
      markIgnoredHold('espresso');
      return;
    }
    if (!beginMeter('espresso', elapsed)) return;
    sound('pour');
    gesture('pour');
  }

  function finishShot() {
    const seconds = liveValue;
    shotSeconds = Number.isFinite(seconds) ? seconds : 0;
    const timeQuality = zoneQuality(
      seconds,
      CONFIG.shot.zoneSeconds,
      CONFIG.shot.falloff,
      CONFIG.shot.minQuality,
    );
    shotQuality = clamp01(timeQuality * (0.5 + 0.5 * portafilter.quality));
    shotReady = true;
    liveMeter = null;
    meterClearTime = CONFIG.meterClearDelay;
    lostHoldTime = 0;
    sound(shotQuality > CONFIG.shot.goodQuality ? 'ding' : 'thunk',
      shotQuality > CONFIG.shot.goodQuality ? CONFIG.volume.full : CONFIG.volume.low);
    feedback('espresso', true, seconds < CONFIG.shot.zoneSeconds[0]
      ? 'Sour — pulled short'
      : seconds > CONFIG.shot.zoneSeconds[1] ? 'Bitter — over-extracted' : 'Beautiful shot');
  }

  function tapSteamWand() {
    if (hand !== 'pitcher') {
      if (hand === 'portafilter') resetPortafilter();
      resetPitcher();
      hand = 'pitcher';
      emitHandItem();
      gesture('tap');
      sound('beep');
      feedback('steamWand', true, 'Milk pitcher');
      return;
    }

    if (pitcher.steamed) {
      if (!cup) {
        reject('steamWand', HINT.steamCup);
        return;
      }
      const foamTarget = FOAM_TARGETS[selectedFoamIndex];
      const steamStep = addStep('steamWand', 'steam', pitcher.quality);
      if (steamStep) {
        steamStep.foam = foamTarget;
        if (Number.isFinite(pitcher.temp)) steamStep.temp = pitcher.temp;
      }
      addStep('steamWand', 'pour', 1);
      cup.contents.milk += CONFIG.steam.milkUnits;
      cup.contents.foam += pitcher.scorched
        ? CONFIG.steam.scorchedFoamUnits : CONFIG.steam.foamUnitsByTarget[foamTarget];
      recomputeCup();
      const scorched = pitcher.scorched;
      resetPitcher();
      hand = 'cup';
      emitCupChanged();
      gesture('pour');
      sound('pour');
      feedback('steamWand', true, scorched ? 'Scorched milk in' : 'Milk in');
      return;
    }

    if (cup?.contents?.ice > 0) {
      addStep('steamWand', 'pour', 1);
      cup.contents.milk += CONFIG.steam.milkUnits;
      cup.contents.foam += CONFIG.steam.coldFoamUnits;
      recomputeCup();
      resetPitcher();
      hand = 'cup';
      emitCupChanged();
      gesture('pour');
      sound('pour');
      feedback('steamWand', true, 'Cold milk in');
      return;
    }

    selectedFoamIndex = (selectedFoamIndex + 1) % FOAM_TARGETS.length;
    sound('beep', CONFIG.volume.size);
    feedback('steamWand', true, FOAM_FEEDBACK[selectedFoamIndex]);
  }

  function beginSteam(elapsed = 0) {
    if (hand !== 'pitcher') {
      reject('steamWand', 'Take the pitcher first');
      markIgnoredHold('steamWand');
      return;
    }
    if (pitcher.steamed) {
      reject('steamWand', cup ? 'Tap E to pour the milk' : 'Grab a cup first');
      markIgnoredHold('steamWand');
      return;
    }
    if (!beginMeter('steamWand', elapsed)) return;
    sound('steam');
    gesture('shake');
  }

  function finishSteam() {
    const temp = liveValue;
    let quality;
    let text;
    let good = false;
    if (temp > CONFIG.steam.scorch) {
      quality = CONFIG.steam.scorchQuality;
      pitcher.scorched = true;
      text = 'Scorched!';
    } else {
      quality = zoneQuality(
        temp,
        CONFIG.steam.zoneTemp,
        CONFIG.steam.falloff,
        CONFIG.steam.minQuality,
      );
      if (temp < CONFIG.steam.zoneTemp[0]) text = 'Cold milk';
      else if (temp <= CONFIG.steam.zoneTemp[1]) {
        text = 'Silky microfoam';
        good = true;
      } else text = 'Milk too hot';
    }
    pitcher.temp = temp;
    pitcher.quality = quality;
    pitcher.steamed = true;
    liveMeter = null;
    meterClearTime = CONFIG.meterClearDelay;
    lostHoldTime = 0;
    emitHandItem();
    sound(good ? 'ding' : 'thunk', good ? CONFIG.volume.full : CONFIG.volume.low);
    feedback('steamWand', true, text);
  }

  function fillSignature(steps, signature, defaultSteamFoam = false) {
    signature.counts.clear();
    signature.keyCount = 0;
    signature.syrupPumps = 0;
    signature.hasSyrup = false;
    signature.steamFoam = null;
    if (!Array.isArray(steps)) return signature;

    for (let i = 0; i < steps.length; i += 1) {
      const step = steps[i];
      if (!step || (step.station === 'cupStack'
        && (step.param === 'cup' || step.param === 'lid'))) continue;
      if (step.station === 'syrupRack') {
        signature.hasSyrup = true;
        if (Number.isFinite(step.param)) signature.syrupPumps += step.param;
        continue;
      }
      if (step.station === 'steamWand' && step.param === 'steam') {
        signature.steamFoam = typeof step.foam === 'string'
          ? step.foam : defaultSteamFoam ? 'wet' : null;
      }
      const key = String(step.station ?? '') + ':' + String(step.param ?? '');
      signature.counts.set(key, (signature.counts.get(key) ?? 0) + 1);
      signature.keyCount += 1;
    }
    if (signature.hasSyrup) signature.keyCount += 1;
    return signature;
  }

  function ensureDrinkSignatures() {
    if (drinkSignatures !== null) return;
    try {
      const drinks = ctx.menu?.DRINKS;
      if (!Array.isArray(drinks)) return;
      const signatures = [];
      for (let i = 0; i < drinks.length; i += 1) {
        const drink = drinks[i];
        const signature = {
          drink,
          id: typeof drink?.id === 'string' ? drink.id : '',
          sizes: Array.isArray(drink?.size) ? drink.size : null,
          hot: drink?.hot,
          counts: new Map(),
          keyCount: 0,
          syrupPumps: 0,
          hasSyrup: false,
          steamFoam: null,
        };
        fillSignature(drink?.recipe, signature, true);
        signatures.push(signature);
      }
      drinkSignatures = signatures;
    } catch (_error) {
      drinkSignatures = null;
    }
  }

  function ticketTieRank(id, orders, size) {
    if (!id || !Array.isArray(orders)) return Number.MAX_SAFE_INTEGER;
    let fallback = Number.MAX_SAFE_INTEGER;
    for (let i = 0; i < orders.length; i += 1) {
      const value = orders[i]?.drink;
      const ticketId = typeof value === 'string' ? value : value?.id;
      if (ticketId !== id) continue;
      if (orders[i]?.size === size) return i;
      if (fallback === Number.MAX_SAFE_INTEGER) fallback = orders.length + i;
    }
    return fallback;
  }

  function classifyBuiltDrink(built, orders) {
    try {
      built.drink = null;
      built.drinkId = '';
      ensureDrinkSignatures();
      if (!Array.isArray(drinkSignatures) || drinkSignatures.length === 0) return;

      fillSignature(built.steps, builtSignature);
      const builtHot = !(built.contents?.ice > 0);
      let best = null;
      let bestScore = -Infinity;
      let bestTieRank = Number.MAX_SAFE_INTEGER;

      for (let i = 0; i < drinkSignatures.length; i += 1) {
        const recipe = drinkSignatures[i];
        let matched = 0;
        for (const [key, count] of recipe.counts) {
          matched += Math.min(count, builtSignature.counts.get(key) ?? 0);
        }
        if (recipe.hasSyrup && builtSignature.hasSyrup) matched += 1;

        const union = recipe.keyCount + builtSignature.keyCount - matched;
        let score = union > 0 ? matched / union : 0;
        score -= Math.abs(recipe.syrupPumps - builtSignature.syrupPumps)
          * CLASSIFIER_PUMP_PENALTY;
        if (recipe.sizes?.includes(built.size)) score += CLASSIFIER_SIZE_BONUS;
        if (typeof recipe.hot === 'boolean' && recipe.hot === builtHot) {
          score += CLASSIFIER_TEMP_BONUS;
        }
        if (builtSignature.steamFoam !== null) {
          score += recipe.steamFoam === builtSignature.steamFoam
            ? CLASSIFIER_FOAM_BONUS : -CLASSIFIER_FOAM_BONUS;
        }

        const tieRank = ticketTieRank(recipe.id, orders, built.size);
        if (score > bestScore + SCORE_TIE_EPSILON
          || (Math.abs(score - bestScore) <= SCORE_TIE_EPSILON && tieRank < bestTieRank)) {
          best = recipe;
          bestScore = score;
          bestTieRank = tieRank;
        }
      }

      if (best && best.id && bestScore >= CLASSIFIER_MIN_SCORE) {
        // Pass the id string rather than the menu object: orders.js accepts either, and a string
        // survives its `typeof x === 'object'` branch without collapsing to a bare boolean.
        built.drink = best.id;
        built.drinkId = best.id;
      }
    } catch (_error) {
      built.drink = null;
      built.drinkId = '';
    }
  }

  // Usually populated immediately; a soft-import menu stub is retried at handoff.
  ensureDrinkSignatures();

  function orderSource() {
    const stateOrders = ctx.state?.orders;
    return Array.isArray(stateOrders) && stateOrders.length > 0 ? stateOrders : pending;
  }

  function recipeForOrder(order) {
    // The ticket's own steps win: orders.js applies modifiers there, so a Caramel Macchiato whose
    // base recipe says 2 pumps may actually be ticketed for 1 or 3, and a syrup-free drink can
    // gain a syrupRack step outright. Require a non-empty array — an empty one would silently
    // mask the base recipe and leave the meter with no target at all.
    if (Array.isArray(order?.steps) && order.steps.length > 0) return order.steps;
    if (Array.isArray(order?.drink?.recipe)) return order.drink.recipe;
    if (Array.isArray(order?.recipe)) return order.recipe;
    if (typeof order?.drink !== 'string' || !Array.isArray(ctx.menu?.DRINKS)) return null;
    for (let i = 0; i < ctx.menu.DRINKS.length; i += 1) {
      const drink = ctx.menu.DRINKS[i];
      if (drink?.id === order.drink && Array.isArray(drink.recipe)) return drink.recipe;
    }
    return null;
  }

  function guideStepPayload(step, order, index, total, pumps) {
    const param = step?.param;
    const kind = String(step?.station ?? '') + ':' + String(param ?? '');
    const sizeWord = order?.size ? String(order.size).toUpperCase() : '';
    let station = step?.station;
    let label;
    let hint;

    switch (kind) {
      case 'cupStack:cup': {
        station = 'cupStack';
        label = sizeWord ? 'TAKE A ' + sizeWord + ' CUP' : 'TAKE A CUP';
        const targetIndex = SIZES.indexOf(order?.size);
        hint = targetIndex >= 0 && order?.size && SIZES[selectedSizeIndex] !== order.size
          ? 'tap at the cup stack until it says ' + SIZE_LABELS[targetIndex]
            + ', then hold to take it'
          : 'hold at the cup stack to take a cup';
        break;
      }
      case 'cupStack:lid':
        station = 'cupStack';
        label = 'LID IT';
        hint = 'tap at the cup stack to snap a lid on';
        break;
      case 'grinder:grind':
        label = 'GRIND';
        if (hand !== 'portafilter') {
          station = 'espresso';
          hint = 'tap at the espresso machine to take the portafilter';
        } else {
          station = 'grinder';
          hint = 'hold at the grinder until the dose meter is in the green';
        }
        break;
      case 'espresso:pull':
        station = 'espresso';
        if (shotReady) {
          label = 'POUR THE SHOT';
          hint = cup
            ? 'tap at the espresso machine to pour it into the cup'
            : 'take a cup first, then tap here to pour';
        } else if (hand === 'portafilter' && portafilter.dosed) {
          label = 'LOCK IT IN';
          hint = 'tap at the group head to lock the portafilter in';
        } else if (portafilter.locked) {
          label = 'PULL SHOT';
          hint = 'hold at the espresso machine and release at '
            + CONFIG.shot.zoneSeconds[0] + '-' + CONFIG.shot.zoneSeconds[1] + ' seconds';
        } else {
          label = 'PULL SHOT';
          hint = 'dose the portafilter at the grinder first';
        }
        break;
      case 'steamWand:steam': {
        station = 'steamWand';
        label = 'STEAM MILK';
        const want = typeof step?.foam === 'string' ? step.foam : null;
        const wantIndex = FOAM_TARGETS.indexOf(want);
        if (hand !== 'pitcher') {
          hint = 'tap at the steam wand to pick up the milk pitcher';
        } else if (wantIndex >= 0 && selectedFoamIndex !== wantIndex) {
          hint = 'tap the wand until it reads ' + want.toUpperCase() + ', then hold to steam';
        } else {
          hint = 'hold at the wand and release between ' + CONFIG.steam.zoneTemp[0]
            + ' and ' + CONFIG.steam.zoneTemp[1] + ' °C';
        }
        break;
      }
      case 'steamWand:pour':
        station = 'steamWand';
        label = 'POUR THE MILK';
        if (hand !== 'pitcher') {
          hint = 'tap at the steam wand to pick up the milk pitcher';
        } else if (cup && cup.contents.ice > 0 && !pitcher.steamed) {
          hint = 'tap at the steam wand to pour cold milk over the ice';
        } else {
          hint = 'tap at the steam wand to pour the milk into the cup';
        }
        break;
      case 'blender:blend':
        station = 'blender';
        label = 'BLEND IT';
        hint = 'hold at the blender until the bar fills';
        break;
      case 'iceWell:ice':
        station = 'iceWell';
        label = 'SCOOP ICE';
        hint = 'tap at the ice well to scoop ice in';
        break;
      case 'sink:water':
        station = 'sink';
        label = 'HOT WATER';
        hint = 'tap at the sink to add hot water';
        break;
      case 'sink:whisk':
        station = 'sink';
        label = 'WHISK IT';
        hint = 'hold at the sink to whisk it smooth';
        break;
      case 'superauto:shot':
        station = 'superauto';
        label = typeof step?.note === 'string' && step.note.toLowerCase().includes('decaf')
          ? 'ONE-TOUCH DECAF SHOT' : 'ONE-TOUCH SHOT';
        hint = 'tap the super-auto and wait for it to grind and pour';
        break;
      case 'superauto:chai':
        station = 'superauto';
        label = 'CHAI CONCENTRATE';
        hint = 'hold at the super-auto to pour the chai';
        break;
      case 'coldBrewTap:tap':
        station = 'coldBrewTap';
        label = 'POUR COLD BREW';
        hint = 'hold at the tap and release before it overflows';
        break;
      default: {
        if (step?.station === 'syrupRack' && Number.isFinite(param)) {
          station = 'syrupRack';
          const note = typeof step.note === 'string' ? step.note.trim() : '';
          const flavour = note ? note.split(/\s+/)[0].toUpperCase() : '';
          label = String(param) + ' ' + (param === 1 ? 'PUMP' : 'PUMPS')
            + ' OF ' + (flavour || 'SYRUP');
          const done = Math.max(0, pumps);
          const left = param - done;
          hint = done === 0
            ? 'tap at the syrup rack ' + param + ' ' + (param === 1 ? 'time' : 'times')
            : 'tap at the syrup rack ' + left + ' more '
              + (left === 1 ? 'time' : 'times') + ' — ' + done + ' of ' + param + ' in';
          break;
        }
        const known = station === 'cupStack' || station === 'grinder'
          || station === 'espresso' || station === 'steamWand' || station === 'superauto'
          || station === 'syrupRack' || station === 'blender' || station === 'iceWell'
          || station === 'sink' || station === 'coldBrewTap' || station === 'handoff';
        station = known ? station : 'handoff';
        label = String(param || station).toUpperCase();
        hint = 'use the ' + station;
        break;
      }
    }

    return Object.freeze({ station, label, hint, index, total, param });
  }

  function computeGuide() {
    const order = orderSource()[0];
    const steps = recipeForOrder(order);
    if (!Array.isArray(steps) || steps.length === 0) return null;

    const pool = new Map();
    const loggedSteps = Array.isArray(cup?.steps) ? cup.steps : [];
    for (let i = 0; i < loggedSteps.length; i += 1) {
      const logged = loggedSteps[i];
      if (!logged || logged.station === 'syrupRack') continue;
      const key = String(logged.station ?? '') + ':' + String(logged.param ?? '');
      pool.set(key, (pool.get(key) ?? 0) + 1);
    }

    let pumps = cup
      ? clamp(Math.round(cup.contents?.syrup), 0, CONFIG.syrup.maxPumps)
      : 0;
    if (portafilter.dosed) {
      pool.set('grinder:grind', (pool.get('grinder:grind') ?? 0) + 1);
    }
    if (pitcher.steamed) {
      pool.set('steamWand:steam', (pool.get('steamWand:steam') ?? 0) + 1);
    }
    if (superautoTime > 0 && superautoCup === cup) {
      pool.set('superauto:shot', (pool.get('superauto:shot') ?? 0) + 1);
    }

    const total = steps.length + 1;
    for (let i = 0; i < steps.length; i += 1) {
      const step = steps[i];
      if (step?.station === 'syrupRack' && Number.isFinite(step.param)) {
        if (pumps >= step.param) {
          pumps -= step.param;
          continue;
        }
        return guideStepPayload(step, order, i + 1, total, pumps);
      }
      const key = String(step?.station ?? '') + ':' + String(step?.param ?? '');
      const available = pool.get(key) ?? 0;
      if (available > 0) {
        pool.set(key, available - 1);
        continue;
      }
      return guideStepPayload(step, order, i + 1, total, pumps);
    }

    return Object.freeze({
      station: 'handoff',
      label: 'SERVE IT',
      hint: 'take it to the handoff counter and tap to hand it over',
      index: total,
      total,
      param: 'serve',
    });
  }

  function sameGuide(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;
    return a.station === b.station && a.label === b.label && a.hint === b.hint
      && a.index === b.index && a.total === b.total && a.param === b.param;
  }

  function syncGuide() {
    try {
      const next = computeGuide();
      if (sameGuide(lastGuide, next)) return;
      emit('guide:step', next);
      lastGuide = next;
    } catch (_error) {
      // Guidance is optional and must never interrupt station controls.
    }
  }

  function syrupTarget() {
    const orders = orderSource();
    if (!orders.length) return -1;
    let order = orders[0];
    if (cup) {
      for (let i = 0; i < orders.length; i += 1) {
        if (orders[i]?.size === cup.size) {
          order = orders[i];
          break;
        }
      }
    }
    const recipe = recipeForOrder(order);
    if (!recipe) return -1;
    for (let i = 0; i < recipe.length; i += 1) {
      const step = recipe[i];
      if (step?.station === 'syrupRack' && Number.isFinite(step.param)) {
        return clamp(step.param, 0, CONFIG.syrup.maxPumps);
      }
    }
    return -1;
  }

  function pumpSyrup() {
    if (!cup) {
      reject('syrupRack', 'No cup');
      return;
    }
    const oldPumps = clamp(Math.round(cup.contents.syrup), 0, CONFIG.syrup.maxPumps);
    const pumps = Math.min(CONFIG.syrup.maxPumps, oldPumps + 1);
    cup.contents.syrup = pumps;
    let syrupStep = null;
    for (let i = 0; i < cup.steps.length; i += 1) {
      if (cup.steps[i]?.station === 'syrupRack') {
        syrupStep = cup.steps[i];
        break;
      }
    }
    if (syrupStep) {
      syrupStep.param = pumps;
      syrupStep.pumps = pumps;
    } else {
      const newSyrupStep = addStep('syrupRack', pumps, 1);
      if (newSyrupStep) newSyrupStep.pumps = pumps;
    }
    recomputeCup();
    emitCupChanged();
    sound('beep', CONFIG.volume.click);
    gesture('tap');
    feedback('syrupRack', true, PUMP_TEXT[pumps]);

    const target = syrupTarget();
    let zone;
    if (target >= 0) {
      syrupZone[0] = target / CONFIG.syrup.maxPumps;
      syrupZone[1] = syrupZone[0];
      zone = syrupZone;
    }
    showMeter(
      'syrup',
      pumps / CONFIG.syrup.maxPumps,
      zone,
      'Syrup',
      trainingOn() && target >= 0
        ? PUMP_TEXT[pumps] + ' · ticket wants ' + target
        : PUMP_TEXT[pumps],
    );
    liveMeter = null;
    meterClearTime = -1;
    syrupHoldTime = CONFIG.syrup.meterHold;
  }

  function beginBlend(elapsed = 0) {
    if (!cup) {
      reject('blender', 'Grab a cup first');
      markIgnoredHold('blender');
      return;
    }
    if (!beginMeter('blender', elapsed)) return;
    sound('blend');
    gesture('shake');
  }

  function finishBlend() {
    const value = liveValue;
    const quality = value >= CONFIG.blend.done
      ? 1 : Math.max(CONFIG.blend.minQuality, value / CONFIG.blend.done);
    if (cup) {
      cup.blended = true;
      addStep('blender', 'blend', quality);
      emitCupChanged();
    }
    liveMeter = null;
    meterClearTime = CONFIG.meterClearDelay;
    lostHoldTime = 0;
    sound(quality === 1 ? 'ding' : 'thunk',
      quality === 1 ? CONFIG.volume.full : CONFIG.volume.low);
    feedback('blender', true, quality === 1 ? 'Blended' : 'Under-blended — chunky');
  }

  function tapIceWell() {
    if (!cup) {
      reject('iceWell', 'Grab a cup first');
      return;
    }
    if (cup.contents.ice >= CONFIG.ice.max) {
      reject('iceWell', 'Full of ice');
      return;
    }
    cup.contents.ice += 1;
    addStep('iceWell', 'ice', 1);
    recomputeCup();
    emitCupChanged();
    gesture('shake');
    sound('pour', CONFIG.volume.ice);
    feedback('iceWell', true, 'Ice');
  }

  function tapSink() {
    if (hand === 'pitcher') {
      resetPitcher();
      hand = cup ? 'cup' : null;
      emitHandItem();
      sound('pour', CONFIG.volume.size);
      feedback('sink', true, 'Rinsed');
      return;
    }
    if (!cup) {
      reject('sink', 'Grab a cup first');
      return;
    }
    cup.contents.water += CONFIG.water.units;
    addStep('sink', 'water', 1);
    recomputeCup();
    emitCupChanged();
    gesture('pour');
    sound('pour');
    feedback('sink', true, 'Hot water');
  }

  function beginWhisk(elapsed = 0) {
    if (!cup) {
      reject('sink', 'Grab a cup first');
      markIgnoredHold('sink');
      return;
    }
    beginMeter('sink', elapsed);
  }

  function finishWhisk() {
    const value = liveValue;
    const quality = value >= CONFIG.whisk.done
      ? 1 : Math.max(0.3, value / CONFIG.whisk.done);
    if (cup) {
      cup.contents.matcha += CONFIG.whisk.matchaUnits;
      addStep('sink', 'whisk', quality);
      recomputeCup();
      emitCupChanged();
    }
    liveMeter = null;
    meterClearTime = CONFIG.meterClearDelay;
    lostHoldTime = 0;
    sound('blend', CONFIG.volume.low);
    gesture('shake');
    feedback('sink', true, quality === 1 ? 'Whisked' : 'Lumpy matcha');
  }

  function beginColdBrew(elapsed = 0) {
    if (!cup) {
      reject('coldBrewTap', 'Grab a cup first');
      markIgnoredHold('coldBrewTap');
      return;
    }
    if (!beginMeter('coldBrewTap', elapsed)) return;
    sound('pour');
    gesture('pour');
  }

  function finishColdBrew() {
    const value = liveValue;
    const quality = value > 1 ? CONFIG.coldBrew.overflowQuality : 1;
    if (cup) {
      cup.contents.coldBrew += value * CONFIG.coldBrew.unitsAtFull;
      addStep('coldBrewTap', 'tap', quality);
      recomputeCup();
      emitCupChanged();
    }
    liveMeter = null;
    meterClearTime = CONFIG.meterClearDelay;
    lostHoldTime = 0;
    sound(value > 1 ? 'thunk' : 'ding', value > 1 ? CONFIG.volume.low : CONFIG.volume.full);
    feedback('coldBrewTap', true, value > 1 ? 'Overflowed!' : 'Cold brew');
  }

  function tapSuperauto() {
    if (!cup) {
      reject('superauto', 'Grab a cup first');
      return;
    }
    if (superautoTime > 0) {
      reject('superauto', 'Grinding…');
      return;
    }
    superautoTime = CONFIG.superauto.seconds;
    superautoCup = cup;
    sound('grind');
  }

  function finishSuperauto() {
    superautoTime = 0;
    if (!superautoCup || cup !== superautoCup) {
      superautoCup = null;
      feedback('superauto', false, 'Shot went in the drip tray');
      return;
    }
    addStep('superauto', 'shot', CONFIG.superauto.quality);
    cup.contents.espresso += CONFIG.superauto.shots;
    recomputeCup();
    emitCupChanged();
    superautoCup = null;
    sound('pour');
    feedback('superauto', true, 'One-touch shot (weak)');
  }

  function beginChai(elapsed = 0) {
    if (!cup) {
      reject('superauto', 'Grab a cup first');
      markIgnoredHold('superauto');
      return;
    }
    if (superautoTime > 0) {
      reject('superauto', 'Grinding…');
      markIgnoredHold('superauto');
      return;
    }
    beginMeter('superauto', elapsed);
  }

  function finishChai() {
    if (cup) {
      cup.contents.chai += CONFIG.chai.units;
      addStep('superauto', 'chai', 1);
      recomputeCup();
      emitCupChanged();
    }
    liveMeter = null;
    meterClearTime = CONFIG.meterClearDelay;
    lostHoldTime = 0;
    sound('pour');
    gesture('pour');
    feedback('superauto', true, 'Chai concentrate');
  }

  function tapTill() {
    sound('beep');
    toast('Order taken', true);
    feedback('till', true, 'Order taken');
  }

  function scoreOrder(order, built) {
    try {
      const result = ctx.orders?.scoreOrder?.(order, built);
      if (!result || typeof result !== 'object') return null;
      return result;
    } catch (_error) {
      return null;
    }
  }

  function sameOrder(a, b) {
    if (a === b) return true;
    return a?.id != null && b?.id != null && a.id === b.id;
  }

  function removePending(order) {
    for (let i = pending.length - 1; i >= 0; i -= 1) {
      if (sameOrder(pending[i], order)) pending.splice(i, 1);
    }
  }

  function drinkName(order) {
    if (typeof order?.drink?.name === 'string' && order.drink.name) return order.drink.name;
    const id = typeof order?.drink === 'string' ? order.drink : order?.drink?.id;
    if (id && Array.isArray(ctx.menu?.DRINKS)) {
      for (let i = 0; i < ctx.menu.DRINKS.length; i += 1) {
        const drink = ctx.menu.DRINKS[i];
        if (drink?.id === id) return drink.name || id;
      }
    }
    return id || 'Drink';
  }

  function tapHandoff() {
    if (!cup) {
      reject('handoff', 'Nothing to hand over');
      return;
    }

    builtPayload.size = cup.size;
    builtPayload.lidded = cup.lidded;
    builtPayload.blended = cup.blended;
    builtPayload.steps = cup.steps;
    builtPayload.contents = cup.contents;
    builtPayload.quality = cup.quality;
    builtPayload.seconds = Math.max(0, now - cup.t0);

    const orders = orderSource();
    classifyBuiltDrink(builtPayload, orders);
    if (!orders.length) {
      gesture('place');
      feedback('handoff', false, 'Nobody ordered that');
      sound('thunk');
      resetAll();
      return;
    }

    let chosen = null;
    let result = null;
    for (let i = 0; i < orders.length; i += 1) {
      const candidateResult = scoreOrder(orders[i], builtPayload);
      if (candidateResult?.correct) {
        chosen = orders[i];
        result = candidateResult;
        break;
      }
    }
    if (!chosen) {
      for (let i = 0; i < orders.length; i += 1) {
        if (orders[i]?.size === builtPayload.size) {
          chosen = orders[i];
          break;
        }
      }
    }
    if (!chosen) chosen = orders[0];
    if (!result) result = scoreOrder(chosen, builtPayload);

    const score = Number.isFinite(result?.score) ? result.score : 0;
    const tip = Number.isFinite(result?.tip) ? result.tip : 0;
    const correct = Boolean(result?.correct);
    const notes = Array.isArray(result?.notes) ? result.notes.slice() : [];
    const tipText = typeof result?.tip_text === 'string' ? result.tip_text : '';
    const name = drinkName(chosen);

    const stepCount = Array.isArray(cup.steps) ? cup.steps.length : 0;
    const steps = new Array(stepCount);
    for (let i = 0; i < stepCount; i += 1) {
      const step = cup.steps[i];
      const servedStep = {
        station: step?.station,
        param: step?.param,
        quality: step?.quality,
      };
      if (typeof step?.foam === 'string') servedStep.foam = step.foam;
      steps[i] = servedStep;
    }

    const contents = {};
    for (let i = 0; i < CONTENT_KEYS.length; i += 1) {
      const key = CONTENT_KEYS[i];
      contents[key] = cup.contents?.[key];
    }

    const built = {
      // A plain id string, never the frozen menu object: orders.js resolves either, and a string
      // cannot be mutated by a consumer or trip its object-branch coercion.
      drink: typeof builtPayload.drink === 'string' && builtPayload.drink
        ? builtPayload.drink : null,
      drinkId: typeof builtPayload.drinkId === 'string' ? builtPayload.drinkId : '',
      size: typeof builtPayload.size === 'string' ? builtPayload.size : '',
      lidded: builtPayload.lidded,
      blended: builtPayload.blended,
      quality: builtPayload.quality,
      seconds: builtPayload.seconds,
      steps,
      contents,
    };
    const served = { order: chosen, score, tip, notes, tip_text: tipText, correct, built };

    removePending(chosen);
    emit('order:served', served);

    sound('coin');
    sound(correct ? 'ding' : 'thunk');
    toast(name + ' · £' + tip.toFixed(2) + ' tip', correct);
    feedback('handoff', correct, correct
      ? name + ' served'
      : (notes[0] || name + ' needed work'));
    gesture('place');
    resetAll();
  }

  function tapDrop() {
    if (hand === 'portafilter') {
      if (liveMeter === 'grinder') cancelLiveMeter(true);
      resetPortafilter();
      shotReady = false;
      shotQuality = 0;
      shotSeconds = 0;
      hand = cup ? 'cup' : null;
      emitHandItem();
      feedback('drop', true, 'Portafilter back');
      sound('thunk');
      return;
    }
    if (hand === 'pitcher') {
      if (liveMeter === 'steamWand') cancelLiveMeter(true);
      resetPitcher();
      hand = cup ? 'cup' : null;
      emitHandItem();
      feedback('drop', true, 'Pitcher back');
      sound('thunk');
      return;
    }
    if (cup) {
      feedback('drop', true, 'Binned it');
      sound('thunk');
      resetAll();
      return;
    }
    sound('thunk', CONFIG.volume.low);
  }

  function handleTap(id) {
    switch (id) {
      case 'cupStack': tapCupStack(); break;
      case 'grinder': reject('grinder', hand === 'portafilter'
        ? portafilter.dosed ? 'Already dosed — lock it in' : 'Hold E to dose'
        : 'Grab the portafilter from the group head'); break;
      case 'espresso': tapEspresso(); break;
      case 'steamWand': tapSteamWand(); break;
      case 'syrupRack': pumpSyrup(); break;
      case 'blender': reject('blender', cup ? 'Hold E to blend' : 'Grab a cup first'); break;
      case 'iceWell': tapIceWell(); break;
      case 'sink': tapSink(); break;
      case 'coldBrewTap': reject('coldBrewTap', cup ? 'Hold E to pour cold brew' : 'Grab a cup first'); break;
      case 'superauto': tapSuperauto(); break;
      case 'till': tapTill(); break;
      case 'handoff': tapHandoff(); break;
      case 'drop': tapDrop(); break;
      case 'lid': lidCup('lid'); break;
      default: reject(id, 'Look at a station and try again'); break;
    }
  }

  function handleHoldStart(id, elapsed = 0) {
    ignoreNextHoldEnd = false;
    ignoredHoldId = null;
    switch (id) {
      case 'cupStack':
      case 'syrupRack':
        break;
      case 'grinder': beginDose(elapsed); break;
      case 'espresso': beginShot(elapsed); break;
      case 'steamWand': beginSteam(elapsed); break;
      case 'blender': beginBlend(elapsed); break;
      case 'coldBrewTap': beginColdBrew(elapsed); break;
      case 'sink': beginWhisk(elapsed); break;
      case 'superauto': beginChai(elapsed); break;
      default:
        reject(id, 'Tap E instead');
        markIgnoredHold(id);
        break;
    }
  }

  function finishLiveMeter() {
    switch (liveMeter) {
      case 'grinder': finishDose(); break;
      case 'espresso': finishShot(); break;
      case 'steamWand': finishSteam(); break;
      case 'blender': finishBlend(); break;
      case 'coldBrewTap': finishColdBrew(); break;
      case 'sink': finishWhisk(); break;
      case 'superauto': finishChai(); break;
      default: liveMeter = null; break;
    }
  }

  function handleHoldEnd(id) {
    if (ignoreNextHoldEnd && ignoredHoldId === (id ?? null)) {
      ignoreNextHoldEnd = false;
      ignoredHoldId = null;
      return;
    }
    if (id === 'cupStack') {
      takeFreshCup();
      return;
    }
    if (id === 'syrupRack') {
      pumpSyrup();
      return;
    }
    if (liveMeter === id) {
      finishLiveMeter();
      return;
    }
    reject(id, 'Try that again');
  }

  function onInteract(payload) {
    try {
      const id = payload?.id ?? null;
      if (payload?.phase === 'tap') handleTap(id);
      else if (payload?.phase === 'holdStart') handleHoldStart(id, payload?.dt);
      else if (payload?.phase === 'holdEnd') handleHoldEnd(id);
      else reject(id, 'Look at a station and try again');
    } catch (_error) {
      reject(payload?.id ?? null, 'Try that again');
    } finally {
      syncGuide();
    }
  }

  function onOrderNew(payload) {
    const order = payload?.order;
    if (order) {
      let exists = false;
      for (let i = 0; i < pending.length; i += 1) {
        if (sameOrder(pending[i], order)) {
          exists = true;
          break;
        }
      }
      if (!exists) pending.push(order);
    }
    syncGuide();
  }

  function onOrderLost(payload) {
    if (payload?.order) removePending(payload.order);
    syncGuide();
  }

  function onOrderServed() {
    syncGuide();
  }

  function subscribe(name, listener) {
    try {
      ctx.bus?.on?.(name, listener);
    } catch (_error) {
      // A partial bus is allowed by the module contract.
    }
  }

  subscribe('interact', onInteract);
  subscribe('order:new', onOrderNew);
  subscribe('order:lost', onOrderLost);
  subscribe('order:served', onOrderServed);

  function rebuildInteractables(list) {
    registeredList = Array.isArray(list) ? list : null;
    registeredLength = registeredList ? registeredList.length : 0;
    interactableMap.clear();
    if (!registeredList) return;
    for (let i = 0; i < registeredList.length; i += 1) {
      const entry = registeredList[i];
      if (entry && typeof entry.id === 'string') interactableMap.set(entry.id, entry);
    }
  }

  function setHint(id, text) {
    const entry = interactableMap.get(id);
    if (entry && entry.hint !== text) entry.hint = text;
  }

  function refreshHints() {
    setHint('cupStack', hand === 'cup' && cup && contentsTotal() > 0 && !cup.lidded
      ? HINT.cupLid : SIZE_HINTS[selectedSizeIndex]);
    setHint('grinder', hand !== 'portafilter'
      ? HINT.grinderTake : portafilter.dosed ? HINT.grinderDosed : HINT.grinderDose);

    let espressoHint;
    if (shotReady) espressoHint = cup ? HINT.espressoPour : HINT.espressoCup;
    else if (hand === 'portafilter') {
      espressoHint = portafilter.dosed ? HINT.espressoLock : HINT.espressoDose;
    } else if (portafilter.locked) espressoHint = HINT.espressoPull;
    else espressoHint = HINT.espressoTake;
    setHint('espresso', espressoHint);

    let steamHint;
    if (hand === 'pitcher' && pitcher.steamed) steamHint = cup ? HINT.steamPour : HINT.steamCup;
    else if (hand === 'pitcher' && cup?.contents?.ice > 0) steamHint = HINT.steamCold;
    else if (hand === 'pitcher') steamHint = FOAM_HINTS[selectedFoamIndex];
    else steamHint = HINT.steamTake;
    setHint('steamWand', steamHint);

    const pumps = cup ? clamp(Math.round(cup.contents.syrup), 0, CONFIG.syrup.maxPumps) : 0;
    setHint('syrupRack', SYRUP_HINTS[pumps]);
    setHint('blender', HINT.blender);
    setHint('iceWell', HINT.ice);
    setHint('sink', hand === 'pitcher' ? HINT.rinse : HINT.water);
    setHint('coldBrewTap', HINT.coldBrew);
    setHint('superauto', superautoTime > 0 ? HINT.grinding : HINT.superauto);
    setHint('till', HINT.till);
    setHint('handoff', cup ? HINT.handoff : HINT.emptyHandoff);
  }

  function advanceLiveMeter(dt) {
    liveElapsed += dt;
    switch (liveMeter) {
      case 'grinder':
        liveValue = Math.min(CONFIG.dose.max, liveElapsed / CONFIG.dose.seconds);
        showMeter(
          'dose',
          liveValue / CONFIG.dose.max,
          DOSE_METER_ZONE,
          'Dose',
          trainingOn() ? 'Release in the green band' : 'Release in the green',
        );
        break;
      case 'espresso':
        liveValue = Math.min(
          CONFIG.shot.simSeconds,
          liveElapsed / CONFIG.shot.realSeconds * CONFIG.shot.simSeconds,
        );
        showMeter(
          'shot',
          liveValue / CONFIG.shot.simSeconds,
          CONFIG.shot.zone,
          'Extraction',
          trainingOn()
            ? liveValue.toFixed(1) + 's · release at ' + CONFIG.shot.zoneSeconds[0]
              + '-' + CONFIG.shot.zoneSeconds[1] + 's'
            : liveValue.toFixed(1) + 's',
        );
        break;
      case 'steamWand':
        liveValue = Math.min(
          CONFIG.steam.to,
          CONFIG.steam.from + liveElapsed / CONFIG.steam.seconds
            * (CONFIG.steam.to - CONFIG.steam.from),
        );
        pitcher.temp = liveValue;
        showMeter(
          'steam',
          (liveValue - CONFIG.steam.from) / (CONFIG.steam.to - CONFIG.steam.from),
          CONFIG.steam.zone,
          'Milk',
          trainingOn()
            ? Math.round(liveValue) + '°C · release at ' + CONFIG.steam.zoneTemp[0]
              + '-' + CONFIG.steam.zoneTemp[1] + '°C'
            : Math.round(liveValue) + 'C',
        );
        emitHandItem();
        break;
      case 'blender':
        liveValue = Math.min(1, liveElapsed / CONFIG.blend.seconds);
        showMeter(
          'blend',
          liveValue,
          BLEND_METER_ZONE,
          'Blend',
          trainingOn() ? 'Hold until the bar is full' : 'Keep holding',
        );
        break;
      case 'coldBrewTap':
        liveValue = Math.min(CONFIG.coldBrew.max, liveElapsed / CONFIG.coldBrew.seconds);
        showMeter(
          'pour',
          liveValue / CONFIG.coldBrew.max,
          COLD_BREW_METER_ZONE,
          'Cold brew',
          trainingOn() ? 'Release before the bar tops out' : 'Keep holding',
        );
        break;
      default:
        break;
    }
  }

  function update(dt) {
    const frameDt = Number.isFinite(dt) && dt > 0 ? dt : 0;
    now += frameDt;

    const source = Array.isArray(ctx.interactables) ? ctx.interactables : null;
    const sourceLength = source ? source.length : 0;
    if (source !== registeredList || sourceLength !== registeredLength) rebuildInteractables(source);

    if (superautoTime > 0) {
      superautoTime -= frameDt;
      if (superautoTime <= 0) finishSuperauto();
    }

    if (liveMeter !== null) {
      let holdingKnown = false;
      let isHolding = true;
      if (typeof ctx.player?.isHolding === 'function') {
        holdingKnown = true;
        try {
          isHolding = Boolean(ctx.player.isHolding());
        } catch (_error) {
          holdingKnown = false;
        }
      }
      if (holdingKnown && isHolding) sawHold = true;
      if (holdingKnown && !isHolding && sawHold) {
        lostHoldTime += frameDt;
        if (lostHoldTime > CONFIG.lostHoldGrace) {
          const finishedId = liveMeter;
          finishLiveMeter();
          markIgnoredHold(finishedId);
        }
      } else {
        lostHoldTime = 0;
        advanceLiveMeter(frameDt);
      }
    } else if (syrupHoldTime > 0) {
      syrupHoldTime -= frameDt;
      if (syrupHoldTime <= 0) clearMeterDisplay();
    } else if (meterClearTime >= 0) {
      meterClearTime -= frameDt;
      if (meterClearTime <= 0) {
        meterClearTime = -1;
        clearMeterDisplay();
      }
    }

    hintTime -= frameDt;
    if (hintTime <= 0) {
      hintTime = CONFIG.hintInterval;
      refreshHints();
      syncGuide();
    }
  }

  function register(interactables) {
    rebuildInteractables(interactables);
    refreshHints();
    syncGuide();
    hintTime = CONFIG.hintInterval;
  }

  return { update, register };
}
