// Terminal props, part 1: seating pods and communal bar tables.
import * as THREE from 'three';

const FALLBACK_COLOURS = {
  oak: 0xC8A57B,
  oakDark: 0xA8865C,
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
  coral: 0xE2593C,
  cardboard: 0xB08D57,
  paperCup: 0xF6F3EC,
  plasticLid: 0x2A2C31,
};

function mergeGeom(list) {
  const geometries = list.map((geometry) => geometry.toNonIndexed());
  const attributeNames = ['position', 'normal', 'uv'];
  const merged = new THREE.BufferGeometry();

  for (const name of attributeNames) {
    const total = geometries.reduce((sum, geometry) => (
      sum + (geometry.getAttribute(name)?.array.length ?? 0)
    ), 0);
    if (total === 0) continue;
    const values = new Float32Array(total);
    let offset = 0;
    for (const geometry of geometries) {
      const source = geometry.getAttribute(name)?.array;
      if (!source) continue;
      values.set(source, offset);
      offset += source.length;
    }
    const itemSize = geometries.find((geometry) => geometry.getAttribute(name))
      .getAttribute(name).itemSize;
    merged.setAttribute(name, new THREE.BufferAttribute(values, itemSize));
  }

  geometries.forEach((geometry) => geometry.dispose());
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function chairPart(width, height, depth, x, y, z, rotX = 0) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, 0, 0));
  matrix.compose(
    new THREE.Vector3(x, y, z),
    quaternion,
    new THREE.Vector3(1, 1, 1),
  );
  geometry.applyMatrix4(matrix);
  return geometry;
}

const CHAIR_SHELL_GEOMETRY = mergeGeom([
  chairPart(0.46, 0.05, 0.44, 0, 0.44, 0),
  chairPart(0.46, 0.42, 0.05, 0, 0.68, -0.20, -0.12),
  // Side cheeks span y 0.35–0.45, bridging the seat-pan/beam gap like clamps.
  chairPart(0.03, 0.10, 0.40, -0.235, 0.40, 0),
  chairPart(0.03, 0.10, 0.40, 0.235, 0.40, 0),
]);

export function buildProps(ctx) {
  const L = ctx.layout;
  const T = L.terminal;
  const P = L.palette;
  const group = new THREE.Group();
  group.name = 'props';

  const localMaterials = [];
  const localTextures = [];
  const customMaterials = new Map();
  const rng = typeof ctx.rng === 'function' ? ctx.rng : () => 0.5;

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
  const KEEP_OUT = [L.kiosk.outer, (L.backHouse ?? L.kiosk?.backHouse)?.outer]
    .filter(Boolean)
    .map((rect) => ({
      x0: rect.x0 - 0.5,
      x1: rect.x1 + 0.5,
      z0: rect.z0 - 0.5,
      z1: rect.z1 + 0.5,
    }));

  function addCollider(cx, cy, cz, sx, sy, sz, pad = 0.15) {
    colliders.push(new THREE.Box3(
      new THREE.Vector3(cx - sx / 2 - pad, Math.max(0, cy - sy / 2 - pad), cz - sz / 2 - pad),
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

  // All prop placement passes through this clearance test.
  function blocked(x, z, r = 0) {
    for (const rect of KEEP_OUT) {
      const nearestX = THREE.MathUtils.clamp(x, rect.x0, rect.x1);
      const nearestZ = THREE.MathUtils.clamp(z, rect.z0, rect.z1);
      const dx = x - nearestX;
      const dz = z - nearestZ;
      if (dx * dx + dz * dz <= r * r) return true;
    }

    const clearance = r + 0.6;
    const clearanceSq = clearance * clearance;
    const order = L.queue.order;
    for (let i = 0; i < order.n; i += 1) {
      const dx = x - (order.x + order.dx * i);
      const dz = z - order.z;
      if (dx * dx + dz * dz <= clearanceSq) return true;
    }
    const pickup = L.queue.pickup;
    for (let i = 0; i < pickup.n; i += 1) {
      const dx = x - (pickup.x + pickup.dx * i);
      const dz = z - pickup.z;
      if (dx * dx + dz * dz <= clearanceSq) return true;
    }
    return false;
  }

  function blockedBox(cx, cz, sx, sz) {
    const hx = sx / 2;
    const hz = sz / 2;
    const rectX0 = cx - hx;
    const rectX1 = cx + hx;
    const rectZ0 = cz - hz;
    const rectZ1 = cz + hz;
    for (const rect of KEEP_OUT) {
      if (rectX1 >= rect.x0 && rectX0 <= rect.x1
        && rectZ1 >= rect.z0 && rectZ0 <= rect.z1) return true;
    }

    const order = L.queue.order;
    for (let i = 0; i < order.n; i += 1) {
      const slotX = order.x + order.dx * i;
      const slotZ = order.z;
      const nearestX = THREE.MathUtils.clamp(slotX, rectX0, rectX1);
      const nearestZ = THREE.MathUtils.clamp(slotZ, rectZ0, rectZ1);
      if (Math.hypot(slotX - nearestX, slotZ - nearestZ) <= 0.6) return true;
    }
    const pickup = L.queue.pickup;
    for (let i = 0; i < pickup.n; i += 1) {
      const slotX = pickup.x + pickup.dx * i;
      const slotZ = pickup.z;
      const nearestX = THREE.MathUtils.clamp(slotX, rectX0, rectX1);
      const nearestZ = THREE.MathUtils.clamp(slotZ, rectZ0, rectZ1);
      if (Math.hypot(slotX - nearestX, slotZ - nearestZ) <= 0.6) return true;
    }
    return false;
  }

  function placeBox(key, cx, cy, cz, sx, sy, sz, rotY = 0, rotX = 0, colour = null) {
    const cosine = Math.abs(Math.cos(rotY));
    const sine = Math.abs(Math.sin(rotY));
    const worldWidth = cosine * sx + sine * sz;
    const worldDepth = sine * sx + cosine * sz;
    if (blockedBox(cx, cz, worldWidth, worldDepth)) return false;
    boxes.add(key, cx, cy, cz, sx, sy, sz, rotY, rotX, colour);
    return true;
  }

  function placeCylinder(key, cx, cy, cz, radius, height, radialSegments = 12,
    rotX = 0, rotZ = 0, colour = null) {
    if (blocked(cx, cz, radius)) return false;
    cylinders.add(key, cx, cy, cz, radius, height, radialSegments, rotX, rotZ, colour);
    return true;
  }

  customMaterials.set('coral', m('coral'));
  customMaterials.set('brownLids', m('plasticLid', { color: 0x6B4A32 }));
  customMaterials.set('tumblerBodies', m('wallWhite', { color: 0xFFFFFF }));
  customMaterials.set('tumblerLids', ctx.mat?.get?.('tumblerLid')
    ? m('tumblerLid')
    : m('plasticLid'));
  customMaterials.set('coffeeBags', m('blackMatte', { color: 0x2E2018 }));

  function worldPoint(bank, localX, localZ) {
    const cosine = Math.cos(bank.rotY);
    const sine = Math.sin(bank.rotY);
    return {
      x: bank.x + cosine * localX + sine * localZ,
      z: bank.z - sine * localX + cosine * localZ,
    };
  }

  const BANKS = [
    { id: 'A', x: T.seating.x0 + 1.8, z: T.seating.z0 + 1.6, rotY: 0.10, power: true },
    { id: 'B', x: T.seating.x0 + 1.8, z: T.seating.z0 + 4.6, rotY: -0.10, power: false },
    { id: 'C', x: T.seating.x0 + 5.8, z: T.seating.z0 + 1.4, rotY: 0.30, power: true },
    { id: 'D', x: T.seating.x0 + 2.2, z: T.seating.z1 - 2.0, rotY: -0.22, power: false },
    { id: 'E', x: T.seating.x0 + 6.4, z: T.seating.z1 - 1.6, rotY: 0.42, power: true },
  ];

  function buildSeating() {
    const placedBanks = BANKS.filter((bank) => (
      !blocked(bank.x, bank.z, bank.power ? 2.18 : 1.82)
    ));
    const chairMatrices = [];
    const bankMatrix = new THREE.Matrix4();
    const localMatrix = new THREE.Matrix4();
    const worldMatrix = new THREE.Matrix4();
    const bankPosition = new THREE.Vector3();
    const bankQuaternion = new THREE.Quaternion();
    const bankScale = new THREE.Vector3(1, 1, 1);
    const bankEuler = new THREE.Euler(0, 0, 0, 'YXZ');

    for (const bank of placedBanks) {
      bankPosition.set(bank.x, 0, bank.z);
      bankEuler.set(0, bank.rotY, 0);
      bankQuaternion.setFromEuler(bankEuler);
      bankMatrix.compose(bankPosition, bankQuaternion, bankScale);

      for (let chairIndex = 0; chairIndex < 6; chairIndex += 1) {
        const localX = (chairIndex - 2.5) * 0.56;
        const chairPosition = worldPoint(bank, localX, 0);
        if (blocked(chairPosition.x, chairPosition.z, 0.33)) continue;
        localMatrix.makeTranslation(localX, 0, 0);
        worldMatrix.multiplyMatrices(bankMatrix, localMatrix);
        chairMatrices.push(worldMatrix.clone());
      }

      placeBox('chrome', bank.x, 0.355, bank.z, 3.60, 0.09, 0.10, bank.rotY);
      for (const localX of [-1.45, 1.45]) {
        const leg = worldPoint(bank, localX, 0);
        placeBox('chrome', leg.x, 0.20, leg.z, 0.07, 0.40, 0.36, bank.rotY);
      }

      if (bank.power) {
        const totem = worldPoint(bank, 2.10, 0);
        placeBox('blackMatte', totem.x, 0.475, totem.z,
          0.16, 0.95, 0.16, bank.rotY);
        const faceplate = worldPoint(bank, 2.10, 0.09);
        placeBox('coral', faceplate.x, 0.80, faceplate.z,
          0.10, 0.02, 0.02, bank.rotY);
      }

      const localMinX = -1.80;
      const localMaxX = bank.power ? 2.18 : 1.80;
      const localMinZ = -0.26;
      const localMaxZ = 0.22;
      const localWidth = localMaxX - localMinX;
      const localDepth = localMaxZ - localMinZ;
      const localCentreX = (localMinX + localMaxX) / 2;
      const localCentreZ = (localMinZ + localMaxZ) / 2;
      const colliderCentre = worldPoint(bank, localCentreX, localCentreZ);
      const cosine = Math.abs(Math.cos(bank.rotY));
      const sine = Math.abs(Math.sin(bank.rotY));
      const worldWidth = cosine * localWidth + sine * localDepth;
      const worldDepth = sine * localWidth + cosine * localDepth;
      const colliderHeight = bank.power ? 0.95 : 0.90;
      addCollider(colliderCentre.x, colliderHeight / 2, colliderCentre.z,
        worldWidth, colliderHeight, worldDepth);
    }

    const shells = new THREE.InstancedMesh(
      CHAIR_SHELL_GEOMETRY,
      materialFor('blackMatte'),
      chairMatrices.length,
    );
    shells.name = 'chairShells';
    shells.castShadow = false;
    shells.receiveShadow = true;
    chairMatrices.forEach((matrix, index) => shells.setMatrixAt(index, matrix));
    shells.instanceMatrix.needsUpdate = true;
    shells.computeBoundingBox();
    shells.computeBoundingSphere();
    group.add(shells);
  }

  function scatterPosition(table, radius, occupied, itemIndex) {
    const halfWidth = T.tableSize.w / 2;
    const halfDepth = T.tableSize.d / 2;
    const margin = 0.12;
    const xReach = Math.max(0, halfWidth - margin - radius);
    const zReach = Math.max(0, halfDepth - margin - radius);

    for (let attempt = 0; attempt < 48; attempt += 1) {
      const u = (rng() + itemIndex * 0.61803398875 + attempt * 0.38196601125) % 1;
      const v = (rng() + itemIndex * 0.41421356237 + attempt * 0.73205080757) % 1;
      const point = worldPoint(
        { x: table.x, z: table.z, rotY: table.rotY ?? 0 },
        (u * 2 - 1) * xReach,
        (v * 2 - 1) * zReach,
      );
      const overlaps = occupied.some((item) => {
        const dx = point.x - item.x;
        const dz = point.z - item.z;
        const spacing = radius + item.radius + 0.025;
        return dx * dx + dz * dz < spacing * spacing;
      });
      if (!overlaps && !blocked(point.x, point.z, radius)) {
        occupied.push({ x: point.x, z: point.z, radius });
        return { x: point.x, z: point.z };
      }
    }
    return null;
  }

  function buildTableScatter(table) {
    const occupied = [];
    let itemIndex = 0;

    for (let cupIndex = 0; cupIndex < 3; cupIndex += 1) {
      const point = scatterPosition(table, 0.041, occupied, itemIndex);
      itemIndex += 1;
      if (!point) continue;
      placeCylinder('paperCup', point.x, T.tableSize.h + 0.115 / 2, point.z,
        0.037, 0.115, 8);
      placeCylinder('brownLids', point.x, T.tableSize.h + 0.115 + 0.012 / 2, point.z,
        0.041, 0.012, 8);
    }

    const bag = scatterPosition(table, Math.hypot(0.16, 0.10) / 2, occupied, itemIndex);
    itemIndex += 1;
    if (bag) {
      const rotY = rng() * Math.PI * 2;
      const rotX = 0.10;
      const bagHalfHeight = Math.cos(rotX) * 0.13 / 2 + Math.sin(rotX) * 0.10 / 2;
      placeBox('cardboard', bag.x, T.tableSize.h + bagHalfHeight, bag.z,
        0.16, 0.13, 0.10, rotY, rotX);
    }

    const phone = scatterPosition(table, Math.hypot(0.075, 0.150) / 2,
      occupied, itemIndex);
    itemIndex += 1;
    if (phone) {
      placeBox('blackGloss', phone.x, T.tableSize.h + 0.008 / 2, phone.z,
        0.075, 0.008, 0.150, rng() * Math.PI * 2);
    }

    const laptop = scatterPosition(table, Math.hypot(0.31, 0.22) / 2,
      occupied, itemIndex);
    if (laptop) {
      const rotY = rng() * Math.PI * 2;
      placeBox('steel', laptop.x, T.tableSize.h + 0.014 / 2, laptop.z,
        0.31, 0.014, 0.22, rotY);
      placeBox('blackMatte', laptop.x, T.tableSize.h + 0.014 + 0.008 / 2, laptop.z,
        0.30, 0.008, 0.21, rotY);
    }
  }

  // Tables line the kiosk mural's west face; layout.terminal.tables supplies centre and rotation.
  function buildTables() {
    const size = T.tableSize;

    T.tables.forEach((entry) => {
      if (!entry) return;
      const table = { x: entry.x, z: entry.z, rotY: entry.rotY ?? 0 };
      const cosine = Math.abs(Math.cos(table.rotY));
      const sine = Math.abs(Math.sin(table.rotY));
      const footWidth = cosine * size.w + sine * size.d;
      const footDepth = sine * size.w + cosine * size.d;
      if (blockedBox(table.x, table.z, footWidth, footDepth)) return;

      placeBox('oak', table.x, size.h - 0.06 / 2, table.z,
        size.w, 0.06, size.d, table.rotY);
      placeBox('oakDark', table.x, 0.99 - 0.05 / 2, table.z,
        size.w - 0.08, 0.05, size.d - 0.08, table.rotY);

      const legX = size.w / 2 - 0.30;
      const legZ = size.d / 2 - 0.30;
      for (const xSign of [-1, 1]) {
        for (const zSign of [-1, 1]) {
          const leg = worldPoint(table, xSign * legX, zSign * legZ);
          placeBox('blackMatte', leg.x, 0.47, leg.z, 0.09, 0.94, 0.09);
        }
      }

      for (const side of [-1, 1]) {
        for (let stoolIndex = 0; stoolIndex < 5; stoolIndex += 1) {
          const stool = worldPoint(table, (stoolIndex - 2) * 1.02, side * 0.56);
          placeCylinder('oak', stool.x, 0.75 - 0.05 / 2, stool.z,
            0.16, 0.05, 12);

          for (let legIndex = 0; legIndex < 4; legIndex += 1) {
            const angle = Math.PI / 4 + legIndex * Math.PI / 2;
            const legCentreX = stool.x + Math.cos(angle) * 0.105;
            const legCentreZ = stool.z + Math.sin(angle) * 0.105;
            const rotX = -Math.sin(angle) * 0.12;
            const rotZ = Math.cos(angle) * 0.12;
            placeCylinder('blackMatte', legCentreX, 0.375, legCentreZ,
              0.018, 0.75, 8, rotX, rotZ);
          }
        }
      }

      buildTableScatter(table);
      addCollider(table.x, size.h / 2, table.z,
        footWidth,
        size.h,
        footDepth);
    });
  }

  function buildMerch() {
    const merch = T.merch;
    const { x0, x1, z0, z1, tiers } = merch;
    const width = x1 - x0;
    const depth = z1 - z0;
    const centreX = (x0 + x1) / 2;
    const centreZ = (z0 + z1) / 2;
    const topTier = Math.max(...tiers);
    const bottomTier = Math.min(...tiers);
    const carcassTop = topTier + 0.20;

    if (blocked(centreX, centreZ, Math.hypot(width, depth) / 2)) return;

    placeBox('oak', x0 + 0.025, carcassTop / 2, centreZ,
      0.05, carcassTop, depth);
    placeBox('oak', x1 - 0.025, carcassTop / 2, centreZ,
      0.05, carcassTop, depth);
    placeBox('oak', centreX, carcassTop / 2, z0 + 0.02,
      width, carcassTop, 0.04);
    placeBox('oakDark', centreX, 0.05, centreZ,
      width - 0.08, 0.10, depth - 0.08);

    const shelfDepth = depth - 0.04;
    const shelfCentreZ = z0 + 0.04 + shelfDepth / 2;
    for (const tier of tiers) {
      placeBox('oak', centreX, tier - 0.02, shelfCentreZ,
        width - 0.10, 0.04, shelfDepth);
    }

    const columnCount = 7;
    const rowCount = 4;
    const columnStart = x0 + 0.16;
    const columnEnd = x1 - 0.16;
    const rowStart = z0 + 0.30;
    const rowEnd = z1 - 0.26;
    const columnPitch = (columnEnd - columnStart) / (columnCount - 1);
    const rowPitch = (rowEnd - rowStart) / (rowCount - 1);

    for (const tier of tiers) {
      for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
        if (tier === bottomTier && columnIndex >= columnCount - 2) continue;
        const x = columnStart + columnIndex * columnPitch;
        for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
          const z = rowStart + rowIndex * rowPitch;
          const colour = (columnIndex + rowIndex) % 2 === 0 ? 0xFFFFFF : P.green;
          placeCylinder('tumblerBodies', x, tier + 0.095, z,
            0.045, 0.19, 8, 0, 0, colour);
          placeCylinder('tumblerLids', x, tier + 0.19 + 0.009, z,
            0.048, 0.018, 8, 0, 0, colour);
        }
      }
    }

    const basketX0 = columnStart + (columnCount - 2) * columnPitch - columnPitch / 2;
    const basketX1 = x1 - 0.08;
    const basketWidth = basketX1 - basketX0;
    const basketDepth = 0.52;
    const basketHeight = 0.16;
    const wallThickness = 0.015;
    const basketX = (basketX0 + basketX1) / 2;
    const basketZ = centreZ;
    const basketY = bottomTier + basketHeight / 2;

    placeBox('steel', basketX, basketY,
      basketZ - basketDepth / 2 + wallThickness / 2,
      basketWidth, basketHeight, wallThickness);
    placeBox('steel', basketX, basketY,
      basketZ + basketDepth / 2 - wallThickness / 2,
      basketWidth, basketHeight, wallThickness);
    placeBox('steel', basketX0 + wallThickness / 2, basketY, basketZ,
      wallThickness, basketHeight, basketDepth);
    placeBox('steel', basketX1 - wallThickness / 2, basketY, basketZ,
      wallThickness, basketHeight, basketDepth);

    const bagWidth = 0.11;
    const bagHeight = 0.17;
    const bagDepth = 0.045;
    const bagPitch = bagDepth + 0.05;
    for (let bagIndex = 0; bagIndex < 5; bagIndex += 1) {
      const rotX = (rng() * 2 - 1) * 0.10;
      const rotY = (rng() * 2 - 1) * 0.08;
      const bagHalfHeight = Math.abs(Math.cos(rotX)) * bagHeight / 2
        + Math.abs(Math.sin(rotX)) * bagDepth / 2;
      const z = basketZ + (bagIndex - 2) * bagPitch;
      placeBox('coffeeBags', basketX, bottomTier + bagHalfHeight, z,
        bagWidth, bagHeight, bagDepth, rotY, rotX);
    }

    addCollider(centreX, carcassTop / 2, centreZ,
      width, carcassTop, depth, 0);
  }

  function buildDressing() {
    customMaterials.set('coneYellow', m('rubber', {
      color: 0xF2C21A,
      roughness: 0.62,
    }));
    customMaterials.set('belts', m('blackGloss', {
      color: 0x1B1E24,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      side: THREE.DoubleSide,
    }));
    customMaterials.set('cartGrey', m('cloth', { color: 0x6E737A }));
    customMaterials.set('bucketYellow', m('rubber', { color: 0xE8B317 }));
    customMaterials.set('crateGrey', m('cloth', { color: 0x8E9298 }));

    const coneHeight = 0.62;
    const coneDepth = 0.022;
    const coneTilt = 0.30;
    const coneY = Math.abs(Math.cos(coneTilt)) * coneHeight / 2
      + Math.abs(Math.sin(coneTilt)) * coneDepth / 2;
    for (const [x, z] of [[-11.60, 4.40], [2.20, 6.60], [-4.00, 8.40]]) {
      const rotY = rng() * Math.PI * 2;
      const cone = { x, z, rotY };
      const nearBoard = worldPoint(cone, 0, -0.09);
      const farBoard = worldPoint(cone, 0, 0.09);
      placeBox('coneYellow', nearBoard.x, coneY, nearBoard.z,
        0.30, coneHeight, coneDepth, rotY, coneTilt);
      placeBox('coneYellow', farBoard.x, coneY, farBoard.z,
        0.30, coneHeight, coneDepth, rotY, -coneTilt);
    }

    const stanchionRuns = [
      [-7.50, -6.00, -4.50, -3.00],
      [1.00, 2.50, 4.00, 5.50],
    ];
    for (const run of stanchionRuns) {
      for (const x of run) {
        placeCylinder('blackMatte', x, 0.03, 4.80, 0.17, 0.06, 12);
        placeCylinder('chrome', x, 0.56, 4.80, 0.022, 1.00, 8);
        placeCylinder('blackMatte', x, 1.105, 4.80, 0.035, 0.09, 8);
      }
      for (let i = 0; i < run.length - 1; i += 1) {
        const x0 = run[i];
        const x1 = run[i + 1];
        placeBox('belts', (x0 + x1) / 2, 0.92, 4.80,
          x1 - x0, 0.05, 0.006);
      }
    }

    const cart = { x: -6.20, z: 7.40, rotY: 0.35 };
    const cartBodyWidth = 0.80;
    const cartBodyHeight = 0.55;
    const cartBodyDepth = 0.50;
    const cartBodyBottom = 0.12;
    const cartBodyY = cartBodyBottom + cartBodyHeight / 2;
    placeBox('cartGrey', cart.x, cartBodyY, cart.z,
      cartBodyWidth, cartBodyHeight, cartBodyDepth, cart.rotY);
    for (const localX of [-0.34, 0.34]) {
      for (const localZ of [-0.25, 0.25]) {
        const castor = worldPoint(cart, localX, localZ);
        placeCylinder('rubber', castor.x, 0.055, castor.z,
          0.055, 0.04, 8, 0, Math.PI / 2);
      }
    }
    for (const localX of [-0.30, 0.30]) {
      const upright = worldPoint(cart, localX, -0.25);
      placeCylinder('chrome', upright.x, 0.895, upright.z,
        0.016, 0.45, 8);
    }
    const crossbar = worldPoint(cart, 0, -0.25);
    placeBox('chrome', crossbar.x, 1.08, crossbar.z,
      0.60, 0.03, 0.03, cart.rotY);

    const bucket = worldPoint(cart, 0.62, 0);
    placeBox('bucketYellow', bucket.x, 0.15, bucket.z,
      0.42, 0.30, 0.34, cart.rotY);
    placeBox('blackMatte', bucket.x, 0.325, bucket.z,
      0.44, 0.05, 0.12, cart.rotY);
    const mopTilt = 0.32;
    const mopLength = 1.25;
    const mopLowerY = 0.18;
    const mopX = bucket.x - Math.sin(mopTilt) * mopLength / 2;
    const mopY = mopLowerY + Math.cos(mopTilt) * mopLength / 2;
    placeCylinder('cardboard', mopX, mopY, bucket.z,
      0.018, mopLength, 8, 0, mopTilt);

    const cartCosine = Math.abs(Math.cos(cart.rotY));
    const cartSine = Math.abs(Math.sin(cart.rotY));
    addCollider(cart.x, 0.55, cart.z,
      cartCosine * cartBodyWidth + cartSine * cartBodyDepth,
      1.10,
      cartSine * cartBodyWidth + cartCosine * cartBodyDepth,
      0);

    const crateZ = -4.20;
    for (const columnX of [-9.15, -8.25]) {
      for (let k = 0; k < 3; k += 1) {
        const x = columnX + (rng() * 2 - 1) * 0.03;
        const z = crateZ + (rng() * 2 - 1) * 0.03;
        const rotY = (rng() * 2 - 1) * 0.07;
        const bottom = k * 0.42;
        placeBox('crateGrey', x, bottom + 0.21, z,
          0.60, 0.42, 0.44, rotY);
        placeBox('blackMatte', x, bottom + 0.42 + 0.015, z,
          0.60, 0.03, 0.44, rotY);
      }
    }
    addCollider(-8.70, 0.645, -4.20, 1.70, 1.29, 0.90, 0);

    const bagLocalX = [-1.20, 1.30, -1.10, 1.25, -1.15];
    const bagColours = [0x2C3038, 0x3E4A5A, 0x5A4238, 0x2F4F45, 0x6B6560];
    BANKS.forEach((bank, index) => {
      const bagPosition = worldPoint(bank, bagLocalX[index], 0.95);
      const bag = {
        x: bagPosition.x,
        z: bagPosition.z,
        rotY: bank.rotY + (rng() * 2 - 1) * 0.25,
      };
      placeBox('cloth', bag.x, 0.32, bag.z,
        0.36, 0.55, 0.22, bag.rotY, 0, bagColours[index]);
      placeBox('blackMatte', bag.x, 0.615, bag.z,
        0.34, 0.04, 0.20, bag.rotY);

      for (const localX of [-0.10, 0.10]) {
        const rail = worldPoint(bag, localX, 0);
        placeCylinder('chrome', rail.x, 0.79, rail.z,
          0.011, 0.38, 8);
      }
      placeBox('chrome', bag.x, 0.98, bag.z,
        0.22, 0.025, 0.025, bag.rotY);
      for (const localX of [-0.13, 0.13]) {
        const wheel = worldPoint(bag, localX, 0.11);
        placeCylinder('rubber', wheel.x, 0.045, wheel.z,
          0.045, 0.035, 8, 0, Math.PI / 2);
      }
    });

    for (const [x, z] of [[-11.20, 6.60], [5.60, 5.80], [-16.80, -5.60]]) {
      placeCylinder('blackMatte', x, 0.425, z, 0.24, 0.85, 12);
      placeCylinder('chrome', x, 0.87, z, 0.255, 0.04, 12);
      placeCylinder('blackGloss', x, 0.925, z, 0.235, 0.07, 12);
    }
  }

  buildSeating();
  buildTables();
  buildMerch();
  buildDressing();

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
