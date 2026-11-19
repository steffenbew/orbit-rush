export const flightPointerDistance = 500;

const modes = ['clear', 'chase', 'canopy'];

export function cameraModeFromPreference(saved) {
  // The old 'cockpit' preference also meant unobstructed first-person.
  return modes.includes(saved) ? saved : 'clear';
}

export function nextCameraMode(current) {
  return modes[(modes.indexOf(current) + 1) % modes.length];
}

// Mouse aim and projected heading use normalized screen coordinates (positive Y is up).
function turnFromNose(aim, nose) {
  const origin = Math.max(-.99, Math.min(.99, nose));
  const delta = aim - origin;
  return delta / (1 - Math.sign(delta) * origin);
}

export function setMouseTurn(target, aim, mode, heading) {
  if (mode !== 'chase') return target.copy(aim);
  // Normalize each side separately so either screen edge still gives full steering.
  return target.set(turnFromNose(aim.x, heading.x), turnFromNose(aim.y, heading.y));
}

export function stickAimPixels(stick, mode, heading, width, height) {
  const x = mode === 'chase' ? heading.x : 0, y = mode === 'chase' ? heading.y : 0;
  const radius = Math.min(width, height) / 4;
  return { x: (1 + x) * width / 2 + stick.x * radius, y: (1 - y) * height / 2 - stick.y * radius };
}

// Only the chase camera and exterior model move here. The pilot camera stays at the hull.
export function createFlightView(camera, playerShip) {
  const chaseCamera = camera.clone();
  let visualPitch = 0;
  function update({ chase, crashing, playerHullRotation, vertical }, dt) {
    playerShip.visible = chase;
    if (!playerShip.visible) { visualPitch = 0; return camera; }
    playerShip.position.copy(camera.position);
    playerShip.quaternion.copy(crashing ? camera.quaternion : playerHullRotation);
    // Tip only the visible model. The hull, weapon aim and chase camera keep their flight orientation.
    if (!crashing) {
      const pitch = vertical * (36 * Math.PI / 180);
      visualPitch += (pitch - visualPitch) * (1 - Math.exp(-7 * dt));
      playerShip.rotateX(Math.PI / 30 + visualPitch); // Nose-up trim on the exterior model only.
    }
    chaseCamera.rotation.copy(camera.rotation);
    chaseCamera.rotation.z *= .35; // Let the player see the ship bank against the horizon.
    const depth = Math.max(70, 53 / camera.aspect);
    // Frame two actual points: the ship at 75% down and the forward steering cue at 55% down (45% from the bottom).
    // The farther point has a larger projection plane, so account for boom depth as well as FOV.
    const shipY = -.5, cueY = -.1; // normalized screen coordinates, positive up
    const rise = (cueY - shipY) * (1 + depth / flightPointerDistance);
    chaseCamera.position.set(0, depth * rise * Math.tan(camera.fov * Math.PI / 360), depth)
      .applyQuaternion(chaseCamera.quaternion).add(camera.position);
    // Follow the ship's heading with the boom, but aim slightly short of it.
    // This lets climbs and turns move the ship across the view as well as tilt its nose.
    if (!crashing) {
      const follow = .85;
      chaseCamera.rotation.x *= follow;
      chaseCamera.rotation.y *= follow;
    }
    chaseCamera.projectionMatrix.copy(camera.projectionMatrix);
    chaseCamera.projectionMatrix.elements[9] -= shipY + rise;
    chaseCamera.projectionMatrixInverse.copy(chaseCamera.projectionMatrix).invert();
    chaseCamera.updateMatrixWorld();
    return chaseCamera;
  }
  return { update, reset() { visualPitch = 0; } };
}
