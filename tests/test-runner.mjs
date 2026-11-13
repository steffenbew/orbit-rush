// Check ./run test's exit status without recursively running the real suites.
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const directory = mkdtempSync(join(tmpdir(), 'orbit test runner '));
try {
  mkdirSync(join(directory, 'tests'));
  copyFileSync(new URL('../run', import.meta.url), join(directory, 'run'));
  copyFileSync(new URL('./dev-server.mjs', import.meta.url), join(directory, 'tests/dev-server.mjs'));
  writeFileSync(join(directory, 'tests/gameplay.mjs'), "console.log('gameplay passed');\n");
  writeFileSync(join(directory, 'tests/dev-server.py'), "print('server passed')\n");
  // This child command is a fresh test runner, not a worker of the parent runner.
  const env = {...process.env};
  delete env.NODE_TEST_CONTEXT;
  const run = () => spawnSync('bash', [join(directory, 'run'), 'test'], {
    cwd: tmpdir(), env, encoding: 'utf8', timeout: 15000
  });
  let result = run();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /gameplay passed/);
  assert.match(result.stdout, /server passed/);

  writeFileSync(join(directory, 'tests/gameplay.mjs'), "throw new Error('intentional gameplay failure');\n");
  result = run();
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /intentional gameplay failure/);
  assert.match(result.stdout, /server passed/, 'Other suites still finish and report after a failure');

  writeFileSync(join(directory, 'tests/gameplay.mjs'), "console.log('gameplay passed');\n");
  writeFileSync(join(directory, 'tests/dev-server.py'), 'raise SystemExit(7)\n');
  result = run();
  assert.equal(result.status, 1, 'Python failures must fail the combined command');
  assert.match(result.stdout + result.stderr, /Server tests failed/);
  assert.match(result.stdout, /gameplay passed/);
} finally {
  rmSync(directory, {recursive: true, force: true});
}
console.log('PASS parallel runner success, JavaScript/Python failure propagation and checkout-relative paths');
