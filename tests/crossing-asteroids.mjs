import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3 } from '../assets/vendor/three.module.js';
import { createCrossingAsteroids } from '../src/course/crossing-asteroids.js';

function flybys(arrivalDistance = 0) {
  const flightMotion = new Vector3(0, 0, -100), forecasts = [];
  const crossings = createCrossingAsteroids({ flightMotion, levelFlightSpeed: () => 100, playerHullRadius: 26,
    createShip: () => ({visible: false, position: new Vector3(), userData: {previousPosition: new Vector3()}}),
    resetShip(rock, _initial, _slot, tierLimit) { rock.visible = true; rock.tierLimit = tierLimit; },
    spawn: { asteroidArrivalDistance: () => arrivalDistance, setAsteroidCrossing(rock) { rock.position.x += 12; } },
    forecastFlightPosition(position, steps) { forecasts.push(steps); position.set(0, 0, -steps); }
  });
  return {crossings, flightMotion, forecasts};
}

test('schedule from course start, skip missed intervals and reuse only invisible rocks', () => {
  const {crossings, forecasts} = flybys();
  crossings.start(50); // A tutorial can end well after the ordinary round duration.
  crossings.update(51.99, 0); assert.equal(crossings.rocks.length, 0);
  crossings.update(52, 0);
  const rock = crossings.rocks[0];
  assert.equal(rock.userData.scheduledHazard, true);
  assert.deepEqual(forecasts, [180], 'Allow at least three seconds on a 60 Hz course');
  assert.equal(rock.userData.approachTime, 3);
  assert.deepEqual(rock.userData.previousPosition.toArray(), [12, 0, -180]);
  assert.equal(rock.tierLimit, 3);
  rock.visible = false;
  crossings.update(100, 0); crossings.update(100, 0);
  assert.deepEqual(crossings.rocks, [rock]);
  assert.equal(rock.visible, true); assert.equal(forecasts.length, 2);
  crossings.update(100 + 5 / .75, 0); crossings.update(120, 0);
  assert.equal(crossings.rocks.length, 2); assert.equal(forecasts.length, 3, 'Do not move a visible rock to make room');
});

test('wait for cruise recovery; an overspeed approach still starts beyond the fade boundary', () => {
  const {crossings, flightMotion, forecasts} = flybys(500);
  flightMotion.z = -89; crossings.update(2, 0);
  assert.equal(crossings.rocks.length, 0);
  flightMotion.z = -200; crossings.update(2, 0);
  assert.deepEqual(forecasts, [389], 'Allow 500 distance plus 0.3 s at incoming speed, at no more than cruise speed');
  assert.equal(crossings.rocks[0].tierLimit, 3);
});
