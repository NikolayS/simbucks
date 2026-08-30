// STUB — owned by agent-people.
import * as THREE from 'three';
export function makePerson() {
  const group = new THREE.Group();
  return { group, update() {}, walkTo() {}, face() {}, setPose() {}, say() {}, isMoving: () => false };
}
export function buildCrowd() { return { group: new THREE.Group() }; }
export function buildBaristaNPCs() { return { group: new THREE.Group() }; }
