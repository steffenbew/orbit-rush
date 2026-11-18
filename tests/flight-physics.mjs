import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Euler, Vector2, Vector3 } from '../assets/vendor/three.module.js';
import { alignFlightAfterRebound, advanceFlightMotion, advanceFlightHeading, flightDistanceAt, levelFlightSpeed } from '../src/flight/physics.js';

test('level speed follows the normal and reduced-motion curves, including late levels', () => {
  for (const reducedMotion of [false, true]) for (const level of [1, 2, 4, 8, 20, 1000]) {
    const pace = (reducedMotion ? 1 : 1.15) * (1 + (reducedMotion ? .22 : .26) * Math.log(level));
    for (const progress of [0, .25, .5, .75, 1]) {
      const opening = level === 1 ? 205 : 300;
      const baseline = reducedMotion ? 35 + 8 * progress : 1.86 * 1.15 * (opening + (380 - opening) * Math.pow(progress, 1.15));
      assert.ok(Math.abs(levelFlightSpeed(level, reducedMotion, progress) / baseline - pace) < 1e-8);
      assert.ok(pace >= 1);
    }
  }
  for (const reduced of [false, true]) {
    const opening = levelFlightSpeed(1, reduced, 0), peak = levelFlightSpeed(1, reduced, 1);
    assert.ok(Math.abs(opening - (reduced ? 35 : 504.26925)) < 1e-8);
    assert.ok(Math.abs(peak - (reduced ? 43 : 934.743)) < 1e-8);
    const ratio = level => levelFlightSpeed(level, reduced, 1) / peak;
    assert.ok(ratio(4) > (reduced ? 1.3 : 1.36) && ratio(4) < (reduced ? 1.32 : 1.37), 'Level four scales by 36%, or the unchanged 30% in reduced motion');
    assert.ok(ratio(8) > (reduced ? 1.45 : 1.54) && ratio(8) < (reduced ? 1.47 : 1.55), 'Level eight scales by 54%, or the unchanged 46% in reduced motion');
    assert.ok(ratio(12) > 1.5, 'Speed keeps climbing beyond +50%');
    for (let level = 2; level <= 1000; level++) {
      assert.ok(ratio(level) > ratio(level - 1), 'No late-level speed plateau');
      if (level > 2) assert.ok(ratio(level) - ratio(level - 1) < ratio(level - 1) - ratio(level - 2),
        'Increments taper without imposing a hard cap');
    }
  }
  for (let level = 2; level <= 1000; level++) {
    const previousPeak = levelFlightSpeed(level - 1, false, 1);
    const opening = levelFlightSpeed(level, false, 0);
    assert.ok(opening > previousPeak * .78 && opening < previousPeak,
      'New levels offer a modest breather without dropping more than 22% of the previous peak speed');
  }
  const midpoint = levelFlightSpeed(1, false, .5);
  assert.ok(midpoint > 697 && midpoint < 699, 'The gentler level-one opening reaches about 698 halfway through');
});

test('course distance counts complete physics ticks from a standing start', () => {
  const rules = { level: 1, reducedMotion: false, roundDuration: 45, simulationStep: 1 / 60 };
  const dt = rules.simulationStep;
  assert.equal(flightDistanceAt(0, rules), 0);
  assert.equal(flightDistanceAt(dt / 2, rules), 0);
  const firstTick = levelFlightSpeed(1, false, dt / 45) * (1 - Math.exp(-3 * dt)) * .85 * dt;
  assert.equal(flightDistanceAt(dt, rules), firstTick);
  assert.equal(flightDistanceAt(1.5 * dt, rules), firstTick);
  // Checkpoint depths from before the extraction, including a fractional time.
  for (const [time, level, reducedMotion, expected] of [
    [5, 1, false, 2063.253317855459], [37, 3, false, 32476.89146610954],
    [22.07, 2, true, 786.6488604975943], [45, 100, true, 2979.3253350220066]
  ]) assert.ok(Math.abs(flightDistanceAt(time, { ...rules, level, reducedMotion }) - expected) < 1e-8);
});

test('a powered tick eases forward speed and adds decaying impact drift in world coordinates', () => {
  const dt = 1 / 60, drift = new Vector2(24, -12), velocity = new Vector3();
  const orientation = new Euler(.2, -.3, 0, 'YXZ');
  const speed = advanceFlightMotion(dt, { speed: 160, cruiseSpeed: 400, orientation, turn: new Vector2(),
    input: new Vector2(), drift, velocity, reducedMotion: false });
  assert.ok(Math.abs(speed - (400 - 240 * Math.exp(-3 * dt))) < 1e-12);
  assert.ok(drift.distanceTo(new Vector2(24, -12).multiplyScalar(Math.exp(-2 * dt))) < 1e-12);
  const forward = new Vector3(0, 0, -speed).applyEuler(orientation);
  assert.ok(velocity.distanceTo(forward.add(new Vector3(drift.x, drift.y, 0))) < 1e-12);
});

test('glancing rebounds stay inward at both steering limits without losing forward travel or snapping the view', () => {
  // Already reflected: each lateral velocity is nearly tangent to its wall.
  for (const [x, y, nx, ny, limitedAxis] of [[160, 80, -1, 1.98, 'y'], [80, 200, 2.48, -1, 'x']]) {
    const velocity = new Vector3(x, y, -100), direction = new Vector3(), normal = new Vector3(nx, ny, 0);
    const orientation = new Euler(.3, -.2, 0, 'YXZ'), viewOffset = new Vector2(.04, -.01);
    const oldView = new Vector2(orientation.x, orientation.y).add(viewOffset);
    const drift = new Vector2(12, -6), turn = new Vector2(.2, -.1);
    const speed = alignFlightAfterRebound({ velocity, direction, orientation, viewOffset, drift, turn });
    assert.ok(velocity.dot(normal) < 0, 'Do not steer back into the wall');
    assert.ok(Math.abs(velocity.x / velocity.y - x / y) < 1e-10);
    assert.ok(Math.abs(velocity.z + 100) < 1e-10);
    assert.ok(Math.abs(velocity.length() - speed) < 1e-10);
    assert.ok(Math.abs(orientation.x) <= Math.PI / 4 && Math.abs(orientation.y) <= Math.PI / 4);
    assert.ok(Math.abs(Math.abs(orientation[limitedAxis]) - Math.PI / 4) < 1e-10);
    assert.ok(new Vector2(orientation.x, orientation.y).add(viewOffset).distanceTo(oldView) < 1e-10);
    assert.equal(drift.length() + turn.length(), 0);
  }
});

test('steering builds turn rate, coasts on release, and respects the heading cone', () => {
  for (const reduced of [false, true]) {
    const orientation = { x: 0, y: 0 }, turn = { x: 0, y: 0 };
    const input = { x: 1, y: 1 }, dt = 1 / 60, response = 1 - Math.exp(-4 * dt);
    advanceFlightHeading(orientation, turn, input, dt, reduced);
    assert.equal(turn.x, -.9 * (reduced ? .5 : 1) * response);
    assert.equal(turn.y, .65 * (reduced ? .5 : 1) * response);
    const yaw = orientation.y, yawRate = turn.x;
    advanceFlightHeading(orientation, turn, { x: 0, y: 0 }, dt, reduced);
    assert.ok(orientation.y < yaw && turn.x > yawRate && turn.x < 0);
    for (let i = 0; i < 1800; i++) advanceFlightHeading(orientation, turn, input, dt, reduced);
    const limit = Math.PI / 4;
    assert.ok(orientation.y >= -limit && orientation.y < -limit * .98);
    assert.ok(orientation.x <= limit && orientation.x > limit * .98);
    advanceFlightHeading(orientation, turn, { x: -1, y: -1 }, .1, reduced);
    assert.ok(turn.x > 0 && turn.y < 0, 'Countersteering immediately turns back into the cone');
  }
});
