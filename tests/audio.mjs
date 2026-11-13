// Run from the project root: node tests/audio.mjs
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const source = readFileSync(new URL('audio.js', root), 'utf8');
const page = readFileSync(new URL('index.html', root), 'utf8');
const modulePath = page.match(/import\('(\.\/audio\.js\?[^']+)'\)/)[1];
const moduleUrl = new URL(modulePath, 'https://example.com/orbit/index.html');
assert.ok(moduleUrl.searchParams.get('v'), 'The deployed audio module has a version');

const requests = [], played = [];
let ok = true;
const bytes = new ArrayBuffer(8);
const decoded = { duration: 1 };
const context = {
  state: 'running',
  decodeAudioData: async data => { assert.equal(data, bytes); return decoded; },
  createBufferSource() {
    const source = { playbackRate: {value: 0}, connect(node) { this.output = node; return node; }, start() { played.push(this); } };
    return source;
  },
  createGain() { return { gain: {value: 0}, connect() {} }; }
};
function makeAudio(url, random = Math.random) {
  return new Function('moduleUrl', 'fetch', 'Math', `
    ${source.replaceAll('import.meta.url', 'moduleUrl').replaceAll('export ', '')}
    return { decode, banks, playSound, setup(ctx) { context = ctx; master = {}; ready = true; paused = false; } };
  `)(url.href, async request => {
    requests.push(request);
    return {ok, status: ok ? 200 : 404, arrayBuffer: async () => bytes};
  }, Object.assign(Object.create(Math), {random}));
}
const audio = makeAudio(moduleUrl);
audio.setup(context);
const audioFiles = [...new Set(['orbit-arcade.mp3', 'warning-low.wav', ...Object.values(audio.banks).flatMap(bank => bank.files)])];
assert.deepEqual(readdirSync(new URL('assets/audio/', root)).filter(file => /\.(wav|mp3|ogg)$/i.test(file)).sort(),
  [...audioFiles].sort(), 'Every packaged audio file is used by the game');
for (const file of audioFiles) {
  assert.ok(existsSync(new URL(`assets/audio/${file}`, root)), `Local audio exists: ${file}`);
  assert.equal(await audio.decode(file), decoded);
  assert.equal(requests.at(-1).pathname, `/orbit/assets/audio/${file}`, 'Works under a hosted subdirectory');
  assert.equal(requests.at(-1).search, moduleUrl.search, 'Every audio request shares the module version');
}
const nextUrl = new URL(moduleUrl);
nextUrl.searchParams.set('v', 'next-release');
const next = makeAudio(nextUrl);
next.setup(context);
await next.decode('checkpoint-pass.wav');
assert.equal(requests.at(-1).searchParams.get('v'), 'next-release', 'Bumping the import refreshes audio URLs');
ok = false;
await assert.rejects(audio.decode('missing.wav'), /Audio file unavailable: missing.wav \(404\)/);

assert.deepEqual(audio.banks.checkpoint.files, ['checkpoint-pass.wav']);
assert.deepEqual(audio.banks.shieldGlance.files, ['shield-hard.wav']);
assert.deepEqual(audio.banks.shieldHard.files, ['shield-hard.wav'], 'Both shield contacts use the other force-field sample');
assert.ok(audio.banks.shieldGlance.volume < audio.banks.shieldHard.volume, 'Glancing contacts stay quieter');
assert.deepEqual(audio.banks.checkpointMiss.files, ['checkpoint-miss.wav']);
assert.deepEqual(audio.banks.hit.files, ['impact-1.mp3', 'impact-2.mp3', 'impact-3.mp3'], 'Collision sounds stay unchanged');
for (const kind of ['checkpoint', 'checkpointMiss']) {
  audio.banks[kind].buffers = [decoded];
  audio.playSound(kind);
  assert.equal(played.at(-1).buffer, decoded);
  assert.equal(played.at(-1).playbackRate.value, 1, 'Checkpoint cues have fixed pitch');
}
for (const [kind, expectedGain] of Object.entries({
  checkpoint: .157083, checkpointMiss: .34, lock: .19, shieldGlance: .19, shieldHard: .24,
  shot: .16, empty: .28, hit: .42, go: .124775, reward: .24
})) {
  audio.banks[kind].buffers = [decoded];
  audio.playSound(kind);
  assert.equal(played.at(-1).output.gain.value, expectedGain, `Playback uses the intended ${kind} gain`);
}
assert.ok(Math.abs(20 * Math.log10(audio.banks.checkpoint.volume / .14) - 1) < .001, 'Sweep is 1 dB louder');
assert.ok(Math.abs(20 * Math.log10(audio.banks.go.volume / .14) + 1) < .001, 'GO is 1 dB quieter');
for (let variant = 0; variant < 3; variant++) {
  const audio = makeAudio(moduleUrl, () => (variant + .1) / 3);
  audio.setup(context);
  const bank = audio.banks.explosion;
  bank.buffers = bank.files.map(file => ({file}));
  assert.equal(bank.variantGains.length, bank.files.length);
  audio.playSound('explosion');
  assert.equal(played.at(-1).buffer, bank.buffers[variant]);
  assert.equal(played.at(-1).output.gain.value, .55 * [.52, .75, .6][variant], 'Explosion trim follows the chosen sample');
}
console.log('PASS versioned audio-file URLs, local assets, fixed checkpoint pitch, balanced gains and per-variant explosion trims');
