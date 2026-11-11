// Run from the project root: node tests/pause-menu.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { t, setLanguage } from '../i18n.js';
setLanguage('de');

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = source.indexOf('      function togglePause()');
const end = source.indexOf('      const fullscreenButton', start);
assert.ok(start >= 0 && end > start);
const document = { activeElement: null, querySelector: selector => elements.get(selector) };
class Element extends EventTarget {
  attributes = {};
  open = false;
  setAttribute(name, value) { this.attributes[name] = value; }
  focus() { document.activeElement = this; }
  blur() { document.activeElement = body; }
  showModal() { this.open = true; }
  close() { this.open = false; }
}
const body = new Element();
const elements = new Map(['#pause', '#pause-menu', '#continue-flight'].map(id => [id, new Element()]));
document.activeElement = body;
const menu = elements.get('#pause-menu');
const game = new Function('document', 'pauseMenu', 't', `
  let started = true, paused = false, roundEnded = false, celebrating = false, crashing = false;
  let pointer = {id: 1}, spaceHeld = true, speed = 400, clockResets = 0;
  const resetSimulationClock = () => { clockResets++; };
  const lastPointerPosition = {clientX: 300, clientY: 250};
  let audioResumes = 0, musicSyncs = 0, steered = null;
  const sound = {resumeAudio: () => { audioResumes++; return Promise.resolve(); }};
  const audioError = error => { throw error; };
  const syncMusic = () => musicSyncs++;
  const steer = point => steered = point;
  ${source.slice(start, end)}
  return {
    togglePause,
    state: () => ({paused, pointer, spaceHeld, audioResumes, musicSyncs, steered, speed, clockResets}),
    mode: value => {
      started = value !== 'intro'; crashing = value === 'crash';
      roundEnded = value === 'defeat' || value === 'victory'; celebrating = value === 'victory';
    }
  };
`)(document, menu, t);

function click(id) { elements.get(id).dispatchEvent(new Event('click')); }
function key(type, code, repeat = false) {
  const event = new Event(type, {cancelable: true});
  Object.assign(event, {code, repeat});
  menu.dispatchEvent(event);
  return event;
}

click('#pause');
assert.equal(game.state().paused, true);
assert.equal(menu.open, true);
assert.equal(document.activeElement, elements.get('#continue-flight'));
assert.equal(elements.get('#pause').attributes['aria-pressed'], 'true');
assert.equal(game.state().pointer, null);
assert.equal(game.state().spaceHeld, false);
assert.equal(game.state().speed, 0);
assert.equal(game.state().clockResets, 1, 'Pause must discard the partial simulation frame');
for (const type of ['keydown', 'keyup']) assert.equal(key(type, 'Space').defaultPrevented, true);
assert.equal(key('keydown', 'Space', true).defaultPrevented, true);
assert.equal(key('keydown', 'Escape', true).defaultPrevented, true);
assert.equal(key('keydown', 'Enter').defaultPrevented, false);
assert.equal(key('keydown', 'Tab').defaultPrevented, false);
assert.equal(menu.open, true);
click('#continue-flight');
assert.equal(menu.open, false);
assert.equal(game.state().paused, false);
assert.equal(elements.get('#pause').attributes['aria-pressed'], 'false');
assert.equal(game.state().audioResumes, 1);
assert.equal(game.state().clockResets, 2, 'Resume must not simulate time spent in the menu');
assert.deepEqual(game.state().steered, {clientX: 300, clientY: 250});
assert.equal(document.activeElement, body);
console.log('PASS pause menu, safe initial focus, cleared firing input and deliberate Continue action');

game.togglePause();
const cancel = new Event('cancel', {cancelable: true});
menu.dispatchEvent(cancel);
assert.equal(cancel.defaultPrevented, true, 'Escape must synchronize gameplay, not just dismiss the dialog');
assert.equal(menu.open, false);
assert.equal(game.state().paused, false);
console.log('PASS Escape resumes gameplay and closes the menu; Space/repeat cannot activate it');

for (const mode of ['intro', 'crash', 'defeat']) {
  game.mode(mode);
  game.togglePause();
  assert.equal(menu.open, false, mode + ' must not offer an invalid resume');
  assert.equal(game.state().paused, false);
}
game.mode('victory'); game.togglePause();
assert.equal(menu.open, true, 'The celebration flight may still be paused');
click('#continue-flight');
assert.equal(menu.open, false);
console.log('PASS intro/crash/defeat guards and celebration-flight pause');

const hud = source.slice(source.indexOf('<div class="hud-actions"'), source.indexOf('</header>'));
assert.ok(!hud.includes('id="restart"'));
const menuMarkup = source.slice(source.indexOf('<dialog id="pause-menu"'), source.indexOf('<dialog id="round-end"'));
assert.ok(menuMarkup.includes('id="restart"') && menuMarkup.includes('id="continue-flight"'));
assert.ok(source.includes('<div class="brand"><span>ORBIT RUSH</span><small>SPACE ARCADE</small></div>'));
assert.ok(!source.includes('FREE FLIGHT'));
assert.ok(!source.includes('PAUSE · KLICK ZUM WEITERFLIEGEN'));
console.log('PASS restart moved out of the HUD, shorter two-line branding and no obsolete click-to-resume hint');
