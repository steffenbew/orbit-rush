import * as THREE from '../../assets/vendor/three.module.js';

// Reuse sweep scratch space; allocate a normal only when the path intersects.
const asteroidCollisionPrevious = new THREE.Vector3(), asteroidCollisionClosest = new THREE.Vector3();
const rockContactPath = new THREE.Line3(), rockContactClosest = new THREE.Vector3();
const rockContactStart = new THREE.Vector3(), rockContactStep = new THREE.Vector3();
function asteroidContact(from, to, center, radius) {
  rockContactPath.set(from, to).closestPointToPoint(center, true, rockContactClosest);
  if (rockContactClosest.distanceToSquared(center) > radius * radius) return null;
  rockContactStart.copy(from).sub(center); rockContactStep.copy(to).sub(from);
  const a = rockContactStep.lengthSq(), b = rockContactStart.dot(rockContactStep);
  const c = rockContactStart.lengthSq() - radius * radius;
  const time = c > 0 && a > 1e-10 ? THREE.MathUtils.clamp((-b - Math.sqrt(Math.max(0, b * b - a * c))) / a, 0, 1) : 0;
  const rockContactNormal = rockContactStart.clone().addScaledVector(rockContactStep, time);
  if (rockContactNormal.lengthSq() < 1e-10) rockContactNormal.copy(rockContactStep).negate();
  if (rockContactNormal.lengthSq() < 1e-10) rockContactNormal.set(1, 0, 0);
  return rockContactNormal.normalize();
}

// Sweep in the rock's frame: both objects can cross the contact point between ticks.
export function rockHitsShip(rock, ship, crossesHull) {
  const previous = asteroidCollisionPrevious.copy(ship.userData.previousPosition)
    .add(rock.position).sub(rock.userData.previousPosition);
  const radius = rock.userData.type.radius * rock.scale.x * .8;
  const reach = ship.userData.type.radius * ship.scale.x + radius;
  rockContactPath.set(previous, ship.position).closestPointToPoint(rock.position, true, asteroidCollisionClosest);
  if (asteroidCollisionClosest.distanceToSquared(rock.position) > reach * reach) return false;
  return crossesHull(ship, previous, ship.position, 0, rock.position, radius);
}

// A resolved contact supplies the normal and closing speed needed to decide fracture.
export function resolveRockImpact(a, b) {
  const velocity = a.userData.courseVelocity, otherVelocity = b.userData.courseVelocity;
  if (velocity.lengthSq() + otherVelocity.lengthSq() < 1) return null;
  // Shared player travel cancels out; only relative asteroid movement produces an impact.
  asteroidCollisionPrevious.copy(a.userData.previousPosition).add(b.position).sub(b.userData.previousPosition);
  const radius = (a.scale.x + b.scale.x) * a.userData.type.radius;
  const normal = asteroidContact(asteroidCollisionPrevious, a.position, b.position, radius);
  if (!normal) return null;
  const closing = -asteroidCollisionClosest.copy(velocity).sub(otherVelocity).dot(normal);
  if (closing <= .01) return null; // Separating contacts must not bounce or fracture again.
  const massA = a.scale.x ** 3, massB = b.scale.x ** 3;
  const impulse = 1.25 * closing / (1 / massA + 1 / massB);
  velocity.addScaledVector(normal, impulse / massA);
  otherVelocity.addScaledVector(normal, -impulse / massB);
  const overlap = Math.max(0, radius - asteroidCollisionClosest.copy(a.position).sub(b.position).dot(normal)) + .01;
  a.position.addScaledVector(normal, overlap * massB / (massA + massB));
  b.position.addScaledVector(normal, -overlap * massA / (massA + massB));
  return { closing, normal };
}

export function createAsteroidImpacts({ ships, encounter, fragments, reducedMotion, sample = Math.random }) {
  const { origin: showerOrigin, previousOrigin: showerPreviousOrigin, debrisField, maxShowerGritSize } = encounter;
  function fracture(rock, normal, gameTime) {
    const sizeScale = rock.userData.asteroidSizeScale, size = rock.scale.x;
    if (size / sizeScale < 1.2 || gameTime < rock.userData.fractureAfter) return false;
    const pieceCount = ships.filter(ship => ship.visible && ship.userData.impactFragment).length;
    if (pieceCount + (rock.userData.impactFragment ? 1 : 2) > 12) return false;
    const child = encounter.eventAsteroid();
    if (!child) return false;
    const position = rock.position.clone(), velocity = rock.userData.courseVelocity.clone();
    const tangent = new THREE.Vector3(Math.abs(normal.y) > .9 ? 1 : 0, Math.abs(normal.y) > .9 ? 0 : 1, 0).cross(normal).normalize();
    // Two solid pieces, conserving volume and center of mass. No blast, flash, sound or reward.
    const sizes = [Math.cbrt(.55) * size, Math.cbrt(.45) * size];
    const separation = rock.userData.type.radius * (sizes[0] + sizes[1]) * 1.15;
    [rock, child].forEach((piece, index) => {
      const weight = index === 0 ? .45 : -.55;
      piece.scale.setScalar(sizes[index]);
      piece.position.copy(position).addScaledVector(tangent, separation * weight);
      piece.userData.previousPosition.copy(piece.position);
      piece.userData.courseVelocity.copy(velocity).addScaledVector(tangent, (reducedMotion ? 8 : 35) * weight);
      piece.userData.asteroidSizeScale = sizeScale;
      piece.userData.asteroidTier = Math.min(3, Math.ceil(sizes[index] / sizeScale));
      piece.userData.health = piece.userData.maxHealth = Math.ceil(sizes[index] / sizeScale);
      piece.userData.impactFragment = true; piece.userData.fractureAfter = gameTime + 1;
      piece.userData.courseAge = 1; piece.userData.hull.opacity = 1;
      piece.userData.lastVisibleTime = rock.userData.lastVisibleTime;
    });
    return true;
  }
  function collideRocks(activeAsteroids, gameTime) {
    let contacts = 0;
    for (let i = 0; i < activeAsteroids.length; i++) {
      const a = activeAsteroids[i];
      if (!a.visible || a.userData.tutorialTarget) continue;
      for (let j = i + 1; j < activeAsteroids.length; j++) {
        const b = activeAsteroids[j];
        if (!b.visible || b.userData.tutorialTarget) continue;
        const contact = resolveRockImpact(a, b);
        if (!contact) continue;
        contacts++;
        if (contact.closing > (reducedMotion ? 24 : 180) && sample() < .22) {
          const smaller = a.scale.x < b.scale.x ? a : b;
          fracture(smaller, contact.normal, gameTime);
        }
      }
    }
    return contacts;
  }
  const fieldQueryStart = new THREE.Vector3(), fieldQueryEnd = new THREE.Vector3();
  function collideField(activeAsteroids, gameTime) {
    if (encounter.kind !== 'field' || !encounter.mesh.visible) return 0;
    let contacts = 0;
    for (const body of activeAsteroids) {
      if (!body.visible || body.userData.tutorialTarget || body.userData.courseVelocity.lengthSq() < 1) continue;
      if (fragments.full) break;
      const radius = body.userData.type.radius * body.scale.x;
      const from = body.userData.previousPosition.clone().add(showerOrigin).sub(showerPreviousOrigin);
      fieldQueryStart.copy(from).sub(showerOrigin);
      fieldQueryEnd.copy(body.position).sub(showerOrigin);
      for (const piece of debrisField.nearby(fieldQueryStart, fieldQueryEnd, radius + maxShowerGritSize * 1.7)) {
        if (piece.destroyed) continue;
        const center = piece.position.clone().add(showerOrigin);
        const normal = asteroidContact(from, body.position, center, radius + piece.size);
        if (!normal) continue;
        const closing = -body.userData.courseVelocity.dot(normal);
        if (closing <= .01) continue;
        const massBody = radius ** 3, massPiece = piece.size ** 3;
        const impulse = 1.25 * closing / (1 / massBody + 1 / massPiece);
        body.userData.courseVelocity.addScaledVector(normal, impulse / massBody);
        const velocity = normal.clone().multiplyScalar(-impulse / massPiece);
        // Detach the exact rendered fragment into the existing solid-fragment lifecycle.
        // The static instance is removed once; no duplicate collider or disappearing moving hull.
        const object = debrisField.detach(piece, gameTime);
        fragments.addDetached(object, velocity);
        contacts++;
        break; // Bound work and visual density during a dense crossing.
      }
    }
    return contacts;
  }
  return { collideRocks, collideField, fracture };
}
