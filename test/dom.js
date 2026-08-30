// Minimal DOM/browser stubs so the game modules can be imported and driven in node.
function noopFn() { return undefined; }
function makeCtx2d() {
  const c = {
    canvas: null, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1,
    font: '10px sans-serif', textAlign: 'left', textBaseline: 'alphabetic', lineCap: 'butt',
    lineJoin: 'miter', globalCompositeOperation: 'source-over', shadowBlur: 0, shadowColor: '#000',
    filter: 'none', imageSmoothingEnabled: true, miterLimit: 10, lineDashOffset: 0,
  };
  const grad = { addColorStop: noopFn };
  const methods = ['fillRect','clearRect','strokeRect','beginPath','closePath','moveTo','lineTo',
    'arc','arcTo','ellipse','rect','fill','stroke','save','restore','translate','rotate','scale',
    'transform','setTransform','resetTransform','clip','fillText','strokeText','drawImage',
    'quadraticCurveTo','bezierCurveTo','setLineDash','getLineDash','putImageData','roundRect'];
  for (const m of methods) c[m] = noopFn;
  c.createLinearGradient = () => grad;
  c.createRadialGradient = () => grad;
  c.createConicGradient = () => grad;
  c.createPattern = () => ({ setTransform: noopFn });
  c.measureText = (t) => ({ width: String(t).length * 6, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 });
  c.getImageData = (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h });
  c.createImageData = (w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h });
  return c;
}
function makeElement(tag) {
  const listeners = new Map();
  const el = {
    tagName: String(tag).toUpperCase(), nodeType: 1, style: {}, dataset: {},
    className: '', id: '', innerHTML: '', textContent: '', children: [], parentNode: null,
    width: 512, height: 512, clientWidth: 1600, clientHeight: 900,
    ownerDocument: null,
    addEventListener(n, f) { if (!listeners.has(n)) listeners.set(n, new Set()); listeners.get(n).add(f); },
    removeEventListener(n, f) { listeners.get(n)?.delete(f); },
    dispatchEvent(e) { for (const f of listeners.get(e.type) || []) f(e); return true; },
    appendChild(c) { el.children.push(c); c.parentNode = el; return c; },
    removeChild(c) { const i = el.children.indexOf(c); if (i >= 0) el.children.splice(i, 1); return c; },
    setAttribute: noopFn, removeAttribute: noopFn, getAttribute: () => null,
    querySelector: () => null, querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1600, height: 900, right: 1600, bottom: 900, x: 0, y: 0 }),
    getContext: (kind) => (kind === '2d' ? makeCtx2d() : null),
    toDataURL: () => 'data:image/png;base64,',
    requestPointerLock() { globalThis.document.pointerLockElement = el; return Promise.resolve(); },
    focus: noopFn, blur: noopFn, remove: noopFn, insertBefore: (c) => el.appendChild(c),
    classList: { add: noopFn, remove: noopFn, toggle: noopFn, contains: () => false },
    _listeners: listeners,
  };
  el.ownerDocument = globalThis.document;
  return el;
}
export function installDom() {
  const docListeners = new Map();
  const body = makeElement('body');
  const doc = {
    hidden: false, pointerLockElement: null, body, documentElement: makeElement('html'),
    head: makeElement('head'),
    createElement: (t) => makeElement(t),
    createElementNS: (ns, t) => makeElement(t),
    createTextNode: (t) => ({ nodeType: 3, textContent: t }),
    getElementById: () => makeElement('div'),
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener(n, f) { if (!docListeners.has(n)) docListeners.set(n, new Set()); docListeners.get(n).add(f); },
    removeEventListener(n, f) { docListeners.get(n)?.delete(f); },
    dispatchEvent(e) { for (const f of docListeners.get(e.type) || []) f(e); return true; },
    exitPointerLock() { doc.pointerLockElement = null; doc.dispatchEvent({ type: 'pointerlockchange' }); },
    _listeners: docListeners,
  };
  globalThis.document = doc;
  const winListeners = new Map();
  const win = {
    innerWidth: 1600, innerHeight: 900, devicePixelRatio: 2, document: doc,
    addEventListener(n, f) { if (!winListeners.has(n)) winListeners.set(n, new Set()); winListeners.get(n).add(f); },
    removeEventListener(n, f) { winListeners.get(n)?.delete(f); },
    dispatchEvent(e) { for (const f of winListeners.get(e.type) || []) f(e); return true; },
    requestAnimationFrame: (f) => setTimeout(() => f(performance.now()), 16),
    cancelAnimationFrame: (id) => clearTimeout(id),
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    matchMedia: () => ({ matches: false, addEventListener: noopFn, removeEventListener: noopFn }),
    location: { search: '', href: 'http://localhost/' },
    _listeners: winListeners,
  };
  globalThis.window = win;
  globalThis.self = win;
  if (!globalThis.navigator) { try { Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node', platform: 'node' }, configurable: true }); } catch {} }
  globalThis.addEventListener = win.addEventListener;
  globalThis.removeEventListener = win.removeEventListener;
  globalThis.devicePixelRatio = 2;
  globalThis.innerWidth = 1600; globalThis.innerHeight = 900;
  globalThis.HTMLCanvasElement = function () {};
  globalThis.OffscreenCanvas = function (w, h) { const e = makeElement('canvas'); e.width = w; e.height = h; return e; };
  globalThis.ImageData = function (w, h) { return { data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }; };
  globalThis.Image = function () { return makeElement('img'); };
  globalThis.createImageBitmap = () => Promise.resolve(makeElement('img'));
  return { doc, win, makeElement };
}
