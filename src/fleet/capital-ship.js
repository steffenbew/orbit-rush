import * as THREE from '../../assets/vendor/three.module.js';
import { setShipOpacity } from './visuals.js';

export function createEnemyBoltBuilder(glow) {
  const enemyBoltGeometry = new THREE.CylinderGeometry(.22, .22, 10, 8).rotateX(-Math.PI / 2);
  const enemyBoltCore = new THREE.MeshBasicMaterial({ color: 0xff3344, fog: false });
  const enemyBoltGlow = new THREE.SpriteMaterial({ map: glow, color: 0xff2244, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  return () => {
    const object = new THREE.Group();
    const core = new THREE.Mesh(enemyBoltGeometry, enemyBoltCore);
    core.scale.set(2, 2, 3);
    object.add(core);
    const halo = new THREE.Sprite(enemyBoltGlow);
    halo.position.z = 8;
    halo.scale.set(9, 14, 1);
    object.add(halo);
    return object;
  };
}

// Own the boss's attack/retreat movement and its reusable volley resources.
export function createCapitalEncounter({ scene, glow, camera, flightMotion, flightDirection, traffic,
  worldStep, pathHitsPlayer, onHit }) {
  const enemyBolts = [];
  const createBolt = createEnemyBoltBuilder(glow);
  function clearEnemyBolts() {
    for (const bolt of enemyBolts) scene.remove(bolt.object);
    enemyBolts.length = 0;
  }
  function updateShip(ship, dt, level, gameTime, courseTime, resting) {
    if (!ship.visible || dt <= 0) return;
    const data = ship.userData;
    if (level === 4 && courseTime >= 28 && !data.retreating) {
      data.retreating = true; data.retreatStart = gameTime;
    }
    if (data.retreating) {
      const previousSpeed = data.courseVelocity.dot(data.cruiseDirection);
      const forwardSpeed = Math.max(0, flightMotion.dot(data.cruiseDirection) * .85);
      const desired = data.cruiseDirection.clone().multiplyScalar(forwardSpeed + 2200);
      data.courseVelocity.lerp(desired, 1 - Math.exp(-1.5 * dt));
      traffic.updateEngineThrust(ship, previousSpeed, dt);
      data.gunsCharging = false;
      for (const muzzle of data.muzzles) muzzle.scale.setScalar(3);
      const elapsed = gameTime - data.retreatStart;
      setShipOpacity(ship, 1 - THREE.MathUtils.smoothstep(elapsed, 1, 4));
      if (elapsed >= 4) ship.visible = false; // Escape is neither a kill nor a reward.
      return;
    }
    data.courseAge += dt;
    const direction = data.cruiseDirection;
    const offset = ship.position.clone().sub(camera.position);

    const phase = data.courseAge;
    const forwardSpeed = Math.max(0, flightMotion.dot(direction) * .85);
    // Linger on attack runs so slower shots can arrive, then make a clear retreat.
    const retreat = Math.pow((1 + Math.cos(phase * .34)) * .5, 3);
    const combatDepth = 2600 + (retreat * 1800 - 900);
    const closingSpeed = THREE.MathUtils.clamp((offset.dot(direction) - combatDepth) * .55,
      -500, Math.max(220, forwardSpeed * .96));
    const desired = direction.clone().multiplyScalar(forwardSpeed - closingSpeed);
    const lane = Math.sin(phase * .28) * 280;
    const height = -100 + Math.sin(phase * .2 + .8) * 100;
    desired.addScaledVector(data.courseRight, THREE.MathUtils.clamp((lane - offset.dot(data.courseRight)) * .6, -150, 150))
      .addScaledVector(data.courseUp, THREE.MathUtils.clamp((height - offset.dot(data.courseUp)) * .5, -100, 100));
    traffic.avoidAsteroids(ship, desired, .6);
    const previousForwardSpeed = data.courseVelocity.dot(direction);
    data.courseVelocity.lerp(desired, 1 - Math.exp(-1.1 * dt));
    traffic.updateEngineThrust(ship, previousForwardSpeed, dt);
    ship.quaternion.copy(data.baseRotation).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(
      Math.sin(phase * .2) * .035, Math.sin(phase * .28) * .06,
      -data.courseVelocity.dot(data.courseRight) / 1200)));
    const canFire = !resting && !ship.userData.collisionHandled && gameTime - ship.userData.lastVisibleTime <= .2
      && offset.length() > 1200 && offset.length() < 3800 && offset.clone().normalize().dot(flightDirection) > .45;
    if (canFire) ship.userData.fireCooldown -= dt;
    else ship.userData.fireCooldown = Math.max(.7, ship.userData.fireCooldown);
    const charge = canFire ? THREE.MathUtils.clamp(1 - ship.userData.fireCooldown / .7, 0, 1) : 0;
    ship.userData.gunsCharging = charge > 0;
    // Open the warning quickly, then keep it growing until the volley releases.
    const warningSize = 3 + 22 * Math.sqrt(charge);
    for (const muzzle of ship.userData.muzzles) muzzle.scale.setScalar(warningSize);
    if (!canFire || ship.userData.fireCooldown > 0) return;
    ship.userData.fireCooldown = 3.4;
    ship.userData.gunsCharging = false;
    ship.updateMatrixWorld(true);
    for (const muzzle of ship.userData.muzzles) {
      const object = createBolt();
      muzzle.getWorldPosition(object.position);
      object.userData = { enemyBolt: true, collisionHandled: false };
      // Same world-space speed as the normal player laser, not a fixed slow flight time.
      const projectileSpeed = (flightMotion.length() + 420) * 1.2;
      const targetVelocity = flightMotion.clone().multiplyScalar(.85);
      const offset = camera.position.clone().sub(object.position);
      const a = targetVelocity.lengthSq() - projectileSpeed * projectileSpeed;
      const b = 2 * offset.dot(targetVelocity);
      const travelTime = (-b - Math.sqrt(b * b - 4 * a * offset.lengthSq())) / (2 * a);
      // Aim once at the current course; the shot never homes after release.
      const velocity = offset.addScaledVector(targetVelocity, travelTime).normalize().multiplyScalar(projectileSpeed);
      object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), velocity.clone().normalize());
      enemyBolts.push({ object, velocity, age: 0 });
      scene.add(object);
    }
    return true;
  }
  const flight = { scene, worldStep, flightMotion, pathHitsPlayer, onHit };
  return { bolts: enemyBolts, updateShip, clear: clearEnemyBolts, updateBolts: dt => advanceEnemyBolts(enemyBolts, dt, flight) };
}

export function advanceEnemyBolts(enemyBolts, dt, { scene, worldStep, flightMotion, pathHitsPlayer, onHit }) {
  let danger = false;
  for (let i = enemyBolts.length - 1; i >= 0; i--) {
    const bolt = enemyBolts[i];
    const previous = bolt.object.position.clone();
    bolt.age += dt;
    bolt.object.position.addScaledVector(bolt.velocity, dt).addScaledVector(worldStep, .85);
    const hit = pathHitsPlayer(previous, bolt.object.position, 3);
    if (hit || bolt.age > 8) {
      scene.remove(bolt.object);
      enemyBolts.splice(i, 1);
      if (hit && onHit(bolt.object)) return false;
      continue;
    }
    const future = bolt.object.position.clone().addScaledVector(bolt.velocity, .9).addScaledVector(flightMotion, -.85 * .9);
    if (pathHitsPlayer(bolt.object.position, future, 11)) danger = true;
  }
  return danger;
}
