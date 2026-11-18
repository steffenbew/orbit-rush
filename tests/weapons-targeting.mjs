import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from '../assets/vendor/three.module.js';
import { aimLaser, createTargetLock } from '../src/weapons/targeting.js';
import { playerLaserSpeed } from '../src/weapons/rules.js';

test('a lock survives brief aim slips, sounds once, and never transfers to a recycled hull', () => {
  const camera = new THREE.PerspectiveCamera(90, 1, .1, 1000);
  const view = { camera, viewCamera: camera, width: 1000, height: 1000, mouseAim: new THREE.Vector2(), reducedMotion: false };
  const ship = new THREE.Group();
  Object.assign(ship.userData, { type: {radius: 3}, health: 1, spawn: 1, arrivalOpacity: 1 });
  ship.position.z = -100;
  const lock = createTargetLock(), tick = dt => lock.update(dt, [ship], view);
  tick(0); tick(.2);
  assert.equal(lock.ship, ship); assert.equal(lock.progress, .5);
  ship.position.x = 7.5; tick(.1); assert.equal(lock.progress, .5);
  ship.position.x = 0; assert.equal(tick(.2), true); assert.ok(lock.locked);
  assert.ok(!tick(0), 'A render-time refresh is not a second acquisition');
  ship.userData.spawn++; tick(.1);
  assert.equal(lock.locked, false); assert.equal(lock.progress, 0);
  ship.position.x = 7.5; tick(.16); assert.equal(lock.ship, null);
});

test('a locked laser starts at the pilot and leads the target at the actual projectile speed', () => {
  const pilot = new THREE.PerspectiveCamera(), view = pilot.clone();
  pilot.position.set(12, 3, 0); pilot.updateMatrixWorld();
  view.position.z = 100; view.updateMatrixWorld();
  const ship = new THREE.Group(), motion = new THREE.Vector3(0, 0, -400);
  ship.position.set(0, 0, -350); ship.userData.courseVelocity = new THREE.Vector3(60, 0, -20);
  for (const heavy of [false, true]) {
    const { origin, direction } = aimLaser(pilot, view, new THREE.Vector2(), motion, ship, heavy);
    assert.deepEqual(origin.toArray(), [12, 1, -8]);
    const relative = ship.userData.courseVelocity.clone().addScaledVector(motion, .15);
    const interceptTime = (ship.position.z - origin.z) / (direction.z * playerLaserSpeed(motion, heavy) - relative.z);
    const target = ship.position.clone().addScaledVector(relative, interceptTime);
    const shot = origin.clone().addScaledVector(direction, playerLaserSpeed(motion, heavy) * interceptTime);
    assert.ok(shot.distanceTo(target) < .001);
  }
});
