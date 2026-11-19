import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getAsteroidEncounters } from '../src/course/encounter-plan.js';
import { planCheckpoints } from '../src/course/checkpoints.js';

const flight = { level: 1, roundDuration: 45, firstCheckpointTime: 5,
  flightDistanceAt: time => time * 100, levelFlightSpeed: () => 100, originZ: 120 };

test('tutorial handoff shortens only the second approach, not its reinforcement schedule', () => {
  const opening = planCheckpoints(flight);
  const handoff = planCheckpoints({ ...flight, openingComplete: true });
  assert.deepEqual(opening.map(g => g.depth), [500, 1200, 2200, 3200, 4000]);
  assert.deepEqual(handoff.map(g => g.depth), [500, 1000, 2200, 3200, 4000]);
  assert.equal(handoff[1].reinforcementDepth, opening[1].reinforcementDepth);
  assert.deepEqual(handoff.map(g => g.kind), ['start', 'course', 'course', 'course', 'finish']);
});

test('corridor gates keep their clearance and exit height', () => {
  const { entry, exit } = getAsteroidEncounters(3).find(event => event.kind === 'corridor');
  const entrance = flight.flightDistanceAt(entry), length = flight.flightDistanceAt(exit) - entrance;
  const corridorPlan = { entry, length, origin: { z: flight.originZ - entrance } };
  const gates = planCheckpoints({ ...flight, level: 3, corridorPlan, exitHeightAtCorridor: 30 });
  const approach = gates.find(g => g.kind === 'approach');
  assert.ok(approach.depth <= entrance - 3 * approach.radius);
  assert.ok(gates.every(g => g.depth < entrance || g.depth > entrance + length));
  assert.deepEqual(gates.map(g => g.depth), gates.map(g => g.depth).sort((a, b) => a - b));
  assert.equal(gates.at(-2).depth, 3700);
  assert.equal(gates.at(-1).y, 30);
  assert.ok(gates.every(g => g.radius === 80));
});
