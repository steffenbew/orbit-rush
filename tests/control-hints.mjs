// Run from the project root: node tests/control-hints.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { t, setLanguage } from '../i18n.js';
setLanguage('de');

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const section = (start, end) => {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from);
  return source.slice(from, to);
};
class Element {
  hidden = true;
  textContent = '';
  offsetWidth = 220;
  offsetHeight = 64;
  style = {};
  attributes = {};
  setAttribute(name, value) { this.attributes[name] = value; }
  classes = new Set();
  classList = {
    add: name => this.classes.add(name),
    remove: name => this.classes.delete(name),
    toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name)
  };
}
const elements = new Map(['control-hints', 'control-hints-title', 'control-input-label']
  .map(id => ['#' + id, new Element()]));
const document = { querySelector: selector => elements.get(selector) };
const hints = elements.get('#control-hints');
const title = elements.get('#control-hints-title'), input = elements.get('#control-input-label');
const game = new Function('document', 't', `
  let started = false, paused = false, crashing = false, roundEnded = false, level = 1, now = 0;
  const performance = {now: () => now};
  const mouseAim = {x: 0, y: 0}, innerWidth = 1000, innerHeight = 800;
  ${section('      const controlHints =', '      function fireRocket(')}
  let gameTime = 0, heavyEnergy = 1, overheated = false, lastShot = -Infinity;
  let lastEmptyAttempt = -Infinity, emptyFlashUntil = 0, shotFlashUntil = 0, weaponHeat = 0, lastHeatShot = 0;
  const heatPerShot = 10;
  const updateHeavyHud = () => {}, updateWeaponHud = () => {}, playSound = () => {};
  ${section('      function fireRocket(', '        camera.updateMatrixWorld();')}
  }
  return {
    markControlUsed, updateControlHints, fireRocket,
    step: () => controlStep,
    aim: (x, y) => { mouseAim.x = x; mouseAim.y = y; },
    mode: name => {
      started = name !== 'intro'; paused = name === 'pause'; crashing = name === 'crash';
      roundEnded = name === 'result'; level = name === 'later-level' ? 2 : 1;
    },
    time: value => { now = value; gameTime = value / 1000; },
    weapons: (heat, energy) => { overheated = heat; heavyEnergy = energy; }
  };
`)(document, t);

for (const mode of ['intro', 'pause', 'crash', 'result', 'later-level']) {
  game.mode(mode); game.updateControlHints();
  assert.equal(hints.hidden, true, `Hide during ${mode}`);
  game.markControlUsed('laser');
  assert.equal(hints.classes.has('complete'), false, `Ignore actions during ${mode}`);
}
game.mode('flight'); game.updateControlHints();
assert.equal(hints.hidden, false);
assert.equal(title.textContent, 'LASER FEUERN');
assert.equal(input.textContent, 'LINKSKLICK');
assert.equal(hints.style.left, '500px');
assert.equal(hints.style.top, '464px', 'Follow 64px below the cursor, clear of its weapon charge bar');
game.aim(.4, .25); game.updateControlHints();
assert.equal(hints.style.left, '700px'); assert.equal(hints.style.top, '364px');
game.aim(1, -1); game.updateControlHints();
assert.equal(hints.style.left, '878px', 'Keep the hint inside the right edge');
assert.equal(hints.style.top, '672px', 'Flip above the cursor at the bottom edge');
game.aim(-1, 1); game.updateControlHints();
assert.equal(hints.style.left, '122px'); assert.equal(hints.style.top, '64px');
game.aim(0, 0);
game.markControlUsed('move');
assert.equal(hints.classes.has('complete'), false, 'Mouse movement is not a tutorial step');
assert.equal(hints.classes.has('space-key'), false);
assert.equal(hints.classes.has('complete'), false);
game.weapons(true, 1);
game.fireRocket(true); game.fireRocket(true, true);
assert.equal(hints.classes.has('complete'), false, 'Overheated or wrong weapon does not complete the normal laser step');
game.weapons(false, 1); game.fireRocket(true);
assert.equal(hints.classes.has('complete'), true, 'A successful normal shot completes the first step immediately');
game.time(200); game.markControlUsed('laser');
game.time(699); game.updateControlHints();
assert.equal(game.step(), 0, 'Keep brief success feedback before advancing');
game.mode('pause'); game.time(3000); game.updateControlHints();
assert.equal(hints.hidden, true);
assert.equal(game.step(), 0, 'No tutorial advancement behind the pause menu');
game.mode('flight'); game.updateControlHints();
assert.equal(hints.hidden, false);
assert.equal(game.step(), 1);
game.fireRocket(true);
assert.equal(hints.classes.has('complete'), false, 'Normal shots must not complete the power-laser step');
assert.equal(title.textContent, 'POWER-LASER · 3× SCHADEN');
assert.equal(input.textContent, 'LEERTASTE');
assert.equal(hints.classes.has('space-key'), true, 'Render the heavy-laser instruction as a wide spacebar keycap');
game.weapons(false, 0); game.fireRocket(true, true);
assert.equal(hints.classes.has('complete'), false, 'Empty heavy laser does not complete the tutorial');
game.weapons(false, 1); game.fireRocket(true, true);
assert.equal(hints.classes.has('complete'), true);
game.time(4399); game.updateControlHints();
assert.equal(hints.classes.has('finished'), false);
game.time(4400); game.updateControlHints();
assert.equal(hints.classes.has('finished'), true);
assert.equal(hints.hidden, false, 'Fade before removing the final step');
game.time(5200); game.updateControlHints();
assert.equal(hints.hidden, true);
game.mode('later-level'); game.mode('flight'); game.updateControlHints();
assert.equal(hints.hidden, true, 'Completed tutorial stays dismissed on retries and new runs in this page');
assert.equal(game.step(), 2, 'Only click and power laser remain');
assert.ok(!source.includes('DAUERFEUER'), 'Do not show a separate held-fire instruction');
console.log('PASS click → power laser tutorial, real shots, accurate titles, feedback and one-time fade');
console.log('PASS no skipped steps, no repeated-input delay, hidden during pause/crash/results and no advancement behind pause');

const movement = section('      // HUD controls sit above the canvas', '      function stop(event)');
assert.ok(!movement.includes('markControlUsed'), 'Steering must not affect tutorial progress');
assert.ok(source.includes('damage: heavy ? 3 : 1'), 'The 3× damage title must match actual projectile damage');
const markup = section('  <aside id="control-hints"', '  <div id="flight-state"');
assert.ok(markup.includes('role="status"') && markup.includes('aria-atomic="true"'));
assert.ok(!markup.includes('<ol') && !markup.includes('<p'), 'Show only a compact title and control');
assert.ok(!source.includes('pause-controls'), 'Keep the pause menu free of tutorial instructions');
assert.ok(!source.includes('control-check') && !markup.includes('✓'), 'Remove all tutorial checkmark markup, styles and logic');
assert.ok(markup.includes('id="control-mouse" class="icon" aria-hidden="true"') && markup.includes('href="#i-mouse-left"'),
  'Use the existing inline SVG icon style without duplicating the accessible text');
assert.ok(source.includes('<symbol id="i-mouse-left" data-phosphor="mouse-left-click"'), 'Use Phosphor’s left-click mouse icon');
assert.match(source, /#control-hints\.space-key #control-mouse \{ display: none; \}/);
assert.ok(source.includes("const controlInput = document.querySelector('#control-input-label')"),
  'Update only the label so changing tutorial steps preserves the mouse icon');
assert.match(source, /#control-hints\.space-key #control-input \{[^}]*min-width: 170px/);
assert.match(source, /#control-hints \{[^}]*pointer-events: none/);
assert.match(source, /prefers-reduced-motion: reduce\) \{ #control-hints \{ transition: none/);
assert.ok(section('      function renderFrame()', '      resetSimulationClock();\n      renderer.setAnimationLoop(').includes('updateControlHints();'));
console.log('PASS cursor-attached hints without checkmarks, viewport edges, spacebar keycap and accessible announcements');
