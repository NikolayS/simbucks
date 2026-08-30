/*
 * Equipment budget estimate: 40 draw calls, approximately 9k triangles.
 * Repeated cups, gauges, bottles, pumps, ice, water bottles, caps, and LEDs
 * are instanced; same-finish static machine parts are locally merged.
 */
import * as THREE from 'three';

let stationAnchors = {};

// mirrored from src/world/kiosk.js
const SINK_CUTOUT_WIDTH = 0.46;
const SINK_CUTOUT_DEPTH = 0.34;
const ICE_WELL_CUTOUT_WIDTH = 0.38;
const ICE_WELL_CUTOUT_DEPTH = 0.30;
// mirrored from src/world/kiosk.js
const UNDER_COUNTER_BAY_X0 = -3.35;
const UNDER_COUNTER_BAY_X1 = 3.40;
const UNDER_COUNTER_BAY_Z0 = -2.32;
const UNDER_COUNTER_BAY_Z1 = -1.88;
const UNDER_COUNTER_BAY_FLOOR_Y = 0.125;
const UNDER_COUNTER_BAY_OPENING_TOP_Y = 0.90;

export function getStationAnchors() {
  const copy = {};
  for (const [id, point] of Object.entries(stationAnchors)) copy[id] = point.clone();
  return copy;
}

export function buildEquipment(ctx) {
  const L = ctx.layout;
  const group = new THREE.Group();
  group.name = 'equipment';
  const backMachineZ0 = L.kiosk.outer.z0 + 0.05;
  const backMachineZ1 = L.kiosk.backSlab.z1 - 0.02;

  const ownedMaterials = new Set();
  const ownedTextures = new Set();
  const materialCache = new Map();
  const textureCache = new Map();
  const rng = typeof ctx.rng === 'function' ? ctx.rng : () => 0.5;
  const anisotropy = ctx.renderer?.capabilities?.getMaxAnisotropy?.() ?? 1;

  function fallbackColor(name) {
    const colors = {
      oak: L.palette.oak,
      oakDark: L.palette.oakGrain,
      worktop: L.palette.worktop,
      blackMatte: L.palette.black,
      blackGloss: 0x1b1e24,
      chrome: 0xd8dce0,
      steel: 0xa9afb6,
      glass: 0xbfd8dd,
      screen: 0xffffff,
      screenDim: 0x8892a0,
      cardboard: 0xb08d57,
      ice: 0xdceef5,
      paperCup: 0xf6f3ec,
      rubber: 0x2a2a2c,
    };
    return colors[name] ?? 0xcccccc;
  }

  function texClone(name, repX = 1, repY = 1) {
    const key = `${name}|${repX}|${repY}`;
    if (textureCache.has(key)) return textureCache.get(key);
    let shared = null;
    try {
      shared = ctx.tex?.[name]?.() ?? null;
    } catch {
      shared = null;
    }
    if (!shared?.clone) {
      textureCache.set(key, null);
      return null;
    }
    const texture = shared.clone();
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repX, repY);
    texture.anisotropy = anisotropy;
    texture.needsUpdate = true;
    ownedTextures.add(texture);
    textureCache.set(key, texture);
    return texture;
  }

  function matWith(baseName, { map, emissiveMap, emissive, color, ...overrides } = {}) {
    const extras = Object.entries(overrides)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}:${value}`)
      .join('|');
    const key = [
      baseName,
      map === undefined ? 'inherit' : (map?.uuid ?? 'none'),
      emissiveMap === undefined ? 'inherit' : (emissiveMap?.uuid ?? 'none'),
      emissive ?? '-',
      color ?? '-',
      extras,
    ].join('|');
    if (materialCache.has(key)) return materialCache.get(key);

    let shared = null;
    try {
      shared = ctx.mat?.get?.(baseName) ?? null;
    } catch {
      shared = null;
    }
    const material = shared?.clone?.() ?? new THREE.MeshStandardMaterial({
      color: color ?? fallbackColor(baseName),
      roughness: 0.7,
      metalness: baseName === 'chrome' || baseName === 'steel' ? 0.82 : 0.04,
    });
    ownedMaterials.add(material);

    if (map !== undefined && 'map' in material) material.map = map;
    if ('color' in material && (map !== undefined || color !== undefined)) {
      material.color.set(map ? 0xffffff : (color ?? fallbackColor(baseName)));
    }
    if ('emissive' in material) {
      if (emissive !== undefined) material.emissive.set(emissive);
      if (emissiveMap !== undefined && 'emissiveMap' in material) material.emissiveMap = emissiveMap;
    }
    for (const [property, value] of Object.entries(overrides)) {
      if (property in material) material[property] = value;
    }
    material.needsUpdate = true;
    materialCache.set(key, material);
    return material;
  }

  function matrix(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    return new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
      new THREE.Vector3(sx, sy, sz),
    );
  }

  function mergeGeometry(parts) {
    const positions = [];
    const normals = [];
    const uvs = [];
    const sourceGeometries = new Set();

    for (const part of parts) {
      sourceGeometries.add(part.geometry);
      let geometry = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
      if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
      geometry.applyMatrix4(part.matrix ?? new THREE.Matrix4());
      const position = geometry.getAttribute('position');
      const normal = geometry.getAttribute('normal');
      const uv = geometry.getAttribute('uv');
      for (let i = 0; i < position.count; i += 1) {
        positions.push(position.getX(i), position.getY(i), position.getZ(i));
        normals.push(normal.getX(i), normal.getY(i), normal.getZ(i));
        if (uv) uvs.push(uv.getX(i), uv.getY(i));
        else uvs.push(0, 0);
      }
      geometry.dispose();
    }

    for (const source of sourceGeometries) source.dispose();
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    return merged;
  }

  function addStationGroup(name, x, z) {
    const station = new THREE.Group();
    station.name = `equip.${name}`;
    station.position.set(x, 0, z);
    group.add(station);
    return station;
  }

  function addMesh(parent, name, geometry, material, castShadow = true, receiveShadow = false) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    parent.add(mesh);
    return mesh;
  }

  function finishInstances(mesh, castShadow = true, receiveShadow = false) {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingBox?.();
    mesh.computeBoundingSphere?.();
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    return mesh;
  }

  function tube(points, radius, tubularSegments = 20, radialSegments = 6) {
    return new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z))),
      tubularSegments,
      radius,
      radialSegments,
      false,
    );
  }

  const materials = {
    chrome: matWith('chrome', { roughness: 0.2, metalness: 0.9 }),
    steel: matWith('steel', { roughness: 0.38, metalness: 0.82 }),
    black: matWith('blackMatte', { roughness: 0.66 }),
    blackGloss: matWith('blackGloss', { roughness: 0.25 }),
    rubber: matWith('rubber', { roughness: 0.85 }),
    paper: matWith('paperCup', { roughness: 0.82, side: THREE.DoubleSide }),
    glass: matWith('glass', { transparent: true, opacity: 0.24, roughness: 0.08, side: THREE.DoubleSide }),
    ice: matWith('ice', { transparent: true, opacity: 0.72, roughness: 0.12 }),
    cardboard: matWith('cardboard', { roughness: 0.9 }),
    oak: matWith('oak', { roughness: 0.72 }),
    white: matWith('paperCup', { color: 0xf8f7f1, roughness: 0.55 }),
    darkSteel: matWith('steel', { color: 0x5d646b, roughness: 0.72, metalness: 0.72 }),
  };

  const ledPositions = { green: [], amber: [], red: [] };
  const clearParts = [];
  const blackAccentParts = [];
  const interactableObjects = {};
  let ledMaterial = null;
  stationAnchors = {};

  // Cup dispenser: eighteen nested cups share one tapered open geometry.
  {
    const P = L.back.cupStack;
    const station = addStationGroup('cupStack', P.x, P.z);
    const railParts = [];
    railParts.push({
      geometry: new THREE.CylinderGeometry(0.018, 0.018, 0.58, 12),
      matrix: matrix(0, L.kiosk.backTop + 0.105, -0.075, 0, 0, Math.PI / 2),
    });
    railParts.push({
      geometry: new THREE.BoxGeometry(0.62, 0.035, 0.13),
      matrix: matrix(0, L.kiosk.backTop + 0.018, -0.02),
    });
    for (const x of [-0.19, 0, 0.19]) {
      railParts.push({
        geometry: new THREE.TorusGeometry(0.052, 0.008, 8, 16),
        matrix: matrix(x, L.kiosk.backTop + 0.095, 0, Math.PI / 2),
      });
    }
    const rail = addMesh(
      station,
      'equip.cupStack.rail',
      mergeGeometry(railParts),
      materials.chrome,
      true,
      true,
    );
    interactableObjects.cupStack = rail;

    const cupGeometry = new THREE.CylinderGeometry(0.042, 0.029, 0.12, 16, 1, true);
    const cups = new THREE.InstancedMesh(cupGeometry, materials.paper, 18);
    cups.name = 'equip.cupStack.cups';
    const dummy = new THREE.Object3D();
    const sizes = [0.9, 1, 1.12];
    let index = 0;
    for (let column = 0; column < 3; column += 1) {
      for (let row = 0; row < 6; row += 1) {
        const size = sizes[column];
        dummy.position.set(
          -0.19 + column * 0.19,
          L.kiosk.backTop + 0.06 * size + row * 0.047,
          0,
        );
        dummy.scale.set(size, size, size);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        cups.setMatrixAt(index, dummy.matrix);
        index += 1;
      }
    }
    finishInstances(cups, true, false);
    station.add(cups);
    stationAnchors.cupStack = new THREE.Vector3(
      P.x,
      L.kiosk.backTop + 0.12 + 5 * 0.047,
      P.z,
    );
    ledPositions.green.push([P.x + 0.27, L.kiosk.backTop + 0.075, P.z + 0.05]);
  }

  // Conical-burr grinder with a textured bean mass inside the clear hopper.
  {
    const P = L.back.grinder;
    const station = addStationGroup('grinder', P.x, P.z);
    const chromeGeometry = mergeGeometry([
      { geometry: new THREE.CylinderGeometry(0.09, 0.1, 0.075, 16), matrix: matrix(0, L.kiosk.backTop + 0.038, 0) },
      { geometry: new THREE.CylinderGeometry(0.075, 0.09, 0.19, 16), matrix: matrix(0, L.kiosk.backTop + 0.17, 0) },
      { geometry: new THREE.CylinderGeometry(0.06, 0.075, 0.07, 16), matrix: matrix(0, L.kiosk.backTop + 0.30, 0) },
      { geometry: new THREE.BoxGeometry(0.018, 0.018, 0.13), matrix: matrix(-0.043, L.kiosk.backTop + 0.20, 0.13) },
      { geometry: new THREE.BoxGeometry(0.018, 0.018, 0.13), matrix: matrix(0.043, L.kiosk.backTop + 0.20, 0.13) },
    ]);
    const body = addMesh(station, 'equip.grinder.body', chromeGeometry, materials.chrome, true, true);
    interactableObjects.grinder = body;

    clearParts.push({
      geometry: new THREE.CylinderGeometry(0.1, 0.063, 0.19, 16, 1, true),
      matrix: matrix(P.x, L.kiosk.backTop + 0.425, P.z),
    });
    const beanMap = texClone('beans', 2, 1);
    const beanMaterial = matWith('espresso', {
      map: beanMap,
      color: 0x3b2318,
      roughness: 0.92,
    });
    const beans = addMesh(
      station,
      'equip.grinder.beans',
      new THREE.CylinderGeometry(0.088, 0.057, 0.135, 16),
      beanMaterial,
      false,
      false,
    );
    beans.position.y = L.kiosk.backTop + 0.39;

    blackAccentParts.push(
      { geometry: new THREE.BoxGeometry(0.06, 0.055, 0.13), matrix: matrix(P.x, L.kiosk.backTop + 0.265, P.z + 0.11, -0.34) },
      { geometry: new THREE.CylinderGeometry(0.027, 0.023, 0.05, 12), matrix: matrix(P.x, L.kiosk.backTop + 0.205, P.z + 0.18) },
    );
    stationAnchors.grinder = new THREE.Vector3(P.x, L.kiosk.backTop + 0.165, P.z + 0.18);
    ledPositions.amber.push([P.x + 0.052, L.kiosk.backTop + 0.30, P.z + 0.076]);
  }

  // Traditional two-group espresso centrepiece.
  {
    const P = L.back.espresso;
    const W = L.kiosk.backTop;
    const station = addStationGroup('espresso', P.x, P.z);
    const zF = backMachineZ1 - P.z - 0.01;
    const zB = zF - 0.55;
    const bodyFrontZ = zF - 0.22;
    const bodyParts = [
      {
        geometry: new THREE.BoxGeometry(1.16, 0.42, 0.33),
        matrix: matrix(0, W + 0.21, (zB + bodyFrontZ) * 0.5),
      },
      {
        geometry: new THREE.BoxGeometry(0.085, 0.42, 0.22),
        matrix: matrix(-0.5375, W + 0.21, zF - 0.11),
      },
      {
        geometry: new THREE.BoxGeometry(0.085, 0.42, 0.22),
        matrix: matrix(0.5375, W + 0.21, zF - 0.11),
      },
    ];
    const body = addMesh(
      station,
      'equip.espresso.body',
      mergeGeometry(bodyParts),
      materials.steel,
      true,
      true,
    );
    interactableObjects.espresso = body;

    blackAccentParts.push(
      {
        geometry: new THREE.BoxGeometry(1.20, 0.24, 0.36),
        matrix: matrix(P.x, W + 0.54, P.z + zF - 0.13),
      },
      {
        geometry: new THREE.BoxGeometry(1.05, 0.006, 0.28),
        matrix: matrix(P.x, W + 0.016, P.z + zF - 0.15),
      },
      {
        geometry: new THREE.BoxGeometry(0.016, 0.052, 0.016),
        matrix: matrix(P.x, W + 0.345, P.z + zF - 0.175, 0, 0, 0.42),
      },
    );

    const chromeParts = [
      { geometry: new THREE.BoxGeometry(1.08, 0.012, 0.30), matrix: matrix(0, W + 0.006, zF - 0.15) },
      { geometry: new THREE.BoxGeometry(1.08, 0.05, 0.014), matrix: matrix(0, W + 0.025, zF - 0.007) },
      { geometry: new THREE.BoxGeometry(0.014, 0.05, 0.30), matrix: matrix(-0.533, W + 0.025, zF - 0.15) },
      { geometry: new THREE.BoxGeometry(0.014, 0.05, 0.30), matrix: matrix(0.533, W + 0.025, zF - 0.15) },
      { geometry: new THREE.BoxGeometry(1.10, 0.02, 0.30), matrix: matrix(0, W + 0.67, zF - 0.15) },
      { geometry: new THREE.BoxGeometry(0.98, 0.14, 0.014), matrix: matrix(0, W + 0.35, zF - 0.213) },
      { geometry: new THREE.CylinderGeometry(0.026, 0.026, 0.09, 12), matrix: matrix(0, W + 0.28, zF - 0.175) },
      {
        geometry: tube([
          [0, W + 0.255, zF - 0.163],
          [0, W + 0.235, zF - 0.115],
          [0, W + 0.175, zF - 0.095],
        ], 0.008, 16),
        matrix: matrix(),
      },
      { geometry: new THREE.SphereGeometry(0.026, 10, 6), matrix: matrix(-0.60, W + 0.36, zF - 0.20) },
    ];
    for (let i = 0; i < 11; i += 1) {
      chromeParts.push({
        geometry: new THREE.BoxGeometry(1.05, 0.010, 0.016),
        matrix: matrix(0, W + 0.052, zF - 0.028 - i * 0.0255),
      });
    }
    for (const groupX of P.groups) {
      const gx = groupX - P.x;
      chromeParts.push(
        { geometry: new THREE.BoxGeometry(0.115, 0.10, 0.14), matrix: matrix(gx, W + 0.30, zF - 0.15) },
        { geometry: new THREE.CylinderGeometry(0.058, 0.058, 0.105, 16), matrix: matrix(gx, W + 0.30, zF - 0.075) },
        { geometry: new THREE.CylinderGeometry(0.050, 0.050, 0.020, 16), matrix: matrix(gx, W + 0.238, zF - 0.075) },
        { geometry: new THREE.CylinderGeometry(0.046, 0.043, 0.038, 16), matrix: matrix(gx, W + 0.208, zF - 0.075) },
        { geometry: new THREE.CylinderGeometry(0.0075, 0.006, 0.030, 8), matrix: matrix(gx - 0.016, W + 0.174, zF - 0.075) },
        { geometry: new THREE.CylinderGeometry(0.0075, 0.006, 0.030, 8), matrix: matrix(gx + 0.016, W + 0.174, zF - 0.075) },
        {
          geometry: new THREE.CylinderGeometry(0.015, 0.017, 0.030, 10),
          matrix: matrix(gx, W + 0.2019, zF - 0.0582, Math.PI / 2 + 0.33),
        },
      );

      blackAccentParts.push({
        geometry: new THREE.CylinderGeometry(0.013, 0.0155, 0.12, 10),
        matrix: matrix(groupX, W + 0.1776, P.z + zF + 0.0128, Math.PI / 2 + 0.33),
      });
    }

    const gaugeXs = [P.groups[0] - P.x, 0, P.groups[1] - P.x];
    for (const x of gaugeXs) {
      chromeParts.push({
        geometry: new THREE.CylinderGeometry(0.043, 0.043, 0.016, 16),
        matrix: matrix(x, W + 0.545, zF + 0.052, Math.PI / 2),
      });
    }
    chromeParts.push(
      {
        geometry: tube([
          [-0.50, W + 0.68, zF - 0.25],
          [-0.50, W + 0.76, zF - 0.25],
          [-0.50, W + 0.76, zF - 0.03],
          [0.50, W + 0.76, zF - 0.03],
          [0.50, W + 0.76, zF - 0.25],
          [0.50, W + 0.68, zF - 0.25],
        ], 0.009, 28),
        matrix: matrix(),
      },
      {
        geometry: tube([
          [-0.60, W + 0.36, zF - 0.20],
          [-0.66, W + 0.34, zF - 0.14],
          [-0.68, W + 0.22, zF - 0.04],
          [-0.68, W + 0.14, zF + 0.01],
        ], 0.008),
        matrix: matrix(),
      },
      {
        geometry: new THREE.CylinderGeometry(0.024, 0.024, 0.05, 12),
        matrix: matrix(-0.60, W + 0.38, zF - 0.20),
      },
    );
    addMesh(
      station,
      'equip.espresso.chrome',
      mergeGeometry(chromeParts),
      materials.chrome,
      true,
      true,
    );

    const faceGeometry = new THREE.CylinderGeometry(0.034, 0.034, 0.004, 16);
    const gaugeFaces = new THREE.InstancedMesh(faceGeometry, materials.black, 3);
    gaugeFaces.name = 'equip.espresso.gaugeFaces';
    const gaugeDummy = new THREE.Object3D();
    for (let i = 0; i < 3; i += 1) {
      gaugeDummy.position.set(gaugeXs[i], W + 0.545, zF + 0.0615);
      gaugeDummy.rotation.set(Math.PI / 2, 0, 0);
      gaugeDummy.scale.set(1, 1, 1);
      gaugeDummy.updateMatrix();
      gaugeFaces.setMatrixAt(i, gaugeDummy.matrix);
    }
    finishInstances(gaugeFaces, false, false);
    station.add(gaugeFaces);

    const needleGeometry = new THREE.BoxGeometry(0.0035, 0.027, 0.0035);
    const needles = new THREE.InstancedMesh(needleGeometry, materials.white, 3);
    needles.name = 'equip.espresso.gaugeNeedles';
    for (let i = 0; i < 3; i += 1) {
      gaugeDummy.position.set(gaugeXs[i], W + 0.545, zF + 0.065);
      gaugeDummy.rotation.set(0, 0, -0.6 + i * 0.28);
      gaugeDummy.updateMatrix();
      needles.setMatrixAt(i, gaugeDummy.matrix);
    }
    finishInstances(needles, false, false);
    station.add(needles);
    ledPositions.green.push([P.x - 0.545, W + 0.47, P.z + zF + 0.055]);
    ledPositions.amber.push([P.x + 0.545, W + 0.47, P.z + zF + 0.055]);
    stationAnchors.espresso = new THREE.Vector3(P.groups[0], W + 0.115, P.z + zF - 0.075);
  }

  // Articulated steam wand and parked stainless milk pitcher.
  {
    const P = L.back.steamWand;
    const station = addStationGroup('steamWand', P.x, P.z);
    const tip = { x: 0.02, y: L.kiosk.backTop + 0.125, z: 0.18 };
    const pitcherProfile = [
      new THREE.Vector2(0.048, 0),
      new THREE.Vector2(0.06, 0.02),
      new THREE.Vector2(0.064, 0.13),
      new THREE.Vector2(0.075, 0.17),
      new THREE.Vector2(0.069, 0.18),
    ];
    const chromeParts = [
      { geometry: tube([[-0.22, L.kiosk.backTop + 0.34, 0.02], [-0.13, L.kiosk.backTop + 0.33, 0.05], [-0.04, L.kiosk.backTop + 0.25, 0.10], [tip.x, tip.y, tip.z]], 0.008, 18, 6), matrix: matrix() },
      { geometry: new THREE.SphereGeometry(0.031, 10, 6), matrix: matrix(-0.13, L.kiosk.backTop + 0.33, 0.05) },
      { geometry: new THREE.CylinderGeometry(0.013, 0.011, 0.035, 12), matrix: matrix(tip.x, tip.y, tip.z) },
      { geometry: new THREE.LatheGeometry(pitcherProfile, 12), matrix: matrix(0.035, L.kiosk.backTop, 0.08) },
      { geometry: new THREE.TorusGeometry(0.058, 0.007, 6, 12, Math.PI * 1.45), matrix: matrix(0.105, L.kiosk.backTop + 0.09, 0.08, 0, Math.PI / 2, -Math.PI * 0.72) },
      { geometry: new THREE.ConeGeometry(0.035, 0.065, 3), matrix: matrix(0.035, L.kiosk.backTop + 0.175, 0.064, Math.PI / 2) },
    ];
    const wand = addMesh(
      station,
      'equip.steamWand.bodyAndPitcher',
      mergeGeometry(chromeParts),
      materials.steel,
      true,
      true,
    );
    interactableObjects.steamWand = wand;

    const blackParts = [
      { geometry: new THREE.CylinderGeometry(0.024, 0.024, 0.055, 12), matrix: matrix(-0.13, L.kiosk.backTop + 0.385, 0.05) },
    ];
    for (const [dx, dz] of [[-0.004, -0.004], [-0.004, 0.004], [0.004, -0.004], [0.004, 0.004]]) {
      blackParts.push({
        geometry: new THREE.SphereGeometry(0.0018, 6, 4),
        matrix: matrix(tip.x + dx, tip.y - 0.018, tip.z + dz),
      });
    }
    addMesh(station, 'equip.steamWand.knobAndTipHoles', mergeGeometry(blackParts), materials.black, false, false);
    stationAnchors.steamWand = new THREE.Vector3(P.x + tip.x, tip.y - 0.018, P.z + tip.z);
  }

  // Compact superautomatic machine.
  {
    const P = L.back.superauto;
    const station = addStationGroup('superauto', P.x, P.z);
    const blackGeometry = mergeGeometry([
      { geometry: new THREE.BoxGeometry(0.34, 0.36, 0.30), matrix: matrix(0, L.kiosk.backTop + 0.18, 0) },
      { geometry: new THREE.BoxGeometry(0.30, 0.025, 0.25), matrix: matrix(0, L.kiosk.backTop + 0.018, 0.14) },
    ]);
    const body = addMesh(station, 'equip.superauto.body', blackGeometry, materials.black, true, true);
    interactableObjects.superauto = body;

    const chromeGeometry = mergeGeometry([
      { geometry: new THREE.BoxGeometry(0.27, 0.27, 0.025), matrix: matrix(0, L.kiosk.backTop + 0.19, 0.158) },
      { geometry: new THREE.CylinderGeometry(0.011, 0.011, 0.095, 12), matrix: matrix(-0.025, L.kiosk.backTop + 0.16, 0.195) },
      { geometry: new THREE.CylinderGeometry(0.011, 0.011, 0.095, 12), matrix: matrix(0.025, L.kiosk.backTop + 0.16, 0.195) },
      { geometry: new THREE.BoxGeometry(0.25, 0.018, 0.19), matrix: matrix(0, L.kiosk.backTop + 0.04, 0.18) },
    ]);
    addMesh(station, 'equip.superauto.front', chromeGeometry, materials.chrome, true, true);
    const hopperMaterial = matWith('glass', { color: 0x303840, transparent: true, opacity: 0.5, roughness: 0.18 });
    const hopper = addMesh(
      station,
      'equip.superauto.hopper',
      new THREE.SphereGeometry(0.11, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      hopperMaterial,
      true,
      false,
    );
    hopper.scale.z = 0.78;
    hopper.position.y = L.kiosk.backTop + 0.37;
    const blueScreen = matWith('blackMatte', {
      color: 0x15324f,
      emissive: 0x2c83c9,
      emissiveIntensity: 1.4,
      toneMapped: false,
    });
    const display = addMesh(
      station,
      'equip.superauto.display',
      new THREE.BoxGeometry(0.11, 0.055, 0.008),
      blueScreen,
      false,
      false,
    );
    display.position.set(0, L.kiosk.backTop + 0.285, 0.176);
    stationAnchors.superauto = new THREE.Vector3(P.x, L.kiosk.backTop + 0.09, P.z + 0.195);
    ledPositions.green.push([P.x + 0.11, L.kiosk.backTop + 0.285, P.z + 0.184]);
  }

  // Two-tier syrup rack, with six square-shouldered bottles and pump heads.
  {
    const P = L.back.syrupRack;
    const station = addStationGroup('syrupRack', P.x, P.z);
    const rackGeometry = mergeGeometry([
      { geometry: new THREE.BoxGeometry(0.55, 0.025, 0.18), matrix: matrix(0, L.kiosk.backTop + 0.012, 0.085) },
      { geometry: new THREE.BoxGeometry(0.55, 0.025, 0.18), matrix: matrix(0, L.kiosk.backTop + 0.10, -0.085) },
      { geometry: new THREE.BoxGeometry(0.55, 0.16, 0.018), matrix: matrix(0, L.kiosk.backTop + 0.08, -0.17) },
    ]);
    const rack = addMesh(station, 'equip.syrupRack.rack', rackGeometry, materials.chrome, true, true);
    interactableObjects.syrupRack = rack;

    const bottleGeometry = mergeGeometry([
      { geometry: new THREE.BoxGeometry(0.09, 0.21, 0.09), matrix: matrix(0, 0.105, 0) },
      { geometry: new THREE.CylinderGeometry(0.025, 0.04, 0.05, 12), matrix: matrix(0, 0.235, 0) },
    ]);
    const bottleMaterial = matWith('glass', {
      color: 0xffffff,
      transparent: true,
      opacity: 0.5,
      roughness: 0.14,
    });
    const bottles = new THREE.InstancedMesh(bottleGeometry, bottleMaterial, 6);
    bottles.name = 'equip.syrupRack.bottles';
    const pumpsGeometry = mergeGeometry([
      { geometry: new THREE.CylinderGeometry(0.019, 0.019, 0.055, 12), matrix: matrix(0, 0.027, 0) },
      { geometry: new THREE.BoxGeometry(0.058, 0.014, 0.026), matrix: matrix(0.018, 0.06, 0.008) },
      { geometry: new THREE.BoxGeometry(0.018, 0.016, 0.075), matrix: matrix(0.02, 0.057, 0.045, -0.23) },
    ]);
    const pumps = new THREE.InstancedMesh(pumpsGeometry, materials.black, 6);
    pumps.name = 'equip.syrupRack.pumps';
    const dummy = new THREE.Object3D();
    const bottleColors = [0xb76c20, 0x8a4f2b, 0x3f7f45];
    let index = 0;
    for (let row = 0; row < 2; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        const baseY = L.kiosk.backTop + 0.025 + row * 0.10;
        const z = 0.085 - row * 0.17;
        dummy.position.set(-0.18 + column * 0.18, baseY, z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        bottles.setMatrixAt(index, dummy.matrix);
        bottles.setColorAt(index, new THREE.Color(bottleColors[column]));
        dummy.position.y = baseY + 0.26;
        dummy.updateMatrix();
        pumps.setMatrixAt(index, dummy.matrix);
        index += 1;
      }
    }
    finishInstances(bottles, true, false);
    finishInstances(pumps, true, false);
    station.add(bottles, pumps);
    stationAnchors.syrupRack = new THREE.Vector3(
      P.x + 0.02,
      L.kiosk.backTop + 0.025 + 0.317,
      P.z + 0.13,
    );
    ledPositions.amber.push([P.x + 0.25, L.kiosk.backTop + 0.07, P.z + 0.18]);
  }

  // Iced-drink blender with clear tapered jug.
  {
    const P = L.back.blender;
    const station = addStationGroup('blender', P.x, P.z);
    const blackGeometry = mergeGeometry([
      { geometry: new THREE.BoxGeometry(0.18, 0.20, 0.18), matrix: matrix(0, L.kiosk.backTop + 0.10, 0) },
      { geometry: new THREE.CylinderGeometry(0.078, 0.078, 0.025, 16), matrix: matrix(0, L.kiosk.backTop + 0.345, 0) },
      { geometry: new THREE.CylinderGeometry(0.026, 0.026, 0.025, 12), matrix: matrix(0, L.kiosk.backTop + 0.37, 0) },
      { geometry: new THREE.TorusGeometry(0.07, 0.009, 6, 12, Math.PI * 1.35), matrix: matrix(0.095, L.kiosk.backTop + 0.285, 0, 0, Math.PI / 2, -Math.PI * 0.67) },
    ]);
    const base = addMesh(station, 'equip.blender.base', blackGeometry, materials.black, true, true);
    interactableObjects.blender = base;

    clearParts.push(
      { geometry: new THREE.CylinderGeometry(0.068, 0.052, 0.22, 16, 1, true), matrix: matrix(P.x, L.kiosk.backTop + 0.235, P.z) },
      { geometry: new THREE.ConeGeometry(0.032, 0.055, 3), matrix: matrix(P.x, L.kiosk.backTop + 0.335, P.z + 0.055, Math.PI / 2) },
    );
    const controlMaterial = matWith('blackMatte', {
      color: 0x173629,
      emissive: 0x39d47e,
      emissiveIntensity: 1.4,
      toneMapped: false,
    });
    const controls = addMesh(
      station,
      'equip.blender.controlStrip',
      new THREE.BoxGeometry(0.12, 0.035, 0.009),
      controlMaterial,
      false,
      false,
    );
    controls.position.set(0, L.kiosk.backTop + 0.105, 0.095);
    stationAnchors.blender = new THREE.Vector3(P.x, L.kiosk.backTop + 0.235, P.z);
    ledPositions.green.push([P.x + 0.052, L.kiosk.backTop + 0.105, P.z + 0.102]);
  }

  addMesh(group, 'equip.clearHoppersAndJugs', mergeGeometry(clearParts), materials.glass, true, false);
  addMesh(group, 'equip.blackMachineAccents', mergeGeometry(blackAccentParts), materials.black, true, false);

  // Recessed ice well with deterministic instanced ice and a resting scoop.
  {
    const P = L.back.iceWell;
    const station = addStationGroup('iceWell', P.x, P.z);
    const floorY = L.kiosk.backTop - 0.22;
    const wallHeight = L.kiosk.backTop - floorY;
    const wallThickness = 0.018;
    const rimRadius = 0.012;
    const steelParts = [
      { geometry: new THREE.CylinderGeometry(rimRadius, rimRadius, ICE_WELL_CUTOUT_WIDTH + 0.04, 12), matrix: matrix(0, L.kiosk.backTop + rimRadius, -(ICE_WELL_CUTOUT_DEPTH / 2 + 0.01), 0, 0, Math.PI / 2) },
      { geometry: new THREE.CylinderGeometry(rimRadius, rimRadius, ICE_WELL_CUTOUT_WIDTH + 0.04, 12), matrix: matrix(0, L.kiosk.backTop + rimRadius, ICE_WELL_CUTOUT_DEPTH / 2 + 0.01, 0, 0, Math.PI / 2) },
      { geometry: new THREE.CylinderGeometry(rimRadius, rimRadius, ICE_WELL_CUTOUT_DEPTH + 0.04, 12), matrix: matrix(-(ICE_WELL_CUTOUT_WIDTH / 2 + 0.01), L.kiosk.backTop + rimRadius, 0, Math.PI / 2) },
      { geometry: new THREE.CylinderGeometry(rimRadius, rimRadius, ICE_WELL_CUTOUT_DEPTH + 0.04, 12), matrix: matrix(ICE_WELL_CUTOUT_WIDTH / 2 + 0.01, L.kiosk.backTop + rimRadius, 0, Math.PI / 2) },
      { geometry: new THREE.BoxGeometry(ICE_WELL_CUTOUT_WIDTH, wallHeight, wallThickness), matrix: matrix(0, floorY + wallHeight / 2, -(ICE_WELL_CUTOUT_DEPTH / 2 - wallThickness / 2)) },
      { geometry: new THREE.BoxGeometry(ICE_WELL_CUTOUT_WIDTH, wallHeight, wallThickness), matrix: matrix(0, floorY + wallHeight / 2, ICE_WELL_CUTOUT_DEPTH / 2 - wallThickness / 2) },
      { geometry: new THREE.BoxGeometry(wallThickness, wallHeight, ICE_WELL_CUTOUT_DEPTH - wallThickness * 2), matrix: matrix(-(ICE_WELL_CUTOUT_WIDTH / 2 - wallThickness / 2), floorY + wallHeight / 2, 0) },
      { geometry: new THREE.BoxGeometry(wallThickness, wallHeight, ICE_WELL_CUTOUT_DEPTH - wallThickness * 2), matrix: matrix(ICE_WELL_CUTOUT_WIDTH / 2 - wallThickness / 2, floorY + wallHeight / 2, 0) },
      { geometry: new THREE.LatheGeometry([new THREE.Vector2(0.02, 0), new THREE.Vector2(0.064, 0.025), new THREE.Vector2(0.075, 0.07)], 12, -Math.PI / 2, Math.PI), matrix: matrix(0.05, L.kiosk.backTop + 0.075, 0.04, Math.PI / 2, 0, -0.35) },
      { geometry: new THREE.CylinderGeometry(0.012, 0.012, 0.20, 12), matrix: matrix(0.12, L.kiosk.backTop + 0.10, -0.03, Math.PI / 2, 0, -0.72) },
    ];
    const well = addMesh(
      station,
      'equip.iceWell.rimAndScoop',
      mergeGeometry(steelParts),
      materials.steel,
      true,
      true,
    );
    interactableObjects.iceWell = well;
    const interior = addMesh(
      station,
      'equip.iceWell.interior',
      new THREE.BoxGeometry(
        ICE_WELL_CUTOUT_WIDTH - wallThickness * 2,
        wallThickness,
        ICE_WELL_CUTOUT_DEPTH - wallThickness * 2,
      ),
      materials.darkSteel,
      false,
      true,
    );
    interior.position.y = floorY - wallThickness / 2;

    const iceGeometry = new THREE.IcosahedronGeometry(0.033, 0);
    const ice = new THREE.InstancedMesh(iceGeometry, materials.ice, 32);
    ice.name = 'equip.iceWell.ice';
    const dummy = new THREE.Object3D();
    const heapBaseY = L.kiosk.backTop - 0.12;
    const moundTopY = L.kiosk.backTop + 0.06;
    let heapTop = heapBaseY;
    for (let i = 0; i < 32; i += 1) {
      const layer = Math.floor(i / 8);
      const layerFraction = layer / 3;
      const x = i === 31 ? 0 : (rng() - 0.5) * 0.29 * (1 - layerFraction * 0.42);
      const z = i === 31 ? 0 : (rng() - 0.5) * 0.22 * (1 - layerFraction * 0.42);
      const centreBias = 1 - Math.min(1, Math.sqrt((x / 0.18) ** 2 + (z / 0.14) ** 2));
      const scale = 0.65 + rng() * 0.55;
      const halfHeight = 0.033 * scale * (0.75 + rng() * 0.4);
      const edgeDrop = layer === 3 ? (1 - centreBias) * 0.035 : 0;
      const y = heapBaseY + halfHeight
        + layerFraction * (moundTopY - heapBaseY - halfHeight * 2)
        - edgeDrop;
      dummy.position.set(x, y, z);
      dummy.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
      dummy.scale.set(scale, halfHeight / 0.033, scale);
      dummy.updateMatrix();
      ice.setMatrixAt(i, dummy.matrix);
      heapTop = Math.max(heapTop, y + halfHeight);
    }
    finishInstances(ice, false, false);
    station.add(ice);
    stationAnchors.iceWell = new THREE.Vector3(P.x, heapTop + 0.035, P.z);
  }

  // Steel sink with a true curved swan-neck tap.
  {
    const P = L.back.sink;
    const station = addStationGroup('sink', P.x, P.z);
    const spout = { x: 0, y: L.kiosk.backTop + 0.19, z: 0.07 };
    const floorY = L.kiosk.backTop - 0.20;
    const wallHeight = L.kiosk.backTop - floorY;
    const wallThickness = 0.018;
    const rimRadius = 0.012;
    const steelGeometry = mergeGeometry([
      { geometry: new THREE.CylinderGeometry(rimRadius, rimRadius, SINK_CUTOUT_WIDTH + 0.04, 12), matrix: matrix(0, L.kiosk.backTop + rimRadius, -(SINK_CUTOUT_DEPTH / 2 + 0.01), 0, 0, Math.PI / 2) },
      { geometry: new THREE.CylinderGeometry(rimRadius, rimRadius, SINK_CUTOUT_WIDTH + 0.04, 12), matrix: matrix(0, L.kiosk.backTop + rimRadius, SINK_CUTOUT_DEPTH / 2 + 0.01, 0, 0, Math.PI / 2) },
      { geometry: new THREE.CylinderGeometry(rimRadius, rimRadius, SINK_CUTOUT_DEPTH + 0.04, 12), matrix: matrix(-(SINK_CUTOUT_WIDTH / 2 + 0.01), L.kiosk.backTop + rimRadius, 0, Math.PI / 2) },
      { geometry: new THREE.CylinderGeometry(rimRadius, rimRadius, SINK_CUTOUT_DEPTH + 0.04, 12), matrix: matrix(SINK_CUTOUT_WIDTH / 2 + 0.01, L.kiosk.backTop + rimRadius, 0, Math.PI / 2) },
      { geometry: tube([[0, L.kiosk.backTop + 0.02, -0.12], [0, L.kiosk.backTop + 0.26, -0.12], [0, L.kiosk.backTop + 0.35, -0.03], [spout.x, L.kiosk.backTop + 0.30, spout.z], [spout.x, spout.y, spout.z]], 0.011, 24, 8), matrix: matrix() },
      { geometry: new THREE.BoxGeometry(0.012, 0.085, 0.025), matrix: matrix(0.055, L.kiosk.backTop + 0.12, -0.11, 0, 0, -0.45) },
      { geometry: new THREE.CylinderGeometry(0.034, 0.034, 0.006, 16), matrix: matrix(0, floorY + 0.003, 0, 0, 0, 0) },
    ]);
    const sink = addMesh(station, 'equip.sink.rimAndTap', steelGeometry, materials.steel, true, true);
    interactableObjects.sink = sink;
    const basin = addMesh(
      station,
      'equip.sink.basin',
      mergeGeometry([
        { geometry: new THREE.BoxGeometry(SINK_CUTOUT_WIDTH, wallHeight, wallThickness), matrix: matrix(0, floorY + wallHeight / 2, -(SINK_CUTOUT_DEPTH / 2 - wallThickness / 2)) },
        { geometry: new THREE.BoxGeometry(SINK_CUTOUT_WIDTH, wallHeight, wallThickness), matrix: matrix(0, floorY + wallHeight / 2, SINK_CUTOUT_DEPTH / 2 - wallThickness / 2) },
        { geometry: new THREE.BoxGeometry(wallThickness, wallHeight, SINK_CUTOUT_DEPTH - wallThickness * 2), matrix: matrix(-(SINK_CUTOUT_WIDTH / 2 - wallThickness / 2), floorY + wallHeight / 2, 0) },
        { geometry: new THREE.BoxGeometry(wallThickness, wallHeight, SINK_CUTOUT_DEPTH - wallThickness * 2), matrix: matrix(SINK_CUTOUT_WIDTH / 2 - wallThickness / 2, floorY + wallHeight / 2, 0) },
        { geometry: new THREE.BoxGeometry(SINK_CUTOUT_WIDTH - wallThickness * 2, wallThickness, SINK_CUTOUT_DEPTH - wallThickness * 2), matrix: matrix(0, floorY - wallThickness / 2, 0) },
      ]),
      materials.darkSteel,
      false,
      true,
    );
    stationAnchors.sink = new THREE.Vector3(P.x + spout.x, spout.y - 0.035, P.z + spout.z);
  }

  // Inner-east cold brew tower; its centreline outlet uses the specified spoutY exactly.
  {
    const P = L.back.coldBrewTap;
    const towerX = L.kiosk.aisle.x1 - 0.10;
    const station = addStationGroup('coldBrewTap', towerX, P.z);
    const baseY = L.kiosk.counterTop;
    const towerGeometry = mergeGeometry([
      { geometry: new THREE.BoxGeometry(0.18, 0.36, 0.16), matrix: matrix(0, baseY + 0.18, 0) },
      { geometry: new THREE.CylinderGeometry(0.098, 0.098, 0.035, 16), matrix: matrix(0, baseY + 0.018, 0) },
    ]);
    const tower = addMesh(station, 'equip.coldBrewTap.tower', towerGeometry, materials.black, true, true);
    interactableObjects.coldBrewTap = tower;
    const outlet = { x: 0, y: P.spoutY, z: 0.20 };
    const chromeGeometry = mergeGeometry([
      { geometry: tube([[0, baseY + 0.29, 0.075], [0, baseY + 0.29, 0.15], [outlet.x, outlet.y + 0.045, outlet.z]], 0.009, 14, 6), matrix: matrix() },
      { geometry: new THREE.CylinderGeometry(0.012, 0.01, 0.045, 12), matrix: matrix(outlet.x, outlet.y + 0.0225, outlet.z) },
      { geometry: new THREE.CylinderGeometry(0.013, 0.013, 0.19, 12), matrix: matrix(0, baseY + 0.43, 0.02) },
      { geometry: new THREE.BoxGeometry(0.055, 0.035, 0.035), matrix: matrix(0, baseY + 0.53, 0.02) },
      { geometry: new THREE.BoxGeometry(0.19, 0.018, 0.18), matrix: matrix(0, baseY + 0.015, 0.22) },
    ]);
    addMesh(station, 'equip.coldBrewTap.spoutAndTray', chromeGeometry, materials.chrome, true, true);
    stationAnchors.coldBrewTap = new THREE.Vector3(towerX + outlet.x, P.spoutY, P.z + outlet.z);
    ledPositions.amber.push([towerX + 0.052, baseY + 0.25, P.z + 0.084]);
  }

  // Barista-facing POS and customer-facing card reader.
  {
    const P = L.front.till;
    const station = addStationGroup('till', P.x, P.z);
    const baseY = L.kiosk.counterTop;
    const tilt = 20 * Math.PI / 180;
    const tillGeometry = mergeGeometry([
      { geometry: new THREE.BoxGeometry(0.28, 0.035, 0.20), matrix: matrix(0, baseY + 0.018, 0) },
      { geometry: new THREE.BoxGeometry(0.045, 0.18, 0.045), matrix: matrix(0, baseY + 0.11, -0.025, -0.16) },
      { geometry: new THREE.BoxGeometry(0.28, 0.21, 0.04), matrix: matrix(0, baseY + 0.245, -0.055, -tilt) },
      { geometry: new THREE.BoxGeometry(0.13, 0.026, 0.10), matrix: matrix(0.22, baseY + 0.013, 0.02) },
      { geometry: new THREE.BoxGeometry(0.025, 0.105, 0.025), matrix: matrix(0.22, baseY + 0.075, 0.02, 0.16) },
      { geometry: new THREE.BoxGeometry(0.12, 0.15, 0.035), matrix: matrix(0.22, baseY + 0.155, 0.04, tilt) },
    ]);
    const till = addMesh(station, 'equip.till.body', tillGeometry, materials.black, true, true);
    interactableObjects.till = till;

    const posMap = texClone('posScreen');
    const posMaterial = matWith('screen', {
      map: posMap,
      emissiveMap: posMap,
      emissive: 0xffffff,
      emissiveIntensity: 0.75,
      toneMapped: false,
    });
    const posScreen = addMesh(
      station,
      'equip.till.posScreen',
      new THREE.PlaneGeometry(0.245, 0.175),
      posMaterial,
      false,
      false,
    );
    posScreen.position.set(0, baseY + 0.245, -0.078);
    posScreen.rotation.set(-tilt, Math.PI, 0);

    const readerMaterial = matWith('screenDim', {
      color: 0x27333c,
      emissive: 0x173b55,
      emissiveIntensity: 0.65,
      toneMapped: false,
    });
    const readerGeometry = mergeGeometry([
      { geometry: new THREE.PlaneGeometry(0.09, 0.055), matrix: matrix(0.22, baseY + 0.18, 0.061, tilt) },
      { geometry: new THREE.BoxGeometry(0.022, 0.012, 0.008), matrix: matrix(0.19, baseY + 0.127, 0.072, tilt) },
      { geometry: new THREE.BoxGeometry(0.022, 0.012, 0.008), matrix: matrix(0.22, baseY + 0.127, 0.072, tilt) },
      { geometry: new THREE.BoxGeometry(0.022, 0.012, 0.008), matrix: matrix(0.25, baseY + 0.127, 0.072, tilt) },
    ]);
    addMesh(station, 'equip.till.readerFace', readerGeometry, readerMaterial, false, false);
    stationAnchors.till = new THREE.Vector3(P.x + 0.22, baseY + 0.14, P.z + 0.12);
  }

  // Oak handoff tray filling the authoritative counter footprint.
  {
    const P = L.front.handoff;
    const x = (P.x0 + P.x1) * 0.5;
    const z = (P.z0 + P.z1) * 0.5;
    const width = P.x1 - P.x0;
    const depth = P.z1 - P.z0;
    const station = addStationGroup('handoff', x, z);
    const floorY = L.kiosk.counterTop + 0.025;
    const trayGeometry = mergeGeometry([
      { geometry: new THREE.BoxGeometry(width, 0.025, depth), matrix: matrix(0, floorY - 0.0125, 0) },
      { geometry: new THREE.BoxGeometry(width, 0.04, 0.015), matrix: matrix(0, floorY + 0.012, -depth / 2 + 0.0075) },
      { geometry: new THREE.BoxGeometry(width, 0.04, 0.015), matrix: matrix(0, floorY + 0.012, depth / 2 - 0.0075) },
      { geometry: new THREE.BoxGeometry(0.015, 0.04, depth), matrix: matrix(-width / 2 + 0.0075, floorY + 0.012, 0) },
      { geometry: new THREE.BoxGeometry(0.015, 0.04, depth), matrix: matrix(width / 2 - 0.0075, floorY + 0.012, 0) },
    ]);
    const tray = addMesh(station, 'equip.handoff.tray', trayGeometry, materials.oak, true, true);
    interactableObjects.handoff = tray;
    const plaque = addMesh(
      station,
      'equip.handoff.collectPlaque',
      new THREE.BoxGeometry(0.18, 0.065, 0.018),
      materials.black,
      true,
      false,
    );
    plaque.position.set(0, floorY + 0.065, -depth / 2 + 0.03);
    const plaqueMaterial = matWith('blackMatte', {
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 0.8,
      toneMapped: false,
    });
    const brightBar = addMesh(
      station,
      'equip.handoff.collectBrightBar',
      new THREE.BoxGeometry(0.13, 0.018, 0.006),
      plaqueMaterial,
      false,
      false,
    );
    brightBar.position.set(0, floorY + 0.065, -depth / 2 + 0.041);
    stationAnchors.handoff = new THREE.Vector3(x, floorY, z);
  }

  // Under-counter dressing, tucked into the rear open bay and clear of the aisle.
  {
    const dressing = new THREE.Group();
    dressing.name = 'equip.underCounter';
    group.add(dressing);
    const z = (UNDER_COUNTER_BAY_Z0 + UNDER_COUNTER_BAY_Z1) * 0.5;
    const floorY = UNDER_COUNTER_BAY_FLOOR_Y;
    const bayHeight = UNDER_COUNTER_BAY_OPENING_TOP_Y - floorY;

    const bottleProfile = [
      new THREE.Vector2(0.10, 0),
      new THREE.Vector2(0.14, 0.045),
      new THREE.Vector2(0.145, 0.37),
      new THREE.Vector2(0.12, 0.48),
      new THREE.Vector2(0.055, 0.54),
      new THREE.Vector2(0.045, 0.61),
    ];
    const waterMaterial = matWith('glass', {
      color: 0x3176b5,
      transparent: true,
      opacity: 0.5,
      roughness: 0.18,
    });
    const waterBottles = new THREE.InstancedMesh(new THREE.LatheGeometry(bottleProfile, 12), waterMaterial, 2);
    waterBottles.name = 'equip.underCounter.waterBottles';
    const capGeometry = new THREE.CylinderGeometry(0.047, 0.047, 0.035, 12);
    const caps = new THREE.InstancedMesh(capGeometry, materials.white, 2);
    caps.name = 'equip.underCounter.waterCaps';
    const dummy = new THREE.Object3D();
    const waterXs = [UNDER_COUNTER_BAY_X0 + 0.25, UNDER_COUNTER_BAY_X0 + 0.65];
    for (let i = 0; i < waterXs.length; i += 1) {
      dummy.position.set(waterXs[i], floorY, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      waterBottles.setMatrixAt(i, dummy.matrix);
      dummy.position.y = floorY + 0.627;
      dummy.updateMatrix();
      caps.setMatrixAt(i, dummy.matrix);
    }
    finishInstances(waterBottles, true, true);
    finishInstances(caps, true, false);
    dressing.add(waterBottles, caps);

    const shelfX = UNDER_COUNTER_BAY_X0 + 1.65;
    const shelfParts = [
      { geometry: new THREE.BoxGeometry(0.78, 0.035, 0.30), matrix: matrix(shelfX, floorY + 0.14, z) },
      { geometry: new THREE.BoxGeometry(0.025, 0.30, 0.025), matrix: matrix(shelfX - 0.35, floorY + 0.15, z - 0.12) },
      { geometry: new THREE.BoxGeometry(0.025, 0.30, 0.025), matrix: matrix(shelfX + 0.35, floorY + 0.15, z - 0.12) },
      { geometry: new THREE.BoxGeometry(0.025, 0.30, 0.025), matrix: matrix(shelfX - 0.35, floorY + 0.15, z + 0.12) },
      { geometry: new THREE.BoxGeometry(0.025, 0.30, 0.025), matrix: matrix(shelfX + 0.35, floorY + 0.15, z + 0.12) },
    ];
    const pitcherProfile = [
      new THREE.Vector2(0.045, 0),
      new THREE.Vector2(0.055, 0.018),
      new THREE.Vector2(0.058, 0.12),
      new THREE.Vector2(0.066, 0.15),
    ];
    for (let i = 0; i < 5; i += 1) {
      shelfParts.push({
        geometry: new THREE.LatheGeometry(pitcherProfile, 12),
        matrix: matrix(shelfX - 0.25 + i * 0.125, floorY + 0.158, z),
      });
    }
    addMesh(
      dressing,
      'equip.underCounter.pitcherShelfAndPitchers',
      mergeGeometry(shelfParts),
      materials.steel,
      true,
      true,
    );

    const boxesX = UNDER_COUNTER_BAY_X1 - 2.55;
    const boxesGeometry = mergeGeometry([
      { geometry: new THREE.BoxGeometry(0.48, 0.24, 0.30), matrix: matrix(boxesX, floorY + 0.12, z) },
      { geometry: new THREE.BoxGeometry(0.44, 0.22, 0.28), matrix: matrix(boxesX + 0.025, floorY + 0.35, z) },
    ]);
    addMesh(dressing, 'equip.underCounter.cupBoxes', boxesGeometry, materials.cardboard, true, true);

    const binX = UNDER_COUNTER_BAY_X1 - 0.25;
    const binBodyHeight = Math.min(0.56, bayHeight - 0.19);
    const binGeometry = mergeGeometry([
      { geometry: new THREE.BoxGeometry(0.40, binBodyHeight, 0.30), matrix: matrix(binX, floorY + binBodyHeight * 0.5, z) },
      { geometry: new THREE.CylinderGeometry(0.15, 0.15, 0.37, 12, 1, false, 0, Math.PI), matrix: matrix(binX, floorY + 0.56, z, 0, 0, Math.PI / 2, 1, 1, 1.18) },
    ]);
    addMesh(dressing, 'equip.underCounter.swingBin', binGeometry, materials.black, true, true);
  }

  // One instance-colored standby LED batch for all stations.
  const ledColors = { green: 0x49d98a, amber: 0xffb13b, red: 0xff5a4f };
  const ledEntries = Object.entries(ledPositions)
    .flatMap(([colorName, positions]) => positions.map((position) => ({ colorName, position })));
  ledMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  ownedMaterials.add(ledMaterial);
  const leds = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.011, 10, 6),
    ledMaterial,
    ledEntries.length,
  );
  leds.name = 'equip.led.standby';
  const ledDummy = new THREE.Object3D();
  for (let i = 0; i < ledEntries.length; i += 1) {
    const { colorName, position } = ledEntries[i];
    ledDummy.position.set(...position);
    ledDummy.updateMatrix();
    leds.setMatrixAt(i, ledDummy.matrix);
    leds.setColorAt(i, new THREE.Color(ledColors[colorName]));
  }
  finishInstances(leds, false, false);
  group.add(leds);

  const interactables = [
    { id: 'cupStack', kind: 'station', label: 'Cup Stack', object: interactableObjects.cupStack, hint: 'E to take a cup', hold: false },
    { id: 'grinder', kind: 'station', label: 'Grinder', object: interactableObjects.grinder, hint: 'Hold E to dose the portafilter', hold: true },
    { id: 'espresso', kind: 'station', label: 'Espresso Machine', object: interactableObjects.espresso, hint: 'Hold E to pull a shot', hold: true },
    { id: 'steamWand', kind: 'station', label: 'Steam Wand', object: interactableObjects.steamWand, hint: 'Hold E to steam the milk', hold: true },
    { id: 'superauto', kind: 'station', label: 'Superauto', object: interactableObjects.superauto, hint: 'E to dispense espresso', hold: false },
    { id: 'syrupRack', kind: 'station', label: 'Syrup Rack', object: interactableObjects.syrupRack, hint: 'E to pump syrup', hold: false },
    { id: 'blender', kind: 'station', label: 'Blender', object: interactableObjects.blender, hint: 'Hold E to blend', hold: true },
    { id: 'iceWell', kind: 'station', label: 'Ice Well', object: interactableObjects.iceWell, hint: 'E to scoop ice', hold: false },
    { id: 'sink', kind: 'station', label: 'Sink', object: interactableObjects.sink, hint: 'Hold E to rinse the pitcher', hold: true },
    { id: 'coldBrewTap', kind: 'station', label: 'Cold Brew Tap', object: interactableObjects.coldBrewTap, hint: 'Hold E to pour cold brew', hold: true },
    { id: 'till', kind: 'till', label: 'Till', object: interactableObjects.till, hint: 'E to take the order', hold: false },
    { id: 'handoff', kind: 'pickup', label: 'Handoff', object: interactableObjects.handoff, hint: 'E to serve', hold: false },
  ];

  let disposed = false;
  function update(_dt, t) {
    ledMaterial.color.setScalar(0.82 + 0.18 * (0.5 + 0.5 * Math.sin(t * 2.2)));
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    group.traverse((object) => object.geometry?.dispose?.());
    for (const material of ownedMaterials) material.dispose();
    for (const texture of ownedTextures) texture.dispose();
  }

  return { group, colliders: [], interactables, update, dispose };
}
