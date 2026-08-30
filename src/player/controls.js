import * as THREE from 'three';

const CONFIG = {
  // Pointer look.
  lookSensitivity: 0.0022,
  maxPitch: 1.4835,
  maxMouseDelta: 120,
  spawnYaw: Math.PI,

  // Ground movement.
  acceleration: 26,
  friction: 11,
  shuffleMultiplier: 1.32,
  stopEpsilon: 0.002,
  maxFrameDelta: 0.05,

  // Player collision body.
  collisionRadius: 0.28,
  bodyBottom: 0.10,
  collisionPasses: 2,

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

  const object = new THREE.Group();
  object.name = 'player-root';

  const raycaster = new THREE.Raycaster();
  const rayCentre = new THREE.Vector2(0, 0);
  const rayHits = [];
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

  raycaster.near = CONFIG.rayNear;
  raycaster.far = CONFIG.rayFar;
  camera.rotation.order = 'YXZ';

  function inputIsActive() {
    return pointerLocked && !windowBlurred && !documentHidden && !disposed;
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

  function acquireTarget() {
    syncInteractableCache();
    currentTarget = null;
    if (targetObjects.length === 0) return;

    rayHits.length = 0;
    raycaster.setFromCamera(rayCentre, camera);
    raycaster.intersectObjects(targetObjects, true, rayHits);

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
        currentTarget = entry;
        return;
      }
    }
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

  function clampXToAisle() {
    const low = aisle.x0 - margin;
    const high = aisle.x1 + margin;
    if (posX < low) {
      posX = low;
      if (velocityX < 0) velocityX = 0;
    } else if (posX > high) {
      posX = high;
      if (velocityX > 0) velocityX = 0;
    }
  }

  function clampZToAisle() {
    const low = aisle.z0 - margin;
    const high = aisle.z1 + margin;
    if (posZ < low) {
      posZ = low;
      if (velocityZ < 0) velocityZ = 0;
    } else if (posZ > high) {
      posZ = high;
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
    if (!canvas || document.pointerLockElement === canvas) return;
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
    if (!inputIsActive()) return;
    const moveX = clamp(event.movementX || 0, -CONFIG.maxMouseDelta, CONFIG.maxMouseDelta);
    const moveY = clamp(event.movementY || 0, -CONFIG.maxMouseDelta, CONFIG.maxMouseDelta);
    yaw -= moveX * CONFIG.lookSensitivity;
    pitch = clamp(pitch - moveY * CONFIG.lookSensitivity, -CONFIG.maxPitch, CONFIG.maxPitch);
  }

  function onMouseDown(event) {
    if (!inputIsActive() || event.button !== 0) return;
    setActionKey(true, true);
  }

  function onMouseUp(event) {
    if (!inputIsActive() || event.button !== 0) return;
    setActionKey(true, false);
  }

  function onKeyDown(event) {
    if (!inputIsActive()) return;
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
    if (!inputIsActive()) return;
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

  function update(dt) {
    const frameDt = Number.isFinite(dt) ? clamp(dt, 0, CONFIG.maxFrameDelta) : 0;
    const active = inputIsActive();
    let forward = 0;
    let strafe = 0;

    if (active) {
      forward = (keyForward ? 1 : 0) - (keyBackward ? 1 : 0);
      strafe = (keyRight ? 1 : 0) - (keyLeft ? 1 : 0);
    }

    if (forward !== 0 || strafe !== 0) {
      const inputLength = Math.sqrt(forward * forward + strafe * strafe);
      const targetSpeed = baseSpeed
        * ((keyShiftLeft || keyShiftRight) ? CONFIG.shuffleMultiplier : 1);
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
      clampXToAisle();
      resolveX();
      clampXToAisle();

      posZ += velocityZ * frameDt;
      clampZToAisle();
      resolveZ();
      clampZToAisle();
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
    document.removeEventListener('pointerlockchange', onPointerLockChange);
    document.removeEventListener('pointerlockerror', onPointerLockError);
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onWindowBlur);
    window.removeEventListener('focus', onWindowFocus);
    if (typeof unsubscribeTeleport === 'function') unsubscribeTeleport();
    else ctx.bus?.off?.('debug:teleport', onDebugTeleport);
  }

  canvas?.addEventListener?.('click', onCanvasClick);
  document.addEventListener('pointerlockchange', onPointerLockChange);
  document.addEventListener('pointerlockerror', onPointerLockError);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onWindowBlur);
  window.addEventListener('focus', onWindowFocus);

  unsubscribeTeleport = ctx.bus?.on?.('debug:teleport', onDebugTeleport);

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
  };
}
