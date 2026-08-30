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

const screen = (texture, emissiveIntensity = 1.15, color = PALETTE.white) => ({
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
  oak: {
    texture: 'oakSlat', repeat: [2, 2], roughnessMap: ['oakRough', 2, 2],
    normalMap: ['oakNormal', 2, 2], normalScale: [0.5, 0.5],
    color: PALETTE.oak, roughness: 0.72, metalness: 0,
  },
  oakDark: {
    texture: 'oakSlat', repeat: [2, 2], roughnessMap: ['oakRough', 2, 2],
    normalMap: ['oakNormal', 2, 2], normalScale: [0.5, 0.5],
    color: PALETTE.oakDark, roughness: 0.78, metalness: 0,
  },
  worktop: {
    material: 'physical', texture: 'worktop', repeat: [2, 2],
    roughnessMap: ['worktopRough', 2, 2], normalMap: ['worktopNormal', 3, 3],
    normalScale: [0.18, 0.18], color: PALETTE.worktop, roughness: 0.55, metalness: 0,
    clearcoat: 0.28, clearcoatRoughness: 0.16,
  },
  mural: {
    texture: 'mural', roughnessMap: ['paintRough', 4, 4], normalMap: ['paintNormal', 4, 4],
    normalScale: [0.15, 0.15], color: PALETTE.white, roughness: 0.92, metalness: 0,
  },
  coral: { color: PALETTE.coral, roughness: 0.40, metalness: 0, envMapIntensity: 0.9 },
  blackMatte: { color: PALETTE.blackMatte, roughness: 0.90, metalness: 0 },
  blackGloss: {
    color: PALETTE.blackGloss, roughness: 0.34, metalness: 0,
    roughnessMap: ['smudgeRough', 2, 2], envMapIntensity: 1.0,
  },
  // Not a full 1.0: the last few percent of diffuse is what keeps metals legible on the
  // fallback path where render.js never assigns scene.environment.
  chrome: {
    color: PALETTE.chrome, roughness: 0.18, metalness: 0.94,
    roughnessMap: ['smudgeRough', 1.5, 1.5], envMapIntensity: 1.25,
  },
  steel: {
    color: PALETTE.steel, roughness: 0.62, metalness: 0.92,
    roughnessMap: ['brushedRough', 4, 4], normalMap: ['brushedNormal', 4, 4],
    normalScale: [0.12, 0.12], envMapIntensity: 1.15,
  },
  glass: {
    material: 'physical', color: 0xF0F6F7, transparent: true, opacity: 0.30,
    roughness: 0.04, metalness: 0, transmission: 0.92, thickness: 0.012, ior: 1.5,
    envMapIntensity: 1.2, depthWrite: false, side: THREE.DoubleSide,
  },
  screen: screen('menuBoardA'),
  screenDim: screen('menuBoardA', 0.30, PALETTE.screenDim),
  // 1.2 m per tile texture, matching what world/terminal.js recomputes for the floor
  // plane, so the grout break in the roughness map lands on the drawn grout.
  floor: {
    texture: 'floorTile', repeat: [68 / 1.2, 60 / 1.2],
    roughnessMap: ['floorRough', 68 / 1.2, 60 / 1.2],
    normalMap: ['floorNormal', 68 / 1.2, 60 / 1.2], normalScale: [0.28, 0.28],
    color: PALETTE.white, roughness: 0.55, metalness: 0, envMapIntensity: 1.0,
  },
  ceiling: { texture: 'ceilingPanel', repeat: [34, 30], color: PALETTE.ceiling, roughness: 0.95, metalness: 0 },
  wallWhite: { color: PALETTE.wallWhite, roughness: 0.93, metalness: 0 },
  apronGreen: {
    color: PALETTE.apronGreen, roughness: 0.92, metalness: 0,
    normalMap: ['fabricNormal', 7, 7], normalScale: [0.25, 0.25], envMapIntensity: 0.4,
  },
  skin: { color: PALETTE.skin, roughness: 0.68, metalness: 0, envMapIntensity: 0.55 },
  cloth: {
    color: PALETTE.cloth, roughness: 0.98, metalness: 0,
    normalMap: ['fabricNormal', 6, 6], normalScale: [0.30, 0.30], envMapIntensity: 0.4,
  },
  cardboard: {
    color: PALETTE.cardboard, roughness: 0.96, metalness: 0,
    normalMap: ['paintNormal', 6, 6], normalScale: [0.10, 0.10],
  },
  ice: {
    material: 'physical', color: PALETTE.ice, transparent: true, opacity: 0.58,
    roughness: 0.14, metalness: 0, transmission: 0.85, thickness: 0.02, ior: 1.31,
    depthWrite: false, envMapIntensity: 1.0,
  },
  milk: { color: PALETTE.milk, roughness: 0.55, metalness: 0 },
  espresso: { color: PALETTE.espresso, roughness: 0.22, metalness: 0 },
  foam: { color: PALETTE.foam, roughness: 0.95, metalness: 0 },
  paperCup: {
    color: PALETTE.paperCup, roughness: 0.82, metalness: 0,
    normalMap: ['paintNormal', 3, 3], normalScale: [0.08, 0.08],
  },
  plasticLid: { color: PALETTE.plasticLid, roughness: 0.40, metalness: 0 },
  greenSign: {
    color: PALETTE.greenSign, emissive: PALETTE.greenSign,
    emissiveIntensity: 0.55, roughness: 0.75, metalness: 0,
  },
  redSign: litGraphic('jet2', 0.32, { roughness: 0.7 }),
  yellowSign: litGraphic('inMotionBanner', 0.28, { roughness: 0.7 }),
  rubber: {
    color: PALETTE.rubber, roughness: 0.98, metalness: 0,
    normalMap: ['fabricNormal', 10, 10], normalScale: [0.22, 0.22],
  },

  screenMenuA: screen('menuBoardA'),
  screenMenuB: screen('menuBoardB'),
  screenFrappo: screen('frappoPromo'),
  screenWrap: screen('wrapPromo'),
  screenPos: screen('posScreen', 1.0),
  roundelSign: litGraphic('roundel', 1.05, {
    transparent: true, toneMapped: false, side: THREE.DoubleSide, alphaTest: 0.35,
  }),
  wordmark: litGraphic('fasciaWordmark', 0.55, {
    transparent: true, toneMapped: false, alphaTest: 0.25,
  }),
  brandPlaques: { texture: 'brandPlaques', color: PALETTE.white, roughness: 0.75, metalness: 0 },
  gateSign: litGraphic('gateSign', 0.30),
  discoverLondon: { texture: 'discoverLondon', color: PALETTE.white, roughness: 0.45, metalness: 0 },
  aeliaFront: { texture: 'aeliaFront', color: PALETTE.white, roughness: 0.50, metalness: 0 },
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
    const {
      material: kind, texture, repeat, emissiveMap,
      roughnessMap, normalMap, metalnessMap, normalScale,
      ...parameters
    } = spec;
    if (texture) {
      const map = mapped(tex[texture], ...(repeat ?? []));
      if (map) {
        parameters.map = map;
        if (emissiveMap) parameters.emissiveMap = map;
      }
    }
    for (const [slot, mapSpec] of Object.entries({ roughnessMap, normalMap, metalnessMap })) {
      if (!Array.isArray(mapSpec)) continue;
      const [textureName, repeatX, repeatY] = mapSpec;
      const map = mapped(tex[textureName], repeatX, repeatY);
      if (map) parameters[slot] = map;
    }
    if (Array.isArray(normalScale)) {
      parameters.normalScale = new THREE.Vector2(normalScale[0], normalScale[1]);
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
  const clampedMaps = new Set();
  for (const material of cache.values()) {
    for (const map of [
      material.map, material.emissiveMap, material.normalMap,
      material.roughnessMap, material.metalnessMap,
    ]) {
      if (!map || clampedMaps.has(map)) continue;
      clampedMaps.add(map);
      clampMapAnisotropy(map);
    }
  }
  for (const name of Object.keys(MATERIAL_SPECS)) makeMaterial(name);
}

export function get(name) {
  return makeMaterial(String(name));
}
