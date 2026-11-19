import { html, css, game as gameSource } from './helpers/app-source.mjs';
// Run from the project root: node tests/shield-hud.mjs
import assert from 'node:assert/strict';


import { createShieldHud } from '../src/flight/shield-hud.js';

function makeHud() {
  const elements = new Map();
  const document = {hidden: false, querySelector(selector) {
    if (!elements.has(selector)) {
      const classes = new Set();
      elements.set(selector, {value: 100, textContent: '', style: {}, classList: {
        toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); },
        contains: name => classes.has(name)
      }});
    }
    return elements.get(selector);
  }};
  const hud = createShieldHud(document, 100);
  const panel = document.querySelector('#shield-hud'), fill = document.querySelector('#shield-fill');
  let paused = false;
  hud.set(100, false); hud.render(paused);
  return {
    change(value, animate = true) { hud.set(value, animate); hud.render(paused); },
    step(dt) { hud.advance(dt, !paused); hud.render(paused); },
    pause(value) { paused = value; hud.render(paused); },
    hide(value) { document.hidden = value; hud.render(paused); },
    state: () => ({
      value: document.querySelector('#shield-energy').value, text: document.querySelector('#shield-value').textContent,
      displayed: Number(fill.style.transform.slice(7, -1)) * 100, fill: fill.style.transform,
      hit: panel.classList.contains('hit'), healed: panel.classList.contains('healed'), low: panel.classList.contains('low'),
      animation: panel.style.animationPlayState
    })
  };
}
{
  const hud = makeHud();
  hud.change(60);
  assert.equal(hud.state().value, 60, 'Accessible progress updates immediately');
  assert.equal(hud.state().text, '60%');
  assert.equal(hud.state().displayed, 100);
  assert.equal(hud.state().hit, true);
  hud.step(.1);
  assert.ok(hud.state().displayed > 60 && hud.state().displayed < 100);
  hud.pause(true);
  const paused = hud.state(); hud.step(2);
  assert.deepEqual(hud.state(), paused, 'Pause freezes fill, feedback and low-shield pulse');
  assert.equal(paused.animation, 'paused');
  hud.pause(false); hud.hide(true);
  const hidden = hud.state(); hud.step(2);
  assert.deepEqual(hud.state(), hidden, 'Hidden tab does not consume feedback time');
  hud.hide(false); hud.step(.15);
  assert.equal(hud.state().displayed, 60, 'Fill reaches the target after 250 ms of active time');
  hud.step(.31); assert.equal(hud.state().hit, false);

  // Both checkpoint +5 and repair pickup +25 go through the same update function.
  for (const amount of [5, 25]) {
    hud.change(40, false);
    hud.change(40 + amount);
    assert.equal(hud.state().healed, true);
    assert.equal(hud.state().hit, false);
    hud.step(.6);
    assert.equal(hud.state().displayed, 40 + amount);
    assert.equal(hud.state().healed, false);
  }
  hud.change(100, false); hud.change(100);
  assert.equal(hud.state().healed, false, 'No healing glow for a no-op at full shield');

  hud.change(20, false); hud.change(25);
  assert.equal(hud.state().low, true);
  assert.equal(hud.state().healed, true, 'Healing below 30% temporarily overrides low-shield styling');
  hud.step(.6);
  assert.equal(hud.state().low, true);
  assert.equal(hud.state().healed, false, 'Low-shield warning resumes after healing');
  hud.change(35); assert.equal(hud.state().low, false);

  hud.change(15); hud.step(.08);
  const interrupted = hud.state().displayed;
  hud.change(40);
  assert.equal(hud.state().displayed, interrupted, 'Rapid changes start from the currently drawn fill');
  assert.equal(hud.state().hit, false); assert.equal(hud.state().healed, true);
  hud.change(30);
  assert.equal(hud.state().hit, true); assert.equal(hud.state().healed, false, 'Newest event wins');
  hud.change(100, false);
  assert.equal(hud.state().displayed, 100);
  assert.equal(hud.state().hit, false); assert.equal(hud.state().healed, false);
  hud.step(.1); assert.equal(hud.state().displayed, 100, 'Reset never animates old damage or healing');
  hud.change(0); hud.change(0, false);
  assert.equal(hud.state().displayed, 0, 'Crash snaps to actual shield even while gameplay is paused');
}
assert.ok(html.includes('<span id="shield-track" aria-hidden="true">'), 'Decorative bar does not duplicate the accessible progress');
assert.ok(gameSource.includes('    updateShieldAnimation(dt);'));
assert.ok(css.includes('#shield-hud.hit, #shield-hud.healed { animation: none; opacity: 1; }'));
for (const name of ['startCrash', 'enterRoundResult', 'restartRound']) {
  const start = gameSource.indexOf(`  function ${name}(`);
  const end = gameSource.indexOf('\n  function ', start + 1);
  assert.ok(gameSource.slice(start, end).includes('updateShield(false);'), `${name} clears animation without a healing pulse`);
}
console.log('PASS shield fill easing, immediate accessible values, damage/heal glow, pause, rapid changes and clean resets');
