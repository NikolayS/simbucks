import * as THREE from 'three';

const CONFIG = {
  // Pointer look.
  lookSensitivity: 0.0022,
  touchLookSensitivity: 0.0042,
  maxPitch: 1.4835,
  maxMouseDelta: 120,
  maxTouchLookDelta: 220,
  spawnYaw: Math.PI,

  // Ground movement.
  acceleration: 26,
  friction: 11,
  shuffleMultiplier: 1.32,
  stickDeadzone: 0.02,
  stopEpsilon: 0.002,
  maxFrameDelta: 0.05,

  // Player collision body.
  collisionRadius: 0.28,
  bodyBottom: 0.10,
  collisionPasses: 2,
  regionSeam: 0.02,   // overlap between adjoining walk regions, metres

  // Camera step motion.
  bobRate: 9.0,
  bobVertical: 0.032,
  bobLateral: 0.018,
  landingFastSpeed: 1.2,
  landingSlowSpeed: 0.35,
  landingImpulse: -0.035, // Peak dip in metres.
  landingSpring: 18,

  // Centre-screen interaction.
  rayInterval: 0.05,
  rayNear: 0.05,
  rayFar: 2.4,
  aimSpread: 0.06,        // NDC-y radius of the fallback ring when the centre ray misses
  aimSpreadTouch: 0.10,   // a thumb aims coarser than a cursor
  aimRingRays: 12,        // Measured kiosk: 8 skips the thin wand at 0.5–0.7 m; 12 at radius 0.06 acquires all 12 stations at every working distance
  holdThreshold: 0.18,
  promptSeparator: '  —  ',
};

function clamp(value, low, high) {
  return value < low ? low : (value > high ? high : value);
}

function isPreventedKey(code) {
  switch (code) {
    case 'KeyW':
    case 'KeyA':
    case 'KeyS':
    case 'KeyD':
    case 'KeyE':
    case 'KeyQ':
    case 'KeyL':
    case 'Space':
    case 'ArrowUp':
    case 'ArrowDown':
    case 'ArrowLeft':
    case 'ArrowRight':
    case 'ShiftLeft':
    case 'ShiftRight':
      return true;
    default:
      return false;
  }
}

export function createPlayer(ctx, colliders) {
  const camera = ctx.camera;
  const canvas = ctx.renderer?.domElement;
  const layout = ctx.layout;
  const spawn = layout.player.spawn;
  const aisle = layout.kiosk.aisle;
  const margin = layout.player.margin;
  const eye = layout.player.eye;
  const baseSpeed = layout.player.speed;
  const regions = buildRegions();

  function pushRegion(list, x0, x1, z0, z1) {
    if (!Number.isFinite(x0) || !Number.isFinite(x1)
        || !Number.isFinite(z0) || !Number.isFinite(z1)) return;
    if (!(x1 > x0) || !(z1 > z0)) return;
    list.push({ x0, x1, z0, z1 });
  }

  function buildRegions() {
    const list = [];
    // 1. The kiosk aisle, exactly as it has always been.
    pushRegion(list, aisle.x0 - margin, aisle.x1 + margin,
                     aisle.z0 - margin, aisle.z1 + margin);
    // 2 and 3. The back of house, if this layout has one.
    const bh = layout.kiosk?.backHouse ?? layout.backHouse;
    const outer = bh?.outer;
    const door = bh?.doorway;
    const wall = bh?.wall;
    if (!outer || !door || !Number.isFinite(wall)) return list;
    const inX0 = outer.x0 + wall, inX1 = outer.x1 - wall;
    const inZ0 = outer.z0 + wall, inZ1 = outer.z1 - wall;
    const aisleBack = aisle.z0 - margin;
    const seam = CONFIG.regionSeam;
    // The doorway corridor: the door's x band, from the aisle's back edge
    // through to the interior's front edge. Overlapped a little at BOTH ends so
    // there is no seam to catch on; the corridor's x band sits inside both of
    // its neighbours', so the overlap adds no reachable ground.
    pushRegion(list, door.x0, door.x1, inZ1 - seam, aisleBack + seam);
    // The interior of the back room.
    pushRegion(list, inX0, inX1, inZ0, inZ1);
    return list;
  }

  const object = new THREE.Group();
  object.name = 'player-root';

  const raycaster = new THREE.Raycaster();
  const rayCentre = new THREE.Vector2(0, 0);
  const rayOffset = new THREE.Vector2();
  const rayHits = [];
  const resolvedHit = { entry: null, distance: 0 };
  const targetObjects = [];
  const cachedObjects = [];
  const cachedEntries = [];
  const interactableByObject = new Map();

  const tapPayload = { id: null, phase: 'tap', dt: 0, duration: 0 };
  const holdStartPayload = { id: null, phase: 'holdStart', dt: 0, duration: 0 };
  const holdEndPayload = { id: null, phase: 'holdEnd', dt: 0, duration: 0 };
  const dropPayload = { id: 'drop', phase: 'tap', dt: 0 };
  const lidPayload = { id: 'lid', phase: 'tap', dt: 0 };

  let posX = spawn.x;
  let posZ = spawn.z;
  let velocityX = 0;
  let velocityZ = 0;
  let horizontalSpeed = 0;
  let yaw = CONFIG.spawnYaw;
  let pitch = 0;
  let bobPhase = 0;
  let landingOffset = 0;
  let landingVelocity = 0;
  let wasMovingFast = false;

  let keyForward = false;
  let keyBackward = false;
  let keyLeft = false;
  let keyRight = false;
  let keyShiftLeft = false;
  let keyShiftRight = false;
  let keyE = false;
  let mouseLeft = false;

  let pointerLocked = false;
  let windowBlurred = false;
  let documentHidden = typeof document !== 'undefined' && document.hidden;
  let disposed = false;
  let touchMode = false;
  let lastPointerWasTouch = false;
  let busInputSeen = false;
  let stickX = 0;
  let stickY = 0;
  let fallbackTouchId = null;
  let fallbackTouchX = 0;
  let fallbackTouchY = 0;

  touchMode = (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0)
    || (typeof window !== 'undefined' && 'ontouchstart' in window);

  let pressActive = false;
  let pressId = null;
  let pressDuration = 0;
  let holdStarted = false;

  let rayAccumulator = CONFIG.rayInterval;
  let cachedSource = null;
  let currentTarget = null;
  let desiredPrompt = '';
  let desiredLabel = null;
  let desiredHint = null;
  let lastSentPrompt = null;
  let lastPromptFunction = null;
  let unsubscribeTeleport = null;
  let unsubscribeMove = null;
  let unsubscribeLook = null;
  let unsubscribeAction = null;

  raycaster.near = CONFIG.rayNear;
  raycaster.far = CONFIG.rayFar;
  camera.rotation.order = 'YXZ';

  function deviceInputActive() {
    return pointerLocked && !windowBlurred && !documentHidden && !disposed;
  }

  function touchInputActive() {
    return touchMode && !documentHidden && !disposed;
  }

  function inputIsActive() {
    return deviceInputActive() || touchInputActive();
  }

  function applyLook(dx, dy) {
    dx = clamp(
      Number.isFinite(dx) ? dx : 0,
      -CONFIG.maxTouchLookDelta,
      CONFIG.maxTouchLookDelta,
    );
    dy = clamp(
      Number.isFinite(dy) ? dy : 0,
      -CONFIG.maxTouchLookDelta,
      CONFIG.maxTouchLookDelta,
    );
    yaw -= dx * CONFIG.touchLookSensitivity;
    pitch = clamp(
      pitch - dy * CONFIG.touchLookSensitivity,
      -CONFIG.maxPitch,
      CONFIG.maxPitch,
    );
  }

  function emitTap(id, duration) {
    tapPayload.id = id;
    tapPayload.dt = duration;
    tapPayload.duration = duration;
    ctx.bus?.emit?.('interact', tapPayload);
  }

  function emitHoldStart(id) {
    holdStartPayload.id = id;
    holdStartPayload.dt = pressDuration;
    holdStartPayload.duration = pressDuration;
    ctx.bus?.emit?.('interact', holdStartPayload);
  }

  function emitHoldEnd(id, duration) {
    holdEndPayload.id = id;
    holdEndPayload.dt = duration;
    holdEndPayload.duration = duration;
    ctx.bus?.emit?.('interact', holdEndPayload);
  }

  function clearMovementKeys() {
    keyForward = false;
    keyBackward = false;
    keyLeft = false;
    keyRight = false;
    keyShiftLeft = false;
    keyShiftRight = false;
  }

  function beginPress() {
    if (pressActive || !inputIsActive()) return;
    acquireTarget();
    rayAccumulator = 0;
    pressActive = true;
    pressId = currentTarget?.id ?? null;
    pressDuration = 0;
    holdStarted = false;
  }

  function finishPress(interrupted) {
    if (!pressActive) return;
    if (holdStarted) emitHoldEnd(pressId, pressDuration);
    else if (!interrupted) emitTap(pressId, pressDuration);
    pressActive = false;
    pressId = null;
    pressDuration = 0;
    holdStarted = false;
  }

  function clearInput(interrupted) {
    clearMovementKeys();
    keyE = false;
    mouseLeft = false;
    stickX = 0;
    stickY = 0;
    wasMovingFast = false;
    finishPress(interrupted);
  }

  function setActionKey(isMouse, down) {
    const wasDown = keyE || mouseLeft;
    if (isMouse) mouseLeft = down;
    else keyE = down;
    const isDown = keyE || mouseLeft;
    if (!wasDown && isDown) beginPress();
    else if (wasDown && !isDown) finishPress(false);
  }

  function syncInteractableCache() {
    const list = ctx.interactables;
    const length = list ? list.length : 0;
    let changed = list !== cachedSource || length !== cachedObjects.length;
    let i;

    if (!changed) {
      for (i = 0; i < length; i += 1) {
        if (cachedObjects[i] !== list[i]?.object || cachedEntries[i] !== list[i]) {
          changed = true;
          break;
        }
      }
    }
    if (!changed) return;

    cachedSource = list || null;
    cachedObjects.length = length;
    cachedEntries.length = length;
    targetObjects.length = 0;
    interactableByObject.clear();

    for (i = 0; i < length; i += 1) {
      const entry = list[i];
      const targetObject = entry?.object;
      cachedEntries[i] = entry;
      cachedObjects[i] = targetObject;
      if (!targetObject) continue;
      targetObjects.push(targetObject);
      interactableByObject.set(targetObject, entry);
    }
  }

  function resolveHit() {
    for (let i = 0; i < rayHits.length; i += 1) {
      let node = rayHits[i].object;
      let entry = null;
      let visible = true;
      while (node) {
        if (node.visible === false) {
          visible = false;
          break;
        }
        if (entry === null) entry = interactableByObject.get(node) || null;
        node = node.parent;
      }
      if (visible && entry) {
        resolvedHit.entry = entry;
        resolvedHit.distance = rayHits[i].distance;
        return resolvedHit;
      }
    }
    return null;
  }

  function acquireTarget() {
    syncInteractableCache();
    currentTarget = null;
    if (targetObjects.length === 0) return;

    rayHits.length = 0;
    raycaster.setFromCamera(rayCentre, camera);
    raycaster.intersectObjects(targetObjects, true, rayHits);
    const centreHit = resolveHit();
    if (centreHit) {
      currentTarget = centreHit.entry;
      return;
    }

    const spread = touchMode ? CONFIG.aimSpreadTouch : CONFIG.aimSpread;
    const aspect = Number.isFinite(camera.aspect) && camera.aspect > 0
      ? camera.aspect
      : 1;
    let nearestEntry = null;
    let nearestDistance = Infinity;
    for (let i = 0; i < CONFIG.aimRingRays; i += 1) {
      const angle = i * Math.PI * 2 / CONFIG.aimRingRays;
      rayOffset.set(Math.cos(angle) * spread / aspect, Math.sin(angle) * spread);
      rayHits.length = 0;
      raycaster.setFromCamera(rayOffset, camera);
      raycaster.intersectObjects(targetObjects, true, rayHits);
      const hit = resolveHit();
      if (hit && hit.distance < nearestDistance) {
        nearestEntry = hit.entry;
        nearestDistance = hit.distance;
      }
    }
    currentTarget = nearestEntry;
  }

  function updatePrompt() {
    const label = currentTarget ? (currentTarget.label ?? '') : null;
    const hint = currentTarget ? (currentTarget.hint ?? '') : null;

    if (label !== desiredLabel || hint !== desiredHint) {
      desiredLabel = label;
      desiredHint = hint;
      desiredPrompt = currentTarget
        ? (label ? (hint ? label + CONFIG.promptSeparator + hint : label) : hint)
        : '';
    }

    const promptFunction = ctx.hud?.setPrompt;
    if (typeof promptFunction === 'function'
        && (desiredPrompt !== lastSentPrompt || promptFunction !== lastPromptFunction)) {
      promptFunction.call(ctx.hud, desiredPrompt);
      lastSentPrompt = desiredPrompt;
      lastPromptFunction = promptFunction;
    }
  }

  function resolveX() {
    const bodyTop = eye;
    const boxes = colliders || null;
    if (!boxes) return;

    for (let pass = 0; pass < CONFIG.collisionPasses; pass += 1) {
      let resolved = false;
      const length = boxes.length;
      for (let i = 0; i < length; i += 1) {
        const box = boxes[i];
        if (!box?.min || !box?.max) continue;
        if (box.max.y <= CONFIG.bodyBottom || box.min.y >= bodyTop) continue;
        if (posZ <= box.min.z - CONFIG.collisionRadius
            || posZ >= box.max.z + CONFIG.collisionRadius) continue;

        const low = box.min.x - CONFIG.collisionRadius;
        const high = box.max.x + CONFIG.collisionRadius;
        if (posX <= low || posX >= high) continue;

        if (posX - low < high - posX) {
          posX = low;
          if (velocityX > 0) velocityX = 0;
        } else {
          posX = high;
          if (velocityX < 0) velocityX = 0;
        }
        resolved = true;
      }
      if (!resolved) break;
    }
  }

  function resolveZ() {
    const bodyTop = eye;
    const boxes = colliders || null;
    if (!boxes) return;

    for (let pass = 0; pass < CONFIG.collisionPasses; pass += 1) {
      let resolved = false;
      const length = boxes.length;
      for (let i = 0; i < length; i += 1) {
        const box = boxes[i];
        if (!box?.min || !box?.max) continue;
        if (box.max.y <= CONFIG.bodyBottom || box.min.y >= bodyTop) continue;
        if (posX <= box.min.x - CONFIG.collisionRadius
            || posX >= box.max.x + CONFIG.collisionRadius) continue;

        const low = box.min.z - CONFIG.collisionRadius;
        const high = box.max.z + CONFIG.collisionRadius;
        if (posZ <= low || posZ >= high) continue;

        if (posZ - low < high - posZ) {
          posZ = low;
          if (velocityZ > 0) velocityZ = 0;
        } else {
          posZ = high;
          if (velocityZ < 0) velocityZ = 0;
        }
        resolved = true;
      }
      if (!resolved) break;
    }
  }

  // Allowed X is the union of the x spans of every region whose z span holds
  // the current posZ. Being inside any one of them is enough.
  function clampXToRegion() {
    let nearestLow = 0;
    let nearestHigh = 0;
    let nearestDistance = Infinity;
    let matched = false;
    for (let i = 0; i < regions.length; i += 1) {
      const r = regions[i];
      if (posZ < r.z0 || posZ > r.z1) continue;
      matched = true;
      if (posX >= r.x0 && posX <= r.x1) return;        // inside one: done
      const distance = posX < r.x0 ? r.x0 - posX : posX - r.x1;
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestLow = r.x0;
        nearestHigh = r.x1;
      }
    }
    if (!matched) {
      // No region reaches this z at all, so the player is somewhere walking
      // could never have taken them — a debug teleport. Recover toward the
      // nearest region outright instead of abandoning them outside the world.
      for (let i = 0; i < regions.length; i += 1) {
        const r = regions[i];
        const distance = posX < r.x0 ? r.x0 - posX : (posX > r.x1 ? posX - r.x1 : 0);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestLow = r.x0;
          nearestHigh = r.x1;
        }
      }
    }
    if (nearestDistance === Infinity) return;          // no regions at all
    if (posX < nearestLow) {
      posX = nearestLow;
      if (velocityX < 0) velocityX = 0;
    } else if (posX > nearestHigh) {
      posX = nearestHigh;
      if (velocityX > 0) velocityX = 0;
    }
  }

  // The same, with the axes swapped.
  function clampZToRegion() {
    let nearestLow = 0;
    let nearestHigh = 0;
    let nearestDistance = Infinity;
    let matched = false;
    for (let i = 0; i < regions.length; i += 1) {
      const r = regions[i];
      if (posX < r.x0 || posX > r.x1) continue;
      matched = true;
      if (posZ >= r.z0 && posZ <= r.z1) return;
      const distance = posZ < r.z0 ? r.z0 - posZ : posZ - r.z1;
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestLow = r.z0;
        nearestHigh = r.z1;
      }
    }
    if (!matched) {
      // No region reaches this x at all, so the player is somewhere walking
      // could never have taken them — a debug teleport. Recover toward the
      // nearest region outright instead of abandoning them outside the world.
      for (let i = 0; i < regions.length; i += 1) {
        const r = regions[i];
        const distance = posZ < r.z0 ? r.z0 - posZ : (posZ > r.z1 ? posZ - r.z1 : 0);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestLow = r.z0;
          nearestHigh = r.z1;
        }
      }
    }
    if (nearestDistance === Infinity) return;          // no regions at all
    if (posZ < nearestLow) {
      posZ = nearestLow;
      if (velocityZ < 0) velocityZ = 0;
    } else if (posZ > nearestHigh) {
      posZ = nearestHigh;
      if (velocityZ > 0) velocityZ = 0;
    }
  }

  function syncCameraPose(bobScale) {
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    const verticalBob = Math.sin(bobPhase) * CONFIG.bobVertical * bobScale;
    const lateralBob = Math.sin(bobPhase * 0.5) * CONFIG.bobLateral * bobScale;

    object.position.set(posX, 0, posZ);
    camera.position.set(
      posX + rightX * lateralBob,
      eye + verticalBob + landingOffset,
      posZ + rightZ * lateralBob,
    );
    camera.rotation.set(pitch, yaw, 0);
  }

  function teleport(x, z) {
    finishPress(true);
    keyE = false;
    mouseLeft = false;
    posX = Number.isFinite(x) ? x : spawn.x;
    posZ = Number.isFinite(z) ? z : spawn.z;
    velocityX = 0;
    velocityZ = 0;
    horizontalSpeed = 0;
    bobPhase = 0;
    landingOffset = 0;
    landingVelocity = 0;
    wasMovingFast = false;
    rayAccumulator = CONFIG.rayInterval;
    currentTarget = null;
    syncCameraPose(0);
  }

  function onCanvasClick() {
    if (lastPointerWasTouch || !canvas || document.pointerLockElement === canvas) return;
    try {
      const request = canvas.requestPointerLock?.();
      if (request && typeof request.then === 'function') request.catch(() => {});
    } catch (_error) {
      // Some embedded browsers deny pointer lock synchronously.
    }
  }

  function onPointerLockChange() {
    const nextLocked = document.pointerLockElement === canvas;
    if (pointerLocked && !nextLocked) clearInput(true);
    pointerLocked = nextLocked;
  }

  function onPointerLockError() {
    if (document.pointerLockElement !== canvas) {
      if (pointerLocked) clearInput(true);
      pointerLocked = false;
    }
  }

  function onMouseMove(event) {
    if (!deviceInputActive()) return;
    const moveX = clamp(event.movementX || 0, -CONFIG.maxMouseDelta, CONFIG.maxMouseDelta);
    const moveY = clamp(event.movementY || 0, -CONFIG.maxMouseDelta, CONFIG.maxMouseDelta);
    yaw -= moveX * CONFIG.lookSensitivity;
    pitch = clamp(pitch - moveY * CONFIG.lookSensitivity, -CONFIG.maxPitch, CONFIG.maxPitch);
  }

  function onMouseDown(event) {
    if (!deviceInputActive() || event.button !== 0) return;
    setActionKey(true, true);
  }

  function onMouseUp(event) {
    if (!deviceInputActive() || event.button !== 0) return;
    setActionKey(true, false);
  }

  function onKeyDown(event) {
    if (!deviceInputActive()) return;
    if (!event.ctrlKey && !event.metaKey && !event.altKey && isPreventedKey(event.code)) {
      event.preventDefault();
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    switch (event.code) {
      case 'KeyW':
      case 'ArrowUp': keyForward = true; break;
      case 'KeyS':
      case 'ArrowDown': keyBackward = true; break;
      case 'KeyA':
      case 'ArrowLeft': keyLeft = true; break;
      case 'KeyD':
      case 'ArrowRight': keyRight = true; break;
      case 'ShiftLeft': keyShiftLeft = true; break;
      case 'ShiftRight': keyShiftRight = true; break;
      case 'KeyE': setActionKey(false, true); break;
      case 'KeyQ':
        if (!event.repeat) ctx.bus?.emit?.('interact', dropPayload);
        break;
      case 'KeyL':
        if (!event.repeat) ctx.bus?.emit?.('interact', lidPayload);
        break;
      default:
        break;
    }
  }

  function onKeyUp(event) {
    if (!deviceInputActive()) return;
    if (!event.ctrlKey && !event.metaKey && !event.altKey && isPreventedKey(event.code)) {
      event.preventDefault();
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    switch (event.code) {
      case 'KeyW':
      case 'ArrowUp': keyForward = false; break;
      case 'KeyS':
      case 'ArrowDown': keyBackward = false; break;
      case 'KeyA':
      case 'ArrowLeft': keyLeft = false; break;
      case 'KeyD':
      case 'ArrowRight': keyRight = false; break;
      case 'ShiftLeft': keyShiftLeft = false; break;
      case 'ShiftRight': keyShiftRight = false; break;
      case 'KeyE': setActionKey(false, false); break;
      default:
        break;
    }
  }

  function onWindowBlur() {
    windowBlurred = true;
    clearInput(true);
  }

  function onWindowFocus() {
    windowBlurred = false;
  }

  function onVisibilityChange() {
    documentHidden = document.hidden;
    if (documentHidden) clearInput(true);
  }

  function onDebugTeleport(payload) {
    teleport(payload?.x ?? spawn.x, payload?.z ?? spawn.z);
  }

  function onInputMove(payload) {
    touchMode = true;
    busInputSeen = true;
    if (!touchInputActive()) return;
    const x = Number.isFinite(payload?.x) ? payload.x : 0;
    const y = Number.isFinite(payload?.y) ? payload.y : 0;
    stickX = clamp(x, -1, 1);
    stickY = clamp(y, -1, 1);
    if (Math.hypot(stickX, stickY) < CONFIG.stickDeadzone) {
      stickX = 0;
      stickY = 0;
    }
  }

  function onInputLook(payload) {
    touchMode = true;
    busInputSeen = true;
    if (!touchInputActive()) return;
    applyLook(payload?.dx, payload?.dy);
  }

  function onInputAction(payload) {
    touchMode = true;
    busInputSeen = true;
    if (!touchInputActive()) return;
    const action = payload?.action;
    const phase = payload?.phase;
    if ((action !== 'interact' && action !== 'drop' && action !== 'lid')
        || (phase !== 'tap' && phase !== 'holdStart' && phase !== 'holdEnd')) return;

    if (action === 'drop') {
      if (phase === 'tap' || phase === 'holdStart') ctx.bus?.emit?.('interact', dropPayload);
      return;
    }
    if (action === 'lid') {
      if (phase === 'tap' || phase === 'holdStart') ctx.bus?.emit?.('interact', lidPayload);
      return;
    }

    if (phase === 'tap') {
      if (pressActive) finishPress(true);
      beginPress();
      finishPress(false);
    } else if (phase === 'holdStart') {
      if (pressActive) finishPress(true);
      beginPress();
      if (pressActive && !holdStarted) {
        holdStarted = true;
        pressDuration = CONFIG.holdThreshold;
        emitHoldStart(pressId);
      }
    } else {
      finishPress(false);
    }
  }

  function onWindowTouchStart() {
    touchMode = true;
    lastPointerWasTouch = true;
  }

  function onWindowPointerDown(event) {
    lastPointerWasTouch = event?.pointerType === 'touch' || event?.pointerType === 'pen';
    if (lastPointerWasTouch) touchMode = true;
  }

  function onFallbackTouchStart(event) {
    if (busInputSeen || event?.target !== canvas || event?.touches?.length !== 1) return;
    const touch = event.touches[0];
    if (!touch) return;
    touchMode = true;
    lastPointerWasTouch = true;
    fallbackTouchId = touch.identifier;
    fallbackTouchX = Number.isFinite(touch.clientX) ? touch.clientX : 0;
    fallbackTouchY = Number.isFinite(touch.clientY) ? touch.clientY : 0;
  }

  function onFallbackTouchMove(event) {
    if (busInputSeen || event?.target !== canvas || event?.touches?.length !== 1
        || !touchInputActive()) return;
    const touch = event.touches[0];
    if (!touch || touch.identifier !== fallbackTouchId) return;
    event.preventDefault?.();
    const nextX = Number.isFinite(touch.clientX) ? touch.clientX : fallbackTouchX;
    const nextY = Number.isFinite(touch.clientY) ? touch.clientY : fallbackTouchY;
    const dx = nextX - fallbackTouchX;
    const dy = nextY - fallbackTouchY;
    fallbackTouchX = nextX;
    fallbackTouchY = nextY;
    applyLook(dx, dy);
  }

  function onFallbackTouchEnd(event) {
    if (busInputSeen || event?.target !== canvas) return;
    fallbackTouchId = null;
    fallbackTouchX = 0;
    fallbackTouchY = 0;
  }

  function update(dt) {
    const frameDt = Number.isFinite(dt) ? clamp(dt, 0, CONFIG.maxFrameDelta) : 0;
    const active = inputIsActive();
    let forward = 0;
    let strafe = 0;

    if (active) {
      forward = (keyForward ? 1 : 0) - (keyBackward ? 1 : 0) + stickY;
      strafe = (keyRight ? 1 : 0) - (keyLeft ? 1 : 0) + stickX;
    }

    if (!Number.isFinite(forward) || !Number.isFinite(strafe)) {
      forward = 0;
      strafe = 0;
    }

    if (forward !== 0 || strafe !== 0) {
      const inputLength = Math.sqrt(forward * forward + strafe * strafe);
      const magnitude = Math.min(inputLength, 1);
      const targetSpeed = baseSpeed
        * ((keyShiftLeft || keyShiftRight) ? CONFIG.shuffleMultiplier : 1)
        * magnitude;
      const sinYaw = Math.sin(yaw);
      const cosYaw = Math.cos(yaw);
      const wishX = ((-sinYaw * forward) + (cosYaw * strafe)) / inputLength;
      const wishZ = ((-cosYaw * forward) - (sinYaw * strafe)) / inputLength;
      const targetX = wishX * targetSpeed;
      const targetZ = wishZ * targetSpeed;
      const deltaX = targetX - velocityX;
      const deltaZ = targetZ - velocityZ;
      const deltaLength = Math.sqrt(deltaX * deltaX + deltaZ * deltaZ);
      const maxChange = CONFIG.acceleration * frameDt;

      if (deltaLength > maxChange && deltaLength > 0) {
        velocityX += deltaX * maxChange / deltaLength;
        velocityZ += deltaZ * maxChange / deltaLength;
      } else {
        velocityX = targetX;
        velocityZ = targetZ;
      }

      const velocityLength = Math.sqrt(velocityX * velocityX + velocityZ * velocityZ);
      if (velocityLength > targetSpeed && velocityLength > 0) {
        velocityX *= targetSpeed / velocityLength;
        velocityZ *= targetSpeed / velocityLength;
      }
    } else {
      const damping = Math.exp(-CONFIG.friction * frameDt);
      velocityX *= damping;
      velocityZ *= damping;
      if (Math.abs(velocityX) < CONFIG.stopEpsilon) velocityX = 0;
      if (Math.abs(velocityZ) < CONFIG.stopEpsilon) velocityZ = 0;
    }

    if (active) {
      posX += velocityX * frameDt;
      clampXToRegion();
      resolveX();
      clampXToRegion();

      posZ += velocityZ * frameDt;
      clampZToRegion();
      resolveZ();
      clampZToRegion();
    }

    horizontalSpeed = Math.sqrt(velocityX * velocityX + velocityZ * velocityZ);
    if (horizontalSpeed > CONFIG.landingFastSpeed) wasMovingFast = true;
    if (wasMovingFast && horizontalSpeed < CONFIG.landingSlowSpeed) {
      landingVelocity += CONFIG.landingImpulse * CONFIG.landingSpring;
      wasMovingFast = false;
    }

    if (landingOffset !== 0 || landingVelocity !== 0) {
      const omega = CONFIG.landingSpring;
      const decay = Math.exp(-omega * frameDt);
      const helper = landingVelocity + omega * landingOffset;
      landingOffset = (landingOffset + helper * frameDt) * decay;
      landingVelocity = (landingVelocity - omega * helper * frameDt) * decay;
      if (Math.abs(landingOffset) < CONFIG.stopEpsilon
          && Math.abs(landingVelocity) < CONFIG.stopEpsilon) {
        landingOffset = 0;
        landingVelocity = 0;
      }
    }

    bobPhase += horizontalSpeed * frameDt * CONFIG.bobRate;
    syncCameraPose(clamp(horizontalSpeed / baseSpeed, 0, 1));

    if (pressActive && active) {
      pressDuration += frameDt;
      if (!holdStarted && pressDuration >= CONFIG.holdThreshold) {
        holdStarted = true;
        emitHoldStart(pressId);
      }
    }

    rayAccumulator += frameDt;
    if (rayAccumulator >= CONFIG.rayInterval) {
      rayAccumulator = 0;
      acquireTarget();
    }
    updatePrompt();
  }

  function dispose() {
    if (disposed) return;
    clearInput(true);
    disposed = true;
    canvas?.removeEventListener?.('click', onCanvasClick);
    canvas?.removeEventListener?.('touchstart', onFallbackTouchStart);
    canvas?.removeEventListener?.('touchmove', onFallbackTouchMove);
    canvas?.removeEventListener?.('touchend', onFallbackTouchEnd);
    canvas?.removeEventListener?.('touchcancel', onFallbackTouchEnd);
    document.removeEventListener?.('pointerlockchange', onPointerLockChange);
    document.removeEventListener?.('pointerlockerror', onPointerLockError);
    document.removeEventListener?.('mousemove', onMouseMove);
    document.removeEventListener?.('visibilitychange', onVisibilityChange);
    window.removeEventListener?.('mousedown', onMouseDown);
    window.removeEventListener?.('mouseup', onMouseUp);
    window.removeEventListener?.('keydown', onKeyDown);
    window.removeEventListener?.('keyup', onKeyUp);
    window.removeEventListener?.('blur', onWindowBlur);
    window.removeEventListener?.('focus', onWindowFocus);
    window.removeEventListener?.('touchstart', onWindowTouchStart);
    window.removeEventListener?.('pointerdown', onWindowPointerDown);
    if (typeof unsubscribeTeleport === 'function') unsubscribeTeleport();
    else ctx.bus?.off?.('debug:teleport', onDebugTeleport);
    if (typeof unsubscribeMove === 'function') unsubscribeMove();
    else ctx.bus?.off?.('input:move', onInputMove);
    if (typeof unsubscribeLook === 'function') unsubscribeLook();
    else ctx.bus?.off?.('input:look', onInputLook);
    if (typeof unsubscribeAction === 'function') unsubscribeAction();
    else ctx.bus?.off?.('input:action', onInputAction);
  }

  canvas?.addEventListener?.('click', onCanvasClick);
  canvas?.addEventListener?.('touchstart', onFallbackTouchStart, { passive: true });
  canvas?.addEventListener?.('touchmove', onFallbackTouchMove, { passive: false });
  canvas?.addEventListener?.('touchend', onFallbackTouchEnd, { passive: true });
  canvas?.addEventListener?.('touchcancel', onFallbackTouchEnd, { passive: true });
  document.addEventListener?.('pointerlockchange', onPointerLockChange);
  document.addEventListener?.('pointerlockerror', onPointerLockError);
  document.addEventListener?.('mousemove', onMouseMove);
  document.addEventListener?.('visibilitychange', onVisibilityChange);
  window.addEventListener?.('mousedown', onMouseDown);
  window.addEventListener?.('mouseup', onMouseUp);
  window.addEventListener?.('keydown', onKeyDown);
  window.addEventListener?.('keyup', onKeyUp);
  window.addEventListener?.('blur', onWindowBlur);
  window.addEventListener?.('focus', onWindowFocus);
  window.addEventListener?.('touchstart', onWindowTouchStart, { passive: true });
  window.addEventListener?.('pointerdown', onWindowPointerDown, { passive: true });

  unsubscribeTeleport = ctx.bus?.on?.('debug:teleport', onDebugTeleport);
  unsubscribeMove = ctx.bus?.on?.('input:move', onInputMove);
  unsubscribeLook = ctx.bus?.on?.('input:look', onInputLook);
  unsubscribeAction = ctx.bus?.on?.('input:action', onInputAction);

  syncCameraPose(0);

  return {
    object,
    update,
    teleport,
    getHeldTargetId() {
      return pressActive ? pressId : (currentTarget?.id ?? null);
    },
    isHolding() {
      return holdStarted;
    },
    getHoldDuration() {
      return pressActive ? pressDuration : 0;
    },
    getSpeed() {
      return horizontalSpeed;
    },
    // Read-only view of the preallocated feet position; callers must not mutate it.
    getPosition() {
      return object.position;
    },
    isLocked() {
      return pointerLocked;
    },
    getTargetId() {
      return currentTarget?.id ?? null;
    },
    dispose,
    isTouchActive() {
      return touchMode;
    },
    getStick() {
      return { x: stickX, y: stickY };
    },
    getRegions() { return regions; },
  };
}
