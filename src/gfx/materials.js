import * as THREE from 'three';
import * as tex from './textures.js';

const cache = new Map();
let initialized = false;
let maxAnisotropy = 8;

const PALETTE = {
  oak: 0xC8A57B,
  oakDark: 0xA8865C,
  worktop: 0xEDE8E0,
  coral: 0xE2593C,
  blackMatte: 0x14161A,
  blackGloss: 0x1B1E24,
  chrome: 0xD8DCE0,
  steel: 0xA9AFB6,
  glass: 0xE8F2F4,
  screenDim: 0x8892A0,
  ceiling: 0xF3F1EC,
  wallWhite: 0xEFEDE8,
  apronGreen: 0x1E6B4F,
  skin: 0xC9A07C,
  cloth: 0x6B7078,
  cardboard: 0xB08D57,
  ice: 0xDCEEF5,
  milk: 0xFAF6EE,
  espresso: 0x3A211A,
  foam: 0xF3E6CE,
  paperCup: 0xF6F3EC,
  plasticLid: 0x2A2C31,
  greenSign: 0x1E7A46,
  rubber: 0x2A2A2C,
  white: 0xFFFFFF,
};

const screen = (texture, emissiveIntensity = 1.1, color = PALETTE.white) => ({
  texture,
  emissiveMap: true,
  color,
  emissive: PALETTE.white,
  emissiveIntensity,
  roughness: 0.9,
  metalness: 0,
  toneMapped: false,
});

const litGraphic = (texture, emissiveIntensity, extra = {}) => ({
  texture,
  emissiveMap: true,
  color: PALETTE.white,
  emissive: PALETTE.white,
  emissiveIntensity,
  roughness: 0.75,
  metalness: 0,
  ...extra,
});

const MATERIAL_SPECS = {
  // A 2x repeat makes each 0.54 m oak texture cover roughly 1 m of joinery per UV unit.
  oak: { texture: 'oakSlat', repeat: [2, 2], color: PALETTE.oak, roughness: 0.62, metalness: 0 },
  oakDark: { texture: 'oakSlat', repeat: [2, 2], color: PALETTE.oakDark, roughness: 0.68, metalness: 0 },
  worktop: { texture: 'worktop', repeat: [2, 2], color: PALETTE.worktop, roughness: 0.35, metalness: 0.02 },
  mural: { texture: 'mural', color: PALETTE.white, roughness: 0.85, metalness: 0 },
  coral: { color: PALETTE.coral, roughness: 0.45, metalness: 0.05 },
  blackMatte: { color: PALETTE.blackMatte, roughness: 0.92, metalness: 0 },
  blackGloss: { color: PALETTE.blackGloss, roughness: 0.22, metalness: 0.15 },
  chrome: { color: PALETTE.chrome, roughness: 0.14, metalness: 0.95 },
  steel: { color: PALETTE.steel, roughness: 0.32, metalness: 0.88 },
  glass: {
    material: 'physical', color: PALETTE.glass, transparent: true, opacity: 0.28,
    roughness: 0.05, metalness: 0, transmission: 0.9, thickness: 0.02, ior: 1.5,
    depthWrite: false, side: THREE.DoubleSide,
  },
  screen: screen('menuBoardA'),
  screenDim: screen('menuBoardA', 0.35, PALETTE.screenDim),
  // 2x2 tiles fill 2.4 m; the terminal floor spans 68 m by 60 m.
  floor: { texture: 'floorTile', repeat: [68 / 2.4, 60 / 2.4], color: PALETTE.white, roughness: 0.42, metalness: 0.02 },
  ceiling: { texture: 'ceilingPanel', repeat: [34, 30], color: PALETTE.ceiling, roughness: 0.95, metalness: 0 },
  wallWhite: { color: PALETTE.wallWhite, roughness: 0.9, metalness: 0 },
  apronGreen: { color: PALETTE.apronGreen, roughness: 0.75, metalness: 0 },
  skin: { color: PALETTE.skin, roughness: 0.85, metalness: 0 },
  cloth: { color: PALETTE.cloth, roughness: 0.95, metalness: 0 },
  cardboard: { color: PALETTE.cardboard, roughness: 0.95, metalness: 0 },
  ice: {
    material: 'physical', color: PALETTE.ice, transparent: true, opacity: 0.55,
    roughness: 0.1, metalness: 0, transmission: 0.7, depthWrite: false,
  },
  milk: { color: PALETTE.milk, roughness: 0.6, metalness: 0 },
  espresso: { color: PALETTE.espresso, roughness: 0.35, metalness: 0 },
  foam: { color: PALETTE.foam, roughness: 0.95, metalness: 0 },
  paperCup: { color: PALETTE.paperCup, roughness: 0.8, metalness: 0 },
  plasticLid: { color: PALETTE.plasticLid, roughness: 0.4, metalness: 0.05 },
  greenSign: {
    color: PALETTE.greenSign, emissive: PALETTE.greenSign,
    emissiveIntensity: 0.35, roughness: 0.75, metalness: 0,
  },
  redSign: litGraphic('jet2', 0.85, { roughness: 0.7, toneMapped: false }),
  yellowSign: litGraphic('inMotionBanner', 0.7, { roughness: 0.7, toneMapped: false }),
  rubber: { color: PALETTE.rubber, roughness: 0.97, metalness: 0 },

  screenMenuA: screen('menuBoardA'),
  screenMenuB: screen('menuBoardB'),
  screenFrappo: screen('frappoPromo'),
  screenWrap: screen('wrapPromo'),
  screenPos: screen('posScreen', 1.0),
  roundelSign: litGraphic('roundel', 1.0, {
    transparent: true, toneMapped: false, side: THREE.DoubleSide, alphaTest: 0.35,
  }),
  wordmark: litGraphic('fasciaWordmark', 0.9, {
    transparent: true, toneMapped: false, alphaTest: 0.25,
  }),
  brandPlaques: { texture: 'brandPlaques', color: PALETTE.white, roughness: 0.75, metalness: 0 },
  gateSign: litGraphic('gateSign', 0.25),
  discoverLondon: litGraphic('discoverLondon', 0.4),
  aeliaFront: litGraphic('aeliaFront', 0.5),
  pastryTray: { texture: 'pastryTray', color: PALETTE.white, roughness: 0.8, metalness: 0 },
  beans: { texture: 'beans', repeat: [2, 2], color: PALETTE.white, roughness: 0.9, metalness: 0 },
  cupSleeve: { texture: 'cupSleeve', color: PALETTE.white, roughness: 0.9, metalness: 0 },
  tumblerLid: { texture: 'tumblerLid', color: PALETTE.white, roughness: 0.45, metalness: 0 },
  apronPatch: { texture: 'apronPatch', color: PALETTE.white, roughness: 0.9, metalness: 0 },
};

function clampMapAnisotropy(texture) {
  if (!texture) return;
  const requested = Number.isFinite(texture.anisotropy) && texture.anisotropy > 0
    ? texture.anisotropy
    : 8;
  const anisotropy = Math.min(requested, maxAnisotropy);
  if (texture.anisotropy !== anisotropy) {
    texture.anisotropy = anisotropy;
    texture.needsUpdate = true;
  }
}

function mapped(texFn, repeatX = 1, repeatY = 1) {
  try {
    let texture = texFn();
    if (!texture || typeof document === 'undefined') return null;
    if (repeatX !== 1 || repeatY !== 1) {
      texture = texture.clone();
      texture.needsUpdate = true;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(repeatX, repeatY);
    }
    clampMapAnisotropy(texture);
    return texture;
  } catch {
    return null;
  }
}

function makeMaterial(name) {
  if (cache.has(name)) return cache.get(name);
  const spec = MATERIAL_SPECS[name];
  let material;
  try {
    if (!spec) throw new Error('Unknown material');
    const { material: kind, texture, repeat, emissiveMap, ...parameters } = spec;
    if (texture) {
      const map = mapped(tex[texture], ...(repeat ?? []));
      if (map) {
        parameters.map = map;
        if (emissiveMap) parameters.emissiveMap = map;
      }
    }
    const Material = kind === 'physical' ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
    material = new Material(parameters);
  } catch {
    material = new THREE.MeshStandardMaterial({ color: 0xCCCCCC, roughness: 0.8 });
  }
  material.name = name;
  cache.set(name, material);
  return material;
}

export function initMaterials(ctx) {
  if (initialized) return;
  initialized = true;
  try {
    const supported = ctx?.renderer?.capabilities?.getMaxAnisotropy?.();
    if (Number.isFinite(supported) && supported > 0) maxAnisotropy = supported;
  } catch {
    maxAnisotropy = 8;
  }
  for (const material of cache.values()) {
    clampMapAnisotropy(material.map);
    if (material.emissiveMap !== material.map) clampMapAnisotropy(material.emissiveMap);
  }
  for (const name of Object.keys(MATERIAL_SPECS)) makeMaterial(name);
}

export function get(name) {
  return makeMaterial(String(name));
}
