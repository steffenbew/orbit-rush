import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSimulationClock, simulationStep } from '../src/flight/simulation-clock.js';

test('partial frames accumulate; a long stall advances at most a quarter second', () => {
  const steps = [];
  const clock = createSimulationClock(dt => steps.push(dt));
  clock.advance(simulationStep / 2); assert.equal(steps.length, 0);
  clock.advance(simulationStep / 2); assert.deepEqual(steps, [simulationStep]);
  clock.advance(60); assert.equal(steps.length, 16);
});

test('pausing mid-tick discards backlog; reset discards partial frames', () => {
  let ticks = 0, paused = false;
  const clock = createSimulationClock(() => { ticks++; paused = true; }, () => paused);
  clock.advance(.25); assert.equal(ticks, 1); assert.equal(clock.remainder, 0);
  clock.advance(1); assert.equal(ticks, 1);
  paused = false;
  clock.advance(.01); clock.reset(); clock.advance(.01); assert.equal(ticks, 1);
});
