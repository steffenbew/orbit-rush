import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('index.html');
const manifest = JSON.parse(read('manifest.webmanifest'));

function worker(scope = 'https://example.test/games/orbit-rush/') {
  const handlers = new Map(), stores = new Map();
  let network = async () => new Response('fresh');
  let claimed = false;
  const caches = {
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        async addAll(requests) {
          // Like Cache.addAll, fail before writing anything if a required file is missing.
          const files = requests.map(request => {
            assert.equal(request.cache, 'reload');
            return [request.url, new Response(readFileSync(new URL(request.url.slice(scope.length), root)))];
          });
          for (const [url, response] of files) entries.set(url, response);
        },
        async match(key) { return entries.get(key)?.clone(); },
        async put(key, response) { entries.set(key, response); }
      };
    }
  };
  const context = vm.createContext({
    self: { registration: { scope }, clients: { async claim() { claimed = true; } },
      addEventListener(type, handler) { handlers.set(type, handler); } },
    caches, URL, Request, console,
    fetch: request => network(request)
  });
  vm.runInContext(read('sw.js'), context);
  const { name, prefix, files } = vm.runInContext('({name: CACHE_NAME, prefix: CACHE_PREFIX, files: [...FILE_URLS]})', context);
  return {
    scope, name, prefix, files, stores, caches,
    get claimed() { return claimed; },
    setNetwork(fn) { network = fn; },
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
  const deploy = read('scripts/deploy.sh');
  for (const file of ['pwa.js', 'sw.js', 'manifest.webmanifest', 'assets']) assert.ok(deploy.includes(file));
  assert.match(read('.htaccess'), /AddType application\/manifest\+json \.webmanifest/);
});

test('registration is secure-context-only and failure never breaks gameplay', async () => {
  let load, registration, warning;
  const context = {
    window: { isSecureContext: true, addEventListener(event, callback) {
      assert.equal(event, 'load'); load = callback;
    } },
    navigator: { serviceWorker: { register(path, options) {
      registration = { path, options };
      return Promise.reject(new Error('storage blocked'));
    } } },
    console: { warn(...args) { warning = args; } }
  };
  vm.runInNewContext(read('pwa.js'), context);
  assert.equal(registration, undefined, 'Wait for page load');
  load();
  await Promise.resolve();
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

test('precache includes every module, sound and install icon before first play', async () => {
  const sw = worker();
  const paths = sw.files.map(url => url.slice(sw.scope.length));
  const imports = [...html.matchAll(/(?:from\s+|import\()['"](\.\/[^'"]+)['"]/g)]
    .map(match => match[1].slice(2).split('?')[0]);
  for (const file of [...imports, 'pwa.js', 'index.html', 'manifest.webmanifest',
    ...manifest.icons.map(icon => icon.src), 'assets/icons/apple-touch-icon.png',
    ...readdirSync(new URL('assets/audio/', root)).map(file => `assets/audio/${file}`)]) {
    assert.ok(paths.includes(file), `Offline asset missing: ${file}`);
  }
  await sw.lifecycle('install');
  assert.equal(sw.stores.get(sw.name).size, sw.files.length);
  sw.setNetwork(() => { throw new TypeError('offline'); });
  for (const url of sw.files) assert.equal((await sw.request(url + '?v=offline-test')).status, 200);
  assert.equal(await (await sw.request('./?source=homescreen')).text(), html);
  assert.equal(await (await sw.request('index.html?test')).text(), html);
});

test('network-first refreshes canonical cache keys; offline and server errors fall back', async () => {
  const sw = worker();
  await sw.lifecycle('install');
  sw.setNetwork(request => {
    assert.equal(request.url, sw.scope + 'i18n.js?v=next');
    return new Response('new translations');
  });
  assert.equal(await (await sw.request('i18n.js?v=next')).text(), 'new translations');
  sw.setNetwork(() => { throw new TypeError('offline'); });
  assert.equal(await (await sw.request('i18n.js?v=next')).text(), 'new translations');
  sw.setNetwork(() => new Response('maintenance', { status: 503 }));
  assert.equal(await (await sw.request('i18n.js')).text(), 'new translations');
  sw.setNetwork(() => new Response('missing', { status: 404 }));
  assert.equal((await sw.request('i18n.js')).status, 404, 'Do not hide missing files');
  sw.setNetwork(() => { throw new TypeError('offline'); });
  assert.equal(await (await sw.request('i18n.js')).text(), 'new translations', 'Never cache error pages');
  sw.stores.get(sw.name).delete(sw.scope + 'i18n.js');
  await assert.rejects(sw.request('i18n.js'), /offline/);
});

test('only known local GET requests are intercepted and cleanup is scope-specific', async () => {
  const sw = worker();
  for (const path of ['missing.html', '../index.html', 'https://other.test/audio.js', 'sw.js']) {
    assert.equal(sw.request(path), undefined);
  }
  assert.equal(sw.request('audio.js', { method: 'POST' }), undefined);
  assert.equal(sw.request('audio.js', { headers: { range: 'bytes=0-99' } }), undefined);
  await sw.lifecycle('install');
  await sw.caches.open(sw.prefix + 'v0');
  await sw.caches.open('another-app');
  await sw.caches.open('orbit-rush:https://example.test/other/:v1');
  await sw.lifecycle('activate');
  assert.equal(sw.claimed, true);
  assert.deepEqual(await sw.caches.keys(), [
    sw.name, 'another-app', 'orbit-rush:https://example.test/other/:v1'
  ]);
});
