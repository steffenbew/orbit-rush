import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf('    function anchorTouchViewport(');
const end = html.indexOf('    // Keep this helper with the entry point:', start);
assert.ok(start > 0 && end > start);

function setup(withVisualViewport = true) {
  const window = Object.assign(new EventTarget(), { scrollX: 0, scrollY: 0 });
  if (withVisualViewport) window.visualViewport = Object.assign(new EventTarget(), { scale: 1, offsetLeft: 0, offsetTop: 0 });
  const frames = [], scrolls = [];
  let syncs = 0;
  window.scrollTo = (x, y) => {
    scrolls.push([x, y]); window.scrollX = x; window.scrollY = y;
    if (window.visualViewport) {
      window.visualViewport.offsetLeft = 0; window.visualViewport.offsetTop = 0;
      window.visualViewport.dispatchEvent(new Event('scroll'));
    }
  };
  new Function('window', 'requestAnimationFrame', 'onSync', `
    ${html.slice(start, end)}
    anchorTouchViewport(onSync);
  `)(window, callback => frames.push(callback), () => syncs++);
  const frame = () => { for (const callback of frames.splice(0)) callback(); };
  return { window, frames, scrolls, frame, syncs: () => syncs };
}

test('iOS rotation offsets are reset and HUD clearance is refreshed after layout settles', () => {
  const game = setup(); game.frame();
  game.window.scrollY = 68;
  game.window.visualViewport.offsetTop = 68;
  game.window.dispatchEvent(new Event('orientationchange'));
  game.window.dispatchEvent(new Event('resize'));
  game.window.visualViewport.dispatchEvent(new Event('resize'));
  assert.equal(game.frames.length, 1, 'Coalesce orientation and resize events into one frame');
  assert.equal(game.scrolls.length, 0, 'Wait for layout rather than reading intermediate rotation geometry');
  game.frame();
  assert.deepEqual(game.scrolls, [[0, 0]]);
  assert.equal(game.window.scrollY, 0);
  assert.equal(game.window.visualViewport.offsetTop, 0);
  assert.equal(game.syncs(), 2);
  game.frame();
  assert.equal(game.frames.length, 0, 'Settled viewport does not create a permanent animation loop');
  assert.equal(game.scrolls.length, 1, 'Our own viewport scroll event does not cause repeated scrolling');
});

test('late visual viewport changes and app restore also re-anchor the document', () => {
  const game = setup(); game.frame();
  // WebKit can report viewport drift even while window.scrollY remains zero.
  game.window.visualViewport.offsetTop = 68;
  game.window.visualViewport.dispatchEvent(new Event('scroll'));
  game.frame(); game.frame();
  game.window.scrollX = 12;
  game.window.dispatchEvent(new Event('pageshow')); game.frame();
  assert.deepEqual(game.scrolls, [[0, 0], [0, 0]]);
});

test('accessibility zoom and viewport panning are not reset', () => {
  const game = setup(); game.frame();
  Object.assign(game.window.visualViewport, { scale: 2, offsetTop: 68 });
  game.window.visualViewport.dispatchEvent(new Event('scroll')); game.frame();
  assert.equal(game.scrolls.length, 0);
  assert.equal(game.window.visualViewport.offsetTop, 68);
  assert.equal(game.syncs(), 1);
});

test('works without VisualViewport and leaves already anchored pages alone', () => {
  const game = setup(false); game.frame();
  assert.equal(game.scrolls.length, 0);
  game.window.scrollY = 68;
  game.window.dispatchEvent(new Event('resize')); game.frame();
  assert.deepEqual(game.scrolls, [[0, 0]]);
  assert.match(html, /body\.touch-device \{ position: fixed; inset: 0; width: 100%; \}/);
  assert.match(html, /if \(touchMode\) anchorTouchViewport\(updateHudClearance\);/, 'Desktop layout and scrolling are unchanged');
});
