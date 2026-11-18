import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
// Exercise the actual static builds; never write into the developer's dist/.
const directory = mkdtempSync(join(tmpdir(), 'orbit release '));
after(() => rmSync(directory, { recursive: true, force: true }));
mkdirSync(join(directory, 'scripts'));
symlinkSync(new URL('node_modules/', root), join(directory, 'node_modules'), 'dir');
for (const file of ['src', 'assets', 'public', 'scripts/build.mjs', 'sw.js', '.htaccess', 'index.html']) {
  cpSync(new URL(file, root), join(directory, file), { recursive: true });
}
const developmentSource = read('sw.js');
const integrity = body => 'sha256-' + createHash('sha256').update(body).digest('base64');
function build() {
  execFileSync(process.execPath, [join(directory, 'scripts/build.mjs')]);
  const dist = join(directory, 'dist');
  const script = readFileSync(join(dist, 'sw.js'), 'utf8');
  const release = JSON.parse(script.match(/^const RELEASE = (.+);$/m)[1]);
  const bodies = new Map(Object.keys(release.integrity).map(path => [path, readFileSync(join(dist, path))]));
  const html = bodies.get('index.html').toString();
  const [, entry] = html.match(/<script type="module"[^>]*src="\.\/([^"]+)"/);
  const [, css] = html.match(/<link rel="stylesheet"[^>]*href="\.\/([^"]+)"/);
  return { script, release, bodies, entry, css };
}
const first = build();
const finderFiles = ['.DS_Store', 'icons/.DS_Store'];
for (const path of finderFiles) writeFileSync(join(directory, 'public', path), 'local Finder metadata');
const repeat = build();
writeFileSync(join(directory, 'src/presentation/game.css'), '\n:root { --orbit-css-update: 1; }\n', { flag: 'a' });
const second = build();
const { script: preparedSource, release, bodies } = first;
const html = bodies.get('index.html').toString();
const manifest = JSON.parse(bodies.get('manifest.webmanifest'));
const music = [...bodies.keys()].find(path => /^assets\/orbit-arcade-.*\.mp3$/.test(path));
function responseFor(scope, request, overrides = {}, files = bodies) {
  const path = new URL(request.url).pathname.slice(new URL(scope).pathname.length) || 'index.html';
  const body = Object.hasOwn(overrides, path) ? overrides[path] : files.get(path);
  return body === undefined ? new Response('missing', { status: 404 }) : new Response(body);
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
            const hashed = /^assets\/[^/]+-[\w-]{8}\.[^/]+$/.test(request.url.slice(scope.length));
            assert.equal(request.cache, hashed ? 'force-cache' : 'reload');
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
  assert.match(first.entry, /^assets\/.*\.js$/);
  for (const size of ['192x192', '512x512']) {
    assert.ok(manifest.icons.some(icon => icon.sizes === size && icon.purpose === 'any'));
  }
  assert.ok(manifest.icons.some(icon => icon.sizes === '512x512' && icon.purpose === 'maskable'));
  const appleIcon = html.match(/rel="apple-touch-icon" sizes="([^"]+)" href="([^"]+)"/);
  for (const icon of [...manifest.icons, { sizes: appleIcon[1], src: appleIcon[2] }]) {
    const png = bodies.get(icon.src.replace(/^\.\//, ''));
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
  const registrar = read('src/platform/pwa.js');
  vm.runInNewContext(registrar, context);
  assert.equal(registration, undefined, 'Wait for page load');
  await load();
  assert.equal(registration.path, './sw.js');
  assert.equal(registration.options.updateViaCache, 'none');
  assert.match(warning[0], /offline setup failed/);
  load = undefined;
  context.window.isSecureContext = false;
  vm.runInNewContext(registrar, context);
  assert.equal(load, undefined);
  context.window.isSecureContext = true;
  context.navigator = {};
  vm.runInNewContext(registrar, context);
  assert.equal(load, undefined);
});

test('emitted gameplay chunks, sounds, licenses and icons are available offline', async () => {
  const sw = worker();
  const paths = [...bodies.keys()];
  assert.ok(paths.includes(first.entry) && paths.includes(first.css));
  for (const file of readdirSync(new URL('assets/audio/', root)).filter(name => name !== '.DS_Store')) {
    const [name, extension] = file.split('.');
    assert.ok(paths.some(path => path.startsWith('assets/' + name + '-') && path.endsWith('.' + extension)), file);
  }
  for (const file of [...manifest.icons.map(icon => icon.src), 'icons/apple-touch-icon.png',
    ...readdirSync(new URL('public/licenses/', root)).filter(name => name !== '.DS_Store').map(name => 'licenses/' + name)]) assert.ok(paths.includes(file), file);
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
  const next = worker({ script: second.script, stores: old.stores });
  next.setNetwork(request => request.url.endsWith(second.css)
    ? new Response('unavailable', { status: 503 }) : responseFor(next.scope, request, {}, second.bodies));
  await assert.rejects(next.lifecycle('install'), /503/);
  assert.equal(old.stores.has(next.name), false);
  assert.equal(old.stores.get(old.name).size, old.files.length);
  old.setNetwork(() => { throw new TypeError('offline'); });
  assert.equal(await (await old.request('./')).text(), html);
  assert.equal(await (await old.request(first.css)).text(), bodies.get(first.css).toString());
  assert.equal(next.skippedWaiting, false);
  assert.equal(next.claimed, false);
});

test('HTTP 200 with stale bytes rejects the release instead of mixing an upload', async () => {
  const old = worker(); await old.lifecycle('install');
  const next = worker({ script: second.script, stores: old.stores });
  next.setNetwork(request => responseFor(next.scope, request, { 'index.html': html }, second.bodies));
  await assert.rejects(next.lifecycle('install'), /Integrity mismatch/);
  assert.deepEqual(await old.caches.keys(), [old.name]);
  assert.equal(await (await old.request('./')).text(), html);
});

test('a corrupt immutable response rejects the update even with HTTP cache reuse', async () => {
  const old = worker(); await old.lifecycle('install');
  const next = worker({ script: second.script, stores: old.stores });
  next.setNetwork(request => responseFor(next.scope, request, { [music]: 'incorrect cached bytes' }, second.bodies));
  await assert.rejects(next.lifecycle('install'), /Integrity mismatch/);
  assert.deepEqual(await old.caches.keys(), [old.name]);
});

test('a complete update waits, then switches HTML and modules together on activation', async () => {
  const old = worker(); await old.lifecycle('install');
  const next = worker({ script: second.script, stores: old.stores });
  next.setNetwork(request => responseFor(next.scope, request, {}, second.bodies));
  await next.lifecycle('install');
  assert.equal(next.skippedWaiting, false);
  assert.equal(await (await old.request('./')).text(), html);
  await next.lifecycle('activate');
  assert.equal(next.claimed, false);
  assert.deepEqual(await next.caches.keys(), [next.name]);
  next.setNetwork(() => { throw new TypeError('offline'); });
  assert.equal(await (await next.request('./')).text(), second.bodies.get('index.html').toString());
  const path = second.css;
  assert.equal(await (await next.request(path)).text(), second.bodies.get(path).toString());
});

test('legacy clients never resolve the new entry or controls from their old root-module cache', async () => {
  const old = worker({ script: read('tests/fixtures/sw-v1.js') });
  const legacyModule = read('tests/fixtures/touch-controls-v5.js');
  // Existing deployments keep the historical root modules (deploy never deletes).
  const previous = Object.fromEntries(['audio', 'i18n', 'pwa', 'render-diagnostics'].map(name => [name + '.js', 'legacy ' + name]));
  for (const path of old.files.map(url => url.slice(old.scope.length))) {
    if (path.startsWith('assets/')) previous[path] = 'legacy fixture bytes';
  }
  previous['touch-controls.js'] = legacyModule;
  previous['index.html'] = 'previous HTML';
  old.setNetwork(request => responseFor(old.scope, request, previous));
  await old.lifecycle('install');
  old.setNetwork(request => request.url.includes('touch-controls.js')
    ? new Response('unavailable', { status: 503 }) : responseFor(old.scope, request));
  assert.equal(await (await old.request('./')).text(), html);
  assert.equal(await (await old.request('touch-controls.js?v=8')).text(), legacyModule);
  for (const file of [first.entry, first.css, music]) {
    assert.equal(old.request(file), undefined, 'The legacy worker passes new URLs through');
  }
  const next = worker({ stores: old.stores });
  next.setNetwork(request => request.url.endsWith(first.entry)
    ? new Response('unavailable', { status: 503 }) : responseFor(next.scope, request));
  await assert.rejects(next.lifecycle('install'), /503/);
  assert.equal(old.stores.has(old.name), true);
  next.setNetwork(request => responseFor(next.scope, request));
  await next.lifecycle('install');
  await next.lifecycle('activate');
  next.setNetwork(() => { throw new TypeError('offline'); });
  assert.equal(await (await next.request(first.entry)).text(), bodies.get(first.entry).toString());
});

test('an evicted file never falls back to a potentially incompatible network module', async () => {
  const sw = worker();
  await sw.lifecycle('install');
  sw.stores.get(sw.name).delete(sw.scope + first.entry);
  sw.setNetwork(() => { throw new Error('Must not fetch individual replacement files'); });
  assert.equal((await sw.request(first.entry)).type, 'error');
});

test('only known local GETs are served and production cleanup is scope-specific', async () => {
  const sw = worker();
  for (const path of ['missing.html', '../index.html', 'https://other.test/audio.js', 'sw.js']) assert.equal(sw.request(path), undefined);
  assert.equal(sw.request(music, { method: 'POST' }), undefined);
  assert.equal(sw.request(music, { headers: { range: 'bytes=0-99' } }), undefined);
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
  assert.equal(sw.request('src/platform/touch-controls.js?v=8'), undefined);
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

test('old or unresponsive windows defer activation without hanging the other windows', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const sw = worker(); await sw.lifecycle('install');
  const home = gameClient(sw, 'home'), old = gameClient(sw, 'old', null);
  sw.setClients([home, old]);
  const pending = sw.message({ type: 'orbit:check-update' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(old.messages.at(-1).type, 'orbit:prepare-update');
  t.mock.timers.tick(1000);
  await pending;
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

test('Finder metadata stays out of dist and the offline integrity manifest', () => {
  for (const path of finderFiles) {
    assert.equal(existsSync(join(directory, 'dist', path)), false, path);
    assert.equal(Object.hasOwn(repeat.release.integrity, path), false, path);
  }
});

test('build is reproducible, self-contained and detects changes to assets and worker code', () => {
  assert.equal(first.script, repeat.script);
  assert.notEqual(first.release.id, second.release.id);
  assert.notEqual(first.css, second.css);
  assert.match(second.bodies.get(second.css).toString(), /--orbit-css-update/);
  assert.ok(music && second.bodies.has(music), 'Unchanged audio keeps its immutable URL');
  const engine = [...first.bodies.keys()].filter(path => path.startsWith('assets/three.module-'));
  assert.ok(engine.length && engine.every(path => second.bodies.has(path)), 'Unchanged engine keeps its URLs');
  assert.deepEqual(readdirSync(join(directory, 'dist')).sort(), ['.htaccess', 'CREDITS.md', 'assets', 'icons', 'index.html', 'licenses', 'manifest.webmanifest', 'sw.js']);
  assert.ok(!second.bodies.has(first.css), 'A fresh build does not precache obsolete chunks');
  for (const [path, bytes] of second.bodies) assert.equal(second.release.integrity[path], integrity(bytes));
  writeFileSync(join(directory, 'sw.js'), developmentSource + '\n// strategy changed\n');
  assert.notEqual(build().release.id, second.release.id);
  const deploy = read('scripts/deploy.sh');
  const stages = ['node scripts/build.mjs', 'cd dist', 'upload assets .htaccess', 'upload icons licenses manifest.webmanifest', 'upload index.html', 'upload sw.js'];
  let previous = -1;
  for (const stage of stages) {
    assert.ok(deploy.indexOf(stage) > previous, stage);
    previous = deploy.indexOf(stage);
  }
});
