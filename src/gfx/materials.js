// STUB — owned by agent-tex.
import * as THREE from 'three';
const cache = new Map();
const COLORS = {
  oak: 0xC8A57B, oakDark: 0xA8865C, worktop: 0xEDE8E0, mural: 0xF2A65A, coral: 0xE2593C,
  blackMatte: 0x14161A, blackGloss: 0x1B1E24, chrome: 0xD8DCE0, steel: 0xA9AFB6,
  glass: 0xBFD8DD, screen: 0xFFFFFF, screenDim: 0x8892A0, floor: 0xD8CFC0, ceiling: 0xF3F1EC,
  wallWhite: 0xEFEDE8, apronGreen: 0x1E6B4F, skin: 0xC9A07C, cloth: 0x6B7078,
  cardboard: 0xB08D57, ice: 0xDCEEF5, milk: 0xFAF6EE, espresso: 0x3A211A, foam: 0xF3E6CE,
  paperCup: 0xF6F3EC, plasticLid: 0x2A2C31, greenSign: 0x1E7A46, redSign: 0xE4002B,
  yellowSign: 0xF5C518, rubber: 0x2A2A2C,
};
export function initMaterials() {}
export function get(name) {
  if (cache.has(name)) return cache.get(name);
  const c = COLORS[name] ?? 0xCCCCCC;
  const m = (name === 'glass')
    ? new THREE.MeshPhysicalMaterial({ color: c, transparent: true, opacity: 0.22, roughness: 0.06, metalness: 0 })
    : (name === 'screen')
      ? new THREE.MeshBasicMaterial({ color: c })
      : new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, metalness: name === 'chrome' || name === 'steel' ? 0.85 : 0.05 });
  cache.set(name, m); return m;
}
