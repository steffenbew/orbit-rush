import * as THREE from '../../assets/vendor/three.module.js';

// Plan local gate positions before translating the course into the moving world.
export function planCheckpoints({ level, reducedMotion, firstCheckpointTime, roundDuration, flightDistanceAt, levelFlightSpeed,
  openingComplete, corridorPlan, originZ, exitHeightAtCorridor }) {
  // Five fixed checkpoints; redistribute intermediate gates around, never inside, a corridor.
  const radius = reducedMotion ? 14 : 80;
  let depths = [firstCheckpointTime, 12, 22, 32, roundDuration - 5].map(flightDistanceAt);
  let approachDepth, exitDepth;
  if (corridorPlan) {
    const entranceDepth = originZ - corridorPlan.origin.z;
    const approachGap = Math.max(radius * 3, levelFlightSpeed(corridorPlan.entry / roundDuration) * .85 * 1.5);
    approachDepth = entranceDepth - approachGap;
    exitDepth = entranceDepth + corridorPlan.length;
    // Keep level two's familiar opening slalom; only its former 32-second gate moves to the entrance.
    depths = level === 2 ? [depths[0], depths[1], depths[2], approachDepth, depths[4]]
      : [depths[0], approachDepth, depths[4]];
    const gaps = [[depths[0], approachDepth], [exitDepth + radius * 2, depths.at(-1)]];
    while (depths.length < 5) {
      gaps.sort((a, b) => {
        const difference = (b[1] - b[0]) - (a[1] - a[0]);
        // Prefer the earlier gap on a tie, independent of floating-point drift at different speeds.
        return Math.abs(difference) < 1e-6 ? a[0] - b[0] : difference;
      });
      const [from, to] = gaps.shift(), middle = (from + to) / 2;
      depths.push(middle);
      gaps.push([from, middle], [middle, to]);
    }
    depths.sort((a, b) => a - b);
    // Level three's last steering gate belongs in the final field, not in the preceding breather.
    if (level === 3) depths[depths.length - 2] = flightDistanceAt(37);
  }
  const reinforcementDepth = depths[1] / 6;
  // Shorten only the first post-tutorial approach; keep corridor clearance and later gates intact.
  if (openingComplete && !corridorPlan) depths[1] = flightDistanceAt(10);
  return depths.map((depth, index) => {
    const exitHeight = corridorPlan && depth > exitDepth ? exitHeightAtCorridor : 0;
    // Steering matters from level 1; add vertical navigation from level 3.
    // Limit each offset by the neighboring flight distance, never shrink the checkpoint opening.
    const clearance = Math.min(depth - (depths[index - 1] || 0), (depths[index + 1] || depth * 2) - depth) * .12;
    const lateral = Math.min(clearance, radius * Math.min(3, 1.25 + (level - 1) * .45));
    const vertical = Math.min(clearance * .65, radius * Math.min(1.8, Math.max(0, level - 2) * .4));
    const x = [0, 1, -1, 1, 0][index] * lateral * (level % 2 ? 1 : -1);
    // Keep alternating climbs and descents when the corridor approach occupies a checkpoint.
    const verticalIndex = index - (depth > approachDepth ? 1 : 0);
    const y = exitHeight + (index === 0 || index === depths.length - 1 || depth === approachDepth
      ? 0 : (verticalIndex % 2 ? 1 : -1) * vertical);
    const kind = index === 0 ? 'start' : index === depths.length - 1 ? 'finish' : depth === approachDepth ? 'approach' : 'course';
    return { x, y, depth, radius, kind, reinforcementDepth };
  });
}

// A crossing is reported once. A lethal miss stops further contacts in that tick.
export function createCheckpoints({ scene, camera, reducedMotion, flightRingWash, flightRingGuide, onCrossing }) {
  const flightRing = new THREE.Group();
  flightRing.userData.flightRing = true;
  const flightRingCore = new THREE.MeshBasicMaterial({ color: 0xc0faff, transparent: true,
    opacity: 1, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
  flightRing.add(new THREE.Mesh(new THREE.TorusGeometry(1, .075, 12, 192), flightRingCore));
  const flightRingHalo = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { tint: { value: new THREE.Color(0x36dbff) }, pulse: { value: 1 }, phase: { value: 0 }, brightness: { value: 1 } },
    vertexShader: `varying vec2 ringUv;
      void main() { ringUv = uv * 3.0 - 1.5; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec2 ringUv;
      uniform vec3 tint; uniform float pulse; uniform float phase; uniform float brightness;
      void main() {
        float angle = atan(ringUv.y, ringUv.x);
        float radius = length(ringUv);
        // Tiny surface irregularities, not the large whole-ring wobble.
        float roughness = .004 * sin(angle * 11.0 + phase * 3.0) + .002 * sin(angle * 23.0 - phase * 5.0);
        float grain = .65 * sin(angle * 29.0 + phase * 13.0) + .35 * sin(angle * 71.0 - phase * 17.0);
        float distanceToRim = abs(radius - 1.0 - roughness);
        float pixel = fwidth(distanceToRim);
        float coreWidth = max(.075 * (1.0 + grain * .12), pixel * 1.5);
        float glowWidth = max(.21, pixel * 3.5);
        float core = 1.0 - smoothstep(coreWidth * .5, coreWidth, distanceToRim);
        float glow = exp(-pow(distanceToRim / glowWidth, 2.0));
        float highlight = pow(.5 + .5 * cos(angle - phase), 10.0);
        float filamentRadius = 1.115 + roughness + .012 * sin(angle * 31.0 - phase * 17.0)
          + .006 * sin(angle * 73.0 + phase * 23.0);
        float filament = exp(-pow((radius - filamentRadius) / max(.005, pixel * .6), 2.0));
        float arc = pow(.5 + .5 * sin(angle * 5.0 - phase * 4.0), 6.0);
        float sparks = pow(.5 + .5 * sin(angle * 43.0 + phase * 19.0), 16.0);
        gl_FragColor = vec4(mix(tint, vec3(.78, 1.0, 1.0), max(core, filament * arc)),
          min(1.0, core + glow * pulse * (.55 + highlight * .35)
            + filament * (arc * .8 + sparks * .3)) * brightness);
      }`
  });
  flightRing.add(new THREE.Mesh(new THREE.PlaneGeometry(3, 3), flightRingHalo));
  const flightRings = Array.from({ length: 5 }, (_, index) => {
    const gate = index === 0 ? flightRing : flightRing.clone();
    if (index > 0) {
      gate.children[0].material = flightRingCore.clone();
      gate.children[1].material = flightRingHalo.clone();
    }
    gate.children[0].material.onBeforeCompile = shader => {
      shader.uniforms.ringPhase = gate.children[1].material.uniforms.phase;
      shader.vertexShader = 'uniform float ringPhase;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        float angle = atan(position.y, position.x);
        float roughness = .004 * sin(angle * 11.0 + ringPhase * 3.0) + .002 * sin(angle * 23.0 - ringPhase * 5.0);
        float grain = .65 * sin(angle * 29.0 + ringPhase * 13.0) + .35 * sin(angle * 71.0 - ringPhase * 17.0);
        transformed.xy += normalize(position.xy) * (roughness + (length(position.xy) - 1.0) * grain * .12);
        transformed.z *= 1.0 + grain * .12;
      `);
    };
    gate.userData = { flightRing: true, normal: new THREE.Vector3(), previous: new THREE.Vector3(), radius: reducedMotion ? 14 : 80 };
    gate.visible = false;
    scene.add(gate);
    return gate;
  });
  const flightRingCrossing = new THREE.Vector3(), flightRingProjected = new THREE.Vector3();
  let flightRingWashUntil = 0, flightRingWashStrength = 0;
  function flightRingOpacity(gate, gameTime) {
    return (1 - THREE.MathUtils.smoothstep(gate.position.distanceTo(camera.position),
      reducedMotion ? 400 : 2600, reducedMotion ? 700 : 3600))
      * THREE.MathUtils.smoothstep(gameTime - gate.userData.fadeStart, 0, .4);
  }
  function reset(plan, courseOrigin, courseWorldOffset, gameTime, openingComplete) {
    flightRings.forEach((gate, index) => {
      if (openingComplete && index === 0) return;
      const { x, y, depth, radius, kind, reinforcementDepth } = plan[index];
      if (openingComplete && index === 1) gate.userData.reinforcementDepth = reinforcementDepth;
      gate.position.set(x, y, -depth).add(courseOrigin).add(courseWorldOffset);
      gate.userData.kind = kind;
      gate.userData.radius = radius;
      gate.scale.setScalar(radius);
      gate.userData.normal.set(0, 0, 1); gate.quaternion.identity();
      gate.userData.previous.copy(gate.position);
      gate.visible = true;
      gate.userData.resolved = false; gate.userData.passedAt = -Infinity;
      gate.userData.fadeStart = openingComplete && index === 1 ? Infinity : gameTime;
      const brightness = (index === (openingComplete ? 1 : 0) ? 1 : .3) * flightRingOpacity(gate, gameTime);
      gate.children[0].material.opacity = brightness;
      gate.children[1].material.uniforms.brightness.value = brightness;
    });
    flightRingWashUntil = 0; flightRingWashStrength = 0;
    flightRingGuide.hidden = true;
    flightRingWash.style.opacity = '0';
    flightRingWash.classList.remove('missed');
  }
  function render(gameTime, active, finished, viewCamera, width, height) {
    flightRingWash.style.opacity = String(active ? flightRingWashStrength * (reducedMotion ? .25 : 1) : 0);
    flightRingGuide.hidden = true;
    if (finished) flightRings.forEach(gate => { gate.visible = false; });
    const next = flightRings.find(gate => !gate.userData.resolved);
    if (!active || !next || flightRingOpacity(next, gameTime) === 0) return;
    flightRingGuide.style.opacity = String(flightRingOpacity(next, gameTime));
    // A distant checkpoint straight ahead needs no sideways arrow, even beyond the camera's far plane.
    flightRingProjected.copy(next.position).applyMatrix4(viewCamera.matrixWorldInverse);
    if (flightRingProjected.z < 0) {
      flightRingProjected.applyMatrix4(viewCamera.projectionMatrix);
      if (Math.abs(flightRingProjected.x) < .85 && Math.abs(flightRingProjected.y) < .8) return;
      flightRingProjected.x *= camera.aspect; // Convert screen fractions to equal units for the arrow angle.
    }
    // An off-screen guide makes it possible to find the fixed course after a turn.
    let x = flightRingProjected.x, y = -flightRingProjected.y;
    if (Math.hypot(x, y) < .01) x = 1;
    const angle = Math.atan2(y, x), edgeX = Math.cos(angle), edgeY = Math.sin(angle);
    flightRingGuide.style.left = `${width / 2 + edgeX * (width / 2 - 44)}px`;
    flightRingGuide.style.top = `${height / 2 + edgeY * (height / 2 - 100)}px`;
    flightRingGuide.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`;
    flightRingGuide.hidden = false;
  }
  function update(gameTime, worldStep, flightMotion) {
    let stopped = false;
    flightRingWashStrength = Math.max(0, (flightRingWashUntil - gameTime) / .35);
    const next = flightRings.find(gate => !gate.userData.resolved);
    for (const gate of flightRings) {
      const data = gate.userData;
      data.previous.copy(gate.position);
      gate.position.addScaledVector(worldStep, .85);
      if (data.resolved || stopped) continue;
      const halo = gate.children[1].material;
      const brightness = (gate === next ? 1 : .3) * flightRingOpacity(gate, gameTime);
      gate.children[0].material.opacity = brightness * (reducedMotion ? 1 : .9 + .1 * Math.sin(gameTime * 2.7));
      halo.uniforms.brightness.value = brightness;
      halo.uniforms.pulse.value = reducedMotion ? 1 : 1 + .12 * Math.sin(gameTime * 2.7);
      halo.uniforms.phase.value = reducedMotion ? 0 : gameTime * .5;
      const before = flightRingCrossing.copy(data.previous).sub(camera.position).dot(data.normal);
      const after = flightRingCrossing.copy(gate.position).sub(camera.position).dot(data.normal);
      const closingSpeed = -flightMotion.dot(data.normal) * .85;
      const timeToPlane = closingSpeed > 0 ? -after / closingSpeed : Infinity;
      if (gate === next && timeToPlane > 0 && timeToPlane < .2) {
        flightRingCrossing.copy(gate.position).addScaledVector(flightMotion, -.85 * timeToPlane).sub(camera.position);
        if (flightRingCrossing.length() <= data.radius) {
          flightRingWashStrength = 1 - timeToPlane / .2;
          flightRingWash.classList.remove('missed');
          halo.uniforms.pulse.value += reducedMotion ? 0 : flightRingWashStrength;
        }
      }
      if (before < 0 && after >= 0) {
        flightRingCrossing.lerpVectors(data.previous, gate.position, -before / (after - before)).sub(camera.position);
        const passed = flightRingCrossing.length() <= data.radius + 1e-6;
        gate.userData.passedAt = passed ? gameTime : -Infinity;
        gate.userData.resolved = true;
        gate.visible = false;
        flightRingWashUntil = gameTime + .35; flightRingWashStrength = 1;
        flightRingWash.classList.toggle('missed', !passed);
        stopped = onCrossing(gate, passed);
      }
    }
  }
  return { gates: flightRings, reset, update, render };
}
