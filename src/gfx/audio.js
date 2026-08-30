const MAX_VOICES = 12;
const MIN_GAIN = 0.0001;
const GESTURE_EVENTS = ['pointerdown', 'mousedown', 'keydown', 'touchstart'];

const SOUND = Object.freeze({
  grind:    { send: 0.12, vol: 0.55, duration: 1.25, loopable: true },
  steam:    { send: 0.10, vol: 0.45, duration: 3.25, loopable: true },
  pour:     { send: 0.18, vol: 0.50, duration: 0.90 },
  beep:     { send: 0.05, vol: 0.35, duration: 0.07 },
  thunk:    { send: 0.04, vol: 0.60, duration: 0.17 },
  ding:     { send: 0.38, vol: 0.50, duration: 1.10 },
  blend:    { send: 0.08, vol: 0.60, duration: 1.85, loopable: true },
  chime:    { send: 0.45, vol: 0.40, duration: 1.40 },
  pa:       { send: 0.50, vol: 0.30, duration: 3.20 },
  crowd:    { send: 0.16, vol: 0.10, duration: Infinity, loopable: true, loopOnly: true },
  coin:     { send: 0.30, vol: 0.40, duration: 0.35 },
  pageturn: { send: 0.12, vol: 0.35, duration: 0.20 },
});

let context = null;
let graph = null;
let storedBus = null;
let initialized = false;
let busSubscribed = false;
let gestureListening = false;
let visibilityListening = false;
let voiceSerial = 0;
let ambienceWanted = false;
let ambienceExplicit = false;
let ambienceHandle = null;
let ambienceTimer = null;
let paStep = 0;

const voices = [];
const unknownWarnings = new Set();

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

function inertHandle(name, id) {
  const handle = {
    id: id == null ? `silent-${++voiceSerial}` : String(id),
    name: typeof name === 'string' ? name : '',
    playing: false,
    stop() {
      try { handle.playing = false; } catch (_) { /* silent fallback */ }
    },
    setVol() {
      try { return handle; } catch (_) { return handle; }
    },
  };
  return handle;
}

function warnUnknown(name) {
  try {
    const key = String(name);
    if (unknownWarnings.has(key)) return;
    unknownWarnings.add(key);
    if (typeof console !== 'undefined' && typeof console.warn === 'function') {
      console.warn(`[audio] Unknown sound: ${key}`);
    }
  } catch (_) { /* warnings must never affect the game */ }
}

function makeNoiseBuffer(audioContext, brown) {
  const length = Math.max(1, Math.floor(audioContext.sampleRate * 2));
  const buffer = audioContext.createBuffer(2, length, audioContext.sampleRate);

  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      if (brown) {
        last = last * 0.985 + white * 0.055;
        data[i] = clamp(last * 2.7, -1, 1);
      } else {
        data[i] = white;
      }
    }
  }
  return buffer;
}

function makeImpulse(audioContext) {
  const preDelay = Math.floor(audioContext.sampleRate * 0.012);
  const length = Math.max(preDelay + 1, Math.floor(audioContext.sampleRate * 1.4));
  const impulse = audioContext.createBuffer(2, length, audioContext.sampleRate);

  for (let channel = 0; channel < 2; channel += 1) {
    const data = impulse.getChannelData(channel);
    let low = 0;
    for (let i = preDelay; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      low += 0.18 * (white - low);
      const high = white - low;
      const progress = (i - preDelay) / Math.max(1, length - preDelay - 1);
      const tail = Math.pow(1 - progress, 2.2) * Math.exp(-1.35 * progress);
      data[i] = (white * 0.58 + high * 0.52) * tail * (channel ? 0.92 : 1);
    }
  }
  return impulse;
}

function buildGraph(audioContext) {
  const bus = audioContext.createGain();
  const compressor = audioContext.createDynamicsCompressor();
  const masterGain = audioContext.createGain();
  const convolver = audioContext.createConvolver();
  const reverbGain = audioContext.createGain();
  const now = audioContext.currentTime;

  compressor.threshold.setValueAtTime(-14, now);
  compressor.knee.setValueAtTime(12, now);
  compressor.ratio.setValueAtTime(6, now);
  compressor.attack.setValueAtTime(0.004, now);
  compressor.release.setValueAtTime(0.18, now);
  masterGain.gain.setValueAtTime(0.85, now);
  reverbGain.gain.setValueAtTime(0.22, now);
  convolver.buffer = makeImpulse(audioContext);

  bus.connect(compressor);
  compressor.connect(masterGain);
  masterGain.connect(audioContext.destination);
  convolver.connect(reverbGain);
  reverbGain.connect(bus);

  return {
    bus,
    compressor,
    masterGain,
    convolver,
    reverbGain,
    whiteNoise: makeNoiseBuffer(audioContext, false),
    brownNoise: makeNoiseBuffer(audioContext, true),
  };
}

function removeGestureListeners() {
  try {
    if (!gestureListening || typeof window === 'undefined') return;
    for (const eventName of GESTURE_EVENTS) {
      window.removeEventListener(eventName, unlockFromGesture, true);
    }
    gestureListening = false;
  } catch (_) { /* absent DOM is a supported silent mode */ }
}

function flushRememberedAudio() {
  try {
    if (ambienceWanted) {
      startAmbienceLoop();
      ensureAmbienceTimer();
    }
  } catch (_) { /* audio remains optional */ }
}

function resumeContext() {
  try {
    if (!context || typeof context.resume !== 'function') return;
    const pending = context.resume();
    if (pending && typeof pending.then === 'function') {
      pending.then(flushRememberedAudio).catch(() => {});
    } else {
      flushRememberedAudio();
    }
  } catch (_) { /* browsers may reject resume outside a gesture */ }
}

function unlockFromGesture() {
  try {
    removeGestureListeners();
    if (!context) {
      if (typeof window === 'undefined') return;
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (typeof AudioContextCtor !== 'function') return;

      const candidate = Reflect.construct(AudioContextCtor, []);
      try {
        const candidateGraph = buildGraph(candidate);
        context = candidate;
        graph = candidateGraph;
      } catch (_) {
        try {
          const closing = candidate.close();
          if (closing && typeof closing.catch === 'function') closing.catch(() => {});
        } catch (_) { /* ignore failed cleanup */ }
        return;
      }
    }
    resumeContext();
    if (!ambienceExplicit) ambienceWanted = true;
    flushRememberedAudio();
  } catch (_) { /* unsupported audio is a silent no-op */ }
}

function onVisibilityChange() {
  try {
    if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
    if (context && context.state === 'suspended') resumeContext();
  } catch (_) { /* absent DOM is a supported silent mode */ }
}

function registerLifecycleListeners() {
  try {
    if (!gestureListening && !context && typeof window !== 'undefined') {
      gestureListening = true;
      for (const eventName of GESTURE_EVENTS) {
        window.addEventListener(eventName, unlockFromGesture, { once: true, capture: true });
      }
    }
  } catch (_) { gestureListening = false; }

  try {
    if (!visibilityListening && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
      visibilityListening = true;
    }
  } catch (_) { visibilityListening = false; }
}

function subscribeToBus(bus) {
  try {
    if (busSubscribed || !bus || typeof bus.on !== 'function') return;
    busSubscribed = true;

    const listen = (eventName, callback) => {
      try { bus.on(eventName, callback); } catch (_) { /* optional bus */ }
    };

    listen('sfx', (payload) => {
      try { play(payload?.name, payload); } catch (_) { /* bus listeners stay safe */ }
    });
    listen('station:feedback', (payload) => {
      try {
        if (typeof payload?.ok === 'boolean') play(payload.ok ? 'ding' : 'thunk', { vol: 0.7 });
      } catch (_) { /* malformed payload */ }
    });
    listen('order:served', () => {
      try { play('coin'); } catch (_) { /* silent fallback */ }
    });
    listen('rush', () => {
      try { play('pa'); } catch (_) { /* silent fallback */ }
    });
    listen('order:lost', () => {
      try { play('thunk', { vol: 0.85 }); } catch (_) { /* silent fallback */ }
    });
    listen('shift:start', () => {
      try { setAmbience(true); } catch (_) { /* silent fallback */ }
    });
    listen('shift:end', () => {
      try { setAmbience(false); } catch (_) { /* silent fallback */ }
    });
  } catch (_) { /* missing or partial bus is supported */ }
}

function disconnectNodes(nodes) {
  try {
    for (const node of nodes || []) {
      try { node.disconnect(); } catch (_) { /* already disconnected */ }
    }
  } catch (_) { /* cleanup must be best effort */ }
}

function removeVoice(voice) {
  try {
    const index = voices.indexOf(voice);
    if (index >= 0) voices.splice(index, 1);
  } catch (_) { /* registry cleanup is best effort */ }
}

function teardownVoice(voice) {
  try {
    if (!voice || voice.ended) return;
    voice.ended = true;
    voice.playing = false;
    if (voice.handle) voice.handle.playing = false;
    removeVoice(voice);

    if (voice.timer != null) {
      try { clearTimeout(voice.timer); } catch (_) { /* timer already gone */ }
      voice.timer = null;
    }
    if (voice.endSource) {
      try { voice.endSource.onended = null; } catch (_) { /* source already collected */ }
    }
    for (const source of voice.sources || []) {
      try { source.onended = null; } catch (_) { /* not an event source */ }
      try { source.stop(); } catch (_) { /* it may already have ended */ }
    }
    disconnectNodes(voice.nodes);
  } catch (_) { /* teardown must never escape */ }
}

function stopVoice(voice, fadeSeconds = 0.06) {
  try {
    if (!voice || voice.stopping || voice.ended) return;
    voice.stopping = true;
    voice.playing = false;
    if (voice.handle) voice.handle.playing = false;
    removeVoice(voice);

    const fade = clamp(finiteNumber(fadeSeconds, 0.06), 0.01, 2);
    const now = context ? context.currentTime : 0;
    try {
      const gainParam = voice.gain.gain;
      const current = Math.max(MIN_GAIN, finiteNumber(gainParam.value, MIN_GAIN));
      gainParam.cancelScheduledValues(now);
      gainParam.setValueAtTime(current, now);
      gainParam.exponentialRampToValueAtTime(MIN_GAIN, now + fade);
    } catch (_) { /* a disconnected gain is harmless */ }

    if (voice.endSource) {
      try { voice.endSource.onended = null; } catch (_) { /* source already ended */ }
    }
    for (const source of voice.sources || []) {
      try { source.stop(now + fade + 0.005); } catch (_) { /* already stopped */ }
    }

    try {
      voice.timer = setTimeout(() => {
        try { teardownVoice(voice); } catch (_) { /* silent cleanup */ }
      }, Math.ceil((fade + 0.03) * 1000));
    } catch (_) {
      teardownVoice(voice);
    }
  } catch (_) { /* stop handles are deliberately indestructible */ }
}

function makeRecipeContext(audioContext, output, startAt, rate, loop, duration) {
  const nodes = [];
  const sources = [];

  const track = (node) => {
    nodes.push(node);
    return node;
  };

  const gain = (value = 1) => {
    const node = track(audioContext.createGain());
    node.gain.setValueAtTime(Math.max(MIN_GAIN, value), startAt);
    return node;
  };

  const filter = (type, frequency, q = 0.0001) => {
    const node = track(audioContext.createBiquadFilter());
    node.type = type;
    node.frequency.setValueAtTime(Math.max(10, frequency), startAt);
    node.Q.setValueAtTime(Math.max(0.0001, q), startAt);
    return node;
  };

  const oscillator = (type, frequency, delay = 0, length = null, scalePitch = true) => {
    const node = track(audioContext.createOscillator());
    node.type = type;
    node.frequency.setValueAtTime(Math.max(1, frequency * (scalePitch ? rate : 1)), startAt + delay);
    node.start(startAt + delay);
    if (length != null) node.stop(startAt + delay + length);
    sources.push(node);
    return node;
  };

  const noise = (kind = 'white', delay = 0, length = null) => {
    const node = track(audioContext.createBufferSource());
    node.buffer = kind === 'brown' ? graph.brownNoise : graph.whiteNoise;
    node.loop = true;
    node.playbackRate.setValueAtTime(rate, startAt + delay);
    const offset = Math.random() * 1.75;
    node.start(startAt + delay, offset);
    if (length != null) node.stop(startAt + delay + length);
    sources.push(node);
    return node;
  };

  return {
    ac: audioContext,
    output,
    startAt,
    rate,
    loop,
    duration,
    nodes,
    sources,
    gain,
    filter,
    oscillator,
    noise,
    track,
    connect(from, to) { from.connect(to); return to; },
  };
}

function shapeEnvelope(param, startAt, attack, level, duration, release, loop) {
  param.setValueAtTime(MIN_GAIN, startAt);
  param.exponentialRampToValueAtTime(Math.max(MIN_GAIN, level), startAt + attack);
  if (!loop) {
    const releaseAt = Math.max(startAt + attack, startAt + duration - release);
    param.setValueAtTime(Math.max(MIN_GAIN, level), releaseAt);
    param.exponentialRampToValueAtTime(MIN_GAIN, startAt + duration);
  }
}

function buildChimeTones(c, target, scale = 1) {
  const lowpass = c.filter('lowpass', 3000, 0.7);
  lowpass.connect(target);

  const firstGain = c.gain(MIN_GAIN);
  const first = c.oscillator('triangle', 1046.5, 0, 0.78);
  first.connect(firstGain);
  firstGain.connect(lowpass);
  firstGain.gain.setValueAtTime(MIN_GAIN, c.startAt);
  firstGain.gain.exponentialRampToValueAtTime(0.42 * scale, c.startAt + 0.03);
  firstGain.gain.setValueAtTime(0.34 * scale, c.startAt + 0.34);
  firstGain.gain.exponentialRampToValueAtTime(MIN_GAIN, c.startAt + 0.78);

  const secondGain = c.gain(MIN_GAIN);
  const second = c.oscillator('triangle', 784, 0.30, 1.10);
  second.connect(secondGain);
  secondGain.connect(lowpass);
  secondGain.gain.setValueAtTime(MIN_GAIN, c.startAt + 0.30);
  secondGain.gain.exponentialRampToValueAtTime(0.46 * scale, c.startAt + 0.33);
  secondGain.gain.setValueAtTime(0.32 * scale, c.startAt + 0.80);
  secondGain.gain.exponentialRampToValueAtTime(MIN_GAIN, c.startAt + 1.40);
  return second;
}

const RECIPES = {
  // Gritty, mid-heavy conical burr grinder.
  grind(c) {
    const sawLength = c.loop ? null : c.duration;
    const sawA = c.oscillator('sawtooth', 84, 0, sawLength);
    const sawB = c.oscillator('sawtooth', 127, 0, sawLength);
    sawB.detune.setValueAtTime(7, c.startAt);
    const sawAGain = c.gain(0.31);
    const sawBGain = c.gain(0.25);
    const lowpass = c.filter('lowpass', 900, 6);
    sawA.connect(sawAGain).connect(lowpass);
    sawB.connect(sawBGain).connect(lowpass);

    const grit = c.noise('white', 0, sawLength);
    const bandpass = c.filter('bandpass', 1600, 1.2);
    const gritGain = c.gain(0.38);
    grit.connect(bandpass).connect(gritGain);

    const jitter = c.gain(0.73);
    lowpass.connect(jitter);
    gritGain.connect(jitter);
    const lfoA = c.oscillator('sine', 7, 0, sawLength, false);
    const lfoAGain = c.gain(0.18);
    lfoA.connect(lfoAGain).connect(jitter.gain);
    const lfoB = c.oscillator('sine', 23, 0, sawLength, false);
    const lfoBGain = c.gain(0.07);
    lfoB.connect(lfoBGain).connect(jitter.gain);

    const amp = c.gain(MIN_GAIN);
    jitter.connect(amp).connect(c.output);
    shapeEnvelope(amp.gain, c.startAt, 0.04, 0.92, c.duration, 0.09, c.loop);
    return { nodes: c.nodes, gain: c.output, duration: c.duration, loop: c.loop, endSource: sawA };
  },

  // Rising steam hiss with a faint resonant metal-pitcher rumble.
  steam(c) {
    const length = c.loop ? null : c.duration;
    const hiss = c.noise('white', 0, length);
    const highpass = c.filter('highpass', 1200, 0.7);
    const whistle = c.filter('peaking', 2400, 8);
    whistle.gain.setValueAtTime(14, c.startAt);
    whistle.frequency.exponentialRampToValueAtTime(4200, c.startAt + 3);
    hiss.connect(highpass).connect(whistle);

    const rumble = c.oscillator('sine', 400, 0, length);
    const rumbleFilter = c.filter('lowpass', 620, 4);
    const rumbleGain = c.gain(0.065);
    rumble.connect(rumbleFilter).connect(rumbleGain);

    const amp = c.gain(MIN_GAIN);
    whistle.connect(amp);
    rumbleGain.connect(amp);
    amp.connect(c.output);
    shapeEnvelope(amp.gain, c.startAt, 0.25, 0.82, c.duration, 0.16, c.loop);
    return { nodes: c.nodes, gain: c.output, duration: c.duration, loop: c.loop, endSource: hiss };
  },

  // A short stream of liquid falling into a cup.
  pour(c) {
    const stream = c.noise('white', 0, c.duration);
    const bandpass = c.filter('bandpass', 900, 1.6);
    bandpass.frequency.exponentialRampToValueAtTime(340, c.startAt + c.duration);
    const wobble = c.oscillator('sine', 9, 0, c.duration, false);
    const wobbleDepth = c.gain(48);
    wobble.connect(wobbleDepth).connect(bandpass.frequency);
    const amp = c.gain(MIN_GAIN);
    stream.connect(bandpass).connect(amp).connect(c.output);
    amp.gain.setValueAtTime(MIN_GAIN, c.startAt);
    amp.gain.exponentialRampToValueAtTime(0.76, c.startAt + 0.018);
    amp.gain.setValueAtTime(0.70, c.startAt + 0.70);
    amp.gain.exponentialRampToValueAtTime(MIN_GAIN, c.startAt + c.duration);
    return { nodes: c.nodes, gain: c.output, duration: c.duration, loop: false, endSource: stream };
  },

  // Clean, brief till confirmation beep.
  beep(c) {
    const amp = c.gain(MIN_GAIN);
    amp.connect(c.output);
    const fundamental = c.oscillator('sine', 1900, 0, c.duration);
    const harmonic = c.oscillator('sine', 3800, 0, c.duration);
    const harmonicGain = c.gain(0.25);
    fundamental.connect(amp);
    harmonic.connect(harmonicGain).connect(amp);
    amp.gain.setValueAtTime(MIN_GAIN, c.startAt);
    amp.gain.exponentialRampToValueAtTime(0.82, c.startAt + 0.004);
    amp.gain.exponentialRampToValueAtTime(MIN_GAIN, c.startAt + c.duration);
    return { nodes: c.nodes, gain: c.output, duration: c.duration, loop: false, endSource: fundamental };
  },

  // Dull low impact for an invalid action.
  thunk(c) {
    const tone = c.oscillator('sine', 120, 0, c.duration);
    tone.frequency.exponentialRampToValueAtTime(58 * c.rate, c.startAt + 0.09);
    const toneGain = c.gain(MIN_GAIN);
    tone.connect(toneGain).connect(c.output);
    toneGain.gain.setValueAtTime(MIN_GAIN, c.startAt);
    toneGain.gain.exponentialRampToValueAtTime(0.90, c.startAt + 0.003);
    toneGain.gain.exponentialRampToValueAtTime(MIN_GAIN, c.startAt + c.duration);

    const click = c.noise('white', 0, 0.025);
    const lowpass = c.filter('lowpass', 700, 0.7);
    const clickGain = c.gain(MIN_GAIN);
    click.connect(lowpass).connect(clickGain).connect(c.output);
    clickGain.gain.setValueAtTime(0.34, c.startAt);
    clickGain.gain.exponentialRampToValueAtTime(MIN_GAIN, c.startAt + 0.025);
    return { nodes: c.nodes, gain: c.output, duration: c.duration, loop: false, endSource: tone };
  },

  // Bright three-part service bell that rings into the hall.
  ding(c) {
    const frequencies = [1568, 2349, 1568 * 3.11];
    const levels = [0.74, 0.38, 0.18];
    const decays = [1.10, 0.76, 0.48];
    let endSource = null;
    for (let i = 0; i < frequencies.length; i += 1) {
      const source = c.oscillator('sine', frequencies[i], 0, decays[i]);
      const partialGain = c.gain(MIN_GAIN);
      source.connect(partialGain).connect(c.output);
      partialGain.gain.setValueAtTime(MIN_GAIN, c.startAt);
      partialGain.gain.exponentialRampToValueAtTime(levels[i], c.startAt + 0.003 + i * 0.001);
      partialGain.gain.exponentialRampToValueAtTime(MIN_GAIN, c.startAt + decays[i]);
      if (i === 0) endSource = source;
    }
    return { nodes: c.nodes, gain: c.output, duration: c.duration, loop: false, endSource };
  },

  // Smooth, loud blender motor with spin-up and vibrato.
  blend(c) {
    const length = c.loop ? null : c.duration;
    const motorA = c.oscillator('sawtooth', 62, 0, length);
    const motorB = c.oscillator('sawtooth', 93, 0, length);
    motorA.frequency.exponentialRampToValueAtTime(62 * 1.18 * c.rate, c.startAt + 0.25);
    motorB.frequency.exponentialRampToValueAtTime(93 * 1.18 * c.rate, c.startAt + 0.25);
    const vibrato = c.oscillator('sine', 5.5, 0, length, false);
    const vibratoDepth = c.gain(3 * c.rate);
    vibrato.connect(vibratoDepth);
    vibratoDepth.connect(motorA.frequency);
    vibratoDepth.connect(motorB.frequency);

    const motorGainA = c.gain(0.34);
    const motorGainB = c.gain(0.28);
    const lowpass = c.filter('lowpass', 520, 3);
    motorA.connect(motorGainA).connect(lowpass);
    motorB.connect(motorGainB).connect(lowpass);

    const air = c.noise('white', 0, length);
    const bandpass = c.filter('bandpass', 2000, 0.8);
    const airGain = c.gain(0.30);
    air.connect(bandpass).connect(airGain);

    const amp = c.gain(MIN_GAIN);
    lowpass.connect(amp);
    airGain.connect(amp);
    amp.connect(c.output);
    shapeEnvelope(amp.gain, c.startAt, 0.12, 0.92, c.duration, 0.12, c.loop);
    return { nodes: c.nodes, gain: c.output, duration: c.duration, loop: c.loop, endSource: motorA };
  },

  // Soft descending two-tone airport announcement chime.
  chime(c) {
    const endSource = buildChimeTones(c, c.output, 1);
    return { nodes: c.nodes, gain: c.output, duration: c.duration, loop: false, endSource };
  },

  // PA chime followed by distant, non-verbal speech-like murmur.
  pa(c) {
    buildChimeTones(c, c.output, 0.72);
    const speechDelay = 0.90;
    const speechLength = c.duration - speechDelay;
    const speech = c.noise('white', speechDelay, speechLength);
    const bandpass = c.filter('bandpass', 700, 2);
    const lowpass = c.filter('lowpass', 1600, 0.8);
    speech.connect(bandpass).connect(lowpass);

    const pulse = c.gain(0.56);
    lowpass.connect(pulse);
    const syllables = c.oscillator('sine', 5.5, speechDelay, speechLength, false);
    const syllableDepth = c.gain(0.34);
    syllables.connect(syllableDepth).connect(pulse.gain);
    const phrases = c.oscillator('sine', 1.3, speechDelay, speechLength, false);
    const phraseDepth = c.gain(0.17);
    phrases.connect(phraseDepth).connect(pulse.gain);

    const speechGain = c.gain(MIN_GAIN);
    pulse.connect(speechGain).connect(c.output);
    speechGain.gain.setValueAtTime(MIN_GAIN, c.startAt + speechDelay);
    speechGain.gain.exponentialRampToValueAtTime(0.68, c.startAt + speechDelay + 0.20);
    speechGain.gain.setValueAtTime(0.62, c.startAt + c.duration - 0.40);
    speechGain.gain.exponentialRampToValueAtTime(MIN_GAIN, c.startAt + c.duration);
    return { nodes: c.nodes, gain: c.output, duration: c.duration, loop: false, endSource: speech };
  },

  // Low, slowly breathing airport crowd murmur.
  crowd(c) {
    const brown = c.noise('brown');
    const white = c.noise('white');
    const lowpass = c.filter('lowpass', 900, 0.7);
    const bandpass = c.filter('bandpass', 420, 1.1);
    const brownGain = c.gain(0.66);
    const voiceGain = c.gain(0.24);
    brown.connect(lowpass).connect(brownGain);
    white.connect(bandpass).connect(voiceGain);

    const breathing = c.gain(0.64);
    brownGain.connect(breathing);
    voiceGain.connect(breathing);
    const driftA = c.oscillator('sine', 0.07, 0, null, false);
    const driftAGain = c.gain(0.11);
    driftA.connect(driftAGain).connect(breathing.gain);
    const driftB = c.oscillator('sine', 0.13, 0, null, false);
    const driftBGain = c.gain(0.055);
    driftB.connect(driftBGain).connect(breathing.gain);

    const fadeIn = c.gain(MIN_GAIN);
    breathing.connect(fadeIn).connect(c.output);
    fadeIn.gain.setValueAtTime(MIN_GAIN, c.startAt);
    fadeIn.gain.exponentialRampToValueAtTime(0.70, c.startAt + 0.75);
    return { nodes: c.nodes, gain: c.output, duration: Infinity, loop: true, endSource: null };
  },

  // Two quick metallic tip tones with a tiny high sparkle.
  coin(c) {
    const first = c.oscillator('sine', 2100, 0, 0.26);
    const firstGain = c.gain(MIN_GAIN);
    first.connect(firstGain).connect(c.output);
    firstGain.gain.setValueAtTime(MIN_GAIN, c.startAt);
    firstGain.gain.exponentialRampToValueAtTime(0.68, c.startAt + 0.003);
    firstGain.gain.exponentialRampToValueAtTime(MIN_GAIN, c.startAt + 0.26);

    const secondDelay = 0.045;
    const second = c.oscillator('sine', 2800 * 1.04, secondDelay, c.duration - secondDelay);
    const secondGain = c.gain(MIN_GAIN);
    second.connect(secondGain).connect(c.output);
    secondGain.gain.setValueAtTime(MIN_GAIN, c.startAt + secondDelay);
    secondGain.gain.exponentialRampToValueAtTime(0.50, c.startAt + secondDelay + 0.003);
    secondGain.gain.exponentialRampToValueAtTime(MIN_GAIN, c.startAt + c.duration);

    const sparkle = c.noise('white', secondDelay, 0.10);
    const sparkleFilter = c.filter('bandpass', 3000, 3);
    const sparkleGain = c.gain(MIN_GAIN);
    sparkle.connect(sparkleFilter).connect(sparkleGain).connect(c.output);
    sparkleGain.gain.setValueAtTime(0.055, c.startAt + secondDelay);
    sparkleGain.gain.exponentialRampToValueAtTime(MIN_GAIN, c.startAt + secondDelay + 0.10);
    return { nodes: c.nodes, gain: c.output, duration: c.duration, loop: false, endSource: second };
  },

  // Crisp paper ticket or page flick with a tiny leading tick.
  pageturn(c) {
    const paper = c.noise('white', 0, c.duration);
    const highpass = c.filter('highpass', 2000, 0.7);
    highpass.frequency.exponentialRampToValueAtTime(5000, c.startAt + 0.18);
    const paperGain = c.gain(MIN_GAIN);
    paper.connect(highpass).connect(paperGain).connect(c.output);
    paperGain.gain.setValueAtTime(MIN_GAIN, c.startAt);
    paperGain.gain.exponentialRampToValueAtTime(0.58, c.startAt + 0.006);
    paperGain.gain.exponentialRampToValueAtTime(MIN_GAIN, c.startAt + 0.18);

    const tick = c.oscillator('sine', 1200, 0, 0.025);
    const tickGain = c.gain(MIN_GAIN);
    tick.connect(tickGain).connect(c.output);
    tickGain.gain.setValueAtTime(0.16, c.startAt);
    tickGain.gain.exponentialRampToValueAtTime(MIN_GAIN, c.startAt + 0.025);
    return { nodes: c.nodes, gain: c.output, duration: c.duration, loop: false, endSource: paper };
  },
};

function existingVoiceById(id) {
  try {
    if (id == null) return null;
    const key = String(id);
    return voices.find((voice) => voice.id === key && voice.playing && !voice.ended) || null;
  } catch (_) {
    return null;
  }
}

function retriggerVoiceByName(name, meta, now) {
  try {
    for (let index = voices.length - 1; index >= 0; index -= 1) {
      const voice = voices[index];
      if (voice.name !== name || !voice.playing || voice.ended) continue;
      if (meta.loopable) return voice;
      const elapsed = now - voice.startedAt;
      if (elapsed >= 0 && elapsed < 0.045) return voice;
    }
    return null;
  } catch (_) {
    return null;
  }
}

function reserveVoiceSlot(loop) {
  try {
    if (voices.length < MAX_VOICES) return 0;
    if (loop) return null;
    let oldest = null;
    for (const voice of voices) {
      if (voice.loop || !voice.playing) continue;
      if (!oldest || voice.startedAt < oldest.startedAt) oldest = voice;
    }
    if (!oldest) return null;
    stopVoice(oldest, 0.06);
    return voices.length < MAX_VOICES ? 0.065 : null;
  } catch (_) {
    return null;
  }
}

function internalPlay(name, opts) {
  const soundName = typeof name === 'string' ? name : String(name);
  const options = opts && typeof opts === 'object' ? opts : {};
  const requestedId = options.id == null ? null : String(options.id);
  const existing = existingVoiceById(requestedId);
  if (existing) return existing.handle;

  const known = Object.prototype.hasOwnProperty.call(SOUND, soundName)
    && Object.prototype.hasOwnProperty.call(RECIPES, soundName);
  const meta = known ? SOUND[soundName] : null;
  const recipe = known ? RECIPES[soundName] : null;
  if (!meta || typeof recipe !== 'function') {
    warnUnknown(soundName);
    return inertHandle(soundName, requestedId);
  }
  if (context && context.state !== 'running') {
    resumeContext();
    return inertHandle(soundName, requestedId);
  }
  if (!context || !graph) return inertHandle(soundName, requestedId);

  const now = context.currentTime;
  if (requestedId == null) {
    const retrigger = retriggerVoiceByName(soundName, meta, now);
    if (retrigger) return retrigger.handle;
  }

  const loop = meta.loopOnly ? true : Boolean(meta.loopable && options.loop === true);
  const slotDelay = reserveVoiceSlot(loop);
  if (slotDelay == null) return inertHandle(soundName, requestedId);

  const id = requestedId == null ? `voice-${++voiceSerial}` : requestedId;
  const rateSpecified = Object.prototype.hasOwnProperty.call(options, 'rate')
    && options.rate != null;
  const variableRate = !rateSpecified && !meta.loopable && soundName !== 'chime' && soundName !== 'pa';
  const defaultRate = variableRate ? 1 + (Math.random() * 2 - 1) * 0.03 : 1;
  const rate = clamp(rateSpecified ? finiteNumber(options.rate, 1) : defaultRate, 0.25, 4);
  const volumeScale = clamp(finiteNumber(options.vol, 1), 0, 4);
  const volume = Math.max(MIN_GAIN, meta.vol * volumeScale);
  const requestedWhen = finiteNumber(options.when, now);
  const startAt = Math.max(now + slotDelay, requestedWhen);
  const created = [];
  let cookbook = null;

  try {
    const voiceGain = context.createGain();
    const dryGain = context.createGain();
    const sendGain = context.createGain();
    created.push(voiceGain, dryGain, sendGain);
    voiceGain.gain.setValueAtTime(volume, now);
    dryGain.gain.setValueAtTime(1, now);
    sendGain.gain.setValueAtTime(meta.send, now);
    voiceGain.connect(dryGain);
    dryGain.connect(graph.bus);
    voiceGain.connect(sendGain);
    sendGain.connect(graph.convolver);

    cookbook = makeRecipeContext(context, voiceGain, startAt, rate, loop, meta.duration);
    const result = recipe(cookbook) || {};
    const allNodes = [...new Set([...cookbook.nodes, ...created, ...(result.nodes || [])])];
    const allSources = [...new Set(cookbook.sources)];
    const voice = {
      id,
      name: soundName,
      nodes: allNodes,
      sources: allSources,
      gain: voiceGain,
      loop,
      startedAt: startAt,
      playing: true,
      stopping: false,
      ended: false,
      timer: null,
      endSource: result.endSource || null,
      handle: null,
      stop() { try { stopVoice(voice, 0.06); } catch (_) { /* silent stop */ } },
    };

    const handle = {
      id,
      name: soundName,
      playing: true,
      stop() {
        try { voice.stop(); } catch (_) { handle.playing = false; }
      },
      setVol(value) {
        try {
          if (!voice.playing || voice.ended || !context) return handle;
          const scale = clamp(finiteNumber(value, 1), 0, 4);
          const target = Math.max(MIN_GAIN, meta.vol * scale);
          const at = context.currentTime;
          voiceGain.gain.cancelScheduledValues(at);
          voiceGain.gain.setTargetAtTime(target, at, 0.02);
        } catch (_) { /* disconnected voices ignore volume changes */ }
        return handle;
      },
    };
    voice.handle = handle;
    voices.push(voice);

    if (!loop) {
      if (voice.endSource) {
        voice.endSource.onended = () => {
          try { teardownVoice(voice); } catch (_) { /* silent cleanup */ }
        };
      }
      const waitSeconds = Math.max(0, startAt - now) + meta.duration + 0.12;
      voice.timer = setTimeout(() => {
        try { teardownVoice(voice); } catch (_) { /* silent cleanup */ }
      }, Math.ceil(waitSeconds * 1000));
    }
    return handle;
  } catch (_) {
    for (const source of cookbook?.sources || []) {
      try { source.stop(); } catch (_) { /* source may not have started */ }
    }
    disconnectNodes(cookbook?.nodes);
    disconnectNodes(created);
    return inertHandle(soundName, requestedId || id);
  }
}

function startAmbienceLoop() {
  try {
    if (!ambienceWanted || !context || !graph) return;
    if (ambienceHandle && ambienceHandle.playing) return;
    ambienceHandle = play('crowd', { id: 'ambience-crowd', loop: true, vol: 1 });
  } catch (_) { /* ambience remains optional */ }
}

function clearAmbienceTimer() {
  try {
    if (ambienceTimer != null) clearTimeout(ambienceTimer);
    ambienceTimer = null;
  } catch (_) { ambienceTimer = null; }
}

function ensureAmbienceTimer() {
  try {
    if (!ambienceWanted || ambienceTimer != null || typeof window === 'undefined') return;
    const delay = 25000 + Math.random() * 15000;
    ambienceTimer = setTimeout(() => {
      try {
        ambienceTimer = null;
        if (!ambienceWanted) return;
        if (context && graph && context.state === 'running') {
          const soundName = paStep % 3 === 2 ? 'pa' : 'chime';
          paStep += 1;
          play(soundName, { vol: soundName === 'chime' ? 0.875 : 1 });
        }
        ensureAmbienceTimer();
      } catch (_) {
        ambienceTimer = null;
        if (ambienceWanted) ensureAmbienceTimer();
      }
    }, delay);
  } catch (_) { ambienceTimer = null; }
}

export function initAudio(ctx) {
  try {
    if (ctx && ctx.bus) storedBus = ctx.bus;
    if (!initialized) {
      initialized = true;
      registerLifecycleListeners();
    }
    if (storedBus && !busSubscribed) subscribeToBus(storedBus);
  } catch (_) { /* Node, SSR, and restricted browsers stay silent */ }
}

export function play(name, opts) {
  let safeName = '';
  try {
    safeName = typeof name === 'string' ? name : String(name);
    return internalPlay(safeName, opts);
  } catch (_) {
    return inertHandle(safeName, null);
  }
}

export function setAmbience(on) {
  try {
    ambienceExplicit = true;
    const enabled = Boolean(on);
    if (enabled) {
      if (ambienceWanted) {
        startAmbienceLoop();
        ensureAmbienceTimer();
        return;
      }
      ambienceWanted = true;
      startAmbienceLoop();
      ensureAmbienceTimer();
      return;
    }

    ambienceWanted = false;
    clearAmbienceTimer();
    const crowdVoice = existingVoiceById('ambience-crowd');
    if (crowdVoice) stopVoice(crowdVoice, 0.60);
    ambienceHandle = null;
  } catch (_) { /* ambience controls are safe no-ops */ }
}

export function isReady() {
  try {
    return Boolean(context && context.state === 'running');
  } catch (_) {
    return false;
  }
}
