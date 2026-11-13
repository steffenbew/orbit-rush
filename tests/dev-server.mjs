// Include the Python server checks in Node's isolated, parallel test runner.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const result = spawnSync('python3', [fileURLToPath(new URL('./dev-server.py', import.meta.url))], {stdio: 'inherit'});
if (result.error) throw result.error;
assert.equal(result.status, 0, `Server tests failed${result.signal ? ` (${result.signal})` : ''}`);
