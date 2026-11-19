import * as THREE from '../../assets/vendor/three.module.js';

export function setShipOpacity(ship, opacity) {
  ship.userData.arrivalOpacity = opacity;
  ship.traverse(part => {
    if (part.isMesh && !part.userData.engineExhaust) part.material.opacity = opacity;
  });
}

export function createFleetVisuals(camera) {
  const visibleBox = new THREE.Box3();
  const rockRangeSq = 2800 ** 2;
  function recordVisibleFleet(ships, frustum, gameTime) {
    for (const ship of ships) {
      const data = ship.userData;
      if (!ship.visible || data.arrivalOpacity < .25) continue;
      ship.updateMatrixWorld(true);
      if (data.type.asteroid && !(data.hull.opacity >= .25 && ship.position.distanceToSquared(camera.position) < rockRangeSq)) continue;
      if (!frustum.intersectsBox(visibleBox.copy(data.collisionBox).applyMatrix4(ship.matrixWorld))) continue;
      if (data.collisionParts.some(part => frustum.intersectsBox(visibleBox.copy(part.bounds).applyMatrix4(ship.matrixWorld)))) {
        data.lastVisibleTime = gameTime;
      }
    }
  }
  function updateEngineVisuals(ship) {
    const thrust = ship.userData.engineThrust;

    const visibility = (ship.userData.type.capital ? 1 : 1 - THREE.MathUtils.smoothstep(
      ship.position.distanceTo(camera.position), 2600, 3600)) * (ship.userData.arrivalOpacity ?? 1);
    for (const flame of ship.userData.flames) {
      const { core, plume, radius, baseSize } = flame.userData;
      const size = baseSize * (1 + thrust * .9);
      flame.scale.set(size, size, 1);
      flame.material.opacity = (.4 + thrust * .6) * visibility;
      core.material.emissiveIntensity = 2.4 + thrust * 5 + Math.min(1, ship.userData.hitFlash / .22) * .25;
      const width = radius * (1.2 + thrust * .6);
      const length = radius * (3 + thrust * (ship.userData.type.capital ? 8 : 12));
      plume.scale.set(width, width, length);
      for (const ribbon of plume.children) ribbon.material.opacity = (.18 + thrust * .5) * visibility;
    }
  }
  const shipHitTint = new THREE.Color(0xff344f);
  function updateShipHitFlash(ship) {
    // A fading red tint over the original surface, not an opaque red silhouette.
    const amount = THREE.MathUtils.clamp(ship.userData.hitFlash / .22, 0, 1) * .28;
    if (!ship.userData.flashMaterials) {
      ship.userData.hull.emissive.copy(shipHitTint).multiplyScalar(amount * .5);
      updateEngineVisuals(ship);
      return;
    }
    // Every capital-ship material is private, including engine cores and sprites.
    for (const entry of ship.userData.flashMaterials) {
      const { material, color, emissive, intensity } = entry;
      material.color.copy(color).lerp(shipHitTint, amount);
      if (emissive) {
        material.emissive.copy(emissive).lerp(shipHitTint, amount * .5);
        material.emissiveIntensity = intensity + amount * .25;
      }
    }
    updateEngineVisuals(ship);
  }
  return { updateEngineVisuals, updateShipHitFlash, recordVisibleFleet };
}
