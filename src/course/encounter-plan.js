import * as THREE from '../../assets/vendor/three.module.js';

export const roundDuration = 45, firstCheckpointTime = 5;

export function getAsteroidEncounters(level) {
  const boss = level % 4 === 0;
  const strength = Math.max(0, Math.min(2, Math.floor((level - 1) / 2)) - (boss ? 1 : 0));
  const shape = level < 5 ? 0 : 1 + Math.floor((level - 5) / 2) % 2;
  const direction = [0, 1, 0, 1, 0, 1, 0, 1, 2, 3][(level - 1) % 10];
  const bend = shape === 0 ? 0 : (level % 2 ? 1 : -1) * 3.5;
  const encounter = (kind, prepare, entry, exit, intensity = strength) => ({ kind, prepare, entry, exit,
    strength: intensity, shape: kind === 'corridor' ? shape : 0, direction, bend });
  // A gentle field first, then a short shower after a breather; keep the opening clear.
  if (level === 1) return [encounter('field', 6, 12, 17, 0), encounter('shower', 18, 24, 32, 0)];
  // A brief, wide, straight corridor introduces passage flying with roughly fifteen seconds remaining.
  if (level === 2) return [encounter('field', 0, 8, 12, 0), encounter('shower', 14, 20, 22, 0),
    encounter('corridor', 25, 31, 36, 0)];
  // Tighten the follow-ups and add debris to the finale, not narrower openings.
  if (level === 3) return [encounter('corridor', 0, 8, 20, 1), encounter('shower', 20.5, 25, 29, 1), encounter('field', 29.5, 34, 38, 2)];
  // The first boss arrives during the warm-up's exit and retreats at 28, clear by the finale at 32.
  if (level === 4) return [encounter('field', 0, 5, 8, 0), encounter('field', 26, 32, 37, 1)];
  return [encounter('field', 0, 5, 8, Math.max(0, strength - 1)),
    encounter('shower', 11, 16, 20), encounter('corridor', 23, 28, 36)];
}

// Times on the authored event are relative to the start of the course, not the game clock.
export function planEncounterLayout(event, { courseOrigin, level, roundDuration, levelFlightSpeed, flightDistanceAt, maxShowerRocks }) {
  const { kind, prepare, entry, exit, strength, direction: course } = event;
  const corridor = kind === 'corridor';
  const duration = exit - entry;
  const velocity = new THREE.Vector3(); // Fields and corridors are stationary in course space.
  if (kind === 'shower') {
    if (course < 2) velocity.set(course === 0 ? -1 : 1, 0, .55);
    else velocity.set(0, course === 2 ? .2 : -.2, 1);
    const courseSpeed = levelFlightSpeed(entry / roundDuration) * .85;
    velocity.normalize().multiplyScalar(Math.max(220, courseSpeed * .9));
  }

  // Align the leading and trailing planes with player travel at the authored entry and exit.
  const entryDepth = flightDistanceAt(entry);
  const direction = velocity.clone().multiplyScalar(-duration);
  direction.z -= flightDistanceAt(exit) - entryDepth;
  const length = direction.length();
  const approachSpeed = length / duration;
  direction.normalize();
  const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), direction);
  const crossingOffset = new THREE.Vector3();
  if (kind === 'shower') {
    crossingOffset.set(course < 2 ? Math.sign(velocity.x) : 0, course >= 2 ? Math.sign(velocity.y) * .2 : 0, 0)
      .multiplyScalar(600);
    // Offset within the entry plane: visible sideways rain without changing its arrival time.
    crossingOffset.addScaledVector(direction, -crossingOffset.dot(direction));
  }
  const origin = courseOrigin.clone().add(crossingOffset).add(new THREE.Vector3(0, 0, -entryDepth))
    .addScaledVector(velocity, -(entry - prepare));
  const lead = origin.clone().sub(courseOrigin).add(new THREE.Vector3(0, 0, flightDistanceAt(prepare))).length();

  const rocksPerSlice = corridor ? [8, 12, 16][strength] : [3, 6, 9][strength];
  const sliceSpacing = corridor ? Math.max(160, approachSpeed * [1.15, .9, .7][strength])
    : Math.max(120, approachSpeed * [2.5, 1.4, .85][strength]);
  const spacing = Math.max(sliceSpacing, (Math.min(lead, length) + 200) * (rocksPerSlice + 1) / (maxShowerRocks * .75));
  const obstacleSpacing = Math.max(260, approachSpeed * [2.2, 1.8, 1.5][strength] * (level >= 5 && corridor ? .5 : 1));
  const firstObstacle = corridor && level >= 5 ? length * .22 : spacing;
  const gap = 52 - strength * 7;
  const halfWidth = corridor ? 900 : 650;
  const bend = event.bend * gap;
  const shape = corridor ? event.shape : 0;
  const maxSlope = shape === 0 ? 0 : Math.abs(bend) * Math.PI / (.6 * length);
  return { origin, rotation, velocity, direction, entry, length, rocksPerSlice, spacing, obstacleSpacing, firstObstacle,
    gap, halfWidth, bend, shape, maxSlope };
}

export function corridorHeightAt(distance, plan) {
  if (plan.shape === 0) return 0;
  const progress = THREE.MathUtils.clamp(distance / plan.length, 0, 1);
  // Straight entry/exit, then a legible turn rather than a shallow full-length drift.
  const turn = THREE.MathUtils.clamp((progress - .2) / .6, 0, 1);
  const curve = plan.shape === 1 ? Math.pow(Math.sin(Math.PI * turn), 2) : THREE.MathUtils.smoothstep(turn, 0, 1);
  return plan.bend * curve;
}
