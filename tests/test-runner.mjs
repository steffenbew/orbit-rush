// Check both test modes and their exit status without recursively running the real suites.
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
    writeFileSync(join(directory, 'tests/dev-server.py'), "print('server passed')\n");
    let result = run();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /gameplay passed/);
    assert.match(result.stdout, /server passed/);

    writeFileSync(join(directory, 'tests/gameplay.mjs'), "throw new Error('intentional gameplay failure');\n");
    result = run();
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, /intentional gameplay failure/);
    assert.match(result.stdout, /server passed/, 'Other suites still finish and report after a failure');

    writeFileSync(join(directory, 'tests/gameplay.mjs'), gameplay);
    writeFileSync(join(directory, 'tests/dev-server.py'), 'raise SystemExit(7)\n');
    result = run();
    assert.equal(result.status, 1, 'Python failures must fail the combined command');
    assert.match(result.stdout + result.stderr, /Server tests failed/);
    assert.match(result.stdout, /gameplay passed/);
  }

  // Stub deployment: verify command routing without touching a remote server.
  mkdirSync(join(directory, 'scripts'));
  writeFileSync(join(directory, 'scripts/deploy.sh'), "printf 'deploy called\\n'\n");
  const result = spawnSync('bash', [join(directory, 'run'), 'deploy'], {
    cwd: tmpdir(), env, encoding: 'utf8', timeout: 15000
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stdout.trim(), 'deploy called', 'Deployment skips tests, including the failing Python fixture');
} finally {
  rmSync(directory, {recursive: true, force: true});
}
console.log('PASS fast/full mode selection, parallel runner success, JavaScript/Python failure propagation, checkout-relative paths and deployment without tests');
