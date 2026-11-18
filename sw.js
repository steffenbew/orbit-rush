// The build embeds the verified snapshot. The source worker passes requests through.
const RELEASE = null;
const CACHE_PREFIX = `orbit-rush:${self.registration.scope}:`;
const CACHE_NAME = RELEASE ? `${CACHE_PREFIX}${RELEASE.id}` : null;
const FILES = Object.keys(RELEASE?.integrity || {});
const FILE_URLS = new Set(FILES.map(file => new URL(file, self.registration.scope).href));

self.addEventListener('install', event => {
  if (!RELEASE) {
    // Only development takes over immediately; there is no offline snapshot here.
    event.waitUntil(self.skipWaiting());
    return;
  }
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      // Cache.addAll commits the batch only when every fetch succeeds. Integrity
      // rejects stale files and mixed uploads even when the server returns 200.
      await cache.addAll(FILES.map(file => new Request(new URL(file, self.registration.scope), {
        // Reuse immutable HTTP-cache entries; SRI still checks the bytes. Re-fetch mutable URLs.
        cache: file.startsWith('assets/') ? 'force-cache' : 'reload', integrity: RELEASE.integrity[file]
      })));
    } catch (error) {
      await caches.delete(CACHE_NAME);
      throw error;
    }
  })());
  // Only the all-window safe-point handshake below may replace an active release.
});

let updateCheck = null;
function gameWindows() {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then(clients => clients.filter(client => client.url.startsWith(self.registration.scope)));
}
function prepareWindow(client, id) {
  return new Promise(resolve => {
    const channel = new MessageChannel();
    const finish = ready => {
      clearTimeout(timer); channel.port1.close(); resolve(ready);
    };
    const timer = setTimeout(() => finish(false), 1000);
    channel.port1.onmessage = event => finish(event.data?.ready === true);
    try { client.postMessage({ type: 'orbit:prepare-update', id }, [channel.port2]); }
    catch { channel.port2.close(); finish(false); }
  });
}
async function activateWhenSafe() {
  const id = crypto.randomUUID(), deadline = Date.now() + 2000;
  const clients = await gameWindows();
  let committed = false;
  try {
    const ready = await Promise.all(clients.map(client => prepareWindow(client, id)));
    const approved = new Set(clients.filter((_, index) => ready[index]).map(client => client.id));
    // A new/unresponsive/old-version window blocks the update. Closed windows no longer veto it.
    const current = await gameWindows();
    if (Date.now() >= deadline || current.some(client => !approved.has(client.id))) return;
    await self.skipWaiting();
    committed = true;
  } finally {
    if (!committed) for (const client of clients) {
      try { client.postMessage({ type: 'orbit:cancel-update', id }); } catch {}
    }
  }
}
self.addEventListener('message', event => {
  if (!RELEASE || event.data?.type !== 'orbit:check-update') return;
  if (!updateCheck) updateCheck = activateWhenSafe().finally(() => { updateCheck = null; });
  event.waitUntil(updateCheck);
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    // Do not attach a production snapshot to a page that loaded different HTML.
    // A newly installed worker starts serving the app on the next navigation.
    if (!RELEASE) await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (!RELEASE || request.method !== 'GET' || request.headers.has('range')) return;

  const url = new URL(request.url);
  // Query variants are safe within one immutable, fully verified release.
  url.search = '';
  if (url.href === self.registration.scope) url.pathname += 'index.html';
  if (!FILE_URLS.has(url.href)) return;

  // Never replace individual files or fall back to another release's network
  // resources. A missing/evicted snapshot must fail rather than mix versions.
  event.respondWith(caches.open(CACHE_NAME).then(async cache =>
    (await cache.match(url.href)) || Response.error()
  ));
});
