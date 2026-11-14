// Run from the project root: node tests/hud-layout.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { t, setLanguage } from '../i18n.js';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const section = (start, end) => {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Missing section: ${start}`);
  return source.slice(from, to);
};
const hud = section('  <header class="hud">', '  </header>');
assert.doesNotMatch(hud, /id="flight-boundary-notice"/, 'The barrier retains visual feedback without a text label');
assert.match(hud, /id="collision-alert"[^>]*data-i18n="collisionWarning"[^>]*hidden[^>]*role="status"/, 'The shared collision warning starts hidden and remains accessible/localized');
assert.match(hud, /id="control-hints"[^>]*aria-atomic="true"/);
assert.match(hud, /id="feedback"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
assert.match(hud, /id="time-left"[^>]*role="timer"/);
assert.match(hud, /id="end-countdown"[^>]*role="timer"/);
console.log('PASS accessible tutorial/feedback announcements and countdown timer');

const overview = section('    <div id="flight-overview">', '    <aside id="control-hints"');
assert.ok(overview.includes('id="flight-notices"') && overview.includes('id="end-countdown"'));
assert.doesNotMatch(overview, /id="(?:feedback|collision-alert|control-hints|capital-hud)"/, 'Routine status and countdown stay separate from action/danger/tutorial/boss overlays');
assert.doesNotMatch(source, /repair-notice|repairNoticeUntil/, 'Repairs use shared action feedback, not a second notification');
assert.doesNotMatch(source, /translate: 0 30px/, 'No arbitrary downward offsets for countdown or corridor notices');
const countdownStyle = section('    #end-countdown {', '    #countdown-number {');
assert.doesNotMatch(countdownStyle, /position: fixed|translate/, 'Countdown stays in its reserved layout row, not an independent floating overlay');
assert.ok(source.includes('.hud:has(#control-hints:not([hidden])) #action-feedback { display: none; }'), 'Tutorial takes precedence even when feedback has inline visibility');
assert.ok(source.includes('if (flightState.textContent !== flightStatus)'), 'Do not re-announce unchanged live status every frame');
assert.match(source, /#impact-label \{[^}]*width: min\(720px,[^}]*text-align: center/, 'Long crash labels have a bounded, centered layout');
assert.ok(source.includes('body:has(#impact-label:not([hidden]))'), 'Crash presentation clears competing gameplay overlays');
console.log('PASS separate HUD zones, shared repairs and bounded crash labels');

// Execute the actual resize handling: toolbar changes must change width, never the centerline.
const clearanceCode = section('    function updateHudClearance()', '    let getRenderState =');
let geometry = {scoreRight: 232, actionsLeft: 704, scoreBottom: 136, actionsBottom: 60}, clearance, panelsBottom, onResize;
const observed = [];
const header = {style: {setProperty(name, value) {
  if (name === '--hud-clearance') clearance = parseFloat(value);
  else { assert.equal(name, '--hud-panels-bottom'); panelsBottom = parseFloat(value); }
}}};
const scorePanel = {getBoundingClientRect: () => ({right: geometry.scoreRight, bottom: geometry.scoreBottom})};
const actions = {getBoundingClientRect: () => ({left: geometry.actionsLeft, bottom: geometry.actionsBottom})};
class Observer {
  constructor(callback) { onResize = callback; }
  observe(element) { observed.push(element); }
}
const resize = new Function('hud', 'scorePanel', 'hudActions', 'ResizeObserver', 'innerWidth', `
  ${clearanceCode}
  return width => { innerWidth = width; updateHudClearance(); };
`)(header, scorePanel, actions, Observer, 912);
assert.deepEqual(observed, [header, scorePanel, actions], 'Observe viewport width and both actual side-panel sizes');
assert.equal(clearance, 244);
assert.equal(panelsBottom, 136, 'Portrait notices clear the actual score panel');
geometry.actionsBottom = 176.2; onResize();
assert.equal(panelsBottom, 177, 'A vertical toolbar or safe area also contributes to portrait clearance');
geometry.actionsLeft = 762; onResize();
assert.equal(clearance, 244, 'Hiding Fullscreen does not move the message center or widen past the score panel');
geometry = {scoreRight: 204, actionsLeft: 668, scoreBottom: 128, actionsBottom: 60}; onResize();
assert.equal(clearance, 256, 'A wider right side or asymmetric notch reserves equal space on both sides');
geometry = {scoreRight: 240.2, actionsLeft: 762, scoreBottom: 128, actionsBottom: 60}; onResize();
assert.equal(clearance, 253, 'Round subpixel panel edges outward to preserve the gap');
geometry.scoreRight = 300; onResize();
assert.equal(clearance, 312, 'Longer localized text or scores cannot run into a centered notice');
geometry = {scoreRight: 204, actionsLeft: 388, scoreBottom: 128, actionsBottom: 60}; resize(568);
assert.equal(clearance, 216, 'Rotation recomputes clearance using the current viewport');
console.log('PASS resize-driven symmetric clearance, optional toolbar buttons, unequal safe areas, longer content and rotation');

for (const locale of ['en', 'de']) for (const [remaining, mode, expected] of [
  [45, 'play', '00:45'], [6, 'play', '00:06'], ...[5, 4, 3, 2, 1].map(n => [n, 'play', `00:0${n}`]),
  [5, 'pause', '00:05'], [5, 'training', 'TRAINING'], [5, 'crash', '00:05'], [5, 'end', '00:05'],
  [5, 'intro', '00:05'], [0, 'play', '00:00']
]) {
  setLanguage(locale);
  const dots = Array.from({length: 5}, () => ({classList: {toggle(name, active) { this[name] = active; }}}));
  const elements = new Map(), document = {querySelectorAll: () => dots, querySelector(id) {
    if (!elements.has(id)) elements.set(id, {style: {}, setAttribute(name, value) { this[name] = value; },
      classList: {toggle(name, active) { this[name] = active; }}});
    return elements.get(id);
  }};
  const ticks = new Function('document', 't', 'remaining', 'mode', `
    const level = 1, roundDuration = 45, courseStartTime = 20, gameTime = courseStartTime + 45 - remaining;
    const started = mode !== 'intro', paused = mode === 'pause', crashing = mode === 'crash';
    const roundEnded = mode === 'end', celebrating = false, tutorialStage = mode === 'training' ? 0 : 3;
    let ticks = 0; const sound = {playCountdownTick: () => ticks++};
    ${section("      const clock = document.querySelector('#round-clock');", '      function startCrash(')}
    updateClock(); updateClock(); return ticks;
  `)(document, t, remaining, mode);
  const countdown = ['play', 'pause'].includes(mode) && remaining > 0 && remaining <= 5;
  const timer = elements.get('#time-left'), counter = elements.get('#end-countdown');
  assert.equal(timer.textContent, expected, `${locale}: ${mode} at ${remaining} seconds`);
  assert.equal(counter.hidden, !countdown);
  if (countdown) {
    assert.equal(elements.get('#countdown-number').textContent, String(remaining));
    assert.equal(dots.filter(dot => dot.classList.spent).length, 5 - remaining, 'Dots fade one by one without disappearing from the layout');
    assert.equal(counter['aria-label'], t('countdown', {seconds: remaining}));
  }
  assert.equal(timer['aria-label'], expected);
  assert.equal(ticks, countdown && mode !== 'pause' ? 1 : 0, 'One tick per second; none while inactive');
}
console.log('PASS separate countdown, normal HUD time, localized accessible seconds, frozen pause, lifecycle reset and no repeated ticks');
