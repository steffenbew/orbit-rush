import * as THREE from '../../assets/vendor/three.module.js';
import { playerLaserSpeed } from './rules.js';

const projectedShip = new THREE.Vector3();
export function targetInfo(ship, { camera, viewCamera, mouseAim, width, height }) {
  if (!ship.visible || ship.userData.health <= 0 || ship.userData.arrivalOpacity < .25) return null;
  if (ship.userData.type.asteroid && (ship.userData.hull.opacity < .25
    || ship.position.distanceToSquared(camera.position) > Math.pow(2800, 2))) return null;
  // Target brackets must not reveal traffic before its distant arrival fade ends.
  if (!ship.userData.type.asteroid && !ship.userData.type.capital
    && ship.position.distanceToSquared(camera.position) > Math.pow(2600, 2)) return null;
  projectedShip.copy(ship.position).project(viewCamera);
  if (projectedShip.z <= -1 || projectedShip.z >= 1 || Math.abs(projectedShip.x) > 1 || Math.abs(projectedShip.y) > 1) return null;
  const depth = -ship.position.clone().applyMatrix4(viewCamera.matrixWorldInverse).z;
  if (depth <= 15) return null;
  const projectedRadius = ship.userData.type.radius * ship.scale.x * height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * depth);
  // Keep tiny silhouettes out of both acquisition and the grace area.
  if (projectedRadius * 2 < 20) return null;
  return {
    distance: Math.hypot((projectedShip.x - mouseAim.x) * width / 2, (projectedShip.y - mouseAim.y) * height / 2),
    radius: Math.max(32, projectedRadius)
  };
}

// Advance with simulation time. A zero-time update refreshes acquisition before aiming or drawing.
export function createTargetLock() {
  const lockDuration = .4, lockGrace = .15;
  let focusedShip, focusedSpawn, focusTime, focusLostTime, targetLocked;
  function clear() {
    focusedShip = null; focusedSpawn = 0; focusTime = 0; focusLostTime = 0; targetLocked = false;
  }
  clear();
  function update(dt, ships, view) {
    let candidate = null, nearest = Infinity;
    for (const ship of ships) {
      const info = targetInfo(ship, view);
      if (!info) continue;
      const score = info.distance / info.radius;
      if (score < 1 && score < nearest) {
        nearest = score;
        candidate = ship;
      }
    }
    if (focusedShip) {
      const info = targetInfo(focusedShip, view);
      // Recycling a Three.js object must never carry a lock to a new ship.
      if (focusedShip.userData.spawn !== focusedSpawn || !info || info.distance > info.radius * 1.35) clear();
    }
    if (candidate && candidate !== focusedShip) {
      clear();
      focusedShip = candidate;
      focusedSpawn = candidate.userData.spawn;
      return;
    }
    if (!focusedShip) return;
    if (candidate === focusedShip) {
      focusLostTime = 0;
      focusTime = Math.min(lockDuration, focusTime + dt);
      if (!targetLocked && focusTime >= lockDuration) {
        targetLocked = true;
        return true;
      }
    } else {
      // Brief, small aim slips freeze acquisition; switching targets does not.
      focusLostTime += dt;
      if (focusLostTime >= lockGrace) clear();
    }
  }
  return { update, clear, get ship() { return focusedShip; }, get locked() { return targetLocked; },
    get progress() { return focusTime / lockDuration; } };
}

export function aimLaser(camera, viewCamera, mouseAim, flightMotion, selected, heavy) {
  const origin = new THREE.Vector3(0, -2, -8).applyMatrix4(camera.matrixWorld);
  const direction = new THREE.Vector3(mouseAim.x, mouseAim.y, .5)
    .unproject(viewCamera).sub(viewCamera.position).normalize()
    .multiplyScalar(1000).add(viewCamera.position).sub(origin).normalize();
  if (selected) {
    // Account for the target's own course and our shared forward-flight motion.
    const relativeVelocity = flightMotion.clone().multiplyScalar(.15).add(selected.userData.courseVelocity);
    const aim = new THREE.Vector3();
    const projectileSpeed = playerLaserSpeed(flightMotion, heavy);
    let travelTime = origin.distanceTo(selected.position) / projectileSpeed;
    for (let i = 0; i < 5; i++) {
      aim.copy(selected.position).addScaledVector(relativeVelocity, travelTime);
      travelTime = origin.distanceTo(aim) / projectileSpeed;
    }
    direction.copy(aim).sub(origin).normalize();
  } else {
    // Unlocked shots scatter inside a 1.5-degree cone around the aim direction.
    const angle = Math.random() * Math.PI * 2;
    const spread = Math.sqrt(Math.random()) * Math.tan(THREE.MathUtils.degToRad(1.5));
    const aimRotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), direction);
    direction.set(Math.cos(angle) * spread, Math.sin(angle) * spread, -1)
      .normalize().applyQuaternion(aimRotation);
  }
  return { origin, direction };
}
