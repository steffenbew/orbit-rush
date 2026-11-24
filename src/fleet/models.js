import * as THREE from '../../assets/vendor/three.module.js';

export const shipTypes = [
  { name: 'INTERCEPTOR', scale: 1.6, radius: 13, health: 3, points: 400, color: 0x8ea9c7, glow: 0x49dfff },
  { name: 'NOVA SAUCER', scale: 3.4, radius: 15.5, health: 4, points: 600, color: 0x9877bd, glow: 0xcb7dff },
  { name: 'TITAN CARRIER', scale: 5, radius: 18, health: 5, points: 900, color: 0x5b7880, glow: 0xffb35b },
  { name: 'ASTEROID', asteroid: true, scale: 3.2, radius: 16.5, health: 1, points: 100, color: 0xb6ada0, glow: 0x000000 },
  { name: 'LEVIATHAN DREADNOUGHT', capital: true, scale: 6, radius: 85, health: 60, points: 10000, color: 0x83909e, glow: 0xff4455 }
];

// Reuse materials and geometry across the fleet. Models have no scene or flight state.
export function createShipModels(glow, { distanceFade = true } = {}) {
  // Three original silhouettes: swept interceptor, luminous saucer, armored carrier.
  const dark = new THREE.MeshStandardMaterial({ color: 0x131c30, metalness: .65, roughness: .45 });
  const silver = new THREE.MeshStandardMaterial({ color: 0x8795a8, metalness: .7, roughness: .3 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x63dfff, emissive: 0x167da0, emissiveIntensity: 1.2, metalness: .6, roughness: .12 });
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const sphere = new THREE.SphereGeometry(1, 24, 16);
  const canopyGlass = new THREE.MeshStandardMaterial({ color: 0x18778b, emissive: 0x04242b, metalness: .25, roughness: .2 });
  const canopyGeometry = sphere.clone();
  canopyGeometry.rotateX(Math.PI / 2);
  const canopyVertices = canopyGeometry.getAttribute('position');
  for (let i = 0; i < canopyVertices.count; i++) {
    const z = canopyVertices.getZ(i);
    // Narrow the forward tip and follow the rising deck toward the shoulders.
    canopyVertices.setXYZ(i, canopyVertices.getX(i) * (1 + .6 * z), canopyVertices.getY(i) + .6 * z, z);
  }
  canopyGeometry.computeVertexNormals();
  const engineGeometry = new THREE.CylinderGeometry(1, 1.2, 1, 12);
  const enginePlumeGeometry = new THREE.PlaneGeometry(1, 1);
  enginePlumeGeometry.translate(0, .5, 0);
  enginePlumeGeometry.rotateX(Math.PI / 2);
  const noseGeometry = new THREE.ConeGeometry(1, 1, 6);
  const domeGlass = new THREE.MeshStandardMaterial({ color: 0x23508a, emissive: 0x060f23, metalness: .25, roughness: .16 });
  const saucerGeometry = new THREE.CylinderGeometry(7, 14.5, 2.4, 40);
  const rimGeometry = new THREE.TorusGeometry(saucerGeometry.parameters.radiusBottom, .28, 6, saucerGeometry.parameters.radialSegments);
  // One blunt armored profile, full size for the carrier and compressed for its aft pods.
  const carrierOutline = new THREE.Shape();
  carrierOutline.moveTo(-3.2, -19); carrierOutline.lineTo(3.2, -19);
  carrierOutline.lineTo(6.6, -10); carrierOutline.lineTo(6.6, 13);
  carrierOutline.lineTo(-6.6, 13); carrierOutline.lineTo(-6.6, -10); carrierOutline.closePath();
  const carrierArmor = new THREE.ExtrudeGeometry(carrierOutline, {
    depth: 4.6, bevelEnabled: true, bevelSize: .7, bevelThickness: .7, bevelSegments: 1, steps: 1
  });
  carrierArmor.translate(0, 0, -2.3);
  carrierArmor.rotateX(Math.PI / 2);
  // A wide command bridge with a narrower roof and a raked forward window.
  const carrierGlass = new THREE.MeshStandardMaterial({ color: 0x466784, emissive: 0x091421, metalness: .25, roughness: .16 });
  const carrierBridge = new THREE.BoxGeometry(9.6, 4, 8);
  const bridgeVertices = carrierBridge.getAttribute('position');
  for (let i = 0; i < bridgeVertices.count; i++) {
    if (bridgeVertices.getY(i) < 0) continue;
    bridgeVertices.setX(i, bridgeVertices.getX(i) * .75);
    bridgeVertices.setZ(i, bridgeVertices.getZ(i) < 0 ? -2 : 3);
  }
  carrierBridge.computeVertexNormals();
  const sweptShape = new THREE.Shape();
  sweptShape.moveTo(2, -11); sweptShape.lineTo(12, 10);
  sweptShape.lineTo(4, 6); sweptShape.lineTo(2, 3); sweptShape.closePath();
  const sweptGeometry = new THREE.ExtrudeGeometry(sweptShape, { depth: .6, bevelEnabled: true, bevelSize: .2, bevelThickness: .15, bevelSegments: 1, steps: 1 });
  sweptGeometry.rotateX(Math.PI / 2);
  // Fin side profile: aft along the first axis, height above the casing along the second.
  const finProfile = new THREE.Shape();
  finProfile.moveTo(-3, 0); finProfile.lineTo(1.15, 3.7);
  finProfile.lineTo(2.45, 3.7); finProfile.lineTo(1.6, 0); finProfile.closePath();
  const finGeometry = new THREE.ExtrudeGeometry(finProfile, { depth: .42, bevelEnabled: false });
  finGeometry.translate(0, 0, -.21);
  finGeometry.rotateY(-Math.PI / 2);
  function fadeAsteroidShader(shader) {
    if (!distanceFade) return;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      // Fog alone still draws an opaque dark silhouette over the stars.
      diffuseColor.a *= 1.0 - smoothstep(2600.0, 3600.0, length(vViewPosition));
      if (diffuseColor.a < 0.003) discard;
    `);
  }
  function fadeShipShader(shader) {
    if (!distanceFade) return;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      diffuseColor.a *= 1.0 - smoothstep(2600.0, 3600.0, length(vViewPosition));
    `);
  }
  function asteroidShader(shader) {
    fadeAsteroidShader(shader);
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      // Soft surface fill and grazing light, not an outline or an opacity change.
      float rockProximity = 1.0 - smoothstep(450.0, 1600.0, length(vViewPosition));
      float rockEdge = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.0);
      totalEmissiveRadiance += vec3(0.7, 0.8, 1.0) * (0.025 + 0.2 * rockEdge) * rockProximity;
    `);
  }
  function meshPart(ship, geometry, material, position, scale) {
    const part = new THREE.Mesh(geometry, material);
    part.position.set(...position);
    part.scale.set(...scale);
    ship.add(part);
    return part;
  }
  function engine(ship, x, y, z, radius, accent, haloScale) {
    const casing = meshPart(ship, engineGeometry, dark, [x, y, z], [radius, 4, radius]);
    casing.rotation.x = Math.PI / 2;
    // Engine cores have their own material: boosting must not brighten wing trim.
    const core = meshPart(ship, sphere, accent.clone(), [x, y, z + 2.2], [radius * .75, radius * .75, .3]);
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: accent.color, depthWrite: false, blending: THREE.AdditiveBlending }));
    flame.position.copy(core.position);
    flame.position.z += 1;
    const plume = new THREE.Group();
    plume.position.copy(core.position);
    const plumeMaterial = new THREE.MeshBasicMaterial({ map: glow, color: accent.color,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    for (let i = 0; i < 2; i++) {
      const ribbon = new THREE.Mesh(enginePlumeGeometry, plumeMaterial);
      ribbon.rotation.z = i * Math.PI / 2;
      ribbon.userData.engineExhaust = true;
      plume.add(ribbon);
    }
    flame.userData = { core, plume, radius, baseSize: radius * haloScale };
    ship.add(flame, plume);
    ship.userData.flames.push(flame);
  }

  function buildInterceptor(ship, hull, accent) {
    const nose = meshPart(ship, noseGeometry, hull, [0, 0, -6], [2.6, 22, 2.2]);
    nose.rotation.x = -Math.PI / 2;
    meshPart(ship, unitBox, hull, [0, 0, 4], [4, 2.6, 9]);
    for (const sign of [-1, 1]) {
      const wing = new THREE.Mesh(sweptGeometry, hull);
      wing.scale.x = sign;
      ship.add(wing);
      meshPart(ship, unitBox, accent, [sign * 8.5, .24, 7], [3, .22, .6]);
      const fin = meshPart(ship, finGeometry, dark, [sign * 3, .55, 7.9], [1, 1, 1]);
      fin.rotation.z = sign * -.3;
      engine(ship, sign * 3, 0, 8, 1.25, accent, 4.2);
    }
    meshPart(ship, canopyGeometry, canopyGlass, [0, 1.15, -4], [1.15, 1, 4.8]);
  }
  function buildSaucer(ship, hull, accent) {
    meshPart(ship, saucerGeometry, hull, [0, 0, 0], [1, 1, 1]);
    const underside = meshPart(ship, saucerGeometry, dark, [0, -1.5, 0], [.95, .4, .95]);
    underside.rotation.z = Math.PI;
    meshPart(ship, sphere, domeGlass, [0, 1.8, 0], [5, 1.8, 5]);
    const rim = new THREE.Mesh(rimGeometry, accent);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = -saucerGeometry.parameters.height / 2;
    ship.add(rim);
    const { height, radiusTop, radiusBottom } = saucerGeometry.parameters;
    const lightRadius = 11.5;
    const deckSlope = height / (radiusBottom - radiusTop);
    const deckY = height / 2 - (lightRadius - radiusTop) * deckSlope;
    for (let j = 0; j < 12; j++) {
      const angle = j / 12 * Math.PI * 2;
      const light = meshPart(ship, unitBox, accent,
        [Math.cos(angle) * lightRadius, deckY, Math.sin(angle) * lightRadius], [.8, .1, .8]);
      light.rotation.set(0, -angle, -Math.atan(deckSlope));
    }
    for (const x of [-5, 5]) engine(ship, x, -1.8, 6, 1.3, accent, 4.5);
  }

  function buildCarrier(ship, hull, accent) {
    meshPart(ship, carrierArmor, hull, [0, 0, 0], [1, 1, 1]);
    // Inset the flight deck into the hull, following the bow's clipped corners.
    meshPart(ship, carrierArmor, dark, [0, 3, -3.2], [.64, .035, .65]);
    meshPart(ship, carrierBridge, hull, [0, 4.95, 6], [1, 1, 1]);
    const viewport = meshPart(ship, unitBox, carrierGlass, [0, 5.95, 3.5], [6.8, 1, .16]);
    viewport.rotation.x = Math.atan(2 / 4);
    for (const sign of [-1, 1]) {
      meshPart(ship, unitBox, dark, [sign * 9, 0, 2], [12, 2.5, 5]);
      meshPart(ship, carrierArmor, hull, [sign * 13, 0, 6.6], [.44, .9, .54]);
      meshPart(ship, unitBox, accent, [sign * 13, 2.72, 5], [1, .15, 14]);
      engine(ship, sign * 13, 0, 15, 2.4, accent, 4.8);
    }
    engine(ship, 0, 0, 15, 2.3, accent, 4.8);
  }

  function buildDreadnought(ship, hull) {
    // Long triangular prow points away; the player approaches the armed stern.
    const outline = new THREE.Shape();
    outline.moveTo(0, -80); outline.lineTo(56, 48); outline.lineTo(-56, 48); outline.closePath();
    const wedge = new THREE.ExtrudeGeometry(outline, { depth: 7, bevelEnabled: true, bevelSize: 2, bevelThickness: 2, bevelSegments: 1, steps: 1 });
    wedge.rotateX(Math.PI / 2);
    wedge.translate(0, 3, 0);
    const wedgeVertices = wedge.getAttribute('position');
    for (let vertex = 0; vertex < wedgeVertices.count; vertex++) {
      const taper = .15 + .85 * THREE.MathUtils.clamp((wedgeVertices.getZ(vertex) + 83) / 133, 0, 1);
      wedgeVertices.setY(vertex, wedgeVertices.getY(vertex) * taper);
    }
    wedge.computeVertexNormals();
    meshPart(ship, wedge, hull, [0, 0, 0], [1, 1, 1]);
    meshPart(ship, wedge, dark, [0, -1, 0], [1.008, .16, 1.008]);
    // Deck foundations extend into the layer below instead of floating above it.
    const deckWedge = wedge.clone();
    const deckVertices = deckWedge.getAttribute('position');
    for (let vertex = 0; vertex < deckVertices.count; vertex++) {
      if (deckVertices.getY(vertex) < 0) deckVertices.setY(vertex, -12);
    }
    deckWedge.computeVertexNormals();
    meshPart(ship, deckWedge, hull, [0, 8, 12], [.7, .65, .65]);
    meshPart(ship, deckWedge, hull, [0, 14, 24], [.43, .55, .38]);
    // Narrow tower and broad command bridge make the rear silhouette recognizable.
    const tower = new THREE.BoxGeometry(14, 16, 13);
    const towerVertices = tower.getAttribute('position');
    for (let vertex = 0; vertex < towerVertices.count; vertex++) {
      if (towerVertices.getY(vertex) <= 0) continue;
      towerVertices.setX(vertex, towerVertices.getX(vertex) * .65);
      towerVertices.setZ(vertex, towerVertices.getZ(vertex) * .75);
    }
    tower.computeVertexNormals();
    meshPart(ship, tower, hull, [0, 23, 28], [1, 1, 1]);
    meshPart(ship, unitBox, dark, [0, 31, 28], [36, 1.5, 11]);
    meshPart(ship, unitBox, hull, [0, 33, 28], [34, 4, 10]);
    meshPart(ship, unitBox, glass, [0, 33, 33.2], [29, 1, .4]);
    for (const sign of [-1, 1]) {
      meshPart(ship, unitBox, dark, [sign * 11, 36, 28], [3, 2, 3]);
      meshPart(ship, sphere, silver, [sign * 11, 39, 28], [2.8, 2.8, 2.8]);
      for (let j = 0; j < 7; j++) {
        const z = -58 + j * 15;
        const x = sign * (z + 80) * .35;
        const y = 5 * (.15 + .85 * (z + 83) / 133);
        const plate = meshPart(ship, unitBox, silver, [x, y + .3, z], [3.5, .6, 8]);
        plate.rotation.y = sign * .4;
        meshPart(ship, unitBox, dark, [x - sign * 3, y + .4, z + 2], [1, .6, 4]);
      }
      for (let j = 0; j < 5; j++) {
        const z = 4 + j * 7;
        const x = sign * (8 + j * 2.6);
        const deckTop = deckZ => 8 + .65 * 5 * (.15 + .85 * ((deckZ - 12) / .65 + 83) / 133);
        meshPart(ship, unitBox, silver, [x, deckTop(z) + .75, z], [3.5, 1.5, 4]);
        meshPart(ship, unitBox, dark, [sign * (22 + j * 2.5), deckTop(19 + j * 5) + .75, 19 + j * 5], [2, 1.5, 3]);
      }
      for (let j = 0; j < 7; j++) {
        meshPart(ship, unitBox, silver, [sign * (5 + j * 6), -1, 50.1], [2.5, 2, .6]);
      }
    }
    ship.userData.muzzles = [];
    const muzzleMaterial = new THREE.SpriteMaterial({ map: glow, color: 0xff5544, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const sign of [-1, 1]) {
      // Rear turrets sit above the engine bank and fire backward, toward the player.
      meshPart(ship, unitBox, dark, [sign * 29, 9, 40], [12, 7, 12]);
      meshPart(ship, unitBox, hull, [sign * 29, 13, 41], [10, 5, 10]);
      for (const side of [-1, 1]) {
        const barrel = meshPart(ship, engineGeometry, silver, [sign * 29 + side * 2.4, 13, 51], [.8, 16, .8]);
        barrel.rotation.x = Math.PI / 2;
      }
      const muzzle = new THREE.Sprite(muzzleMaterial);
      muzzle.position.set(sign * 29, 13, 60);
      ship.add(muzzle);
      ship.userData.muzzles.push(muzzle);
    }
    // Recessed engine bank: three primary drives and four smaller auxiliaries.
    meshPart(ship, unitBox, dark, [0, -1, 49], [85, 18, 3]);
    const engineAccent = new THREE.MeshStandardMaterial({ color: 0x79cfff, emissive: 0x258bff, emissiveIntensity: 2.4 });
    const engineRim = new THREE.TorusGeometry(1, .14, 8, 24);
    const drives = [[-27, -1, 5.5], [0, -1, 6.5], [27, -1, 5.5], [-13, -6, 2.2], [13, -6, 2.2], [-13, 5, 2.2], [13, 5, 2.2]];
    for (const [x, y, radius] of drives) {
      engine(ship, x, y, 51, radius, engineAccent, 3.8);
      meshPart(ship, engineRim, silver, [x, y, 53.5], [radius, radius, radius * .5]);
    }
  }

  function buildAsteroid(ship, hull, i) {
    const rock = new THREE.IcosahedronGeometry(1, 3);
    const vertices = rock.getAttribute('position');
    const shades = new Float32Array(vertices.count * 3);
    const normal = new THREE.Vector3(), shade = new THREE.Color();
    const craters = [[.2, .6, 1], [-.8, .3, .4], [.6, -.4, -.8], [-.4, -.9, -.2]]
      .map(point => new THREE.Vector3(...point).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), i * .6));
    for (let vertex = 0; vertex < vertices.count; vertex++) {
      normal.fromBufferAttribute(vertices, vertex).normalize();
      const noise = .18 * Math.sin(normal.x * 4 + i) * Math.cos(normal.y * 3 - normal.z * 2)
        + .05 * Math.sin(normal.z * 7 + normal.y * 5 + i)
        + .025 * Math.sin(normal.x * 23 + normal.y * 7) * Math.cos(normal.z * 19);
      let dent = 0, rim = 0;
      for (const center of craters) {
        const angle = Math.acos(THREE.MathUtils.clamp(normal.dot(center), -1, 1));
        dent += .18 * Math.exp(-Math.pow(angle / .25, 4));
        rim += .045 * Math.exp(-Math.pow((angle - .29) / .055, 2));
      }
      const radius = 11 * (1 + noise - dent + rim);
      vertices.setXYZ(vertex, normal.x * radius * (i % 2 ? .85 : 1.25),
        normal.y * radius * (i % 2 ? .85 : .6), normal.z * radius * (i % 2 ? 1.25 : 1));
      shade.setHSL(.08, .08, .65 + noise * .5 - dent * .9);
      shade.toArray(shades, vertex * 3);
    }
    rock.setAttribute('color', new THREE.BufferAttribute(shades, 3));
    rock.computeVertexNormals();
    hull.metalness = .04; hull.roughness = 1; hull.flatShading = true; hull.vertexColors = true;
    hull.transparent = true;
    hull.onBeforeCompile = asteroidShader;
    ship.add(new THREE.Mesh(rock, hull));
    ship.userData.spin = new THREE.Vector3();
  }

  function createModel(i, typeIndex, template) {
    const type = shipTypes[typeIndex];
    const ship = new THREE.Group();
    // Reuse the two detailed rock meshes for dense asteroid showers.
    if (template) {
      const hull = template.userData.hull.clone();
      // Material.clone() does not copy shader hooks.
      hull.onBeforeCompile = asteroidShader;
      ship.add(new THREE.Mesh(template.children[0].geometry, hull));
      ship.userData = { hull, type, slot: i, flames: [], spawn: 0,
        spin: new THREE.Vector3(), collisionBox: template.userData.collisionBox,
        collisionParts: template.userData.collisionParts };
      return ship;
    }
    const hull = new THREE.MeshStandardMaterial({ color: type.color, metalness: .65, roughness: .32 });
    const accent = new THREE.MeshStandardMaterial({ color: type.glow, emissive: type.glow, emissiveIntensity: 2.4 });
    ship.userData = { hull, type, slot: i, flames: [], spawn: 0 };
    if (typeIndex === 0) buildInterceptor(ship, hull, accent);
    else if (typeIndex === 1) buildSaucer(ship, hull, accent);
    else if (typeIndex === 2) buildCarrier(ship, hull, accent);
    else if (type.capital) buildDreadnought(ship, hull);
    else buildAsteroid(ship, hull, i);
    if (type.capital) {
      const materials = new Map();
      ship.traverse(part => {
        if (!part.material) return;
        const source = part.material;
        if (!materials.has(source)) materials.set(source, source.clone());
        part.material = materials.get(source);
        if (part.isMesh && !part.userData.engineExhaust) part.material.alphaHash = true;
      });
      ship.userData.hull = materials.get(hull);
      ship.userData.flashMaterials = [...materials.values()].map(material => ({ material,
        color: material.color.clone(), emissive: material.emissive?.clone(), intensity: material.emissiveIntensity }));
    }
    if (!type.asteroid && !type.capital) {
      // Hash the distance fade instead of sorting transparent hull panels. Keep
      // shared asteroid/capital materials untouched; every visible ship part fades.
      const materials = new Map();
      ship.traverse(part => {
        if (!part.isMesh || part.userData.engineExhaust) return;
        const source = part.material;
        if (!materials.has(source)) {
          const material = source.clone();
          material.alphaHash = true;
          material.onBeforeCompile = fadeShipShader;
          materials.set(source, material);
        }
        part.material = materials.get(source);
      });
      ship.userData.hull = materials.get(hull);
    }
    // Local hull bounds exclude engine glows and exhaust: light is not an obstacle.
    ship.updateMatrixWorld(true);
    const hullBounds = new THREE.Box3();
    const collisionParts = [];
    ship.traverse(part => {
      if (!part.isMesh || part.userData.engineExhaust) return;
      const geometry = part.geometry;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      const bounds = geometry.boundingBox.clone().applyMatrix4(part.matrixWorld);
      hullBounds.union(bounds);
      const vertices = geometry.attributes.position;
      const index = geometry.index;
      const triangles = [];
      for (let i = 0; i < (index ? index.count : vertices.count); i += 3) {
        const points = [0, 1, 2].map(offset => new THREE.Vector3()
          .fromBufferAttribute(vertices, index ? index.getX(i + offset) : i + offset)
          .applyMatrix4(part.matrixWorld));
        triangles.push(new THREE.Triangle(...points));
      }
      collisionParts.push({ bounds, triangles });
    });
    ship.userData.collisionBox = hullBounds;
    ship.userData.collisionParts = collisionParts;
    ship.scale.setScalar(type.scale);
    return ship;
  }

  function createPlayerModel() {
    const playerShip = new THREE.Group();
    playerShip.userData = { type: shipTypes[0], flames: [], engineThrust: .4, hitFlash: 0 };
    buildInterceptor(playerShip, silver, new THREE.MeshStandardMaterial({ color: 0x7effd5, emissive: 0x24dba1 }));
    playerShip.scale.setScalar(shipTypes[0].scale);
    playerShip.visible = false;
    return playerShip;
  }

  return { createModel, createPlayerModel, fadeAsteroidShader };
}
