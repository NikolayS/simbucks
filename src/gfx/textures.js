import * as THREE from 'three';

const cache = new Map();
const tiling = new Set([
  'floorTile', 'oakSlat', 'worktop', 'noise', 'ceilingPanel', 'beans',
  'cupSleeve', 'apronPatch',
]);

function makeCanvas(w, h) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

function reg(name, w, h, drawFn) {
  if (cache.has(name)) return cache.get(name);
  const canvas = makeCanvas(w, h);
  let texture;
  if (canvas) {
    const g = canvas.getContext('2d');
    drawFn(g, w, h);
    texture = new THREE.CanvasTexture(canvas);
  } else {
    texture = new THREE.Texture();
  }
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  texture.wrapS = texture.wrapT = tiling.has(name)
    ? THREE.RepeatWrapping
    : THREE.ClampToEdgeWrapping;
  cache.set(name, texture);
  return texture;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function seededRandom() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function imod(n, m) {
  return ((n % m) + m) % m;
}

function lattice(x, y, seed, period) {
  const ix = period ? imod(x, period) : x;
  const iy = period ? imod(y, period) : y;
  let n = Math.imul(ix, 0x1f123bb5) ^ Math.imul(iy, 0x5f356495) ^ seed;
  n = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d);
  n = Math.imul(n ^ (n >>> 12), 0x297a2d39);
  return ((n ^ (n >>> 15)) >>> 0) / 4294967295;
}

function valueNoise2D(x, y, seed, period = 0) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx0 = x - x0;
  const ty0 = y - y0;
  const tx = tx0 * tx0 * (3 - 2 * tx0);
  const ty = ty0 * ty0 * (3 - 2 * ty0);
  const a = lattice(x0, y0, seed, period);
  const b = lattice(x0 + 1, y0, seed, period);
  const c = lattice(x0, y0 + 1, seed, period);
  const d = lattice(x0 + 1, y0 + 1, seed, period);
  const ab = a + (b - a) * tx;
  const cd = c + (d - c) * tx;
  return ab + (cd - ab) * ty;
}

function fbm(x, y, seed, octaves = 4, period = 8) {
  let value = 0;
  let weight = 0;
  let amplitude = 1;
  let frequency = 1;
  for (let i = 0; i < octaves; i += 1) {
    value += valueNoise2D(x * frequency, y * frequency, seed + i * 1013, period * frequency) * amplitude;
    weight += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value / weight;
}

function roundRect(g, x, y, w, h, r) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.lineTo(x + w - rr, y);
  g.quadraticCurveTo(x + w, y, x + w, y + rr);
  g.lineTo(x + w, y + h - rr);
  g.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  g.lineTo(x + rr, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - rr);
  g.lineTo(x, y + rr);
  g.quadraticCurveTo(x, y, x + rr, y);
  g.closePath();
}

function hairline(g, x0, y0, x1, y1, color, w = 1) {
  g.save();
  g.strokeStyle = color;
  g.lineWidth = w;
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
  g.restore();
}

function vgrad(g, x, y, w, h, c0, c1) {
  const gradient = g.createLinearGradient(x, y, x, y + h);
  gradient.addColorStop(0, c0);
  gradient.addColorStop(1, c1);
  g.fillStyle = gradient;
  g.fillRect(x, y, w, h);
}

function fontSize(fontSpec) {
  const match = fontSpec.match(/([0-9.]+)px/);
  return match ? Number(match[1]) : 16;
}

function resizedFont(fontSpec, size) {
  return fontSpec.replace(/[0-9.]+px/, `${size}px`);
}

function textFit(g, text, x, y, maxW, fontSpec) {
  let size = fontSize(fontSpec);
  g.font = fontSpec;
  while (size > 8 && g.measureText(text).width > maxW) {
    size -= 1;
    g.font = resizedFont(fontSpec, size);
  }
  g.fillText(text, x, y);
  return g.measureText(text).width;
}

function trackedWidth(g, text, tracking) {
  let width = 0;
  for (let i = 0; i < text.length; i += 1) {
    width += g.measureText(text[i]).width;
    if (i < text.length - 1) width += tracking;
  }
  return width;
}

function trackedText(g, text, x, y, tracking) {
  let cursor = x;
  for (let i = 0; i < text.length; i += 1) {
    g.fillText(text[i], cursor, y);
    cursor += g.measureText(text[i]).width + tracking;
  }
  return cursor - x - tracking;
}

function smallCaps(g, text, x, y, size, color, tracking) {
  g.save();
  g.textAlign = 'left';
  g.fillStyle = color;
  g.font = `700 ${size}px "Avenir Next","Helvetica Neue",Helvetica,Arial,sans-serif`;
  trackedText(g, text.toUpperCase(), x, y, tracking);
  g.restore();
}

function fivePointStar(g, cx, cy, outer, inner, points = 5) {
  g.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const radius = i % 2 ? inner : outer;
    const angle = -Math.PI / 2 + i * Math.PI / points;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
}

function sixPointStar(g, cx, cy, radius) {
  g.beginPath();
  for (let i = 0; i < 12; i += 1) {
    const r = i % 2 ? radius * 0.42 : radius;
    const a = -Math.PI / 2 + i * Math.PI / 6;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
  g.fill();
}

function leaf(g, x, y, len, wid, rot, fill, veinColor) {
  const colors = Array.isArray(fill) ? fill : [fill, fill];
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.fillStyle = colors[0];
  g.beginPath();
  g.moveTo(-len / 2, 0);
  g.quadraticCurveTo(-len * 0.08, -wid, len / 2, 0);
  g.lineTo(-len / 2, 0);
  g.closePath();
  g.fill();
  g.fillStyle = colors[1];
  g.beginPath();
  g.moveTo(-len / 2, 0);
  g.lineTo(len / 2, 0);
  g.quadraticCurveTo(-len * 0.08, wid, -len / 2, 0);
  g.closePath();
  g.fill();
  g.save();
  g.beginPath();
  g.moveTo(-len / 2, 0);
  g.quadraticCurveTo(-len * 0.08, -wid, len / 2, 0);
  g.quadraticCurveTo(-len * 0.08, wid, -len / 2, 0);
  g.closePath();
  g.clip();
  g.strokeStyle = veinColor;
  g.lineCap = 'round';
  g.lineWidth = 2.6;
  g.beginPath();
  g.moveTo(-len * 0.46, 1);
  g.quadraticCurveTo(0, -2, len * 0.43, 0);
  g.stroke();
  g.lineWidth = 1.5;
  for (let i = 0; i < 4; i += 1) {
    const vx = -len * 0.25 + i * len * 0.16;
    const reach = wid * (0.58 - Math.abs(i - 1.5) * 0.07);
    g.beginPath();
    g.moveTo(vx, 0);
    g.quadraticCurveTo(vx + len * 0.08, -reach * 0.65, vx + len * 0.19, -reach);
    g.stroke();
    g.beginPath();
    g.moveTo(vx, 1);
    g.quadraticCurveTo(vx + len * 0.08, reach * 0.65, vx + len * 0.19, reach);
    g.stroke();
  }
  g.restore();
  g.restore();
}

function darker(hex, factor = 0.88) {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * factor);
  const g = Math.round(((n >> 8) & 255) * factor);
  const b = Math.round((n & 255) * factor);
  return `rgb(${r},${g},${b})`;
}

function cherry(g, x, y, r, fill) {
  g.fillStyle = fill;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = darker(fill, 0.88);
  g.beginPath();
  g.arc(x + r * 0.2, y + r * 0.2, r * 0.48, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = fill;
  g.beginPath();
  g.arc(x + r * 0.03, y + r * 0.03, r * 0.48, 0, Math.PI * 2);
  g.fill();
}

function cubicPoint(curve, t) {
  const mt = 1 - t;
  return {
    x: mt ** 3 * curve[0] + 3 * mt ** 2 * t * curve[2] + 3 * mt * t ** 2 * curve[4] + t ** 3 * curve[6],
    y: mt ** 3 * curve[1] + 3 * mt ** 2 * t * curve[3] + 3 * mt * t ** 2 * curve[5] + t ** 3 * curve[7],
  };
}

function cubicTangent(curve, t) {
  const mt = 1 - t;
  return {
    x: 3 * mt ** 2 * (curve[2] - curve[0]) + 6 * mt * t * (curve[4] - curve[2]) + 3 * t ** 2 * (curve[6] - curve[4]),
    y: 3 * mt ** 2 * (curve[3] - curve[1]) + 6 * mt * t * (curve[5] - curve[3]) + 3 * t ** 2 * (curve[7] - curve[5]),
  };
}

function dotWrapped(g, x, y, r, w, h, draw) {
  const xs = [x];
  const ys = [y];
  if (x < r) xs.push(x + w);
  if (x > w - r) xs.push(x - w);
  if (y < r) ys.push(y + h);
  if (y > h - r) ys.push(y - h);
  for (const xx of xs) for (const yy of ys) draw(xx, yy);
}

function drawFloorTile(g, w, h) {
  const image = g.createImageData(w, h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const n = (fbm((x / (w - 1)) * 8, (y / (h - 1)) * 8, 0x71A9, 4, 8) - 0.5) * 12;
      const i = (y * w + x) * 4;
      image.data[i] = 216 + n;
      image.data[i + 1] = 207 + n;
      image.data[i + 2] = 192 + n;
      image.data[i + 3] = 255;
    }
  }
  g.putImageData(image, 0, 0);
  g.strokeStyle = 'rgba(245,240,230,0.16)';
  g.lineWidth = 1.2;
  for (let i = 0; i < 5; i += 1) {
    const baseY = 54 + i * 93;
    g.beginPath();
    for (let x = 0; x <= w; x += 8) {
      const y = baseY + Math.sin((x / w) * Math.PI * 4 + i * 0.83) * 9;
      if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }
  g.fillStyle = '#C2B9A9';
  g.fillRect(254.5, 0, 3, h);
  g.fillRect(0, 254.5, w, 3);
  g.fillRect(0, 0, 1.5, h);
  g.fillRect(w - 1.5, 0, 1.5, h);
  g.fillRect(0, 0, w, 1.5);
  g.fillRect(0, h - 1.5, w, 1.5);
}

function drawOakSlat(g, w, h) {
  const rng = mulberry32(0x0A651A7);
  g.fillStyle = '#C8A57B';
  g.fillRect(0, 0, w, h);
  const pitch = w / 6;
  g.fillStyle = '#8B6E48';
  for (let i = 0; i < 6; i += 1) {
    const x = i * pitch;
    g.fillRect(x - 2, 0, 4, h);
  }
  g.fillRect(w - 2, 0, 2, h);
  for (let i = 0; i < 145; i += 1) {
    const baseX = rng() * w;
    const phase = rng() * Math.PI * 2;
    const amp = 0.8 + rng() * 3.2;
    const cycles = 1 + Math.floor(rng() * 3);
    g.strokeStyle = `rgba(130,95,55,${0.07 + rng() * 0.13})`;
    g.lineWidth = 0.5 + rng() * 0.8;
    for (const shift of [-w, 0, w]) {
      g.beginPath();
      for (let y = 0; y <= h; y += 8) {
        const x = baseX + shift + Math.sin((y / h) * Math.PI * 2 * cycles + phase) * amp;
        if (y === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  g.strokeStyle = 'rgba(91,59,31,0.24)';
  g.lineWidth = 1.4;
  for (let i = 0; i < 12; i += 1) {
    const cx = rng() * w;
    const cy = 55 + rng() * 390;
    const spread = 5 + rng() * 12;
    for (const shift of [-w, 0, w]) {
      g.beginPath();
      g.moveTo(cx + shift, cy - 55);
      g.bezierCurveTo(cx + shift - spread, cy - 22, cx + shift - spread, cy + 22, cx + shift, cy + 55);
      g.bezierCurveTo(cx + shift + spread, cy + 22, cx + shift + spread, cy - 22, cx + shift, cy - 55);
      g.stroke();
    }
  }
}

function drawWorktop(g, w, h) {
  const rng = mulberry32(0xC0A90517);
  const image = g.createImageData(w, h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const n = (fbm((x / (w - 1)) * 6, (y / (h - 1)) * 6, 0xED018, 3, 6) - 0.5) * 5;
      const i = (y * w + x) * 4;
      image.data[i] = 237 + n;
      image.data[i + 1] = 232 + n;
      image.data[i + 2] = 224 + n;
      image.data[i + 3] = 255;
    }
  }
  g.putImageData(image, 0, 0);
  const colors = ['rgba(112,112,108,0.28)', 'rgba(176,142,104,0.26)', 'rgba(69,65,61,0.32)'];
  for (let i = 0; i < 3600; i += 1) {
    const x = rng() * w;
    const y = rng() * h;
    const r = i < 3450 ? 0.35 + rng() * 0.75 : 1 + rng() * 1.5;
    g.fillStyle = colors[Math.floor(rng() * colors.length)];
    dotWrapped(g, x, y, r, w, h, (xx, yy) => {
      g.beginPath();
      g.arc(xx, yy, r, 0, Math.PI * 2);
      g.fill();
    });
  }
}

function drawMural(g, w, h) {
  const rng = mulberry32(0xB07A91C);
  vgrad(g, 0, 0, w, h, '#F2A65A', '#E8814B');
  const curves = [
    [24, 1092, -20, 820, 170, 410, 400, 70],
    [170, 1080, 92, 780, 330, 420, 170, -65],
    [355, 1090, 500, 800, 300, 350, 500, -70],
    [570, 1085, 470, 760, 780, 410, 680, -55],
    [748, 1090, 1110, 760, 1090, 260, 800, 410],
    [1014, 1090, 930, 800, 760, 510, 620, 150],
  ];
  g.strokeStyle = '#2F5F3A';
  g.lineCap = 'round';
  const stemWidths = [5, 8, 11, 7, 10, 6];
  for (let i = 0; i < curves.length; i += 1) {
    const c = curves[i];
    g.lineWidth = stemWidths[i];
    g.beginPath();
    g.moveTo(c[0], c[1]);
    g.bezierCurveTo(c[2], c[3], c[4], c[5], c[6], c[7]);
    g.stroke();
  }
  const greens = ['#3E7C4A', '#7FB069'];
  let leafIndex = 0;
  const nodeTs = [0.05, 0.11, 0.18, 0.27, 0.38, 0.52, 0.69, 0.87];
  for (let b = 0; b < curves.length; b += 1) {
    for (let i = 0; i < nodeTs.length; i += 1) {
      const t = nodeTs[i] + (rng() - 0.5) * 0.024;
      const p = cubicPoint(curves[b], t);
      const tangent = cubicTangent(curves[b], t);
      const stemAngle = Math.atan2(tangent.y, tangent.x);
      const lower = p.y > h * 0.66;
      const upper = p.y < h * 0.34;
      const sides = lower
        ? [-1, 1, (i + b) % 2 ? -0.55 : 0.55]
        : upper ? [(i + b) % 2 ? -1 : 1] : [-1, 1];
      const heightScale = 0.78 + Math.max(0, Math.min(1, p.y / h)) * 0.4;
      for (const side of sides) {
        const len = (100 + rng() * 45) * heightScale;
        const wid = (32 + rng() * 15) * heightScale;
        let angle = stemAngle + side * (1.0 + rng() * 0.48) + (rng() - 0.5) * 0.18;
        if (rng() < 0.2) angle += Math.PI;
        const cx = p.x + Math.cos(angle) * len * 0.46;
        const cy = p.y + Math.sin(angle) * len * 0.46;
        const base = greens[Math.floor(rng() * greens.length)];
        const fill = leafIndex % 5 === 2 ? [base, '#8E2F5B'] : base;
        leaf(g, cx, cy, len, wid, angle, fill, '#2F5F3A');
        leafIndex += 1;
      }
    }
  }
  const patchLeaves = [
    [92, 165, 150, 48, -0.35, '#3E7C4A'],
    [176, 248, 136, 43, 0.52, '#7FB069'],
    [900, 478, 156, 50, -0.68, '#3E7C4A'],
    [954, 565, 142, 46, 0.55, '#7FB069'],
  ];
  for (const [x, y, len, wid, rot, fill] of patchLeaves) {
    leaf(g, x, y, len, wid, rot, fill, '#2F5F3A');
  }
  const clusterColors = ['#9B2C55', '#C0392B', '#E0A526'];
  for (let i = 0; i < 8; i += 1) {
    const curve = curves[i % curves.length];
    const t = 0.16 + (i % 4) * 0.18 + rng() * 0.08;
    const p = cubicPoint(curve, t);
    const tangent = cubicTangent(curve, t);
    const angle = Math.atan2(tangent.y, tangent.x) + (i % 2 ? 1 : -1) * Math.PI / 2;
    const pedicelLength = 21 + rng() * 7;
    const cx = p.x + Math.cos(angle) * pedicelLength;
    const cy = p.y + Math.sin(angle) * pedicelLength;
    const nx = -Math.sin(angle);
    const ny = Math.cos(angle);
    g.fillStyle = '#2F5F3A';
    g.beginPath();
    g.moveTo(p.x + nx * 3.5, p.y + ny * 3.5);
    g.lineTo(p.x - nx * 3.5, p.y - ny * 3.5);
    g.lineTo(cx, cy);
    g.closePath();
    g.fill();
    const count = 3 + Math.floor(rng() * 4);
    const baseR = 16 + rng() * 10;
    for (let j = 0; j < count; j += 1) {
      const a = j * Math.PI * 2 / count + (i % 3) * 0.27;
      const distance = j === 0 ? 0 : baseR * (0.9 + rng() * 0.45);
      const r = baseR * 1.3 * (j === 0 ? 1 : 0.82 + rng() * 0.28);
      cherry(g, cx + Math.cos(a) * distance, cy + Math.sin(a) * distance, r, clusterColors[(i + j) % 3]);
    }
  }
}

function drawRoundel(g, w, h) {
  g.clearRect(0, 0, w, h);
  const cx = 256;
  const cy = 256;
  g.fillStyle = '#00704A';
  g.beginPath();
  g.arc(cx, cy, 240, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#FFFFFF';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = 8;
  g.beginPath();
  g.arc(cx, cy, 208, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 2;
  g.beginPath();
  g.arc(cx, cy, 196, 0, Math.PI * 2);
  g.stroke();

  const mirror = ([x, y]) => [cx * 2 - x, y];

  const tailStart = [196, 384];
  const tailCurves = [
    [[120, 372], [86, 318], [96, 252]],
    [[104, 220], [128, 206], [150, 214]],
    [[154, 234], [158, 280], [140, 318]],
    [[162, 350], [184, 370], tailStart],
  ];
  const drawTail = (reflect) => {
    const point = reflect ? mirror : (value) => value;
    g.beginPath();
    g.moveTo(...point(tailStart));
    for (const [c1, c2, end] of tailCurves) {
      g.bezierCurveTo(...point(c1), ...point(c2), ...point(end));
    }
    g.closePath();
    g.fill();
  };
  g.fillStyle = '#FFFFFF';
  drawTail(false);
  drawTail(true);

  const tailCrescents = [
    [
      [125, 323],
      [[124, 313], [124, 299], [127, 291]],
      [[126, 301], [127, 313], [130, 321]],
      [[128, 323], [127, 324], [125, 323]],
    ],
    [
      [115, 264],
      [[115, 253], [116, 239], [121, 232]],
      [[119, 241], [119, 253], [121, 263]],
      [[119, 264], [117, 265], [115, 264]],
    ],
  ];
  const drawTailCrescent = (crescent, reflect) => {
    const point = reflect ? mirror : (value) => value;
    const [start, ...curves] = crescent;
    g.beginPath();
    g.moveTo(...point(start));
    for (const [c1, c2, end] of curves) {
      g.bezierCurveTo(...point(c1), ...point(c2), ...point(end));
    }
    g.closePath();
    g.fill();
  };
  g.fillStyle = '#00704A';
  for (const crescent of tailCrescents) {
    drawTailCrescent(crescent, false);
    drawTailCrescent(crescent, true);
  }

  // A compact bell keeps the lower silhouette unified instead of reading as legs.
  const bodyStart = [232, 272];
  const bodyLeft = [
    [[228, 288], [226, 309], [226, 329]],
    [[226, 351], [216, 372], [198, 388]],
    [[214, 397], [235, 402], [256, 402]],
  ];
  g.fillStyle = '#FFFFFF';
  g.beginPath();
  g.moveTo(...bodyStart);
  for (const [c1, c2, end] of bodyLeft) {
    g.bezierCurveTo(...c1, ...c2, ...end);
  }
  for (let i = bodyLeft.length - 1; i >= 0; i -= 1) {
    const [c1, c2] = bodyLeft[i];
    const end = mirror(i === 0 ? bodyStart : bodyLeft[i - 1][2]);
    g.bezierCurveTo(...mirror(c2), ...mirror(c1), ...end);
  }
  g.closePath();
  g.fill();

  const drawArm = (reflect) => {
    const point = reflect ? mirror : (value) => value;
    g.beginPath();
    g.moveTo(...point([236, 286]));
    g.bezierCurveTo(...point([206, 258]), ...point([176, 214]), ...point([156, 182]));
    g.lineTo(...point([172, 196]));
    g.bezierCurveTo(...point([215, 222]), ...point([243, 267]), ...point([252, 296]));
    g.closePath();
    g.fill();
    g.beginPath();
    g.arc(...point([152, 176]), 18, 0, Math.PI * 2);
    g.fill();
  };
  drawArm(false);
  drawArm(true);

  const crownLeft = [
    [200, 178], [206, 158], [222, 172], [236, 148], [250, 166], [256, 132],
  ];
  const crown = crownLeft.concat(crownLeft.slice(0, -1).reverse().map(mirror));
  g.beginPath();
  g.moveTo(...crown[0]);
  for (let i = 1; i < crown.length; i += 1) {
    g.lineTo(...crown[i]);
  }
  g.closePath();
  g.fill();

  g.beginPath();
  g.arc(cx, 226, 46, 0, Math.PI * 2);
  g.fill();

  sixPointStar(g, cx, 118, 18);

  g.fillStyle = '#00704A';
  const leftEye = [240, 220];
  g.beginPath();
  g.arc(...leftEye, 6, 0, Math.PI * 2);
  g.arc(...mirror(leftEye), 6, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#00704A';
  g.lineWidth = 5;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(cx, 228, 20, 0.18 * Math.PI, 0.82 * Math.PI);
  g.stroke();
}

function drawFasciaWordmark(g, w, h) {
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#FFFFFF';
  const left = 'SIM';
  const right = 'BUCKS';
  let size = 132;
  let tracking = 23;
  let starGap = 34;
  let starRadius = size * 0.36;
  let total = 0;
  for (let pass = 0; pass < 2; pass += 1) {
    g.font = `900 ${size}px "Futura","Avenir Next","Helvetica Neue",Helvetica,Arial,sans-serif`;
    total = trackedWidth(g, left, tracking) + trackedWidth(g, right, tracking) + starRadius * 2 + starGap * 2;
    const k = Math.min(1, (w * 0.92) / total);
    if (k === 1) break;
    size *= k;
    tracking *= k;
    starGap *= k;
    starRadius *= k;
  }
  g.font = `900 ${size}px "Futura","Avenir Next","Helvetica Neue",Helvetica,Arial,sans-serif`;
  total = trackedWidth(g, left, tracking) + trackedWidth(g, right, tracking) + starRadius * 2 + starGap * 2;
  let x = (w - total) / 2;
  g.textBaseline = 'alphabetic';
  const letterMetrics = g.measureText(`${left}${right}`);
  const capAscent = letterMetrics.actualBoundingBoxAscent;
  const capDescent = letterMetrics.actualBoundingBoxDescent;
  const capTop = h / 2 - (capAscent + capDescent) / 2;
  const baseline = capTop + capAscent;
  const capMidline = capTop + (capAscent + capDescent) / 2;
  x += trackedText(g, left, x, baseline, tracking) + starGap;
  sixPointStar(g, x + starRadius, capMidline, starRadius);
  x += starRadius * 2 + starGap;
  trackedText(g, right, x, baseline, tracking);
}

const menuA = [
  ['ESPRESSO', [['Espresso', '2.15'], ['Doppio', '2.65'], ['Americano', '2.85'], ['Flat White', '3.65'], ['Latte', '3.55'], ['Cappuccino', '3.55']]],
  ['SIGNATURE', [['Caramel Macchiato', '4.15'], ['Mocha', '4.05'], ['Matcha Latte', '4.05'], ['Chai Latte', '3.85'], ['Vanilla Latte', '3.85'], ['Honey Oat Latte', '4.25']]],
  ['BREWED', [['Filter Coffee', '2.45'], ['Cortado', '3.25'], ['Macchiato', '2.75'], ['Hot Chocolate', '3.45'], ['Extra Shot', '0.80'], ['Oat / Soy', '0.45']]],
];

const menuB = [
  ['COLD', [['Cold Brew', '3.75'], ['Iced Latte', '3.85'], ['Iced Americano', '3.15'], ['Nitro Cold Brew', '4.35'], ['Iced Matcha', '4.15']]],
  ['FRAPPUCCINO', [['Caramel Frappuccino', '4.75'], ['Mocha Frappuccino', '4.75'], ['Coffee Frappuccino', '4.45'], ['Strawberry Creme', '4.55'], ['Java Chip', '4.95']]],
  ['TEAS & FOOD', [['English Breakfast', '2.45'], ['Earl Grey', '2.45'], ['Green Tea', '2.45'], ['Butter Croissant', '2.75'], ['Pain au Chocolat', '2.95'], ['Breakfast Wrap', '4.95'], ['Blueberry Muffin', '2.85']]],
];

function drawMenu(g, w, h, title, columns) {
  g.fillStyle = '#FFFFFF';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#14161A';
  g.fillRect(0, 0, w, 64);
  smallCaps(g, title, 34, 43, 25, '#FFFFFF', 3.5);
  g.fillStyle = '#FFFFFF';
  fivePointStar(g, w - 36, 32, 13, 5.5);
  g.fill();
  const margin = 32;
  const gutter = 28;
  const colW = (w - margin * 2 - gutter * 2) / 3;
  const firstY = 165;
  const longestColumn = Math.max(...columns.map((column) => column[1].length));
  const basePitch = (500 - firstY) / Math.max(1, longestColumn - 1);
  const priceFont = '600 26px "Avenir Next","Helvetica Neue",Helvetica,Arial,sans-serif';
  for (let c = 0; c < 3; c += 1) {
    const x = margin + c * (colW + gutter);
    smallCaps(g, columns[c][0], x, 112, 22, '#00704A', 2.2);
    hairline(g, x, 126, x + colW, 126, '#B9C7C0', 1);
    const rows = columns[c][1];
    let nameSize = 26;
    while (nameSize > 8) {
      g.font = `700 ${nameSize}px "Georgia","Times New Roman",serif`;
      const fits = rows.every((row) => {
        const nameWidth = g.measureText(row[0].toUpperCase()).width;
        g.font = priceFont;
        const priceWidth = g.measureText(`£${row[1]}`).width;
        g.font = `700 ${nameSize}px "Georgia","Times New Roman",serif`;
        return nameWidth <= colW - priceWidth - 24;
      });
      if (fits) break;
      nameSize -= 1;
    }
    const pitch = rows.length > 1
      ? Math.max(basePitch, (400 - firstY) / (rows.length - 1))
      : 0;
    for (let r = 0; r < rows.length; r += 1) {
      const y = firstY + r * pitch;
      const price = `£${rows[r][1]}`;
      g.fillStyle = '#14161A';
      g.textAlign = 'right';
      g.font = priceFont;
      g.fillText(price, x + colW, y);
      const priceW = g.measureText(price).width;
      g.textAlign = 'left';
      g.fillStyle = '#14161A';
      const name = rows[r][0].toUpperCase();
      g.font = `700 ${nameSize}px "Georgia","Times New Roman",serif`;
      g.fillText(name, x, y);
      const used = g.measureText(name).width;
      const dotsStart = x + used + 8;
      const dotsEnd = x + colW - priceW - 8;
      if (dotsEnd > dotsStart) {
        g.fillStyle = '#C9C9C6';
        g.font = '400 16px Georgia,serif';
        const dotW = g.measureText('·').width;
        for (let dx = dotsStart; dx < dotsEnd; dx += dotW + 4) g.fillText('·', dx, y - 2);
      }
    }
  }
  g.textAlign = 'left';
  hairline(g, 32, 550, w - 32, 550, '#D3D3D0', 1);
  smallCaps(g, 'ALLERGEN INFORMATION AVAILABLE ON REQUEST  ·  CALORIES ON DISPLAY', 32, 580, 14, '#73777B', 1.15);
}

function glassPath(g, x, y, width, height) {
  g.beginPath();
  g.moveTo(x - width * 0.42, y);
  g.quadraticCurveTo(x - width * 0.5, y, x - width * 0.44, y + 18);
  g.lineTo(x - width * 0.32, y + height - 16);
  g.quadraticCurveTo(x - width * 0.3, y + height, x, y + height);
  g.quadraticCurveTo(x + width * 0.3, y + height, x + width * 0.32, y + height - 16);
  g.lineTo(x + width * 0.44, y + 18);
  g.quadraticCurveTo(x + width * 0.5, y, x + width * 0.42, y);
  g.closePath();
}

function creamPath(g, x, y, width) {
  const half = width * 0.43;
  g.beginPath();
  g.moveTo(x - half, y);
  g.bezierCurveTo(x - half - 2, y - 18, x - 68, y - 34, x - 52, y - 36);
  g.bezierCurveTo(x - 49, y - 55, x - 32, y - 69, x - 15, y - 62);
  g.bezierCurveTo(x - 7, y - 88, x + 20, y - 90, x + 29, y - 61);
  g.bezierCurveTo(x + 50, y - 64, x + 62, y - 49, x + 59, y - 34);
  g.bezierCurveTo(x + 74, y - 31, x + half + 5, y - 15, x + half, y);
  g.lineTo(x - half, y);
  g.closePath();
}

function drawIcedDrink(g, x, y, variant) {
  const width = 178;
  const height = 300;
  const strawRimX = x + 26 + variant * 4;
  const strawTopInset = Math.max(24, g.canvas.height * 0.04);
  const strawTopY = Math.max(strawTopInset, y - 78);
  const strawRise = y - strawTopY;
  const strawTopX = strawRimX + Math.tan(12 * Math.PI / 180) * strawRise;
  g.save();
  glassPath(g, x, y, width, height);
  g.clip();
  g.fillStyle = '#F1E3CE';
  g.fillRect(x - width / 2, y + 122, width, 200);
  g.fillStyle = '#4A2B1E';
  g.fillRect(x - width / 2, y + 74 + variant * 6, width, 74);
  g.fillStyle = '#C68B4B';
  g.fillRect(x - width / 2, y + 42, width, 52);
  const ice = [
    [-48, 61, -0.28], [18, 74, 0.24], [52, 116, -0.17], [-19, 141, 0.34],
    [-52, 190, 0.12], [31, 211, -0.29], [2, 258, 0.2],
  ];
  for (const [dx, dy, angle] of ice) {
    g.save();
    g.translate(x + dx, y + dy);
    g.rotate(angle);
    g.fillStyle = 'rgba(255,255,255,0.30)';
    roundRect(g, -20, -17, 40, 34, 7);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.68)';
    g.lineWidth = 1;
    g.stroke();
    g.restore();
  }
  g.restore();

  // The submerged segment begins in the drink and is contained by the glass.
  g.save();
  glassPath(g, x, y, width, height);
  g.clip();
  g.strokeStyle = '#167451';
  g.lineWidth = 14;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x - 12 + variant * 4, y + 118);
  g.lineTo(strawRimX, y);
  g.stroke();
  g.restore();

  g.fillStyle = '#FFFCF4';
  creamPath(g, x, y, width);
  g.fill();
  g.strokeStyle = '#D9C9AE';
  g.lineWidth = 4;
  creamPath(g, x, y, width);
  g.stroke();

  g.save();
  creamPath(g, x, y, width);
  g.clip();
  g.strokeStyle = '#E5D6BC';
  g.lineWidth = 3;
  g.lineCap = 'round';
  const creamSwirls = [
    [x, y + 18, 65],
    [x, y - 13, 49],
    [x + 2, y - 42, 30],
  ];
  for (const [swirlX, swirlY, radius] of creamSwirls) {
    g.beginPath();
    g.arc(swirlX, swirlY, radius, 1.15 * Math.PI, 1.85 * Math.PI);
    g.stroke();
  }
  g.restore();

  g.save();
  creamPath(g, x, y, width);
  g.clip();
  g.strokeStyle = '#B87333';
  g.lineWidth = 7;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x - 68, y - 28);
  g.bezierCurveTo(x - 42, y - 52, x - 17, y - 12, x + 7, y - 38);
  g.bezierCurveTo(x + 29, y - 61, x + 48, y - 20, x + 69, y - 34);
  g.stroke();
  g.restore();

  // Continue the same straw through and above the cream.
  g.strokeStyle = '#167451';
  g.lineWidth = 14;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(strawRimX, y);
  g.lineTo(strawTopX, strawTopY);
  g.stroke();

  g.strokeStyle = '#B9B6AD';
  g.lineWidth = 5;
  glassPath(g, x, y, width, height);
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.82)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(x - width * 0.42, y);
  g.lineTo(x + width * 0.42, y);
  g.stroke();
}

function drawFrappoPromo(g, w, h) {
  g.fillStyle = '#F6F0E4';
  g.fillRect(0, 0, w, h);
  drawIcedDrink(g, 225, 150, -1);
  drawIcedDrink(g, 512, 139, 0);
  drawIcedDrink(g, 799, 150, 1);
  g.fillStyle = '#14161A';
  g.font = '900 55px "Futura","Avenir Next","Helvetica Neue",Helvetica,Arial,sans-serif';
  const title = 'FRAPPUCCINO';
  const tw = trackedWidth(g, title, 7);
  trackedText(g, title, (w - tw) / 2, 525, 7);
  g.font = '700 21px "Avenir Next","Helvetica Neue",Helvetica,Arial,sans-serif';
  const sub = 'HANDCRAFTED  ·  BLENDED  ·  CHILLED';
  const sw = trackedWidth(g, sub, 2.5);
  trackedText(g, sub, (w - sw) / 2, 567, 2.5);
}

function drawWrapHalf(g, x, y, angle, front) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.fillStyle = front ? '#D7A968' : '#C69658';
  roundRect(g, -150, -58, 300, 116, 45);
  g.fill();
  g.strokeStyle = '#B9864E';
  g.lineWidth = 3;
  for (let i = -100; i <= 90; i += 38) hairline(g, i, -48, i + 28, 48, 'rgba(145,91,43,0.3)', 3);
  g.save();
  g.beginPath();
  g.moveTo(105, -58);
  g.lineTo(150, -58);
  g.quadraticCurveTo(170, 0, 150, 58);
  g.lineTo(105, 58);
  g.closePath();
  g.clip();
  g.fillStyle = '#F0C860';
  g.fillRect(100, -60, 70, 120);
  g.fillStyle = '#B3543C';
  g.beginPath();
  g.moveTo(105, -42); g.lineTo(164, -8); g.lineTo(118, 8); g.lineTo(162, 43); g.lineTo(104, 53); g.closePath();
  g.fill();
  g.fillStyle = '#6E9C4B';
  for (let i = 0; i < 5; i += 1) {
    g.beginPath();
    g.arc(117 + i * 11, -28 + (i % 2) * 54, 13, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  g.restore();
}

function drawWrapPromo(g, w, h) {
  g.fillStyle = '#F6F0E4';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#D1CDC5';
  g.beginPath();
  g.ellipse(365, 287, 292, 101, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#FFFFFF';
  g.beginPath();
  g.ellipse(365, 277, 278, 90, 0, 0, Math.PI * 2);
  g.fill();
  drawWrapHalf(g, 321, 252, -0.2, false);
  drawWrapHalf(g, 426, 240, 0.36, true);
  g.fillStyle = '#14161A';
  smallCaps(g, 'BREAKFAST WRAPS', 62, 72, 42, '#14161A', 4.5);
  smallCaps(g, 'SERVED UNTIL 11AM', 68, 111, 20, '#00704A', 2.5);
}

function drawJet2(g, w, h) {
  g.fillStyle = '#E4002B';
  g.fillRect(0, 0, w, h);
  const glyphs = 'jet2.com';
  const tilts = [-0.08, 0.04, -0.03, 0.05, -0.02, 0.04, -0.05, 0.02];
  const lifts = [4, -5, 2, -3, 5, 0, -4, 3];
  let x = 95;
  for (let i = 0; i < glyphs.length; i += 1) {
    g.save();
    g.translate(x, 260 + lifts[i]);
    g.rotate(tilts[i]);
    g.fillStyle = '#FFFFFF';
    g.font = 'italic 900 176px "Avenir Next","Helvetica Neue",Helvetica,Arial,sans-serif';
    g.fillText(glyphs[i], 0, 0);
    const advance = g.measureText(glyphs[i]).width * 0.86;
    g.restore();
    x += advance;
  }
  g.strokeStyle = '#FFFFFF';
  g.lineWidth = 9;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(126, 279);
  g.bezierCurveTo(330, 305, 575, 286, 895, 300);
  g.stroke();
  smallCaps(g, 'Friendly low fares', 112, 385, 44, '#FFFFFF', 3);
  hairline(g, 1120, 48, 1120, 464, 'rgba(255,255,255,0.9)', 3);
  g.fillStyle = '#FFFFFF';
  g.font = '900 74px "Arial Narrow","Avenir Next Condensed","Helvetica Neue",Arial,sans-serif';
  trackedText(g, '23 DESTINATIONS', 1210, 224, 7);
  trackedText(g, 'FROM LONDON', 1210, 326, 9);
}

function drawInMotion(g, w, h) {
  g.fillStyle = '#F5C518';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#14161A';
  const wordSize = 100;
  const baseline = 162;
  const wordX = 55;
  const sideBearing = 14;
  const discRadius = wordSize * 0.36;
  const capMidline = baseline - wordSize * 0.36;
  g.font = `900 ${wordSize}px "Futura","Avenir Next","Helvetica Neue",Helvetica,Arial,sans-serif`;
  g.fillText('INM', wordX, baseline);
  const inmWidth = g.measureText('INM').width;
  const discX = wordX + inmWidth + sideBearing + discRadius;
  g.fillStyle = '#009CA6';
  g.beginPath();
  g.arc(discX, capMidline, discRadius, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#FFFFFF';
  g.lineWidth = 6;
  g.beginPath();
  g.arc(discX, capMidline, discRadius * 0.62, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#14161A';
  g.fillText('TION', discX + discRadius + sideBearing, baseline);
  const tionX = discX + discRadius + sideBearing;
  const wordmarkRight = tionX + g.measureText('TION').width;
  const badgeRadius = 72;
  const firstBadgeX = wordmarkRight + 70 + badgeRadius;
  const badgeSpacing = badgeRadius * 2.4;
  const secondBadgeX = firstBadgeX + badgeSpacing;
  const badges = [firstBadgeX, secondBadgeX];
  for (const x of badges) {
    g.fillStyle = '#1E7A46';
    g.beginPath();
    g.arc(x, 128, badgeRadius, 0, Math.PI * 2);
    g.fill();
    for (const [word, y] of [['JUST', 120], ['LANDED', 153]]) {
      g.font = '800 24px "Avenir Next","Helvetica Neue",Helvetica,Arial,sans-serif';
      const wordWidth = trackedWidth(g, word, 2.4);
      smallCaps(g, word, x - wordWidth / 2, y, 24, '#FFFFFF', 2.4);
    }
  }
  g.textAlign = 'left';
  g.fillStyle = '#14161A';
  const headline = 'Brand new from Bose';
  const price = '£299.99';
  const copyX = secondBadgeX + badgeRadius + 70;
  g.font = '600 50px "Avenir Next","Helvetica Neue",Helvetica,Arial,sans-serif';
  const headlineWidth = g.measureText(headline).width;
  g.fillText(headline, copyX, 105);
  g.font = '900 62px "Avenir Next","Helvetica Neue",Helvetica,Arial,sans-serif';
  const priceWidth = g.measureText(price).width;
  g.fillText(price, copyX, 183);
  const copyRight = copyX + Math.max(headlineWidth, priceWidth);
  const headphoneHalfWidth = 101;
  const headphoneX = copyRight + 54 + headphoneHalfWidth;
  console.assert(firstBadgeX - badgeRadius - wordmarkRight >= 70, 'First roundel overlaps the wordmark');
  console.assert(secondBadgeX - firstBadgeX >= badgeRadius * 2.4, 'Roundels are too close');
  console.assert(copyX - (secondBadgeX + badgeRadius) >= 70, 'Copy overlaps the second roundel');
  console.assert(headphoneX + headphoneHalfWidth <= w, 'InMotion banner content exceeds the canvas');
  g.strokeStyle = '#14161A';
  g.lineWidth = 14;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(headphoneX, 126, 83, Math.PI * 1.08, Math.PI * 1.92);
  g.stroke();
  g.fillStyle = '#14161A';
  roundRect(g, headphoneX - 101, 113, 39, 88, 16); g.fill();
  roundRect(g, headphoneX + 62, 113, 39, 88, 16); g.fill();
  hairline(g, headphoneX - 66, 166, headphoneX - 47, 183, '#14161A', 10);
  hairline(g, headphoneX + 66, 166, headphoneX + 47, 183, '#14161A', 10);
}

function drawBrandPlaques(g, w, h) {
  g.fillStyle = '#0E0F11';
  g.fillRect(0, 0, w, h);
  const brands = ['aelia', 'SAMSUNG', 'SONY', 'BOSE', 'JBL', 'BEATS', 'BANG & OLUFSEN', 'belkin'];
  for (let i = 0; i < brands.length; i += 1) {
    const y = i * 128;
    g.fillStyle = i % 2 ? '#111316' : '#0E0F11';
    g.fillRect(0, y, w, 124);
    g.fillStyle = '#2A2C31';
    g.fillRect(0, y + 124, w, 4);
    g.fillStyle = '#FFFFFF';
    g.textAlign = 'center';
    if (brands[i] === 'BANG & OLUFSEN') {
      g.font = '600 24px "Avenir Next","Helvetica Neue",Helvetica,Arial,sans-serif';
      g.fillText('BANG &', w / 2, y + 54);
      g.fillText('OLUFSEN', w / 2, y + 88);
    } else {
      const light = brands[i] === 'aelia' || brands[i] === 'belkin';
      const label = brands[i] === 'aelia' ? 'a e l i a' : brands[i];
      textFit(g, label, w / 2, y + 77, w - 40, `${light ? 300 : 800} ${light ? 43 : 39}px "Avenir Next","Helvetica Neue",Helvetica,Arial,sans-serif`);
    }
  }
  g.textAlign = 'left';
}

function arrowPath(g, x, y, length, height, right) {
  const s = right ? 1 : -1;
  g.beginPath();
  g.moveTo(x + s * length / 2, y);
  g.lineTo(x + s * length / 6, y - height / 2);
  g.lineTo(x + s * length / 6, y - height / 5);
  g.lineTo(x - s * length / 2, y - height / 5);
  g.lineTo(x - s * length / 2, y + height / 5);
  g.lineTo(x + s * length / 6, y + height / 5);
  g.lineTo(x + s * length / 6, y + height / 2);
  g.closePath();
}

function walkingMan(g, x, y, scale = 1) {
  g.save();
  g.translate(x, y);
  g.scale(scale, scale);
  g.fillStyle = '#FFFFFF';
  g.beginPath();
  g.arc(0, -48, 15, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#FFFFFF';
  g.lineWidth = 14;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(-4, -27); g.lineTo(-10, 20); g.lineTo(-40, 65);
  g.moveTo(-9, 16); g.lineTo(25, 57);
  g.moveTo(-5, -12); g.lineTo(-39, 13);
  g.moveTo(-3, -9); g.lineTo(34, 8);
  g.stroke();
  g.restore();
}

function runningMan(g, x, y, scale = 1) {
  g.save();
  g.translate(x, y);
  g.scale(scale, scale);
  g.fillStyle = '#FFFFFF';
  g.beginPath();
  g.arc(12, -45, 13, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#FFFFFF';
  g.lineWidth = 12;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(8, -28); g.lineTo(-4, 12);
  g.moveTo(-4, 12); g.lineTo(-42, 56);
  g.moveTo(-3, 12); g.lineTo(36, 50);
  g.moveTo(4, -16); g.lineTo(-33, -2);
  g.moveTo(5, -17); g.lineTo(38, -37);
  g.stroke();
  g.restore();
}

function aircraft(g, x, y, scale, right) {
  g.save();
  g.translate(x, y);
  g.scale(right ? scale : -scale, scale);
  g.rotate(-0.43);
  g.fillStyle = '#FFFFFF';
  g.beginPath();
  g.moveTo(-64, 5);
  g.lineTo(49, -7);
  g.quadraticCurveTo(67, -6, 78, 2);
  g.quadraticCurveTo(61, 12, 43, 12);
  g.lineTo(8, 15);
  g.lineTo(-24, 55);
  g.lineTo(-43, 58);
  g.lineTo(-25, 17);
  g.lineTo(-63, 18);
  g.lineTo(-78, 35);
  g.lineTo(-90, 36);
  g.lineTo(-82, 9);
  g.lineTo(-91, -13);
  g.lineTo(-80, -15);
  g.closePath();
  g.fill();
  g.restore();
  g.save();
  g.strokeStyle = '#FFFFFF';
  g.lineWidth = 4;
  g.setLineDash([15, 12]);
  g.beginPath();
  g.moveTo(x - 75, y + 42);
  g.lineTo(x + 75, y + 42);
  g.stroke();
  g.restore();
}

function wcIcon(g, x, y) {
  g.fillStyle = '#FFFFFF';
  for (const dx of [-14, 14]) {
    g.beginPath(); g.arc(x + dx, y - 17, 7, 0, Math.PI * 2); g.fill();
    roundRect(g, x + dx - 7, y - 7, 14, 30, 5); g.fill();
  }
  hairline(g, x, y - 28, x, y + 28, 'rgba(255,255,255,0.65)', 2);
}

function drawGateSign(g, w, h) {
  g.fillStyle = '#24272C';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#42464D';
  g.lineWidth = 3;
  g.strokeRect(8, 8, w - 16, h - 16);
  hairline(g, w / 2, 20, w / 2, 344, '#555960', 2);
  const minGap = 46;
  const arrowWidth = 128;
  const arrowHeight = 96;
  const manScale = 0.76;
  const manLeft = -47 * manScale;
  const manWidth = 88 * manScale;
  const gateBaseline = 246;
  const minuteBaseline = 218;
  const layoutHalf = (spanLeft, spanRight, gateLabel, minuteLabel, order, planeRight) => {
    let gateSize = 126;
    let minuteSize = 48;
    let gateFont;
    let minuteFont;
    let gateWidth;
    let minuteWidth;
    do {
      gateFont = `600 ${gateSize}px "Avenir Next","Helvetica Neue",Helvetica,Arial,sans-serif`;
      minuteFont = `600 ${minuteSize}px "Avenir Next","Helvetica Neue",Helvetica,Arial,sans-serif`;
      g.font = gateFont;
      gateWidth = g.measureText(gateLabel).width;
      g.font = minuteFont;
      minuteWidth = g.measureText(minuteLabel).width;
      if (arrowWidth + gateWidth + manWidth + minuteWidth + minGap * 3 <= spanRight - spanLeft) break;
      gateSize -= 2;
      minuteSize -= 1;
    } while (gateSize >= 100 && minuteSize >= 38);

    const widths = {
      arrow: arrowWidth,
      gate: gateWidth,
      man: manWidth,
      minutes: minuteWidth,
    };
    const occupiedWidth = order.reduce((total, name) => total + widths[name], 0);
    const gap = (spanRight - spanLeft - occupiedWidth) / (order.length - 1);
    const positions = {};
    let cursor = spanLeft;
    for (const name of order) {
      positions[name] = cursor;
      cursor += widths[name] + gap;
    }
    const lastName = order[order.length - 1];
    const lastRight = positions[lastName] + widths[lastName];
    console.assert(gap >= minGap, `${gateLabel} gate-sign gap is below ${minGap}px`);
    console.assert(lastRight <= spanRight, `${gateLabel} gate-sign content exceeds its half`);

    aircraft(g, positions.gate + gateWidth / 2, 64, 0.64, planeRight);
    for (const name of order) {
      g.fillStyle = '#FFFFFF';
      if (name === 'arrow') {
        arrowPath(g, positions.arrow + arrowWidth / 2, 195, arrowWidth, arrowHeight, planeRight);
        g.fill();
      } else if (name === 'gate') {
        g.font = gateFont;
        g.fillText(gateLabel, positions.gate, gateBaseline);
      } else if (name === 'man') {
        walkingMan(g, positions.man - manLeft, 190, manScale);
      } else {
        g.font = minuteFont;
        g.fillText(minuteLabel, positions.minutes, minuteBaseline);
      }
    }
  };
  g.textAlign = 'left';
  layoutHalf(40, 984, '1-28', '15 mins', ['arrow', 'gate', 'man', 'minutes'], false);
  layoutHalf(1064, 2008, '30-43', '10 mins', ['gate', 'arrow', 'man', 'minutes'], true);
  g.fillStyle = '#1E7A46';
  g.fillRect(0, 344, w / 2, 76);
  g.fillRect(w / 2 + 2, 344, w / 2 - 2, 76);
  wcIcon(g, 92, 382);
  smallCaps(g, 'Toilets', 138, 397, 34, '#FFFFFF', 2.2);
  runningMan(g, 1122, 382, 0.5);
  smallCaps(g, 'Fire Exit', 1174, 397, 34, '#FFFFFF', 2.2);
  g.fillStyle = '#FFFFFF';
  arrowPath(g, 1920, 382, 92, 48, true); g.fill();
}

function drawDiscoverLondon(g, w, h) {
  g.fillStyle = '#B9884F';
  g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 74) hairline(g, x, 0, x, h, 'rgba(91,57,28,0.22)', 4);
  g.fillStyle = '#F6EBD7';
  g.beginPath();
  g.arc(326, 222, 176, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#1E6B4F';
  g.lineWidth = 16;
  g.beginPath();
  g.arc(326, 222, 151, 0, Math.PI * 2);
  g.stroke();
  g.textAlign = 'center';
  g.fillStyle = '#1E6B4F';
  g.font = 'italic 600 66px Georgia,"Times New Roman",serif';
  g.fillText('discover', 326, 210);
  g.font = '900 48px "Avenir Next","Helvetica Neue",Helvetica,Arial,sans-serif';
  trackedText(g, 'LONDON', 221, 270, 7);
  g.textAlign = 'left';
  g.fillStyle = '#B9272F';
  roundRect(g, 730, 95, 154, 288, 8); g.fill();
  g.fillStyle = '#F4E5CB';
  g.fillRect(750, 132, 114, 26);
  g.fillStyle = '#B9272F';
  g.font = '700 17px Arial,sans-serif';
  g.textAlign = 'center';
  g.fillText('TELEPHONE', 807, 152);
  g.strokeStyle = '#F4E5CB';
  g.lineWidth = 5;
  for (let row = 0; row < 3; row += 1) for (let col = 0; col < 2; col += 1) g.strokeRect(749 + col * 58, 176 + row * 58, 53, 52);
  g.fillStyle = '#8F1D25';
  g.fillRect(715, 383, 184, 18);
  g.textAlign = 'left';

  const busX = 54;
  const busY = 366;
  g.fillStyle = '#B9272F';
  roundRect(g, busX, busY, 235, 112, 10); g.fill();
  g.fillStyle = '#F4E5CB';
  g.fillRect(busX + 15, busY + 13, 190, 24);
  g.fillRect(busX + 15, busY + 48, 190, 25);
  g.fillStyle = '#B9272F';
  for (let i = 1; i < 5; i += 1) {
    g.fillRect(busX + 13 + i * 39, busY + 13, 5, 60);
  }
  g.fillRect(busX + 207, busY + 13, 15, 60);
  g.fillStyle = '#E0AAA3';
  g.fillRect(busX + 15, busY + 79, 207, 8);
  g.fillStyle = '#3B2D2C';
  for (const wheelX of [busX + 49, busX + 187]) {
    g.beginPath();
    g.arc(wheelX, busY + 111, 15, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#C9B7A0';
    g.beginPath();
    g.arc(wheelX, busY + 111, 5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#3B2D2C';
  }

  const postX = 390;
  g.fillStyle = '#B9272F';
  g.beginPath();
  g.moveTo(postX, 407);
  g.bezierCurveTo(postX, 378, postX + 86, 378, postX + 86, 407);
  g.lineTo(postX + 86, 474);
  g.lineTo(postX, 474);
  g.closePath();
  g.fill();
  g.fillStyle = '#5A2025';
  roundRect(g, postX + 12, 414, 62, 10, 3); g.fill();
  g.fillStyle = '#F4E5CB';
  roundRect(g, postX + 23, 436, 40, 20, 2); g.fill();
  g.fillStyle = '#8F1D25';
  g.fillRect(postX - 9, 472, 104, 15);
}

function bottle(g, x, y, scale) {
  g.beginPath();
  g.moveTo(x - 20 * scale, y);
  g.lineTo(x - 28 * scale, y - 151 * scale);
  g.quadraticCurveTo(x - 26 * scale, y - 175 * scale, x - 12 * scale, y - 184 * scale);
  g.lineTo(x - 10 * scale, y - 222 * scale);
  g.lineTo(x + 10 * scale, y - 222 * scale);
  g.lineTo(x + 12 * scale, y - 184 * scale);
  g.quadraticCurveTo(x + 26 * scale, y - 175 * scale, x + 28 * scale, y - 151 * scale);
  g.lineTo(x + 20 * scale, y);
  g.closePath();
}

function drawAelia(g, w, h) {
  const bg = g.createLinearGradient(0, 0, w, 0);
  bg.addColorStop(0, '#050506'); bg.addColorStop(0.5, '#18191C'); bg.addColorStop(1, '#050506');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  const glow = g.createRadialGradient(170, 246, 5, 170, 246, 190);
  glow.addColorStop(0, 'rgba(255,244,202,0.28)'); glow.addColorStop(1, 'rgba(255,244,202,0)');
  g.fillStyle = glow; g.fillRect(0, 40, 360, 420);
  const glow2 = g.createRadialGradient(895, 250, 5, 895, 250, 170);
  glow2.addColorStop(0, 'rgba(193,220,255,0.24)'); glow2.addColorStop(1, 'rgba(193,220,255,0)');
  g.fillStyle = glow2; g.fillRect(730, 60, 294, 400);
  g.fillStyle = 'rgba(245,237,211,0.22)'; bottle(g, 154, 445, 1.35); g.fill();
  g.fillStyle = 'rgba(203,225,255,0.20)'; bottle(g, 900, 445, 1.2); g.fill();
  g.fillStyle = '#FFFFFF';
  g.font = '300 122px "Avenir Next","Helvetica Neue",Helvetica,Arial,sans-serif';
  const aw = trackedWidth(g, 'aelia', 22);
  trackedText(g, 'aelia', (w - aw) / 2, 222, 22);
  g.font = '600 34px "Avenir Next","Helvetica Neue",Helvetica,Arial,sans-serif';
  const dw = trackedWidth(g, 'DUTY FREE', 8);
  trackedText(g, 'DUTY FREE', (w - dw) / 2, 282, 8);
  g.fillStyle = '#D2222A';
  roundRect(g, 306, 333, 190, 105, 7); g.fill();
  roundRect(g, 519, 333, 190, 105, 7); g.fill();
  smallCaps(g, 'SPECIAL OFFER', 325, 373, 20, '#FFFFFF', 1.4);
  smallCaps(g, 'LOW £19.99', 543, 405, 27, '#FFFFFF', 1.5);
}

function drawPosScreen(g, w, h) {
  g.fillStyle = '#1B1E24';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#00704A';
  g.fillRect(0, 0, w, 52);
  smallCaps(g, 'SIM*BUCKS  ·  TILL 2', 18, 35, 19, '#FFFFFF', 1.5);
  g.fillStyle = '#F4F2ED';
  roundRect(g, 12, 64, 225, 306, 6); g.fill();
  g.fillStyle = '#1B1E24';
  g.font = '700 16px "Avenir Next","Helvetica Neue",Helvetica,Arial,sans-serif';
  g.fillText('CURRENT ORDER', 26, 91);
  hairline(g, 25, 101, 224, 101, '#BEC2C3', 1);
  const order = [['Grande Latte', '3.55'], ['Oat Milk', '0.45'], ['Extra Shot', '0.80'], ['Croissant', '2.75']];
  for (let i = 0; i < order.length; i += 1) {
    const y = 133 + i * 42;
    g.font = '500 17px "Avenir Next","Helvetica Neue",Helvetica,Arial,sans-serif';
    g.fillText(order[i][0], 26, y);
    g.textAlign = 'right'; g.fillText(`£${order[i][1]}`, 220, y); g.textAlign = 'left';
    hairline(g, 25, y + 12, 224, y + 12, '#DFE0DC', 1);
  }
  g.fillStyle = '#DDEBE5';
  roundRect(g, 21, 304, 207, 52, 5); g.fill();
  g.fillStyle = '#10231C';
  g.font = '800 22px "Avenir Next","Helvetica Neue",Helvetica,Arial,sans-serif';
  g.fillText('TOTAL', 33, 337);
  g.textAlign = 'right'; g.fillText('£7.55', 215, 337); g.textAlign = 'left';
  const labels = ['LATTE', 'FLAT WHT', 'AMER', 'MOCHA', 'CAPP', 'ESPRESSO', 'COLD BREW', 'FRAPP', 'TEA', 'CROISSANT', 'WRAP', 'MUFFIN'];
  const colors = ['#2D8C64', '#3C9B72', '#4AA67C', '#D09947', '#DBAA5E', '#C98D3C', '#328B91', '#E07560', '#65A680', '#D5A55D', '#D07D55', '#BD8B63'];
  for (let i = 0; i < labels.length; i += 1) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 249 + col * 85;
    const y = 65 + row * 75;
    g.fillStyle = colors[i];
    roundRect(g, x, y, 75, 64, 8); g.fill();
    g.fillStyle = '#FFFFFF';
    g.textAlign = 'center';
    textFit(g, labels[i], x + 37.5, y + 38, 65, '800 13px "Avenir Next","Helvetica Neue",Helvetica,Arial,sans-serif');
  }
  g.textAlign = 'left';
}

function croissant(g, x, y, scale) {
  g.save();
  g.translate(x, y);
  g.scale(scale, scale);
  g.fillStyle = '#D6A45C';
  g.beginPath();
  g.moveTo(-68, 18);
  g.bezierCurveTo(-62, -20, -36, -44, 0, -46);
  g.bezierCurveTo(36, -44, 62, -20, 68, 18);
  g.bezierCurveTo(47, 3, 25, -15, 0, -17);
  g.bezierCurveTo(-25, -15, -47, 3, -68, 18);
  g.closePath();
  g.fill();
  g.save();
  g.clip();
  g.fillStyle = 'rgba(143,83,35,0.38)';
  g.fillRect(-72, -26, 144, 50);
  g.restore();
  g.strokeStyle = '#A87435';
  g.lineWidth = 3.2;
  g.lineCap = 'round';
  for (const offset of [-28, 0, 28]) {
    g.beginPath();
    g.moveTo(offset - Math.sign(offset) * 4, -34 + Math.abs(offset) * 0.12);
    g.quadraticCurveTo(offset * 0.78, -20, offset * 0.55, -6);
    g.stroke();
  }
  g.restore();
}

function pain(g, x, y, scale) {
  g.fillStyle = '#C08B4E';
  roundRect(g, x - 49 * scale, y - 31 * scale, 98 * scale, 62 * scale, 13 * scale); g.fill();
  hairline(g, x - 23 * scale, y - 25 * scale, x - 23 * scale, y + 25 * scale, '#5B3522', 8 * scale);
  hairline(g, x + 23 * scale, y - 25 * scale, x + 23 * scale, y + 25 * scale, '#5B3522', 8 * scale);
}

function muffin(g, x, y, scale, seed) {
  const rng = mulberry32(seed);
  g.fillStyle = '#A8764F';
  g.beginPath();
  g.moveTo(x - 34 * scale, y + 22 * scale); g.lineTo(x - 27 * scale, y + 63 * scale);
  g.lineTo(x + 27 * scale, y + 63 * scale); g.lineTo(x + 34 * scale, y + 22 * scale); g.closePath(); g.fill();
  g.fillStyle = '#B98A5E';
  g.beginPath(); g.arc(x, y + 11 * scale, 47 * scale, Math.PI, 0); g.lineTo(x + 47 * scale, y + 28 * scale); g.lineTo(x - 47 * scale, y + 28 * scale); g.closePath(); g.fill();
  g.fillStyle = '#6B4A2E';
  for (let i = 0; i < 18; i += 1) {
    const a = rng() * Math.PI;
    const rr = rng() * 38 * scale;
    g.beginPath(); g.arc(x + Math.cos(a) * rr, y + 12 * scale - Math.sin(a) * rr * 0.7, 2 + rng() * 2, 0, Math.PI * 2); g.fill();
  }
}

function drawPastryTray(g, w, h) {
  g.fillStyle = '#101215';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#2A2C31';
  g.lineWidth = 2;
  for (let x = 12; x < w; x += 24) hairline(g, x, 0, x, h, '#2A2C31', 2);
  for (let y = 12; y < h; y += 24) hairline(g, 0, y, w, y, '#2A2C31', 2);
  const itemPitch = 142;
  const evenRow = [58, 58 + itemPitch, 58 + itemPitch * 2, 58 + itemPitch * 3];
  const offsetRow = [58 + itemPitch / 2, 58 + itemPitch * 1.5, 58 + itemPitch * 2.5];
  for (const x of evenRow) croissant(g, x, 92, 1.34);

  const fullPain = (x, y, scale) => {
    g.save();
    g.translate(x, y);
    g.scale(scale, scale);
    g.fillStyle = '#A86E37';
    roundRect(g, -55, -36, 110, 72, 24);
    g.fill();
    g.fillStyle = '#D9A45E';
    g.beginPath();
    g.moveTo(-49, -5);
    g.bezierCurveTo(-45, -32, -26, -43, 0, -45);
    g.bezierCurveTo(26, -43, 45, -32, 49, -5);
    g.quadraticCurveTo(24, 6, 0, 7);
    g.quadraticCurveTo(-24, 6, -49, -5);
    g.closePath();
    g.fill();
    g.strokeStyle = '#9B6332';
    g.lineWidth = 3;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(0, -40);
    g.bezierCurveTo(-3, -22, 3, 7, 0, 29);
    g.stroke();
    g.fillStyle = '#4A2C22';
    for (const endX of [-50, 50]) {
      for (const batonY of [-12, 13]) {
        g.beginPath();
        g.ellipse(endX, batonY, 6, 4.5, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.restore();
  };
  for (const x of offsetRow) fullPain(x, 238, 1.3);
  for (let i = 0; i < evenRow.length; i += 1) muffin(g, evenRow[i], 374, 1.26, 0xB010 + i);
  g.strokeStyle = '#54575D';
  g.lineWidth = 8;
  g.strokeRect(6, 6, w - 12, h - 12);
}

function drawCupSleeve(g, w, h) {
  const rng = mulberry32(0x51EEA1);
  g.fillStyle = '#D8C7A8';
  g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 8) hairline(g, x, 0, x, h, 'rgba(109,87,59,0.18)', 1);
  for (let i = 0; i < 650; i += 1) {
    const x = rng() * w;
    const y = rng() * h;
    g.fillStyle = rng() > 0.5 ? 'rgba(112,91,64,0.18)' : 'rgba(245,235,214,0.24)';
    dotWrapped(g, x, y, 0.7, w, h, (xx, yy) => g.fillRect(xx, yy, 1.2, 0.7));
  }
  g.fillStyle = '#00704A';
  g.fillRect(0, 82, w, 92);
  g.font = '900 28px "Futura","Avenir Next","Helvetica Neue",Helvetica,Arial,sans-serif';
  g.fillStyle = '#FFFFFF';
  const text = 'SIM*BUCKS';
  const tw = trackedWidth(g, text, 2.2);
  trackedText(g, text, (w - tw) / 2, 139, 2.2);
}

function beanShape(g, x, y, rx, ry, angle, fill) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.fillStyle = fill;
  g.beginPath();
  g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(32,14,8,0.78)';
  g.beginPath();
  g.moveTo(0, -ry * 0.76);
  g.quadraticCurveTo(-rx * 0.32, 0, 0, ry * 0.76);
  g.quadraticCurveTo(rx * 0.32, 0, 0, -ry * 0.76);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(220,164,108,0.34)';
  g.lineWidth = 1.4;
  g.beginPath();
  g.ellipse(0, 0, rx * 0.86, ry * 0.82, 0, 0.55 * Math.PI, 1.45 * Math.PI);
  g.stroke();
  g.restore();
}

function drawBeans(g, w, h) {
  const rng = mulberry32(0xBEA45);
  g.fillStyle = '#3B2318';
  g.fillRect(0, 0, w, h);
  const colors = ['#5A3520', '#4C2B1B', '#422419', '#351D14', '#2A1810'];
  for (let i = 0; i < 190; i += 1) {
    const x = rng() * w;
    const y = rng() * h;
    const rx = 10.5 + rng() * 4.5;
    const ry = rx / (1.31 + rng() * 0.08);
    const angle = rng() * Math.PI * 2;
    const fill = colors[Math.floor(rng() * colors.length)];
    dotWrapped(g, x, y, rx + 2, w, h, (xx, yy) => {
      g.save();
      g.translate(xx, yy);
      g.rotate(angle);
      g.fillStyle = fill;
      g.beginPath();
      g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      g.fill();

      const creaseLength = rx * 0.78;
      const creaseHalfWidth = rx * 0.075;
      g.fillStyle = darker(fill, 0.45);
      g.beginPath();
      g.moveTo(-creaseLength, -creaseHalfWidth * 0.35);
      g.bezierCurveTo(-rx * 0.34, -creaseHalfWidth * 1.15, rx * 0.2, creaseHalfWidth * 1.15, creaseLength, creaseHalfWidth * 0.35);
      g.bezierCurveTo(rx * 0.2, creaseHalfWidth * 0.15, -rx * 0.34, -creaseHalfWidth * 0.15, -creaseLength, -creaseHalfWidth * 0.35);
      g.closePath();
      g.fill();

      g.strokeStyle = darker(fill, 0.72);
      g.lineWidth = 1;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(-creaseLength * 0.92, creaseHalfWidth + 0.5);
      g.bezierCurveTo(-rx * 0.3, 0, rx * 0.22, creaseHalfWidth * 1.8, creaseLength * 0.9, creaseHalfWidth + 0.7);
      g.stroke();
      g.restore();
    });
  }
}

function drawCeilingPanel(g, w, h) {
  const rng = mulberry32(0xCE111A6);
  g.fillStyle = '#F3F1EC';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 1200; i += 1) {
    const shade = 220 + Math.floor(rng() * 20);
    g.fillStyle = `rgba(${shade},${shade},${shade - 2},0.12)`;
    g.fillRect(rng() * w, rng() * h, 1, 1);
  }
  g.strokeStyle = '#DDDAD3';
  g.lineWidth = 2;
  g.strokeRect(1, 1, w - 2, h - 2);
  g.fillStyle = '#D4D2CC';
  g.beginPath(); g.arc(202, 54, 23, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#A9AAA7';
  g.lineWidth = 2;
  for (let r = 6; r <= 18; r += 6) { g.beginPath(); g.arc(202, 54, r, 0, Math.PI * 2); g.stroke(); }
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) hairline(g, 202, 54, 202 + Math.cos(a) * 19, 54 + Math.sin(a) * 19, '#A9AAA7', 1);
}

function drawTumblerLid(g, w, h) {
  g.fillStyle = '#F7F7F4';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#FFFFFF';
  g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#D1D1CE'; g.lineWidth = 4; g.stroke();
  g.fillStyle = '#E9E9E6';
  g.beginPath(); g.arc(64, 64, 48, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#D7D7D3'; g.lineWidth = 2; g.stroke();
  g.strokeStyle = '#C9C9C5';
  g.lineWidth = 2;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(64, 51, 25, 0.16 * Math.PI, 0.84 * Math.PI);
  g.stroke();
  g.fillStyle = '#00704A';
  g.beginPath(); g.arc(64, 70, 15, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#34373A';
  g.beginPath(); g.ellipse(64, 34, 13, 7, 0, 0, Math.PI * 2); g.fill();
}

function drawApronPatch(g, w, h) {
  g.fillStyle = '#1E6B4F';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#FFFFFF';
  g.lineWidth = 3;
  g.setLineDash([5, 4]);
  g.beginPath(); g.arc(64, 64, 43, 0, Math.PI * 2); g.stroke();
  g.setLineDash([]);
  g.lineWidth = 2;
  g.beginPath(); g.arc(64, 64, 34, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#FFFFFF';
  fivePointStar(g, 64, 63, 19, 8); g.fill();
}

function drawNoise(g, w, h) {
  const image = g.createImageData(w, h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const u = (x / (w - 1)) * 64;
      const v = (y / (h - 1)) * 64;
      const fine = valueNoise2D(u, v, 0xA015E, 64);
      const micro = valueNoise2D(u * 2, v * 2, 0xA015E + 53, 128);
      const broad = fbm(u / 8, v / 8, 0xA015E + 97, 4, 8);
      const value = Math.max(0, Math.min(255, Math.round(128 + (fine - 0.5) * 58 + (micro - 0.5) * 34 + (broad - 0.5) * 22)));
      const i = (y * w + x) * 4;
      image.data[i] = value;
      image.data[i + 1] = value;
      image.data[i + 2] = value;
      image.data[i + 3] = 255;
    }
  }
  g.putImageData(image, 0, 0);
}

// Architectural surfaces.
export const floorTile = () => reg('floorTile', 512, 512, drawFloorTile);
export const oakSlat = () => reg('oakSlat', 512, 512, drawOakSlat);
export const worktop = () => reg('worktop', 512, 512, drawWorktop);

// Kiosk identity and menu screens.
export const mural = () => reg('mural', 1024, 1024, drawMural);
export const roundel = () => reg('roundel', 512, 512, drawRoundel);
export const fasciaWordmark = () => reg('fasciaWordmark', 1024, 256, drawFasciaWordmark);
export const menuBoardA = () => reg('menuBoardA', 1024, 600, (g, w, h) => drawMenu(g, w, h, 'HOT DRINKS', menuA));
export const menuBoardB = () => reg('menuBoardB', 1024, 600, (g, w, h) => drawMenu(g, w, h, 'COLD & MORE', menuB));
export const frappoPromo = () => reg('frappoPromo', 1024, 600, drawFrappoPromo);
export const wrapPromo = () => reg('wrapPromo', 768, 480, drawWrapPromo);

// Airport retail and wayfinding graphics.
export const jet2 = () => reg('jet2', 2048, 512, drawJet2);
export const inMotionBanner = () => reg('inMotionBanner', 2048, 256, drawInMotion);
export const brandPlaques = () => reg('brandPlaques', 256, 1024, drawBrandPlaques);
export const gateSign = () => reg('gateSign', 2048, 420, drawGateSign);
export const discoverLondon = () => reg('discoverLondon', 1024, 512, drawDiscoverLondon);
export const aeliaFront = () => reg('aeliaFront', 1024, 512, drawAelia);

// Equipment, food, and small prop finishes.
export const posScreen = () => reg('posScreen', 512, 384, drawPosScreen);
export const pastryTray = () => reg('pastryTray', 512, 512, drawPastryTray);
export const cupSleeve = () => reg('cupSleeve', 256, 256, drawCupSleeve);
export const beans = () => reg('beans', 256, 256, drawBeans);
export const ceilingPanel = () => reg('ceilingPanel', 256, 256, drawCeilingPanel);
export const tumblerLid = () => reg('tumblerLid', 128, 128, drawTumblerLid);
export const apronPatch = () => reg('apronPatch', 128, 128, drawApronPatch);
export const noise = () => reg('noise', 256, 256, drawNoise);

export function clearTextureCache() {
  for (const texture of cache.values()) texture.dispose();
  cache.clear();
}
