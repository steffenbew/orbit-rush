// Result action stays between balanced heading/summary rows; compact screens can flow naturally.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const dialog = source.match(/<dialog id="round-end"[\s\S]*?<\/dialog>/)[0];
assert.ok(dialog.indexOf('class="round-heading"') < dialog.indexOf('id="play-again"'));
assert.ok(dialog.indexOf('id="play-again"') < dialog.indexOf('class="round-summary"'));
assert.ok(dialog.indexOf('class="round-summary"') < dialog.indexOf('id="final-score"'));
assert.match(source, /#round-end \.intro-card \{[^}]*grid-template-rows: 1fr auto 1fr;[^}]*\}/);
assert.match(source, /#round-end \.intro-card \{[^}]*grid-template-rows: auto auto auto;[^}]*\}/);
assert.match(source, /#round-end #play-again \{[^}]*margin: 0;/);
assert.ok(source.includes('body:has(#round-end[open]) :is(.reticle, #hit-cross) { visibility: hidden; }'));
console.log('PASS centered action, achievement/action/summary reading order, compact layout and hidden aiming overlays');
