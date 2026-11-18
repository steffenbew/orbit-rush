// Check both test modes and their exit status without recursively running the real suites.
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const directory = mkdtempSync(join(tmpdir(), 'orbit test runner '));
try {
  mkdirSync(join(directory, 'tests'));
  copyFileSync(new URL('../run', import.meta.url), join(directory, 'run'));
  // This child command is a fresh test runner, not a worker of the parent runner.
  const env = {...process.env};
  delete env.NODE_TEST_CONTEXT;
  for (const [command, full] of [['test', '0'], ['test:full', '1']]) {
    // The explicit command wins over an inherited setting from another test run.
    const run = () => spawnSync('bash', [join(directory, 'run'), command], {
      cwd: tmpdir(), env: {...env, ORBIT_TEST_FULL: full === '1' ? '0' : '1'}, encoding: 'utf8', timeout: 15000
    });
    const gameplay = `import assert from 'node:assert/strict';
assert.equal(process.env.ORBIT_TEST_FULL, '${full}');
console.log('gameplay passed');\n`;
    writeFileSync(join(directory, 'tests/gameplay.mjs'), gameplay);
    writeFileSync(join(directory, 'tests/dev-server.mjs'), "console.log('server passed')\n");
    // Both commands use the same Node runner. Check success once and a real failure once.
    if (full === '1') writeFileSync(join(directory, 'tests/dev-server.mjs'), "throw new Error('intentional server failure');\n");
    const result = run();
    assert.equal(result.status, full === '1' ? 1 : 0, result.stdout + result.stderr);
    assert.match(result.stdout, /gameplay passed/);
    assert.match(result.stdout + result.stderr, full === '1' ? /intentional server failure/ : /server passed/);
  }

  // Exercise setup from outside the checkout, without actually installing dependencies.
  const bin = join(directory, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'npm'), '#!/bin/sh\nprintf "%s\\n" "$PWD" "$@"\n', { mode: 0o755 });
  const setup = spawnSync('bash', [join(directory, 'run'), 'setup'], {
    cwd: tmpdir(), env: {...env, PATH: bin + ':' + env.PATH}, encoding: 'utf8', timeout: 15000
  });
  assert.equal(setup.status, 0, setup.stderr);
  assert.equal(setup.stdout.trim(), realpathSync(directory) + '\nci');

  // Stub deployment: verify command routing without touching a remote server.
  mkdirSync(join(directory, 'scripts'));
  writeFileSync(join(directory, 'scripts/deploy.sh'), "printf 'deploy called\\n'\n");
  const result = spawnSync('bash', [join(directory, 'run'), 'deploy'], {
    cwd: tmpdir(), env, encoding: 'utf8', timeout: 15000
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stdout.trim(), 'deploy called', 'Deployment skips tests, including the failing server fixture');
} finally {
  rmSync(directory, {recursive: true, force: true});
}
console.log('PASS fast/full mode selection, parallel runner success, failure propagation, checkout-relative paths and deployment without tests');
