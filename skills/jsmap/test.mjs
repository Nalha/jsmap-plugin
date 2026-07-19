import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'jsmap-'));
const cli = fileURLToPath(new URL('jsmap.js', import.meta.url));
const run = (...args) => execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8' });

try {
  const one = join(dir, 'one.js');
  const two = join(dir, 'two.js');
  writeFileSync(one, `function outer() { function inner() { return 1 } inner() }\ndescribe('suite', () => { it('works', () => inner()) })\nfunction same() {}`);
  writeFileSync(two, 'function same() {}');

  const api = run('api', one);
  assert.match(api, /inner\(\)/);
  assert.match(api, /it\("works"\)/);
  assert.match(run('graph', one), /one\.js#outer -> .*one\.js#inner/);
  const ambiguous = spawnSync(process.execPath, [cli, 'extract', dir, 'same'], { encoding: 'utf8' });
  assert.equal(ambiguous.status, 1);
  assert.match(ambiguous.stderr, /ambiguous: same/);
  assert.match(run('extract', dir, `${relative(process.cwd(), one).replaceAll('\\', '/')}#same`), /function same/);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
