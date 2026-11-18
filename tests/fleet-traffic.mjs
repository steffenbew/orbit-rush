import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from '../assets/vendor/three.module.js';
import { createFleetTraffic } from '../src/fleet/traffic.js';

function rock(x) {
  const ship = new THREE.Group();
  ship.position.x = x;
  ship.userData = { type: { asteroid: true, radius: 5 }, previousPosition: new THREE.Vector3(),
    courseVelocity: new THREE.Vector3(6, 0, 0), spin: new THREE.Vector3(0, 2, 0), hitFlash: .2 };
  return ship;
}

test('the snapshot lists visible asteroids and keeps their pre-move positions for swept contacts', () => {
  const visible = rock(8), hidden = rock(14);
  hidden.visible = false;
  const traffic = createFleetTraffic({ reducedMotion: false });
  traffic.snapshotFleet([hidden, visible]);
  assert.deepEqual(traffic.activeAsteroids, [visible]);
  traffic.moveShip(visible, .5, new THREE.Vector3(100, 0, 0), true);
  assert.equal(visible.userData.previousPosition.x, 8);
  assert.equal(visible.position.x, 8 + 85 + 3);
  assert.equal(visible.rotation.y, 1);
  visible.visible = false;
  traffic.snapshotFleet([visible]);
  assert.deepEqual(traffic.activeAsteroids, []);
});

test('pausing freezes intrinsic drift and hit feedback; reduced motion suppresses only tumbling', () => {
  const ship = rock(0), worldStep = new THREE.Vector3();
  const traffic = createFleetTraffic({ reducedMotion: true });
  traffic.moveShip(ship, .1, worldStep, false);
  assert.equal(ship.position.x, 0); assert.equal(ship.userData.hitFlash, .2);
  traffic.moveShip(ship, .1, worldStep, true);
  assert.ok(Math.abs(ship.position.x - .6) < 1e-9);
  assert.equal(ship.rotation.y, 0); assert.equal(ship.userData.hitFlash, .1);
});
