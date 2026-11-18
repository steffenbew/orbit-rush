// For integration assertions that inspect the game's markup, styles and wiring together.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
export const html = read('index.html');
export const css = read('src/presentation/game.css');
export const game = read('src/main.js');

export function sourceSection(source, start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Missing source section: ${start}`);
  return source.slice(from, to);
}

// Legacy fixtures that run selected main.js handlers need the real lifecycle guard too.
export const activeFlightSource = sourceSection(game, '  function isFlightActive()', '  const traffic =');
