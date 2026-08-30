import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const BLOOM = { strength: 0.22, radius: 0.50, threshold: 1.05 };
// SAO was tried and rejected because its screen-space kernel and cameraFar-relative scale halo badly at this scene's depth range.
const AO = {
  mode: 'ssao',
  ssao: {
    kernelRadius: 0.55, // metres - contact-scale, not room-scale
    minMetres: 0.008, // ignore gaps smaller than this (self-occlusion)
    maxMetres: 0.75, // ignore anything further than this
    intensity: 1.0, // 0..1, how much of the raw occlusion to apply
  },
};
const shadowedMeshes = new WeakSet();
const scenesWithReportedDuplicateLights = new WeakSet();

function disposeScene(scene) {
  const geometries = new Set();
  const materials = new Set();

  scene?.traverse?.((object) => {
    if (object.geometry) geometries.add(object.geometry);
    const list = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of list) {
      if (material) materials.add(material);
    }
  });

  for (const geometry of geometries) geometry.dispose?.();
  for (const material of materials) material.dispose?.();
  scene?.clear?.();
}

export function buildEnvironment(ctx) {
  let envScene = null;
  let pmrem = null;
  let renderTarget = null;

  try {
    const T = ctx?.THREE ?? THREE;
    envScene = new T.Scene();

    const basic = (color, radiance = 1, side = T.FrontSide) => {
      const material = new T.MeshBasicMaterial({ color, side, toneMapped: false });
      material.color.multiplyScalar(radiance);
      return material;
    };

    const plane = (width, height, position, rotation, color, radiance, side = T.BackSide) => {
      const mesh = new T.Mesh(
        new T.PlaneGeometry(width, height),
        basic(color, radiance, side),
      );
      mesh.position.set(...position);
      mesh.rotation.set(...rotation);
      envScene.add(mesh);
    };

    // Separate faces preserve the warm/cool gradients that polished metal needs.
    plane(30, 26, [0, 6.2, 0], [-Math.PI / 2, 0, 0], 0xFFF6EA, 1.25);
    plane(30, 26, [0, 0, 0], [Math.PI / 2, 0, 0], 0xD8CFC0, 1.15);
    plane(30, 6.4, [0, 3.0, -13], [0, Math.PI, 0], 0xEFEDE8, 0.95);
    plane(26, 6.4, [-15, 3.0, 0], [0, -Math.PI / 2, 0], 0xEDEBE6, 0.85);
    plane(26, 6.4, [15, 3.0, 0], [0, Math.PI / 2, 0], 0xEFEDE8, 0.95);
    plane(30, 6.4, [0, 3.0, 13], [0, 0, 0], 0xD9E6F2, 1.55);

    // Narrow emitters become long, readable highlights on chrome and steel.
    const slotMaterial = basic(0xFFFDF5, 6.0);
    for (const x of [-11, -6.6, -2.2, 2.2, 6.6, 11]) {
      const slot = new T.Mesh(new T.BoxGeometry(0.22, 0.06, 9.0), slotMaterial);
      slot.position.set(x, 6.05, 0);
      envScene.add(slot);
    }
    for (const z of [-6, 6]) {
      const slot = new T.Mesh(new T.BoxGeometry(12.0, 0.06, 0.22), slotMaterial);
      slot.position.set(0, 6.05, z);
      envScene.add(slot);
    }

    // A low dark surround gives reflections a crisp light/dark break.
    plane(29.2, 1.7, [0, 1.75, -12.6], [0, Math.PI, 0], 0x24262B, 0.35);
    plane(25.2, 1.7, [-14.6, 1.75, 0], [0, -Math.PI / 2, 0], 0x24262B, 0.35);
    plane(25.2, 1.7, [14.6, 1.75, 0], [0, Math.PI / 2, 0], 0x24262B, 0.35);

    const accent = new T.Mesh(
      new T.BoxGeometry(6.0, 0.9, 0.1),
      basic(0xE2593C, 0.7),
    );
    accent.position.set(0, 1.1, 9);
    envScene.add(accent);

    plane(
      20,
      12,
      [0, 0.35, 0],
      [-Math.PI / 2, 0, 0],
      0xE8D9C2,
      1.00,
      T.FrontSide,
    );

    pmrem = new T.PMREMGenerator(ctx.renderer);
    pmrem.compileEquirectangularShader?.();
    renderTarget = pmrem.fromScene(envScene, 0.04, 0.1, 60);

    const texture = renderTarget.texture;
    disposeScene(envScene);
    pmrem.dispose();
    return texture;
  } catch {
    try { renderTarget?.dispose?.(); } catch { /* Best-effort cleanup only. */ }
    try { disposeScene(envScene); } catch { /* The environment is optional. */ }
    try { pmrem?.dispose?.(); } catch { /* The game must still start. */ }
    return null;
  }
}

function flagShadowMeshes(ctx) {
  const T = ctx?.THREE ?? THREE;

  ctx.scene.traverse((object) => {
    if (
      object.isMesh !== true
      || object.isSprite === true
      || object.isPoints === true
      || object.isLine === true
      || shadowedMeshes.has(object)
    ) return;

    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const cannotReceive = materials.some((material) => (
      !material
      || material.transparent === true
      || material.depthWrite === false
      || material.transmission > 0
    ));

    if (cannotReceive) {
      shadowedMeshes.add(object);
      return;
    }

    object.receiveShadow = true;
    object.castShadow = false;

    try {
      const box = new T.Box3().setFromObject(object);
      const size = box.getSize(new T.Vector3());
      const finite = [
        box.min.x, box.min.y, box.min.z,
        box.max.x, box.max.y, box.max.z,
        size.x, size.y, size.z,
      ].every(Number.isFinite);

      if (finite) {
        const largest = Math.max(size.x, size.y, size.z);
        const smallest = Math.min(size.x, size.y, size.z);
        const looksLikeRoomShell = (
          largest > 25
          || (smallest < 0.35 && largest > 12)
        );
        object.castShadow = !looksLikeRoomShell;
      }
    } catch {
      object.castShadow = false;
    }

    shadowedMeshes.add(object);
  });
}

export function tuneShadows(ctx, quality) {
  try {
    const T = ctx?.THREE ?? THREE;
    let firstDirectional = null;
    let firstShadowCaster = null;

    ctx.scene.traverse((object) => {
      if (object.isDirectionalLight === true) {
        if (!firstDirectional) firstDirectional = object;
        if (!firstShadowCaster && object.castShadow) firstShadowCaster = object;
      }
    });

    const light = firstShadowCaster ?? firstDirectional;
    if (quality === 'low') {
      if (light) light.castShadow = false;
      ctx.renderer.shadowMap.enabled = false;
      return;
    }

    if (light) {
      light.castShadow = true;
      light.target.position.set(-0.5, 1.0, -1.2);
      light.target.updateWorldMatrix?.(true, false);

      // Nine metres encloses the kiosk and queue without wasting texels on walls.
      const camera = light.shadow.camera;
      camera.left = -9;
      camera.right = 9;
      camera.top = 9;
      camera.bottom = -9;
      camera.near = 1;

      const lightPosition = new T.Vector3();
      const targetPosition = new T.Vector3(-0.5, 1.0, -1.2);
      light.getWorldPosition?.(lightPosition);
      light.target.getWorldPosition?.(targetPosition);
      const distance = lightPosition.distanceTo(targetPosition);
      camera.far = (Number.isFinite(distance) ? distance : 20) + 20;
      camera.updateProjectionMatrix();

      const mapSize = quality === 'high' ? 4096 : 2048;
      if (
        light.shadow.mapSize.x !== mapSize
        || light.shadow.mapSize.y !== mapSize
      ) {
        light.shadow.map?.dispose();
        light.shadow.map = null;
        light.shadow.mapSize.set(mapSize, mapSize);
        light.shadow.needsUpdate = true;
      }
      light.shadow.bias = -0.0002;
      light.shadow.normalBias = 0.012;
      light.shadow.radius = 1.6;
    }

    ctx.renderer.shadowMap.enabled = true;
    ctx.renderer.shadowMap.type = T.PCFSoftShadowMap;
    flagShadowMeshes(ctx);
  } catch {
    // Shadows are an enhancement; bad scene content must not stop rendering.
  }
}

export function balanceLights(ctx, quality) {
  try {
    const lights = [];

    ctx.scene.traverse((light) => {
      if (light.isLight !== true) return;

      light.userData ??= {};
      if (!Object.prototype.hasOwnProperty.call(light.userData, '__baseIntensity')) {
        light.userData.__baseIntensity = light.intensity;
      }
      if (
        light.isHemisphereLight === true
        && !Object.prototype.hasOwnProperty.call(light.userData, '__baseGroundColor')
      ) {
        light.userData.__baseGroundColor = light.groundColor.getHex();
      }

      lights.push({ light, isDirectChild: light.parent === ctx.scene });
    });

    const hasGroupedHemisphere = lights.some(({ light, isDirectChild }) => (
      light.isHemisphereLight === true && !isDirectChild
    ));
    const hasShadowDirectional = lights.some(({ light }) => (
      light.isDirectionalLight === true && light.castShadow === true
    ));
    const duplicates = new Set();

    for (const { light, isDirectChild } of lights) {
      if (
        isDirectChild
        && (
          (hasGroupedHemisphere && light.isHemisphereLight === true)
          || (
            hasShadowDirectional
            && light.isDirectionalLight === true
            && light.castShadow !== true
          )
        )
      ) {
        duplicates.add(light);
      }
    }

    if (duplicates.size > 0 && !scenesWithReportedDuplicateLights.has(ctx.scene)) {
      scenesWithReportedDuplicateLights.add(ctx.scene);
      try {
        const noun = duplicates.size === 1 ? 'light' : 'lights';
        console.info(
          `Neutralized ${duplicates.size} duplicate direct-child ${noun} from the main.js fallback.`,
        );
      } catch { /* Reporting is secondary. */ }
    }

    for (const { light } of lights) {
      const base = light.userData.__baseIntensity;
      if (duplicates.has(light)) light.intensity = 0;
      else if (light.isHemisphereLight === true) {
        light.intensity = base * 0.50;
        light.groundColor.setHex(0xCFC6B6);
      }
      else if (light.isAmbientLight === true) light.intensity = base * 0.10;
      else if (light.isDirectionalLight === true) light.intensity = base * 1.35;
    }

    ctx.scene.environmentIntensity = 0.72;
    ctx.renderer.toneMappingExposure = 0.92;
  } catch {
    // Light balancing is an enhancement; invalid scene content must not stop rendering.
  }
}

export function createRenderPipeline(ctx) {
  const T = ctx?.THREE ?? THREE;
  const { renderer, scene, camera } = ctx;

  camera.userData ??= {};
  if (!Object.prototype.hasOwnProperty.call(camera.userData, '__renderPipelineFrustum')) {
    camera.userData.__renderPipelineFrustum = { near: camera.near, far: camera.far };
  }
  // The terminal and its fog fit inside 110 m; a tighter frustum preserves useful depth precision.
  camera.near = 0.10;
  camera.far = 110;
  camera.updateProjectionMatrix();

  const viewport = renderer.getSize(new T.Vector2());
  let width = Math.max(1, Math.round(viewport.x || 1));
  let height = Math.max(1, Math.round(viewport.y || 1));

  const composerTarget = new T.WebGLRenderTarget(width, height, {
    type: T.HalfFloatType,
  });
  composerTarget.texture.name = 'RenderPipeline.HalfFloat';

  const composer = new EffectComposer(renderer, composerTarget);
  const renderPass = new RenderPass(scene, camera);
  const outputPass = new OutputPass();
  let aoPass = null;
  let bloomPass = null;
  let smaaPass = null;
  let qualityLevel = null;
  let broken = false;
  let reported = false;
  let reportedSSAOPatchMismatch = false;
  let disposed = false;
  let aoCameraNear = null;
  let aoCameraFar = null;
  let frameCount = 0;

  renderer.toneMapping = T.ACESFilmicToneMapping;
  // balanceLights owns the exposure; this fallback keeps both paths aligned.
  renderer.toneMappingExposure = 0.92;

  const rawDeviceRatio = Number(globalThis.devicePixelRatio ?? renderer.getPixelRatio());
  const deviceRatio = Number.isFinite(rawDeviceRatio) && rawDeviceRatio > 0
    ? rawDeviceRatio
    : 1;

  function syncPixelRatio(name) {
    const ratio = name === 'low'
      ? Math.min(deviceRatio, 1.5)
      : Math.min(deviceRatio, 2);
    renderer.setPixelRatio(ratio);
    composer.setPixelRatio(ratio);
  }

  function aoSize(name) {
    const scale = name === 'medium' ? 0.5 : 1;
    const ratio = renderer.getPixelRatio();
    return {
      width: Math.max(1, Math.round(width * ratio * scale)),
      height: Math.max(1, Math.round(height * ratio * scale)),
    };
  }

  function createAOPass(name) {
    if (name === 'low' || AO.mode === 'none') return null;

    const size = aoSize(name);
    const pass = new SSAOPass(scene, camera, size.width, size.height);
    const range = camera.far - camera.near;
    pass.kernelRadius = AO.ssao.kernelRadius;
    pass.minDistance = AO.ssao.minMetres / range;
    pass.maxDistance = AO.ssao.maxMetres / range;
    aoCameraNear = camera.near;
    aoCameraFar = camera.far;

    pass.blurMaterial.uniforms.aoIntensity = { value: AO.ssao.intensity };
    const beforeUniformPatch = pass.blurMaterial.fragmentShader;
    pass.blurMaterial.fragmentShader = pass.blurMaterial.fragmentShader
      .replace(
        'uniform vec2 resolution;',
        'uniform vec2 resolution;\nuniform float aoIntensity;',
      );
    const uniformPatched = pass.blurMaterial.fragmentShader !== beforeUniformPatch;
    const beforeCompositePatch = pass.blurMaterial.fragmentShader;
    pass.blurMaterial.fragmentShader = pass.blurMaterial.fragmentShader
      .replace(
        'gl_FragColor = vec4( vec3( result / ( 5.0 * 5.0 ) ), 1.0 );',
        'float ao = result / ( 5.0 * 5.0 );\n\t\t\tgl_FragColor = vec4( vec3( mix( 1.0, ao, aoIntensity ) ), 1.0 );',
      );
    const compositePatched = pass.blurMaterial.fragmentShader !== beforeCompositePatch;
    if ((!uniformPatched || !compositePatched) && !reportedSSAOPatchMismatch) {
      reportedSSAOPatchMismatch = true;
      try {
        console.warn('SSAO intensity shader patch did not match the installed SSAOPass shader.');
      } catch { /* Reporting is secondary. */ }
    }
    pass.blurMaterial.needsUpdate = true;
    return pass;
  }

  function syncSSAODistances() {
    if (!aoPass || (camera.near === aoCameraNear && camera.far === aoCameraFar)) return;
    const range = camera.far - camera.near;
    aoPass.kernelRadius = AO.ssao.kernelRadius;
    aoPass.minDistance = AO.ssao.minMetres / range;
    aoPass.maxDistance = AO.ssao.maxMetres / range;
    aoCameraNear = camera.near;
    aoCameraFar = camera.far;
  }

  function sizeAOPass(name) {
    if (!aoPass) return;
    const size = aoSize(name);
    aoPass.setSize(size.width, size.height);
  }

  function rebuildChain(name) {
    composer.passes.length = 0;
    aoPass?.dispose?.();
    aoPass = createAOPass(name);

    composer.addPass(renderPass);
    if (aoPass) {
      composer.addPass(aoPass);
      // EffectComposer initially sizes every pass at full resolution.
      sizeAOPass(name);
    }
    if (bloomPass) composer.addPass(bloomPass);
    if (smaaPass) composer.addPass(smaaPass);
    composer.addPass(outputPass);
  }

  function setQuality(name) {
    if (!['high', 'medium', 'low'].includes(name) || disposed) return;

    composer.passes.length = 0;
    const wantsBloom = name !== 'low';
    const wantsSmaa = name === 'high';

    if (!wantsBloom && bloomPass) {
      bloomPass.dispose?.();
      bloomPass = null;
    } else if (wantsBloom && !bloomPass) {
      bloomPass = new UnrealBloomPass(
        new T.Vector2(width, height),
        BLOOM.strength,
        BLOOM.radius,
        BLOOM.threshold,
      );
    }

    if (!wantsSmaa && smaaPass) {
      smaaPass.dispose?.();
      smaaPass = null;
    } else if (wantsSmaa && !smaaPass) {
      smaaPass = new SMAAPass();
    }

    syncPixelRatio(name);
    rebuildChain(name);
    qualityLevel = name;
    tuneShadows(ctx, name);
    balanceLights(ctx, name);
  }

  function setAO(mode) {
    if (!['ssao', 'none'].includes(mode) || disposed) return;
    AO.mode = mode;
    if (qualityLevel) rebuildChain(qualityLevel);
    broken = false;
  }

  function directRender() {
    try {
      renderer.setRenderTarget?.(null);
      renderer.render(scene, camera);
    } catch {
      // Rendering errors cannot be allowed to break the game loop.
    }
  }

  function render(dt) {
    syncSSAODistances();
    frameCount = (frameCount + 1) % 120;

    if (frameCount === 0 && qualityLevel !== 'low') {
      try {
        flagShadowMeshes(ctx);
      } catch {
        // Shadows are an enhancement; bad scene content must not stop rendering.
      }
    }

    if (broken) {
      directRender();
      return;
    }

    try {
      composer.render(dt ?? 0.016);
    } catch (error) {
      broken = true;

      if (!reported) {
        reported = true;
        const detail = error instanceof Error ? error.message : String(error);
        const message = `Post-processing failed; using direct rendering: ${detail}`;
        try { console.error(message, error); } catch { /* Reporting is secondary. */ }
        try { ctx.problems?.push?.(message); } catch { /* A frozen log is harmless. */ }
      }

      directRender();
    }
  }

  function resize(nextWidth, nextHeight) {
    width = Math.max(1, Math.round(nextWidth));
    height = Math.max(1, Math.round(nextHeight));
    renderer.setSize(width, height);

    const ratio = renderer.getPixelRatio();
    composer.setPixelRatio(ratio);
    composer.setSize(width, height);

    // These passes own extra targets and expect physical pixel dimensions.
    sizeAOPass(qualityLevel);
    bloomPass?.setSize?.(width * ratio, height * ratio);
    smaaPass?.setSize?.(width * ratio, height * ratio);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;

    const passes = new Set([renderPass, aoPass, bloomPass, smaaPass, outputPass]);
    for (const pass of passes) pass?.dispose?.();
    composer.dispose();
  }

  const coarsePointer = globalThis.matchMedia?.('(pointer: coarse)')?.matches === true;
  const touchDevice = Number(globalThis.navigator?.maxTouchPoints ?? 0) > 0;
  setQuality(coarsePointer || touchDevice ? 'low' : 'high');

  return {
    render,
    resize,
    setQuality,
    setAO,
    get quality() { return qualityLevel; },
    composer,
    dispose,
  };
}
