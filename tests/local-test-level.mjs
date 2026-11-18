import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const from = source.indexOf('  function localTestLevel()');
const to = source.indexOf('  let { level, score', from);
assert.ok(from >= 0 && to > from);
const resolve = new Function('location', `${source.slice(from, to)} return localTestLevel();`);
for (const hostname of ['localhost', '127.0.0.1', '[::1]']) {
  for (const level of [1, 5, 1000]) assert.equal(resolve({hostname, search: `?test&level=${level}`}), level);
  for (const search of ['', '?level=5', '?test', '?test&level=', '?test&level=0', '?test&level=-1', '?test&level=1.5', '?test&level=abc', '?test&level=1001', '?test&level=Infinity']) {
    assert.equal(resolve({hostname, search}), null, search);
  }
}
for (const hostname of ['orbit-rush.example', 'localhost.example.com', '127.0.0.1.example.com', '192.168.1.10']) {
  assert.equal(resolve({hostname, search: '?test&level=5'}), null, 'Non-loopback hosts ignore level shortcuts');
}
const startup = source.slice(source.indexOf('      const testLevel = localTestLevel();'), source.indexOf('      resetSimulationClock();', source.indexOf('      const testLevel = localTestLevel();')));
const start = new Function('localTestLevel', `
  let level = 1, tutorialCompleted = false;
  let fleet, tutorial;
  const setupLevelFleet = () => { fleet = level; };
  const beginFlightTutorial = () => { tutorial = !tutorialCompleted && level === 1; };
  ${startup}
  return {level, tutorial, fleet};
`);
const test = start(() => 5);
assert.equal(test.level, 5);
assert.equal(test.fleet, 5);
assert.equal(test.tutorial, false);
assert.equal(start(() => 1).tutorial, false);
assert.equal(start(() => null).tutorial, true);
console.log('PASS loopback-only test levels, bounded input, correct fleet level, tutorial skip and unchanged normal starts');
