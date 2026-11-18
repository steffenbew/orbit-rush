import * as THREE from '../../assets/vendor/three.module.js';

// The spatial index and collision triangles represent the actual rendered instances.
// Scratch colliders, query results and impact points are reused; consume them immediately.
export function createDebrisField({ mesh, origin, rotation, velocity, maxSize, asteroidType, camera, flightMotion, playerHullRadius, crossesPlayer }) {
  const rocks = [], cells = new Map(), candidates = [];
  const showerInverse = new THREE.Quaternion();
  const showerQueryStart = new THREE.Vector3(), showerQueryEnd = new THREE.Vector3();
  const showerQueryBounds = new THREE.Box3(), showerInstanceMatrix = new THREE.Matrix4();
  const showerWorldMatrix = new THREE.Matrix4();
  const showerRockPrevious = new THREE.Vector3(), showerRockFuture = new THREE.Vector3();
  const showerBaseTriangles = [];
  const showerVertices = mesh.geometry.attributes.position;
  for (let i = 0; i < showerVertices.count; i += 3) {
    showerBaseTriangles.push(new THREE.Triangle(...[0, 1, 2].map(offset => new THREE.Vector3().fromBufferAttribute(showerVertices, i + offset))));
  }
  const showerCollisionTriangles = showerBaseTriangles.map(triangle => triangle.clone());
  const showerCollisionBounds = new THREE.Box3();
  const showerRockCollider = new THREE.Object3D();
  showerRockCollider.userData = { type: asteroidType, asteroidTier: 1,
    collisionBox: showerCollisionBounds, collisionParts: [{ bounds: showerCollisionBounds, triangles: showerCollisionTriangles }] };
  function nearbyShowerRocks(from, to, radius) {
    candidates.length = 0;
    showerQueryBounds.setFromPoints([from, to]).expandByScalar(radius);
    const min = showerQueryBounds.min, max = showerQueryBounds.max;
    for (let x = Math.floor(min.x / 128); x <= Math.floor(max.x / 128); x++) {
      for (let y = Math.floor(min.y / 128); y <= Math.floor(max.y / 128); y++) {
        for (let z = Math.floor(min.z / 128); z <= Math.floor(max.z / 128); z++) {
          const cell = cells.get(`${x},${y},${z}`);
          if (cell) for (const rock of cell) candidates.push(rock);
        }
      }
    }
    return candidates;
  }
  function prepareShowerRock(rock) {
    mesh.getMatrixAt(rock.index, showerInstanceMatrix);
    showerInstanceMatrix.setPosition(0, 0, 0);
    showerCollisionBounds.makeEmpty();
    // Bake each instance's non-uniform scale/rotation into just 20 reused triangles.
    for (let i = 0; i < showerCollisionTriangles.length; i++) {
      const triangle = showerCollisionTriangles[i].copy(showerBaseTriangles[i]);
      triangle.a.applyMatrix4(showerInstanceMatrix);
      triangle.b.applyMatrix4(showerInstanceMatrix);
      triangle.c.applyMatrix4(showerInstanceMatrix);
      showerCollisionBounds.expandByPoint(triangle.a).expandByPoint(triangle.b).expandByPoint(triangle.c);
    }
    showerRockCollider.position.copy(rock.position).applyQuaternion(rotation).add(origin);
    showerRockCollider.quaternion.copy(rotation);
    showerRockCollider.visible = true;
    showerRockCollider.userData.collisionHandled = rock.hit;
    showerRockCollider.userData.instanceIndex = rock.index;
    return showerRockCollider;
  }
  const showerLaserRay = new THREE.Ray(), showerLaserPoint = new THREE.Vector3();
  const showerLaserFrom = new THREE.Vector3(), showerLaserTo = new THREE.Vector3();
  const showerLaserImpact = new THREE.Vector3(), showerLaserInverseMatrix = new THREE.Matrix4();
  const showerHiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
  function findShowerLaserHit(from, to, maxDistance = Infinity) {
    if (!mesh.visible || mesh.material.opacity < .25) return null;
    showerInverse.copy(rotation).invert();
    showerLaserFrom.copy(from).sub(origin).applyQuaternion(showerInverse);
    showerLaserTo.copy(to).sub(origin).applyQuaternion(showerInverse);
    let nearest = Math.min(from.distanceTo(to), maxDistance), hit = null;
    if (nearest <= 0) return null;
    showerLaserTo.sub(showerLaserFrom).normalize().multiplyScalar(nearest).add(showerLaserFrom);
    for (const rock of nearbyShowerRocks(showerLaserFrom, showerLaserTo, maxSize * 1.7)) {
      if (rock.destroyed) continue;
      mesh.getMatrixAt(rock.index, showerInstanceMatrix);
      showerLaserInverseMatrix.copy(showerInstanceMatrix).invert();
      showerLaserRay.origin.copy(showerLaserFrom).applyMatrix4(showerLaserInverseMatrix);
      showerLaserRay.direction.subVectors(showerLaserTo, showerLaserFrom)
        .transformDirection(showerLaserInverseMatrix);
      // Reuse the base triangles and scratch vectors; no per-rock meshes or raycaster scan.
      for (const triangle of showerBaseTriangles) {
        if (!showerLaserRay.intersectTriangle(triangle.a, triangle.b, triangle.c, false, showerLaserPoint)) continue;
        showerLaserPoint.applyMatrix4(showerInstanceMatrix);
        const distance = showerLaserPoint.distanceTo(showerLaserFrom);
        if (distance >= nearest) continue;
        nearest = distance; hit = rock;
        showerLaserImpact.copy(showerLaserPoint).applyQuaternion(rotation).add(origin);
      }
    }
    return hit;
  }
  function clear() {
    rocks.length = 0; cells.clear();
  }
  function add(rock) {
    rocks.push(rock);
    const key = `${Math.floor(rock.position.x / 128)},${Math.floor(rock.position.y / 128)},${Math.floor(rock.position.z / 128)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(rock);
  }
  function remove(rock) {
    rock.destroyed = true;
    mesh.setMatrixAt(rock.index, showerHiddenMatrix);
    mesh.instanceMatrix.needsUpdate = true;
  }
  function detach(piece, time) {
    const object = new THREE.Mesh(mesh.geometry, new THREE.MeshStandardMaterial({ color: 0x918777, roughness: 1, flatShading: true }));
    mesh.getMatrixAt(piece.index, showerInstanceMatrix);
    showerInstanceMatrix.decompose(object.position, object.quaternion, object.scale);
    object.position.add(origin);
    object.userData = { collisionBox: mesh.geometry.boundingBox,
      collisionParts: [{ bounds: mesh.geometry.boundingBox, triangles: showerBaseTriangles }],
      lastVisibleTime: piece.seen ? time : -Infinity };
    remove(piece);
    return object;
  }
  const visibleBox = new THREE.Box3();
  function recordVisible(viewFrustum) {
    if (!mesh.visible || mesh.material.opacity < .25) return;
    showerInverse.copy(rotation).invert();
    showerQueryStart.copy(camera.position).sub(origin).applyQuaternion(showerInverse);
    // Notice nearby rocks before contact, even at low frame rates; do not scan the full field.
    const relativeSpeed = showerRockFuture.copy(flightMotion).multiplyScalar(-.85).add(velocity).length();
    const reach = Math.max(350, relativeSpeed * .3 + playerHullRadius);
    mesh.updateMatrixWorld(true);
    for (const rock of nearbyShowerRocks(showerQueryStart, showerQueryStart, reach)) {
      if (rock.seen || rock.destroyed) continue;
      mesh.getMatrixAt(rock.index, showerInstanceMatrix);
      showerWorldMatrix.multiplyMatrices(mesh.matrixWorld, showerInstanceMatrix);
      if (viewFrustum.intersectsBox(visibleBox.copy(mesh.geometry.boundingBox).applyMatrix4(showerWorldMatrix))) rock.seen = true;
    }
  }
  function updateContacts(showerPreviousOrigin, onHit) {
    if (!mesh.visible) return false;
    showerInverse.copy(rotation).invert();
    showerQueryStart.copy(camera.position).sub(showerPreviousOrigin).applyQuaternion(showerInverse);
    showerQueryEnd.copy(camera.position).sub(origin).addScaledVector(flightMotion, .85 * 1.6)
      .addScaledVector(velocity, -1.6).applyQuaternion(showerInverse);
    let danger = false, damaged = false;
    // Include the largest stretched boulder, even if its center is outside the flight path.
    for (const rock of nearbyShowerRocks(showerQueryStart, showerQueryEnd, playerHullRadius + maxSize * 1.7 + 8)) {
      if (!rock.seen || rock.hit || rock.destroyed) continue;
      const collider = prepareShowerRock(rock);
      showerRockPrevious.copy(collider.position).add(showerPreviousOrigin).sub(origin);
      if (!damaged && crossesPlayer(collider, showerRockPrevious, collider.position)) {
        rock.hit = true;
        damaged = true;
        if (onHit(collider)) break;
      }
      showerRockFuture.copy(collider.position).addScaledVector(flightMotion, -.85 * 1.6).addScaledVector(velocity, 1.6);
      if (!danger && !rock.hit && crossesPlayer(collider, collider.position, showerRockFuture, 8)) danger = true;
      if (danger && damaged) break;
    }
    return danger;
  }
  return { rocks, impactPoint: showerLaserImpact, clear, add, remove, detach,
    nearby: nearbyShowerRocks, colliderFor: prepareShowerRock, findLaserHit: findShowerLaserHit, recordVisible, updateContacts };
}
