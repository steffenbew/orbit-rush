import * as THREE from '../../assets/vendor/three.module.js';

export function createRepairPickup({ scene, camera, glow, flightOrientation, flightMotion, worldStep,
  ships, hasPassedCamera, repairMarker, sample = Math.random }) {
  const repairPickup = new THREE.Group();
  const repairShell = new THREE.MeshStandardMaterial({ color: 0x123d37, metalness: .45, roughness: .4 });
  const repairLight = new THREE.MeshStandardMaterial({ color: 0xb8ffe4, emissive: 0x56eeb2, emissiveIntensity: 1.4 });
  const repairBody = new THREE.CylinderGeometry(10, 10, 2, 6);
  repairBody.rotateX(Math.PI / 2);
  repairPickup.add(new THREE.Mesh(repairBody, repairShell));
  const repairRing = new THREE.Mesh(new THREE.TorusGeometry(10, .6, 8, 6), repairLight);
  repairPickup.add(repairRing);
  const repairBar = new THREE.BoxGeometry(1, 1, 1);
  for (const [width, height] of [[10, 3], [3, 10]]) {
    const bar = new THREE.Mesh(repairBar, repairLight);
    bar.position.z = 2; bar.scale.set(width, height, 1);
    repairPickup.add(bar);
  }
  const repairGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0x57ffbd,
    transparent: true, opacity: .3, depthWrite: false, blending: THREE.AdditiveBlending }));
  repairGlow.scale.set(36, 36, 1);
  repairPickup.add(repairGlow);
  repairPickup.userData.collisionBox = new THREE.Box3(new THREE.Vector3(-18, -18, -3), new THREE.Vector3(18, 18, 3));
  repairPickup.visible = false;
  scene.add(repairPickup);
  let repairPending = false;
  const repairPrevious = new THREE.Vector3(), repairClosest = new THREE.Vector3(), repairProjected = new THREE.Vector3();
  const repairPath = new THREE.Line3();
  function reset() {
    repairPending = sample() < .6;
    repairPickup.visible = false;
    repairRing.rotation.z = 0;
    repairMarker.hidden = true;
  }
  function update(dt, { needsRepair, duringRest, viewCamera, width, height }) {
    repairMarker.hidden = true;
    if (repairPending && !repairPickup.visible && needsRepair && duringRest && flightMotion.length() > 25) {
      const distance = Math.max(500, flightMotion.length() * .85 * 3.5);
      repairPickup.position.set((sample() < .5 ? -1 : 1) * 85, 0, -distance)
        .applyEuler(flightOrientation).add(camera.position);
      // Do not hide a reward inside an existing solid obstacle.
      const blocked = ships.some(ship => ship.visible && ship.position.distanceTo(repairPickup.position)
        < ship.userData.type.radius * ship.scale.x + 24);
      if (!blocked) { repairPickup.visible = true; repairPending = false; }
    }
    if (!repairPickup.visible) return false;
    repairPrevious.copy(repairPickup.position);
    repairPickup.position.addScaledVector(worldStep, .85);
    repairPickup.quaternion.copy(viewCamera.quaternion);
    repairRing.rotation.z += dt * .25;
    repairPath.set(repairPrevious, repairPickup.position).closestPointToPoint(camera.position, true, repairClosest);
    if (needsRepair && repairClosest.distanceToSquared(camera.position) <= 18 * 18) {
      repairPickup.visible = false;
      return true;
    }
    if (hasPassedCamera(repairPickup)) { repairPickup.visible = false; return false; }
    repairProjected.copy(repairPickup.position).project(viewCamera);
    if (repairProjected.z > -1 && repairProjected.z < 1 && Math.abs(repairProjected.x) < .95 && Math.abs(repairProjected.y) < .95) {
      repairMarker.hidden = false;
      repairMarker.style.left = `${(repairProjected.x * .5 + .5) * width}px`;
      repairMarker.style.top = `${(-repairProjected.y * .5 + .5) * height + 26}px`;
    }
    return false;
  }
  function hide() {
    repairPickup.visible = false;
    repairMarker.hidden = true;
  }
  return { reset, update, hide, mesh: repairPickup, ring: repairRing, get pending() { return repairPending; } };
}
