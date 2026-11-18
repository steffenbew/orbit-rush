import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PerspectiveCamera, Texture } from '../assets/vendor/three.module.js';
import { createShipModels } from '../src/fleet/models.js';
import { createFleetSpawn } from '../src/fleet/spawn.js';
import { createFleetVisuals, setShipOpacity } from '../src/fleet/visuals.js';

test('formation needs no live flight; a reused arrival starts on the current heading with fresh collision and hit state', () => {
  const pilot = new PerspectiveCamera();
  pilot.position.set(5, -3, 12); pilot.rotation.y = .4;
  const { createModel } = createShipModels(new Texture(), false);
  const { updateShipHitFlash } = createFleetVisuals(pilot, false);
  const { resetShip } = createFleetSpawn({ reducedMotion: false, random: (a, b) => (a + b) / 2, updateShipHitFlash });
  const ship = createModel(2, 0), data = ship.userData;
  const opening = { level: 1, openingSpeed: 400, formationSlot: 0 };
  resetShip(ship, opening);
  assert.equal(ship.position.z, -550);
  assert.equal(data.courseVelocity.z, -400 * .85 * data.cruiseRatio);

  ship.visible = false; setShipOpacity(ship, .2);
  data.health = 0; data.hitFlash = .22; updateShipHitFlash(ship);
  data.collisionHandled = true; data.lastVisibleTime = 12;
  let arrivalDistance;
  resetShip(ship, { ...opening, flight: { position: pilot.position, orientation: pilot.rotation, speed: 400, playerHullRadius: 20,
    constrainShipToBoundary(arrival) { arrivalDistance = arrival.position.distanceTo(pilot.position); arrival.position.x = pilot.position.x; }
  } });
  assert.ok(arrivalDistance >= 3800);
  assert.ok(Math.abs(ship.position.distanceTo(pilot.position) - arrivalDistance) < 1e-8);
  assert.ok(data.cruiseDirection.distanceTo(pilot.getWorldDirection(ship.position.clone())) < 1e-8);
  assert.ok(data.previousPosition.equals(ship.position));
  assert.equal(data.courseVelocity.length(), 0);
  assert.equal(data.spawn, 2);
  assert.equal(data.health, data.type.health);
  assert.equal(data.collisionHandled, false);
  assert.equal(data.lastVisibleTime, -Infinity);
  assert.equal(ship.visible, true);
  assert.equal(data.arrivalOpacity, 1);
  assert.equal(data.hitFlash, 0);
  assert.equal(data.hull.emissive.getHex(), 0);
});
