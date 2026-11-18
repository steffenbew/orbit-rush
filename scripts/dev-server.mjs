// One foreground server per checkout. A private local socket handles status/stop:
// no PID files, process discovery or signals sent to other processes.
import http from 'node:http';
import net from 'node:net';
import { once } from 'node:events';
import { mkdirSync, rmSync } from 'node:fs';
import { readFile, realpath } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('../', import.meta.url)));
mkdirSync('.run', { recursive: true });
const socket = '.run/orbit.sock';
const mode = process.argv[2];
const root = resolve('dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.md': 'text/plain', '.txt': 'text/plain' };

async function servePreview(req, res) {
  if (!['GET', 'HEAD'].includes(req.method)) return res.writeHead(405).end();
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1) || 'index.html';
    if (path.split('/').some(part => part.startsWith('.'))) return res.writeHead(404).end();
    if (!/^(index\.html|sw\.js|manifest\.webmanifest|CREDITS\.md)$/.test(path) &&
        !/^(assets|icons|licenses)\//.test(path)) return res.writeHead(404).end();
    const file = await realpath(resolve(root, path));
    if (!file.startsWith(root + sep)) return res.writeHead(404).end();
    const bytes = await readFile(file);
    const cache = path.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': cache, 'Content-Length': bytes.length });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch { res.writeHead(404).end(); }
}

async function startServer(port) {
  if (mode === 'start') {
    const { createServer } = await import('vite').catch(error => {
      if (error.code === 'ERR_MODULE_NOT_FOUND') throw new Error('Run ./run setup to install development dependencies before running ./run start.');
      throw error;
    });
    const vite = await createServer({
      configFile: false, appType: 'mpa', logLevel: 'error',
      optimizeDeps: { noDiscovery: true },
      server: {
        host: '127.0.0.1', port, strictPort: !!process.env.PORT,
        fs: { allow: ['index.html', 'src', 'assets', 'sw.js', 'public'] },
        watch: { ignored: ['**/.run/**', '**/dist/**'] }
      }
    });
    try { await vite.listen(); } catch (error) { await vite.close(); throw error; }
    return { port: vite.httpServer.address().port, close: () => vite.close() };
  }

  const server = http.createServer(servePreview);
  try { await listen(server, port, '127.0.0.1'); } catch (error) {
    if (process.env.PORT || error.code !== 'EADDRINUSE') throw error;
    await listen(server, 0, '127.0.0.1');
  }
  return { port: server.address().port, close() { server.close(); server.closeAllConnections(); } };
}

async function contact(command) {
  const client = net.connect(socket);
  try { await once(client, 'connect'); } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ECONNREFUSED') return null;
    throw error;
  }
  client.write(command);
  let response = '';
  for await (const chunk of client) response += chunk;
  return response;
}

async function main() {
  if (!['start', 'preview', 'stop'].includes(mode)) throw new Error('Use ./run start, preview or stop.');
  const current = await contact(mode);
  if (current !== null) return console.log(current);
  if (mode === 'stop') return console.log('No Node server running in this checkout.');
  if (mode === 'preview') await realpath(resolve(root, 'index.html')).catch(() => { throw new Error('Run ./run build before preview.'); });
  const port = process.env.PORT || (mode === 'preview' ? '8081' : '8080');
  if (!/^\d+$/.test(port) || +port < 1 || +port > 65535) throw new Error('PORT must be an integer between 1 and 65535.');

  let server, url;
  const control = net.createServer(client => client.once('data', data => {
    if (String(data) === 'stop') { client.end('Stopped Orbit Rush.'); shutdown(); }
    else client.end(`Orbit Rush already running (${mode}): ${url || 'starting'}`);
  }));
  function shutdown() { control.close(); server?.close(); }
  // A killed process can leave its socket on disk. Only unlink after a refused connection.
  try { await listen(control, socket); } catch (error) {
    if (error.code !== 'EADDRINUSE') throw error;
    const running = await contact(mode);
    if (running !== null) return console.log(running);
    rmSync(socket, { force: true });
    await listen(control, socket);
  }
  try {
    server = await startServer(+port);
  } catch (error) { control.close(); throw error; }
  url = `http://localhost:${server.port}`;
  console.log(`Orbit Rush (${mode}): ${url}\nStop with Ctrl+C or ./run stop.`);
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.once(signal, shutdown);
}
function listen(server, ...args) {
  const ready = once(server, 'listening');
  server.listen(...args);
  return ready;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
