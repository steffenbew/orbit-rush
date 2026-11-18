import assert from 'node:assert/strict';
import test from 'node:test';
import { html, css } from './helpers/app-source.mjs';
import { createFrameStats } from '../src/presentation/frame-stats.js';
import { setLanguage, t } from '../src/presentation/i18n.js';

setLanguage('de');
const waiting = '— FPS · — ms';
function monitor(search = '?test') {
  let text = waiting, status = null, writes = 0, checks = 0;
  const hud = {get textContent() { return text; }, set textContent(value) { text = value; writes++; }};
  const stats = createFrameStats(hud, search, () => { checks++; return status; });
  return { ...stats, hud, get writes() { return writes; }, get checks() { return checks; },
    setStatus(value) { status = value; } };
}

test('only the exact test query parameter enables sampling', () => {
  for (const search of ['', '?mode=test', '?contest=1', '?testing=1']) {
    const m = monitor(search);
    m.reset(); m.sample(0); m.sample(1000);
    assert.equal(m.hud.hidden, true);
    assert.equal(m.checks, 0); assert.equal(m.writes, 0);
  }
  for (const search of ['?test', '?test=1', '?other=value&test']) {
    assert.equal(monitor(search).hud.hidden, false);
  }
  assert.match(html, /id="performance-hud"[^>]*\bhidden\b/, 'Hidden before startup');
  assert.ok(html.includes('id="performance-hud" aria-live="off"'));
  assert.match(css, /#performance-hud \{[^}]*pointer-events: none/);
  assert.ok(css.includes('#time-left { grid-column: 3;'));
});

test('5–144 FPS: show the render interval and throttle HUD writes', () => {
  for (const fps of [5, 10, 20, 30, 60, 120, 144]) {
    const m = monitor(), ms = 1000 / fps;
    for (let frame = 0; frame <= fps * 3; frame++) m.sample(frame * ms);
    assert.equal(m.hud.textContent, `${fps.toFixed(fps < 10 ? 1 : 0)} FPS · ${ms.toFixed(ms < 100 ? 1 : 0)} ms`);
    assert.ok(m.writes <= 3);
  }
});

test('average uneven render intervals; ignore duplicates and let stalls expire', () => {
  const m = monitor();
  for (const time of [0, 5, 5, 25, 100, 200]) m.sample(time);
  assert.equal(m.hud.textContent, waiting);
  m.sample(1000);
  assert.equal(m.hud.textContent, '5.0 FPS · 200 ms');
  m.sample(9000);
  assert.equal(m.hud.textContent, '0.1 FPS · 8000 ms');
  for (let frame = 1; frame <= 60; frame++) m.sample(9000 + frame * 1000 / 60);
  assert.equal(m.hud.textContent, '60 FPS · 16.7 ms');
});

test('inactive labels replace partial samples; resume and restart start fresh', () => {
  for (const status of ['pause', 'ready', 'collision', 'ended', 'inactive']) {
    const m = monitor();
    m.sample(0); m.sample(700);
    m.setStatus(status); m.reset();
    assert.equal(m.hud.textContent, t(status));
    const writes = m.writes;
    m.sample(1500); m.sample(20000);
    assert.equal(m.writes, writes, 'Do not rewrite an unchanged inactive label');
    m.setStatus(null); m.reset();
    m.sample(30000); m.sample(30500);
    assert.equal(m.hud.textContent, waiting, 'Neither the old partial sample nor idle time counts');
    m.sample(31000);
    assert.equal(m.hud.textContent, '2.0 FPS · 500 ms');
    m.reset(); assert.equal(m.hud.textContent, waiting);
  }
});
