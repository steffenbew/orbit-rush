import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFleetArrivals } from '../src/fleet/arrivals.js';

test('a cleared wave waits three seconds or a checkpoint; a late tick releases only one ship', () => {
  const ships = Array.from({length: 4}, () => ({visible: false, userData: {type: {}}}));
  const gate = {userData: {passedAt: -Infinity}};
  const arrivals = createFleetArrivals({ ships, flightRings: [gate], roundDuration: 45, progressionTimeScale: 1.5,
    resetShip: ship => { ship.visible = true; } });
  arrivals.reset(ships.slice(1));
  ships[0].visible = true; arrivals.queueShip(ships[0], 10);
  const tick = time => arrivals.advance(time, time, 1, null);
  tick(12); assert.equal(ships.some(ship => ship.visible), false);
  gate.userData.passedAt = 12; tick(12); assert.equal(ships[1].visible, true);
  tick(25); assert.equal(ships.filter(ship => ship.visible).length, 2);
  tick(25); assert.equal(arrivals.queue.length, 2);
  arrivals.queueShip(ships[2], 25); tick(27.99); assert.equal(ships[3].visible, false);
  tick(28); assert.equal(ships[3].visible, true);
});
