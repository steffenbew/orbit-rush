import * as THREE from '../../assets/vendor/three.module.js';

export function createFragments({ scene, reducedMotion, random, pick, viewFrustum, hasPassedCamera, crossesPlayer }) {
  const rocks = [], bounds = new THREE.Box3();
  const limit = 96;
  const asteroidFragmentShapes = Array.from({ length: 6 }, (_, variant) => {
    const geometry = new THREE.IcosahedronGeometry(1, 0);
    const vertices = geometry.attributes.position;
    const point = new THREE.Vector3();
    for (let i = 0; i < vertices.count; i++) {
      point.fromBufferAttribute(vertices, i);
      const roughness = .9 + .2 * Math.sin(point.x * 5 + variant) * Math.sin(point.y * 7 + point.z * 4);
      point.multiplyScalar(roughness);
      vertices.setXYZ(i, point.x * (1 + variant * .06), point.y * (.7 + variant * .05), point.z);
    }
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    const triangles = [];
    for (let i = 0; i < vertices.count; i += 3) {
      triangles.push(new THREE.Triangle(...[0, 1, 2].map(offset => new THREE.Vector3().fromBufferAttribute(vertices, i + offset))));
    }
    return { geometry, bounds: geometry.boundingBox, triangles };
  });
  function shatter(ship) {
    const fragmentScale = ship.scale.x / 3.2;
    const available = limit - rocks.length;
    const count = Math.min(available, reducedMotion ? 18 : Math.floor(random(40, 61)));
    for (let i = 0; i < count; i++) {
      const shape = pick(asteroidFragmentShapes);
      const object = new THREE.Mesh(shape.geometry, new THREE.MeshStandardMaterial({
        color: pick([0x827367, 0x675f58, 0xa0917e, 0x585551]), roughness: 1,
        flatShading: true
      }));
      // Mostly lateral ejection; a few chunks can naturally cross the flight path.
      const angle = random(0, Math.PI * 2);
      const lateral = random(0, 1) < .08 ? random(.05, .3) : random(.8, 1.4);
      const direction = new THREE.Vector3(Math.cos(angle) * lateral, Math.sin(angle) * lateral, random(-.6, 1)).normalize();
      const size = (random(0, 1) < .15 ? random(3, 5) : random(.6, 2.8)) * fragmentScale;
      object.scale.setScalar(size);
      object.rotation.set(random(-Math.PI, Math.PI), random(-Math.PI, Math.PI), random(-Math.PI, Math.PI));
      object.position.copy(ship.position).addScaledVector(direction, random(5, 20) * fragmentScale);
      object.userData = { collisionBox: shape.bounds, collisionParts: [shape], lastVisibleTime: -Infinity };
      const velocity = direction.multiplyScalar(random(65, 170));
      rocks.push({ object, vx: velocity.x, vy: velocity.y, vz: velocity.z,
        age: 0, life: random(3, 5), spin: reducedMotion ? 0 : random(-5, 5) });
      scene.add(object);
    }
  }
  function addDetached(object, velocity) {
    rocks.push({ object, vx: velocity.x, vy: velocity.y, vz: velocity.z, age: 0, life: 5,
      worldFactor: .85, spin: reducedMotion ? 0 : random(-1, 1) });
    scene.add(object);
  }
  function visible(object) {
    object.updateMatrixWorld(true);
    return viewFrustum.intersectsBox(bounds.copy(object.userData.collisionBox).applyMatrix4(object.matrixWorld));
  }
  function recordVisible(time) {
    for (const { object } of rocks) if (visible(object)) object.userData.lastVisibleTime = time;
  }
  function approaching(flightMotion) {
    return rocks.some(p => {
      if (p.object.userData.collisionHandled || p.age <= .15 || p.object.userData.lastVisibleTime === -Infinity) return false;
      const future = p.object.position.clone().addScaledVector(flightMotion, -.9)
        .add(new THREE.Vector3(p.vx, p.vy, p.vz).multiplyScalar(.9));
      return crossesPlayer(p.object, p.object.position, future, 3);
    });
  }
  function update(dt, worldStep, moving, detectHits) {
    const hits = [];
    for (let i = 0; i < rocks.length; i++) {
      const p = rocks[i], { object } = p;
      if (moving) p.age += dt;
      // Lifetime frees only off-screen rocks; never dissolve a visible solid obstacle.
      if ((p.age >= p.life && !visible(object)) || hasPassedCamera(object)) {
        scene.remove(object); object.material.dispose(); rocks.splice(i--, 1);
        continue;
      }
      const previous = object.position.clone();
      object.position.addScaledVector(worldStep, p.worldFactor ?? 1);
      if (moving) {
        object.position.x += p.vx * dt; object.position.y += p.vy * dt; object.position.z += p.vz * dt;
        const drag = Math.exp(-.15 * dt);
        p.vx *= drag; p.vy *= drag; p.vz *= drag;
        object.rotation.x += p.spin * dt; object.rotation.y += p.spin * dt * .7;
      }
      if (detectHits && !object.userData.collisionHandled && p.age > .15 && object.userData.lastVisibleTime > -Infinity
        && crossesPlayer(object, previous, object.position)) hits.push(object);
    }
    return hits;
  }
  function clear() {
    for (const { object } of rocks) { scene.remove(object); object.material.dispose(); }
    rocks.length = 0;
  }
  return { rocks, get full() { return rocks.length >= limit; }, shatter, addDetached, recordVisible, approaching, update, clear };
}
