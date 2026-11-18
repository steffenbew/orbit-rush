import * as THREE from '../../assets/vendor/three.module.js';

// Preview the actual fleet; only the ornamental belt gets new meshes.
export function createIntro({ scene, camera, ships, reducedMotion, introPlay, orbitHover }) {
  const introFormation = [
    { ship: ships[0], x: -.76, y: .70, mobileX: -.60, mobileY: .76, depth: 220, yaw: .35, pitch: .92 },
    { ship: ships[1], x: .74, y: .70, mobileX: .56, mobileY: .76, depth: 430, yaw: .35, pitch: .65, mobilePitch: .75 },
    { ship: ships[2], x: .70, y: -.55, mobileX: .53, mobileY: -.72, depth: 620, mobileDepth: 800, yaw: .70, pitch: .45, mobilePitch: .9 },
    { ship: ships[8], x: -.62, y: -.50, mobileX: -.24, mobileY: -.64, depth: 1600, mobileDepth: 2100, yaw: -.55, pitch: .35 }
  ];
  let introTime = 0;
  ships.forEach(ship => { ship.visible = introFormation.some(placement => placement.ship === ship); });
  function updateIntroShips(time, width) {
    const compact = width < 600 || camera.aspect < 1.2;
    introFormation.forEach((placement, index) => {
      const ship = placement.ship;
      // Preserve gameplay proportions; frame the fleet with distance, not per-ship resizing.
      ship.scale.setScalar(ship.userData.type.scale);
      const depth = (compact && placement.mobileDepth ? placement.mobileDepth : placement.depth) + Math.sin(time * .1 + index) * 18;
      const halfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * depth;
      const x = (compact ? placement.mobileX : placement.x) + Math.sin(time * .16 + index * 2.1) * .035;
      const y = (compact ? placement.mobileY : placement.y) + Math.sin(time * .13 + index) * .025;
      ship.position.set(x * halfHeight * camera.aspect, y * halfHeight, -depth);
      const pitch = compact ? (placement.mobilePitch ?? placement.pitch) : placement.pitch;
      ship.rotation.set(pitch + Math.sin(time * .12 + index) * .08,
        placement.yaw + Math.sin(time * .1 + index) * .12,
        Math.sin(time * .14 + index * 2) * .14);
    });
  }
  // Decorative only: share the existing rock geometries, never the gameplay fleet or shaders.
  const introAsteroids = new THREE.Group();
  const introRockMaterial = new THREE.MeshStandardMaterial({ color: 0xb6ada0,
    roughness: 1, metalness: .04, flatShading: true, vertexColors: true });
  const introRockCount = 60;
  const introRockSizes = Array.from({ length: introRockCount }, (_, index) =>
    index % 10 === 0 ? 22 + Math.random() * 10 : 7 + Math.random() ** 1.5 * 13);
  const introRockPhases = Array.from({ length: introRockCount }, (_, index) =>
    (index + Math.random() * .7) * Math.PI * 2 / introRockCount);
  const introRockOffsets = Array.from({ length: introRockCount }, () => .84 + Math.random() * .32);
  const introRockSpeeds = Array.from({ length: introRockCount }, () => .9 + Math.random() * .2);
  const introRockSpins = Array.from({ length: introRockCount }, () =>
    new THREE.Vector3((Math.random() - .5) * .22, (Math.random() - .5) * .26, (Math.random() - .5) * .16));
  for (let index = 0; index < introRockCount; index++) {
    introAsteroids.add(new THREE.Mesh(ships[index % 2 ? 7 : 4].children[0].geometry, introRockMaterial.clone()));
  }
  scene.add(introAsteroids);
  const orbitTilt = -24 * Math.PI / 180;
  let orbitPhase = 0, orbitSpeed = Math.PI * 2 / 90, orbitTime = 0;
  function updateIntroOrbit(dt, width, height) {
    if (!reducedMotion) {
      const hovering = orbitHover.matches && !introPlay.disabled && introPlay.matches(':hover');
      const targetSpeed = Math.PI * 2 / (hovering ? 45 : 90);
      orbitSpeed += (targetSpeed - orbitSpeed) * (1 - Math.exp(-2 * dt));
      orbitPhase += orbitSpeed * dt;
      orbitTime += dt;
    }
    const diameter = Math.min(width * .98, height * 1.2, 1040);
    const basePixelScale = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 260 / height;
    introAsteroids.children.forEach((rock, index) => {
      // Bounded individual drift keeps clusters alive without opening large gaps.
      const drift = .03 * Math.sin(orbitPhase * introRockSpeeds[index] + index);
      const phase = introRockPhases[index] + orbitPhase + drift;
      const x = Math.cos(phase) * diameter * 350 / 800 * introRockOffsets[index];
      const y = Math.sin(phase) * diameter * 175 / 800 * introRockOffsets[index];
      const farSide = (Math.sin(phase) + 1) / 2;
      const depth = 248 + farSide * 24;
      const pixelScale = basePixelScale * depth / 260;
      rock.position.set((x * Math.cos(orbitTilt) - y * Math.sin(orbitTilt)) * pixelScale,
        -(x * Math.sin(orbitTilt) + y * Math.cos(orbitTilt)) * pixelScale, -depth);
      // Keep perspective subtle so the belt reads as one coherent ring.
      rock.scale.setScalar(introRockSizes[index] / 11 * basePixelScale * 1.1);
      rock.material.color.copy(introRockMaterial.color).multiplyScalar(1 - farSide * .08);
      const spin = introRockSpins[index];
      rock.rotation.set(index * .7 + orbitTime * spin.x, index * .9 + orbitTime * spin.y, index * .4 + orbitTime * spin.z);
    });
  }
  function update(dt, width, height, hidden) {
    if (hidden) return;
    if (!reducedMotion) introTime += dt;
    updateIntroShips(introTime, width);
    updateIntroOrbit(dt, width, height);
  }
  return { update, hide() { introAsteroids.visible = false; } };
}
