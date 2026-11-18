// Exercise the public commands in isolated checkouts, never the real local server.
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { after, test } from 'node:test';

const directory = mkdtempSync(join(tmpdir(), 'orbit server '));
symlinkSync(new URL('../node_modules/', import.meta.url), join(directory, 'node_modules'), 'dir');
const children = new Set();
after(() => {
  for (const child of children) child.kill();
  rmSync(directory, { recursive: true, force: true });
});
function checkout(name) {
  const root = join(directory, name);
  for (const path of ['scripts', 'src/presentation', 'dist/assets']) mkdirSync(join(root, path), { recursive: true });
  for (const path of ['run', 'scripts/dev-server.mjs']) copyFileSync(new URL('../' + path, import.meta.url), join(root, path));
  writeFileSync(join(root, 'index.html'), '<head><link rel="stylesheet" href="/src/presentation/game.css"></head><script type="module" src="/src/module.js"></script>');
  writeFileSync(join(root, 'src/presentation/game.css'), 'body { color: red; }');
  writeFileSync(join(root, 'src/module.js'), 'export const n = 1;');
  writeFileSync(join(root, 'dist/index.html'), 'Built');
  writeFileSync(join(root, 'dist/assets/module-a1b2c3d4.js'), 'export const n = 2;');
  return root;
}
const command = (root, arg, port = '') => promisify(execFile)(join(root, 'run'), [arg], { env: { ...process.env, PORT: port }, timeout: 5000 });
async function launch(root, mode, port = '') {
  const child = spawn(join(root, 'run'), [mode], { env: { ...process.env, PORT: port }, stdio: ['ignore', 'pipe', 'pipe'] });
  children.add(child);
  const exit = once(child, 'exit').then(([code, signal]) => { children.delete(child); return { code, signal }; });
  const first = await Promise.race([once(child.stdout, 'data').then(([data]) => String(data)), exit.then(x => { throw Error('Exited before ready: ' + JSON.stringify(x)); })]);
  return { child, exit, url: first.match(/http:\/\/localhost:\d+/)[0] };
}

test('source and preview serve the right files and stop independently across checkouts', async () => {
  const a = checkout('source'), b = checkout('release');
  const source = await launch(a, 'dev'), preview = await launch(b, 'preview');
  assert.notEqual(source.url, preview.url);
  assert.ok((await command(a, 'start')).stdout.includes(source.url));
  const module = await fetch(source.url + '/src/module.js?v=ignored');
  assert.match(module.headers.get('content-type'), /javascript/);
  assert.match(await module.text(), /export const n = 1;/);
  assert.match(await (await fetch(source.url)).text(), /\/@vite\/client/);
  assert.ok(!(await fetch(source.url + '/scripts/dev-server.mjs')).ok);
  assert.equal((await fetch(source.url + '/.run/')).status, 404);
  assert.equal(await (await fetch(preview.url)).text(), 'Built');
  assert.equal((await fetch(preview.url)).headers.get('cache-control'), 'no-cache');
  assert.match((await fetch(preview.url + '/assets/module-a1b2c3d4.js')).headers.get('cache-control'), /immutable/);
  await command(a, 'stop', '65535'); assert.equal((await source.exit).code, 0);
  assert.equal((await fetch(preview.url)).status, 200);
  preview.child.kill('SIGINT'); assert.equal((await preview.exit).code, 0);
  assert.match((await command(a, 'stop')).stdout, /No Node server/);
});

test('explicit ports fail on collision, bad ports fail, a killed server can restart', async () => {
  const root = checkout('ports');
  const occupied = createServer().listen(0, '127.0.0.1'); await once(occupied, 'listening');
  const port = String(occupied.address().port);
  try { await assert.rejects(command(root, 'start', port), /already in use/); }
  finally { await new Promise(resolve => occupied.close(resolve)); }
  for (const bad of ['bad', '0', '-1', '65536', '1.5']) await assert.rejects(command(root, 'start', bad), /PORT must be/);
  const first = await launch(root, 'start', port);
  assert.ok(first.url.endsWith(':' + port)); first.child.kill('SIGKILL'); await first.exit;
  const next = await launch(root, 'start', port); assert.equal(first.url, next.url);
  await command(root, 'stop'); assert.equal((await next.exit).code, 0);
});
