// STUB — owned by agent-terminal.
import * as THREE from 'three';
export function buildTerminal(ctx) { return { group: new THREE.Group(), colliders: [], interactables: [] }; }
export function buildLighting(ctx) {
  const g = new THREE.Group();
  g.add(new THREE.HemisphereLight(0xFFF6E8, 0x8C7F70, 2.0));
  const d = new THREE.DirectionalLight(0xFFFFFF, 1.0); d.position.set(6, 12, 8); g.add(d);
  return { group: g };
}
