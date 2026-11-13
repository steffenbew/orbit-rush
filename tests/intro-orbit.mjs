// Run from the project root: node tests/intro-orbit.mjs
import assert from 'node:assert/strict';
import { THREE, source, section, makeGame } from './helpers/flight-game.mjs';

const fleet = makeGame();
const createOrbit = new Function('THREE', 'ships', 'innerWidth', 'innerHeight', 'reducedMotion', `
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, .03, 14000);
  const play = { disabled: false, hovered: false, matches() { return this.hovered; } };
  const document = { hidden: false, querySelector: () => play };
  const hover = { matches: true }, matchMedia = () => hover;
  ${section('      // Decorative only: share the existing rock geometries', '      async function startGame(')}
  return { scene, camera, play, document, hover, rocks: introAsteroids, sizes: introRockSizes,
    phases: introRockPhases, offsets: introRockOffsets, rates: introRockSpeeds, spins: introRockSpins, step: updateIntroOrbit,
    phase: () => orbitPhase, speed: () => orbitSpeed,
    render(started) { ${section('        introAsteroids.visible = !started;', '        updateControlHints();')} } };
`);
const makeOrbit = (width = 1280, height = 720, reducedMotion = false) =>
  createOrbit(THREE, fleet.ships, width, height, reducedMotion);
const dt = 1 / 120;
const advance = (orbit, seconds) => { for (let i = 0; i < Math.round(seconds / dt); i++) orbit.step(dt); };
const orbit = makeOrbit();
assert.equal(orbit.rocks.children.length, 60, 'Use a full asteroid belt, not a few isolated rocks');
assert.equal(orbit.sizes.filter(size => size >= 22 && size <= 32).length, 6, 'Large nearby rocks anchor the belt');
assert.equal(orbit.sizes.filter(size => size >= 7 && size < 20).length, 54, 'Even the smaller fragments are large enough to read beside the ships');
assert.ok(orbit.offsets.every(offset => offset >= .84 && offset <= 1.16), 'A thicker belt scatters rocks around the path');
assert.ok(orbit.phases.every(phase => phase >= 0 && phase < Math.PI * 2), 'Scatter rocks around the full orbit');
assert.ok(orbit.phases.every((phase, index) => phase >= index * Math.PI * 2 / 60 && phase <= (index + .7) * Math.PI * 2 / 60), 'Jitter placement within sectors to avoid empty stretches');
assert.ok(orbit.rates.every(rate => rate >= .9 && rate <= 1.1), 'Individual orbit rates vary subtly, not wildly');
assert.equal(new Set(orbit.rates).size, 60, 'Individual drift rates keep clusters from moving as a rigid group');
assert.ok(orbit.spins.every(spin => Math.abs(spin.x) <= .11 && Math.abs(spin.y) <= .13 && Math.abs(spin.z) <= .08), 'Independent tumbles stay gentle');
assert.equal(new Set(orbit.rocks.children.map(rock => rock.material)).size, 60, 'Each rock can change depth shading independently');
for (const [index, rock] of orbit.rocks.children.entries()) {
  const template = fleet.ships[index % 2 ? 7 : 4];
  assert.equal(rock.geometry, template.children[0].geometry, 'Reuse the existing detailed asteroid geometry');
  assert.notEqual(rock.material, template.userData.hull, 'Never change gameplay materials or shaders');
  assert.equal(rock.material.transparent, false, 'Decorations do not use gameplay arrival fades');
  assert.equal(rock.material.vertexColors, true);
  assert.equal(rock.material.flatShading, true);
  assert.ok(!fleet.ships.includes(rock), 'Decorations never enter the gameplay fleet');
}
const depthPreview = makeOrbit();
const depthRock = depthPreview.rocks.children[0];
depthPreview.phases[0] = -Math.PI / 2;
depthPreview.step(0);
const nearSize = depthRock.scale.x / -depthRock.position.z;
const worldScale = depthRock.scale.x;
const nearColor = depthRock.material.color.clone();
depthPreview.phases[0] = Math.PI / 2;
depthPreview.step(0);
const farSize = depthRock.scale.x / -depthRock.position.z;
assert.ok(nearSize / farSize > 1.05 && nearSize / farSize < 1.12, 'Perspective stays subtle enough to read as one coherent ring');
assert.equal(depthRock.scale.x, worldScale, 'World size stays constant while camera distance changes');
assert.ok(Math.abs(depthRock.material.color.r / nearColor.r - .92) < 1e-8, 'Far-side shading stays subtle without fading transparency');
assert.equal(depthRock.material.opacity, 1);
const coverage = makeOrbit();
for (let sample = 0; sample < 30; sample++) {
  advance(coverage, 20);
  const phases = coverage.phases.map((phase, index) => {
    const drift = .03 * Math.sin(coverage.phase() * coverage.rates[index] + index);
    return (phase + coverage.phase() + drift) % (Math.PI * 2);
  }).sort((a, b) => a - b);
  for (let index = 0; index < phases.length; index++) {
    const next = index + 1 < phases.length ? phases[index + 1] : phases[0] + Math.PI * 2;
    assert.ok(next - phases[index] < .24, 'Coverage remains continuous over time instead of opening large gaps');
  }
}
const initial = orbit.rocks.children[0].position.clone();
const rotation = orbit.rocks.children[0].quaternion.clone();
advance(orbit, 1);
assert.ok(Math.abs(orbit.phase() - Math.PI * 2 / 90) < 1e-8, 'Idle circuit takes 90 seconds');
assert.ok(!orbit.rocks.children[0].position.equals(initial));
assert.ok(!orbit.rocks.children[0].quaternion.equals(rotation), 'Rocks gently tumble');
orbit.play.hovered = true;
const before = orbit.phase(), idleSpeed = orbit.speed();
orbit.step(dt);
assert.ok(orbit.speed() > idleSpeed && orbit.speed() < idleSpeed * 1.05, 'Hover accelerates gently');
assert.ok(orbit.phase() > before && orbit.phase() - before < .001, 'Hover preserves orbit position');
advance(orbit, 4);
assert.ok(Math.abs(orbit.speed() - Math.PI * 2 / 45) < .0001, 'Hover only doubles the slow drift');
orbit.play.hovered = false;
advance(orbit, 5);
assert.ok(Math.abs(orbit.speed() - idleSpeed) < .0001, 'Leaving hover slows down smoothly');
for (const [width, height] of [[1280, 720], [1920, 1080], [390, 844], [600, 800]]) {
  const preview = makeOrbit(width, height);
  const radius = Math.min(width * .98, height * 1.2, 1040);
  const tilt = -24 * Math.PI / 180;
  for (let second = 0; second < 90; second++) {
    advance(preview, 1);
    for (const rock of preview.rocks.children) {
      const screen = rock.position.clone().project(preview.camera);
      const x = screen.x * width / 2, y = -screen.y * height / 2;
      const localX = x * Math.cos(tilt) + y * Math.sin(tilt);
      const localY = -x * Math.sin(tilt) + y * Math.cos(tilt);
      const ellipse = (localX / (radius * 350 / 800)) ** 2 + (localY / (radius * 175 / 800)) ** 2;
      assert.ok(ellipse >= .84 ** 2 - 1e-8 && ellipse <= 1.16 ** 2 + 1e-8, 'Stay within the wider tilted elliptical belt');
      assert.ok(Math.abs(screen.x) < 1 && Math.abs(screen.y) < 1, 'Stay framed on desktop and mobile');
    }
  }
}
for (const state of ['disabled', 'touch']) {
  const idle = makeOrbit();
  idle.play.hovered = true;
  if (state === 'disabled') idle.play.disabled = true;
  else idle.hover.matches = false;
  advance(idle, 2);
  assert.equal(idle.speed(), idleSpeed, `${state} cannot trigger hover acceleration`);
}
for (const state of ['reduced', 'hidden']) {
  const frozen = makeOrbit(390, 844, state === 'reduced');
  frozen.document.hidden = state === 'hidden';
  frozen.play.hovered = true;
  const positions = frozen.rocks.children.map(rock => rock.position.clone());
  const rotations = frozen.rocks.children.map(rock => rock.quaternion.clone());
  advance(frozen, 2);
  assert.equal(frozen.phase(), 0, `${state} freezes orbital motion`);
  frozen.rocks.children.forEach((rock, index) => {
    assert.ok(rock.position.equals(positions[index]));
    assert.ok(rock.quaternion.equals(rotations[index]));
    assert.ok(rock.position.length() > 0, 'Static asteroids are still positioned correctly');
  });
}
orbit.render(true);
assert.equal(orbit.rocks.visible, false, 'Hide decorative rocks during gameplay');
orbit.render(false);
assert.equal(orbit.rocks.visible, true);
assert.ok(!source.includes('intro-orbit-path') && !source.includes('orbit-trail'), 'Remove the visible track and green highlight');
assert.match(source, /updateIntroShips\(introTime\);\s*updateIntroOrbit\(dt\);/, 'Reuse the existing intro loop');
console.log('PASS dense asteroid belt, perspective depth/shading, independent drift/tumbling, geometry reuse, responsive paths and motion guards');
