import * as THREE from '../../assets/vendor/three.module.js';

// One set of scratch vectors per simulation. The pilot position stays live as the camera moves.
export function createPlayerCollision(playerPosition) {
  const inverseRotation = new THREE.Quaternion();
  const collisionStart = new THREE.Vector3(), collisionEnd = new THREE.Vector3();
  const collisionDirection = new THREE.Vector3(), collisionPoint = new THREE.Vector3();
  const collisionBox = new THREE.Box3(), collisionRay = new THREE.Ray();
  const edgePoint = new THREE.Vector3();
  // Rounded Interceptor-sized body, nose and wings: 40 wide × 20 high × 43 long.
  const playerHull = [
    { center: new THREE.Vector3(0, 0, -21), radius: 5 },
    { center: new THREE.Vector3(0, 0, -8), radius: 10 },
    { center: new THREE.Vector3(0, 0, 7), radius: 10 },
    { center: new THREE.Vector3(-13, 0, 6), radius: 7 },
    { center: new THREE.Vector3(13, 0, 6), radius: 7 }
  ];
  const playerHullRadius = 26, playerHullRotation = new THREE.Quaternion();
  const playerProbePoint = new THREE.Vector3(), playerPathClosest = new THREE.Vector3();
  const playerCollisionPath = new THREE.Line3();
  function crossesPlayer(ship, previous, next, margin = 0, point = playerPosition) {
    for (const probe of playerHull) {
      playerProbePoint.copy(probe.center).applyQuaternion(playerHullRotation).add(point);
      if (crossesHull(ship, previous, next, margin, playerProbePoint, probe.radius)) return true;
    }
    return false;
  }
  function pathHitsPlayer(previous, next, radius) {
    playerCollisionPath.set(previous, next);
    for (const probe of playerHull) {
      playerProbePoint.copy(probe.center).applyQuaternion(playerHullRotation).add(playerPosition);
      playerCollisionPath.closestPointToPoint(playerProbePoint, true, playerPathClosest);
      if (playerPathClosest.distanceToSquared(playerProbePoint) <= (probe.radius + radius) ** 2) return true;
    }
    return false;
  }
  function crossesHull(ship, previous, next, margin = 0, point = playerPosition, probeRadius = 4) {
    inverseRotation.copy(ship.quaternion).invert();
    collisionStart.copy(point).sub(previous).applyQuaternion(inverseRotation).divideScalar(ship.scale.x);
    collisionEnd.copy(point).sub(next).applyQuaternion(inverseRotation).divideScalar(ship.scale.x);
    const radius = (probeRadius + margin) / ship.scale.x;
    const radiusSq = radius * radius;
    collisionBox.copy(ship.userData.collisionBox).expandByScalar(radius);
    collisionDirection.subVectors(collisionEnd, collisionStart);
    const distance = collisionDirection.length();
    if (distance > 0) collisionRay.set(collisionStart, collisionDirection.divideScalar(distance));
    if (!collisionBox.containsPoint(collisionStart)
      && (distance === 0 || collisionRay.intersectBox(collisionBox, collisionPoint) === null
        || collisionStart.distanceTo(collisionPoint) > distance)) return false;
    // Swept sphere against actual triangles: gaps between wings and hull stay empty.
    for (const part of ship.userData.collisionParts) {
      collisionBox.copy(part.bounds).expandByScalar(radius);
      if (!collisionBox.containsPoint(collisionStart)
        && (distance === 0 || collisionRay.intersectBox(collisionBox, collisionPoint) === null
          || collisionStart.distanceTo(collisionPoint) > distance)) continue;
      for (const triangle of part.triangles) {
        if (triangle.closestPointToPoint(collisionStart, collisionPoint).distanceToSquared(collisionStart) <= radiusSq
          || triangle.closestPointToPoint(collisionEnd, collisionPoint).distanceToSquared(collisionEnd) <= radiusSq) return true;
        if (distance === 0) continue;
        if (collisionRay.intersectTriangle(triangle.a, triangle.b, triangle.c, false, collisionPoint)
          && collisionStart.distanceTo(collisionPoint) <= distance) return true;
        for (let edge = 0; edge < 3; edge++) {
          const a = edge === 0 ? triangle.a : edge === 1 ? triangle.b : triangle.c;
          const b = edge === 0 ? triangle.b : edge === 1 ? triangle.c : triangle.a;
          if (collisionRay.distanceSqToSegment(a, b, collisionPoint, edgePoint) <= radiusSq
            && collisionStart.distanceTo(collisionPoint) <= distance) return true;
        }
      }
    }
    return false;
  }
  return { playerHull, playerHullRadius, playerHullRotation, crossesPlayer, pathHitsPlayer, crossesHull };
}
