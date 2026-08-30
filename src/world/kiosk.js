/*
 * Kiosk hero asset budget: approximately 40 draw calls / 12.7k triangles.
 * Repeated rails, plates, rods, cabinet bars, cakes, caddy parts and pastries
 * are instanced; the large joinery pieces remain one mesh apiece.
 */
import * as THREE from 'three';

export function buildKiosk(ctx) {
  const L = ctx.layout;
  const group = new THREE.Group();
  group.name = 'kiosk';

  const ownedMaterials = new Set();
  const ownedTextures = new Set();
  const materialCache = new Map();
  const textureCache = new Map();
  const rng = typeof ctx.rng === 'function' ? ctx.rng : () => 0.5;
  const anisotropy = ctx.renderer?.capabilities?.getMaxAnisotropy?.() ?? 1;
  const PLAN_SEGMENTS = 16;
  const SLAB = 0.045, OVERHANG = 0.012;
  // mirrored in src/world/equipment.js
  const SINK_CUTOUT_WIDTH = 0.46;
  const SINK_CUTOUT_DEPTH = 0.34;
  const ICE_WELL_CUTOUT_WIDTH = 0.38;
  const ICE_WELL_CUTOUT_DEPTH = 0.30;

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
    texture.needsUpdate = true;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repX, repY);
    texture.anisotropy = anisotropy;
    ownedTextures.add(texture);
    textureCache.set(key, texture);
    return texture;
  }

  function matWith(baseName, { map = null, emissiveMap = null, emissive, color, ...over } = {}) {
    const extras = Object.entries(over)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}:${value}`)
      .join('|');
    const cacheKey = `${baseName}|${map?.uuid ?? '-'}|${emissiveMap?.uuid ?? '-'}|${emissive ?? '-'}|${color ?? '-'}|${extras}`;
    if (materialCache.has(cacheKey)) return materialCache.get(cacheKey);

    let base = null;
    try {
      base = ctx.mat?.get?.(baseName) ?? null;
    } catch {
      base = null;
    }
    const material = base?.clone?.() ?? new THREE.MeshStandardMaterial({
      color: color ?? fallbackColor(baseName),
      roughness: 0.7,
      metalness: 0.04,
    });
    ownedMaterials.add(material);

    if (color !== undefined && 'color' in material) material.color.set(color);
    if (map && 'map' in material) {
      material.map = map;
      if ('color' in material) material.color.set(0xffffff);
    }
    if (emissive !== undefined && 'emissive' in material) material.emissive.set(emissive);
    if (emissiveMap && 'emissiveMap' in material) material.emissiveMap = emissiveMap;
    for (const [key, value] of Object.entries(over)) {
      if (key in material) material[key] = value;
    }
    material.needsUpdate = true;
    materialCache.set(cacheKey, material);
    return material;
  }

  function fallbackColor(name) {
    const colors = {
      oak: L.palette.oak,
      oakDark: L.palette.oakGrain,
      worktop: L.palette.worktop,
      mural: L.palette.muralGround,
      coral: L.palette.coral,
      blackMatte: L.palette.black,
      blackGloss: L.palette.black,
      glass: 0xbfd8dd,
      screen: 0xffffff,
      steel: 0xa9afb6,
      cardboard: 0xb08d57,
      greenSign: L.palette.green,
      paperCup: 0xf6f3ec,
    };
    return colors[name] ?? 0xcccccc;
  }

  function planPath(inset, segsPerCorner = PLAN_SEGMENTS) {
    const outer = L.kiosk.outer;
    const x0 = outer.x0 + inset;
    const x1 = outer.x1 - inset;
    const z0 = outer.z0 + inset;
    const z1 = outer.z1 - inset;
    const radius = Math.max(0.02, outer.radius - inset);
    const points = [];

    const push = (x, z) => {
      const previous = points[points.length - 1];
      if (!previous || Math.abs(previous.x - x) > 1e-7 || Math.abs(previous.y - z) > 1e-7) {
        points.push(new THREE.Vector2(x, z));
      }
    };
    const arc = (cx, cz, a0, a1) => {
      for (let i = 1; i <= segsPerCorner; i += 1) {
        const a = THREE.MathUtils.lerp(a0, a1, i / segsPerCorner);
        push(cx + Math.cos(a) * radius, cz + Math.sin(a) * radius);
      }
    };

    // Closed implicitly: rear midpoint -> east -> front -> west nose -> rear.
    push((x0 + x1) * 0.5, z0);
    push(x1 - radius, z0);
    arc(x1 - radius, z0 + radius, -Math.PI * 0.5, 0);
    push(x1, z1 - radius);
    arc(x1 - radius, z1 - radius, 0, Math.PI * 0.5);
    push(x0 + radius, z1);
    arc(x0 + radius, z1 - radius, Math.PI * 0.5, Math.PI);
    push(x0, z0 + radius);
    arc(x0 + radius, z0 + radius, Math.PI, Math.PI * 1.5);
    return points;
  }

  function pathLengths(points, closed = true) {
    const cumulative = new Float32Array(points.length + 1);
    for (let i = 1; i < points.length; i += 1) {
      cumulative[i] = cumulative[i - 1] + points[i - 1].distanceTo(points[i]);
    }
    cumulative[points.length] = cumulative[points.length - 1]
      + (closed ? points[points.length - 1].distanceTo(points[0]) : 0);
    return { cumulative, total: cumulative[points.length] };
  }

  function outwardNormal(points, index, closed = true) {
    const count = points.length;
    const previous = index > 0 ? points[index - 1] : (closed ? points[count - 1] : points[index]);
    const next = index < count - 1 ? points[index + 1] : (closed ? points[0] : points[index]);
    const tangent = next.clone().sub(previous).normalize();
    const normal = new THREE.Vector2(tangent.y, -tangent.x).normalize();
    const centre = new THREE.Vector2(
      (L.kiosk.outer.x0 + L.kiosk.outer.x1) * 0.5,
      (L.kiosk.outer.z0 + L.kiosk.outer.z1) * 0.5,
    );
    if (normal.dot(points[index].clone().sub(centre)) < 0) normal.multiplyScalar(-1);
    return normal;
  }

  function slice(inset, front, segments = PLAN_SEGMENTS) {
    const points = planPath(inset, segments);
    const epsilon = 1e-6;
    const pathRearZ = points.reduce((minimum, point) => Math.min(minimum, point.y), Infinity);
    // The aisle-side overhang sits just ahead of the nominal split, so use that
    // edge as its clipping line while preserving the same front/rear topology.
    const boundary = Math.max(L.kiosk.backSlab.z1, pathRearZ);
    const included = (point) => front
      ? point.y > boundary + epsilon
      : point.y < boundary - epsilon;
    let start = -1;
    for (let i = 0; i < points.length; i += 1) {
      const previous = points[(i - 1 + points.length) % points.length];
      if (included(points[i]) && !included(previous)) {
        start = i;
        break;
      }
    }
    if (start < 0) {
      const boundaryPoints = points.filter((point) => Math.abs(point.y - boundary) <= epsilon);
      return boundaryPoints.length >= 2
        ? boundaryPoints.map((point) => point.clone()).sort((a, b) => a.x - b.x)
        : points.slice();
    }

    const result = [];
    const previous = points[(start - 1 + points.length) % points.length];
    const first = points[start];
    result.push(intersectionAtZ(previous, first, boundary), first.clone());
    let i = (start + 1) % points.length;
    while (i !== start) {
      const point = points[i];
      if (!included(point)) {
        result.push(intersectionAtZ(points[(i - 1 + points.length) % points.length], point, boundary));
        break;
      }
      result.push(point.clone());
      i = (i + 1) % points.length;
    }
    return removeAdjacentDuplicates(result);
  }

  function innerPlanWithRearBay(points, bayX0, bayX1, bayBackZ) {
    const rearZ = L.kiosk.outer.z0 + L.kiosk.wall;
    const rearPoints = points
      .map((point, index) => ({ point, index }))
      .filter(({ point }) => Math.abs(point.y - rearZ) <= 1e-6);
    const west = rearPoints.reduce((best, entry) => (entry.point.x < best.point.x ? entry : best));
    const east = rearPoints.reduce((best, entry) => (entry.point.x > best.point.x ? entry : best));
    const bayDepth = rearZ - bayBackZ;
    const aroundFront = [];
    let index = (east.index + 1) % points.length;
    while (index !== west.index) {
      aroundFront.push(points[index].clone());
      index = (index + 1) % points.length;
    }
    return removeAdjacentDuplicates([
      west.point.clone(),
      new THREE.Vector2(bayX0, rearZ),
      new THREE.Vector2(bayX0 + bayDepth, bayBackZ),
      new THREE.Vector2(bayX1 - bayDepth, bayBackZ),
      new THREE.Vector2(bayX1, rearZ),
      east.point.clone(),
      ...aroundFront,
    ]);
  }

  function intersectionAtZ(a, b, z) {
    const dz = b.y - a.y;
    const t = Math.abs(dz) < 1e-8 ? 0 : THREE.MathUtils.clamp((z - a.y) / dz, 0, 1);
    return new THREE.Vector2(THREE.MathUtils.lerp(a.x, b.x, t), z);
  }

  function removeAdjacentDuplicates(points) {
    return points.filter((point, i) => i === 0 || point.distanceToSquared(points[i - 1]) > 1e-12);
  }

  function makeRingShape(outerPoints, innerPoints) {
    const shape = new THREE.Shape();
    shape.moveTo(outerPoints[0].x, -outerPoints[0].y);
    for (let i = 1; i < outerPoints.length; i += 1) shape.lineTo(outerPoints[i].x, -outerPoints[i].y);
    shape.closePath();

    const reversed = innerPoints.slice().reverse();
    const hole = new THREE.Path();
    hole.moveTo(reversed[0].x, -reversed[0].y);
    for (let i = 1; i < reversed.length; i += 1) hole.lineTo(reversed[i].x, -reversed[i].y);
    hole.closePath();
    shape.holes.push(hole);
    return shape;
  }

  function makeBandShape(outerPoints, innerPoints) {
    const polygon = outerPoints.concat(innerPoints.slice().reverse());
    const shape = new THREE.Shape();
    shape.moveTo(polygon[0].x, -polygon[0].y);
    for (let i = 1; i < polygon.length; i += 1) shape.lineTo(polygon[i].x, -polygon[i].y);
    shape.closePath();
    return shape;
  }

  function addRectangularHole(shape, centreX, centreZ, width, depth) {
    const x0 = centreX - width * 0.5;
    const x1 = centreX + width * 0.5;
    const z0 = centreZ - depth * 0.5;
    const z1 = centreZ + depth * 0.5;
    const outline = [
      new THREE.Vector2(x0, z0),
      new THREE.Vector2(x1, z0),
      new THREE.Vector2(x1, z1),
      new THREE.Vector2(x0, z1),
    ].reverse();
    const hole = new THREE.Path();
    hole.moveTo(outline[0].x, -outline[0].y);
    for (let i = 1; i < outline.length; i += 1) hole.lineTo(outline[i].x, -outline[i].y);
    hole.closePath();
    shape.holes.push(hole);
  }

  function mergeGeometryParts(parts) {
    const arrays = { position: [], normal: [], uv: [] };
    for (const { geometry, matrix = new THREE.Matrix4() } of parts) {
      const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry.clone();
      nonIndexed.applyMatrix4(matrix);
      for (const name of Object.keys(arrays)) {
        const attribute = nonIndexed.getAttribute(name);
        if (!attribute) throw new Error(`Cannot merge geometry without ${name}`);
        arrays[name].push(...attribute.array);
      }
      nonIndexed.dispose();
      geometry.dispose();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(arrays.position, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(arrays.normal, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(arrays.uv, 2));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  function composeMatrix(position, quaternion = new THREE.Quaternion(), scale = new THREE.Vector3(1, 1, 1)) {
    return new THREE.Matrix4().compose(position, quaternion, scale);
  }

  function extrudedMesh(name, shape, y0, y1, material) {
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: y1 - y0,
      bevelEnabled: false,
      curveSegments: 4,
      steps: 1,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    // Shape y stores -world-z; -PI/2 maps extrusion +z to world +y.
    mesh.rotation.x = -Math.PI * 0.5;
    mesh.position.y = y0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  function addMesh(name, geometry, material, { cast = true, receive = true } = {}) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    group.add(mesh);
    return mesh;
  }

  function setInstance(mesh, index, position, quaternion, scale) {
    const matrix = new THREE.Matrix4();
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
  }

  function quaternionFromEuler(x = 0, y = 0, z = 0) {
    return new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
  }

  const oakTexture = texClone('oakSlat', 1 / 0.36, 1 / 1.20);
  // The side-wall UVs are in metres: one tile per 0.36m around and 1.20m high.
  // The procedural slat motif itself is vertical, so its shadow gaps rise in V.
  const oakMaterial = matWith('oak', { map: oakTexture, roughness: 0.72 });
  const blackMaterial = matWith('blackMatte', { color: L.palette.black, roughness: 0.82 });
  const coralMaterial = matWith('coral', { color: L.palette.coral, roughness: 0.48, metalness: 0.12 });
  const worktopTexture = texClone('worktop', 2, 2);
  const worktopMaterial = matWith('worktop', { map: worktopTexture, roughness: 0.42 });
  const glassMaterial = matWith('glass', {
    color: 0xbfd8dd,
    transparent: true,
    opacity: 0.20,
    roughness: 0.06,
    metalness: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  // 1. Oak carcass, raised service face, and recessed toe kick.
  const outerPlan = planPath(0);
  const bayX0 = L.kiosk.outer.x0 + L.kiosk.outer.radius + 0.30;
  const bayX1 = L.kiosk.outer.x1 - L.kiosk.outer.radius - 0.30;
  const bayFrontZ = L.kiosk.backSlab.z1;
  const bayBackZ = L.kiosk.outer.z0 + 0.25;
  const bayDepth = bayFrontZ - bayBackZ;
  const innerPlan = innerPlanWithRearBay(planPath(L.kiosk.wall), bayX0, bayX1, bayBackZ);
  extrudedMesh(
    'kiosk.carcass',
    makeRingShape(outerPlan, innerPlan),
    L.kiosk.toeKick.h,
    L.kiosk.backTop - SLAB,
    oakMaterial,
  );

  const outerFrontRaiser = slice(0, true);
  const innerFrontRaiser = slice(L.kiosk.wall, true);
  extrudedMesh(
    'kiosk.frontRaiser',
    makeBandShape(outerFrontRaiser, innerFrontRaiser),
    L.kiosk.backTop - SLAB,
    L.kiosk.counterTop - SLAB,
    oakMaterial,
  );

  extrudedMesh(
    'kiosk.toeKick',
    makeRingShape(
      planPath(L.kiosk.toeKick.inset),
      planPath(L.kiosk.wall + L.kiosk.toeKick.inset),
    ),
    0,
    L.kiosk.toeKick.h,
    blackMaterial,
  );

  const bayFloorThickness = 0.025;
  const bayFullDepthX0 = bayX0 + bayDepth;
  const bayFullDepthX1 = bayX1 - bayDepth;
  const bayBackPanelDepth = 0.018;
  const bayBackPanelTop = L.kiosk.backTop - SLAB - 0.012;
  addMesh(
    'kiosk.bay.floorAndBack',
    mergeGeometryParts([
      {
        geometry: new THREE.BoxGeometry(bayX1 - bayX0, bayFloorThickness, bayDepth),
        matrix: composeMatrix(new THREE.Vector3(
          (bayX0 + bayX1) * 0.5,
          L.kiosk.toeKick.h + bayFloorThickness * 0.5,
          (bayFrontZ + bayBackZ) * 0.5,
        )),
      },
      {
        geometry: new THREE.BoxGeometry(
          bayFullDepthX1 - bayFullDepthX0,
          bayBackPanelTop - L.kiosk.toeKick.h,
          bayBackPanelDepth,
        ),
        matrix: composeMatrix(new THREE.Vector3(
          (bayFullDepthX0 + bayFullDepthX1) * 0.5,
          (L.kiosk.toeKick.h + bayBackPanelTop) * 0.5,
          bayBackZ + bayBackPanelDepth * 0.5 + 0.002,
        )),
      },
    ]),
    blackMaterial,
  );
  // Bay usable volume (current layout): x -4.60..3.40, z -2.35..-1.85, floor y 0.10.

  // 2. Front and rear composite worktops with a manufactured bullnose.
  const outerFrontWorktop = slice(-OVERHANG, true);
  const innerFrontWorktop = slice(L.kiosk.wall + OVERHANG, true);
  const outerRearWorktop = slice(-OVERHANG, false);
  const innerRearWorktop = slice(L.kiosk.wall + OVERHANG, false);
  extrudedMesh(
    'kiosk.worktop.front',
    makeBandShape(outerFrontWorktop, innerFrontWorktop),
    L.kiosk.counterTop - SLAB,
    L.kiosk.counterTop,
    worktopMaterial,
  );

  const rearWorktopShape = makeBandShape(outerRearWorktop, innerRearWorktop);
  addRectangularHole(
    rearWorktopShape,
    L.back.sink.x,
    L.back.sink.z,
    SINK_CUTOUT_WIDTH,
    SINK_CUTOUT_DEPTH,
  );
  addRectangularHole(
    rearWorktopShape,
    L.back.iceWell.x,
    L.back.iceWell.z,
    ICE_WELL_CUTOUT_WIDTH,
    ICE_WELL_CUTOUT_DEPTH,
  );
  // Both holes stay inside the rear band without touching an edge. In particular,
  // the sink spans x 3.67..4.13 before the straight rear run ends at x 4.20.
  extrudedMesh(
    'kiosk.worktop.rear',
    rearWorktopShape,
    L.kiosk.backTop - SLAB,
    L.kiosk.backTop,
    worktopMaterial,
  );

  const bullnoseRadius = 0.020;
  const frontCurvePoints = outerFrontWorktop.map((point, index) => {
    const normal = outwardNormal(outerFrontWorktop, index, false);
    return new THREE.Vector3(
      point.x - normal.x * bullnoseRadius,
      L.kiosk.counterTop - bullnoseRadius,
      point.y - normal.y * bullnoseRadius,
    );
  });
  const rearStraightX0 = L.kiosk.outer.x0 + L.kiosk.outer.radius;
  const rearStraightX1 = L.kiosk.outer.x1 - L.kiosk.outer.radius;
  const rearInnerEdgeZ = L.kiosk.outer.z0 + L.kiosk.wall + OVERHANG;
  addMesh(
    'kiosk.worktop.bullnoses',
    mergeGeometryParts([
      {
        geometry: new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(frontCurvePoints, false, 'centripetal'),
          96,
          bullnoseRadius,
          6,
          false,
        ),
      },
      {
        geometry: new THREE.TubeGeometry(
          new THREE.LineCurve3(
            new THREE.Vector3(
              rearStraightX0 + bullnoseRadius,
              L.kiosk.backTop - bullnoseRadius,
              rearInnerEdgeZ + bullnoseRadius,
            ),
            new THREE.Vector3(
              rearStraightX1 - bullnoseRadius,
              L.kiosk.backTop - bullnoseRadius,
              rearInnerEdgeZ + bullnoseRadius,
            ),
          ),
          48,
          bullnoseRadius,
          6,
          false,
        ),
      },
    ]),
    worktopMaterial,
  );

  // 3. Signature mural ribbon around the west nose.
  const muralSource = planPath(0);
  const muralLimit = L.kiosk.outer.x0 + L.kiosk.outer.radius;
  const muralPoints = muralSource.filter((point) => point.x <= muralLimit + 1e-6);
  const muralBottom = L.kiosk.toeKick.h;
  const muralTop = L.kiosk.counterTop - SLAB;
  const muralHeight = muralTop - muralBottom;
  const muralPositions = [];
  const muralNormals = [];
  const muralUvs = [];
  const muralIndices = [];
  const { cumulative: muralLengths, total: totalMuralLength } = pathLengths(muralPoints, false);
  const muralLength = totalMuralLength || 1;
  // About six square tiles keep the leaves at their drawn proportions, roughly 40 cm in world scale.
  const muralTiles = Math.max(1, Math.round(totalMuralLength / muralHeight));
  for (let i = 0; i < muralPoints.length; i += 1) {
    const normal = outwardNormal(muralPoints, i, false);
    const x = muralPoints[i].x + normal.x * 0.006;
    const z = muralPoints[i].y + normal.y * 0.006;
    muralPositions.push(x, muralBottom, z, x, muralTop, z);
    muralNormals.push(normal.x, 0, normal.y, normal.x, 0, normal.y);
    const u = (muralLengths[i] / muralLength) * muralTiles;
    muralUvs.push(u, 0, u, 1);
    if (i < muralPoints.length - 1) {
      const bottom = i * 2;
      const top = bottom + 1;
      const nextBottom = bottom + 2;
      const nextTop = bottom + 3;
      muralIndices.push(bottom, top, nextBottom, nextBottom, top, nextTop);
    }
  }
  const muralGeometry = new THREE.BufferGeometry();
  muralGeometry.setAttribute('position', new THREE.Float32BufferAttribute(muralPositions, 3));
  muralGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(muralNormals, 3));
  muralGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(muralUvs, 2));
  muralGeometry.setIndex(muralIndices);
  muralGeometry.computeBoundingSphere();
  const muralTexture = texClone('mural', 1, 1);
  if (muralTexture) {
    muralTexture.wrapS = THREE.RepeatWrapping;
    muralTexture.wrapT = THREE.ClampToEdgeWrapping;
    muralTexture.repeat.set(1, 1);
    muralTexture.needsUpdate = true;
  }
  addMesh('kiosk.mural', muralGeometry, matWith('mural', { map: muralTexture, roughness: 0.68 }));

  // 4. Coral arch: vertical feet and upper branch are one continuous tube.
  const archPoints = [new THREE.Vector3(L.arch.x, 0, L.arch.z0)];
  const archSamples = 64;
  for (let i = 0; i <= archSamples; i += 1) {
    const z = THREE.MathUtils.lerp(L.arch.z0, L.arch.z1, i / archSamples);
    const radial = Math.max(0, L.arch.r * L.arch.r - (z - L.arch.cz) ** 2);
    archPoints.push(new THREE.Vector3(L.arch.x, L.arch.cy + Math.sqrt(radial), z));
  }
  archPoints.push(new THREE.Vector3(L.arch.x, 0, L.arch.z1));
  const archCurve = new THREE.CatmullRomCurve3(archPoints, false, 'centripetal');
  addMesh(
    'kiosk.arch',
    new THREE.TubeGeometry(archCurve, 96, L.arch.tube, 8, false),
    coralMaterial,
  );

  const plateMaterial = matWith('steel', { color: 0x6f747a, roughness: 0.55, metalness: 0.65 });
  const archPlates = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.07, 0.07, 0.012, 12),
    plateMaterial,
    2,
  );
  archPlates.name = 'kiosk.arch.basePlates';
  archPlates.castShadow = false;
  archPlates.receiveShadow = true;
  setInstance(archPlates, 0, new THREE.Vector3(L.arch.x, 0.006, L.arch.z0), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
  setInstance(archPlates, 1, new THREE.Vector3(L.arch.x, 0.006, L.arch.z1), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
  archPlates.instanceMatrix.needsUpdate = true;
  group.add(archPlates);

  // 5. Coral queue rails.
  const gap = L.rails.a.gap;
  const hasRailAGap = Number.isFinite(gap?.x0)
    && Number.isFinite(gap?.x1)
    && gap.x0 > L.rails.a.x0
    && gap.x1 < L.rails.a.x1
    && gap.x0 < gap.x1;
  const railASegments = hasRailAGap
    ? [[L.rails.a.x0, gap.x0], [gap.x1, L.rails.a.x1]]
    : [[L.rails.a.x0, L.rails.a.x1]];
  railASegments.forEach(([x0, x1], index) => {
    addMesh(
      index === 0 ? 'kiosk.railA.top' : 'kiosk.railA.top.east',
      new THREE.TubeGeometry(
        new THREE.LineCurve3(
          new THREE.Vector3(x0, L.rails.a.y, L.rails.a.z),
          new THREE.Vector3(x1, L.rails.a.y, L.rails.a.z),
        ),
        48,
        L.arch.tube,
        8,
        false,
      ),
      coralMaterial,
    );
  });

  const railAPostXs = railASegments.flatMap(([x0, x1]) => {
    const intervals = Math.max(1, Math.ceil((x1 - x0) / 1.6));
    return Array.from(
      { length: intervals + 1 },
      (_, i) => (i === intervals ? x1 : THREE.MathUtils.lerp(x0, x1, i / intervals)),
    );
  });
  const railAPostCount = railAPostXs.length;
  const railAPosts = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(1, 1, 1, 12),
    coralMaterial,
    railAPostCount,
  );
  railAPosts.name = 'kiosk.railA.posts';
  railAPosts.castShadow = true;
  railAPosts.receiveShadow = true;
  const railAPlates = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(1, 1, 1, 12),
    plateMaterial,
    railAPostCount,
  );
  railAPlates.name = 'kiosk.railA.basePlates';
  railAPlates.castShadow = false;
  railAPlates.receiveShadow = true;
  for (let i = 0; i < railAPostCount; i += 1) {
    const x = railAPostXs[i];
    setInstance(
      railAPosts,
      i,
      new THREE.Vector3(x, L.rails.a.y * 0.5, L.rails.a.z),
      new THREE.Quaternion(),
      new THREE.Vector3(L.arch.tube, L.rails.a.y, L.arch.tube),
    );
    setInstance(
      railAPlates,
      i,
      new THREE.Vector3(x, 0.005, L.rails.a.z),
      new THREE.Quaternion(),
      new THREE.Vector3(0.06, 0.010, 0.06),
    );
  }
  railAPosts.instanceMatrix.needsUpdate = true;
  railAPlates.instanceMatrix.needsUpdate = true;
  group.add(railAPosts, railAPlates);

  const bend = Math.min(0.10, (L.rails.b.x1 - L.rails.b.x0) * 0.1, (L.rails.b.z1 - L.rails.b.z0) * 0.1);
  const railBPoints = [
    new THREE.Vector3(L.rails.b.x0, L.rails.b.y, L.rails.b.z0),
    new THREE.Vector3(L.rails.b.x1 - bend, L.rails.b.y, L.rails.b.z0),
    new THREE.Vector3(L.rails.b.x1 - bend * 0.25, L.rails.b.y, L.rails.b.z0),
    new THREE.Vector3(L.rails.b.x1, L.rails.b.y, L.rails.b.z0 + bend * 0.25),
    new THREE.Vector3(L.rails.b.x1, L.rails.b.y, L.rails.b.z0 + bend),
    new THREE.Vector3(L.rails.b.x1, L.rails.b.y, L.rails.b.z1 - bend),
    new THREE.Vector3(L.rails.b.x1, L.rails.b.y, L.rails.b.z1 - bend * 0.25),
    new THREE.Vector3(L.rails.b.x1 - bend * 0.25, L.rails.b.y, L.rails.b.z1),
    new THREE.Vector3(L.rails.b.x1 - bend, L.rails.b.y, L.rails.b.z1),
    new THREE.Vector3(L.rails.b.x0, L.rails.b.y, L.rails.b.z1),
  ];
  const railBCurve = new THREE.CatmullRomCurve3(railBPoints, false, 'centripetal');
  addMesh(
    'kiosk.railB.top',
    new THREE.TubeGeometry(railBCurve, 64, L.arch.tube, 8, false),
    coralMaterial,
  );

  const railBIntervals = Math.max(1, Math.ceil(railBCurve.getLength() / 1.6));
  const railBPostCount = railBIntervals + 1;
  const railBPosts = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(1, 1, 1, 12),
    coralMaterial,
    railBPostCount,
  );
  railBPosts.name = 'kiosk.railB.posts';
  railBPosts.castShadow = true;
  railBPosts.receiveShadow = true;
  const railBPlates = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(1, 1, 1, 12),
    plateMaterial,
    railBPostCount,
  );
  railBPlates.name = 'kiosk.railB.basePlates';
  railBPlates.castShadow = false;
  railBPlates.receiveShadow = true;
  for (let i = 0; i < railBPostCount; i += 1) {
    const point = railBCurve.getPointAt(i / railBIntervals);
    setInstance(
      railBPosts,
      i,
      new THREE.Vector3(point.x, L.rails.b.y * 0.5, point.z),
      new THREE.Quaternion(),
      new THREE.Vector3(L.arch.tube, L.rails.b.y, L.arch.tube),
    );
    setInstance(
      railBPlates,
      i,
      new THREE.Vector3(point.x, 0.005, point.z),
      new THREE.Quaternion(),
      new THREE.Vector3(0.06, 0.010, 0.06),
    );
  }
  railBPosts.instanceMatrix.needsUpdate = true;
  railBPlates.instanceMatrix.needsUpdate = true;
  group.add(railBPosts, railBPlates);

  // 6. Matte fascia, hanging rods, wordmark, and proud illuminated roundel.
  const fasciaDepth = 0.32;
  const fasciaBand = addMesh(
    'kiosk.fascia.band',
    new THREE.BoxGeometry(L.fascia.x1 - L.fascia.x0, L.fascia.y1 - L.fascia.y0, fasciaDepth),
    blackMaterial,
  );
  fasciaBand.position.set(
    (L.fascia.x0 + L.fascia.x1) * 0.5,
    (L.fascia.y0 + L.fascia.y1) * 0.5,
    L.fascia.z - fasciaDepth * 0.5,
  );

  const rodCount = 4;
  const rodHeight = L.terminal.ceiling - L.fascia.y1;
  const rods = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.012, 0.012, rodHeight, 8),
    blackMaterial,
    rodCount,
  );
  rods.name = 'kiosk.fascia.dropRods';
  rods.castShadow = true;
  rods.receiveShadow = true;
  for (let i = 0; i < rodCount; i += 1) {
    const x = THREE.MathUtils.lerp(L.fascia.x0, L.fascia.x1, (i + 0.5) / rodCount);
    setInstance(
      rods,
      i,
      new THREE.Vector3(x, L.fascia.y1 + rodHeight * 0.5, L.fascia.z - fasciaDepth * 0.5),
      new THREE.Quaternion(),
      new THREE.Vector3(1, 1, 1),
    );
  }
  rods.instanceMatrix.needsUpdate = true;
  group.add(rods);

  const wordTexture = texClone('fasciaWordmark', 1, 1);
  if (wordTexture) {
    wordTexture.wrapS = THREE.ClampToEdgeWrapping;
    wordTexture.wrapT = THREE.ClampToEdgeWrapping;
    wordTexture.needsUpdate = true;
  }
  const wordHeight = Math.min(0.70, L.fascia.y1 - L.fascia.y0 - 0.06);
  const wordWidth = wordHeight * 4;
  const wordmark = addMesh(
    'kiosk.fascia.wordmark',
    new THREE.PlaneGeometry(wordWidth, wordHeight),
    matWith('screen', {
      map: wordTexture,
      emissiveMap: wordTexture,
      emissive: 0xffffff,
      emissiveIntensity: 0.55,
      transparent: true,
      alphaTest: 0.02,
      depthWrite: false,
      toneMapped: false,
    }),
    { cast: false, receive: false },
  );
  wordmark.position.set(L.fascia.wordX, (L.fascia.y0 + L.fascia.y1) * 0.5, L.fascia.z + 0.006);

  const roundelDepth = Math.max(0.02, 2 * (L.fascia.roundel.z - L.fascia.z));
  const roundelBody = addMesh(
    'kiosk.fascia.roundelBody',
    new THREE.CylinderGeometry(L.fascia.roundel.r, L.fascia.roundel.r, roundelDepth, 16),
    matWith('greenSign', { color: L.palette.green, roughness: 0.38 }),
  );
  roundelBody.rotation.x = Math.PI * 0.5;
  roundelBody.position.set(L.fascia.roundel.x, L.fascia.roundel.y, L.fascia.roundel.z);

  const roundelTexture = texClone('roundel', 1, 1);
  if (roundelTexture) {
    roundelTexture.wrapS = THREE.ClampToEdgeWrapping;
    roundelTexture.wrapT = THREE.ClampToEdgeWrapping;
    roundelTexture.needsUpdate = true;
  }
  const roundelCap = addMesh(
    'kiosk.fascia.roundelCap',
    new THREE.CircleGeometry(L.fascia.roundel.r * 0.995, 24),
    matWith('screen', {
      map: roundelTexture,
      emissiveMap: roundelTexture,
      emissive: 0xffffff,
      emissiveIntensity: 0.55,
      transparent: true,
      alphaTest: 0.02,
      depthWrite: false,
      toneMapped: false,
    }),
    { cast: false, receive: false },
  );
  roundelCap.position.set(
    L.fascia.roundel.x,
    L.fascia.roundel.y,
    L.fascia.roundel.z + roundelDepth * 0.5 + 0.001,
  );

  // 7. Menu wall. Each screen owns its material/texture clone and pivots locally.
  const menuX0 = Math.min(...L.menu.panels.map((panel) => panel.x0));
  const menuX1 = Math.max(...L.menu.panels.map((panel) => panel.x1));
  const menuY0 = Math.min(...L.menu.panels.map((panel) => panel.y0));
  const menuBulkheadY0 = menuY0 - 0.08;
  const menuBulkheadDepth = 0.07;
  const menuBulkhead = addMesh(
    'kiosk.menu.bulkhead',
    new THREE.BoxGeometry(
      menuX1 - menuX0 + 0.20,
      L.fascia.y0 - menuBulkheadY0,
      menuBulkheadDepth,
    ),
    blackMaterial,
  );
  menuBulkhead.position.set(
    (menuX0 + menuX1) * 0.5,
    (menuBulkheadY0 + L.fascia.y0) * 0.5,
    L.menu.z - 0.055,
  );

  const menuBorder = 0.035;
  const menuBezels = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    blackMaterial,
    L.menu.panels.length,
  );
  menuBezels.name = 'kiosk.menu.bezels';
  menuBezels.castShadow = true;
  menuBezels.receiveShadow = true;
  for (let panelIndex = 0; panelIndex < L.menu.panels.length; panelIndex += 1) {
    const panel = L.menu.panels[panelIndex];
    const panelGroup = new THREE.Group();
    panelGroup.name = `kiosk.menu.${panel.id}`;
    // A positive X rotation tips a +Z-facing screen normal down toward the customer.
    panelGroup.rotation.x = Math.abs(L.menu.tilt);
    // Oversize panels mount proud of the fascia instead of intersecting its band.
    const panelZ = panel.y1 > L.fascia.y0 ? L.fascia.z + 0.02 : L.menu.z;
    panelGroup.position.set(
      (panel.x0 + panel.x1) * 0.5,
      (panel.y0 + panel.y1) * 0.5,
      panelZ,
    );

    const width = panel.x1 - panel.x0;
    const height = panel.y1 - panel.y0;
    const panelRotation = quaternionFromEuler(panelGroup.rotation.x, 0, 0);
    const bezelOffset = new THREE.Vector3(0, 0, -0.025).applyQuaternion(panelRotation);
    setInstance(
      menuBezels,
      panelIndex,
      panelGroup.position.clone().add(bezelOffset),
      panelRotation,
      new THREE.Vector3(width + menuBorder * 2, height + menuBorder * 2, 0.05),
    );

    const screenTexture = texClone(panel.tex, 1, 1);
    if (screenTexture) {
      screenTexture.wrapS = THREE.ClampToEdgeWrapping;
      screenTexture.wrapT = THREE.ClampToEdgeWrapping;
      screenTexture.needsUpdate = true;
    }
    const screenMaterial = matWith('screen', {
      map: screenTexture,
      emissiveMap: screenTexture,
      emissive: 0xffffff,
      emissiveIntensity: 0.9,
      toneMapped: false,
    });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(width, height), screenMaterial);
    screen.name = `kiosk.menu.${panel.id}.screen`;
    screen.position.z = 0.002;
    screen.castShadow = false;
    screen.receiveShadow = false;
    panelGroup.add(screen);
    group.add(panelGroup);
  }
  menuBezels.instanceMatrix.needsUpdate = true;
  group.add(menuBezels);

  const menuSpill = new THREE.PointLight(0xe8f0ff, 9, 5.0, 2);
  menuSpill.name = 'kiosk.menu.lightSpill';
  menuSpill.position.set((menuX0 + menuX1) * 0.5, menuY0 + 0.05, L.menu.z + 0.55);
  menuSpill.castShadow = false;
  group.add(menuSpill);

  // 8a. Cake stand, four small tarts, and a transparent glass dome.
  const cake = L.front.cakeStand;
  const pedestalPoints = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.11, 0),
    new THREE.Vector2(0.12, 0.018),
    new THREE.Vector2(0.052, 0.035),
    new THREE.Vector2(0.035, 0.11),
    new THREE.Vector2(0.055, 0.15),
    new THREE.Vector2(0.15, 0.17),
    new THREE.Vector2(0.15, 0.188),
    new THREE.Vector2(0, 0.188),
  ];
  const pedestal = addMesh(
    'kiosk.cakeStand.pedestal',
    new THREE.LatheGeometry(pedestalPoints, 12),
    worktopMaterial,
  );
  pedestal.position.set(cake.x, L.kiosk.counterTop, cake.z);

  const tartCount = 4;
  const tarts = new THREE.InstancedMesh(
    makeTartGeometry(),
    matWith('cardboard', { color: 0xffffff, roughness: 0.88, vertexColors: true }),
    tartCount,
  );
  tarts.name = 'kiosk.cakeStand.tarts';
  tarts.castShadow = false;
  tarts.receiveShadow = true;
  const tartOffsets = [
    [-0.072, -0.045], [0.052, -0.055], [-0.052, 0.052], [0.066, 0.044],
  ];
  for (let i = 0; i < tartCount; i += 1) {
    const [dx, dz] = tartOffsets[i];
    setInstance(
      tarts,
      i,
      new THREE.Vector3(cake.x + dx, L.kiosk.counterTop + 0.1875, cake.z + dz),
      new THREE.Quaternion(),
      new THREE.Vector3(1, 1, 1),
    );
  }
  tarts.instanceMatrix.needsUpdate = true;
  group.add(tarts);

  addMesh(
    'kiosk.cakeStand.domeAndKnob',
    mergeGeometryParts([
      {
        geometry: new THREE.SphereGeometry(0.17, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.5),
        matrix: composeMatrix(
          new THREE.Vector3(cake.x, L.kiosk.counterTop + 0.195, cake.z),
          new THREE.Quaternion(),
          new THREE.Vector3(1, 1.45, 1),
        ),
      },
      {
        geometry: new THREE.SphereGeometry(0.026, 10, 6),
        matrix: composeMatrix(new THREE.Vector3(
          cake.x,
          L.kiosk.counterTop + 0.195 + 0.17 * 1.45 + 0.018,
          cake.z,
        )),
      },
    ]),
    glassMaterial,
  );

  // 8b. Lit pastry cabinet: instanced frame, glass, rack wire and four food types.
  const pastry = L.front.pastryCase;
  const caseX = (pastry.x0 + pastry.x1) * 0.5;
  const caseZ = (pastry.z0 + pastry.z1) * 0.5;
  const caseW = pastry.x1 - pastry.x0;
  const caseD = pastry.z1 - pastry.z0;
  const caseBottom = L.kiosk.counterTop;
  const caseHeight = 0.72;
  const caseTop = caseBottom + caseHeight;
  const frameParts = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    blackMaterial,
    6,
  );
  frameParts.name = 'kiosk.pastryCase.frame';
  frameParts.castShadow = true;
  frameParts.receiveShadow = true;
  const post = 0.035;
  const slab = 0.045;
  const frameData = [
    [caseX, caseBottom + slab * 0.5, caseZ, caseW, slab, caseD],
    [caseX, caseTop - slab * 0.5, caseZ, caseW, slab, caseD],
    [pastry.x0 + post * 0.5, caseBottom + caseHeight * 0.5, pastry.z0 + post * 0.5, post, caseHeight, post],
    [pastry.x1 - post * 0.5, caseBottom + caseHeight * 0.5, pastry.z0 + post * 0.5, post, caseHeight, post],
    [pastry.x0 + post * 0.5, caseBottom + caseHeight * 0.5, pastry.z1 - post * 0.5, post, caseHeight, post],
    [pastry.x1 - post * 0.5, caseBottom + caseHeight * 0.5, pastry.z1 - post * 0.5, post, caseHeight, post],
  ];
  frameData.forEach(([x, y, z, sx, sy, sz], i) => {
    setInstance(frameParts, i, new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
  });
  frameParts.instanceMatrix.needsUpdate = true;
  group.add(frameParts);

  const shelfYs = [caseBottom + 0.16, caseBottom + 0.35, caseBottom + 0.54];
  const glassPanels = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    glassMaterial,
    6,
  );
  glassPanels.name = 'kiosk.pastryCase.glass';
  glassPanels.castShadow = false;
  glassPanels.receiveShadow = true;
  setInstance(
    glassPanels,
    0,
    new THREE.Vector3(caseX, caseBottom + caseHeight * 0.5, pastry.z1 - 0.004),
    new THREE.Quaternion(),
    new THREE.Vector3(caseW - post * 2, caseHeight - slab * 2, 1),
  );
  setInstance(
    glassPanels,
    1,
    new THREE.Vector3(pastry.x0 + 0.004, caseBottom + caseHeight * 0.5, caseZ),
    quaternionFromEuler(0, Math.PI * 0.5, 0),
    new THREE.Vector3(caseD - post * 2, caseHeight - slab * 2, 1),
  );
  setInstance(
    glassPanels,
    2,
    new THREE.Vector3(pastry.x1 - 0.004, caseBottom + caseHeight * 0.5, caseZ),
    quaternionFromEuler(0, -Math.PI * 0.5, 0),
    new THREE.Vector3(caseD - post * 2, caseHeight - slab * 2, 1),
  );
  shelfYs.forEach((y, i) => {
    setInstance(
      glassPanels,
      i + 3,
      new THREE.Vector3(caseX, y, caseZ),
      quaternionFromEuler(-Math.PI * 0.5, 0, 0),
      new THREE.Vector3(caseW - post * 2, caseD - post * 2, 1),
    );
  });
  glassPanels.instanceMatrix.needsUpdate = true;
  group.add(glassPanels);

  const barsPerShelf = 9;
  const crossBarsPerShelf = 2;
  const totalBars = shelfYs.length * (barsPerShelf + crossBarsPerShelf);
  const rackBars = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.004, 0.004, 1, 6),
    blackMaterial,
    totalBars,
  );
  rackBars.name = 'kiosk.pastryCase.wireRacks';
  rackBars.castShadow = false;
  rackBars.receiveShadow = true;
  let barIndex = 0;
  for (const y of shelfYs) {
    for (let i = 0; i < barsPerShelf; i += 1) {
      const z = THREE.MathUtils.lerp(pastry.z0 + 0.06, pastry.z1 - 0.06, i / (barsPerShelf - 1));
      setInstance(
        rackBars,
        barIndex,
        new THREE.Vector3(caseX, y + 0.006, z),
        quaternionFromEuler(0, 0, Math.PI * 0.5),
        new THREE.Vector3(1, caseW - 0.10, 1),
      );
      barIndex += 1;
    }
    for (let i = 0; i < crossBarsPerShelf; i += 1) {
      const x = THREE.MathUtils.lerp(pastry.x0 + 0.10, pastry.x1 - 0.10, (i + 0.5) / crossBarsPerShelf);
      setInstance(
        rackBars,
        barIndex,
        new THREE.Vector3(x, y + 0.008, caseZ),
        quaternionFromEuler(Math.PI * 0.5, 0, 0),
        new THREE.Vector3(1, caseD - 0.10, 1),
      );
      barIndex += 1;
    }
  }
  rackBars.instanceMatrix.needsUpdate = true;
  group.add(rackBars);

  const glowMaterial = matWith('screen', {
    color: 0xffd6a0,
    emissive: 0xffb66b,
    emissiveIntensity: 1.2,
    toneMapped: false,
  });
  const glowStrip = addMesh(
    'kiosk.pastryCase.glowStrip',
    new THREE.BoxGeometry(caseW - 0.12, 0.018, 0.026),
    glowMaterial,
    { cast: false, receive: false },
  );
  glowStrip.position.set(caseX, caseTop - slab - 0.016, pastry.z1 - 0.07);

  const croissantRadius = 0.065;
  const croissantArc = Math.PI * 1.48;
  const croissantGeometry = new THREE.TorusGeometry(croissantRadius, 0.024, 6, 10, croissantArc);
  const croissantPosition = croissantGeometry.getAttribute('position');
  const taperLength = croissantArc * 0.20;
  for (let i = 0; i < croissantPosition.count; i += 1) {
    const x = croissantPosition.getX(i);
    const y = croissantPosition.getY(i);
    const z = croissantPosition.getZ(i);
    let arcAngle = Math.atan2(y, x);
    if (arcAngle < 0) arcAngle += Math.PI * 2;
    arcAngle = THREE.MathUtils.clamp(arcAngle, 0, croissantArc);
    const distanceFromEnd = Math.min(arcAngle, croissantArc - arcAngle);
    const taper = THREE.MathUtils.lerp(
      0.16,
      1,
      THREE.MathUtils.smoothstep(distanceFromEnd, 0, taperLength),
    );
    const centreX = Math.cos(arcAngle) * croissantRadius;
    const centreY = Math.sin(arcAngle) * croissantRadius;
    croissantPosition.setXYZ(
      i,
      centreX + (x - centreX) * taper,
      centreY + (y - centreY) * taper,
      z * taper,
    );
  }
  croissantPosition.needsUpdate = true;
  croissantGeometry.computeVertexNormals();
  croissantGeometry.rotateX(Math.PI * 0.5);
  const painGeometry = new THREE.CapsuleGeometry(0.04, 0.085, 3, 8);
  painGeometry.rotateZ(Math.PI * 0.5);
  const painPosition = painGeometry.getAttribute('position');
  const painColors = [];
  for (let i = 0; i < painPosition.count; i += 1) {
    const stripe = Math.abs(Math.abs(painPosition.getX(i)) - 0.030) < 0.014;
    const color = new THREE.Color(stripe ? 0x4b281d : 0x92552f);
    painColors.push(color.r, color.g, color.b);
  }
  painGeometry.setAttribute('color', new THREE.Float32BufferAttribute(painColors, 3));
  const muffinGeometry = makeMuffinGeometry();
  const sliceGeometry = makeSliceGeometry();
  const pastrySpecs = [
    {
      name: 'croissants', count: 4, geometry: croissantGeometry,
      material: matWith('cardboard', { color: 0xd39145, roughness: 0.88 }), baseY: 0.030,
    },
    {
      name: 'painAuChocolat', count: 4, geometry: painGeometry,
      material: matWith('cardboard', { color: 0xffffff, roughness: 0.9, vertexColors: true }), baseY: 0.038,
    },
    {
      name: 'muffins', count: 4, geometry: muffinGeometry,
      material: matWith('cardboard', { color: 0xffffff, roughness: 0.92, vertexColors: true }), baseY: 0,
    },
    {
      name: 'trayBakeSlices', count: 3, geometry: sliceGeometry,
      material: matWith('cardboard', { color: 0xffffff, roughness: 0.9, vertexColors: true }), baseY: 0.028,
    },
  ];
  let pastryOrdinal = 0;
  const pastryPlacements = shelfYs.map(() => []);
  const minimumPastrySeparationSq = 0.09 ** 2;
  for (const spec of pastrySpecs) {
    const mesh = new THREE.InstancedMesh(spec.geometry, spec.material, spec.count);
    mesh.name = `kiosk.pastryCase.${spec.name}`;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    for (let i = 0; i < spec.count; i += 1) {
      let shelfIndex = 0;
      let x = 0;
      let z = 0;
      let separated = false;
      for (let attempt = 0; attempt <= 8; attempt += 1) {
        shelfIndex = (pastryOrdinal + Math.floor(rng() * shelfYs.length)) % shelfYs.length;
        x = THREE.MathUtils.lerp(pastry.x0 + 0.13, pastry.x1 - 0.13, rng());
        z = THREE.MathUtils.lerp(pastry.z0 + 0.10, pastry.z1 - 0.10, rng());
        separated = pastryPlacements[shelfIndex].every((placed) => (
          (placed.x - x) ** 2 + (placed.z - z) ** 2 >= minimumPastrySeparationSq
        ));
        if (separated) break;
      }
      if (!separated) {
        const fallback = findPastryFallback(pastryPlacements, pastry, pastryOrdinal);
        ({ shelfIndex, x, z } = fallback);
      }
      pastryPlacements[shelfIndex].push({ x, z });
      const angle = (rng() - 0.5) * Math.PI * 0.7;
      const scale = 0.88 + rng() * 0.22;
      setInstance(
        mesh,
        i,
        new THREE.Vector3(x, shelfYs[shelfIndex] + 0.012 + spec.baseY, z),
        quaternionFromEuler(0, angle, 0),
        new THREE.Vector3(scale, 0.92 + rng() * 0.14, scale),
      );
      pastryOrdinal += 1;
    }
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }

  // 8c. Compact oak napkin/condiment caddy with readable compartment props.
  const caddy = L.front.caddy;
  const caddyW = 0.34;
  const caddyD = 0.22;
  const caddyH = 0.12;
  const caddyParts = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    oakMaterial,
    7,
  );
  caddyParts.name = 'kiosk.caddy.box';
  caddyParts.castShadow = false;
  caddyParts.receiveShadow = true;
  const caddyPartData = [
    [caddy.x, L.kiosk.counterTop + 0.012, caddy.z, caddyW, 0.024, caddyD],
    [caddy.x - caddyW * 0.5 + 0.012, L.kiosk.counterTop + caddyH * 0.5, caddy.z, 0.024, caddyH, caddyD],
    [caddy.x + caddyW * 0.5 - 0.012, L.kiosk.counterTop + caddyH * 0.5, caddy.z, 0.024, caddyH, caddyD],
    [caddy.x, L.kiosk.counterTop + caddyH * 0.5, caddy.z - caddyD * 0.5 + 0.012, caddyW, caddyH, 0.024],
    [caddy.x, L.kiosk.counterTop + caddyH * 0.5, caddy.z + caddyD * 0.5 - 0.012, caddyW, caddyH, 0.024],
    [caddy.x + 0.035, L.kiosk.counterTop + caddyH * 0.5, caddy.z, 0.018, caddyH, caddyD - 0.03],
    [caddy.x - 0.065, L.kiosk.counterTop + 0.052, caddy.z, 0.12, 0.045, 0.15],
  ];
  caddyPartData.forEach(([x, y, z, sx, sy, sz], i) => {
    setInstance(caddyParts, i, new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
    caddyParts.setColorAt(i, new THREE.Color(i === caddyPartData.length - 1 ? 0xf7f4ed : 0xffffff));
  });
  caddyParts.instanceMatrix.needsUpdate = true;
  if (caddyParts.instanceColor) caddyParts.instanceColor.needsUpdate = true;
  group.add(caddyParts);

  const caddyPropCount = 10;
  const caddyProps = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(1, 1, 1, 8),
    matWith('cardboard', { color: 0xffffff, roughness: 0.86, vertexColors: true }),
    caddyPropCount,
  );
  caddyProps.name = 'kiosk.caddy.stirrersAndSugar';
  caddyProps.castShadow = false;
  caddyProps.receiveShadow = true;
  for (let i = 0; i < caddyPropCount; i += 1) {
    const isTube = i < 2;
    const x = isTube
      ? caddy.x + 0.075 + i * 0.055
      : caddy.x + 0.045 + ((i - 2) % 4) * 0.027;
    const z = isTube ? caddy.z - 0.035 : caddy.z + 0.052 + Math.floor((i - 2) / 4) * 0.020;
    const height = isTube ? 0.17 : 0.095;
    const radius = isTube ? 0.022 : 0.006;
    setInstance(
      caddyProps,
      i,
      new THREE.Vector3(x, L.kiosk.counterTop + height * 0.5 + 0.024, z),
      new THREE.Quaternion(),
      new THREE.Vector3(radius, height, radius),
    );
    caddyProps.setColorAt(i, new THREE.Color(isTube || i % 2 === 0 ? 0x9b7043 : 0xf2eee5));
  }
  caddyProps.instanceMatrix.needsUpdate = true;
  if (caddyProps.instanceColor) caddyProps.instanceColor.needsUpdate = true;
  group.add(caddyProps);

  function findPastryFallback(placements, bounds, ordinal) {
    const x0 = bounds.x0 + 0.13;
    const x1 = bounds.x1 - 0.13;
    const z0 = bounds.z0 + 0.10;
    const z1 = bounds.z1 - 0.10;
    const columns = Math.max(2, Math.floor((x1 - x0) / 0.10) + 1);
    const rows = Math.max(2, Math.floor((z1 - z0) / 0.10) + 1);
    const candidateCount = shelfYs.length * columns * rows;
    for (let offset = 0; offset < candidateCount; offset += 1) {
      const candidateIndex = (ordinal * 7 + offset) % candidateCount;
      const shelfIndex = candidateIndex % shelfYs.length;
      const cell = Math.floor(candidateIndex / shelfYs.length);
      const column = cell % columns;
      const row = Math.floor(cell / columns);
      const x = THREE.MathUtils.lerp(x0, x1, column / (columns - 1));
      const z = THREE.MathUtils.lerp(z0, z1, row / (rows - 1));
      const separated = placements[shelfIndex].every((placed) => (
        (placed.x - x) ** 2 + (placed.z - z) ** 2 >= minimumPastrySeparationSq
      ));
      if (separated) return { shelfIndex, x, z };
    }
    return { shelfIndex: ordinal % shelfYs.length, x: x0, z: z0 };
  }

  function makeTartGeometry() {
    const geometry = new THREE.LatheGeometry([
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.050, 0),
      new THREE.Vector2(0.050, 0.006),
      new THREE.Vector2(0.045, 0.035),
      new THREE.Vector2(0.044, 0.035),
      new THREE.Vector2(0.044, 0.041),
      new THREE.Vector2(0, 0.041),
    ], 12);
    const position = geometry.getAttribute('position');
    const colors = [];
    for (let i = 0; i < position.count; i += 1) {
      const color = new THREE.Color(position.getY(i) >= 0.035 ? 0x6d3824 : 0xc88642);
      colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return geometry;
  }

  function makeMuffinGeometry() {
    const profile = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.044, 0),
      new THREE.Vector2(0.052, 0.055),
      new THREE.Vector2(0.061, 0.065),
      new THREE.Vector2(0.055, 0.086),
      new THREE.Vector2(0.035, 0.103),
      new THREE.Vector2(0, 0.110),
    ];
    const geometry = new THREE.LatheGeometry(profile, 12);
    const position = geometry.getAttribute('position');
    const colors = [];
    for (let i = 0; i < position.count; i += 1) {
      const paper = position.getY(i) < 0.060;
      const color = new THREE.Color(paper ? 0x8b5d37 : 0xc37a42);
      colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return geometry;
  }

  function makeSliceGeometry() {
    const geometry = new THREE.BoxGeometry(0.12, 0.055, 0.085);
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const colors = [];
    for (let i = 0; i < position.count; i += 1) {
      const top = normal.getY(i) > 0.5;
      const color = new THREE.Color(top ? 0xe7c58d : 0x8a4e2b);
      colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return geometry;
  }

  // 9. Four world-space ring colliders; none enters the inner aisle.
  const colliderY0 = 0;
  const colliderY1 = L.kiosk.counterTop;
  const colliders = [
    new THREE.Box3(
      new THREE.Vector3(L.kiosk.outer.x0, colliderY0, L.kiosk.aisle.z1),
      new THREE.Vector3(L.kiosk.outer.x1, colliderY1, L.kiosk.outer.z1),
    ),
    new THREE.Box3(
      new THREE.Vector3(L.kiosk.outer.x0, colliderY0, L.kiosk.outer.z0),
      new THREE.Vector3(L.kiosk.outer.x1, colliderY1, L.kiosk.aisle.z0),
    ),
    new THREE.Box3(
      new THREE.Vector3(L.kiosk.outer.x0, colliderY0, L.kiosk.outer.z0),
      new THREE.Vector3(L.kiosk.aisle.x0, colliderY1, L.kiosk.outer.z1),
    ),
    new THREE.Box3(
      new THREE.Vector3(L.kiosk.aisle.x1, colliderY0, L.kiosk.outer.z0),
      new THREE.Vector3(L.kiosk.outer.x1, colliderY1, L.kiosk.outer.z1),
    ),
  ];

  return {
    group,
    colliders,
    interactables: [],
    update() {},
    dispose() {
      const geometries = new Set();
      group.traverse((object) => {
        if (object.geometry?.dispose) geometries.add(object.geometry);
      });
      geometries.forEach((geometry) => geometry.dispose());
      ownedMaterials.forEach((material) => material.dispose());
      ownedTextures.forEach((texture) => texture.dispose());
      group.clear();
      materialCache.clear();
      textureCache.clear();
      ownedMaterials.clear();
      ownedTextures.clear();
    },
  };
}
