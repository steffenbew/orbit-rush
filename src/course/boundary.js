import * as THREE from '../../assets/vendor/three.module.js';

// Own the visible membrane and resolve the proposed world step against that same surface.
export function createFlightBoundary({ scene, camera, courseWorldOffset, flightMotion, playerHullRadius }) {
  const flightBoundaryRadii = new THREE.Vector2(1800, 1100);
  const flightBoundaryOrigin = new THREE.Vector3(), flightBoundaryPrevious = new THREE.Vector3();
  const flightBoundaryLocal = new THREE.Vector3(), flightBoundaryAim = new THREE.Vector3();
  const flightBoundaryNormal = new THREE.Vector3(), flightBoundaryImpact = new THREE.Vector3();
  const flightBoundaryMaterial = new THREE.ShaderMaterial({
    uniforms: {
      strength: { value: 0 }, phase: { value: 0 }, contact: { value: 0 },
      warningPoint: { value: new THREE.Vector3() }, patchSize: { value: 1100 }, gridScale: { value: new THREE.Vector2() }, gridOffset: { value: 0 },
      impactPoint: { value: new THREE.Vector3() }, impactNormal: { value: new THREE.Vector3(1, 0, 0) }, impactAge: { value: 10 }
    },
    vertexShader: `
      varying vec2 shieldUv;
      varying vec3 shieldWorldPosition, shieldNormal, shieldViewPosition;
      void main() {
        shieldUv = uv;
        vec4 world = modelMatrix * vec4(position, 1.0);
        shieldWorldPosition = world.xyz;
        shieldNormal = normalMatrix * normal;
        shieldViewPosition = (viewMatrix * world).xyz;
        gl_Position = projectionMatrix * vec4(shieldViewPosition, 1.0);
      }
    `,
    fragmentShader: `
      uniform float strength, phase, contact, patchSize, impactAge, gridOffset;
      uniform vec2 gridScale;
      uniform vec3 warningPoint, impactPoint, impactNormal;
      varying vec2 shieldUv;
      varying vec3 shieldWorldPosition, shieldNormal, shieldViewPosition;
      void main() {
        // A soft localized approach glow; the larger cells emerge as the surface gets close.
        vec2 p = shieldUv * gridScale;
        p.y += gridOffset;
        vec2 repeat = vec2(1.0, 1.7320508);
        vec2 a = mod(p, repeat) - repeat * 0.5;
        vec2 b = mod(p - repeat * 0.5, repeat) - repeat * 0.5;
        vec2 cell = dot(a, a) < dot(b, b) ? a : b;
        float hexDistance = max(abs(cell.x), dot(abs(cell), vec2(0.5, 0.8660254)));
        float edgeDistance = abs(0.5 - hexDistance);
        float edge = 1.0 - smoothstep(0.012, 0.025 + fwidth(hexDistance), edgeDistance);
        float corona = exp(-edgeDistance * 16.0);
        // Reveal a wider section around the tube, without extending the forward horizon.
        vec3 fieldOffset = shieldWorldPosition - warningPoint;
        fieldOffset.xy *= 0.8;
        fieldOffset.z *= 0.15;
        float fieldGlow = exp(-pow(length(fieldOffset) / patchSize, 2.0));
        float fresnel = pow(1.0 - abs(dot(normalize(shieldNormal), normalize(-shieldViewPosition))), 2.0);
        float sheen = 0.5 + 0.5 * sin(shieldUv.x * 6.2831853 * 6.0 + p.y * 0.6 - phase * 0.7);
        float reveal = smoothstep(0.2, 0.85, strength);
        float alpha = strength * fieldGlow * (0.025 + fresnel * 0.08 + sheen * 0.02
          + reveal * (edge * 0.10 + corona * 0.025));
        vec3 delta = shieldWorldPosition - impactPoint;
        float impactScale = 150.0;
        float distanceToContact = length(delta) / impactScale;
        float impactGlow = contact * exp(-pow(distanceToContact / 0.35, 2.0));
        // Fast travelling waves disperse within about a second, without a lingering ripple.
        float ripple = 0.0;
        for (int wave = 0; wave < 3; wave++) {
          float waveAge = impactAge - float(wave) * 0.12;
          float waveRadius = 12.0 + max(0.0, waveAge) * 1100.0;
          float band = exp(-pow((length(delta) - waveRadius) / 16.0, 2.0));
          float fade = 1.0 - smoothstep(0.08, 0.8, waveAge);
          ripple += step(0.0, waveAge) * band * fade * (1.0 - float(wave) * 0.23);
        }
        vec2 impactUv = vec2(dot(delta, vec3(-impactNormal.y, impactNormal.x, 0.0)), delta.z) / impactScale;
        float angle = atan(impactUv.y, impactUv.x);
        float sparks = pow(max(0.0, sin(angle * 5.0 + 1.7)), 64.0)
          * exp(-pow((length(impactUv) - (0.08 + impactAge * 0.9) * (1.0 + 0.25 * sin(angle * 3.0 + 0.6))) / 0.012, 2.0))
          * exp(-impactAge * 9.0) * contact;
        alpha += impactGlow * (0.12 + edge * 0.075 + corona * 0.015)
          + ripple * (0.24 + edge * 0.14) + sparks * 0.35;
        vec3 color = mix(vec3(0.08, 0.6, 1.0), vec3(0.7, 1.0, 1.0), clamp(impactGlow + ripple + sparks, 0.0, 1.0));
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false
  });
  const flightBoundaryGeometry = new THREE.CylinderGeometry(1, 1, 1, 96, 1, true);
  flightBoundaryGeometry.rotateX(Math.PI / 2);
  const flightBoundary = new THREE.Mesh(flightBoundaryGeometry, flightBoundaryMaterial);
  flightBoundary.visible = false;
  scene.add(flightBoundary);
  let flightBoundaryDamageAt = 0, flightBoundaryImpactAt = -Infinity;
  let flightBoundaryTouching = false;
  function resetFlightBoundary() {
    // Keep both open ends well beyond the visible glow, even on slow or long training flights.
    const length = camera.far * 4;
    flightBoundaryOrigin.copy(camera.position);
    flightBoundaryPrevious.set(0, 0, 0);
    flightBoundary.scale.set(flightBoundaryRadii.x, flightBoundaryRadii.y, length);
    flightBoundary.position.copy(flightBoundaryOrigin).add(courseWorldOffset);
    flightBoundary.position.z = camera.position.z;
    const circumference = 2 * Math.PI * Math.hypot(flightBoundaryRadii.x, flightBoundaryRadii.y) / Math.SQRT2;
    const cellSize = 95;
    const uniforms = flightBoundaryMaterial.uniforms;
    uniforms.gridScale.value.set(Math.round(circumference / cellSize), length / cellSize);
    uniforms.strength.value = 0; uniforms.phase.value = 0; uniforms.contact.value = 0; uniforms.impactAge.value = 10;
    uniforms.gridOffset.value = 0;
    flightBoundaryDamageAt = 0; flightBoundaryImpactAt = -Infinity; flightBoundaryTouching = false;
    flightBoundaryImpact.set(0, 0, 0);
    flightBoundary.visible = false;
  }
  const shipBoundaryBounds = new THREE.Box3(), shipBoundaryLocal = new THREE.Vector3();
  const shipBoundaryNormal = new THREE.Vector3();
  function constrainShipToBoundary(ship) {
    if (!ship.visible || ship.userData.type.asteroid) return;
    const data = ship.userData;
    // Reserve space for the whole rotated hull, not just its center or nominal radius.
    ship.updateMatrix();
    shipBoundaryBounds.copy(data.collisionBox).applyMatrix4(ship.matrix);
    shipBoundaryBounds.getSize(shipBoundaryLocal).multiplyScalar(.5);
    let hullRadius = Math.hypot(shipBoundaryLocal.x / flightBoundaryRadii.x, shipBoundaryLocal.y / flightBoundaryRadii.y);
    if (hullRadius >= .95) {
      // A tilted dreadnought may not fit across the tunnel. Keep it lengthwise.
      ship.quaternion.identity(); data.baseRotation.identity();
      data.cruiseDirection.set(0, 0, -1); data.courseRight.set(1, 0, 0); data.courseUp.set(0, 1, 0);
      ship.updateMatrix();
      shipBoundaryBounds.copy(data.collisionBox).applyMatrix4(ship.matrix);
      shipBoundaryBounds.getSize(shipBoundaryLocal).multiplyScalar(.5);
      hullRadius = Math.hypot(shipBoundaryLocal.x / flightBoundaryRadii.x, shipBoundaryLocal.y / flightBoundaryRadii.y);
    }
    shipBoundaryBounds.getCenter(shipBoundaryLocal).sub(flightBoundaryOrigin).sub(courseWorldOffset);
    const radius = Math.hypot(shipBoundaryLocal.x / flightBoundaryRadii.x, shipBoundaryLocal.y / flightBoundaryRadii.y);
    // Keep a visible clearance inside the membrane, including wing tips on tilted ships.
    const limit = 1 - hullRadius - .02;
    if (radius <= limit) return;
    ship.position.x += shipBoundaryLocal.x * (limit / radius - 1);
    ship.position.y += shipBoundaryLocal.y * (limit / radius - 1);
    // Slide along the membrane without affecting forward travel or the player's shield.
    shipBoundaryNormal.set(shipBoundaryLocal.x / (flightBoundaryRadii.x * flightBoundaryRadii.x),
      shipBoundaryLocal.y / (flightBoundaryRadii.y * flightBoundaryRadii.y), 0).normalize();
    const outward = data.courseVelocity.dot(shipBoundaryNormal);
    if (outward > 0) data.courseVelocity.addScaledVector(shipBoundaryNormal, -outward);
    if (data.ringRoute) data.ringRoute.position.copy(ship.position).sub(courseWorldOffset);
  }
  function constrainPlayer(worldStep, gameTime, onRebound) {
    // Resolve the proposed world step BEFORE any scenery, gates or enemies move.
    flightBoundaryPrevious.copy(camera.position).sub(flightBoundaryOrigin).sub(courseWorldOffset);
    flightBoundaryLocal.copy(flightBoundaryPrevious).addScaledVector(worldStep, -.85);
    const rx = flightBoundaryRadii.x - playerHullRadius, ry = flightBoundaryRadii.y - playerHullRadius;
    if (Math.hypot(flightBoundaryLocal.x / rx, flightBoundaryLocal.y / ry) < 1) {
      flightBoundaryTouching = false;
      return;
    }
    flightBoundaryAim.copy(flightBoundaryLocal).sub(flightBoundaryPrevious);
    const x = flightBoundaryPrevious.x / rx, y = flightBoundaryPrevious.y / ry;
    const dx = flightBoundaryAim.x / rx, dy = flightBoundaryAim.y / ry;
    const a = dx * dx + dy * dy, b = 2 * (x * dx + y * dy), c = x * x + y * y - 1;
    const hitTime = c < 0 && a > 1e-16
      ? THREE.MathUtils.clamp((-b + Math.sqrt(Math.max(0, b * b - 4 * a * c))) / (2 * a), 0, 1) : 0;
    flightBoundaryLocal.copy(flightBoundaryPrevious).addScaledVector(flightBoundaryAim, hitTime);
    const radius = Math.hypot(flightBoundaryLocal.x / rx, flightBoundaryLocal.y / ry);
    flightBoundaryLocal.x /= radius; flightBoundaryLocal.y /= radius;
    flightBoundaryNormal.set(flightBoundaryLocal.x / (rx * rx), flightBoundaryLocal.y / (ry * ry), 0).normalize();
    const outward = flightMotion.dot(flightBoundaryNormal);
    const impact = outward > 1e-6 && !flightBoundaryTouching && gameTime >= flightBoundaryDamageAt;
    flightBoundaryTouching = true;
    if (impact) {
      flightBoundaryImpact.copy(flightBoundaryLocal);
      const wallRadius = Math.hypot(flightBoundaryImpact.x / flightBoundaryRadii.x, flightBoundaryImpact.y / flightBoundaryRadii.y);
      flightBoundaryImpact.x /= wallRadius; flightBoundaryImpact.y /= wallRadius;
      flightBoundaryMaterial.uniforms.impactNormal.value.set(
        flightBoundaryImpact.x / (flightBoundaryRadii.x * flightBoundaryRadii.x),
        flightBoundaryImpact.y / (flightBoundaryRadii.y * flightBoundaryRadii.y), 0).normalize();
    }
    // Stop at the first contact, leaving a tiny skin gap. Forward travel is untouched.
    flightBoundaryLocal.addScaledVector(flightBoundaryNormal, -.5);
    worldStep.x = (flightBoundaryPrevious.x - flightBoundaryLocal.x) / .85;
    worldStep.y = (flightBoundaryPrevious.y - flightBoundaryLocal.y) / .85;
    if (outward > 0) {
      // Retain tangential/forward momentum; rebound with 30% of the outward speed.
      flightMotion.addScaledVector(flightBoundaryNormal, -1.3 * outward);
      onRebound();
    }
    if (!impact) return;
    flightBoundaryImpactAt = gameTime; flightBoundaryDamageAt = gameTime + .75;
    return outward;
  }
  function updateFlightBoundary(dt, gameTime) {
    if (dt <= 0) return;
    flightBoundary.position.copy(flightBoundaryOrigin).add(courseWorldOffset);
    // Recenter only the open tube's geometry; its cells and impact points remain world-anchored.
    flightBoundary.position.z = camera.position.z;
    flightBoundaryLocal.copy(camera.position).sub(flightBoundaryOrigin).sub(courseWorldOffset);
    const rx = flightBoundaryRadii.x - playerHullRadius, ry = flightBoundaryRadii.y - playerHullRadius;
    const x = flightBoundaryLocal.x / rx, y = flightBoundaryLocal.y / ry;
    const vx = flightMotion.x * .85 / rx, vy = flightMotion.y * .85 / ry;
    const radius = Math.hypot(x, y), a = vx * vx + vy * vy, b = 2 * (x * vx + y * vy), c = radius * radius - 1;
    const impactTime = c >= 0 ? 0 : a > 1e-16 ? (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a) : Infinity;
    const clearance = (1 - radius) * Math.min(rx, ry);
    const proximity = 1 - THREE.MathUtils.smoothstep(clearance, 0, 550);
    const predicted = 1 - THREE.MathUtils.smoothstep(impactTime, 0, 3);
    const impactAge = Math.min(10, gameTime - flightBoundaryImpactAt);
    const contact = 1 - THREE.MathUtils.smoothstep(impactAge, 0, .75);
    const intensity = Math.max(proximity, predicted, contact);
    const uniforms = flightBoundaryMaterial.uniforms;
    uniforms.gridOffset.value = (flightBoundary.position.z - flightBoundaryOrigin.z - courseWorldOffset.z)
      / flightBoundary.scale.z * uniforms.gridScale.value.y;
    uniforms.strength.value += (intensity - uniforms.strength.value) * (1 - Math.exp(-8 * dt));
    uniforms.phase.value = gameTime;
    uniforms.contact.value = contact; uniforms.impactAge.value = impactAge;
    uniforms.impactPoint.value.copy(flightBoundaryImpact).add(flightBoundaryOrigin).add(courseWorldOffset);
    flightBoundaryAim.copy(flightBoundaryLocal);
    // Ease the look-ahead in: crossing the prediction threshold must not jump the visible horizon.
    if (impactTime > 0 && impactTime < 3) flightBoundaryAim.addScaledVector(flightMotion, .85 * impactTime * predicted);
    const aimRadius = Math.hypot(flightBoundaryAim.x / flightBoundaryRadii.x, flightBoundaryAim.y / flightBoundaryRadii.y);
    if (aimRadius > 1e-8) { flightBoundaryAim.x /= aimRadius; flightBoundaryAim.y /= aimRadius; }
    uniforms.warningPoint.value.copy(flightBoundaryAim).add(flightBoundaryOrigin).add(courseWorldOffset);
    flightBoundary.visible = uniforms.strength.value > .005 || contact > .005 || impactAge < 1.1;
  }
  return { mesh: flightBoundary, origin: flightBoundaryOrigin, radii: flightBoundaryRadii, normal: flightBoundaryNormal,
    reset: resetFlightBoundary, constrainPlayer, constrainShip: constrainShipToBoundary, update: updateFlightBoundary };
}
