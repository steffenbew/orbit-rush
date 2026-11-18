import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shipTypes } from '../src/fleet/models.js';
import { createFleetRoster, initialFleetTypes } from '../src/fleet/roster.js';

function pool(withIntroBoss) {
  const ships = [];
  const allocate = type => {
    const ship = { userData: { type: shipTypes[type] } };
    ships.push(ship);
    return ship;
  };
  initialFleetTypes.forEach(allocate);
  const introBoss = withIntroBoss ? allocate(4) : null;
  return { ships, introBoss, roster: createFleetRoster(ships, allocate) };
}

test('the same level reuses exactly the same opening pair and scheduled hulls', () => {
  const { ships, roster } = pool(true);
  const first = roster.forLevel(8), allocation = ships.length;
  const retry = roster.forLevel(8);
  assert.equal(ships.length, allocation);
  assert.equal(first.fleet.length, new Set(first.fleet).size);
  assert.equal(first.fleet[0], ships[0]); assert.equal(first.fleet[1], ships[3]);
  retry.fleet.forEach((hull, i) => assert.equal(hull, first.fleet[i]));
  assert.equal(first.fleet.filter(hull => hull.userData.stationary).length, 3);
  // A lower level can need more of its one unlocked class than level eight did.
  const restart = roster.forLevel(1);
  assert.ok(restart.fleet.every(({userData}) => userData.type === shipTypes[0] || userData.type.asteroid));
  const afterRestart = ships.length;
  roster.forLevel(1);
  assert.equal(ships.length, afterRestart);
});

test('the boss gets its own schedule, never a slot in regular traffic', () => {
  for (const withIntroBoss of [true, false]) {
    const { roster, ships, introBoss } = pool(withIntroBoss);
    let boss = introBoss;
    for (const level of [1, 2, 4, 5, 8, 1]) {
      const { fleet, capital, capitalPending } = roster.forLevel(level);
      assert.equal(capitalPending, level % 4 === 0);
      if (!boss && capitalPending) boss = capital;
      assert.equal(capital, boss);
      assert.ok(!fleet.includes(capital));
      assert.equal(ships.filter(hull => hull.userData.type.capital).length, boss ? 1 : 0);
    }
  }
});
