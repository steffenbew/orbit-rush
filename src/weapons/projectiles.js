import * as THREE from '../../assets/vendor/three.module.js';
import { playerLaserSpeed } from './rules.js';

// Shots share geometry and materials across rounds. Clearing removes only the live objects.
export function createPlayerProjectiles({ scene, glow, camera, flightMotion, ships, findWallHit, onWallHit, onShipHit }) {
  const rockets = [];
  const rocketRay = new THREE.Raycaster();
  const path = new THREE.Line3(), closest = new THREE.Vector3(), sphere = new THREE.Sphere();
  const rocketGeometry = new THREE.CylinderGeometry(.22, .22, 10, 8);
  rocketGeometry.rotateX(-Math.PI / 2);
  const heavyRocketGeometry = new THREE.PlaneGeometry(.64, 10);
  heavyRocketGeometry.rotateX(-Math.PI / 2);
  const rocketMaterial = new THREE.MeshBasicMaterial({ color: 0xffb24d });
  const exhaustMaterial = new THREE.SpriteMaterial({ map: glow, color: 0xff751f, blending: THREE.AdditiveBlending, depthWrite: false });
  // Crossed light ribbons: soft edges and tapered ends, no solid surface or caps.
  const heavyRocketMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec2 beamUv;
      void main() {
        beamUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 beamUv;
      void main() {
        float across = (beamUv.x - 0.5) * 2.0;
        float halo = exp(-5.0 * across * across);
        float core = exp(-80.0 * across * across);
        float ends = smoothstep(0.0, 0.22, beamUv.y)
                   * smoothstep(0.0, 0.22, 1.0 - beamUv.y);
        float edge = 1.0 - smoothstep(0.65, 1.0, abs(across));
        vec3 color = mix(vec3(0.08, 0.45, 1.0), vec3(0.8, 0.95, 1.0), core);
        gl_FragColor = vec4(color, (halo * 0.22 + core * 0.65) * ends * edge);
      }
    `
  });
  const heavyExhaustMaterial = new THREE.SpriteMaterial({ map: glow, color: 0x38baff, blending: THREE.AdditiveBlending, depthWrite: false });

  function fire(origin, direction, heavy) {
    const rocket = new THREE.Group();
    if (heavy) {
      for (let i = 0; i < 3; i++) {
        const ribbon = new THREE.Mesh(heavyRocketGeometry, heavyRocketMaterial);
        ribbon.rotation.z = i * Math.PI / 3;
        rocket.add(ribbon);
      }
    } else {
      rocket.add(new THREE.Mesh(rocketGeometry, rocketMaterial));
    }
    const exhaust = new THREE.Sprite(heavy ? heavyExhaustMaterial : exhaustMaterial);
    exhaust.position.z = 3.5;
    exhaust.scale.set(heavy ? 6 : 4, heavy ? 6 : 9, 1);
    rocket.add(exhaust);
    if (heavy) rocket.scale.set(8, 8, 1.6);
    rocket.position.copy(origin);
    rocket.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), direction);
    rockets.push({ object: rocket, exhaust, direction: direction.clone(), age: 0, heavy, damage: heavy ? 3 : 1, radius: heavy ? 2.56 : .22 });
    scene.add(rocket);
  }

  function resolveContact(previous, end, rocket) {
    // Sweep the entire step so fast shots cannot tunnel through a ship.
    path.set(previous, end);
    rocketRay.set(previous, closest.subVectors(end, previous).normalize());
    rocketRay.far = previous.distanceTo(end);
    let hit = null, shipDistance = Infinity;
    for (const ship of ships) {
      if (!ship.visible) continue;
      const radius = ship.userData.type.radius * ship.scale.x + rocket.radius;
      path.closestPointToPoint(ship.position, true, closest);
      if (closest.distanceTo(ship.position) >= radius) continue;

      if (ship.userData.type.capital) {
        // Empty corners of the wedge are not armor. Use the actual hull entry distance.
        ship.updateMatrixWorld(true);
        const surface = rocketRay.intersectObjects(ship.children.filter(part => part.isMesh), false)[0];
        if (!surface) continue;
        shipDistance = surface.distance;
      } else {
        sphere.set(ship.position, radius);
        const entry = rocketRay.ray.intersectSphere(sphere, closest);
        shipDistance = sphere.containsPoint(previous) ? 0 : entry ? previous.distanceTo(entry) : Infinity;
      }
      hit = ship;
      break; // Preserve fleet order when hulls overlap.
    }
    // Limit the wall query to the hull entry, not the ship's center.
    const wall = findWallHit(previous, end, shipDistance);
    if (wall) onWallHit(wall, rocket.damage);
    else if (hit) onShipHit(hit, rocket.heavy, rocket.damage, end);
    return !!(wall || hit);
  }

  function update(dt, worldStep) {
    for (let i = rockets.length - 1; i >= 0; i--) {
      const rocket = rockets[i];
      rocket.age += dt;
      const previous = rocket.object.position.clone();
      rocket.object.position.addScaledVector(rocket.direction, playerLaserSpeed(flightMotion, rocket.heavy) * dt);
      rocket.object.position.add(worldStep);
      if (rocket.heavy) {
        const glowSize = 6 * (.4 + .6 * Math.exp(-rocket.age / .25));
        rocket.exhaust.scale.set(glowSize, glowSize, 1);
      }
      const hit = resolveContact(previous, rocket.object.position, rocket);
      // Distant capital ships stay reachable; expire shots relative to the pilot, not world Z.
      if (hit || rocket.age > 8 || rocket.object.position.distanceToSquared(camera.position) > 6500 * 6500) {
        scene.remove(rocket.object);
        rockets.splice(i, 1);
      }
    }
  }

  function clear() {
    for (const rocket of rockets) scene.remove(rocket.object);
    rockets.length = 0;
  }
  return { fire, update, clear, get count() { return rockets.length; } };
}
