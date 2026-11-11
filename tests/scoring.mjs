// Run from the project root: node tests/scoring.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const typesSource = source.match(/const shipTypes = (\[[\s\S]*?\n      \]);/)[1];
const types = new Function(`return ${typesSource}`)();
const from = source.indexOf('      function award(ship)');
const to = source.indexOf('      updateScore();\n      const sound', from);
assert.ok(from >= 0 && to > from);
const awardCode = source.slice(from, to);
function makeGame(storageBlocked = false) {
  return new Function('storageBlocked', `
    let score = 0, best = 0, kills = 0, combo = 0, gameTime = 0, lastKill = -Infinity, roundEnded = false;
    const comboWindows = [0, 2.5, 1.8, 1.2, .8, .8], sounds = [], saved = [];
    const feedback = {textContent: '', classList: {add() {}, remove() {}}, offsetWidth: 0};
    const localStorage = {setItem: (...args) => { if (storageBlocked) throw new Error('Blocked'); saved.push(args); }};
    const updateRank = () => {}, updateScore = () => {}, playSound = sound => sounds.push(sound);
    ${awardCode}
    return { award, time: value => { gameTime = value; }, end: () => { roundEnded = true; },
      state: () => ({score, best, kills, combo, feedback: feedback.textContent, sounds, saved}) };
  `)(storageBlocked);
}
const target = (type, tier = 0) => ({userData: {type, asteroidTier: tier, health: 0}});
const rock = types.find(type => type.asteroid);
for (const tier of [1, 2, 3]) {
  const game = makeGame();
  game.award(target(rock, tier));
  assert.equal(game.state().score, tier * 100, 'Asteroid rewards follow size/toughness, not a flat rate');
  assert.equal(game.state().best, tier * 100);
  assert.equal(game.state().kills, 1);
  assert.ok(game.state().feedback.startsWith('+' + tier * 100));
}
for (const [index, health, points] of [[0, 3, 400], [1, 4, 600], [2, 5, 900], [4, 60, 10000]]) {
  const game = makeGame();
  assert.equal(types[index].health, health);
  game.award(target(types[index]));
  assert.equal(game.state().score, points, 'Harder ship classes must pay larger rewards');
  if (index < 3) assert.ok(points > rock.points * 3, 'Fighting mobile ships should beat farming even the largest rock');
}
assert.equal(types[4].health / 3, 20, 'The boss now needs twenty power-laser hits instead of ten');
console.log('PASS size-based asteroid rewards, escalating ship rewards and 60-HP/10,000-point Leviathan');

const game = makeGame();
const sequence = [[target(rock, 1), 100], [target(rock, 2), 200], [target(rock, 3), 300],
  [target(types[0]), 400], [target(types[1]), 600], [target(types[4]), 10000]];
let expected = 0;
sequence.forEach(([ship, base], index) => {
  game.time(index * .1); game.award(ship);
  const combo = Math.min(index + 1, 5);
  expected += base * combo;
  assert.equal(game.state().score, expected);
  assert.equal(game.state().combo, combo);
});
game.time(10); game.award(target(types[2]));
assert.equal(game.state().combo, 1, 'Existing combo expiry remains unchanged');
assert.equal(game.state().score, expected + 900);
assert.equal(game.state().best, game.state().score);
assert.deepEqual(game.state().saved.at(-1), ['sternflug-highscore', String(game.state().score)]);
const before = game.state(); game.end(); game.award(target(types[4]));
assert.deepEqual(game.state(), before, 'No score after the round ends');
const blocked = makeGame(true); blocked.award(target(rock, 3));
assert.equal(blocked.state().score, 300, 'Blocked storage must not prevent rewards');
console.log('PASS unchanged combo multiplier/cap/expiry, score feedback, highscore persistence and end-of-round guard');
