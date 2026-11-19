import { Euler, MathUtils, Vector2, Vector3 } from '../../assets/vendor/three.module.js';

const headingLimit = Math.PI / 4;
const headingSlope = Math.tan(headingLimit);

export function levelFlightSpeed(level, progress) {
  // Normal flight: +36% at level 4 and +54% at level 8, with uncapped logarithmic growth.
  const pace = 1.15 * (1 + .26 * Math.log(level));
  const opening = level === 1 ? 205 : 300;
  return pace * (1.86 * 1.15 * (opening + (380 - opening) * Math.pow(progress, 1.15)));
}

function nextForwardSpeed(speed, cruiseSpeed, dt) {
  return speed + (cruiseSpeed - speed) * (1 - Math.exp(-3 * dt));
}

// One normal-flight tick. Update the supplied vectors in place and return forward speed
// separately: an impact adds lateral drift, not thrust.
export function advanceFlightMotion(dt, { speed, cruiseSpeed, orientation, turn, input, drift, velocity }) {
  const forward = nextForwardSpeed(speed, cruiseSpeed, dt);
  advanceFlightHeading(orientation, turn, input, dt);
  drift.multiplyScalar(Math.exp(-2 * dt));
  velocity.set(0, 0, -forward).applyEuler(orientation);
  velocity.x += drift.x; velocity.y += drift.y;
  return forward;
}

// Live aircraft state. Forecasts use the same motion step without updating the pilot's bank.
export function createPlayerFlight() {
  const target = new Vector2();
  const flightVelocity = new Vector2(); // Temporary world-space impact drift.
  const flightTurn = new Vector2(); // Inertial yaw/pitch rates, not lateral speed.
  const flightTilt = new Vector3();
  const flightViewOffset = new Vector2(); // Smooth camera recovery after a barrier rebound.
  const flightMotion = new Vector3();
  const flightDirection = new Vector3(0, 0, -1);
  const flightOrientation = new Euler(0, 0, 0, 'YXZ');

  function advance(dt, speed, cruiseSpeed) {
    speed = advanceFlightMotion(dt, { speed, cruiseSpeed, orientation: flightOrientation, turn: flightTurn,
      input: target, drift: flightVelocity, velocity: flightMotion });
    flightDirection.copy(flightMotion).normalize();
    flightViewOffset.multiplyScalar(Math.exp(-8 * dt));
    flightTilt.x = flightOrientation.x + flightViewOffset.x;
    flightTilt.y = flightOrientation.y + flightViewOffset.y;
    // Full input can bank sideways even at the heading limit; small turns stay gentle.
    const bankInput = MathUtils.clamp(-target.x, -1, 1);
    const bank = bankInput * Math.abs(bankInput) * Math.PI / 2;
    const bankStep = (bank - flightTilt.z) * (1 - Math.exp(-1.2 * dt));
    // Limit roll speed too: reversing input must not whip the aircraft across 180 degrees.
    const maxBankStep = 50 * Math.PI / 180 * dt;
    flightTilt.z += MathUtils.clamp(bankStep, -maxBankStep, maxBankStep);
    return speed;
  }
  return { advance, target, flightVelocity, flightTurn, flightTilt, flightViewOffset, flightMotion, flightDirection, flightOrientation };
}

export function flightDistanceAt(time, { level, roundDuration, simulationStep }) {
  // Integrate the same acceleration and world movement as a straight, uninterrupted flight.
  let forward = 0, distance = 0;
  for (let step = 1; step * simulationStep <= time + 1e-8; step++) {
    const progress = step * simulationStep / roundDuration;
    forward = nextForwardSpeed(forward, levelFlightSpeed(level, progress), simulationStep);
    distance += forward * .85 * simulationStep;
  }
  return distance;
}

// Add lateral drift away from the blast and return the local strength for camera feedback.
export function applyBlastImpulse(origin, sizeFactor, { playerPosition, speed, drift }) {
  const distance = playerPosition.distanceTo(origin);
  const energy = MathUtils.clamp(Math.sqrt(sizeFactor), .2, 1.5);
  const proximity = Math.max(0, 1 - distance / (700 * energy));
  const strength = energy * proximity * proximity;
  if (strength === 0) return 0;

  const impulse = MathUtils.clamp(speed * .35, 80, 160) * strength;
  const divisor = Math.max(1, distance);
  drift.x += (playerPosition.x - origin.x) / divisor * impulse;
  drift.y += (playerPosition.y - origin.y) / divisor * impulse;
  drift.clampLength(0, Math.max(180, speed * 1.6));
  return strength;
}

// The boundary has already reflected velocity. Keep its inward lateral direction and forward travel.
export function alignFlightAfterRebound({ velocity, direction, orientation, viewOffset, drift, turn }) {
  const forward = -velocity.z, maxSideways = forward * headingSlope;
  // Scale both lateral axes together: separate angle clamps can turn a grazing rebound outward.
  let scale = 1;
  if (Math.abs(velocity.x) > maxSideways) scale = maxSideways / Math.abs(velocity.x);
  // Pitch is measured above the XZ plane: |vy| <= tan(limit) * hypot(vx, vz).
  const pitchExcess = velocity.y ** 2 - (velocity.x * headingSlope) ** 2;
  if (pitchExcess > maxSideways ** 2) scale = Math.min(scale, maxSideways / Math.sqrt(pitchExcess));
  velocity.x *= scale; velocity.y *= scale;
  direction.copy(velocity).normalize();
  const pitch = MathUtils.clamp(Math.asin(direction.y), -headingLimit, headingLimit);
  const yaw = MathUtils.clamp(Math.atan2(-direction.x, -direction.z), -headingLimit, headingLimit);
  viewOffset.x += orientation.x - pitch;
  viewOffset.y += orientation.y - yaw;
  orientation.set(pitch, yaw, 0, 'YXZ');
  direction.set(0, 0, -1).applyEuler(orientation);
  const speed = forward / -direction.z;
  velocity.copy(direction).multiplyScalar(speed);
  drift.set(0, 0); turn.set(0, 0);
  return speed;
}

export function advanceFlightHeading(orientation, turn, target, dt) {
  // Mutate orientation and turn in place. Neutral input damps the turn rate, not the heading.
  const response = 1 - Math.exp(-4 * dt);
  let yaw = -target.x * .9, pitch = target.y * .65;
  // Ease outward input over the last 30% of the cone. Turning inward stays responsive.
  if (orientation.y * yaw > 0) yaw *= 1 - MathUtils.smoothstep(Math.abs(orientation.y), headingLimit * .7, headingLimit);
  if (orientation.x * pitch > 0) pitch *= 1 - MathUtils.smoothstep(Math.abs(orientation.x), headingLimit * .7, headingLimit);
  orientation.y += yaw * dt + (turn.x - yaw) * response / 4;
  orientation.x += pitch * dt + (turn.y - pitch) * response / 4;
  turn.x += (yaw - turn.x) * response;
  turn.y += (pitch - turn.y) * response;
  // Stop any residual outward inertia at the edge; never pull the nose back to center.
  orientation.y = MathUtils.clamp(orientation.y, -headingLimit, headingLimit);
  orientation.x = MathUtils.clamp(orientation.x, -headingLimit, headingLimit);
  if (Math.abs(orientation.y) === headingLimit && Math.sign(turn.x) === Math.sign(orientation.y)) turn.x = 0;
  if (Math.abs(orientation.x) === headingLimit && Math.sign(turn.y) === Math.sign(orientation.x)) turn.y = 0;
}
