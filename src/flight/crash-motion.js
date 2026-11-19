import { Euler, Quaternion, Vector3 } from '../../assets/vendor/three.module.js';

// Cosmetic flight only. The run owns pause, lives and the transition to results.
export function createCrashMotion({ flightOrientation, flightTilt, flightViewOffset,
  flightVelocity, flightMotion, flightDirection }) {
  const spin = new Vector3(), axis = new Vector3();
  const rotation = new Quaternion(), step = new Quaternion();
  let coastSpeed = 0;

  function begin(speed, localContact) {
    coastSpeed = Math.min(120, speed * .08);
    const awayX = localContact.x > 0 ? -1 : 1, awayY = localContact.y > 0 ? -1 : 1;
    spin.set(awayY * .09, -awayX * .12, -awayX * .55);
    // Bank is part of the attitude: the tumble axes belong to the aircraft.
    rotation.setFromEuler(new Euler(flightOrientation.x, flightOrientation.y, flightTilt.z, 'YXZ'));
  }

  function advance(dt, speed) {
    speed += (coastSpeed - speed) * (1 - Math.exp(-.9 * dt));
    const decay = Math.exp(-.85 * dt), spinSpeed = spin.length();
    if (spinSpeed > 0) {
      axis.copy(spin).divideScalar(spinSpeed);
      step.setFromAxisAngle(axis, spinSpeed * ((1 - decay) / .85));
      rotation.multiply(step);
      flightOrientation.setFromQuaternion(rotation, 'YXZ');
      flightTilt.set(flightOrientation.x + flightViewOffset.x, flightOrientation.y + flightViewOffset.y, flightOrientation.z);
    }
    spin.multiplyScalar(decay);
    flightVelocity.multiplyScalar(Math.exp(-2 * dt));
    flightMotion.set(0, 0, -speed).applyEuler(flightOrientation);
    flightMotion.x += flightVelocity.x; flightMotion.y += flightVelocity.y;
    flightDirection.copy(flightMotion).normalize();
    return speed;
  }

  function reset() {
    coastSpeed = 0; spin.set(0, 0, 0); rotation.identity();
  }
  return { begin, advance, reset };
}
