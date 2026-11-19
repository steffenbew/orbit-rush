import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from '../assets/vendor/three.module.js';
import { createRepairPickup } from '../src/course/repair-pickup.js';

test('blocked or ineligible repair opportunities wait; a swept collection consumes one pickup', () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(75, 2, .03, 14000);
  const flightMotion = new THREE.Vector3(0, 0, -25), worldStep = new THREE.Vector3();
  const blocker = new THREE.Group(); blocker.position.set(-85, 0, -500); blocker.userData.type = {radius: 20};
  const marker = {style: {}};
  let roll = .6;
  const repair = createRepairPickup({ scene, camera, glow: new THREE.Texture(),
    flightOrientation: camera.rotation, flightMotion, worldStep, ships: [blocker], hasPassedCamera: () => false,
    repairMarker: marker, sample: () => roll });
  const tick = () => repair.update(1 / 60, { needsRepair: true, duringRest: true, viewCamera: camera, width: 800, height: 400 });
  repair.reset(); assert.equal(repair.pending, false, 'Roll once per attempt; 60% threshold is exclusive');
  roll = .1; repair.reset(); tick();
  assert.equal(repair.mesh.visible, false, 'No spawn before the pilot is moving');
  flightMotion.z = -100; tick();
  assert.equal(repair.pending, true); assert.equal(marker.hidden, true, 'A blocked position does not spend the opportunity');
  blocker.visible = false; tick();
  assert.equal(repair.pending, false); assert.equal(marker.hidden, false);
  repair.mesh.position.set(0, 0, -80); worldStep.z = 200;
  assert.equal(tick(), true); assert.equal(marker.hidden, true);
  assert.equal(tick(), false, 'Crossing the pickup returns one collection, not a recurring reward');
  repair.reset(); repair.hide();
  assert.equal(scene.children.length, 1);
});
