// Terminal shell and concessions: 33 draw calls / 19.1k triangles.
import * as THREE from 'three';

const FALLBACK_COLOURS = {
  oak: 0xC8A57B,
  wallWhite: 0xEFEDE8,
  blackMatte: 0x14161A,
  blackGloss: 0x1B1E24,
  chrome: 0xD8DCE0,
  steel: 0xA9AFB6,
  glass: 0xBFD8DD,
  floor: 0xD8CFC0,
  ceiling: 0xF3F1EC,
  greenSign: 0x1E7A46,
  redSign: 0xE4002B,
};

export function buildTerminal(ctx) {
  const L = ctx.layout;
  const T = L.terminal;
  const P = L.palette;
  const group = new THREE.Group();
  group.name = 'terminal';

  const localMaterials = [];
  const localTextures = [];
  const customMaterials = new Map();
  const rng = typeof ctx.rng === 'function' ? ctx.rng : () => 0.5;
  const floorY = 0;

  function applyMaterialOverrides(material, overrides) {
    for (const [property, value] of Object.entries(overrides ?? {})) {
      if (property === 'color' && material.color?.set) material.color.set(value);
      else material[property] = value;
    }
  }

  // Shared materials are returned untouched. Overrides always go onto a clone.
  function m(name, over) {
    const shared = ctx.mat?.get?.(name);
    if (shared && !over) return shared;
    if (shared) {
      const clone = shared.clone();
      applyMaterialOverrides(clone, over);
      clone.needsUpdate = true;
      localMaterials.push(clone);
      return clone;
    }

    const clone = new THREE.MeshStandardMaterial({
      color: FALLBACK_COLOURS[name] ?? 0xCCCCCC,
      roughness: name === 'blackGloss' ? 0.24 : 0.72,
      metalness: name === 'chrome' || name === 'steel' ? 0.82 : 0.02,
    });
    if (name === 'glass') {
      clone.transparent = true;
      clone.opacity = 0.24;
      clone.roughness = 0.08;
    }
    applyMaterialOverrides(clone, over);
    clone.needsUpdate = true;
    localMaterials.push(clone);
    return clone;
  }

  function ownMaterial(key, material) {
    localMaterials.push(material);
    customMaterials.set(key, material);
    return material;
  }

  function materialFor(key) {
    return customMaterials.get(key) ?? m(key);
  }

  class BoxBatch {
    constructor(parent) {
      this.parent = parent;
      this.items = new Map();
      this.geometry = new THREE.BoxGeometry(1, 1, 1);
    }

    add(key, cx, cy, cz, sx, sy, sz, rotY = 0, rotX = 0, colour = null) {
      if (!this.items.has(key)) this.items.set(key, []);
      this.items.get(key).push({ cx, cy, cz, sx, sy, sz, rotY, rotX, colour });
    }

    flush() {
      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      const matrix = new THREE.Matrix4();
      const euler = new THREE.Euler(0, 0, 0, 'YXZ');
      const colour = new THREE.Color();

      for (const [key, items] of this.items) {
        const mesh = new THREE.InstancedMesh(this.geometry, materialFor(key), items.length);
        mesh.name = `boxBatch:${key}`;
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        const hasColour = items.some((item) => item.colour !== null);
        items.forEach((item, index) => {
          position.set(item.cx, item.cy, item.cz);
          euler.set(item.rotX, item.rotY, 0);
          quaternion.setFromEuler(euler);
          scale.set(item.sx, item.sy, item.sz);
          matrix.compose(position, quaternion, scale);
          mesh.setMatrixAt(index, matrix);
          if (hasColour) mesh.setColorAt(index, colour.set(item.colour ?? 0xFFFFFF));
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        this.parent.add(mesh);
      }
    }
  }

  class CylBatch {
    constructor(parent) {
      this.parent = parent;
      this.items = new Map();
      this.geometries = new Map();
    }

    add(key, cx, cy, cz, radius, height, radialSegments = 12, rotX = 0, rotZ = 0,
      colour = null) {
      const segments = Math.min(12, Math.max(3, radialSegments));
      const bucket = `${key}:${segments}`;
      if (!this.items.has(bucket)) this.items.set(bucket, { key, segments, transforms: [] });
      this.items.get(bucket).transforms.push({
        cx, cy, cz, radius, height, rotX, rotZ, colour,
      });
    }

    flush() {
      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      const matrix = new THREE.Matrix4();
      const euler = new THREE.Euler();
      const colour = new THREE.Color();

      for (const { key, segments, transforms } of this.items.values()) {
        let geometry = this.geometries.get(segments);
        if (!geometry) {
          geometry = new THREE.CylinderGeometry(1, 1, 1, segments, 1, false);
          this.geometries.set(segments, geometry);
        }
        const mesh = new THREE.InstancedMesh(geometry, materialFor(key), transforms.length);
        mesh.name = `cylBatch:${key}:${segments}`;
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        const hasColour = transforms.some((item) => item.colour !== null);
        transforms.forEach((item, index) => {
          position.set(item.cx, item.cy, item.cz);
          euler.set(item.rotX, 0, item.rotZ);
          quaternion.setFromEuler(euler);
          scale.set(item.radius, item.height, item.radius);
          matrix.compose(position, quaternion, scale);
          mesh.setMatrixAt(index, matrix);
          if (hasColour) mesh.setColorAt(index, colour.set(item.colour ?? 0xFFFFFF));
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        this.parent.add(mesh);
      }
    }
  }

  const boxes = new BoxBatch(group);
  const cylinders = new CylBatch(group);
  const colliders = [];

  function addCollider(cx, cy, cz, sx, sy, sz, pad = 0.2) {
    colliders.push(new THREE.Box3(
      new THREE.Vector3(cx - sx / 2 - pad, cy - sy / 2 - pad, cz - sz / 2 - pad),
      new THREE.Vector3(cx + sx / 2 + pad, cy + sy / 2 + pad, cz + sz / 2 + pad),
    ));
  }

  function addQuad(name, width, height, material, x, y, z, rotY = 0) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    group.add(mesh);
    return mesh;
  }

  function texture(name) {
    return ctx.tex?.[name]?.();
  }

  // Floor and ceiling.
  const floorWidth = T.floor.x1 - T.floor.x0;
  const floorDepth = T.floor.z1 - T.floor.z0;
  const floorMat = m('floor', { roughness: 0.42 });
  if (floorMat.map) {
    const floorMap = floorMat.map.clone();
    localTextures.push(floorMap);
    floorMap.wrapS = THREE.RepeatWrapping;
    floorMap.wrapT = THREE.RepeatWrapping;
    floorMap.repeat.set(floorWidth / 1.2, floorDepth / 1.2);
    floorMap.needsUpdate = true;
    floorMat.map = floorMap;
    floorMat.needsUpdate = true;
  }
  const floor = addQuad(
    'floor', floorWidth, floorDepth, floorMat,
    (T.floor.x0 + T.floor.x1) / 2, floorY, (T.floor.z0 + T.floor.z1) / 2,
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.userData.isFloor = true;

  const floorInlayMaterial = m('floor', { color: 0xFFFFFF });
  customMaterials.set('floorInlay', floorInlayMaterial);
  const inlayY = 0.008;
  const inlayHeight = inlayY * 2;
  const mainRunnerZ = L.queue.enter.z + 1.6;
  const mainRunnerWidth = 3.4;
  const crossRunnerX = -12;
  const crossRunnerWidth = 2.6;
  const inlayBorderWidth = 0.14;
  boxes.add('floorInlay', (T.floor.x0 + T.floor.x1) / 2, inlayY, mainRunnerZ,
    floorWidth, inlayHeight, mainRunnerWidth, 0, 0, 0xC3B9A6);
  for (const side of [-1, 1]) {
    boxes.add('floorInlay', (T.floor.x0 + T.floor.x1) / 2, inlayY,
      mainRunnerZ + side * (mainRunnerWidth + inlayBorderWidth) / 2,
      floorWidth, inlayHeight, inlayBorderWidth, 0, 0, 0xA79C88);
  }
  boxes.add('floorInlay', crossRunnerX, inlayY, (T.rearWall + T.farWall) / 2,
    crossRunnerWidth, inlayHeight, T.farWall - T.rearWall, 0, 0, 0xC3B9A6);
  for (const side of [-1, 1]) {
    boxes.add('floorInlay', crossRunnerX + side * (crossRunnerWidth + inlayBorderWidth) / 2,
      inlayY, (T.rearWall + T.farWall) / 2,
      inlayBorderWidth, inlayHeight, T.farWall - T.rearWall, 0, 0, 0xA79C88);
  }

  const walledDepth = T.farWall - T.rearWall;
  const ceiling = addQuad(
    'ceiling', floorWidth, walledDepth, m('ceiling', {}),
    (T.floor.x0 + T.floor.x1) / 2, T.ceiling, (T.rearWall + T.farWall) / 2,
  );
  ceiling.rotation.x = Math.PI / 2;

  // Slot lights and their cheap warm halos.
  const emissiveMaterial = ownMaterial('emissive', new THREE.MeshBasicMaterial({
    color: 0xFFFFFF,
    toneMapped: false,
  }));
  customMaterials.set('emissiveCyl', emissiveMaterial);
  ownMaterial('slotHalo', new THREE.MeshBasicMaterial({
    color: 0xFFF0D2,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    toneMapped: false,
  }));
  ownMaterial('slotHaloWide', new THREE.MeshBasicMaterial({
    color: 0xFFF0D2,
    transparent: true,
    opacity: 0.07,
    depthWrite: false,
    toneMapped: false,
  }));
  const slotPositions = [];
  const slotInset = 2;
  const slotStep = 4;
  for (let x = T.floor.x0 + slotInset; x <= T.floor.x1 - slotInset + 0.001; x += slotStep) {
    for (let z = T.rearWall + slotInset; z <= T.farWall - slotInset + 0.001; z += slotStep) {
      slotPositions.push({ x, z });
      boxes.add('emissive', x, T.ceiling - 0.04, z, 2.4, 0.06, 0.12,
        0, 0, 0xFFFBF0);
      boxes.add('slotHalo', x, T.ceiling - 0.09, z, 3.2, 0.02, 0.46);
      boxes.add('slotHaloWide', x, T.ceiling - 0.115, z, 4.0, 0.02, 0.90);
    }
  }

  // Ceiling speakers and smoke heads, kept clear of the slots.
  function outsideSlot(x, z) {
    return !slotPositions.some((slot) => Math.abs(slot.x - x) < 1.35 && Math.abs(slot.z - z) < 0.24);
  }

  function fittingGrid(count, columns, key, radius, height) {
    const rows = Math.ceil(count / columns);
    const x0 = Math.max(T.floor.x0, -24);
    const x1 = Math.min(T.floor.x1, 24);
    const z0 = T.rearWall;
    const z1 = T.farWall;
    for (let i = 0; i < count; i += 1) {
      const column = i % columns;
      const row = Math.floor(i / columns);
      let x = THREE.MathUtils.lerp(x0, x1, (column + 0.5) / columns) + (rng() - 0.5) * 0.8;
      let z = THREE.MathUtils.lerp(z0, z1, (row + 0.5) / rows) + (rng() - 0.5) * 0.8;
      if (!outsideSlot(x, z)) z += z + 0.5 < z1 ? 0.5 : -0.5;
      if (!outsideSlot(x, z)) x += x + 0.5 < x1 ? 0.5 : -0.5;
      cylinders.add(key, x, T.ceiling - 0.02, z, radius, height, 12);
    }
  }
  fittingGrid(54, 9, 'blackMatte', 0.11, 0.03);
  fittingGrid(40, 8, 'chrome', 0.055, 0.05);

  // Perimeter wall slabs and collision shell.
  const wallThickness = 0.30;
  const wallHeight = T.ceiling - floorY;
  const wallY = floorY + wallHeight / 2;
  const discoverHeight = 3.40;
  const inMotionHeight = 4.40;
  const farWallCentreZ = T.farWall + wallThickness / 2;
  const rearWallCentreZ = T.rearWall - wallThickness / 2;

  function wallRun(x0, x1, y, height, z) {
    const width = x1 - x0;
    boxes.add('wallWhite', (x0 + x1) / 2, y, z, width, height, wallThickness);
    addCollider((x0 + x1) / 2, y, z, width, height, wallThickness);
  }

  wallRun(T.floor.x0, T.discoverLondon.x0, wallY, wallHeight, farWallCentreZ);
  wallRun(T.discoverLondon.x1, T.floor.x1, wallY, wallHeight, farWallCentreZ);
  wallRun(
    T.discoverLondon.x0, T.discoverLondon.x1,
    discoverHeight + (T.ceiling - discoverHeight) / 2,
    T.ceiling - discoverHeight, farWallCentreZ,
  );
  wallRun(T.floor.x0, T.inMotion.x0, wallY, wallHeight, rearWallCentreZ);
  wallRun(T.inMotion.x1, T.floor.x1, wallY, wallHeight, rearWallCentreZ);
  wallRun(
    T.inMotion.x0, T.inMotion.x1,
    inMotionHeight + (T.ceiling - inMotionHeight) / 2,
    T.ceiling - inMotionHeight, rearWallCentreZ,
  );

  const sideWallX0 = T.floor.x0 + wallThickness / 2;
  const sideWallX1 = T.floor.x1 - wallThickness / 2;
  const wallZ = (T.rearWall + T.farWall) / 2;
  boxes.add('wallWhite', sideWallX0, wallY, wallZ, wallThickness, wallHeight, walledDepth);
  boxes.add('wallWhite', sideWallX1, wallY, wallZ, wallThickness, wallHeight, walledDepth);
  addCollider(sideWallX0, wallY, wallZ, wallThickness, wallHeight, walledDepth);
  addCollider(sideWallX1, wallY, wallZ, wallThickness, wallHeight, walledDepth);

  const pilasterSize = 0.50;
  const discoverPilasterZ = T.farWall + pilasterSize / 2;
  const inMotionPilasterZ = T.rearWall - pilasterSize / 2;
  for (const x of [T.discoverLondon.x0, T.discoverLondon.x1]) {
    boxes.add('wallWhite', x, wallY, discoverPilasterZ, pilasterSize, wallHeight, pilasterSize);
    addCollider(x, wallY, discoverPilasterZ, pilasterSize, wallHeight, pilasterSize);
  }
  for (const x of [T.inMotion.x0, T.inMotion.x1]) {
    boxes.add('wallWhite', x, wallY, inMotionPilasterZ, pilasterSize, wallHeight, pilasterSize);
    addCollider(x, wallY, inMotionPilasterZ, pilasterSize, wallHeight, pilasterSize);
  }

  // The concession mouths remain visual openings but are closed to the player.
  addCollider(
    (T.discoverLondon.x0 + T.discoverLondon.x1) / 2,
    floorY + discoverHeight / 2,
    farWallCentreZ, T.discoverLondon.x1 - T.discoverLondon.x0, discoverHeight, wallThickness,
  );
  addCollider(
    (T.inMotion.x0 + T.inMotion.x1) / 2,
    floorY + inMotionHeight / 2,
    rearWallCentreZ, T.inMotion.x1 - T.inMotion.x0, inMotionHeight, wallThickness,
  );

  // Low-cost terminal wall rhythm: trim, structural bays, clerestory and dummy retail depth.
  const trimGrey = m('wallWhite', {});
  trimGrey.color.lerp(new THREE.Color(0x9A9A96), 0.82);
  customMaterials.set('trimGrey', trimGrey);

  const dummyWidth = 4.2;
  const farDummyStart = T.floor.x0 + 0.8;
  const farDummyEnd = T.discoverLondon.x0 - 0.8;
  const farDummyGap = (farDummyEnd - farDummyStart - dummyWidth * 3) / 4;
  const farDummyCentres = Array.from({ length: 3 }, (_, index) => (
    farDummyStart + farDummyGap + dummyWidth / 2 + index * (dummyWidth + farDummyGap)
  ));

  function subtractInterval(intervals, cutX0, cutX1) {
    const result = [];
    for (const [x0, x1] of intervals) {
      if (cutX1 <= x0 || cutX0 >= x1) {
        result.push([x0, x1]);
      } else {
        if (cutX0 > x0) result.push([x0, cutX0]);
        if (cutX1 < x1) result.push([cutX1, x1]);
      }
    }
    return result;
  }

  let rearDummyRuns = [[T.inMotion.x1 + 0.8, T.floor.x1 - 0.8]];
  rearDummyRuns = subtractInterval(rearDummyRuns, T.aelia.x0 - 0.8, T.aelia.x1 + 0.8);
  rearDummyRuns.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]));
  const rearDummyRun = rearDummyRuns.find(([x0, x1]) => x1 - x0 >= dummyWidth)
    ?? [T.inMotion.x1 + 0.8, T.floor.x1 - 0.8];
  const rearDummyCentre = (rearDummyRun[0] + rearDummyRun[1]) / 2;

  function wallBand(key, x0, x1, y, height, planeZ, proudDepth, inwardSign, colour = null) {
    boxes.add(key, (x0 + x1) / 2, y, planeZ + inwardSign * proudDepth / 2,
      x1 - x0, height, proudDepth, 0, 0, colour);
  }

  for (const [x0, x1] of [
    [T.floor.x0, T.discoverLondon.x0],
    [T.discoverLondon.x1, T.floor.x1],
  ]) {
    wallBand('trimGrey', x0, x1, 0.07, 0.14, T.farWall, 0.04, -1);
    wallBand('trimGrey', x0, x1, 2.55, 0.10, T.farWall, 0.03, -1);
  }
  for (const [x0, x1] of [
    [T.floor.x0, T.inMotion.x0],
    [T.inMotion.x1, T.floor.x1],
  ]) {
    wallBand('trimGrey', x0, x1, 0.07, 0.14, T.rearWall, 0.04, 1);
    wallBand('trimGrey', x0, x1, 2.55, 0.10, T.rearWall, 0.03, 1);
  }
  boxes.add('trimGrey', T.floor.x0 + 0.02, 0.07, wallZ, 0.04, 0.14, walledDepth);
  boxes.add('trimGrey', T.floor.x1 - 0.02, 0.07, wallZ, 0.04, 0.14, walledDepth);
  boxes.add('trimGrey', T.floor.x0 + 0.015, 2.55, wallZ, 0.03, 0.10, walledDepth);
  boxes.add('trimGrey', T.floor.x1 - 0.015, 2.55, wallZ, 0.03, 0.10, walledDepth);

  const farOpenings = [
    [T.discoverLondon.x0, T.discoverLondon.x1],
    ...farDummyCentres.map((x) => [x - dummyWidth / 2, x + dummyWidth / 2]),
  ];
  const rearOpenings = [
    [T.inMotion.x0, T.inMotion.x1],
    [T.aelia.x0, T.aelia.x1],
    [rearDummyCentre - dummyWidth / 2, rearDummyCentre + dummyWidth / 2],
  ];
  const landsInOpening = (x, openings) => openings.some(([x0, x1]) => (
    x + 0.45 / 2 > x0 && x - 0.45 / 2 < x1
  ));
  for (let x = Math.ceil(T.floor.x0 / 6) * 6; x <= T.floor.x1 + 0.001; x += 6) {
    if (!landsInOpening(x, farOpenings)) {
      boxes.add('wallWhite', x, wallY, T.farWall - 0.06, 0.45, wallHeight, 0.12);
    }
    if (!landsInOpening(x, rearOpenings)) {
      boxes.add('wallWhite', x, wallY, T.rearWall + 0.06, 0.45, wallHeight, 0.12);
    }
  }

  function clerestory(planeZ, inwardSign) {
    let x = T.floor.x0;
    while (x < T.floor.x1 - 0.001) {
      const paneWidth = Math.min(2.4, T.floor.x1 - x);
      wallBand('slotLight', x, x + paneWidth, 5.0, 0.60,
        planeZ, 0.05, inwardSign, 0xD7E4EE);
      x += paneWidth;
      if (x < T.floor.x1 - 0.001) {
        const mullionWidth = Math.min(0.16, T.floor.x1 - x);
        wallBand('wallWhite', x, x + mullionWidth, 5.0, 0.60,
          planeZ, 0.05, inwardSign);
        x += mullionWidth;
      }
    }
  }
  clerestory(T.farWall, -1);
  clerestory(T.rearWall, 1);

  function dummyShopfront(x, planeZ, inwardSign) {
    const revealDepth = 0.35;
    const revealZ = planeZ + inwardSign * revealDepth / 2;
    const faceZ = planeZ + inwardSign * (revealDepth + 0.02);
    boxes.add('blackGloss', x, 1.80, revealZ, dummyWidth, 3.60, revealDepth);
    boxes.add('slotLight', x, 3.30, faceZ, dummyWidth - 0.16, 0.60, 0.04,
      0, 0, 0xF0DCB4);
    boxes.add('blackGloss', x, 1.48, faceZ, dummyWidth - 0.20, 2.76, 0.04);
  }
  farDummyCentres.forEach((x) => dummyShopfront(x, T.farWall, -1));
  dummyShopfront(rearDummyCentre, T.rearWall, 1);

  // Bright, tilted cove band around the inside perimeter.
  const coveMat = m('wallWhite', {});
  coveMat.color.lerp(new THREE.Color(0xFFFFFF), 0.28);
  customMaterials.set('coveWhite', coveMat);
  const coveBand = 0.45;
  const coveDepth = 0.08;
  const coveY = T.ceiling - coveBand / 2;
  boxes.add('coveWhite', (T.floor.x0 + T.floor.x1) / 2, coveY, T.farWall - 0.18,
    floorWidth - wallThickness * 2, coveBand, coveDepth, 0, Math.PI / 4);
  boxes.add('coveWhite', (T.floor.x0 + T.floor.x1) / 2, coveY, T.rearWall + 0.18,
    floorWidth - wallThickness * 2, coveBand, coveDepth, 0, -Math.PI / 4);
  boxes.add('coveWhite', T.floor.x0 + 0.18, coveY, wallZ,
    walledDepth, coveBand, coveDepth, Math.PI / 2, Math.PI / 4);
  boxes.add('coveWhite', T.floor.x1 - 0.18, coveY, wallZ,
    walledDepth, coveBand, coveDepth, Math.PI / 2, -Math.PI / 4);

  // Jet2 billboard and its pair of downlights.
  const jet = T.jet2;
  const jetWidth = jet.x1 - jet.x0;
  const jetHeight = jet.y1 - jet.y0;
  const jetTexture = texture('jet2');
  const jetMaterial = new THREE.MeshStandardMaterial({
    ...(jetTexture ? { map: jetTexture, emissiveMap: jetTexture } : {}),
    color: jetTexture ? 0xFFFFFF : P.jet2Red,
    emissive: 0xFFFFFF,
    emissiveIntensity: 0.55,
    roughness: 0.9,
    metalness: 0,
  });
  localMaterials.push(jetMaterial);
  addQuad('jet2', jetWidth, jetHeight, jetMaterial,
    (jet.x0 + jet.x1) / 2, (jet.y0 + jet.y1) / 2, jet.z, Math.PI);

  const jetFrameZ = jet.z - 0.09;
  const frameBar = 0.08;
  boxes.add('blackMatte', (jet.x0 + jet.x1) / 2, jet.y0 - frameBar / 2, jetFrameZ,
    jetWidth + frameBar * 2, frameBar, 0.06);
  boxes.add('blackMatte', (jet.x0 + jet.x1) / 2, jet.y1 + frameBar / 2, jetFrameZ,
    jetWidth + frameBar * 2, frameBar, 0.06);
  boxes.add('blackMatte', jet.x0 - frameBar / 2, (jet.y0 + jet.y1) / 2, jetFrameZ,
    frameBar, jetHeight, 0.06);
  boxes.add('blackMatte', jet.x1 + frameBar / 2, (jet.y0 + jet.y1) / 2, jetFrameZ,
    frameBar, jetHeight, 0.06);
  ownMaterial('downGlow', new THREE.MeshBasicMaterial({ color: 0xFFF3D7, toneMapped: false }));
  for (const f of [0.28, 0.72]) {
    const x = THREE.MathUtils.lerp(jet.x0, jet.x1, f);
    boxes.add('blackMatte', x, jet.y1 + 0.25, jet.z - 0.08, 0.06, 0.30, 0.06);
    cylinders.add('blackMatte', x, jet.y1 + 0.10, jet.z - 0.20, 0.09, 0.22, 12);
    cylinders.add('downGlow', x, jet.y1 - 0.015, jet.z - 0.20, 0.066, 0.012, 12);
  }

  // Discover London: warm recess, timber shelves, souvenirs and phone box.
  const discover = T.discoverLondon;
  const discoverWidth = discover.x1 - discover.x0;
  const discoverX = (discover.x0 + discover.x1) / 2;
  const discoverDepth = 3.2;
  const discoverMouthZ = T.farWall;
  const discoverBackZ = discoverMouthZ + discoverDepth;
  const warmWall = m('wallWhite', { color: new THREE.Color(0xF6E7CF) });
  customMaterials.set('wallWarm', warmWall);
  boxes.add('wallWarm', discoverX, discoverHeight / 2, discoverBackZ,
    discoverWidth, discoverHeight, wallThickness);
  boxes.add('wallWarm', discover.x0, discoverHeight / 2, discoverMouthZ + discoverDepth / 2,
    wallThickness, discoverHeight, discoverDepth);
  boxes.add('wallWarm', discover.x1, discoverHeight / 2, discoverMouthZ + discoverDepth / 2,
    wallThickness, discoverHeight, discoverDepth);
  boxes.add('wallWarm', discoverX, discoverHeight, discoverMouthZ + discoverDepth / 2,
    discoverWidth, wallThickness, discoverDepth);

  const discoverTexture = texture('discoverLondon');
  const discoverMat = new THREE.MeshBasicMaterial({
    ...(discoverTexture ? { map: discoverTexture } : {}),
    color: discoverTexture ? 0xFFFFFF : 0xB9884F,
    toneMapped: false,
  });
  localMaterials.push(discoverMat);
  const discoverSignWidth = discoverWidth - 0.50;
  const discoverSignHeight = 0.55;
  const discoverSignY = discoverHeight - 0.06 - discoverSignHeight / 2;
  const discoverSignZ = discoverMouthZ + 0.25;
  // The name is hung inside the opening so the jet2 billboard owns the wall above it.
  boxes.add('blackMatte', discoverX, discoverSignY, discoverSignZ + 0.04,
    discoverSignWidth + 0.10, discoverSignHeight + 0.08, 0.06);
  addQuad('discoverLondon', discoverSignWidth, discoverSignHeight, discoverMat,
    discoverX, discoverSignY, discoverSignZ, Math.PI);

  const discoverPilasterFrontZ = discoverPilasterZ - pilasterSize / 2;
  cylinders.add('wallWhite', discover.x0, 2.55, discoverPilasterFrontZ - 0.02,
    0.61, 0.025, 12, Math.PI / 2);
  cylinders.add('greenSign', discover.x0, 2.55, discoverPilasterFrontZ - 0.05,
    0.55, 0.03, 12, Math.PI / 2);

  ownMaterial('souvenirNavy', new THREE.MeshStandardMaterial({
    color: 0x1F3864,
    roughness: 0.68,
    metalness: 0.02,
  }));
  ownMaterial('souvenirIvory', new THREE.MeshStandardMaterial({
    color: 0xEDE7DA,
    roughness: 0.72,
    metalness: 0.01,
  }));
  function souvenirKey(index) {
    const pattern = index % 5;
    if (pattern === 1 || pattern === 4) return 'souvenirNavy';
    if (pattern === 2) return 'souvenirIvory';
    return 'redSign';
  }

  const shelfLevels = [0.60, 1.10, 1.60, 2.00];
  for (const y of shelfLevels) {
    boxes.add('oak', discoverX, y, discoverBackZ - 0.20, discoverWidth - 0.45, 0.06, 0.30);
    boxes.add('oak', discover.x0 + 0.18, y, T.farWall + discoverDepth / 2,
      0.30, 0.06, discoverDepth - 0.35);
    boxes.add('oak', discover.x1 - 0.18, y, T.farWall + discoverDepth / 2,
      0.30, 0.06, discoverDepth - 0.35);

    const backSouvenirs = Math.max(18, Math.floor(discoverWidth / 0.38));
    for (let i = 0; i < backSouvenirs; i += 1) {
      const x = THREE.MathUtils.lerp(discover.x0 + 0.35, discover.x1 - 0.35,
        (i + 0.5) / backSouvenirs) + (rng() - 0.5) * 0.09;
      const width = 0.10 + rng() * 0.08;
      const height = y === 2.00 ? 0.10 + rng() * 0.06 : 0.16 + rng() * 0.10;
      boxes.add(souvenirKey(i), x, y + 0.03 + height / 2, discoverBackZ - 0.38,
        width, height, 0.10);
    }
    const sideSouvenirs = 7;
    for (let i = 0; i < sideSouvenirs; i += 1) {
      const z = THREE.MathUtils.lerp(T.farWall + 0.45, discoverBackZ - 0.45,
        (i + 0.5) / sideSouvenirs) + (rng() - 0.5) * 0.08;
      const heightA = y === 2.00 ? 0.10 + rng() * 0.06 : 0.16 + rng() * 0.10;
      const heightB = y === 2.00 ? 0.10 + rng() * 0.06 : 0.16 + rng() * 0.10;
      boxes.add(souvenirKey(i + 1), discover.x0 + 0.36, y + 0.03 + heightA / 2, z,
        0.10, heightA, 0.10 + rng() * 0.08);
      boxes.add(souvenirKey(i + 3), discover.x1 - 0.36, y + 0.03 + heightB / 2, z,
        0.10, heightB, 0.10 + rng() * 0.08);
    }
  }

  const phoneX = discover.x0 + 1.75;
  const phoneZ = T.farWall + 1.05;
  const phoneW = 0.95;
  const phoneH = 2.55;
  boxes.add('redSign', phoneX, phoneH / 2, phoneZ, phoneW, phoneH, phoneW);
  boxes.add('redSign', phoneX, phoneH + 0.12, phoneZ, phoneW + 0.10, 0.24, phoneW + 0.10);
  cylinders.add('redSign', phoneX, phoneH + 0.32, phoneZ, phoneW * 0.43, 0.18, 12);
  const paneXs = [-0.25, 0, 0.25];
  const paneYs = [0.58, 1.02, 1.46, 1.90];
  for (const px of paneXs) {
    for (const py of paneYs) {
      boxes.add('blackGloss', phoneX + px, py, phoneZ - phoneW / 2 - 0.015,
        0.18, 0.30, 0.03);
      boxes.add('blackGloss', phoneX + phoneW / 2 + 0.015, py, phoneZ + px,
        0.03, 0.30, 0.18);
    }
  }

  // InMotion storefront and dark, cool-lit electronics recess.
  const motion = T.inMotion;
  const motionWidth = motion.x1 - motion.x0;
  const motionX = (motion.x0 + motion.x1) / 2;
  const motionDepth = 3.5;
  const inMotionMouthZ = T.rearWall;
  const motionBackZ = inMotionMouthZ - motionDepth;
  const storefrontDepth = 0.24;
  const storefrontZ = inMotionMouthZ - storefrontDepth / 2;
  boxes.add('blackGloss', motion.x0 + 0.16, inMotionHeight / 2, storefrontZ,
    0.32, inMotionHeight, storefrontDepth);
  boxes.add('blackGloss', motion.x1 - 0.16, inMotionHeight / 2, storefrontZ,
    0.32, inMotionHeight, storefrontDepth);
  boxes.add('blackGloss', motionX, motion.bannerY1 + (T.ceiling - motion.bannerY1) / 2,
    storefrontZ, motionWidth, T.ceiling - motion.bannerY1, storefrontDepth);

  const darkWall = m('wallWhite', { color: new THREE.Color(0x2A2E34), roughness: 0.82 });
  customMaterials.set('darkWall', darkWall);
  boxes.add('darkWall', motionX, inMotionHeight / 2, motionBackZ,
    motionWidth, inMotionHeight, wallThickness);
  boxes.add('darkWall', motion.x0, inMotionHeight / 2, inMotionMouthZ - motionDepth / 2,
    wallThickness, inMotionHeight, motionDepth);
  boxes.add('darkWall', motion.x1, inMotionHeight / 2, inMotionMouthZ - motionDepth / 2,
    wallThickness, inMotionHeight, motionDepth);
  boxes.add('darkWall', motionX, 0.09, inMotionMouthZ - motionDepth / 2,
    motionWidth, 0.18, motionDepth);
  boxes.add('darkWall', motionX, inMotionHeight, inMotionMouthZ - motionDepth / 2,
    motionWidth, wallThickness, motionDepth);

  const bannerTexture = texture('inMotionBanner');
  const bannerMat = new THREE.MeshStandardMaterial({
    ...(bannerTexture ? { map: bannerTexture, emissiveMap: bannerTexture } : {}),
    color: bannerTexture ? 0xFFFFFF : P.banner,
    emissive: 0xFFF1A8,
    emissiveIntensity: 0.5,
    roughness: 0.74,
    metalness: 0,
  });
  localMaterials.push(bannerMat);
  addQuad('inMotionBanner', motionWidth, motion.bannerY1 - motion.bannerY0, bannerMat,
    motionX, (motion.bannerY0 + motion.bannerY1) / 2, inMotionMouthZ + 0.06);

  const plaques = T.brandPlaques;
  const plaqueHeight = plaques.y1 - plaques.y0;
  boxes.add('blackMatte', plaques.x, (plaques.y0 + plaques.y1) / 2, plaques.z - 0.03,
    0.95, plaqueHeight, 0.06);
  const plaquesTexture = texture('brandPlaques');
  const plaqueMat = new THREE.MeshStandardMaterial({
    ...(plaquesTexture ? { map: plaquesTexture, emissiveMap: plaquesTexture } : {}),
    color: 0xFFFFFF,
    emissive: 0xFFFFFF,
    emissiveIntensity: 0.28,
    roughness: 0.85,
    metalness: 0,
  });
  localMaterials.push(plaqueMat);
  addQuad('brandPlaques', 0.95, plaqueHeight, plaqueMat,
    plaques.x, (plaques.y0 + plaques.y1) / 2, plaques.z + 0.01);

  ownMaterial('tableGlow', new THREE.MeshBasicMaterial({ color: 0xE8F5FF, toneMapped: false }));
  const tableTopY = 0.90;
  const tableSlabHeight = 0.06;
  const tableY = tableTopY - tableSlabHeight / 2;
  const tableZ = T.rearWall - motionDepth * 0.48;
  for (let tableIndex = 0; tableIndex < 3; tableIndex += 1) {
    const x = THREE.MathUtils.lerp(motion.x0, motion.x1, (tableIndex + 1) / 4);
    boxes.add('glass', x, tableY, tableZ, 2.2, tableSlabHeight, 0.75);
    boxes.add('tableGlow', x, tableY - 0.055, tableZ, 2.08, 0.025, 0.66);
    for (const dx of [-0.82, 0.82]) {
      for (const dz of [-0.25, 0.25]) {
        boxes.add('chrome', x + dx, tableY / 2, tableZ + dz, 0.045, tableY, 0.045);
      }
    }
    for (let phoneIndex = 0; phoneIndex < 8; phoneIndex += 1) {
      const column = phoneIndex % 4;
      const row = Math.floor(phoneIndex / 4);
      boxes.add('blackGloss', x - 0.72 + column * 0.48, tableTopY + 0.075,
        tableZ - 0.18 + row * 0.36, 0.075, 0.15, 0.012);
    }
  }

  const videoWidth = 6.0;
  const videoHeight = 2.4;
  const videoBottom = 1.2;
  const videoMat = new THREE.MeshBasicMaterial({ color: 0x1B7FE0, toneMapped: false });
  localMaterials.push(videoMat);
  addQuad('inMotionVideoWall', videoWidth, videoHeight, videoMat,
    motionX, videoBottom + videoHeight / 2, motionBackZ + 0.16);
  ownMaterial('paleBlue', new THREE.MeshBasicMaterial({ color: 0xB8E5FF, toneMapped: false }));
  boxes.add('paleBlue', motionX, videoBottom + 1.62, motionBackZ + 0.19, 3.9, 0.16, 0.025);
  boxes.add('paleBlue', motionX - 0.70, videoBottom + 1.12, motionBackZ + 0.19, 2.5, 0.08, 0.025);
  boxes.add('paleBlue', motionX - 0.98, videoBottom + 0.84, motionBackZ + 0.19, 1.95, 0.08, 0.025);

  // Aelia Duty Free perimeter, open corners and illuminated product walls.
  const aelia = T.aelia;
  const aeliaWidth = aelia.x1 - aelia.x0;
  const aeliaDepth = aelia.z1 - aelia.z0;
  const aeliaX = (aelia.x0 + aelia.x1) / 2;
  const aeliaZ = (aelia.z0 + aelia.z1) / 2;
  const aeliaHeight = 3.6;
  const aeliaWall = 0.25;
  const frontOpening = 5.0;
  const frontOpenX0 = aeliaX - frontOpening / 2;
  const frontOpenX1 = aeliaX + frontOpening / 2;
  const sideOpening = 4.0;
  const sideOpenZ0 = aeliaZ - sideOpening / 2;
  const sideOpenZ1 = aeliaZ + sideOpening / 2;

  boxes.add('blackGloss', aelia.x0, aeliaHeight / 2, aeliaZ,
    aeliaWall, aeliaHeight, aeliaDepth);
  boxes.add('blackGloss', (aelia.x0 + frontOpenX0) / 2, aeliaHeight / 2, aelia.z1,
    frontOpenX0 - aelia.x0, aeliaHeight, aeliaWall);
  boxes.add('blackGloss', (frontOpenX1 + aelia.x1) / 2, aeliaHeight / 2, aelia.z1,
    aelia.x1 - frontOpenX1, aeliaHeight, aeliaWall);
  boxes.add('blackGloss', aelia.x1, aeliaHeight / 2, (aelia.z0 + sideOpenZ0) / 2,
    aeliaWall, aeliaHeight, sideOpenZ0 - aelia.z0);
  boxes.add('blackGloss', aelia.x1, aeliaHeight / 2, (sideOpenZ1 + aelia.z1) / 2,
    aeliaWall, aeliaHeight, aelia.z1 - sideOpenZ1);
  boxes.add('blackGloss', aeliaX, aeliaHeight - 0.45, aelia.z1,
    frontOpening, 0.90, aeliaWall);
  boxes.add('blackGloss', aelia.x1, aeliaHeight - 0.45, aeliaZ,
    aeliaWall, 0.90, sideOpening);

  const aeliaTexture = texture('aeliaFront');
  const aeliaFasciaMat = new THREE.MeshStandardMaterial({
    ...(aeliaTexture ? { map: aeliaTexture, emissiveMap: aeliaTexture } : {}),
    color: aeliaTexture ? 0xFFFFFF : 0x18191D,
    emissive: 0xFFFFFF,
    emissiveIntensity: 0.38,
    roughness: 0.65,
    metalness: 0.04,
  });
  localMaterials.push(aeliaFasciaMat);
  addQuad('aeliaFront', frontOpening, 0.90, aeliaFasciaMat,
    aeliaX, aeliaHeight - 0.45, aelia.z1 + 0.14);

  const gradientWidth = 6.0;
  const gradientHeight = 2.6;
  const gradientGeometry = new THREE.PlaneGeometry(gradientWidth, gradientHeight, 1, 1);
  const gradientColours = [];
  const warmTop = new THREE.Color(0xFFF0D2);
  const dimBottom = new THREE.Color(0x6B4A22);
  const positionAttribute = gradientGeometry.getAttribute('position');
  for (let i = 0; i < positionAttribute.count; i += 1) {
    const mix = positionAttribute.getY(i) / gradientHeight + 0.5;
    const colour = dimBottom.clone().lerp(warmTop, mix);
    gradientColours.push(colour.r, colour.g, colour.b);
  }
  gradientGeometry.setAttribute('color', new THREE.Float32BufferAttribute(gradientColours, 3));
  const gradientMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  localMaterials.push(gradientMat);

  const rearPanel = new THREE.Mesh(gradientGeometry, gradientMat);
  rearPanel.name = 'aeliaLiquorWallRear';
  const aeliaRearDisplayZ = T.rearWall + 0.18;
  rearPanel.position.set(aeliaX, 0.5 + gradientHeight / 2, aeliaRearDisplayZ);
  rearPanel.castShadow = false;
  rearPanel.receiveShadow = false;
  rearPanel.renderOrder = -1;
  group.add(rearPanel);

  const sidePanel = new THREE.Mesh(gradientGeometry, gradientMat);
  sidePanel.name = 'aeliaLiquorWallSide';
  sidePanel.position.set(aelia.x0 + 0.14, 0.5 + gradientHeight / 2, aeliaZ);
  sidePanel.rotation.y = Math.PI / 2;
  sidePanel.castShadow = false;
  sidePanel.receiveShadow = false;
  sidePanel.renderOrder = -1;
  group.add(sidePanel);

  ownMaterial('bottleAmber', new THREE.MeshStandardMaterial({
    color: 0xC78632,
    transparent: true,
    opacity: 0.68,
    roughness: 0.25,
    metalness: 0.03,
    depthWrite: false,
  }));
  const bottleShelves = [0.72, 1.34, 1.96, 2.58];
  for (const y of bottleShelves) {
    boxes.add('blackGloss', aeliaX, y - 0.20, aeliaRearDisplayZ + 0.12,
      gradientWidth, 0.045, 0.24);
    boxes.add('blackGloss', aelia.x0 + 0.25, y - 0.20, aeliaZ, 0.24, 0.045, gradientWidth);
    for (let i = 0; i < 14; i += 1) {
      const along = THREE.MathUtils.lerp(-gradientWidth / 2 + 0.24, gradientWidth / 2 - 0.24,
        (i + 0.5) / 14);
      cylinders.add('bottleAmber', aeliaX + along, y, aeliaRearDisplayZ + 0.15,
        0.045, 0.30, 8);
      cylinders.add('bottleAmber', aelia.x0 + 0.28, y, aeliaZ + along, 0.045, 0.30, 8);
    }
  }

  const offerPositions = [
    { x: frontOpenX0 - 0.65, y: 1.15 },
    { x: frontOpenX0 - 0.65, y: 2.00 },
    { x: frontOpenX1 + 0.65, y: 1.55 },
  ];
  for (const offer of offerPositions) {
    boxes.add('redSign', offer.x, offer.y, aelia.z1 + 0.15, 0.76, 0.56, 0.06);
  }
  const offerMat = new THREE.MeshStandardMaterial({
    ...(aeliaTexture ? { map: aeliaTexture, emissiveMap: aeliaTexture } : {}),
    color: aeliaTexture ? 0xFFFFFF : P.jet2Red,
    emissive: 0xFFDDD4,
    emissiveIntensity: 0.30,
    roughness: 0.78,
    metalness: 0,
  });
  localMaterials.push(offerMat);
  const offerGeometry = new THREE.PlaneGeometry(0.70, 0.50);
  const offerCards = new THREE.InstancedMesh(offerGeometry, offerMat, offerPositions.length);
  const offerMatrix = new THREE.Matrix4();
  offerPositions.forEach((offer, index) => {
    offerMatrix.makeTranslation(offer.x, offer.y, aelia.z1 + 0.185);
    offerCards.setMatrixAt(index, offerMatrix);
  });
  offerCards.name = 'aeliaSpecialOffers';
  offerCards.instanceMatrix.needsUpdate = true;
  offerCards.castShadow = false;
  offerCards.receiveShadow = false;
  group.add(offerCards);

  addCollider(aeliaX, aeliaHeight / 2, aeliaZ, aeliaWidth, aeliaHeight, aeliaDepth);

  // Gate gantry, rods, green sub-signs and deliberately authored pseudo-glyphs.
  const gate = T.gateSign;
  boxes.add('blackMatte', gate.x, gate.y, gate.z, gate.w, gate.h, 0.10);
  const gateTexture = texture('gateSign');
  const gateMat = new THREE.MeshStandardMaterial({
    ...(gateTexture ? { map: gateTexture, emissiveMap: gateTexture } : {}),
    color: gateTexture ? 0xFFFFFF : 0x2A2D33,
    emissive: 0xFFFFFF,
    emissiveIntensity: 0.34,
    roughness: 0.84,
    metalness: 0,
  });
  localMaterials.push(gateMat);
  addQuad('gateSign', gate.w, gate.h, gateMat, gate.x, gate.y, gate.z + 0.06);

  const panelTop = gate.y + gate.h / 2;
  const rodHeight = T.ceiling - panelTop;
  for (const x of [gate.x - (gate.w / 2 - 0.6), gate.x + (gate.w / 2 - 0.6)]) {
    cylinders.add('steel', x, panelTop + rodHeight / 2, gate.z, 0.03, rodHeight, 12);
  }

  const stripHeight = 0.30;
  const panelBottom = gate.y - gate.h / 2;
  const stripY = panelBottom - 0.10 - stripHeight / 2;
  ownMaterial('whiteGlyph', new THREE.MeshBasicMaterial({ color: 0xFFFFFF, toneMapped: false }));
  const toiletsGlyphs = [
    { w: 0.090, h: 0.170 },
    { w: 0.066, h: 0.115 },
    { w: 0.036, h: 0.115 },
    { w: 0.038, h: 0.170 },
    { w: 0.070, h: 0.115 },
    { w: 0.050, h: 0.170 },
    { w: 0.074, h: 0.115 },
  ];
  const fireGlyphs = [
    { w: 0.074, h: 0.170 },
    { w: 0.038, h: 0.115 },
    { w: 0.064, h: 0.115 },
    { w: 0.070, h: 0.115 },
  ];
  const exitGlyphs = [
    { w: 0.070, h: 0.170 },
    { w: 0.054, h: 0.170 },
    { w: 0.038, h: 0.115 },
    { w: 0.082, h: 0.170 },
  ];
  const glyphPadding = 0.18;
  const pictogramWidth = 0.20;
  const pictogramGap = 0.08;
  const letterGap = 0.032;
  const wordGap = 0.10;

  function glyphRunWidth(groups) {
    let width = pictogramWidth + pictogramGap;
    groups.forEach((glyphs, groupIndex) => {
      width += glyphs.reduce((sum, glyph) => sum + glyph.w, 0);
      width += Math.max(0, glyphs.length - 1) * letterGap;
      if (groupIndex < groups.length - 1) width += wordGap;
    });
    return width;
  }

  const glyphGroups = [[toiletsGlyphs], [fireGlyphs, exitGlyphs]];
  const stripWidths = glyphGroups.map((groups) => glyphRunWidth(groups) + glyphPadding * 2);
  const stripGap = 0.20;
  const stripPairWidth = stripWidths[0] + stripGap + stripWidths[1];
  const stripCentres = [
    gate.x - stripPairWidth / 2 + stripWidths[0] / 2,
    gate.x + stripPairWidth / 2 - stripWidths[1] / 2,
  ];
  const panelFaceZ = gate.z + 0.06;
  const stripDepth = 0.06;
  const stripZ = panelFaceZ - stripDepth / 2;
  stripCentres.forEach((x, index) => {
    boxes.add('greenSign', x, stripY, stripZ, stripWidths[index], stripHeight, stripDepth);
  });

  function addGlyphLine(stripX, stripWidth, groups) {
    const left = stripX - stripWidth / 2;
    const glyphZ = panelFaceZ + 0.012;
    const baseline = stripY - 0.085;
    boxes.add('whiteGlyph', left + glyphPadding + pictogramWidth / 2,
      stripY, glyphZ, pictogramWidth, 0.20, 0.022);
    let cursor = left + glyphPadding + pictogramWidth + pictogramGap;
    groups.forEach((glyphs, groupIndex) => {
      glyphs.forEach((glyph, glyphIndex) => {
        boxes.add('whiteGlyph', cursor + glyph.w / 2, baseline + glyph.h / 2,
          glyphZ, glyph.w, glyph.h, 0.022);
        cursor += glyph.w;
        if (glyphIndex < glyphs.length - 1) cursor += letterGap;
      });
      if (groupIndex < groups.length - 1) cursor += wordGap;
    });
  }
  glyphGroups.forEach((groups, index) => {
    addGlyphLine(stripCentres[index], stripWidths[index], groups);
  });

  // Four local point lights only; the slot grid itself remains geometry.
  function point(name, colour, x, y, z) {
    const light = new THREE.PointLight(colour, 14, 15, 2);
    light.name = name;
    light.position.set(x, y, z);
    light.castShadow = false;
    group.add(light);
  }
  point('discoverWarmLight', 0xFFE9C8, discoverX, 3.0, T.farWall + discoverDepth / 2);
  point('inMotionCoolLight', 0xDCEBFF, motionX, 3.0, T.rearWall - motionDepth / 2);
  point('aeliaWallLight', 0xFFE3B5, aeliaX, 3.0, aelia.z0 + aeliaDepth * 0.28);
  point('concourseKioskLight', 0xFFF0D8,
    (L.kiosk.outer.x0 + L.kiosk.outer.x1) / 2, T.ceiling - 0.8, L.kiosk.outer.z1 + 2.6);

  boxes.flush();
  cylinders.flush();

  function dispose() {
    const geometries = new Set();
    group.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
    });
    geometries.forEach((geometry) => geometry.dispose());
    localTextures.forEach((item) => item.dispose());
    new Set(localMaterials).forEach((material) => material.dispose());
  }

  return {
    group,
    colliders,
    interactables: [],
    update(dt, t) {},
    dispose,
  };
}

export function buildLighting(ctx) {
  const L = ctx.layout;
  const group = new THREE.Group();
  group.name = 'terminalLighting';

  const hemisphere = new THREE.HemisphereLight(0xFFF6E8, 0x8C7F70, 1.7);
  group.add(hemisphere);

  const key = new THREE.DirectionalLight(0xFFF4E2, 1.15);
  key.position.set(8, 14, 10);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -16;
  key.shadow.camera.right = 16;
  key.shadow.camera.top = 14;
  key.shadow.camera.bottom = -14;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 44;
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 3;
  key.target.position.set(
    (L.terminal.floor.x0 + L.terminal.floor.x1) / 2,
    1,
    (L.terminal.floor.z0 + L.terminal.floor.z1) / 2,
  );
  group.add(key, key.target);

  group.add(new THREE.AmbientLight(0xEDEFF5, 0.25));

  return { group, update(dt, t) {} };
}
