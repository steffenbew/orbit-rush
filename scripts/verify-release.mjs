import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Check the public routes, not just the files rsync placed in the document root.
const worker = readFileSync(new URL('../dist/sw.js', import.meta.url), 'utf8');
const release = JSON.parse(worker.match(/^const RELEASE = (.+);$/m)[1]);
for (const [path, expected] of Object.entries(release.integrity)) {
  const url = new URL(path, process.argv[2]);
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  const digest = createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('base64');
  if ('sha256-' + digest !== expected) throw new Error(`Integrity mismatch: ${url}`);
}
console.log(`Verified ${Object.keys(release.integrity).length} public files for release ${release.id}`);
