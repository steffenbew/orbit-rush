import assert from 'node:assert/strict';
import test from 'node:test';
import { createFlightTutorial } from '../src/run/tutorial.js';

test('only the current action starts its success delay; duplicate hits cannot restart it', () => {
  const tutorial = createFlightTutorial();
  assert.equal(tutorial.begin(1, false), true);
  tutorial.complete('laser', 0);
  assert.equal(tutorial.advance(60), false);
  for (const [action, now, delay] of [['checkpoint', 100, .7], ['laser', 110, .7], ['heavy', 120, 1.3]]) {
    assert.equal(tutorial.lesson.action, action);
    tutorial.complete(action, now);
    tutorial.complete(action, now + .4);
    assert.equal(tutorial.advance(now + delay - .01), false);
    assert.equal(tutorial.advance(now + delay + .01), true);
  }
  assert.equal(tutorial.active, false);
  assert.equal(tutorial.advance(122), false, 'Only one handoff to the timed course');
  assert.equal(tutorial.showingGo(122), true);
  assert.equal(tutorial.showingGo(123), false);
  assert.equal(tutorial.begin(1, true), false);
  assert.equal(tutorial.showingGo(0), false, 'Retry resets the clock and must clear GO');
  assert.equal(tutorial.begin(2, false), false);
});

test('a missed checkpoint offers one retry; restarting or passing cancels a pending retry', () => {
  const tutorial = createFlightTutorial();
  tutorial.begin(1, false);
  tutorial.missCheckpoint(0);
  assert.equal(tutorial.takeCheckpointRetry(1.19), false);
  assert.equal(tutorial.takeCheckpointRetry(1.2), true);
  assert.equal(tutorial.takeCheckpointRetry(2), false);
  tutorial.missCheckpoint(3);
  tutorial.begin(1, false);
  assert.equal(tutorial.takeCheckpointRetry(6), false);
  tutorial.missCheckpoint(7);
  tutorial.complete('checkpoint', 8);
  assert.equal(tutorial.takeCheckpointRetry(8.3), false);
});
