// Bump this version when changing the offline file list or cache strategy.
// Online requests always refresh the cache, so ordinary game edits need no build step.
const CACHE_PREFIX = `orbit-rush:${self.registration.scope}:`;
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const FILES = [
  'index.html',
  'pwa.js',
  'manifest.webmanifest',
  'audio.js',
  'i18n.js',
  'touch-controls.js',
  'render-diagnostics.js',
  'CREDITS.md',
  'assets/vendor/three.module.js',
  'assets/vendor/THREE-LICENSE.txt',
  'assets/vendor/PHOSPHOR-LICENSE.txt',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/icon-maskable-512.png',
  'assets/icons/apple-touch-icon.png',
  'assets/audio/laser-soft.mp3',
  'assets/audio/empty-click.wav',
  'assets/audio/lock-on.wav',
  'assets/audio/shield-hard.wav',
  'assets/audio/impact-1.mp3',
  'assets/audio/impact-2.mp3',
  'assets/audio/impact-3.mp3',
  'assets/audio/blast-1.mp3',
  'assets/audio/blast-2.mp3',
  'assets/audio/blast-3.mp3',
  'assets/audio/go-bing.wav',
  'assets/audio/checkpoint-pass.wav',
  'assets/audio/checkpoint-miss.wav',
  'assets/audio/reward.wav',
  'assets/audio/orbit-arcade.mp3',
  'assets/audio/warning-low.wav',
  'assets/audio/KENNEY-LICENSE.txt',
  'assets/audio/MUSIC-LICENSE.txt'
];
const FILE_URLS = new Set(FILES.map(file => new URL(file, self.registration.scope).href));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache =>
    cache.addAll([...FILE_URLS].map(url => new Request(url, { cache: 'reload' })))
  ));
  // Let an existing game finish before replacing its worker; never force a reload.
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function networkFirst(request, key) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.status >= 500) {
      const cached = await cache.match(key);
      if (cached) return cached;
    }
    if (response.status === 200) {
      // Storage limits must not prevent a successful online load.
      try { await cache.put(key, response.clone()); }
      catch (error) { console.warn('Orbit Rush cache refresh failed:', error); }
    }
    return response;
  } catch (error) {
    const cached = await cache.match(key);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || request.headers.has('range')) return;

  const url = new URL(request.url);
  // Modules/audio use version queries; normalize only the known local game files.
  url.search = '';
  if (url.href === self.registration.scope) url.pathname += 'index.html';
  if (!FILE_URLS.has(url.href)) return;

  event.respondWith(networkFirst(request, url.href));
});
