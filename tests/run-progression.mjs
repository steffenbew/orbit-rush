import assert from 'node:assert/strict';
import { test } from 'node:test';
import { livesAfterImpact, newRun, nextRoundProgress, roundOutcome } from '../src/run/progression.js';

test('advance saves score and kills at level entry and carries damaged shield forward', () => {
  const run = { ...newRun(), score: 410, kills: 7, shield: 62, retries: 2 };
  const next = nextRoundProgress(run, roundOutcome(true, run.retries));
  assert.deepEqual(next, { level: 2, score: 410, kills: 7, retries: 2, shield: 62, levelCheckpoint: { score: 410, kills: 7 } });
  assert.equal(run.level, 1);
});

test('each impact spends a life; retry restores the checkpoint, not mid-flight gains', () => {
  let run = { ...newRun(), level: 5, levelCheckpoint: { score: 2000, kills: 12 } };
  for (const remaining of [2, 1, 0]) {
    run.score += 1000; run.kills += 3; run.shield = 0;
    run.retries = livesAfterImpact(run.retries);
    assert.equal(run.retries, remaining);
    const outcome = roundOutcome(false, run.retries);
    assert.equal(outcome, remaining ? 'retry' : 'gameover');
    const next = nextRoundProgress(run, outcome);
    if (remaining) {
      assert.deepEqual(next, { level: 5, retries: remaining, shield: 100, score: 2000, kills: 12, levelCheckpoint: { score: 2000, kills: 12 } });
    } else {
      assert.deepEqual(next, newRun());
      assert.notEqual(next.levelCheckpoint, run.levelCheckpoint);
    }
    run = next;
  }
});
