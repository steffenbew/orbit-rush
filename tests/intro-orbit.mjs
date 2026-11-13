// Run from the project root: node tests/intro-orbit.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = source.indexOf("      const introOrbit = document.querySelector('.intro-orbit');");
const end = source.indexOf('      async function startGame(', start);
assert.ok(start >= 0 && end > start);
function makeOrbit(reducedMotion = false) {
  const stroke = { attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } };
  const play = { disabled: false, hovered: false, matches() { return this.hovered; } };
  const document = { hidden: false, querySelector: selector => selector === '#start' ? play : { querySelector: () => stroke } };
  const hover = { matches: true };
  const orbit = new Function('document', 'matchMedia', 'reducedMotion', `
    ${source.slice(start, end)}
    return { step: updateIntroOrbit, phase: () => orbitPhase, tail: () => orbitTail, speed: () => orbitSpeed };
  `)(document, () => hover, reducedMotion);
  return { ...orbit, document, play, stroke, hover };
}
const dt = 1 / 120;
const advance = (orbit, seconds) => { for (let i = 0; i < Math.round(seconds / dt); i++) orbit.step(dt); };
const length = orbit => orbit.tail() - orbit.phase();
const orbit = makeOrbit();
const speeds = [];
for (let second = 0; second < 10; second++) {
  advance(orbit, 1);
  speeds.push(orbit.speed());
}
assert.ok(Math.max(...speeds) - Math.min(...speeds) > .5, 'Idle light gently surges instead of moving linearly');
const idleLength = length(orbit);
orbit.play.hovered = true;
const before = orbit.phase(), speed = orbit.speed(), tail = orbit.tail();
orbit.step(dt);
assert.ok(orbit.speed() > speed && orbit.speed() < speed + .4, 'Hover accelerates without snapping');
assert.ok(orbit.phase() < before && before - orbit.phase() < .03, 'Hover preserves the leading edge position');
advance(orbit, 2);
assert.ok(orbit.speed() > 6, 'Hover moves the light much faster');
assert.ok(length(orbit) > idleLength + 3, 'The trailing edge lags and stretches behind the faster front');
assert.ok(orbit.tail() < tail, 'The tail continues forward while lagging behind');
const hoverSpeed = orbit.speed();
orbit.play.hovered = false;
orbit.step(dt);
assert.ok(orbit.speed() < hoverSpeed && orbit.speed() > hoverSpeed - .4, 'Leaving hover slows down gently');
advance(orbit, 15);
assert.ok(length(orbit) < idleLength + 1, 'The tail catches up as the light settles');
orbit.play.hovered = true;
advance(orbit, 60);
assert.ok(orbit.phase() < -100, 'Keep the front position unwrapped across laps');
assert.ok(length(orbit) > 56 && length(orbit) < 80, 'The long trailing edge stays nearby across multiple laps');
const [dash, gap] = orbit.stroke.attributes['stroke-dasharray'].split(' ').map(Number);
assert.ok(dash > 56 && gap > 0);
assert.ok(Math.abs(dash + gap - 100) < 1e-8, 'The highlight repeats exactly once per ellipse');
assert.ok(Number.isFinite(Number(orbit.stroke.attributes['stroke-dashoffset'])));
assert.match(source, /\.intro-orbit \{[^}]*rotate\(-24deg\)/, 'The ellipse keeps its fixed orientation');
assert.ok(!source.includes('--orbit-angle'), 'Do not animate the ellipse rotation');
for (const state of ['disabled', 'touch']) {
  const idle = makeOrbit(), reference = makeOrbit();
  idle.play.hovered = true;
  if (state === 'disabled') idle.play.disabled = true;
  else idle.hover.matches = false;
  advance(idle, 2); advance(reference, 2);
  assert.equal(idle.speed(), reference.speed(), `${state} cannot trigger hover acceleration`);
}
for (const state of ['reduced', 'hidden']) {
  const frozen = makeOrbit(state === 'reduced');
  frozen.document.hidden = state === 'hidden';
  frozen.play.hovered = true;
  advance(frozen, 2);
  assert.equal(frozen.phase(), 12, `${state} freezes light motion`);
  assert.equal(frozen.tail(), 68);
  assert.deepEqual(frozen.stroke.attributes, {});
}
assert.ok(source.includes('<use class="orbit-trail" href="#intro-orbit-path" stroke-dasharray="56 44"'), 'Use one long, smooth stroke instead of segmented pieces');
assert.equal((source.match(/class="orbit-trail"/g) || []).length, 1);
assert.match(source, /\.orbit-trail \{ stroke: #7effd5;/, 'The beam remains green');
assert.ok(!source.includes('brightness(1.7)'), 'Glow must not bleach the beam white');
assert.match(source, /updateIntroShips\(introTime\);\s*updateIntroOrbit\(dt\);/, 'Use the existing intro simulation loop');
assert.match(source, /#intro:has\(#start:hover:not\(:disabled\)\) \.intro-orbit \{ filter: drop-shadow\(0 0 6px #39ff9caa\) drop-shadow\(0 0 20px #39ff9c77\)/, 'Enabled Play hover adds a green laser glow');
console.log('PASS fixed orbit with a long smooth green beam, lagging tail, glowing faster hover and motion guards');
