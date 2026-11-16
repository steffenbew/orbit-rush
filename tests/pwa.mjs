import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import vm from 'node:vm';
import * as legacyTouch from './fixtures/touch-controls-v5.js';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('index.html');
const manifest = JSON.parse(read('manifest.webmanifest'));
const developmentSource = read('sw.js');
const prepareScript = fileURLToPath(new URL('scripts/prepare-pwa.py', root));
const preparedSource = execFileSync('python3', [prepareScript], { encoding: 'utf8' });
const release = JSON.parse(preparedSource.match(/^const RELEASE = (.+);$/m)[1]);
const integrity = body => 'sha256-' + createHash('sha256').update(body).digest('base64');
const files = JSON.parse(developmentSource.match(/const FILES = (\[[\s\S]*?\]);/)[1]);
const bodies = new Map(files.map(file => [file, readFileSync(new URL(file, root))]));
const responseFor = (scope, request, overrides = {}) => {
  const path = new URL(request.url).pathname.slice(new URL(scope).pathname.length) || 'index.html';
  const body = Object.hasOwn(overrides, path) ? overrides[path] : bodies.get(path);
  return body === undefined ? new Response('missing', { status: 404 }) : new Response(body);
};
function nextRelease(overrides) {
  const next = { id: 'next-release', integrity: { ...release.integrity } };
  for (const [file, body] of Object.entries(overrides)) next.integrity[file] = integrity(body);
  return preparedSource.replace(/^const RELEASE = .+;$/m, `const RELEASE = ${JSON.stringify(next)};`);
}

function worker({ scope = 'https://example.test/games/orbit-rush/', script = preparedSource, stores = new Map() } = {}) {
  const handlers = new Map();
  let network = async request => responseFor(scope, request);
  let claimed = false, skippedWaiting = false;
  let clients = [], clientLookup = () => clients;
  const caches = {
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        async addAll(requests) {
          // Model the browser's atomic Cache.addAll and fetch integrity checks.
          const responses = await Promise.all(requests.map(async request => {
            assert.equal(request.cache, 'reload');
            const response = await network(request);
            if (!response.ok) throw new TypeError(`Precache HTTP ${response.status}`);
            if (request.integrity && request.integrity !== integrity(Buffer.from(await response.clone().arrayBuffer()))) {
              throw new TypeError('Integrity mismatch');
            }
            return [request.url, response];
          }));
          for (const [url, response] of responses) entries.set(url, response);
        },
        async match(key) { return entries.get(key)?.clone(); },
        async put(key, response) { entries.set(key, response); }
      };
    }
  };
  const context = vm.createContext({
    self: { registration: { scope }, clients: { async claim() { claimed = true; },
      async matchAll(options) {
        assert.equal(options.type, 'window'); assert.equal(options.includeUncontrolled, true);
        return clientLookup();
      } },
      async skipWaiting() { skippedWaiting = true; },
      addEventListener(type, handler) { handlers.set(type, handler); } },
    caches, URL, Request, Response, console, MessageChannel, crypto, setTimeout, clearTimeout,
    fetch: request => network(request)
  });
  vm.runInContext(script, context);
  const { name, prefix, urls } = vm.runInContext('({name: CACHE_NAME, prefix: CACHE_PREFIX, urls: [...FILE_URLS]})', context);
  return {
    scope, name, prefix, files: urls, stores, caches,
    get claimed() { return claimed; },
    get skippedWaiting() { return skippedWaiting; },
    setNetwork(fn) { network = fn; },
    setClients(value) { clients = value; },
    lookupClients(fn) { clientLookup = fn; },
    async message(data) {
      let work;
      handlers.get('message')({ data, waitUntil(promise) { work = promise; } });
      await work;
    },
    async lifecycle(type) {
      let work;
      handlers.get(type)({ waitUntil(promise) { work = promise; } });
      await work;
    },
    request(path, options) {
      let response;
      handlers.get('fetch')({
        request: new Request(new URL(path, scope), options),
        respondWith(promise) { response = promise; }
      });
      return response;
    }
  };
}

test('install metadata uses only Orbit Rush and local, correctly sized PNG icons', () => {
  assert.equal(manifest.name, 'Orbit Rush');
  assert.equal(manifest.short_name, 'Orbit Rush');
  assert.equal(manifest.id, './');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.theme_color, '#030511');
  assert.equal(manifest.background_color, '#030511');
  assert.match(html, /<title>Orbit Rush<\/title>/);
  assert.ok(!html.includes('SPACE ARCADE') && !html.includes('Space Arcade'));
  assert.match(html, /rel="manifest" href="\.\/manifest.webmanifest"/);
  assert.match(html, /name="apple-mobile-web-app-title" content="Orbit Rush"/);
  assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/);
  assert.match(html, /src="\.\/pwa.js" defer/);
  for (const size of ['192x192', '512x512']) {
    assert.ok(manifest.icons.some(icon => icon.sizes === size && icon.purpose === 'any'));
  }
  assert.ok(manifest.icons.some(icon => icon.sizes === '512x512' && icon.purpose === 'maskable'));
  const appleIcon = html.match(/rel="apple-touch-icon" sizes="([^"]+)" href="([^"]+)"/);
  for (const icon of [...manifest.icons, { sizes: appleIcon[1], src: appleIcon[2] }]) {
    const png = readFileSync(new URL(icon.src, root));
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
  }
  assert.match(read('.htaccess'), /AddType application\/manifest\+json \.webmanifest/);
});

test('registration is secure-context-only and failure never breaks gameplay', async () => {
  let load, registration, warning;
  const context = {
    window: { isSecureContext: true, location: { href: 'https://example.test/game/' }, addEventListener(event, callback) {
      if (event === 'load') load = callback;
    } },
    document: { addEventListener() {} },
    navigator: { serviceWorker: { addEventListener() {}, register(path, options) {
      registration = { path, options };
      return Promise.reject(new Error('storage blocked'));
    } } },
    URL, setTimeout, clearTimeout,
    console: { warn(...args) { warning = args; } }
  };
  vm.runInNewContext(read('pwa.js'), context);
  assert.equal(registration, undefined, 'Wait for page load');
  await load();
  assert.equal(registration.path, './sw.js');
  assert.equal(registration.options.updateViaCache, 'none');
  assert.match(warning[0], /offline setup failed/);
  load = undefined;
  context.window.isSecureContext = false;
  vm.runInNewContext(read('pwa.js'), context);
  assert.equal(load, undefined);
  context.window.isSecureContext = true;
  context.navigator = {};
  vm.runInNewContext(read('pwa.js'), context);
  assert.equal(load, undefined);
});

test('release contains every module, sound and install icon with verified offline bytes', async () => {
  const sw = worker();
  const paths = sw.files.map(url => url.slice(sw.scope.length));
  const imports = [...html.matchAll(/(?:from\s+|import\()['"](\.\/[^'"]+)['"]/g)]
    .map(match => match[1].slice(2).split('?')[0]);
  for (const file of [...imports, 'pwa.js', 'index.html', 'manifest.webmanifest',
    ...manifest.icons.map(icon => icon.src), 'assets/icons/apple-touch-icon.png',
    ...readdirSync(new URL('assets/audio/', root)).map(file => `assets/audio/${file}`)]) {
    assert.ok(paths.includes(file), `Offline asset missing: ${file}`);
    assert.equal(release.integrity[file], integrity(bodies.get(file)));
  }
  await sw.lifecycle('install');
  assert.equal(sw.stores.get(sw.name).size, sw.files.length);
  sw.setNetwork(() => { throw new TypeError('offline'); });
  for (const url of sw.files) assert.equal((await sw.request(url + '?v=offline-test')).status, 200);
  assert.equal(await (await sw.request('./?source=homescreen')).text(), html);
  assert.equal(await (await sw.request('index.html?test')).text(), html);
});

test('an interrupted upgrade preserves the complete active release online and offline', async () => {
  const old = worker();
  await old.lifecycle('install');
  const changes = { 'index.html': '<title>Next release</title>', 'touch-controls.js': 'export function nextControls() {}' };
  const next = worker({ script: nextRelease(changes), stores: old.stores });
  next.setNetwork(request => request.url.endsWith('touch-controls.js')
    ? new Response('unavailable', { status: 503 }) : responseFor(next.scope, request, changes));
  await assert.rejects(next.lifecycle('install'), /503/);
  assert.equal(old.stores.has(next.name), false, 'Remove the failed staging cache, not the active snapshot');
  assert.equal(old.stores.get(old.name).size, old.files.length);
  old.setNetwork(request => responseFor(old.scope, request, changes));
  assert.equal(await (await old.request('./')).text(), html, 'Online navigation still gets the previous matching HTML');
  old.setNetwork(() => { throw new TypeError('offline'); });
  assert.equal(await (await old.request('./')).text(), html);
  assert.equal(await (await old.request('touch-controls.js?v=8')).text(), bodies.get('touch-controls.js').toString());
  assert.equal(next.skippedWaiting, false);
  assert.equal(next.claimed, false);
});

test('HTTP 200 with stale bytes also rejects the release instead of mixing an upload', async () => {
  const old = worker();
  await old.lifecycle('install');
  const next = worker({ script: nextRelease({ 'touch-controls.js': 'new module' }), stores: old.stores });
  // The default server returns current/old bytes despite the new integrity hash.
  await assert.rejects(next.lifecycle('install'), /Integrity mismatch/);
  assert.deepEqual(await old.caches.keys(), [old.name]);
  assert.equal(await (await old.request('./')).text(), html);
});

test('a complete update waits, then switches HTML and modules together on activation', async () => {
  const old = worker();
  await old.lifecycle('install');
  const changes = { 'index.html': '<title>Next release</title>', 'touch-controls.js': 'new module' };
  const next = worker({ script: nextRelease(changes), stores: old.stores });
  next.setNetwork(request => responseFor(next.scope, request, changes));
  await next.lifecycle('install');
  assert.equal(next.skippedWaiting, false, 'Installation alone never forces a running game onto a different worker');
  assert.equal(await (await old.request('./')).text(), html);
  assert.equal(await (await old.request('touch-controls.js?v=8')).text(), bodies.get('touch-controls.js').toString());
  await next.lifecycle('activate');
  assert.equal(next.claimed, false, 'Do not take over an uncontrolled page that loaded older HTML');
  assert.deepEqual(await next.caches.keys(), [next.name]);
  next.setNetwork(() => { throw new TypeError('offline'); });
  assert.equal(await (await next.request('./')).text(), changes['index.html']);
  assert.equal(await (await next.request('touch-controls.js?v=next')).text(), changes['touch-controls.js']);
});

test('migration from the original network-first worker tolerates its cached legacy module', async () => {
  const old = worker({ script: read('tests/fixtures/sw-v1.js') });
  const legacyModule = read('tests/fixtures/touch-controls-v5.js');
  old.setNetwork(request => responseFor(old.scope, request, { 'index.html': 'previous HTML', 'touch-controls.js': legacyModule }));
  await old.lifecycle('install');
  // v1 cannot be changed in place: it may return new HTML and cached old JS once.
  old.setNetwork(request => request.url.includes('touch-controls.js')
    ? new Response('unavailable', { status: 503 }) : responseFor(old.scope, request));
  assert.equal(await (await old.request('./')).text(), html);
  assert.equal(await (await old.request('touch-controls.js?v=8')).text(), legacyModule);
  const importedNames = html.match(/import \{ ([^}]+) \} from '\.\/touch-controls\.js/)[1].split(',').map(name => name.trim());
  for (const name of importedNames) assert.equal(typeof legacyTouch[name], 'function', `Legacy module must still provide ${name}`);
  assert.ok(html.includes('function bindTouchButtons('), 'New helper travels with the HTML, not the cached legacy module');
  const next = worker({ stores: old.stores });
  next.setNetwork(request => request.url.includes('touch-controls.js')
    ? new Response('unavailable', { status: 503 }) : responseFor(next.scope, request));
  await assert.rejects(next.lifecycle('install'), /503/);
  old.setNetwork(() => { throw new TypeError('offline'); });
  assert.equal(await (await old.request('./')).text(), html);
  assert.equal(await (await old.request('touch-controls.js?v=8')).text(), legacyModule);
  assert.equal(old.stores.has(old.name), true);
});

test('an evicted file never falls back to a potentially incompatible network module', async () => {
  const sw = worker();
  await sw.lifecycle('install');
  sw.stores.get(sw.name).delete(sw.scope + 'touch-controls.js');
  sw.setNetwork(() => { throw new Error('Must not fetch individual replacement files'); });
  assert.equal((await sw.request('touch-controls.js?v=8')).type, 'error');
});

test('only known local GETs are served and production cleanup is scope-specific', async () => {
  const sw = worker();
  for (const path of ['missing.html', '../index.html', 'https://other.test/audio.js', 'sw.js']) assert.equal(sw.request(path), undefined);
  assert.equal(sw.request('audio.js', { method: 'POST' }), undefined);
  assert.equal(sw.request('audio.js', { headers: { range: 'bytes=0-99' } }), undefined);
  await sw.lifecycle('install');
  await sw.caches.open(sw.prefix + 'v1');
  await sw.caches.open('another-app');
  await sw.caches.open('orbit-rush:https://example.test/other/:v1');
  await sw.lifecycle('activate');
  assert.equal(sw.claimed, false);
  assert.deepEqual(await sw.caches.keys(), [sw.name, 'another-app', 'orbit-rush:https://example.test/other/:v1']);
});

test('the source worker keeps local development fresh and removes only its own old caches', async () => {
  const sw = worker({ script: developmentSource });
  await sw.caches.open(sw.prefix + 'v1');
  await sw.caches.open('another-app');
  await sw.lifecycle('install');
  await sw.lifecycle('activate');
  assert.equal(sw.skippedWaiting, true);
  assert.equal(sw.claimed, true);
  assert.deepEqual(await sw.caches.keys(), ['another-app']);
  assert.equal(sw.request('./'), undefined);
  assert.equal(sw.request('touch-controls.js?v=8'), undefined);
});

function gameClient(sw, id, ready = true) {
  return { id, url: sw.scope, ready, messages: [], postMessage(message, ports = []) {
    this.messages.push(message);
    if (message.type === 'orbit:prepare-update') {
      if (this.ready !== null) ports[0].postMessage({ ready: this.ready });
      ports[0].close();
    }
  } };
}

test('a verified update switches only when every game window has saved and locked its safe point', async () => {
  const sw = worker(); await sw.lifecycle('install');
  const home = gameClient(sw, 'home'), flying = gameClient(sw, 'flying', false);
  sw.setClients([home, flying]);
  await Promise.all([sw.message({ type: 'orbit:check-update' }), sw.message({ type: 'orbit:check-update' })]);
  assert.equal(sw.skippedWaiting, false);
  assert.deepEqual(home.messages.map(message => message.type), ['orbit:prepare-update', 'orbit:cancel-update'],
    'Concurrent requests share a single attempt; a busy flight releases other windows');
  assert.equal(home.messages[0].id, home.messages[1].id);
  flying.ready = true;
  await sw.message({ type: 'orbit:check-update' });
  assert.equal(sw.skippedWaiting, true);
  assert.equal(home.messages.at(-1).type, 'orbit:prepare-update');
  assert.notEqual(home.messages[0].id, home.messages.at(-1).id, 'Retries cannot unlock an unrelated attempt');
});

test('old or unresponsive windows defer activation without hanging the other windows', async () => {
  const sw = worker(); await sw.lifecycle('install');
  const home = gameClient(sw, 'home'), old = gameClient(sw, 'old', null);
  sw.setClients([home, old]);
  await sw.message({ type: 'orbit:check-update' });
  assert.equal(sw.skippedWaiting, false);
  assert.equal(home.messages.at(-1).type, 'orbit:cancel-update');
  sw.setClients([home]);
  await sw.message({ type: 'orbit:check-update' });
  assert.equal(sw.skippedWaiting, true, 'Closing the incompatible window allows the next safe-point attempt');
});

test('new windows veto an in-flight update check, closed windows and other app scopes do not', async () => {
  for (const change of ['opened', 'closed', 'other-scope']) {
    const sw = worker(); await sw.lifecycle('install');
    const home = gameClient(sw, 'home'), other = gameClient(sw, 'other', false);
    let lookups = 0;
    if (change === 'other-scope') other.url = 'https://example.test/another-game/';
    sw.lookupClients(() => {
      lookups++;
      return change === 'opened' ? (lookups === 1 ? [home] : [home, other])
        : change === 'closed' ? (lookups === 1 ? [home, other] : [home]) : [home, other];
    });
    await sw.message({ type: 'orbit:check-update' });
    assert.equal(sw.skippedWaiting, change !== 'opened', change);
    if (change === 'opened') assert.equal(home.messages.at(-1).type, 'orbit:cancel-update');
    if (change === 'other-scope') assert.equal(other.messages.length, 0);
  }
});

test('deployment fingerprints change with assets or worker code, and publish the worker last', () => {
  const directory = mkdtempSync(join(tmpdir(), 'orbit-pwa-release-'));
  try {
    for (const file of [...files, 'sw.js', 'scripts/prepare-pwa.py']) {
      const target = join(directory, file);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(new URL(file, root), target);
    }
    const generate = () => execFileSync('python3', [join(directory, 'scripts/prepare-pwa.py')], { encoding: 'utf8' });
    assert.equal(generate(), preparedSource, 'Identical bytes produce identical releases');
    writeFileSync(join(directory, 'i18n.js'), 'changed translations');
    const changed = generate();
    assert.notEqual(changed, preparedSource);
    const changedRelease = JSON.parse(changed.match(/^const RELEASE = (.+);$/m)[1]);
    assert.notEqual(changedRelease.id, release.id);
    assert.equal(changedRelease.integrity['i18n.js'], integrity('changed translations'));
    writeFileSync(join(directory, 'sw.js'), developmentSource + '\n// strategy changed\n');
    assert.notEqual(generate(), changed, 'Worker code changes also create a new snapshot');
    rmSync(join(directory, 'i18n.js'));
    const failed = spawnSync('python3', [join(directory, 'scripts/prepare-pwa.py')], { encoding: 'utf8' });
    assert.equal(failed.status, 1);
    assert.equal(failed.stdout, '', 'A missing file cannot produce a partially prepared worker');
  } finally { rmSync(directory, { recursive: true, force: true }); }
  const deploy = read('scripts/deploy.sh');
  const prepare = deploy.indexOf('python3 scripts/prepare-pwa.py');
  const upload = deploy.indexOf('rsync -rtvz');
  const entry = deploy.indexOf('index.html "$host:$target/"');
  const workerUpload = deploy.indexOf('"$temporary/sw.js" "$host:$target/sw.js"');
  assert.ok(prepare > 0 && upload > prepare && entry > upload && workerUpload > entry);
});
