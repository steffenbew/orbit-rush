import { readFileSync } from 'node:fs';
import { html, css } from './helpers/app-source.mjs';
// Run from the project root: node tests/icons.mjs
import assert from 'node:assert/strict';


const license = readFileSync(new URL('../public/licenses/PHOSPHOR-LICENSE.txt', import.meta.url), 'utf8');
const expected = {
  camera: 'video-camera', planet: 'planet', shield: 'shield', volume: 'speaker-high', muted: 'speaker-slash', pause: 'pause', play: 'play',
  fullscreen: 'corners-out', 'exit-fullscreen': 'corners-in', trophy: 'trophy', 'heart-broken': 'heart-break',
  stop: 'warning-octagon', next: 'caret-double-right', finish: 'flag-checkered', restart: 'arrow-counter-clockwise',
  rocket: 'rocket-launch', 'mouse-left': 'mouse-left-click', 'cursor-click': 'cursor-click', prohibit: 'prohibit', close: 'x'
};
const symbols = [...html.matchAll(/<symbol id="i-([^"]+)" data-phosphor="([^"]+)" viewBox="([^"]+)">([\s\S]*?)<\/symbol>/g)];
assert.equal(symbols.length, Object.keys(expected).length);
for (const [, id, name, viewBox, body] of symbols) {
  assert.equal(name, expected[id]);
  assert.equal(viewBox, '0 0 256 256', 'Preserve the Phosphor coordinate system');
  assert.ok(body.includes('<path d="'), `Include local paths for ${name}`);
  assert.ok(!/<(?:script|image|foreignObject)\b/.test(body));
}
for (const [, id] of html.matchAll(/href="#i-([^"]+)"/g)) {
  assert.ok(id in expected, `Local symbol exists for ${id}`);
}
assert.match(css, /\.icon \{[^}]*fill: currentColor; stroke: none;/);
assert.match(css, /\.weapon-lock \{[^}]*fill: currentColor; stroke: none;/);
assert.ok(html.includes('<use href="#i-prohibit"/>') && html.includes('<use href="#i-close"/>'));
assert.ok(license.includes('MIT License') && license.includes('Copyright (c) 2023 Phosphor Icons'));
console.log('PASS local Phosphor interface icons, valid symbol references, filled-path styling and bundled MIT license');

assert.ok(html.includes('<h1>ORBIT<span>RUSH</span></h1>'), 'Keep the original straight, stacked wordmark');
assert.ok(!html.includes('logo-ring') && !html.includes('logo-letter'), 'Remove circular lettering');
assert.match(css, /#start:hover:not\(:disabled\) \{ transform: translate\(-50%, -50%\) scale\(1\.12\)/, 'Hover grows the play button without changing layout');
assert.match(css, /transition: transform \.5s cubic-bezier\(\.2, 1\.5, \.35, 1\)/, 'Play hover gently overshoots and settles');
assert.match(css, /#start:active:not\(:disabled\) \{ transform: translate\(-50%, -50%\) scale\(\.97\)/, 'Pressing Play gives a small tactile compression');
assert.match(css, /prefers-reduced-motion: reduce\) \{ #start \{ transition: none;/, 'Respect reduced-motion preferences');
assert.ok(!html.includes('RUSH.</span>'));
const favicon = decodeURIComponent(html.match(/rel="icon" href="data:image\/svg\+xml,([^"]+)"/)[1]);
const rocket = symbols.find(([, id]) => id === 'rocket')[4];
assert.ok(favicon.includes(rocket), 'Use the bundled Phosphor rocket in the favicon');
const startButton = html.match(/<button id="start"[\s\S]*?<\/button>/)[0];
assert.ok(html.includes('<span id="start-label"') && startButton.includes('href="#i-play"'));
assert.ok(!startButton.includes('id="start-label"'), 'Fixed loading status stays outside the transformed button');
assert.match(css, /#start-label \{ position: fixed; bottom:/, 'Loading status is anchored to the viewport, outside layout flow');
assert.ok(!css.includes('.intro-card:has(#start:disabled'), 'Loading state cannot change card spacing');
assert.ok(startButton.includes('aria-labelledby="start-label"'), 'Icon-only start button keeps its localized accessible name');
console.log('PASS original stacked wordmark, hover play button, stable loading status and Phosphor rocket favicon');
