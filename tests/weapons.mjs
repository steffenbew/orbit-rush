import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advanceWeapons, createWeapons, requestShot } from '../src/weapons/rules.js';

test('normal fire has a 100 ms cadence; heavy fire uses an independent charge', () => {
  const w = createWeapons();
  assert.equal(requestShot(w, 0, false, false), 'shot');
  assert.equal(requestShot(w, .099, false, true), null);
  assert.equal(requestShot(w, .1, false, false), 'shot');
  assert.equal(requestShot(w, .1, true, false), 'shot');
  assert.equal(w.heat, 13.4); assert.equal(w.heavyCharge, 0);
  advanceWeapons(w, .9, .8);
  assert.ok(w.heavyCharge < 1);
  advanceWeapons(w, .92, .02);
  assert.equal(w.heavyCharge, 1);
});

test('cooling starts 200 ms after firing; overheat starts cooling immediately but locks until empty', () => {
  const w = createWeapons();
  requestShot(w, 0, false);
  advanceWeapons(w, .2, .2); assert.equal(w.heat, 6.7);
  advanceWeapons(w, .21, .02); assert.ok(Math.abs(w.heat - 6.37) < 1e-9);
  for (let i = 1; i <= 15; i++) requestShot(w, i / 10, false);
  assert.equal(w.heat, 100); assert.ok(w.overheated);
  advanceWeapons(w, 1.6, .1); assert.equal(w.heat, 96.7);
  assert.equal(requestShot(w, 1.6, false, true), 'empty');
  assert.equal(requestShot(w, 1.6, true, true), 'shot', 'The heavy gun does not share the heat lock');
  advanceWeapons(w, 4.6, 3);
  assert.equal(w.overheated, false); assert.equal(w.heat, 0);
  assert.equal(requestShot(w, 4.6, false), 'shot');
});

test('a fresh press clicks when empty; held empty feedback is rate-limited', () => {
  const w = createWeapons();
  requestShot(w, 0, false); requestShot(w, 0, true);
  assert.equal(requestShot(w, .01, true, false), null);
  assert.equal(requestShot(w, .01, true, true), 'empty');
  assert.equal(requestShot(w, .02, true, true), 'empty');
  assert.equal(requestShot(w, .319, true, false), null);
  assert.equal(requestShot(w, .32, true, false), 'empty');
});
