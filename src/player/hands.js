import * as THREE from 'three';

const CONFIG = {
  rest: { x: 0.2100, y: -0.2000, z: -0.44, rx: -0.16, ry: -0.34, rz: 0.14 },
  motion: {
    maxDt: 0.05,
    idleAmplitude: 0.004,
    idlePeriod: 3.4,
    walkBob: 0.014,
    walkRoll: 0.05,
    walkPhaseRate: 9,
    fallbackWalkSpeed: 2.6,
    lookScaleX: 0.014,
    lookScaleY: 0.010,
    lookLimitX: 0.05,
    lookLimitY: 0.025,
    springStrength: 105,
    springDamping: 15,
    minRigX: 0.1750,
    idleVerticalRatio: 0.55,
    phaseWraps: 8,
    pitchLagRotation: 0.8,
    yawLagRotation: 1.1,
  },
  hand: {
    forearmTopRadius: 0.01938,
    forearmBottomRadius: 0.02280,
    forearmLength: 0.12540,
    forearmX: 0.02679,
    forearmY: -0.05985,
    forearmZ: -0.00399,
    forearmRX: -0.16,
    forearmRZ: 0.12,
    cuffRadius: 0.028,
    cuffHeight: 0.02565,
    cuffX: 0.01900,
    cuffY: 0.00393,
    cuffZ: -0.01428,
    palmW: 0.04845,
    palmH: 0.01596,
    palmD: 0.05130,
    fingerW: 0.01026,
    fingerH: 0.01140,
    fingerD: 0.03135,
    fingerY: 0.00057,
    fingerZ: -0.02451,
    fingerMeshZ: -0.01539,
    thumbW: 0.01197,
    thumbH: 0.01254,
    thumbD: 0.03135,
    thumbX: -0.02850,
    thumbY: -0.00171,
    thumbZ: 0.00285,
    thumbRX: -0.28,
    thumbRY: 0.62,
    thumbRZ: -0.30,
    anchorX: 0,
    anchorY: 0.012,
    anchorZ: -0.055,
    skinTextureSize: 32,
  },
  cup: {
    topRadius: 0.043,
    bottomRadius: 0.032,
    height: 0.132,
    segments: 20,
    sleeveRadiusTop: 0.0405,
    sleeveRadiusBottom: 0.0365,
    sleeveHeight: 0.048,
    sleeveY: -0.018,
    liquidRadius: 0.038,
    foamRadius: 0.0365,
    liquidBottomInset: 0.006,
    liquidTopInset: 0.004,
    foamLift: 0.0012,
    lidRadius: 0.046,
    lidHeight: 0.007,
    lidLift: 0.004,
    domeRadius: 0.037,
    domeScaleY: 0.24,
    domeLift: 0.009,
    tabW: 0.022,
    tabH: 0.005,
    tabD: 0.015,
    tabX: 0.011,
    tabLift: 0.014,
    iceSize: 0.012,
    iceLift: 0.0045,
    icedTint: 0xDCEEF5,
    shortX: 0.86,
    shortY: 0.70,
    tallX: 0.93,
    tallY: 0.85,
    grandeX: 1.00,
    grandeY: 1.00,
    ventiX: 1.06,
    ventiY: 1.15,
  },
  portafilter: {
    basketRadius: 0.033,
    basketHeight: 0.030,
    basketY: 0.025,
    rimRadius: 0.036,
    rimTube: 0.003,
    puckRadius: 0.029,
    puckY: 0.041,
    spoutRadius: 0.004,
    spoutLength: 0.027,
    spoutY: -0.006,
    handleRadius: 0.014,
    handleLength: 0.13,
    handleY: 0.012,
    handleZ: 0.084,
  },
  pitcher: {
    topRadius: 0.048,
    bottomRadius: 0.038,
    height: 0.105,
    segments: 18,
    rimRadius: 0.049,
    rimTube: 0.0025,
    milkRadius: 0.042,
    milkBottomInset: 0.007,
    milkTopInset: 0.006,
    spoutRadius: 0.019,
    spoutLength: 0.030,
    spoutY: 0.055,
    spoutZ: -0.047,
    handleX: 0.060,
    handleY: 0.002,
    handleW: 0.007,
    handleH: 0.068,
    handleD: 0.009,
    handleReach: 0.018,
  },
  steam: {
    count: 3,
    width: 0.032,
    height: 0.068,
    baseY: 0.067,
    rise: 0.095,
    speed: 0.72,
    opacity: 0.38,
    drift: 0.006,
    startScale: 0.72,
    scaleGrowth: 0.45,
    x0: -0.021,
    x1: 0.004,
    x2: 0.024,
    z0: -0.004,
    z1: 0.003,
    z2: -0.002,
    phase0: 0.00,
    phase1: 0.34,
    phase2: 0.68,
    textureSize: 64,
  },
  gesture: {
    blendTime: 0.065,
    tampDuration: 0.45,
    tampPressEnd: 0.12,
    tampHoldEnd: 0.18,
    tampDown: 0.060,
    tampPitch: -0.14,
    pourDuration: 0.70,
    pourEnterEnd: 0.20,
    pourHoldEnd: 0.48,
    pourRoll: -0.95,
    pourPitch: -0.18,
    pourCentre: -0.015,
    pourForward: -0.065,
    shakeDuration: 0.45,
    shakeCycles: 3,
    shakeX: 0.022,
    shakeY: 0.014,
    shakeRoll: 0.07,
    placeDuration: 0.40,
    placePeak: 0.45,
    placeForward: -0.10,
    placeDown: -0.040,
    placePitch: 0.08,
    tapDuration: 0.28,
    tapJabEnd: 0.05,
    tapCurlHoldEnd: 0.10,
    tapForward: -0.030,
    tapCurl: -0.90,
  },
};

const GESTURE_NONE = 0;
const GESTURE_TAMP = 1;
const GESTURE_POUR = 2;
const GESTURE_SHAKE = 3;
const GESTURE_PLACE = 4;
const GESTURE_TAP = 5;
const TWO_PI = Math.PI * 2;

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

function smoothstep(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function easeOutCubic(value) {
  const t = 1 - clamp(value, 0, 1);
  return 1 - t * t * t;
}

function wrappedAngleDelta(value) {
  if (value > Math.PI) return value - TWO_PI;
  if (value < -Math.PI) return value + TWO_PI;
  return value;
}

function sharedMaterial(ctx, name) {
  try {
    const material = ctx?.mat?.get?.(name);
    return material?.isMaterial ? material : null;
  } catch (_) {
    return null;
  }
}

function sleeveTexture(ctx) {
  try {
    const texture = ctx?.tex?.cupSleeve?.();
    return texture?.isTexture ? texture : null;
  } catch (_) {
    return null;
  }
}

function makeSteamTexture() {
  if (typeof document === 'undefined' || !document.createElement) return null;
  const canvas = document.createElement('canvas');
  canvas.width = CONFIG.steam.textureSize;
  canvas.height = CONFIG.steam.textureSize;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const centre = CONFIG.steam.textureSize * 0.5;
  const gradient = context.createRadialGradient(
    centre, centre, 0,
    centre, centre, centre,
  );
  gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
  gradient.addColorStop(0.34, 'rgba(255,255,255,0.48)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, CONFIG.steam.textureSize, CONFIG.steam.textureSize);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function makeSkinTexture() {
  if (typeof document === 'undefined' || !document.createElement) return null;
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = CONFIG.hand.skinTextureSize;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const gradient = context.createLinearGradient(0, 0, 0, CONFIG.hand.skinTextureSize);
  gradient.addColorStop(0, 'rgb(255,255,255)');
  gradient.addColorStop(0.52, 'rgb(244,244,244)');
  gradient.addColorStop(1, 'rgb(220,220,220)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export function createHands(ctx) {
  const ownedGeometries = [];
  const ownedMaterials = [];
  const group = new THREE.Group();
  const rig = new THREE.Group();
  group.add(rig);
  rig.position.set(CONFIG.rest.x, CONFIG.rest.y, CONFIG.rest.z);
  rig.rotation.set(CONFIG.rest.rx, CONFIG.rest.ry, CONFIG.rest.rz, 'YXZ');

  function geometry(value) {
    ownedGeometries.push(value);
    return value;
  }

  function ownMaterial(value) {
    ownedMaterials.push(value);
    return value;
  }

  function standardFallback(color, roughness, metalness) {
    return ownMaterial(new THREE.MeshStandardMaterial({ color, roughness, metalness }));
  }

  function mesh(shape, material, parent) {
    const value = new THREE.Mesh(shape, material);
    parent.add(value);
    return value;
  }

  const skinTexture = makeSkinTexture();
  const skinMaterial = ownMaterial(new THREE.MeshStandardMaterial({
    color: 0xA5714A,
    map: skinTexture,
    roughness: 0.8,
    metalness: 0,
  }));
  const fingerMaterial = ownMaterial(new THREE.MeshStandardMaterial({
    color: 0x8A5A38,
    map: skinTexture,
    roughness: 0.82,
    metalness: 0,
  }));
  const blackMatteMaterial = sharedMaterial(ctx, 'blackMatte') || standardFallback(0x14161A, 0.86, 0.02);
  const blackGlossMaterial = sharedMaterial(ctx, 'blackGloss') || standardFallback(0x1B1E24, 0.30, 0.08);
  const chromeMaterial = sharedMaterial(ctx, 'chrome') || standardFallback(0xD8DCE0, 0.23, 0.88);
  const steelMaterial = sharedMaterial(ctx, 'steel') || chromeMaterial;
  const paperMaterial = sharedMaterial(ctx, 'paperCup') || standardFallback(0xF6F3EC, 0.78, 0);
  const foamMaterial = sharedMaterial(ctx, 'foam') || sharedMaterial(ctx, 'milk') || standardFallback(0xF3E6CE, 0.74, 0);
  const lidMaterial = sharedMaterial(ctx, 'plasticLid') || blackGlossMaterial;

  const forearmGeometry = geometry(new THREE.CylinderGeometry(
    CONFIG.hand.forearmTopRadius,
    CONFIG.hand.forearmBottomRadius,
    CONFIG.hand.forearmLength,
    10,
  ));
  const forearm = mesh(forearmGeometry, blackMatteMaterial, rig);
  forearm.position.set(CONFIG.hand.forearmX, CONFIG.hand.forearmY, CONFIG.hand.forearmZ);
  forearm.rotation.set(CONFIG.hand.forearmRX, 0, CONFIG.hand.forearmRZ);

  const cuffGeometry = geometry(new THREE.CylinderGeometry(
    CONFIG.hand.cuffRadius,
    CONFIG.hand.cuffRadius,
    CONFIG.hand.cuffHeight,
    10,
  ));
  const cuff = mesh(cuffGeometry, blackMatteMaterial, rig);
  cuff.position.set(CONFIG.hand.cuffX, CONFIG.hand.cuffY, CONFIG.hand.cuffZ);
  cuff.rotation.copy(forearm.rotation);

  const palmGeometry = geometry(new THREE.BoxGeometry(
    CONFIG.hand.palmW,
    CONFIG.hand.palmH,
    CONFIG.hand.palmD,
  ));
  mesh(palmGeometry, skinMaterial, rig);

  const fingerGeometry = geometry(new THREE.BoxGeometry(
    CONFIG.hand.fingerW,
    CONFIG.hand.fingerH,
    CONFIG.hand.fingerD,
  ));
  const fingerGroups = [];
  const fingerX = [-0.01710, -0.00570, 0.00570, 0.01710];
  for (let index = 0; index < 4; index += 1) {
    const fingerGroup = new THREE.Group();
    fingerGroup.position.set(
      fingerX[index],
      CONFIG.hand.fingerY,
      CONFIG.hand.fingerZ,
    );
    const finger = mesh(fingerGeometry, fingerMaterial, fingerGroup);
    finger.position.z = CONFIG.hand.fingerMeshZ;
    fingerGroup.rotation.x = index === 0 ? -0.035 : index === 3 ? 0.045 : 0;
    rig.add(fingerGroup);
    fingerGroups.push(fingerGroup);
  }
  const indexFingerRestX = fingerGroups[1].rotation.x;

  const thumbGroup = new THREE.Group();
  thumbGroup.position.set(CONFIG.hand.thumbX, CONFIG.hand.thumbY, CONFIG.hand.thumbZ);
  thumbGroup.rotation.set(CONFIG.hand.thumbRX, CONFIG.hand.thumbRY, CONFIG.hand.thumbRZ);
  const thumbGeometry = geometry(new THREE.BoxGeometry(
    CONFIG.hand.thumbW,
    CONFIG.hand.thumbH,
    CONFIG.hand.thumbD,
  ));
  const thumb = mesh(thumbGeometry, fingerMaterial, thumbGroup);
  thumb.position.z = -CONFIG.hand.thumbD * 0.38;
  rig.add(thumbGroup);

  const itemAnchor = new THREE.Group();
  itemAnchor.position.set(CONFIG.hand.anchorX, CONFIG.hand.anchorY, CONFIG.hand.anchorZ);
  rig.add(itemAnchor);

  const cupGroup = new THREE.Group();
  const portafilterGroup = new THREE.Group();
  const pitcherGroup = new THREE.Group();
  cupGroup.visible = false;
  portafilterGroup.visible = false;
  pitcherGroup.visible = false;
  itemAnchor.add(cupGroup, portafilterGroup, pitcherGroup);

  const cupBodyGeometry = geometry(new THREE.CylinderGeometry(
    CONFIG.cup.topRadius,
    CONFIG.cup.bottomRadius,
    CONFIG.cup.height,
    CONFIG.cup.segments,
    1,
    true,
  ));
  mesh(cupBodyGeometry, paperMaterial, cupGroup);

  const cupBottomGeometry = geometry(new THREE.CircleGeometry(CONFIG.cup.bottomRadius, CONFIG.cup.segments));
  const cupBottom = mesh(cupBottomGeometry, paperMaterial, cupGroup);
  cupBottom.rotation.x = -Math.PI * 0.5;
  cupBottom.position.y = -CONFIG.cup.height * 0.5 + 0.001;

  const cupSleeveMap = sleeveTexture(ctx);
  let cupSleeveMaterial = null;
  if (cupSleeveMap) {
    cupSleeveMaterial = ownMaterial(new THREE.MeshStandardMaterial({
      color: 0xFFFFFF,
      map: cupSleeveMap,
      roughness: 0.82,
    }));
  } else {
    cupSleeveMaterial = sharedMaterial(ctx, 'cardboard') || standardFallback(0xB08D57, 0.86, 0);
  }
  const cupSleeveGeometry = geometry(new THREE.CylinderGeometry(
    CONFIG.cup.sleeveRadiusTop,
    CONFIG.cup.sleeveRadiusBottom,
    CONFIG.cup.sleeveHeight,
    CONFIG.cup.segments,
    1,
    true,
  ));
  const cupSleeve = mesh(cupSleeveGeometry, cupSleeveMaterial, cupGroup);
  cupSleeve.position.y = CONFIG.cup.sleeveY;

  const cupLiquidMaterial = ownMaterial(new THREE.MeshStandardMaterial({
    color: 0x5A3024,
    roughness: 0.55,
    side: THREE.DoubleSide,
  }));
  const cupLiquidGeometry = geometry(new THREE.CircleGeometry(CONFIG.cup.liquidRadius, CONFIG.cup.segments));
  const cupLiquid = mesh(cupLiquidGeometry, cupLiquidMaterial, cupGroup);
  cupLiquid.rotation.x = -Math.PI * 0.5;

  const cupFoamGeometry = geometry(new THREE.CircleGeometry(CONFIG.cup.foamRadius, CONFIG.cup.segments));
  const cupFoam = mesh(cupFoamGeometry, foamMaterial, cupGroup);
  cupFoam.rotation.x = -Math.PI * 0.5;
  cupFoam.visible = false;

  const lidGroup = new THREE.Group();
  lidGroup.visible = false;
  cupGroup.add(lidGroup);
  const lidDiscGeometry = geometry(new THREE.CylinderGeometry(
    CONFIG.cup.lidRadius,
    CONFIG.cup.lidRadius,
    CONFIG.cup.lidHeight,
    CONFIG.cup.segments,
  ));
  const lidDisc = mesh(lidDiscGeometry, lidMaterial, lidGroup);
  lidDisc.position.y = CONFIG.cup.height * 0.5 + CONFIG.cup.lidLift;
  const lidDomeGeometry = geometry(new THREE.SphereGeometry(
    CONFIG.cup.domeRadius,
    16,
    6,
    0,
    TWO_PI,
    0,
    Math.PI * 0.5,
  ));
  const lidDome = mesh(lidDomeGeometry, lidMaterial, lidGroup);
  lidDome.scale.y = CONFIG.cup.domeScaleY;
  lidDome.position.y = CONFIG.cup.height * 0.5 + CONFIG.cup.domeLift;
  const lidTabGeometry = geometry(new THREE.BoxGeometry(
    CONFIG.cup.tabW,
    CONFIG.cup.tabH,
    CONFIG.cup.tabD,
  ));
  const lidTab = mesh(lidTabGeometry, lidMaterial, lidGroup);
  lidTab.position.set(
    CONFIG.cup.tabX,
    CONFIG.cup.height * 0.5 + CONFIG.cup.tabLift,
    -CONFIG.cup.tabD * 0.35,
  );

  const iceGeometry = geometry(new THREE.BoxGeometry(
    CONFIG.cup.iceSize,
    CONFIG.cup.iceSize * 0.55,
    CONFIG.cup.iceSize,
  ));
  const iceMeshes = [];
  for (let index = 0; index < 3; index += 1) {
    const ice = mesh(iceGeometry, paperMaterial, cupGroup);
    ice.visible = false;
    iceMeshes.push(ice);
  }
  iceMeshes[0].position.x = -0.017;
  iceMeshes[0].position.z = 0.007;
  iceMeshes[0].rotation.y = 0.35;
  iceMeshes[1].position.x = 0.012;
  iceMeshes[1].position.z = 0.012;
  iceMeshes[1].rotation.y = -0.48;
  iceMeshes[2].position.x = 0.005;
  iceMeshes[2].position.z = -0.014;
  iceMeshes[2].rotation.y = 0.82;

  const basketGeometry = geometry(new THREE.CylinderGeometry(
    CONFIG.portafilter.basketRadius,
    CONFIG.portafilter.basketRadius * 0.86,
    CONFIG.portafilter.basketHeight,
    16,
    1,
    true,
  ));
  const basket = mesh(basketGeometry, chromeMaterial, portafilterGroup);
  basket.position.y = CONFIG.portafilter.basketY;
  const basketBottom = mesh(cupBottomGeometry, chromeMaterial, portafilterGroup);
  basketBottom.scale.setScalar(CONFIG.portafilter.basketRadius / CONFIG.cup.bottomRadius * 0.86);
  basketBottom.rotation.x = -Math.PI * 0.5;
  basketBottom.position.y = CONFIG.portafilter.basketY - CONFIG.portafilter.basketHeight * 0.5;
  const basketRimGeometry = geometry(new THREE.TorusGeometry(
    CONFIG.portafilter.rimRadius,
    CONFIG.portafilter.rimTube,
    6,
    18,
  ));
  const basketRim = mesh(basketRimGeometry, chromeMaterial, portafilterGroup);
  basketRim.rotation.x = Math.PI * 0.5;
  basketRim.position.y = CONFIG.portafilter.basketY + CONFIG.portafilter.basketHeight * 0.5;

  const puckGeometry = geometry(new THREE.CircleGeometry(CONFIG.portafilter.puckRadius, 16));
  const puck = mesh(puckGeometry, blackGlossMaterial, portafilterGroup);
  puck.rotation.x = -Math.PI * 0.5;
  puck.position.y = CONFIG.portafilter.puckY;
  puck.visible = false;

  const spoutGeometry = geometry(new THREE.CylinderGeometry(
    CONFIG.portafilter.spoutRadius * 0.72,
    CONFIG.portafilter.spoutRadius,
    CONFIG.portafilter.spoutLength,
    7,
  ));
  const leftSpout = mesh(spoutGeometry, chromeMaterial, portafilterGroup);
  leftSpout.position.set(-0.012, CONFIG.portafilter.spoutY, -0.005);
  leftSpout.rotation.z = 0.22;
  const rightSpout = mesh(spoutGeometry, chromeMaterial, portafilterGroup);
  rightSpout.position.set(0.012, CONFIG.portafilter.spoutY, -0.005);
  rightSpout.rotation.z = -0.22;

  const handleGeometry = geometry(new THREE.CylinderGeometry(
    CONFIG.portafilter.handleRadius,
    CONFIG.portafilter.handleRadius * 0.86,
    CONFIG.portafilter.handleLength,
    10,
  ));
  const portafilterHandle = mesh(handleGeometry, blackGlossMaterial, portafilterGroup);
  portafilterHandle.position.set(0, CONFIG.portafilter.handleY, CONFIG.portafilter.handleZ);
  portafilterHandle.rotation.x = Math.PI * 0.5;

  const pitcherBodyGeometry = geometry(new THREE.CylinderGeometry(
    CONFIG.pitcher.topRadius,
    CONFIG.pitcher.bottomRadius,
    CONFIG.pitcher.height,
    CONFIG.pitcher.segments,
    1,
    true,
  ));
  const pitcherBody = mesh(pitcherBodyGeometry, steelMaterial, pitcherGroup);
  pitcherBody.position.y = CONFIG.pitcher.height * 0.5;
  const pitcherBottom = mesh(cupBottomGeometry, steelMaterial, pitcherGroup);
  pitcherBottom.scale.setScalar(CONFIG.pitcher.bottomRadius / CONFIG.cup.bottomRadius);
  pitcherBottom.rotation.x = -Math.PI * 0.5;
  pitcherBottom.position.y = 0.001;
  const pitcherRimGeometry = geometry(new THREE.TorusGeometry(
    CONFIG.pitcher.rimRadius,
    CONFIG.pitcher.rimTube,
    6,
    CONFIG.pitcher.segments,
  ));
  const pitcherRim = mesh(pitcherRimGeometry, steelMaterial, pitcherGroup);
  pitcherRim.rotation.x = Math.PI * 0.5;
  pitcherRim.position.y = CONFIG.pitcher.height;

  const pitcherSpoutGeometry = geometry(new THREE.ConeGeometry(
    CONFIG.pitcher.spoutRadius,
    CONFIG.pitcher.spoutLength,
    3,
  ));
  const pitcherSpout = mesh(pitcherSpoutGeometry, steelMaterial, pitcherGroup);
  pitcherSpout.position.set(0, CONFIG.pitcher.spoutY, CONFIG.pitcher.spoutZ);
  pitcherSpout.rotation.x = -Math.PI * 0.5;
  pitcherSpout.scale.y = 0.65;

  const unitBoxGeometry = geometry(new THREE.BoxGeometry(1, 1, 1));
  const handleBar = mesh(unitBoxGeometry, steelMaterial, pitcherGroup);
  handleBar.position.set(CONFIG.pitcher.handleX, CONFIG.pitcher.handleY + CONFIG.pitcher.handleH * 0.5, 0);
  handleBar.scale.set(CONFIG.pitcher.handleW, CONFIG.pitcher.handleH, CONFIG.pitcher.handleD);
  const handleTop = mesh(unitBoxGeometry, steelMaterial, pitcherGroup);
  handleTop.position.set(CONFIG.pitcher.handleX - CONFIG.pitcher.handleReach * 0.5, CONFIG.pitcher.handleH, 0);
  handleTop.scale.set(CONFIG.pitcher.handleReach, CONFIG.pitcher.handleW, CONFIG.pitcher.handleD);
  const handleBottom = mesh(unitBoxGeometry, steelMaterial, pitcherGroup);
  handleBottom.position.set(CONFIG.pitcher.handleX - CONFIG.pitcher.handleReach * 0.5, CONFIG.pitcher.handleW, 0);
  handleBottom.scale.copy(handleTop.scale);

  const milkGeometry = geometry(new THREE.CircleGeometry(CONFIG.pitcher.milkRadius, CONFIG.pitcher.segments));
  const milkDisc = mesh(milkGeometry, foamMaterial, pitcherGroup);
  milkDisc.rotation.x = -Math.PI * 0.5;
  milkDisc.visible = false;

  const steamTexture = makeSteamTexture();
  const steamGeometry = geometry(new THREE.PlaneGeometry(CONFIG.steam.width, CONFIG.steam.height));
  const steamMeshes = [];
  const steamMaterials = [];
  const steamPhases = new Float32Array(CONFIG.steam.count);
  const steamBaseX = new Float32Array(CONFIG.steam.count);
  const steamBaseZ = new Float32Array(CONFIG.steam.count);
  steamPhases[0] = CONFIG.steam.phase0;
  steamPhases[1] = CONFIG.steam.phase1;
  steamPhases[2] = CONFIG.steam.phase2;
  steamBaseX[0] = CONFIG.steam.x0;
  steamBaseX[1] = CONFIG.steam.x1;
  steamBaseX[2] = CONFIG.steam.x2;
  steamBaseZ[0] = CONFIG.steam.z0;
  steamBaseZ[1] = CONFIG.steam.z1;
  steamBaseZ[2] = CONFIG.steam.z2;
  for (let index = 0; index < CONFIG.steam.count; index += 1) {
    const material = ownMaterial(new THREE.MeshBasicMaterial({
      color: 0xFFFFFF,
      map: steamTexture,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }));
    const steam = mesh(steamGeometry, material, pitcherGroup);
    steam.position.set(steamBaseX[index], CONFIG.steam.baseY, steamBaseZ[index]);
    steam.visible = false;
    steamMeshes.push(steam);
    steamMaterials.push(material);
  }

  const camera = ctx?.camera || null;
  const lastCameraPosition = new THREE.Vector3();
  const currentCameraEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  const lastCameraEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  if (camera?.position) lastCameraPosition.copy(camera.position);
  if (camera?.quaternion) {
    currentCameraEuler.setFromQuaternion(camera.quaternion, 'YXZ');
    lastCameraEuler.copy(currentCameraEuler);
  }

  const icedTint = new THREE.Color(CONFIG.cup.icedTint);
  let idleTime = 0;
  let walkPhase = 0;
  let lagX = 0;
  let lagY = 0;
  let lagVelocityX = 0;
  let lagVelocityY = 0;
  let steamActive = false;
  let disposed = false;

  let gestureType = GESTURE_NONE;
  let gestureElapsed = 0;
  let gestureDuration = 0;
  let gestureX = 0;
  let gestureY = 0;
  let gestureZ = 0;
  let gestureRX = 0;
  let gestureRY = 0;
  let gestureRZ = 0;
  let gestureIndexCurl = 0;
  let gestureStartX = 0;
  let gestureStartY = 0;
  let gestureStartZ = 0;
  let gestureStartRX = 0;
  let gestureStartRY = 0;
  let gestureStartRZ = 0;
  let gestureStartIndexCurl = 0;

  function setHeld(item) {
    cupGroup.visible = false;
    portafilterGroup.visible = false;
    pitcherGroup.visible = false;
    steamActive = false;
    lidGroup.visible = false;
    cupLiquid.visible = false;
    cupFoam.visible = false;
    for (let index = 0; index < iceMeshes.length; index += 1) {
      iceMeshes[index].visible = false;
    }
    for (let index = 0; index < steamMeshes.length; index += 1) {
      steamMeshes[index].visible = false;
    }

    if (!item || typeof item !== 'object') return;

    if (item.kind === 'cup') {
      cupGroup.visible = true;
      let scaleX = CONFIG.cup.grandeX;
      let scaleY = CONFIG.cup.grandeY;
      if (item.size === 'short') {
        scaleX = CONFIG.cup.shortX;
        scaleY = CONFIG.cup.shortY;
      } else if (item.size === 'tall') {
        scaleX = CONFIG.cup.tallX;
        scaleY = CONFIG.cup.tallY;
      } else if (item.size === 'venti') {
        scaleX = CONFIG.cup.ventiX;
        scaleY = CONFIG.cup.ventiY;
      }
      cupGroup.scale.set(scaleX, scaleY, scaleX);
      cupGroup.position.y = CONFIG.cup.height * 0.5 * scaleY;

      const fill = clamp(typeof item.fill === 'number' ? item.fill : 0, 0, 1);
      const foam = clamp(typeof item.foam === 'number' ? item.foam : 0, 0, 1);
      const liquidBottom = -CONFIG.cup.height * 0.5 + CONFIG.cup.liquidBottomInset;
      const liquidTop = CONFIG.cup.height * 0.5 - CONFIG.cup.liquidTopInset;
      const liquidY = liquidBottom + (liquidTop - liquidBottom) * fill;
      const lidded = item.lidded === true;
      const iced = item.iced === true;
      cupLiquid.position.y = liquidY;
      cupLiquid.visible = !lidded && fill > 0;
      cupLiquidMaterial.color.setHex(typeof item.color === 'number' ? item.color : 0x5A3024);
      if (iced) cupLiquidMaterial.color.lerp(icedTint, 0.16);

      const foamScale = 0.25 + smoothstep(foam) * 0.75;
      cupFoam.position.y = liquidY + CONFIG.cup.foamLift;
      cupFoam.scale.set(foamScale, foamScale, foamScale);
      cupFoam.visible = !lidded && fill > 0 && foam > 0.02;
      lidGroup.visible = lidded;

      const showIce = iced && !lidded && fill > 0;
      for (let index = 0; index < iceMeshes.length; index += 1) {
        iceMeshes[index].visible = showIce;
        iceMeshes[index].position.y = liquidY + CONFIG.cup.iceLift;
      }
      return;
    }

    if (item.kind === 'portafilter') {
      portafilterGroup.visible = true;
      puck.visible = item.dosed === true;
      return;
    }

    if (item.kind === 'pitcher') {
      pitcherGroup.visible = true;
      const milk = clamp(typeof item.milk === 'number' ? item.milk : 0, 0, 1);
      const milkBottom = CONFIG.pitcher.milkBottomInset;
      const milkTop = CONFIG.pitcher.height - CONFIG.pitcher.milkTopInset;
      milkDisc.position.y = milkBottom + (milkTop - milkBottom) * milk;
      milkDisc.visible = milk > 0.001;
      steamActive = item.steaming === true || (typeof item.temp === 'number' && item.temp > 45);
      for (let index = 0; index < steamMeshes.length; index += 1) {
        steamMeshes[index].visible = steamActive;
      }
    }
  }

  function playGesture(name) {
    let nextType = GESTURE_NONE;
    let nextDuration = 0;
    if (name === 'tamp') {
      nextType = GESTURE_TAMP;
      nextDuration = CONFIG.gesture.tampDuration;
    } else if (name === 'pour') {
      nextType = GESTURE_POUR;
      nextDuration = CONFIG.gesture.pourDuration;
    } else if (name === 'shake') {
      nextType = GESTURE_SHAKE;
      nextDuration = CONFIG.gesture.shakeDuration;
    } else if (name === 'place') {
      nextType = GESTURE_PLACE;
      nextDuration = CONFIG.gesture.placeDuration;
    } else if (name === 'tap') {
      nextType = GESTURE_TAP;
      nextDuration = CONFIG.gesture.tapDuration;
    } else {
      return;
    }

    gestureStartX = gestureX;
    gestureStartY = gestureY;
    gestureStartZ = gestureZ;
    gestureStartRX = gestureRX;
    gestureStartRY = gestureRY;
    gestureStartRZ = gestureRZ;
    gestureStartIndexCurl = gestureIndexCurl;
    gestureType = nextType;
    gestureElapsed = 0;
    gestureDuration = nextDuration;
  }

  function updateGesture(dt) {
    if (gestureType === GESTURE_NONE) return;

    gestureElapsed += dt;
    if (gestureElapsed > gestureDuration) gestureElapsed = gestureDuration;
    const normalized = gestureDuration > 0 ? gestureElapsed / gestureDuration : 1;
    const interruptBlend = smoothstep(gestureElapsed / CONFIG.gesture.blendTime);
    const inverseBlend = 1 - interruptBlend;
    let amount = 0;
    let targetX = 0;
    let targetY = 0;
    let targetZ = 0;
    let targetRX = 0;
    let targetRY = 0;
    let targetRZ = 0;
    let targetIndexCurl = 0;

    if (gestureType === GESTURE_TAMP) {
      if (gestureElapsed < CONFIG.gesture.tampPressEnd) {
        amount = easeOutCubic(gestureElapsed / CONFIG.gesture.tampPressEnd);
      } else if (gestureElapsed < CONFIG.gesture.tampHoldEnd) {
        amount = 1;
      } else {
        amount = 1 - smoothstep(
          (gestureElapsed - CONFIG.gesture.tampHoldEnd)
          / (CONFIG.gesture.tampDuration - CONFIG.gesture.tampHoldEnd),
        );
      }
      targetY = -CONFIG.gesture.tampDown * amount;
      targetRX = CONFIG.gesture.tampPitch * amount;
    } else if (gestureType === GESTURE_POUR) {
      if (gestureElapsed < CONFIG.gesture.pourEnterEnd) {
        amount = smoothstep(gestureElapsed / CONFIG.gesture.pourEnterEnd);
      } else if (gestureElapsed < CONFIG.gesture.pourHoldEnd) {
        amount = 1;
      } else {
        amount = 1 - smoothstep(
          (gestureElapsed - CONFIG.gesture.pourHoldEnd)
          / (CONFIG.gesture.pourDuration - CONFIG.gesture.pourHoldEnd),
        );
      }
      targetX = CONFIG.gesture.pourCentre * amount;
      targetZ = CONFIG.gesture.pourForward * amount;
      targetRX = CONFIG.gesture.pourPitch * amount;
      targetRZ = CONFIG.gesture.pourRoll * amount;
    } else if (gestureType === GESTURE_SHAKE) {
      const envelope = Math.sin(Math.PI * normalized);
      const oscillation = Math.sin(TWO_PI * CONFIG.gesture.shakeCycles * normalized);
      const quadrature = Math.cos(TWO_PI * CONFIG.gesture.shakeCycles * normalized);
      targetX = CONFIG.gesture.shakeX * oscillation * envelope;
      targetY = CONFIG.gesture.shakeY * quadrature * envelope;
      targetRZ = CONFIG.gesture.shakeRoll * oscillation * envelope;
    } else if (gestureType === GESTURE_PLACE) {
      if (normalized < CONFIG.gesture.placePeak) {
        amount = easeOutCubic(normalized / CONFIG.gesture.placePeak);
      } else {
        amount = 1 - smoothstep(
          (normalized - CONFIG.gesture.placePeak) / (1 - CONFIG.gesture.placePeak),
        );
      }
      targetZ = CONFIG.gesture.placeForward * amount;
      targetY = CONFIG.gesture.placeDown * amount;
      targetRX = CONFIG.gesture.placePitch * amount;
    } else if (gestureType === GESTURE_TAP) {
      if (gestureElapsed < CONFIG.gesture.tapJabEnd) {
        amount = easeOutCubic(gestureElapsed / CONFIG.gesture.tapJabEnd);
      } else {
        amount = 1 - smoothstep(
          (gestureElapsed - CONFIG.gesture.tapJabEnd)
          / (CONFIG.gesture.tapDuration - CONFIG.gesture.tapJabEnd),
        );
      }
      targetZ = CONFIG.gesture.tapForward * amount;
      if (gestureElapsed < CONFIG.gesture.tapJabEnd) {
        targetIndexCurl = CONFIG.gesture.tapCurl
          * easeOutCubic(gestureElapsed / CONFIG.gesture.tapJabEnd);
      } else if (gestureElapsed < CONFIG.gesture.tapCurlHoldEnd) {
        targetIndexCurl = CONFIG.gesture.tapCurl;
      } else {
        targetIndexCurl = CONFIG.gesture.tapCurl * (1 - smoothstep(
          (gestureElapsed - CONFIG.gesture.tapCurlHoldEnd)
          / (CONFIG.gesture.tapDuration - CONFIG.gesture.tapCurlHoldEnd),
        ));
      }
    }

    gestureX = gestureStartX * inverseBlend + targetX * interruptBlend;
    gestureY = gestureStartY * inverseBlend + targetY * interruptBlend;
    gestureZ = gestureStartZ * inverseBlend + targetZ * interruptBlend;
    gestureRX = gestureStartRX * inverseBlend + targetRX * interruptBlend;
    gestureRY = gestureStartRY * inverseBlend + targetRY * interruptBlend;
    gestureRZ = gestureStartRZ * inverseBlend + targetRZ * interruptBlend;
    gestureIndexCurl = gestureStartIndexCurl * inverseBlend + targetIndexCurl * interruptBlend;

    if (gestureElapsed >= gestureDuration) {
      gestureType = GESTURE_NONE;
      gestureX = 0;
      gestureY = 0;
      gestureZ = 0;
      gestureRX = 0;
      gestureRY = 0;
      gestureRZ = 0;
      gestureIndexCurl = 0;
    }
  }

  function updateSteam(dt) {
    for (let index = 0; index < steamMeshes.length; index += 1) {
      if (!steamActive) {
        steamMeshes[index].visible = false;
        steamMaterials[index].opacity = 0;
        continue;
      }
      let phase = steamPhases[index] + dt * CONFIG.steam.speed;
      if (phase >= 1) phase -= Math.floor(phase);
      steamPhases[index] = phase;
      steamMeshes[index].visible = true;
      steamMeshes[index].position.x = steamBaseX[index]
        + Math.sin(phase * TWO_PI) * CONFIG.steam.drift;
      steamMeshes[index].position.y = CONFIG.steam.baseY + phase * CONFIG.steam.rise;
      steamMeshes[index].position.z = steamBaseZ[index];
      steamMeshes[index].scale.setScalar(CONFIG.steam.startScale + phase * CONFIG.steam.scaleGrowth);
      steamMaterials[index].opacity = Math.sin(Math.PI * phase) * CONFIG.steam.opacity;
    }
  }

  function update(dt) {
    if (disposed) return;
    let frameDt = typeof dt === 'number' && dt > 0 ? dt : 0;
    if (frameDt > CONFIG.motion.maxDt) frameDt = CONFIG.motion.maxDt;

    let horizontalSpeed = 0;
    let yawDelta = 0;
    let pitchDelta = 0;
    if (camera?.position && camera?.quaternion) {
      const dx = camera.position.x - lastCameraPosition.x;
      const dz = camera.position.z - lastCameraPosition.z;
      if (frameDt > 0) horizontalSpeed = Math.sqrt(dx * dx + dz * dz) / frameDt;
      currentCameraEuler.setFromQuaternion(camera.quaternion, 'YXZ');
      yawDelta = wrappedAngleDelta(currentCameraEuler.y - lastCameraEuler.y);
      pitchDelta = wrappedAngleDelta(currentCameraEuler.x - lastCameraEuler.x);
      lastCameraPosition.copy(camera.position);
      lastCameraEuler.copy(currentCameraEuler);
    }

    const walkSpeed = ctx?.layout?.player?.speed > 0
      ? ctx.layout.player.speed
      : CONFIG.motion.fallbackWalkSpeed;
    const walkAmount = clamp(horizontalSpeed / walkSpeed, 0, 1);
    idleTime += frameDt;
    if (idleTime >= CONFIG.motion.idlePeriod) idleTime -= CONFIG.motion.idlePeriod;
    walkPhase += horizontalSpeed * frameDt * CONFIG.motion.walkPhaseRate;
    if (walkPhase >= TWO_PI * CONFIG.motion.phaseWraps) {
      walkPhase -= TWO_PI * CONFIG.motion.phaseWraps;
    }

    const inverseDt = frameDt > 0 ? 1 / frameDt : 0;
    const targetLagX = clamp(
      yawDelta * inverseDt * CONFIG.motion.lookScaleX,
      -CONFIG.motion.lookLimitX,
      CONFIG.motion.lookLimitX,
    );
    const targetLagY = clamp(
      -pitchDelta * inverseDt * CONFIG.motion.lookScaleY,
      -CONFIG.motion.lookLimitY,
      CONFIG.motion.lookLimitY,
    );
    lagVelocityX += (targetLagX - lagX) * CONFIG.motion.springStrength * frameDt;
    lagVelocityY += (targetLagY - lagY) * CONFIG.motion.springStrength * frameDt;
    const damping = Math.exp(-CONFIG.motion.springDamping * frameDt);
    lagVelocityX *= damping;
    lagVelocityY *= damping;
    lagX += lagVelocityX * frameDt;
    lagY += lagVelocityY * frameDt;
    lagX = clamp(lagX, -CONFIG.motion.lookLimitX, CONFIG.motion.lookLimitX);
    lagY = clamp(lagY, -CONFIG.motion.lookLimitY, CONFIG.motion.lookLimitY);

    updateGesture(frameDt);
    updateSteam(frameDt);

    const idleWeight = 1 - walkAmount;
    const idleAngle = idleTime / CONFIG.motion.idlePeriod * TWO_PI;
    const idleX = Math.sin(idleAngle) * CONFIG.motion.idleAmplitude * idleWeight;
    const idleY = Math.sin(idleAngle * 2) * CONFIG.motion.idleAmplitude
      * CONFIG.motion.idleVerticalRatio * idleWeight;
    const bobY = Math.sin(walkPhase) * CONFIG.motion.walkBob * walkAmount;
    const bobRoll = Math.sin(walkPhase * 0.5) * CONFIG.motion.walkRoll * walkAmount;

    let rigX = CONFIG.rest.x + lagX + idleX + gestureX;
    if (rigX < CONFIG.motion.minRigX) rigX = CONFIG.motion.minRigX;
    rig.position.set(
      rigX,
      CONFIG.rest.y + lagY + idleY + bobY + gestureY,
      CONFIG.rest.z + gestureZ,
    );
    rig.rotation.set(
      CONFIG.rest.rx + gestureRX + lagY * CONFIG.motion.pitchLagRotation,
      CONFIG.rest.ry + gestureRY - lagX * CONFIG.motion.yawLagRotation,
      CONFIG.rest.rz + bobRoll + gestureRZ,
      'YXZ',
    );
    fingerGroups[1].rotation.x = indexFingerRestX + gestureIndexCurl;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (typeof unsubscribeItem === 'function') unsubscribeItem();
    else ctx?.bus?.off?.('hand:item', onHandItem);
    if (typeof unsubscribeGesture === 'function') unsubscribeGesture();
    else ctx?.bus?.off?.('hand:gesture', onHandGesture);
    group.removeFromParent();
    for (let index = 0; index < ownedGeometries.length; index += 1) {
      ownedGeometries[index].dispose();
    }
    for (let index = 0; index < ownedMaterials.length; index += 1) {
      ownedMaterials[index].dispose();
    }
    if (skinTexture) skinTexture.dispose();
    if (steamTexture) steamTexture.dispose();
    if (ctx?.hands === api) ctx.hands = null;
  }

  const api = { group, update, setHeld, playGesture, dispose };
  const onHandItem = (payload) => api.setHeld(payload && payload.item);
  const onHandGesture = (payload) => api.playGesture(payload && payload.name);
  let unsubscribeItem = null;
  let unsubscribeGesture = null;
  try {
    unsubscribeItem = ctx?.bus?.on?.('hand:item', onHandItem) || null;
  } catch (_) {
    unsubscribeItem = null;
  }
  try {
    unsubscribeGesture = ctx?.bus?.on?.('hand:gesture', onHandGesture) || null;
  } catch (_) {
    unsubscribeGesture = null;
  }
  if (ctx && typeof ctx === 'object') ctx.hands = api;
  return api;
}
