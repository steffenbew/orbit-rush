import * as THREE from '../../assets/vendor/three.module.js';
import { setShipOpacity } from './visuals.js';

export function createFleetSpawn({ reducedMotion, random, updateShipHitFlash }) {
  function setAsteroidCourse(rock, approachTime, flightSpeed) {
    const data = rock.userData;
    data.courseVelocity.set(0, 0, 0);
    // Off-axis background rocks: 25% rest, 55% gentle drift, 20% diagonal drift.
    const course = random(0, 1);
    if (course < .25) return;
    const gentle = course < .8;
    const speed = flightSpeed * .85 * (reducedMotion ? .25 : 1);
    const side = random(0, 1) < .5 ? -1 : 1;
    const lateral = gentle ? random(.01, .05) : random(.12, .28);
    const vertical = gentle ? random(-.02, .02) : random(-.08, .08);
    data.courseVelocity.copy(data.courseRight).multiplyScalar(side * speed * lateral)
      .addScaledVector(data.courseUp, speed * vertical);
    // Preserve the off-axis pass point when adding drift.
    rock.position.addScaledVector(data.courseVelocity, -approachTime);
  }
  function setAsteroidCrossing(rock, approachTime, flightSpeed, playerHullRadius, dangerous = random(0, 1) < .55) {
    const data = rock.userData;
    data.dangerousCrossing = dangerous;
    const direction = data.courseRight.clone().multiplyScalar(random(0, 1) < .5 ? -1 : 1)
      .addScaledVector(data.courseUp, dangerous ? random(-.25, .25) : random(-.5, .5)).normalize();
    // Some fixed diagonal paths intersect the wings; others remain generous near-passes.
    // Neither aims at the camera center or changes course after release.
    const clearance = dangerous ? random(14, 20) : Math.max(data.type.radius * rock.scale.x + playerHullRadius + random(12, 24),
      flightSpeed * .85 * approachTime * (reducedMotion ? .025 : .06));
    const speed = Math.max(flightSpeed * .85 * random(.12, .28) * (reducedMotion ? .25 : 1),
      clearance * (reducedMotion ? 1.5 : 2.5) / approachTime);
    data.courseVelocity.copy(direction).multiplyScalar(speed);
    // Offset the start upstream so movement and the chosen crossing lane agree.
    rock.position.addScaledVector(direction, clearance - speed * approachTime);
    data.lane = direction.dot(data.courseRight) * clearance;
    data.height = direction.dot(data.courseUp) * clearance;
  }
  function asteroidArrivalDistance(rock) {
    // Every size starts beyond the shader's fully invisible boundary, including its hull.
    return (reducedMotion ? 900 : 3800) + rock.userData.type.radius * rock.scale.x;
  }
  // A formation spawn (including the menu preview) needs no live pilot or boundary.
  function resetShip(ship, { level, openingSpeed, flight = null, formationSlot = ship.userData.slot, maxAsteroidTier = 3 }) {
    const initial = !flight, flightSpeed = initial ? 0 : flight.speed;
    const data = ship.userData;
    data.spawn += 1;
    data.lastVisibleTime = -Infinity;
    data.collisionHandled = false;
    data.dangerousCrossing = false;
    data.approachTime = 0;
    ship.visible = true;
    if (data.arrivalOpacity < 1) setShipOpacity(ship, 1);
    const asteroidTier = data.type.asteroid ? Math.floor(random(1, Math.min(maxAsteroidTier, level) + 1)) : 0;
    data.asteroidTier = asteroidTier;
    data.asteroidSizeScale = 1;
    data.impactFragment = false; data.fractureAfter = 0;
    ship.scale.setScalar(data.type.asteroid ? [.35, 1.3, 2.8][asteroidTier - 1] : data.type.scale);
    data.maxHealth = data.type.asteroid ? asteroidTier : data.type.health;
    const angle = initial ? formationSlot * 2.4 : random(0, Math.PI * 2);
    const closeApproach = random(0, 1) < (data.type.asteroid ? .55 : .25) && !data.stationary;
    data.courseAge = 0;
    if (data.type.asteroid) data.hull.opacity = 0;
    data.courseVelocity = new THREE.Vector3();
    // Still/slow rocks stay off-axis; close asteroid passes get a crossing course below.
    const radius = data.type.asteroid ? random(100, 260)
      : closeApproach ? random(0, 35) : random(80, 260);
    // Finish the spawn blend beyond the distance fade, never in the nearby flight path.
    let depth = initial ? -550 - formationSlot * 180
      : -(500 + flightSpeed * .85 * random(1.3, 1.8));
    if (!initial) {
      depth = data.type.asteroid
        ? -Math.max(-depth, asteroidArrivalDistance(ship) + flightSpeed * .85 * .3)
        : -Math.max(reducedMotion ? 1200 : 3800, flightSpeed * .85 * 5.5);
    }
    ship.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius * .6, depth);
    // Later arrivals follow our current heading, not the original world axis.
    if (!initial) ship.position.applyEuler(flight.orientation).add(flight.position);
    if (data.type.asteroid) {
      ship.rotation.set(random(.12, .3), random(-.3, .3), random(-.25, .25));
      // Individual tumbling rates; applied only when the rock has noticeable drift.
      data.spin.set(random(-1, 1), random(-1, 1), random(-1, 1))
        .normalize().multiplyScalar(reducedMotion ? 0 : random(.04, .6));
    } else {
      ship.rotation.set(data.type.capital ? .2 : 0, 0, 0);
    }
    const courseRotation = new THREE.Quaternion();
    if (!initial) ship.quaternion.premultiply(courseRotation.setFromEuler(flight.orientation));
    data.cruiseDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(courseRotation);
    data.courseRight = new THREE.Vector3(1, 0, 0).applyQuaternion(courseRotation);
    data.courseUp = new THREE.Vector3(0, 1, 0).applyQuaternion(courseRotation);
    data.baseRotation = ship.quaternion.clone();
    data.previousPosition = ship.position.clone();
    data.maneuverPhase = random(0, Math.PI * 2);
    data.maneuverRate = random(.15, .28);
    data.lane = Math.cos(angle) * radius;
    data.height = Math.sin(angle) * radius * .6;
    data.cruiseRatio = random(.42, .78) * (data.type.name === 'TITAN CARRIER' ? .75 : 1);
    data.throttle = data.cruiseRatio;
    data.passingSpeed = random(reducedMotion ? 2 : 25, reducedMotion ? 6 : 95);
    data.throttleTime = random(3.5, 6.5);
    data.dodgeSkill = random(.65, 1.15);
    if (!data.type.asteroid) {
      data.courseVelocity.copy(data.cruiseDirection)
        .multiplyScalar(initial ? openingSpeed * .85 * data.cruiseRatio : 0);
    }
    if (data.type.capital) {
      // Start beyond the fog, not as a full-size silhouette in the combat area.
      const distance = initial ? 4200 : Math.max(4200, flightSpeed * 5.5);
      ship.position.set(110, -100, -distance).applyQuaternion(courseRotation);
      data.courseVelocity.set(0, 0, 0);
      data.fireCooldown = 2.8;
      data.gunsCharging = false;
      data.retreating = false;
      data.retreatStart = Infinity;
      for (const muzzle of data.muzzles) muzzle.scale.setScalar(3);
    }
    if (data.type.asteroid && !initial && !data.shower && !data.scheduledHazard && !data.stationary) {
      const approachTime = -depth / Math.max(1, flightSpeed * .85);
      if (closeApproach) {
        ship.position.addScaledVector(data.courseRight, -data.lane)
          .addScaledVector(data.courseUp, -data.height);
        setAsteroidCrossing(ship, approachTime, flightSpeed, flight.playerHullRadius);
      } else setAsteroidCourse(ship, approachTime, flightSpeed);
    }
    if (!initial && !data.type.asteroid) {
      const distance = ship.position.distanceTo(flight.position);
      flight.constrainShipToBoundary(ship);
      // Moving a turned arrival inside must not bring it through the distance fade.
      if (ship.position.distanceTo(flight.position) < distance) {
        const dx = ship.position.x - flight.position.x, dy = ship.position.y - flight.position.y;
        ship.position.z = flight.position.z - Math.sqrt(distance * distance - dx * dx - dy * dy);
      }
    }
    data.previousPosition.copy(ship.position);
    data.health = data.maxHealth;
    data.hitFlash = 0;
    data.engineThrust = .25;
    data.hull.emissive.setHex(0);
    updateShipHitFlash(ship);
  }
  return { resetShip, asteroidArrivalDistance, setAsteroidCrossing };
}
