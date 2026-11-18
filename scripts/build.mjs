import { createHash } from 'node:crypto';
import { copyFileSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
// All gameplay dependencies get immutable URLs. public/ holds install metadata and notices.
await build({ root, configFile: false, base: './', build: {
  target: 'es2022', assetsInlineLimit: 0
} });

// Hash the actual output, including lazy chunks and public files, not the source tree.
const integrity = {};
for (const path of readdirSync(dist, { recursive: true }).sort()) {
  const file = join(dist, path);
  if (!statSync(file).isFile()) continue;
  if (basename(path) === '.DS_Store') {
    unlinkSync(file);
    continue;
  }
  integrity[path] = 'sha256-' + createHash('sha256').update(readFileSync(file)).digest('base64');
}
const worker = readFileSync(join(root, 'sw.js'), 'utf8');
const id = createHash('sha256').update(worker).update(JSON.stringify(integrity)).digest('hex').slice(0, 24);
const marker = 'const RELEASE = null;';
if (!worker.includes(marker)) throw new Error('Missing release marker in sw.js');
writeFileSync(join(dist, 'sw.js'), worker.replace(marker, () => `const RELEASE = ${JSON.stringify({ id, integrity })};`));
copyFileSync(join(root, '.htaccess'), join(dist, '.htaccess'));
console.log(`Prepared offline release ${id} (${Object.keys(integrity).length} files)`);
