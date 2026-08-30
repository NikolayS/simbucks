// STUB — owned by agent-tex. Flat placeholder textures so the app boots.
import * as THREE from 'three';
const cache = new Map();
function flat(name, color, w = 64, h = 64) {
  if (cache.has(name)) return cache.get(name);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  cache.set(name, t); return t;
}
export const floorTile = () => flat('floorTile', '#D8CFC0');
export const oakSlat = () => flat('oakSlat', '#C8A57B');
export const worktop = () => flat('worktop', '#EDE8E0');
export const mural = () => flat('mural', '#F2A65A');
export const roundel = () => flat('roundel', '#00704A');
export const fasciaWordmark = () => flat('fasciaWordmark', '#14161A');
export const menuBoardA = () => flat('menuBoardA', '#FFFFFF');
export const menuBoardB = () => flat('menuBoardB', '#FFFFFF');
export const frappoPromo = () => flat('frappoPromo', '#F4EFE6');
export const wrapPromo = () => flat('wrapPromo', '#F4EFE6');
export const jet2 = () => flat('jet2', '#E4002B');
export const inMotionBanner = () => flat('inMotionBanner', '#F5C518');
export const brandPlaques = () => flat('brandPlaques', '#14161A');
export const gateSign = () => flat('gateSign', '#2A2D33');
export const discoverLondon = () => flat('discoverLondon', '#B9884F');
export const aeliaFront = () => flat('aeliaFront', '#101012');
export const posScreen = () => flat('posScreen', '#2A4A6B');
export const pastryTray = () => flat('pastryTray', '#C89B62');
export const cupSleeve = () => flat('cupSleeve', '#D8C7A8');
export const beans = () => flat('beans', '#3B2318');
export const ceilingPanel = () => flat('ceilingPanel', '#F3F1EC');
export const tumblerLid = () => flat('tumblerLid', '#F2F2F0');
export const apronPatch = () => flat('apronPatch', '#1E6B4F');
export const noise = () => flat('noise', '#808080');
export function clearTextureCache() { cache.clear(); }
