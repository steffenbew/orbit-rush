import * as THREE from '../../assets/vendor/three.module.js';
import { createPlanet } from './planet.js';

export function createSpaceBackground(scene, camera, reducedMotion, sample = Math.random) {
  const random = (a, b) => a + sample() * (b - a);
  const pick = items => items[Math.floor(sample() * items.length)];
  // One world-aligned sky: calm nebulae, with a trace of travel in the far stars.
  const distantSky = new THREE.Group();
  scene.add(distantSky);
  const planet = createPlanet();
  planet.visible = false;
  distantSky.add(planet);
  const galaxy = new THREE.Mesh(new THREE.SphereGeometry(6000, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { skyColor: { value: new THREE.Color('#030711') } },
    vertexShader: `
      varying vec3 skyDirection;
      void main() {
        skyDirection = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 skyColor;
      varying vec3 skyDirection;
      float hash(vec3 p) {
        p = fract(p * 0.3183099 + vec3(0.13, 0.27, 0.41));
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      float noise(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
                       mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                       mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      void main() {
        vec3 direction = normalize(skyDirection);
        vec3 p = direction * 12.0;
        float clouds = noise(p) * 0.55 + noise(p * 2.07 + 5.0) * 0.3 + noise(p * 4.13 + 13.0) * 0.15;
        float latitude = direction.y + (noise(direction * 4.0) - 0.5) * 0.07;
        float band = exp(-pow(latitude / 0.12, 2.0));
        float lane = exp(-pow((latitude + (clouds - 0.5) * 0.08) / 0.022, 2.0));
        float light = band * (0.3 + clouds * 0.7) * (1.0 - lane * 0.6);
        vec3 color = skyColor + vec3(0.004, 0.006, 0.011) * light;
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
        // Static sub-pixel dither prevents visible steps in this very dark gradient.
        gl_FragColor.rgb += (hash(vec3(gl_FragCoord.xy, 0.0)) - 0.5) / 255.0;
      }
    `
  }));
  galaxy.renderOrder = -10;
  distantSky.add(galaxy);
  const starCount = 3500;
  const starPositions = new Float32Array(starCount * 3);
  const starColors = new Float32Array(starCount * 3);
  const starDirection = new THREE.Vector3();
  for (let i = 0; i < starCount; i++) {
    // Fill space uniformly, not a thin shell that turns into a ring as we travel.
    // Cube-root radius gives equal density per volume; acos avoids a polar band.
    starDirection.setFromSphericalCoords(6500 * Math.cbrt(sample()),
      Math.acos(random(-1, 1)), random(0, Math.PI * 2)).toArray(starPositions, i * 3);
    const color = new THREE.Color(pick([0xffffff, 0x9ecfff, 0xc6afff, 0xffdab0])).multiplyScalar(random(.45, 1));
    color.toArray(starColors, i * 3);
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  starGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
  starGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 6500);
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = glowCanvas.height = 64;
  const glowContext = glowCanvas.getContext('2d');
  const gradient = glowContext.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, '#fff');
  gradient.addColorStop(.15, '#ffffffef');
  gradient.addColorStop(.4, '#ffffff40');
  gradient.addColorStop(1, '#ffffff00');
  glowContext.fillStyle = gradient;
  glowContext.fillRect(0, 0, 64, 64);
  const glow = new THREE.CanvasTexture(glowCanvas);
  const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({
    size: 28, map: glow, vertexColors: true, transparent: true, fog: false,
    depthWrite: false, blending: THREE.AdditiveBlending
  }));
  stars.material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n varying float farStarVisibility;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        // Keep this layer distant; recycling happens only beyond its invisible edge.
        float starDistance = length(position);
        farStarVisibility = smoothstep(3000.0, 4000.0, starDistance)
          * (1.0 - smoothstep(6000.0, 6500.0, starDistance));
      `);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n varying float farStarVisibility;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.a *= farStarVisibility;');
  };
  stars.renderOrder = -8;
  distantSky.add(stars);

  // Nebulae belong to the same distant sky, not a separately scrolling foreground.
  for (let i = 0; i < 18; i++) {
    const cloud = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: pick([0x253655, 0x203c4a, 0x392b45]), opacity: .07, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    cloud.position.setFromSphericalCoords(5200, random(Math.PI * .32, Math.PI * .68), random(0, Math.PI * 2));
    cloud.scale.set(3000, 1800, 1);
    cloud.renderOrder = -9;
    distantSky.add(cloud);
  }

  // Share the same soft star texture, with individual sizes rather than uniform dots.
  function applyStarSizeVariation(shader) {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n attribute float starSize;')
      .replace('gl_PointSize = size;', 'gl_PointSize = size * starSize;');
  }

  // A gently drifting middle field bridges the distant sky and the fast nearby stars.
  const middleStarCount = 1200;
  const middlePositions = new Float32Array(middleStarCount * 3);
  const middleColors = new Float32Array(middleStarCount * 3);
  const middleSizes = new Float32Array(middleStarCount);
  const middleParallax = new Float32Array(middleStarCount);
  for (let i = 0; i < middleStarCount; i++) {
    middlePositions[i * 3] = random(-2400, 2400);
    middlePositions[i * 3 + 1] = random(-1600, 1600);
    middlePositions[i * 3 + 2] = random(-4000, 4000);
    new THREE.Color(pick([0xffffff, 0xc5dfff, 0xffdab0])).multiplyScalar(random(.4, .95)).toArray(middleColors, i * 3);
    middleSizes[i] = random(.65, 1.3);
    middleParallax[i] = random(.22, .55);
  }
  const middleGeometry = new THREE.BufferGeometry();
  middleGeometry.setAttribute('position', new THREE.BufferAttribute(middlePositions, 3));
  middleGeometry.setAttribute('color', new THREE.BufferAttribute(middleColors, 3));
  middleGeometry.setAttribute('starSize', new THREE.BufferAttribute(middleSizes, 1));
  const middleMaterial = new THREE.PointsMaterial({ size: 12, map: glow, vertexColors: true,
    opacity: .65, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  middleMaterial.onBeforeCompile = shader => {
    applyStarSizeVariation(shader);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n varying float middleVisibility;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        // Blend into the near field and soften recycling at the outer edges.
        middleVisibility = smoothstep(500.0, 1100.0, length(position))
          * (1.0 - smoothstep(2000.0, 2400.0, abs(position.x)))
          * (1.0 - smoothstep(1300.0, 1600.0, abs(position.y)))
          * (1.0 - smoothstep(3400.0, 4000.0, abs(position.z)));
      `);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n varying float middleVisibility;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.a *= middleVisibility;');
  };
  const middleStars = new THREE.Points(middleGeometry, middleMaterial);
  middleStars.visible = false;
  scene.add(middleStars);

  // Keep the dense, fast foreground, but mix small faint stars with bright close passes.
  const dustCount = 2800;
  const dustPositions = new Float32Array(dustCount * 3);
  const dustColors = new Float32Array(dustCount * 3);
  const dustSizes = new Float32Array(dustCount);
  for (let i = 0; i < dustCount; i++) {
    dustPositions[i * 3] = random(-1400, 1400);
    dustPositions[i * 3 + 1] = random(-900, 900);
    dustPositions[i * 3 + 2] = random(-2100, 2100);
    new THREE.Color(pick([0xffffff, 0xc5dfff, 0xffdab0])).multiplyScalar(random(.45, 1)).toArray(dustColors, i * 3);
    dustSizes[i] = .6 + Math.pow(sample(), 1.6) * .9;
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  dustGeometry.setAttribute('color', new THREE.BufferAttribute(dustColors, 3));
  dustGeometry.setAttribute('starSize', new THREE.BufferAttribute(dustSizes, 1));
  const flightDust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({
    size: 6, map: glow, vertexColors: true, opacity: .85, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending
  }));
  flightDust.material.onBeforeCompile = shader => {
    applyStarSizeVariation(shader);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n varying float dustVisibility;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        // Fade every face of the surrounding volume, never expose a hard star-field edge.
        dustVisibility = (1.0 - smoothstep(1050.0, 1400.0, abs(position.x)))
          * (1.0 - smoothstep(650.0, 900.0, abs(position.y)))
          * (1.0 - smoothstep(1700.0, 2100.0, abs(position.z)));
      `);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n varying float dustVisibility;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.a *= dustVisibility;');
  };
  flightDust.visible = false;
  scene.add(flightDust);
  function updateSpaceBackground(worldStep, level, started, paused, crashDrifting) {
    // Keep the sky centered, never copy camera rotation: stars and horizon turn together.
    distantSky.position.copy(camera.position);
    planet.visible = started && level % 4 === 0;
    middleStars.visible = flightDust.visible = started && !reducedMotion;
    if (!flightDust.visible || (paused && !crashDrifting)) return;
    for (let i = 0; i < starCount; i++) {
      starDirection.fromArray(starPositions, i * 3).addScaledVector(worldStep, .025);
      // Wrap across the outer sphere while fully transparent, never at a screen edge.
      if (starDirection.lengthSq() > 6500 * 6500) starDirection.negate().setLength(6500);
      starDirection.toArray(starPositions, i * 3);
    }
    starGeometry.attributes.position.needsUpdate = true;
    for (let i = 0; i < middleStarCount; i++) {
      const parallax = middleParallax[i];
      middlePositions[i * 3] += worldStep.x * parallax;
      middlePositions[i * 3 + 1] += worldStep.y * parallax;
      middlePositions[i * 3 + 2] += worldStep.z * parallax;
      if (middlePositions[i * 3] < -2400) middlePositions[i * 3] += 4800;
      if (middlePositions[i * 3] > 2400) middlePositions[i * 3] -= 4800;
      if (middlePositions[i * 3 + 1] < -1600) middlePositions[i * 3 + 1] += 3200;
      if (middlePositions[i * 3 + 1] > 1600) middlePositions[i * 3 + 1] -= 3200;
      if (middlePositions[i * 3 + 2] > 4000) middlePositions[i * 3 + 2] -= 8000;
      if (middlePositions[i * 3 + 2] < -4000) middlePositions[i * 3 + 2] += 8000;
    }
    middleGeometry.attributes.position.needsUpdate = true;
    for (let i = 0; i < dustCount; i++) {
      dustPositions[i * 3] += worldStep.x;
      dustPositions[i * 3 + 1] += worldStep.y;
      dustPositions[i * 3 + 2] += worldStep.z;
      if (dustPositions[i * 3] < -1400) dustPositions[i * 3] += 2800;
      if (dustPositions[i * 3] > 1400) dustPositions[i * 3] -= 2800;
      if (dustPositions[i * 3 + 1] < -900) dustPositions[i * 3 + 1] += 1800;
      if (dustPositions[i * 3 + 1] > 900) dustPositions[i * 3 + 1] -= 1800;
      if (dustPositions[i * 3 + 2] > 2100) dustPositions[i * 3 + 2] -= 4200;
      if (dustPositions[i * 3 + 2] < -2100) dustPositions[i * 3 + 2] += 4200;
    }
    dustGeometry.attributes.position.needsUpdate = true;
  }
  return { planet, glow, updateSpaceBackground, distantSky, galaxy, stars, middleStars, flightDust, middleParallax };
}
