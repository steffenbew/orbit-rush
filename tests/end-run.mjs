import { html, css, game as gameSource } from './helpers/app-source.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';


const start = gameSource.indexOf('  async function endRun()');
const end = gameSource.indexOf('  function togglePause()', start);
assert.ok(start >= 0 && end > start);
for (const mode of ['windowed', 'fullscreen', 'exit-failed', 'not-started', 'not-paused']) {
  const calls = [], button = {disabled: false, addEventListener() {}};
  const document = {
    querySelector: () => button,
    fullscreenElement: ['fullscreen', 'exit-failed'].includes(mode) ? {} : null,
    async exitFullscreen() {
      calls.push('exit');
      if (mode === 'exit-failed') throw Error('Denied');
    }
  };
  const window = {location: {reload() { calls.push('reload'); }}};
  const endRun = new Function('document', 'window', 'console', 'started', 'paused', `
    ${gameSource.slice(start, end)}
    return endRun;
  `)(document, window, {warn() {}}, mode !== 'not-started', mode !== 'not-paused');
  await endRun();
  const allowed = !mode.startsWith('not-');
  assert.deepEqual(calls, !allowed ? [] : mode === 'windowed' ? ['reload'] : ['exit', 'reload'], mode);
  assert.equal(button.disabled, allowed);
}
assert.match(html, /<button id="end-run"><svg class="icon" aria-hidden="true"><use href="#i-planet"\/><\/svg><span data-i18n="endRun">/);
assert.match(css, /#pause-menu button \{[^}]*height: 48px; min-height: 48px;/);
assert.match(css, /#pause-menu button \{[^}]*display: flex; align-items: center; justify-content: center;/);
assert.match(css, /#pause-menu button span \{ text-align: center;/);
assert.match(css, /\.pause-actions \{ display: grid; gap: 10px;/);
assert.match(css, /#pause-menu button:focus-visible \{ outline: 2px solid #7effd5;/);
const menu = html.slice(html.indexOf('<dialog id="pause-menu"'), html.indexOf('<dialog id="round-end"'));
assert.ok(!menu.includes('restartDetail'), 'Compact secondary actions omit the restart subtitle');
console.log('PASS end run returns home, exits fullscreen first, handles exit failure and guards inactive gameplay');
