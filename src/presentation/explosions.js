import * as THREE from '../../assets/vendor/three.module.js';

// Visual particles only. Solid, damaging rock fragments live in course/fragments.js.
export function createExplosions({ scene, camera, glow, reducedMotion, random, pick, onBlast }) {
  let particles = [];
  const particleView = new THREE.Vector3();
  const shockwaves = [];
  const shockGeometry = new THREE.RingGeometry(.85, 1, 64);
  const capitalShockGeometry = new THREE.RingGeometry(.97, 1, 96);
  const debrisGeometry = new THREE.TetrahedronGeometry(1, 0);
  const symbolTextures = new Map();
  function symbolTexture(symbol) {
    if (!symbolTextures.has(symbol)) {
      const surface = document.createElement('canvas');
      surface.width = surface.height = 128;
      const context = surface.getContext('2d');
      context.font = '96px "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(symbol, 64, 68);
      const texture = new THREE.CanvasTexture(surface);
      texture.colorSpace = THREE.SRGBColorSpace;
      symbolTextures.set(symbol, texture);
    }
    return symbolTextures.get(symbol);
  }
  const emojis = ['🥰', '🌈', '⭐', '💖', '🌸', '🦋', '✨'];
  function dust(ship) {
    const fragmentScale = ship.scale.x / 3.2;
    for (let i = 0; i < (reducedMotion ? 12 : 32); i++) {
      const object = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glow, color: pick([0x9c8d7b, 0xc3af8b, 0x70675f]),
        transparent: true, depthWrite: false, opacity: .5
      }));
      const direction = new THREE.Vector3().randomDirection();
      object.position.copy(ship.position).addScaledVector(direction, random(2, 12) * fragmentScale);
      const baseSize = random(2, 7) * fragmentScale;
      object.scale.setScalar(baseSize);
      const velocity = direction.multiplyScalar(random(35, 100));
      particles.push({ object, kind: 'dust', baseSize, vx: velocity.x, vy: velocity.y, vz: velocity.z,
        age: 0, life: random(.5, 1.2), spin: 0 });
      scene.add(object);
    }
  }
  function explode(position, count = 65, crashBurst = false, asteroid = false, sizeFactor = 1, screenFlash = true, capital = false) {
    // The destroyer's finale is always enormous, never dependent on the rare bonus roll.
    const destruction = count >= 65 && !crashBurst;
    const spectacular = destruction && !capital && random(0, 1) < .02;
    const explosionSize = sizeFactor * (capital ? (reducedMotion ? 2.1 : 3.2)
      : destruction ? (spectacular ? 2.8 : random(.65, 1.35)) : 1);
    const particleCount = capital ? (reducedMotion ? 28 : 180) : Math.round(count * Math.sqrt(explosionSize));
    const motion = (capital || crashBurst) && reducedMotion ? .25 : 1;
    const lifetime = capital ? 1.8 : 1;
    // Real destructions, including nearby ship/asteroid accidents, carry a blast.
    // Ordinary hit sparks and the separate player-crash sequence do not.
    if (!crashBurst && (count >= 65 || asteroid)) onBlast(position, explosionSize, screenFlash);
    if (count >= 65 || crashBurst) {
      const ring = new THREE.Mesh(capital || crashBurst ? capitalShockGeometry : shockGeometry, new THREE.MeshBasicMaterial({ color: 0xffb46d, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: !capital, blending: THREE.AdditiveBlending }));
      ring.position.copy(position);
      if (crashBurst) ring.quaternion.copy(camera.quaternion);
      const fireball = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffa340, transparent: true, depthWrite: false, fog: !capital, blending: THREE.AdditiveBlending }));
      fireball.position.copy(position);
      scene.add(ring, fireball);
      shockwaves.push({ ring, fireball, age: 0, crashBurst,
        size: (crashBurst ? (reducedMotion ? .3 : 1.8) : 1.5) * explosionSize,
        life: crashBurst ? .8 : capital ? 2.6 : 1.1 });
    }
    for (let i = 0; i < particleCount; i++) {
      const kind = i % 5 === 0 ? 'smoke' : i % 3 === 0 ? 'spark' : 'fire';
      const scale = crashBurst ? (reducedMotion ? .25 : .4) : count >= 65 ? 1.5 * explosionSize : 1;
      const spread = capital ? 18 : 4;
      const object = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glow, color: kind === 'smoke' ? 0x443b36 : 0xffe5a0,
        transparent: true, depthWrite: false, fog: !capital || kind === 'smoke',
        blending: kind === 'smoke' ? THREE.NormalBlending : THREE.AdditiveBlending,
        rotation: random(-Math.PI, Math.PI)
      }));
      object.position.copy(position).add(new THREE.Vector3(random(-spread, spread), random(-spread, spread), random(-spread, spread)).multiplyScalar(scale));
      const baseSize = scale * (kind === 'spark' ? random(1, 3) : random(8, 22));
      object.scale.setScalar(baseSize);
      const direction = new THREE.Vector3().randomDirection();
      const velocity = scale * motion * (kind === 'spark' ? random(90, 190) : kind === 'smoke' ? random(12, 35) : random(40, 100));
      particles.push({ object, kind, baseSize, vx: direction.x * velocity, vy: direction.y * velocity,
        vz: direction.z * velocity, age: 0,
        life: lifetime * (kind === 'smoke' ? random(1, 1.8) : kind === 'spark' ? random(.25, .65) : random(.4, .95)),
        spin: capital && reducedMotion ? 0 : random(-2, 2) });
      scene.add(object);
    }
    if (!asteroid && (count >= 65 || crashBurst)) {
      const scale = (crashBurst ? .25 : 1) * explosionSize;
      const debrisCount = crashBurst ? (reducedMotion ? 3 : 7) : reducedMotion ? 5 : capital ? 48 : Math.min(36, Math.round(16 * explosionSize));
      for (let i = 0; i < debrisCount; i++) {
        const object = new THREE.Mesh(debrisGeometry, new THREE.MeshStandardMaterial({
          color: 0x4b3028, metalness: .6, roughness: .65,
          emissive: 0xff5a12, emissiveIntensity: 1.5, transparent: true
        }));
        object.position.copy(position);
        object.scale.set(random(.7, 2.5) * scale, random(.4, 1.4) * scale, random(1, 3.5) * scale);
        object.rotation.set(random(-Math.PI, Math.PI), random(-Math.PI, Math.PI), random(-Math.PI, Math.PI));
        const velocity = new THREE.Vector3().randomDirection().multiplyScalar(random(100, 230) * scale * motion);
        particles.push({ object, kind: 'debris', vx: velocity.x, vy: velocity.y, vz: velocity.z,
          age: 0, life: random(1.1, 2) * lifetime, spin: reducedMotion ? 0 : random(-10, 10) });
        scene.add(object);
      }
    }
  }
  function sprayEmojis(x, y, count, viewCamera, width, height) {
    camera.updateMatrixWorld();
    const direction = new THREE.Vector3(x / width * 2 - 1, 1 - y / height * 2, .5)
      .unproject(viewCamera).sub(viewCamera.position).normalize();
    for (let i = 0; i < count; i++) {
      const distance = random(90, 140);
      const object = new THREE.Sprite(new THREE.SpriteMaterial({
        map: symbolTexture(pick(emojis)),
        transparent: true, depthWrite: false, rotation: random(-.5, .5)
      }));
      object.scale.setScalar(random(4, 7));
      object.position.copy(viewCamera.position).addScaledVector(direction, distance);
      object.position.x += random(-1, 1);
      object.position.y += random(-1, 1);
      const angle = random(0, Math.PI * 2), velocity = random(5, 22);
      particles.push({ object, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity,
        age: 0, life: random(3, 4), spin: random(-4, 4) });
      scene.add(object);
    }
  }
  function crashBurst(impact, flightMotion) {
    const firstParticle = particles.length;
    explode(impact, reducedMotion ? 12 : 120, true);
    // Particles receive the full world step, so inherit the full flight velocity too.
    for (let i = firstParticle; i < particles.length; i++) {
      particles[i].vx += flightMotion.x;
      particles[i].vy += flightMotion.y;
      particles[i].vz += flightMotion.z;
    }
  }
  function update(dt, worldStep, viewCamera, moving) {
    for (let i = shockwaves.length - 1; i >= 0; i--) {
      const wave = shockwaves[i];
      if (moving) wave.age += dt;
      // The brief hull blast travels with us; the surrounding world keeps moving.
      if (!wave.crashBurst) for (const object of [wave.ring, wave.fireball]) object.position.add(worldStep);
      const age = wave.age * (1.1 / wave.life);
      const quietCrash = wave.crashBurst && reducedMotion;
      const expansion = quietCrash ? 0 : age;
      wave.ring.scale.setScalar((5 + expansion * 140) * wave.size);
      wave.ring.material.opacity = (quietCrash ? .15 : .45) * Math.max(0, 1 - age / 1.1);
      wave.fireball.scale.setScalar((40 + expansion * 110) * wave.size);
      wave.fireball.material.color.setRGB(1, Math.max(.12, .65 - age), .025);
      wave.fireball.material.opacity = (quietCrash ? .3 : 1) * Math.max(0, 1 - age / .7);
      if (wave.age > wave.life) {
        scene.remove(wave.ring, wave.fireball);
        wave.ring.material.dispose(); wave.fireball.material.dispose();
        shockwaves.splice(i, 1);
      }
    }
    particles = particles.filter(p => {
      if (moving) p.age += dt;
      if (p.age >= p.life || particleView.copy(p.object.position).applyMatrix4(viewCamera.matrixWorldInverse).z > 25) {
        scene.remove(p.object); p.object.material.dispose();
        return false;
      }
      // Drawings and particles stay in the world as the player flies in any direction.
      p.object.position.add(worldStep);
      if (moving) {
        p.object.position.x += p.vx * dt;
        p.object.position.y += p.vy * dt;
        if (p.kind) p.object.position.z += p.vz * dt;
        const drag = Math.exp(-(p.kind === 'debris' ? .55 : p.kind ? 1.2 : 2) * dt);
        p.vx *= drag;
        p.vy *= drag;
        if (p.kind) p.vz *= drag;
        if (p.object.isSprite) p.object.material.rotation += p.spin * dt * .3;
        else {
          p.object.rotation.x += p.spin * dt;
          p.object.rotation.y += p.spin * dt * .7;
        }
      }
      if (p.kind) {
        const progress = p.age / p.life;
        if (p.kind === 'dust') {
          p.object.scale.setScalar(p.baseSize * (1 + progress * 2));
          p.object.material.opacity = .5 * Math.pow(1 - progress, 1.5);
        } else if (p.kind === 'debris') {
          p.object.material.emissiveIntensity = 1.5 * Math.pow(1 - progress, 2);
          p.object.material.opacity = Math.min(1, (1 - progress) * 4);
        } else if (p.kind === 'smoke') {
          p.object.scale.setScalar(p.baseSize * (1 + progress * 2));
          p.object.material.opacity = Math.sin(progress * Math.PI) * .35;
        } else {
          p.object.material.color.setRGB(1, Math.max(.06, .85 * (1 - progress)), .12 * (1 - progress));
          p.object.scale.setScalar(p.baseSize * (p.kind === 'fire' ? 1 + progress * 1.8 : 1 - progress * .5));
          p.object.material.opacity = Math.min(1, p.age / .04) * Math.pow(1 - progress, 1.4);
        }
      } else {
        p.object.material.opacity = Math.min(1, (p.life - p.age) / 1.2);
      }
      return true;
    });
  }
  function clear() {
    for (const p of particles) { scene.remove(p.object); p.object.material.dispose(); }
    particles = [];
    for (const wave of shockwaves) {
      scene.remove(wave.ring, wave.fireball); wave.ring.material.dispose(); wave.fireball.material.dispose();
    }
    shockwaves.length = 0;
  }

  return { explode, dust, crashBurst, sprayEmojis, update, clear, shockwaves, get particles() { return particles; } };
}
