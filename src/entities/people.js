/*
 * SIM*BUCKS people owns the reusable low-poly character rig, procedural poses,
 * ambient terminal population, and two working baristas. Rig hierarchy:
 * group > root > hips > spine/head/arms and hips > thighs/knees/shins, with
 * speech anchored to root. The 248-triangle base rig peaks at about 404
 * triangles with hair, tote, and phone; the capped 28-person population stays
 * below 11,312 triangles, comfortably under the 30,000-triangle module budget.
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// GEOMETRY
// ---------------------------------------------------------------------------

// Shared unit primitives: box 12, open six-sided cylinder 12, torso 24,
// 8x6 sphere 80, plane 2 triangles. Worst configured person: ~404 triangles.
const BOX_GEO = new THREE.BoxGeometry(1, 1, 1);
const LIMB_GEO = new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1, true);
const TORSO_GEO = new THREE.CylinderGeometry(0.5, 0.36, 1, 6, 1, false);
const SPHERE_GEO = new THREE.SphereGeometry(0.5, 8, 6);
const PLANE_GEO = new THREE.PlaneGeometry(1, 1);

const TAU = Math.PI * 2;
const HALF_PI = Math.PI * 0.5;
const STOP_DISTANCE = 0.15;
const MAX_YAW_RATE = 4.0;
const BUBBLE_LIFE = 2.5;
const BUBBLE_POP = 0.12;
const BUBBLE_FADE = 0.45;
const ADULT_AUTHORED_HEIGHT = 1.785;
const CHILD_AUTHORED_HEIGHT = 1.285;

// Module scratch is shared because updates run serially on the main thread.
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

// Safe corridor loops use only coordinates not represented by layout.js.
const BASE_PATHS = [
  [-24, -8, -4, -8, 12, -8, 12, 10, 0, 10, -24, 10],
  [11, -8, 25, -8, 25, 12, 18, 12, 11, 12],
  [-27, -9, -22, -9, -22, 13, -27, 13],
  [-8, 5.2, 2, 5.2, 16, 5.2, 25, 8, 25, 12, -8, 12],
  [-8, -9, 8, -9, 9, -6, 0, -4.8, -8, -4.8],
];

// ---------------------------------------------------------------------------
// MATERIALS
// ---------------------------------------------------------------------------

const COLOR_MATERIALS = new Map();

// Lambert is deliberately used for varied colours: it is cheap and suits the flat style.
function colourMaterial(hex) {
  const key = Number(hex) >>> 0;
  let material = COLOR_MATERIALS.get(key);
  if (!material) {
    material = new THREE.MeshLambertMaterial({ color: key });
    COLOR_MATERIALS.set(key, material);
  }
  return material;
}

const PHONE_BODY_MAT = colourMaterial(0x20242A);
const PHONE_FACE_MAT = new THREE.MeshLambertMaterial({
  color: 0x6FA8BA,
  emissive: 0x315E70,
  emissiveIntensity: 0.85,
});
const PHONE_HALO_MAT = new THREE.MeshBasicMaterial({
  color: 0x8ED8EA,
  transparent: true,
  opacity: 0.16,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
});

const SKIN_TONES = [0xF2D3B8, 0xE0B48C, 0xC68C5E, 0x9C6440, 0x6E4327];
const HAIR_COLOURS = [0x1B1512, 0x3A2A1E, 0x6B4A2E, 0x8C7A5E, 0xBFA981, 0x2B2B2E];
const TRAVEL_COLOURS = [
  0x3B3F46, 0x2B3A54, 0xE8DFCE, 0x6E7355, 0xCBBB9F,
  0xC29494, 0x6B7078, 0xA85C3C,
];
const BEANIE_COLOURS = [0x3B3F46, 0x2B3A54, 0x6E7355, 0xA85C3C];

function namedMaterial(ctx, name, fallback) {
  try {
    const material = ctx?.mat?.get?.(name);
    if (material) return material;
  } catch (_) {
    // A material stub must never prevent population construction.
  }
  return colourMaterial(fallback);
}

// ---------------------------------------------------------------------------
// RIG
// ---------------------------------------------------------------------------

function clamp(value, lo, hi) {
  return value < lo ? lo : value > hi ? hi : value;
}

function damp(current, target, response, dt) {
  return current + (target - current) * (1 - Math.exp(-response * dt));
}

function wrapAngle(angle) {
  angle %= TAU;
  if (angle > Math.PI) angle -= TAU;
  if (angle < -Math.PI) angle += TAU;
  return angle;
}

function smoothstep01(value) {
  value = clamp(value, 0, 1);
  return value * value * (3 - 2 * value);
}

function hashSeed(value) {
  if (Number.isFinite(value)) return Number(value) >>> 0;
  const text = String(value ?? 'person');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function makeRng(seed) {
  let state = hashSeed(seed) || 0x6D2B79F5;
  return function seededRandom() {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function contextRandom(ctx) {
  try {
    const value = ctx?.rng?.();
    if (Number.isFinite(value)) return clamp(value, 0, 0.999999999);
  } catch (_) {
    // The fixed fallback keeps even a partial context deterministic.
  }
  return 0.417213;
}

function addMesh(parent, geometry, material, name, x, y, z, sx, sy, sz, casts) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.castShadow = Boolean(casts);
  mesh.receiveShadow = false;
  parent.add(mesh);
  return mesh;
}

function makeFallbackPerson() {
  const group = new THREE.Group();
  let moving = false;
  return {
    group,
    update() {},
    walkTo() { moving = false; },
    face() {},
    setPose() { moving = false; },
    say() {},
    isMoving() { return moving; },
  };
}

function createPerson(ctx, options) {
  const opts = options || {};
  const palette = opts.palette || null;
  const seed = opts.seed == null ? Math.floor(contextRandom(ctx) * 0xFFFFFFFF) : opts.seed;
  const random = makeRng(seed);
  const role = opts.role === 'barista' || opts.role === 'customer' ? opts.role : 'passenger';
  const isChild = Boolean(opts.child || (palette && !Array.isArray(palette) && palette.child));
  const authoredHeight = isChild ? CHILD_AUTHORED_HEIGHT : ADULT_AUTHORED_HEIGHT;
  const targetHeight = isChild ? 1.05 + random() * 0.25 : 1.55 + random() * 0.37;
  const extraScale = Number.isFinite(opts.scale) && opts.scale > 0 ? opts.scale : 1;
  const personScale = targetHeight / authoredHeight * extraScale;
  const heightMetres = targetHeight * extraScale;

  const legThigh = isChild ? 0.25 : 0.40;
  const legShin = isChild ? 0.27 : 0.42;
  const hipHeight = legThigh + legShin;
  const torsoHeight = isChild ? 0.38 : 0.50;
  const spineRise = isChild ? 0.07 : 0.09;
  const neckLength = isChild ? 0.055 : 0.08;
  const headRadius = isChild ? 0.12 : 0.125;
  const shoulderWidth = isChild ? 0.29 : 0.405;
  const hipWidth = isChild ? 0.225 : 0.29;
  const torsoDepth = isChild ? 0.155 : 0.19;
  const upperLength = isChild ? 0.235 : 0.30;
  const foreLength = isChild ? 0.21 : 0.28;
  const limbWidth = isChild ? 0.068 : 0.082;
  const skinChoice = palette && !Array.isArray(palette) && Number.isFinite(palette.skin)
    ? (palette.skin <= 4 ? SKIN_TONES[Math.floor(palette.skin)] : palette.skin)
    : SKIN_TONES[Math.floor(random() * SKIN_TONES.length)];
  const skinMat = colourMaterial(skinChoice);
  const blackMat = namedMaterial(ctx, 'blackMatte', 0x14161A);
  const apronMat = namedMaterial(ctx, 'apronGreen', 0x1E6B4F);
  const chromeMat = namedMaterial(ctx, 'chrome', 0xD8DCE0);
  const rubberMat = namedMaterial(ctx, 'rubber', 0x2A2A2C);

  let topColour = TRAVEL_COLOURS[Math.floor(random() * TRAVEL_COLOURS.length)];
  let trouserColour = TRAVEL_COLOURS[Math.floor(random() * TRAVEL_COLOURS.length)];
  if (palette && Array.isArray(palette) && palette.length) {
    topColour = palette[Math.floor(random() * palette.length)];
    trouserColour = palette[Math.floor(random() * palette.length)];
  } else if (palette && !Array.isArray(palette)) {
    if (Number.isFinite(palette.top)) topColour = palette.top;
    if (Number.isFinite(palette.trousers)) trouserColour = palette.trousers;
  }
  if (role !== 'barista' && random() < 0.05) topColour = 0xE8E23A;
  if (trouserColour === topColour) {
    let colourIndex = TRAVEL_COLOURS.indexOf(trouserColour);
    colourIndex = (colourIndex + 1 + Math.floor(random() * (TRAVEL_COLOURS.length - 1))) % TRAVEL_COLOURS.length;
    trouserColour = TRAVEL_COLOURS[colourIndex];
  }
  const topMat = role === 'barista' ? blackMat : colourMaterial(topColour);
  const trouserMat = role === 'barista' ? colourMaterial(0x272B31) : colourMaterial(trouserColour);

  const group = new THREE.Group();
  group.name = role === 'barista' ? 'barista' : isChild ? 'childPassenger' : 'passenger';
  group.scale.setScalar(personScale);
  group.userData.seatHeight = Number.isFinite(opts.seatHeight) ? opts.seatHeight : 0.45;
  group.userData.workDriftYaw = 0;
  group.userData.workSway = 0;

  const root = new THREE.Object3D();
  root.name = 'root';
  group.add(root);

  const hips = new THREE.Object3D();
  hips.name = 'hips';
  hips.position.y = hipHeight;
  root.add(hips);
  const shadowRig = role === 'barista';
  addMesh(hips, BOX_GEO, trouserMat, 'pelvis', 0, 0.035, 0, hipWidth, 0.16, 0.18, shadowRig);

  const spine = new THREE.Object3D();
  spine.name = 'spine';
  spine.position.y = spineRise;
  hips.add(spine);
  addMesh(
    spine, TORSO_GEO, topMat, 'torso', 0, torsoHeight * 0.5, 0,
    shoulderWidth, torsoHeight, torsoDepth, shadowRig,
  );

  const neck = new THREE.Object3D();
  neck.name = 'neck';
  neck.position.y = torsoHeight;
  spine.add(neck);
  addMesh(neck, LIMB_GEO, skinMat, 'neckMesh', 0, neckLength * 0.5, 0, 0.075, neckLength, 0.075, false);

  const head = new THREE.Object3D();
  head.name = 'head';
  head.position.y = neckLength;
  neck.add(head);
  addMesh(
    head, SPHERE_GEO, skinMat, 'skull', 0, headRadius, 0,
    headRadius * 2, headRadius * 2.08, headRadius * 1.9, shadowRig,
  );

  let headwear = palette && !Array.isArray(palette) ? palette.headwear : null;
  if (role === 'barista') {
    if (headwear !== 'headscarf' && headwear !== 'cap') headwear = random() < 0.34 ? 'headscarf' : 'cap';
    if (headwear === 'headscarf') {
      const scarfMat = colourMaterial(0x23262B);
      addMesh(
        head, SPHERE_GEO, scarfMat, 'headscarfCap', 0, headRadius * 1.23, -headRadius * 0.05,
        headRadius * 2.12, headRadius * 1.55, headRadius * 2.1, false,
      );
      addMesh(
        head, BOX_GEO, scarfMat, 'headscarfDrape', 0, -0.015, -headRadius * 0.76,
        headRadius * 1.55, headRadius * 1.75, 0.055, false,
      );
    } else {
      addMesh(
        head, LIMB_GEO, blackMat, 'capCrown', 0, headRadius * 2.03, 0,
        headRadius * 1.82, 0.055, headRadius * 1.82, false,
      );
      addMesh(
        head, BOX_GEO, blackMat, 'capPeak', 0, headRadius * 1.93, headRadius * 0.92,
        0.16, 0.025, 0.11, false,
      );
    }
  } else {
    const hairRoll = random();
    if (hairRoll >= 0.10 && hairRoll < 0.23) {
      const beanieMat = colourMaterial(BEANIE_COLOURS[Math.floor(random() * BEANIE_COLOURS.length)]);
      addMesh(
        head, SPHERE_GEO, beanieMat, 'beanie', 0, headRadius * 1.45, 0,
        headRadius * 2.08, headRadius * 1.25, headRadius * 2.02, false,
      );
      addMesh(
        head, LIMB_GEO, beanieMat, 'beanieBand', 0, headRadius * 1.55, 0,
        headRadius * 2.02, 0.045, headRadius * 2.02, false,
      );
    } else if (hairRoll >= 0.23) {
      const hairMat = colourMaterial(HAIR_COLOURS[Math.floor(random() * HAIR_COLOURS.length)]);
      addMesh(
        head, SPHERE_GEO, hairMat, 'hairCap', 0, headRadius * 1.48, -headRadius * 0.08,
        headRadius * 2.04, headRadius * 1.18, headRadius * 2.04, false,
      );
    }
  }

  const shoulderL = new THREE.Object3D();
  const shoulderR = new THREE.Object3D();
  shoulderL.name = 'shoulderL';
  shoulderR.name = 'shoulderR';
  shoulderL.position.set(-shoulderWidth * 0.52, torsoHeight * 0.82, 0);
  shoulderR.position.set(shoulderWidth * 0.52, torsoHeight * 0.82, 0);
  spine.add(shoulderL, shoulderR);
  addMesh(
    shoulderL, LIMB_GEO, topMat, 'upperArmL', 0, -upperLength * 0.5, 0,
    limbWidth, upperLength, limbWidth, false,
  );
  addMesh(
    shoulderR, LIMB_GEO, topMat, 'upperArmR', 0, -upperLength * 0.5, 0,
    limbWidth, upperLength, limbWidth, false,
  );

  const elbowL = new THREE.Object3D();
  const elbowR = new THREE.Object3D();
  elbowL.name = 'elbowL';
  elbowR.name = 'elbowR';
  elbowL.position.y = -upperLength;
  elbowR.position.y = -upperLength;
  shoulderL.add(elbowL);
  shoulderR.add(elbowR);
  addMesh(
    elbowL, LIMB_GEO, skinMat, 'foreArmL', 0, -foreLength * 0.5, 0,
    limbWidth * 0.9, foreLength, limbWidth * 0.9, false,
  );
  addMesh(
    elbowR, LIMB_GEO, skinMat, 'foreArmR', 0, -foreLength * 0.5, 0,
    limbWidth * 0.9, foreLength, limbWidth * 0.9, false,
  );

  const handL = new THREE.Object3D();
  const handR = new THREE.Object3D();
  handL.name = 'handL';
  handR.name = 'handR';
  handL.position.y = -foreLength;
  handR.position.y = -foreLength;
  elbowL.add(handL);
  elbowR.add(handR);

  const thighL = new THREE.Object3D();
  const thighR = new THREE.Object3D();
  thighL.name = 'thighL';
  thighR.name = 'thighR';
  thighL.position.set(-hipWidth * 0.27, -0.02, 0);
  thighR.position.set(hipWidth * 0.27, -0.02, 0);
  hips.add(thighL, thighR);
  addMesh(
    thighL, LIMB_GEO, trouserMat, 'thighMeshL', 0, -legThigh * 0.5, 0,
    limbWidth * 1.18, legThigh, limbWidth * 1.18, shadowRig,
  );
  addMesh(
    thighR, LIMB_GEO, trouserMat, 'thighMeshR', 0, -legThigh * 0.5, 0,
    limbWidth * 1.18, legThigh, limbWidth * 1.18, shadowRig,
  );

  const kneeL = new THREE.Object3D();
  const kneeR = new THREE.Object3D();
  kneeL.name = 'kneeL';
  kneeR.name = 'kneeR';
  kneeL.position.y = -legThigh;
  kneeR.position.y = -legThigh;
  thighL.add(kneeL);
  thighR.add(kneeR);
  addMesh(
    kneeL, LIMB_GEO, trouserMat, 'shinL', 0, -legShin * 0.5, 0,
    limbWidth, legShin, limbWidth, shadowRig,
  );
  addMesh(
    kneeR, LIMB_GEO, trouserMat, 'shinR', 0, -legShin * 0.5, 0,
    limbWidth, legShin, limbWidth, shadowRig,
  );
  addMesh(
    kneeL, BOX_GEO, rubberMat, 'footL', 0, -legShin - 0.015, 0.055,
    limbWidth * 1.2, 0.06, 0.17, false,
  );
  addMesh(
    kneeR, BOX_GEO, rubberMat, 'footR', 0, -legShin - 0.015, 0.055,
    limbWidth * 1.2, 0.06, 0.17, false,
  );

  if (role === 'barista') {
    const apronFront = torsoDepth * 0.53 + 0.008;
    addMesh(
      spine, BOX_GEO, apronMat, 'apronBib', 0, torsoHeight * 0.64, apronFront,
      shoulderWidth * 0.43, torsoHeight * 0.38, 0.016, false,
    );
    addMesh(
      spine, BOX_GEO, apronMat, 'apronSkirt', 0, torsoHeight * 0.25, apronFront,
      shoulderWidth * 0.68, torsoHeight * 0.40, 0.018, false,
    );
    const strapL = addMesh(
      spine, BOX_GEO, apronMat, 'apronStrapL', -shoulderWidth * 0.16, torsoHeight * 0.83, apronFront,
      0.035, torsoHeight * 0.36, 0.014, false,
    );
    const strapR = addMesh(
      spine, BOX_GEO, apronMat, 'apronStrapR', shoulderWidth * 0.16, torsoHeight * 0.83, apronFront,
      0.035, torsoHeight * 0.36, 0.014, false,
    );
    strapL.rotation.z = -0.24;
    strapR.rotation.z = 0.24;
    addMesh(
      spine, BOX_GEO, apronMat, 'apronKnot', 0, torsoHeight * 0.14, -torsoDepth * 0.54,
      0.085, 0.055, 0.045, false,
    );
  }

  let bagType = opts.bag;
  if (bagType !== 'none' && bagType !== 'backpack' && bagType !== 'tote' && bagType !== 'roller') {
    const bagRoll = random();
    bagType = bagRoll < 0.42 ? 'none' : bagRoll < 0.68 ? 'backpack' : bagRoll < 0.86 ? 'tote' : 'roller';
  }
  if (role === 'barista') bagType = 'none';
  const bagMat = colourMaterial(TRAVEL_COLOURS[Math.floor(random() * TRAVEL_COLOURS.length)]);
  let rollerGroup = null;
  if (bagType === 'backpack') {
    addMesh(
      spine, BOX_GEO, bagMat, 'backpack', 0, torsoHeight * 0.47, -torsoDepth * 0.66,
      shoulderWidth * 0.64, torsoHeight * 0.55, 0.14, false,
    );
    addMesh(
      spine, BOX_GEO, bagMat, 'backpackStrapL', -shoulderWidth * 0.23, torsoHeight * 0.58, -torsoDepth * 0.50,
      0.025, torsoHeight * 0.52, 0.025, false,
    );
    addMesh(
      spine, BOX_GEO, bagMat, 'backpackStrapR', shoulderWidth * 0.23, torsoHeight * 0.58, -torsoDepth * 0.50,
      0.025, torsoHeight * 0.52, 0.025, false,
    );
  } else if (bagType === 'tote') {
    addMesh(
      spine, BOX_GEO, bagMat, 'tote', shoulderWidth * 0.83, 0.03, 0,
      0.30, 0.32, 0.075, false,
    );
    addMesh(
      spine, BOX_GEO, bagMat, 'toteStrapOuter', shoulderWidth * 0.77, torsoHeight * 0.38, 0,
      0.025, 0.44, 0.025, false,
    );
    addMesh(
      spine, BOX_GEO, bagMat, 'toteStrapInner', shoulderWidth * 0.48, torsoHeight * 0.53, 0,
      0.025, 0.25, 0.025, false,
    );
    addMesh(
      spine, BOX_GEO, bagMat, 'toteStrapTop', shoulderWidth * 0.63, torsoHeight * 0.66, 0,
      shoulderWidth * 0.31, 0.025, 0.025, false,
    );
  } else if (bagType === 'roller') {
    rollerGroup = new THREE.Object3D();
    rollerGroup.name = 'rollerBag';
    rollerGroup.position.set(0.24, -0.47, -0.12);
    rollerGroup.rotation.x = -Math.PI * 0.10;
    handR.add(rollerGroup);
    addMesh(rollerGroup, BOX_GEO, bagMat, 'rollerCase', 0, 0, 0, 0.36, 0.55, 0.22, false);
    const wheelL = addMesh(rollerGroup, LIMB_GEO, rubberMat, 'rollerWheelL', -0.13, -0.295, 0, 0.055, 0.035, 0.055, false);
    const wheelR = addMesh(rollerGroup, LIMB_GEO, rubberMat, 'rollerWheelR', 0.13, -0.295, 0, 0.055, 0.035, 0.055, false);
    wheelL.rotation.z = HALF_PI;
    wheelR.rotation.z = HALF_PI;
    addMesh(rollerGroup, BOX_GEO, chromeMat, 'rollerHandleL', -0.09, 0.38, -0.03, 0.016, 0.42, 0.016, false);
    addMesh(rollerGroup, BOX_GEO, chromeMat, 'rollerHandleR', 0.09, 0.38, -0.03, 0.016, 0.42, 0.016, false);
    addMesh(rollerGroup, BOX_GEO, chromeMat, 'rollerGrip', 0, 0.59, -0.03, 0.20, 0.022, 0.022, false);
  }

  const forcedPhone = palette && !Array.isArray(palette) && palette.phone;
  const hasPhone = bagType !== 'roller' && (forcedPhone === true || (forcedPhone !== false && random() < 0.20));
  let phoneRoot = null;
  if (hasPhone) {
    phoneRoot = new THREE.Object3D();
    phoneRoot.name = 'phone';
    phoneRoot.position.set(0, -0.015, 0.025);
    phoneRoot.rotation.x = -0.08;
    handR.add(phoneRoot);
    addMesh(phoneRoot, BOX_GEO, PHONE_BODY_MAT, 'phoneBody', 0, 0.015, 0, 0.075, 0.13, 0.012, false);
    addMesh(phoneRoot, PLANE_GEO, PHONE_FACE_MAT, 'phoneFace', 0, 0.015, 0.0065, 0.064, 0.112, 1, false);
    addMesh(phoneRoot, PLANE_GEO, PHONE_HALO_MAT, 'phoneGlow', 0, 0.015, 0.011, 0.092, 0.145, 1, false);
    phoneRoot.visible = false;
  }

  const bubbleAnchor = new THREE.Object3D();
  bubbleAnchor.name = 'bubbleAnchor';
  const skullTop = hipHeight + spineRise + torsoHeight + neckLength + headRadius * 2.04;
  bubbleAnchor.position.y = skullTop + 0.28 / personScale;
  root.add(bubbleAnchor);

  let bubbleCanvas = null;
  let bubbleContext = null;
  let bubbleTexture = null;
  let bubbleMaterial = null;
  let bubbleSprite = null;
  let bubbleTime = 0;

  let pose = 'idle';
  let previousNonWalkPose = 'idle';
  let poseSerial = 0;
  let walkSerial = 0;
  let restorePose = 'idle';
  let targetActive = false;
  let targetSpeed = 1.2;
  let desiredYaw = group.rotation.y;
  let faceActive = false;
  const walkTarget = new THREE.Vector3();
  let animationTime = random() * 50;
  let stridePhase = random() * TAU;
  let lookWait = 3 + random() * 5;
  let lookStage = 0;
  let lookStageTime = 0;
  let lookYaw = 0;
  let lookPitch = 0;
  let workTime = random() * 20;
  const beatDurations = new Float32Array(5);
  let workTotal = 0;
  for (let i = 0; i < beatDurations.length; i += 1) {
    beatDurations[i] = 0.82 + random() * 0.48;
    workTotal += beatDurations[i];
  }
  const workOffset = random() * workTotal;
  const wipePasses = random() < 0.5 ? 2 : 3;

  function seatRootY() {
    const scaleY = Math.abs(group.scale.y) > 0.0001 ? group.scale.y : personScale;
    const seatHeight = Number.isFinite(group.userData.seatHeight) ? group.userData.seatHeight : 0.45;
    return (seatHeight - group.position.y) / scaleY - hipHeight;
  }

  function finishWalk() {
    targetActive = false;
    if (poseSerial === walkSerial) pose = restorePose;
  }

  function internalWalkTo(point, speed) {
    try {
      const x = Number(point?.x);
      const y = Number(point?.y);
      const z = Number(point?.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      walkTarget.set(x, Number.isFinite(y) ? y : group.position.y, z);
      targetSpeed = Number.isFinite(speed) && speed > 0 ? speed : 1.2;
      restorePose = pose === 'walk' ? previousNonWalkPose : pose;
      if (restorePose === 'sit' || restorePose === 'work') restorePose = 'idle';
      walkSerial = poseSerial;
      pose = 'walk';
      targetActive = true;
      faceActive = false;
    } catch (_) {
      targetActive = false;
    }
  }

  function internalFace(point) {
    try {
      const x = Number(point?.x);
      const z = Number(point?.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      const dx = x - group.position.x;
      const dz = z - group.position.z;
      if (dx * dx + dz * dz < 0.000001) return;
      desiredYaw = Math.atan2(dx, dz);
      faceActive = true;
    } catch (_) {
      faceActive = false;
    }
  }

  function internalSetPose(name) {
    if (name !== 'idle' && name !== 'walk' && name !== 'sit' && name !== 'work') return;
    poseSerial += 1;
    pose = name;
    if (name !== 'walk') previousNonWalkPose = name;
    if (name === 'sit') {
      targetActive = false;
      root.position.y = seatRootY();
    }
  }

  function roundedBubblePath(graphics) {
    const x = 12;
    const y = 10;
    const width = 296;
    const height = 118;
    const radius = 24;
    graphics.beginPath();
    graphics.moveTo(x + radius, y);
    graphics.lineTo(x + width - radius, y);
    graphics.quadraticCurveTo(x + width, y, x + width, y + radius);
    graphics.lineTo(x + width, y + height - radius);
    graphics.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    graphics.lineTo(174, y + height);
    graphics.lineTo(158, 151);
    graphics.lineTo(143, y + height);
    graphics.lineTo(x + radius, y + height);
    graphics.quadraticCurveTo(x, y + height, x, y + height - radius);
    graphics.lineTo(x, y + radius);
    graphics.quadraticCurveTo(x, y, x + radius, y);
    graphics.closePath();
  }

  function fitBubbleLines(graphics, text) {
    let fontSize = 29;
    let lines = null;
    const words = String(text ?? '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) words.push('...');
    while (fontSize >= 18) {
      graphics.font = `700 ${fontSize}px system-ui, -apple-system, sans-serif`;
      lines = [];
      let line = '';
      for (let i = 0; i < words.length; i += 1) {
        const trial = line ? `${line} ${words[i]}` : words[i];
        if (line && graphics.measureText(trial).width > 266) {
          lines.push(line);
          line = words[i];
        } else {
          line = trial;
        }
      }
      if (line) lines.push(line);
      if (lines.length <= 3) break;
      fontSize -= 2;
    }
    if (lines.length > 3) {
      lines.length = 3;
      let last = lines[2];
      while (last.length > 1 && graphics.measureText(`${last}…`).width > 266) last = last.slice(0, -1);
      lines[2] = `${last}…`;
    }
    return lines;
  }

  function internalSay(text) {
    try {
      if (!bubbleCanvas) {
        if (typeof document === 'undefined' || !document.createElement) return;
        bubbleCanvas = document.createElement('canvas');
        bubbleCanvas.width = 320;
        bubbleCanvas.height = 160;
        bubbleContext = bubbleCanvas.getContext('2d');
        if (!bubbleContext) return;
        bubbleTexture = new THREE.CanvasTexture(bubbleCanvas);
        if (THREE.SRGBColorSpace) bubbleTexture.colorSpace = THREE.SRGBColorSpace;
        bubbleMaterial = new THREE.SpriteMaterial({
          map: bubbleTexture,
          transparent: true,
          opacity: 1,
          depthWrite: false,
          sizeAttenuation: true,
        });
        bubbleSprite = new THREE.Sprite(bubbleMaterial);
        bubbleSprite.name = 'speechBubble';
        bubbleSprite.renderOrder = 20;
        bubbleSprite.visible = false;
        bubbleSprite.scale.set(0.68 / personScale, 0.34 / personScale, 1);
        bubbleAnchor.add(bubbleSprite);
      }
      if (!bubbleContext || !bubbleTexture || !bubbleSprite) return;
      bubbleContext.clearRect(0, 0, 320, 160);
      roundedBubblePath(bubbleContext);
      bubbleContext.fillStyle = 'rgba(255,255,255,0.97)';
      bubbleContext.fill();
      bubbleContext.lineWidth = 5;
      bubbleContext.strokeStyle = 'rgba(20,22,26,0.48)';
      bubbleContext.stroke();
      const lines = fitBubbleLines(bubbleContext, text);
      const lineHeight = parseInt(bubbleContext.font, 10) * 1.08;
      const totalHeight = lines.length * lineHeight;
      let baseline = 68 - totalHeight * 0.5 + lineHeight * 0.78;
      bubbleContext.fillStyle = '#14161A';
      bubbleContext.textAlign = 'center';
      bubbleContext.textBaseline = 'alphabetic';
      for (let i = 0; i < lines.length; i += 1) {
        bubbleContext.fillText(lines[i], 160, baseline);
        baseline += lineHeight;
      }
      bubbleTexture.needsUpdate = true;
      bubbleMaterial.opacity = 1;
      bubbleSprite.visible = true;
      bubbleSprite.scale.set(0.001, 0.001, 1);
      bubbleTime = BUBBLE_LIFE;
    } catch (_) {
      if (bubbleSprite) bubbleSprite.visible = false;
      bubbleTime = 0;
    }
  }

  // -------------------------------------------------------------------------
  // POSES
  // -------------------------------------------------------------------------

  function updateLook(dt) {
    if (pose !== 'idle' && pose !== 'sit') {
      lookYaw = 0;
      lookPitch = 0;
      return;
    }
    if (lookStage === 0) {
      lookWait -= dt;
      if (lookWait <= 0) {
        lookYaw = (random() * 2 - 1) * 0.7;
        lookPitch = (random() * 2 - 1) * 0.15;
        lookStage = 1;
        lookStageTime = 0.6;
      }
    } else {
      lookStageTime -= dt;
      if (lookStageTime <= 0 && lookStage === 1) {
        lookStage = 2;
        lookStageTime = 0.55 + random() * 0.9;
      } else if (lookStageTime <= 0 && lookStage === 2) {
        lookYaw = 0;
        lookPitch = 0;
        lookStage = 3;
        lookStageTime = 0.6;
      } else if (lookStageTime <= 0 && lookStage === 3) {
        lookStage = 0;
        lookWait = 3 + random() * 5;
      }
    }
  }

  function updateBubble(dt) {
    if (!bubbleSprite || bubbleTime <= 0) return;
    bubbleTime -= dt;
    if (bubbleTime <= 0) {
      bubbleTime = 0;
      bubbleSprite.visible = false;
      return;
    }
    const age = BUBBLE_LIFE - bubbleTime;
    if (age < BUBBLE_POP) {
      const pop = smoothstep01(age / BUBBLE_POP);
      bubbleSprite.scale.set(0.68 * pop / personScale, 0.34 * pop / personScale, 1);
    } else {
      bubbleSprite.scale.set(0.68 / personScale, 0.34 / personScale, 1);
    }
    bubbleMaterial.opacity = bubbleTime < BUBBLE_FADE ? bubbleTime / BUBBLE_FADE : 1;
  }

  function updateMotion(dt) {
    let realSpeed = 0;
    if (targetActive) {
      const dx = walkTarget.x - group.position.x;
      const dz = walkTarget.z - group.position.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      if (distance <= STOP_DISTANCE) {
        finishWalk();
      } else {
        desiredYaw = Math.atan2(dx, dz);
        let yawError = wrapAngle(desiredYaw - group.rotation.y);
        const maxTurn = MAX_YAW_RATE * dt;
        group.rotation.y += clamp(yawError, -maxTurn, maxTurn);
        group.rotation.y = wrapAngle(group.rotation.y);
        yawError = wrapAngle(desiredYaw - group.rotation.y);
        const turnScale = Math.max(0, Math.cos(yawError));
        const remaining = Math.max(0, distance - STOP_DISTANCE);
        const travel = Math.min(targetSpeed * turnScale * dt, remaining);
        if (travel > 0) {
          group.position.x += Math.sin(group.rotation.y) * travel;
          group.position.z += Math.cos(group.rotation.y) * travel;
          realSpeed = dt > 0 ? travel / dt : 0;
        }
        if (remaining <= travel + 0.00001) finishWalk();
      }
    } else if (faceActive) {
      const yawError = wrapAngle(desiredYaw - group.rotation.y);
      const maxTurn = MAX_YAW_RATE * dt;
      group.rotation.y += clamp(yawError, -maxTurn, maxTurn);
      group.rotation.y = wrapAngle(group.rotation.y);
      if (Math.abs(yawError) < 0.006) faceActive = false;
    }
    return realSpeed;
  }

  function updatePose(dt, realSpeed) {
    animationTime += dt;
    updateLook(dt);

    let rootX = 0;
    let rootY = 0;
    let hipsRoll = 0;
    let spineLean = 0;
    let spineYaw = 0;
    let spineRoll = 0;
    let spineY = spineRise;
    let shoulderLX = 0;
    let shoulderRX = 0;
    let shoulderLY = 0;
    let shoulderRY = 0;
    let shoulderLZ = 0;
    let shoulderRZ = 0;
    let elbowLX = 0.08;
    let elbowRX = 0.08;
    let thighLX = 0;
    let thighRX = 0;
    let kneeLX = 0;
    let kneeRX = 0;
    let headYaw = lookYaw;
    let headPitch = lookPitch;
    let rollerY = -0.47;
    let rollerTilt = -Math.PI * 0.10;

    if (pose === 'walk') {
      const strideLength = 0.75 * heightMetres / 1.75;
      const cycles = clamp(realSpeed / Math.max(0.35, strideLength), 0.6, 2.6);
      stridePhase += dt * cycles * TAU;
      const step = Math.sin(stridePhase);
      const opposite = -step;
      thighLX = step * 0.42;
      thighRX = opposite * 0.42;
      kneeLX = Math.max(0, step) * 0.82;
      kneeRX = Math.max(0, opposite) * 0.82;
      shoulderLX = -step * 0.252;
      shoulderRX = opposite * 0.252;
      elbowLX = 0.13 + Math.max(0, -step) * 0.12;
      elbowRX = 0.13 + Math.max(0, step) * 0.12;
      rootY = Math.abs(Math.sin(stridePhase)) * 0.03;
      hipsRoll = step * 0.035;
      spineLean = 0.06;
      spineRoll = -step * 0.025;
      if (rollerGroup) {
        shoulderRX = 0.02;
        elbowRX = 0.06;
      }
    } else if (pose === 'sit') {
      rootY = seatRootY();
      thighLX = -HALF_PI;
      thighRX = -HALF_PI;
      kneeLX = HALF_PI;
      kneeRX = HALF_PI;
      spineLean = 0.08;
      shoulderLX = -0.76;
      elbowLX = -0.63;
      shoulderRX = 0.06;
      elbowRX = 0.12;
      rollerY = -0.105;
      rollerTilt = 0;
    } else if (pose === 'work') {
      workTime += dt;
      let local = (workTime + workOffset) % workTotal;
      let beat = 0;
      while (beat < beatDurations.length - 1 && local >= beatDurations[beat]) {
        local -= beatDurations[beat];
        beat += 1;
      }
      const unit = local / beatDurations[beat];
      const eased = smoothstep01(unit);
      if (beat === 0) {
        spineLean = 0.20 * eased;
        shoulderLX = -1.08 * eased;
        shoulderRX = -1.02 * eased;
        elbowLX = -0.42 * eased;
        elbowRX = -0.48 * eased;
      } else if (beat === 1) {
        const wipe = Math.sin(unit * TAU * wipePasses);
        spineLean = 0.18;
        shoulderLX = -1.08;
        shoulderRX = -0.85;
        shoulderLY = wipe * 0.68;
        elbowLX = -0.55;
        elbowRX = -0.25;
      } else if (beat === 2) {
        spineYaw = 0.60 * eased;
        spineLean = 0.10 * (1 - eased);
        shoulderRX = -0.85 - eased * 0.95;
        elbowRX = -0.22;
        shoulderLX = -0.20;
        headYaw = -0.18 * eased;
      } else if (beat === 3) {
        const press = Math.pow(Math.max(0, Math.sin(unit * TAU * 2)), 8);
        spineYaw = 0.60;
        shoulderRX = -1.12;
        elbowRX = -0.42 + press * 0.34;
        shoulderLX = -0.18;
        headYaw = -0.16;
      } else {
        spineYaw = 0.60 * (1 - eased);
        shoulderLX = -0.28 - eased * 0.70;
        elbowLX = -0.18 - eased * 0.62;
        shoulderRX = -0.34;
        elbowRX = -0.30;
      }
      spineYaw += Number(group.userData.workDriftYaw) || 0;
      rootX += Number(group.userData.workSway) || 0;
      hipsRoll = Math.sin(animationTime * 1.1) * 0.008;
    } else {
      const weight = Math.sin(animationTime * Math.PI);
      rootX = weight * 0.012;
      hipsRoll = weight * 0.025;
      spineY = spineRise + Math.sin(animationTime * HALF_PI) * 0.004;
      shoulderLX = Math.sin(animationTime * 1.2 + 0.7) * 0.025;
      shoulderRX = Math.sin(animationTime * 1.2 + 3.6) * 0.025;
    }

    const showPhone = Boolean(phoneRoot && (pose === 'idle' || pose === 'sit'));
    if (showPhone) {
      shoulderRX = -0.34;
      elbowRX = -1.52;
      headPitch = 0.25;
    }
    if (phoneRoot) phoneRoot.visible = showPhone;

    const response = pose === 'work' ? 8.5 : pose === 'walk' ? 12 : 7;
    root.position.x = damp(root.position.x, rootX, response, dt);
    if (pose === 'sit') root.position.y = rootY;
    else root.position.y = damp(root.position.y, rootY, response, dt);
    hips.rotation.z = damp(hips.rotation.z, hipsRoll, response, dt);
    spine.position.y = damp(spine.position.y, spineY, response, dt);
    spine.rotation.x = damp(spine.rotation.x, spineLean, response, dt);
    spine.rotation.y = damp(spine.rotation.y, spineYaw, response, dt);
    spine.rotation.z = damp(spine.rotation.z, spineRoll, response, dt);
    shoulderL.rotation.x = damp(shoulderL.rotation.x, shoulderLX, response, dt);
    shoulderR.rotation.x = damp(shoulderR.rotation.x, shoulderRX, response, dt);
    shoulderL.rotation.y = damp(shoulderL.rotation.y, shoulderLY, response, dt);
    shoulderR.rotation.y = damp(shoulderR.rotation.y, shoulderRY, response, dt);
    shoulderL.rotation.z = damp(shoulderL.rotation.z, shoulderLZ, response, dt);
    shoulderR.rotation.z = damp(shoulderR.rotation.z, shoulderRZ, response, dt);
    elbowL.rotation.x = damp(elbowL.rotation.x, elbowLX, response, dt);
    elbowR.rotation.x = damp(elbowR.rotation.x, elbowRX, response, dt);
    thighL.rotation.x = damp(thighL.rotation.x, thighLX, response, dt);
    thighR.rotation.x = damp(thighR.rotation.x, thighRX, response, dt);
    kneeL.rotation.x = damp(kneeL.rotation.x, kneeLX, response, dt);
    kneeR.rotation.x = damp(kneeR.rotation.x, kneeRX, response, dt);
    head.rotation.y = damp(head.rotation.y, headYaw, 5.5, dt);
    head.rotation.x = damp(head.rotation.x, headPitch, 5.5, dt);
    if (rollerGroup) {
      rollerGroup.position.y = damp(rollerGroup.position.y, rollerY, response, dt);
      rollerGroup.rotation.x = damp(rollerGroup.rotation.x, rollerTilt, response, dt);
    }
  }

  function internalUpdate(dt) {
    const delta = Number.isFinite(dt) ? clamp(dt, 0, 0.1) : 0;
    const realSpeed = updateMotion(delta);
    updatePose(delta, realSpeed);
    updateBubble(delta);
  }

  // -------------------------------------------------------------------------
  // PERSON API
  // -------------------------------------------------------------------------

  return {
    group,
    update(dt) {
      try { internalUpdate(dt); } catch (_) { targetActive = false; }
    },
    walkTo(point, speed) { internalWalkTo(point, speed); },
    face(point) { internalFace(point); },
    setPose(name) { internalSetPose(name); },
    say(text) { internalSay(text); },
    isMoving() { return targetActive; },
  };
}

export function makePerson(ctx, opts) {
  try {
    return createPerson(ctx, opts);
  } catch (_) {
    return makeFallbackPerson();
  }
}

// ---------------------------------------------------------------------------
// CROWD
// ---------------------------------------------------------------------------

function pointInBox(x, z, box) {
  return x >= box.x0 && x <= box.x1 && z >= box.z0 && z <= box.z1;
}

function segmentHitsBox(ax, az, bx, bz, box) {
  let tMin = 0;
  let tMax = 1;
  const dx = bx - ax;
  const dz = bz - az;
  if (Math.abs(dx) < 0.000001) {
    if (ax < box.x0 || ax > box.x1) return false;
  } else {
    let t0 = (box.x0 - ax) / dx;
    let t1 = (box.x1 - ax) / dx;
    if (t0 > t1) {
      const swap = t0;
      t0 = t1;
      t1 = swap;
    }
    tMin = Math.max(tMin, t0);
    tMax = Math.min(tMax, t1);
    if (tMin > tMax) return false;
  }
  if (Math.abs(dz) < 0.000001) {
    if (az < box.z0 || az > box.z1) return false;
  } else {
    let t0 = (box.z0 - az) / dz;
    let t1 = (box.z1 - az) / dz;
    if (t0 > t1) {
      const swap = t0;
      t0 = t1;
      t1 = swap;
    }
    tMin = Math.max(tMin, t0);
    tMax = Math.min(tMax, t1);
  }
  return tMin <= tMax && tMax >= 0 && tMin <= 1;
}

function segmentCrossesRail(ax, az, bx, bz, rail) {
  const dz = bz - az;
  if (Math.abs(dz) < 0.000001) {
    if (Math.abs(az - rail.z) > 0.000001) return false;
    return Math.max(Math.min(ax, bx), rail.x0) <= Math.min(Math.max(ax, bx), rail.x1);
  }
  const along = (rail.z - az) / dz;
  if (along < 0 || along > 1) return false;
  const x = ax + (bx - ax) * along;
  return x >= rail.x0 && x <= rail.x1;
}

function crowdKeepouts(layout) {
  const aisleOuter = layout.kiosk.outer;
  const order = layout.queue.order;
  const pickup = layout.queue.pickup;
  const seating = layout.terminal.seating;
  const merch = layout.terminal.merch;
  const tables = layout.terminal.tables;
  const tableSize = layout.terminal.tableSize;
  const orderEnd = order.x + order.dx * (order.n - 1);
  const pickupEnd = pickup.x + pickup.dx * (pickup.n - 1);
  return [
    { x0: aisleOuter.x0 - 1, x1: aisleOuter.x1 + 1, z0: aisleOuter.z0 - 1, z1: aisleOuter.z1 + 1 },
    { x0: Math.min(order.x, orderEnd) - 0.65, x1: Math.max(order.x, orderEnd) + 0.9, z0: order.z - 0.55, z1: order.z + 0.65 },
    { x0: Math.min(pickup.x, pickupEnd) - 0.7, x1: Math.max(pickup.x, pickupEnd) + 0.5, z0: pickup.z - 0.5, z1: pickup.z + 0.6 },
    { x0: merch.x0 - 0.4, x1: merch.x1 + 0.4, z0: merch.z0 - 0.4, z1: merch.z1 + 0.4 },
    { x0: seating.x0 - 0.5, x1: seating.x1 + 0.5, z0: seating.z0 - 0.5, z1: seating.z1 + 0.5 },
    {
      x0: tables[0].x - tableSize.w * 0.5 - 0.3,
      x1: tables[0].x + tableSize.w * 0.5 + 0.3,
      z0: Math.min(tables[0].z, tables[1].z) - tableSize.d * 0.5 - 0.3,
      z1: Math.max(tables[0].z, tables[1].z) + tableSize.d * 0.5 + 0.3,
    },
  ];
}

function pathIsSafe(points, boxes, rail) {
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    if (point.x < -28 || point.x > 28 || point.z < -10.5 || point.z > 15) return false;
    for (let b = 0; b < boxes.length; b += 1) {
      if (pointInBox(point.x, point.z, boxes[b])) return false;
    }
  }
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const bPoint = points[(i + 1) % points.length];
    for (let b = 0; b < boxes.length; b += 1) {
      if (segmentHitsBox(a.x, a.z, bPoint.x, bPoint.z, boxes[b])) return false;
    }
    if (segmentCrossesRail(a.x, a.z, bPoint.x, bPoint.z, rail)) return false;
  }
  return true;
}

function makeWalkerPath(templateIndex, random, boxes, rail) {
  const base = BASE_PATHS[templateIndex % BASE_PATHS.length];
  let points = null;
  for (let attempt = 0; attempt < 18; attempt += 1) {
    points = [];
    for (let i = 0; i < base.length; i += 2) {
      points.push(new THREE.Vector3(base[i] + (random() - 0.5), 0, base[i + 1] + (random() - 0.5)));
    }
    if (pathIsSafe(points, boxes, rail)) return points;
  }
  points = [];
  for (let i = 0; i < base.length; i += 2) points.push(new THREE.Vector3(base[i], 0, base[i + 1]));
  return points;
}

function offsetPairedPath(source, offset, boxes, rail) {
  const points = [];
  for (let i = 0; i < source.length; i += 1) points.push(new THREE.Vector3(source[i].x + offset, 0, source[i].z));
  if (pathIsSafe(points, boxes, rail)) return points;
  for (let i = 0; i < points.length; i += 1) points[i].x = source[i].x - offset;
  return points;
}

function emptyBuilder() {
  return { group: new THREE.Group(), update() {} };
}

function createCrowd(ctx) {
  const layout = ctx?.layout;
  if (!layout?.terminal?.seating || !layout?.terminal?.tables || !layout?.kiosk) return emptyBuilder();

  const group = new THREE.Group();
  group.name = 'ambientCrowd';
  const seed = Math.floor(contextRandom(ctx) * 0xFFFFFFFF) ^ Math.floor(contextRandom(ctx) * 0xFFFFFFFF);
  const random = makeRng(seed);
  const people = [];
  const walkers = [];
  let serial = 0;

  // layout.js exposes only the seating bounds, so this deterministic chair grid fills that known gap.
  const seating = layout.terminal.seating;
  const seatCandidates = [];
  for (let row = 0; row < 5; row += 1) {
    for (let bank = 0; bank < 2; bank += 1) {
      for (let chair = 0; chair < 6; chair += 1) {
        seatCandidates.push({
          x: seating.x0 + 0.6 + bank * 4.0 + chair * 0.62,
          z: seating.z0 + 0.8 + row * 2.8,
          code: row * 12 + bank * 6 + chair,
        });
      }
    }
  }
  for (let i = seatCandidates.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const swap = seatCandidates[i];
    seatCandidates[i] = seatCandidates[j];
    seatCandidates[j] = swap;
  }
  const seatedCount = 8 + Math.floor(random() * 4);
  const phoneCount = 2 + (random() < 0.55 ? 1 : 0);
  const chosenCodes = [];
  let candidateIndex = 0;
  while (chosenCodes.length < seatedCount && candidateIndex < seatCandidates.length) {
    const candidate = seatCandidates[candidateIndex];
    candidateIndex += 1;
    let adjacent = false;
    for (let i = 0; i < chosenCodes.length; i += 1) {
      if (Math.abs(chosenCodes[i] - candidate.code) === 1 && Math.floor(chosenCodes[i] / 6) === Math.floor(candidate.code / 6)) {
        adjacent = true;
        break;
      }
    }
    if (adjacent) continue;
    chosenCodes.push(candidate.code);
    const seated = makePerson(ctx, {
      role: 'passenger',
      bag: chosenCodes.length <= 2 ? 'roller' : random() < 0.18 ? 'backpack' : 'none',
      seed: seed + serial * 7919,
      seatHeight: 0.45,
      palette: { phone: chosenCodes.length <= phoneCount },
      scale: 0.94 + random() * 0.12,
    });
    serial += 1;
    seated.group.position.set(candidate.x, 0, candidate.z);
    seated.group.rotation.y = 0;
    seated.setPose('sit');
    group.add(seated.group);
    people.push(seated);
  }

  const boxes = crowdKeepouts(layout);
  const rail = layout.rails.a;
  const walkerCount = 8 + Math.floor(random() * 5);
  const childCount = random() < 0.58 ? 1 : 2;
  const rollerTarget = 2 + Math.floor(random() * 3);
  let rollersAssigned = 0;
  for (let w = 0; w < walkerCount; w += 1) {
    const child = w === 1 || (childCount === 2 && w === 3);
    let path;
    let speed;
    let delay;
    let waypointIndex;
    if (child) {
      const partner = walkers[walkers.length - 1];
      path = offsetPairedPath(partner.path, 0.52, boxes, rail);
      speed = partner.speed;
      delay = partner.delay;
      waypointIndex = partner.index;
    } else {
      const templateIndex = w === 0 ? 1 : w === 2 ? 3 : w % BASE_PATHS.length;
      path = makeWalkerPath(templateIndex, random, boxes, rail);
      speed = 0.75 + random() * 0.80;
      delay = Math.min(5.95, w * (5.7 / Math.max(1, walkerCount - 1)) + random() * 0.2);
      waypointIndex = (w + Math.floor(random() * path.length)) % path.length;
    }
    let bag = 'none';
    if (!child && rollersAssigned < rollerTarget) {
      bag = 'roller';
      rollersAssigned += 1;
    } else if (!child && random() < 0.32) {
      bag = random() < 0.55 ? 'backpack' : 'tote';
    }
    const walker = makePerson(ctx, {
      role: 'passenger',
      bag,
      seed: seed + serial * 7919,
      palette: child ? { child: true, phone: false } : { phone: false },
      scale: child ? 0.96 + random() * 0.08 : 0.94 + random() * 0.12,
    });
    serial += 1;
    walker.group.position.copy(path[waypointIndex]);
    walker.group.rotation.y = random() * TAU;
    walker.setPose('idle');
    group.add(walker.group);
    people.push(walker);
    walkers.push({ person: walker, path, index: waypointIndex, speed, delay });
  }

  const tables = layout.terminal.tables;
  const tableWidth = layout.terminal.tableSize.w;
  for (let stool = 0; stool < 3; stool += 1) {
    const table = tables[stool === 2 ? 1 : 0];
    const side = stool === 1 ? -1 : 1;
    const x = table.x - tableWidth * 0.5 + 0.6 + (stool === 2 ? 1.6 : stool * 0.8);
    const z = table.z + side * 0.72;
    const sitter = makePerson(ctx, {
      role: 'passenger',
      bag: 'none',
      seed: seed + serial * 7919,
      seatHeight: 0.75,
      palette: { phone: stool === 0 },
      scale: 0.96 + random() * 0.10,
    });
    serial += 1;
    sitter.group.position.set(x, 0, z);
    sitter.group.rotation.y = side > 0 ? Math.PI : 0;
    sitter.setPose('sit');
    group.add(sitter.group);
    people.push(sitter);
  }

  return {
    group,
    update(dt, t) {
      const delta = Number.isFinite(dt) ? dt : 0;
      for (let i = 0; i < walkers.length; i += 1) {
        const walker = walkers[i];
        if (walker.delay > 0) {
          walker.delay -= delta;
        } else if (!walker.person.isMoving()) {
          walker.index = (walker.index + 1) % walker.path.length;
          walker.person.walkTo(walker.path[walker.index], walker.speed);
        }
      }
      for (let i = 0; i < people.length; i += 1) people[i].update(delta, t);
    },
  };
}

export function buildCrowd(ctx) {
  try {
    return createCrowd(ctx);
  } catch (_) {
    return emptyBuilder();
  }
}

// ---------------------------------------------------------------------------
// BARISTAS
// ---------------------------------------------------------------------------

const BARISTA_LINES = [
  'flat white for... Deborah?',
  "gate change, they'll all be here in a minute",
  "we're out of oat",
  "that's the third decaf soy this hour",
  "someone's left a passport on the handoff",
  "the grinder's making that noise again",
  'venti quad shot half-caff, no foam. no.',
  "is 'iced hot chocolate' a thing now",
  'this queue has achieved sentience',
  'one croissant, emotionally supported',
  'the milk fridge is judging me',
  'boarding group nine needs six macchiatos',
  'that cup says Greg. probably.',
];

function createBaristas(ctx) {
  const layout = ctx?.layout;
  if (!layout?.kiosk?.aisle || !layout?.back?.espresso || !layout?.front?.till) return emptyBuilder();
  const seed = Math.floor(contextRandom(ctx) * 0xFFFFFFFF) ^ 0xBA7157A;
  const random = makeRng(seed);
  const group = new THREE.Group();
  group.name = 'baristaNPCs';

  const baristaA = makePerson(ctx, {
    role: 'barista',
    bag: 'none',
    seed: seed ^ 0xA531,
    scale: 0.96,
    palette: { skin: 1, headwear: 'cap', phone: false },
  });
  const baristaB = makePerson(ctx, {
    role: 'barista',
    bag: 'none',
    seed: seed ^ 0xB742,
    scale: 1.05,
    palette: { skin: 4, headwear: 'headscarf', phone: false },
  });

  const aisle = layout.kiosk.aisle;
  baristaA.group.position.set(layout.back.steamWand.x - 0.20, 0, aisle.z0 + 0.37);
  baristaA.group.rotation.y = Math.PI;
  baristaB.group.position.set(layout.front.till.x - 0.85, 0, aisle.z1 - 0.33);
  baristaB.group.rotation.y = 0;
  baristaA.setPose('work');
  baristaB.setPose('work');
  group.add(baristaA.group, baristaB.group);

  let elapsed = 0;
  let nextA = 12 + random() * 5;
  let nextB = 18 + random() * 4;
  let lastSpoken = -100;
  let lastLine = -1;
  const phaseA = random() * TAU;
  const phaseB = random() * TAU;

  function speak(person, now) {
    let line = Math.floor(random() * BARISTA_LINES.length);
    if (line === lastLine) line = (line + 1 + Math.floor(random() * (BARISTA_LINES.length - 1))) % BARISTA_LINES.length;
    lastLine = line;
    lastSpoken = now;
    person.say(BARISTA_LINES[line]);
  }

  return {
    group,
    update(dt, t) {
      const delta = Number.isFinite(dt) ? dt : 0;
      elapsed = Number.isFinite(t) ? t : elapsed + delta;
      baristaA.group.userData.workDriftYaw = Math.sin(elapsed * 0.27 + phaseA) * 0.25;
      baristaB.group.userData.workDriftYaw = Math.sin(elapsed * 0.23 + phaseB) * 0.25;
      baristaA.group.userData.workSway = Math.sin(elapsed * 0.67 + phaseA) * 0.008;
      baristaB.group.userData.workSway = Math.sin(elapsed * 0.61 + phaseB) * 0.008;
      baristaA.update(delta, elapsed);
      baristaB.update(delta, elapsed);

      if (elapsed >= nextA && elapsed - lastSpoken >= 3) {
        speak(baristaA, elapsed);
        nextA = elapsed + 12 + random() * 10;
      }
      if (elapsed >= nextB && elapsed - lastSpoken >= 3) {
        speak(baristaB, elapsed);
        nextB = elapsed + 12 + random() * 10;
      }
    },
  };
}

export function buildBaristaNPCs(ctx) {
  try {
    return createBaristas(ctx);
  } catch (_) {
    return emptyBuilder();
  }
}
