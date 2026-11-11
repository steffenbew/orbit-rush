// Run from the project root: node tests/frame-stats.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { t, setLanguage } from '../i18n.js';
setLanguage('de');

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const section = (start, end) => {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Missing source section: ${start}`);
  return source.slice(from, to);
};
const makeMonitor = (search = '?test') => new Function('search', 't', `
  const location = { search };
  let wallTime = 0, frameCallback, renders = 0, steps = 0, writes = 0;
  let text = '— FPS · — ms';
  const hud = { hidden: true, get textContent() { return text; }, set textContent(value) { text = value; writes++; } };
  const document = { hidden: false, querySelector: () => hud };
  const performance = { now: () => wallTime };
  const renderer = { setAnimationLoop: callback => { frameCallback = callback; } };
  let started = true, paused = false, crashing = false, roundEnded = false;
  function updateSimulation() { steps++; }
  function renderFrame() { renders++; }
  ${section('      const performanceHud =', '      const progressionTimeScale =')}
  ${section('      resetSimulationClock();\n      renderer.setAnimationLoop(', '    } catch (error)')}
  return {
    frame: seconds => { wallTime += seconds * 1000; frameCallback(wallTime); },
    elapseWithoutFrame: seconds => { wallTime += seconds * 1000; },
    reset: resetSimulationClock,
    setHidden: hidden => { document.hidden = hidden; resetSimulationClock(); },
    mode: mode => {
      started = mode !== 'intro'; paused = ['pause', 'crash', 'end'].includes(mode);
      crashing = mode === 'crash'; roundEnded = mode === 'end'; resetSimulationClock();
    },
    state: () => ({ text, hidden: hud.hidden, writes, renders, steps, sampleTime: frameSampleTime, sampleCount: frameSampleCount })
  };
`)(search, t);

for (const search of ['', '?mode=test', '?contest=1', '?testing=1']) {
  const monitor = makeMonitor(search); monitor.frame(0);
  for (let frame = 0; frame < 120; frame++) monitor.frame(1 / 60);
  assert.equal(monitor.state().hidden, true, 'Hide the readout unless the exact test parameter is present');
  assert.equal(monitor.state().steps, 120, 'Normal gameplay must still advance without the overlay');
  assert.equal(monitor.state().renders, 121);
  monitor.mode('pause'); monitor.frame(60); monitor.mode('playing');
  monitor.setHidden(true); monitor.frame(60); monitor.setHidden(false);
  assert.equal(monitor.state().writes, 0, 'Do not update the hidden HUD, including during lifecycle changes');
  assert.equal(monitor.state().sampleCount, 0, 'Do not collect FPS samples when disabled');
  assert.equal(monitor.state().sampleTime, 0);
}
for (const search of ['?test', '?test=1', '?other=value&test']) {
  const monitor = makeMonitor(search); monitor.frame(0);
  assert.equal(monitor.state().hidden, false, 'The test parameter opts into the readout');
  for (let frame = 0; frame < 70; frame++) monitor.frame(1 / 60);
  assert.equal(monitor.state().text, '60 FPS · 16.7 ms');
}
assert.match(source, /id="performance-hud"[^>]*\bhidden\b/, 'Hide in the initial HTML to avoid a startup flash');
assert.ok(source.includes('#time-left { grid-column: 3;'), 'Keep the timer right-aligned with or without the readout');
console.log('PASS test-parameter opt-in, hidden by default, no disabled sampling or DOM updates, and unchanged normal gameplay');

for (const fps of [5, 10, 20, 30, 60, 120, 144]) {
  const monitor = makeMonitor(); monitor.frame(0);
  for (let frame = 0; frame < Math.ceil(fps * 2.2); frame++) monitor.frame(1 / fps);
  const milliseconds = 1000 / fps;
  assert.equal(monitor.state().text,
    `${fps.toFixed(fps < 10 ? 1 : 0)} FPS · ${milliseconds.toFixed(milliseconds < 100 ? 1 : 0)} ms`);
  assert.ok(monitor.state().writes <= 3, 'Do not write the HUD every animation frame');
  assert.ok(monitor.state().sampleTime < 1000, 'Keep only the current bounded sampling window');
  assert.equal(monitor.state().renders, Math.ceil(fps * 2.2) + 1, 'Use one render per callback');
  if (fps !== 60) assert.notEqual(monitor.state().renders, monitor.state().steps,
    'Measured render cadence must not be confused with fixed-step physics');
}
console.log('PASS actual 5–144 FPS and average frame intervals, independent of simulation steps and with throttled HUD writes');

const uneven = makeMonitor(); uneven.frame(0);
let elapsed = 0, count = 0, expected = '';
for (let frame = 0; frame < 60; frame++) {
  const seconds = [.005, .01, .2, .025, .1, .008][frame % 6];
  uneven.frame(seconds); elapsed += seconds * 1000; count++;
  if (elapsed >= 1000) {
    const fps = count * 1000 / elapsed, milliseconds = elapsed / count;
    expected = `${fps.toFixed(fps < 10 ? 1 : 0)} FPS · ${milliseconds.toFixed(milliseconds < 100 ? 1 : 0)} ms`;
    elapsed = 0; count = 0;
  }
  if (expected) assert.equal(uneven.state().text, expected, 'Average frame count over time, not instantaneous FPS values');
}
const stalled = makeMonitor(); stalled.frame(0); stalled.frame(8);
assert.equal(stalled.state().text, '0.1 FPS · 8000 ms', 'Do not cap reported stalls to the 250 ms physics budget');
assert.equal(stalled.state().steps, 15, 'The overlay must not change bounded catch-up');
for (let frame = 0; frame < 70; frame++) stalled.frame(1 / 60);
assert.equal(stalled.state().text, '60 FPS · 16.7 ms', 'Old stalls must expire after the next sampling window');
const duplicate = makeMonitor(); duplicate.frame(0); duplicate.frame(0);
assert.equal(duplicate.state().sampleCount, 0, 'Identical timestamps must not create Infinity or double-count an interval');
console.log('PASS weighted irregular-frame averages, uncapped long-stall reporting, recovery and duplicate timestamps');

for (const [mode, label] of [['pause', 'PAUSE'], ['intro', 'BEREIT'], ['crash', 'KOLLISION'], ['end', 'ENDE']]) {
  const monitor = makeMonitor(); monitor.frame(0);
  for (let frame = 0; frame < 35; frame++) monitor.frame(1 / 60);
  monitor.mode(mode); assert.equal(monitor.state().text, label);
  const writes = monitor.state().writes;
  for (let frame = 0; frame < 10; frame++) monitor.frame(20);
  assert.equal(monitor.state().text, label);
  assert.equal(monitor.state().writes, writes, 'Inactive labels must not churn the DOM');
  assert.equal(monitor.state().sampleTime, 0);
  monitor.elapseWithoutFrame(20); monitor.mode('playing');
  assert.equal(monitor.state().text, '— FPS · — ms');
  monitor.frame(1 / 60);
  for (let frame = 0; frame < 35; frame++) monitor.frame(1 / 60);
  assert.equal(monitor.state().text, '— FPS · — ms', 'Resume must not mix in the old partial sample');
  for (let frame = 0; frame < 35; frame++) monitor.frame(1 / 60);
  assert.equal(monitor.state().text, '60 FPS · 16.7 ms');
}
const hidden = makeMonitor(); hidden.frame(0); hidden.frame(.5);
hidden.setHidden(true); assert.equal(hidden.state().text, 'INAKTIV');
hidden.frame(60); hidden.elapseWithoutFrame(60);
assert.equal(hidden.state().sampleTime, 0);
hidden.setHidden(false); hidden.frame(1 / 60);
for (let frame = 0; frame < 70; frame++) hidden.frame(1 / 60);
assert.equal(hidden.state().text, '60 FPS · 16.7 ms', 'Tab throttling must not pollute resumed gameplay FPS');
hidden.reset(); assert.equal(hidden.state().text, '— FPS · — ms');
assert.equal(hidden.state().sampleCount, 0, 'A restart must reset the overlay as well as the simulation clock');
console.log('PASS pause/intro/crash/end labels, hidden tabs and fresh samples after resume or restart');

const loop = section('      renderer.setAnimationLoop(', '    } catch (error)');
assert.equal((loop.match(/updateFrameStats\(time\)/g) || []).length, 1);
assert.ok(loop.indexOf('updateFrameStats(time)') > loop.indexOf('renderFrame()'), 'Sample once per actual render');
assert.ok(!section('      function updateSimulation(dt)', '      function recordVisibleObjects()').includes('updateFrameStats'));
assert.ok(!section('      const performanceHud =', '      const simulationStep =').includes('setInterval'));
assert.ok(source.includes('id="performance-hud" aria-live="off"'), 'Do not announce every FPS change to screen readers');
assert.ok(source.includes('#performance-hud {') && source.match(/#performance-hud \{[^}]*pointer-events: none/));
console.log('PASS render-loop wiring, no extra timers, non-interactive HUD and no live-region announcements');
