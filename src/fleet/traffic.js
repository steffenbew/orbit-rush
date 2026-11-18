import * as THREE from '../../assets/vendor/three.module.js';
import { setShipOpacity } from './visuals.js';

// Intrinsic movement only. Player travel translates the whole world separately.
export function advanceShipMotion(ship, dt, reducedMotion) {
  const data = ship.userData;
  ship.position.addScaledVector(data.courseVelocity, dt);
  // Ignore player travel: stationary or barely drifting rocks (≤5 units/s) do not tumble.
  if (data.type.asteroid && !reducedMotion && data.courseVelocity.lengthSq() > 25) {
    ship.rotation.x += data.spin.x * dt;
    ship.rotation.y += data.spin.y * dt;
    ship.rotation.z += data.spin.z * dt;
  }
  data.hitFlash = Math.max(0, data.hitFlash - dt);
}

export function createFleetTraffic({ camera, flightMotion, reducedMotion, random, isFlightActive, constrainShipToBoundary }) {
  function updateEngineThrust(ship, previousForwardSpeed, dt) {
    if (dt === 0) return;
    const data = ship.userData;
    const forwardSpeed = data.courseVelocity.dot(data.cruiseDirection);
    const acceleration = (forwardSpeed - previousForwardSpeed) / dt;
    // Real forward acceleration, not a decorative timer, drives the visible boost.
    const flightSpeed = flightMotion.length();
    const demand = THREE.MathUtils.clamp(.18 + Math.max(0, forwardSpeed) / Math.max(80, flightSpeed * .85) * .25
      + Math.max(0, acceleration) / Math.max(20, flightSpeed * .18), .18, 1);
    const response = demand > data.engineThrust ? 6 : 2;
    data.engineThrust += (demand - data.engineThrust) * (1 - Math.exp(-response * dt));
  }
  const activeAsteroids = [];
  const avoidance = new THREE.Vector3(), avoidanceOffset = new THREE.Vector3();
  const avoidanceRelative = new THREE.Vector3(), avoidanceEscape = new THREE.Vector3();
  function avoidAsteroids(ship, desired, strength = 1) {
    const data = ship.userData;
    const lookAhead = (data.type.capital ? 2.4 : 1.6) * data.dodgeSkill;
    const reach = desired.length() * lookAhead;
    avoidance.set(0, 0, 0);
    for (const rock of activeAsteroids) {
      if (!rock.visible) continue;
      const offset = avoidanceOffset.subVectors(rock.position, ship.position);
      const clearance = data.type.radius * ship.scale.x + rock.userData.type.radius * rock.scale.x + 20;
      if (offset.lengthSq() > (reach + clearance) * (reach + clearance)) continue;
      const relative = avoidanceRelative.subVectors(rock.userData.courseVelocity, desired);
      const time = THREE.MathUtils.clamp(-offset.dot(relative) / Math.max(1, relative.lengthSq()), 0, lookAhead);
      const closest = offset.addScaledVector(relative, time);
      if (closest.lengthSq() >= clearance * clearance) continue;
      // Turn across the travel axis; inertia and late reactions can still cause crashes.
      const escape = avoidanceEscape.copy(data.courseRight).multiplyScalar(-closest.dot(data.courseRight))
        .addScaledVector(data.courseUp, -closest.dot(data.courseUp));
      if (escape.lengthSq() < 1) escape.copy(data.courseRight).multiplyScalar(data.slot % 2 ? 1 : -1);
      avoidance.addScaledVector(escape.normalize(), (1 - time / lookAhead) * strength);
    }
    desired.add(avoidance.clampLength(0, 1).multiplyScalar((reducedMotion ? 25 : 170) * data.dodgeSkill));
  }
  function shipCruiseSpeed(ship, forwardSpeed, throttle) {
    const depth = ship.position.clone().sub(camera.position).dot(ship.userData.cruiseDirection);
    // Close the gap quickly at range, then limit relative speed for a readable shooting window.
    // Throttle still varies the pace, but cannot leave a target permanently pulling away.
    const passingSpeed = ship.userData.passingSpeed * THREE.MathUtils.clamp(2 - throttle, .65, 1.7);
    const approach = THREE.MathUtils.smoothstep(depth, reducedMotion ? 120 : 900, reducedMotion ? 400 : 2400);
    return Math.max(0, forwardSpeed - THREE.MathUtils.lerp(passingSpeed, forwardSpeed * .9, approach));
  }
  const ringShipPoint = new THREE.Vector3(), ringShipForward = new THREE.Vector3(0, 0, -1);
  function updateRingShipCourse(ship, dt) {
    if (!isFlightActive() || !ship.visible || dt <= 0) return;
    const data = ship.userData, route = data.ringRoute;
    const previousSpeed = data.courseVelocity.length();
    if (data.arrivalOpacity < 1) setShipOpacity(ship, Math.min(1, data.arrivalOpacity + dt / 1.2));
    // One companion varies its throttle; the other keeps its own steadier passing pace.
    const throttle = 1 + route.throttleAmount * Math.sin(data.courseAge * route.throttleRate + route.throttlePhase)
      * THREE.MathUtils.smoothstep(data.courseAge, 3, 5);
    const forwardSpeed = Math.max(0, flightMotion.dot(data.cruiseDirection)) * .85;
    const desiredSpeed = shipCruiseSpeed(ship, forwardSpeed, route.cruiseRatio * throttle);
    route.cruiseSpeed = THREE.MathUtils.lerp(route.cruiseSpeed, desiredSpeed, 1 - Math.exp(-1.5 * dt));
    route.distance += route.cruiseSpeed * dt;
    route.curve.getPointAt(Math.min(1, route.distance / route.length), ringShipPoint);
    if (route.distance > route.length) ringShipPoint.addScaledVector(route.exit, route.distance - route.length);
    // Only intrinsic motion here; the regular fleet loop adds the shared world step once.
    data.courseVelocity.subVectors(ringShipPoint, route.position).divideScalar(dt);
    route.position.copy(ringShipPoint);
    data.cruiseDirection.copy(data.courseVelocity).normalize();
    data.baseRotation.setFromUnitVectors(ringShipForward, data.cruiseDirection);
    ship.quaternion.slerp(data.baseRotation, 1 - Math.exp(-4 * dt));
    data.courseRight.set(1, 0, 0).applyQuaternion(data.baseRotation);
    data.courseUp.set(0, 1, 0).applyQuaternion(data.baseRotation);
    updateEngineThrust(ship, previousSpeed, dt);
  }

  function updateShipCourse(ship, dt) {
    const data = ship.userData;
    data.courseAge += dt;
    if (data.tutorialTarget) {
      // A short, gentle approach near the flight path, not a sweep across the screen.
      const duration = reducedMotion ? 3 : 2.4;
      const before = THREE.MathUtils.smoothstep(data.courseAge - dt, 0, duration);
      const after = THREE.MathUtils.smoothstep(data.courseAge, 0, duration);
      data.courseVelocity.copy(flightMotion).multiplyScalar(.85)
        .addScaledVector(data.tutorialEntry, (before - after) / dt);
      if (data.type.asteroid) data.hull.opacity = THREE.MathUtils.smoothstep(data.courseAge, 0, .3);
      else if (data.arrivalOpacity < 1) setShipOpacity(ship, THREE.MathUtils.smoothstep(data.courseAge, 0, .5));
      return;
    }
    if (data.type.asteroid) {
      // A brief spawn blend, completed before the rock becomes visually large.
      data.hull.opacity = THREE.MathUtils.smoothstep(data.courseAge, 0, .3);
      return;
    }
    if (data.ringRoute) {
      updateRingShipCourse(ship, dt);
      return;
    }
    if (data.arrivalOpacity < 1) setShipOpacity(ship, THREE.MathUtils.smoothstep(data.courseAge, 0, 1.2));
    data.throttleTime -= dt;
    if (data.throttleTime <= 0) {
      data.throttleTime = random(3.5, 6.5);
      // Mostly steady traffic, with occasional short acceleration runs.
      data.throttle = random(0, 1) < .18 ? random(1.02, 1.12) : data.cruiseRatio * random(.85, 1.1);
    }
    const offset = ship.position.clone().sub(camera.position);
    const depth = offset.dot(data.cruiseDirection);
    const motion = reducedMotion ? .25 : 1;
    const phase = data.courseAge * data.maneuverRate + data.maneuverPhase;
    const lateralLimit = reducedMotion ? 9 : 35;
    const forwardSpeed = Math.max(0, flightMotion.dot(data.cruiseDirection)) * .85;
    const desired = data.cruiseDirection.clone().multiplyScalar(shipCruiseSpeed(ship, forwardSpeed, data.throttle));
    // Stop lane tracking near the player: the final pass remains avoidable.
    if (depth > 180) {
      const lane = data.lane + Math.sin(phase) * 50 * motion;
      const height = data.height + Math.sin(phase * .73 + 1) * 22 * motion;
      desired.addScaledVector(data.courseRight, THREE.MathUtils.clamp((lane - offset.dot(data.courseRight)) * .5, -lateralLimit, lateralLimit))
        .addScaledVector(data.courseUp, THREE.MathUtils.clamp((height - offset.dot(data.courseUp)) * .4, -lateralLimit * .6, lateralLimit * .6));
    }
    avoidAsteroids(ship, desired);
    const previousForwardSpeed = data.courseVelocity.dot(data.cruiseDirection);
    data.courseVelocity.lerp(desired, 1 - Math.exp(-1.5 * dt));
    updateEngineThrust(ship, previousForwardSpeed, dt);
    const bank = -data.courseVelocity.dot(data.courseRight) / (reducedMotion ? 600 : 320);
    ship.quaternion.copy(data.baseRotation).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, THREE.MathUtils.clamp(bank, -.3, .3))));
  }

  // Snapshot every visible position before anyone steers or moves.
  function snapshotFleet(ships) {
    activeAsteroids.length = 0;
    for (const ship of ships) {
      if (!ship.visible) continue;
      ship.userData.previousPosition.copy(ship.position);
      if (ship.userData.type.asteroid) activeAsteroids.push(ship);
    }
  }

  function moveShip(ship, dt, worldStep, moving) {
    ship.position.addScaledVector(worldStep, .85);
    if (!moving) return;
    advanceShipMotion(ship, dt, reducedMotion);
    if (!ship.userData.type.asteroid) constrainShipToBoundary(ship);
  }
  return { activeAsteroids, snapshotFleet, moveShip, updateShipCourse, updateRingShipCourse, avoidAsteroids, shipCruiseSpeed, updateEngineThrust };
}
