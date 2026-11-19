import * as THREE from '../../assets/vendor/three.module.js';

// Gates are field-local; pooled rock positions are written in world coordinates.
// The level and phase fix the route. The sampler controls variation in the debris.
export function populateAsteroidField({ gates, level, phase, showerLength, showerStrength,
  showerOrigin, playerHullRadius, eventAsteroid, sample = Math.random }) {
  const random = (a, b) => a + sample() * (b - a);
  const fieldImpacts = [], fieldDebris = [];
  const coreRadius = 180;
  const shape = (level - 1 + phase) % 3, angle = level * .73 + phase * .91;
  const diffuse = level > 1 && (level + phase) % 3 === 2; // Occasional older remnants; stable on retry.
  let fieldSeed = (Math.imul(level, 73856093) ^ Math.imul(phase + 1, 19349663)) >>> 0;
  const fieldRandom = () => ((fieldSeed = (Math.imul(fieldSeed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const courseAt = depth => {
    const next = gates.findIndex(gate => gate.position.z <= -depth);
    if (next <= 0) return gates[Math.max(0, next)].position.clone().setZ(-depth);
    const before = gates[next - 1].position, after = gates[next].position;
    return before.clone().lerp(after, (before.z + depth) / (before.z - after.z));
  };
  const edges = [0, ...gates.map(gate => -gate.position.z).filter(depth => depth > 0 && depth < showerLength), showerLength];
  const gaps = edges.slice(1).map((depth, index) => [edges[index], depth]);
  // One compact breakup in the widest gap; prefer the earlier gap on a tie.
  gaps.sort((a, b) => {
    const difference = (b[1] - b[0]) - (a[1] - a[0]);
    return Math.abs(difference) < 1e-6 ? a[0] - b[0] : difference;
  });
  const [from, to] = gaps[0], depth = from + (to - from) * (.38 + fieldRandom() * .24);
  const fieldRoute = gates.map(gate => gate.position.clone());
  const baseline = courseAt(depth), side = (level + phase) % 2 ? 1 : -1;
  const axis = level >= 9 && level % 3 === 0 ? 'y' : 'x';
  const room = Math.min(...edges.map(value => Math.abs(value - depth)));
  const detour = coreRadius + playerHullRadius + 14;
  const blocking = room * (axis === 'y' ? .26 : .35) >= detour;
  const position = baseline.clone(), passage = baseline.clone();
  if (blocking) {
    // Level three blocks the checkpoint approach: dodge first, then line up with the late gate.
    // Other fields keep their independently offset formations.
    if (level !== 3) {
      position.x = baseline.x * .35 + (fieldRandom() - .5) * 140;
      position.y = baseline.y + (fieldRandom() - .5) * 100;
    }
    passage[axis] = position[axis] + side * detour;
    fieldRoute.push(passage);
  }
  else {
    position[axis] -= side * (coreRadius + playerHullRadius + 90);
    position.x += (fieldRandom() - .5) * 100;
    position.y += (fieldRandom() - .5) * 80;
  }
  const primary = { position, coreRadius, passage, blocking, axis, shape, angle, diffuse, rocks: [] };
  fieldRoute.sort((a, b) => b.z - a.z);
  // DART/Scheila-inspired ejecta, independent of the camera and direction of flight.
  const makeImpact = (source, reach, width, height, age) => {
    const a = fieldRandom(), b = fieldRandom() * Math.PI * 2, c = fieldRandom() * Math.PI * 2;
    const rotation = new THREE.Quaternion(Math.sqrt(1 - a) * Math.sin(b), Math.sqrt(1 - a) * Math.cos(b),
      Math.sqrt(a) * Math.sin(c), Math.sqrt(a) * Math.cos(c));
    const drift = new THREE.Vector3(0, 0, -reach).applyQuaternion(rotation);
    const u = new THREE.Vector3(1, 0, 0).applyQuaternion(rotation), v = new THREE.Vector3(0, 1, 0).applyQuaternion(rotation);
    const rays = [-.8, .2, 1.4, 3].map(bearing => drift.clone()
      .addScaledVector(u, Math.cos(angle + bearing) * width)
      .addScaledVector(v, Math.sin(angle + bearing) * height));
    return { source: source.clone(), drift, u, v, width, height, age, rays };
  };
  // The first field is a tighter breakup.
  const reach = Math.min(900, showerLength * .3) * (level === 1 ? .65 : 1);
  const firstImpact = makeImpact(primary.position, reach, reach * .8, reach * .55, 1);
  fieldImpacts.push(firstImpact);
  // Some settled fields retain an old crossing scar, unrelated to the player's course.
  primary.tunnel = null;
  if (diffuse && (level + phase) % 2 === 1) {
    const radius = 120, direction = firstImpact.drift.clone().normalize();
    const across = new THREE.Vector3(-direction.y, direction.x, 0);
    if (across.lengthSq() < .01) across.copy(firstImpact.u);
    // Offset beside the surviving core, without pushing the bore outside the encounter's depth.
    const center = primary.position.clone().addScaledVector(across.normalize(), radius + 110);
    primary.tunnel = { center, direction, radius };
  }
  if (!diffuse && shape !== 0) {
    const source = primary.position.clone();
    source[primary.axis] += Math.sign(primary.position[primary.axis] - primary.passage[primary.axis]) * 170;
    source.z += Math.sin(angle * 1.7) * Math.min(showerLength * .12, 180);
    source.z = THREE.MathUtils.clamp(source.z, -showerLength * .94 + 80, -80);
    firstImpact.rays.unshift(source.clone().sub(primary.position).divideScalar(.7));
    fieldImpacts.push(makeImpact(source, reach * .55,
      reach * .4, reach * .25, .7));
  }
  primary.pockets = [];
  const pickPocket = () => {
    if (!diffuse || sample() < .12) return null; // A few isolated pieces between the pockets.
    let weight = sample() * primary.pockets.reduce((sum, pocket) => sum + pocket.weight, 0);
    return primary.pockets.find(pocket => (weight -= pocket.weight) < 0);
  };
  const debrisPoint = (radius, pocket = null) => {
    if (diffuse) {
      const z = random(-1, 1), bearing = random(-Math.PI, Math.PI), ring = Math.sqrt(1 - z * z);
      const travel = (sample() + sample() + sample()) / 3;
      const spread = pocket ? pocket.spread : new THREE.Vector3(reach, reach * .9, reach);
      const position = (pocket ? pocket.center : firstImpact.source).clone()
        .addScaledVector(firstImpact.u, Math.cos(bearing) * ring * travel * spread.x)
        .addScaledVector(firstImpact.v, Math.sin(bearing) * ring * travel * spread.y)
        .addScaledVector(firstImpact.drift, z * travel * spread.z / reach);
      return { position, impact: 0, travel: position.distanceTo(firstImpact.source) / reach,
        pocket: pocket ? primary.pockets.indexOf(pocket) : -1 };
    }
    const impact = fieldImpacts.length > 1 && sample() < .3 ? 1 : 0, event = fieldImpacts[impact];
    // Fine debris has a longer reach on average; sizes still overlap rather than forming sorted bands.
    const fraction = Math.min(1, radius / 45);
    const travel = random(.08, 1) * (.4 + .6 * Math.sqrt(1 - fraction)) * event.age;
    const filament = Math.floor(Math.pow(sample(), 1.6) * event.rays.length);
    const ray = event.rays[filament];
    const spread = sample() < .8 ? .1 : .35;
    const position = event.source.clone().addScaledVector(ray, travel)
      .addScaledVector(event.u, random(-1, 1) * event.width * spread * travel)
      .addScaledVector(event.v, random(-1, 1) * event.height * spread * travel);
    return { position, impact, travel };
  };
  // Reserve only a narrow, bending escape route; the direct course is not kept empty.
  const segment = new THREE.Line3(), closest = new THREE.Vector3(), sphere = new THREE.Sphere();
  const occupied = [], routeClearance = playerHullRadius + 40;
  const tunnelOffset = new THREE.Vector3();
  const canPlace = (point, radius) => {
    if (point.z + radius > 0 || point.z - radius < -showerLength * .94) return false;
    if (primary.tunnel) {
      const tunnel = primary.tunnel;
      tunnelOffset.copy(point).sub(tunnel.center);
      const along = tunnelOffset.dot(tunnel.direction);
      const width = tunnel.radius * (1 + .1 * Math.sin(along / (tunnel.radius * 2) + angle));
      // Reject entire hulls, not only centers. Uneven edges avoid a machined-looking bore.
      if (tunnelOffset.lengthSq() - along * along < (width + radius * 1.05) ** 2) return false;
    }
    if (gates.some(gate => point.distanceTo(gate.position) < radius + gate.radius * 1.5 + playerHullRadius)) return false;
    for (let i = 1; i < fieldRoute.length; i++) {
      segment.set(fieldRoute[i - 1], fieldRoute[i]).closestPointToPoint(point, true, closest);
      if (point.distanceToSquared(closest) < (radius + routeClearance) ** 2) return false;
    }
    // Prevent intersecting hulls, not close neighbours: density comes from the pockets, not uniform padding.
    return !occupied.some(other => point.distanceToSquared(other.point) < (radius + other.radius + (diffuse ? 1 : 4)) ** 2);
  };
  if (diffuse) {
    const count = 3 + Math.floor(fieldRandom() * 3);
    for (let i = 0; i < count; i++) {
      const coarse = fieldRandom() < .35;
      const radius = reach * (coarse ? .14 + fieldRandom() * .12 : .09 + fieldRandom() * .12);
      const spread = new THREE.Vector3(radius, radius * (.4 + fieldRandom() * .7), radius * (.5 + fieldRandom() * .8));
      const weight = .15 + Math.pow(fieldRandom(), 2) * 1.85;
      const sizePower = coarse ? 1 + fieldRandom() * .8 : 2.4 + fieldRandom() * 3;
      const sizeScale = coarse ? .7 + fieldRandom() * .3 : .28 + fieldRandom() * .42;
      for (let attempt = 0; attempt < 24; attempt++) {
        const z = fieldRandom() * 2 - 1, bearing = fieldRandom() * Math.PI * 2, ring = Math.sqrt(1 - z * z);
        const distance = reach * (.22 + fieldRandom() * .4);
        const center = firstImpact.source.clone()
          .addScaledVector(firstImpact.u, Math.cos(bearing) * ring * distance)
          .addScaledVector(firstImpact.v, Math.sin(bearing) * ring * distance * .9)
          .addScaledVector(firstImpact.drift, z * distance / reach);
        if (!canPlace(center, 12)) continue;
        primary.pockets.push({ center, spread, weight, sizePower, sizeScale }); break;
      }
    }
  }
  const addBoulder = (core, slot, source = null) => {
    const rock = eventAsteroid();
    if (!rock) return;
    let tier, size;
    const pocket = diffuse && !(core && slot === 0) ? pickPocket() : null;
    if (diffuse) {
      // Local size families, not a full size catalogue repeated in every batch.
      size = core && slot === 0 ? 3.5 : core && slot === 2 && sample() < .6 ? random(3.2, 4.6)
        : .45 + 2.35 * Math.pow(sample(), pocket ? pocket.sizePower : 1.7);
      tier = Math.min(3, Math.ceil(size));
    } else {
      // Keep directional fields, including the approved introduction, unchanged.
      tier = source ? 3 : core ? (slot === 1 ? 2 : 3) : sample() < .55 ? 3 : 2;
      size = source ? 2.8 : core && slot === 0 ? 3.5
        : [1.3, 2.8][tier - 2] * random(.85, 1.35);
    }
    rock.userData.asteroidTier = tier;
    rock.scale.setScalar(size);
    rock.userData.health = rock.userData.maxHealth = Math.max(tier, Math.ceil(size));
    const bounds = rock.userData.collisionBox.getBoundingSphere(sphere);
    const radius = (bounds.radius + bounds.center.length()) * rock.scale.x;
    for (let attempt = 0; attempt < 32; attempt++) {
      const point = source ? source.clone() : core && (!diffuse || slot === 0) ? primary.position.clone() : debrisPoint(radius, pocket).position;
      if (core && slot > 0 && !diffuse) point.add(new THREE.Vector3(random(-88, 88), random(-88, 88), random(-120, 120)));
      if (!canPlace(point, radius)) continue;
      rock.position.copy(point).add(showerOrigin);
      rock.rotation.set(random(-Math.PI, Math.PI), random(-Math.PI, Math.PI), random(-Math.PI, Math.PI));
      rock.userData.previousPosition.copy(rock.position);
      primary.rocks.push(rock); occupied.push({ point, radius }); return;
    }
    rock.visible = false;
  };
  addBoulder(true, 0);
  const secondaryCore = fieldImpacts.length > 1;
  if (secondaryCore) addBoulder(false, 0, fieldImpacts[1].source);
  for (let slot = 1; slot < 3; slot++) addBoulder(true, slot);
  const scattered = level === 1 ? 6 : 10 + showerStrength * 4;
  for (let i = secondaryCore ? 1 : 0; i < scattered; i++) addBoulder(false, i);
  // Keep the reduced fragment budget; structure and empty wedges supply the impact's silhouette.
  const fragments = level === 1 ? 140 : 220 + showerStrength * 40;
  const minimumSize = diffuse ? .35 : .7;
  for (let i = 0; i < fragments; i++) {
    const pocket = diffuse ? pickPocket() : null;
    // Fine chips collect together; chunkier pockets and isolated outliers use their own size mix.
    const maximumSize = 26 * (pocket ? pocket.sizeScale : 1);
    const size = minimumSize + (maximumSize - minimumSize) * Math.pow(sample(), pocket ? pocket.sizePower : 2.1);
    const radius = size * 1.7;
    for (let attempt = 0; attempt < 32; attempt++) {
      const debris = debrisPoint(radius, pocket);
      if (!canPlace(debris.position, radius)) continue;
      fieldDebris.push({ ...debris, size });
      occupied.push({ point: debris.position, radius }); break;
    }
  }
  return { groups: [primary], route: fieldRoute, impacts: fieldImpacts, debris: fieldDebris, courseAt };
}
