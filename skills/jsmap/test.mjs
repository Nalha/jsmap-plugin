import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Run the CLI from the skill dir so committed fixtures render as `test/fixtures/…`.
const dir = fileURLToPath(new URL('.', import.meta.url));
const cli = fileURLToPath(new URL('jsmap.js', import.meta.url));
const FIX = 'test/fixtures';
const run = (...args) => execFileSync(process.execPath, [cli, ...args], { cwd: dir, encoding: 'utf8' });
const fail = (...args) => spawnSync(process.execPath, [cli, ...args], { cwd: dir, encoding: 'utf8' });

// api: every extension is collected, and each language's signatures render.
const api = run('api', FIX);
for (const ext of ['core.js', 'types.ts', 'module.mts', 'legacy.cts', 'view.tsx']) {
  assert.match(api, new RegExp(`## ${FIX}/${ext}`));
}
assert.match(api, /loadConfig\(path\)  \[4-6\]/);
assert.match(api, /\/\/ Reads a config file and doubles its value\./); // JSDoc first line
assert.match(api, /Store\.create\(name\)/); // static method
assert.match(api, /describe\("Store"\)/); // call-labelled block
assert.match(api, /it\("saves items"\)/);
assert.match(api, /combine\(a: Point, b: Point\)/); // typed params
assert.match(api, /Grid\.constructor\(private width: number, readonly height: number\)/); // param properties
assert.match(api, /Grid\.add\(cell: T, options\?: \{ silent: boolean \}\)/); // optional + object type
assert.match(api, /overloaded\(x: unknown\)/); // only the implementation is indexed
assert.match(api, /delay\(ms: Millis\)/); // .mts async
assert.match(api, /area\(radius: number\)/); // .cts namespace-nested
assert.match(api, /render\(name: string, radius: number\)/);
assert.match(api, /Panel\(\{ title, items \}: PanelProps\)/); // .tsx destructured props
assert.match(api, /Badge\(\{ count \}: \{ count: number \}\)/); // arrow component
assert.doesNotMatch(api, /Direction/); // enums are not indexed as definitions
assert.doesNotMatch(api, /Vector/); // nor unreferenced type aliases

// graph: cross-file edges, and `?` marks the callee `scale` that two files define.
const graph = run('graph', FIX);
assert.match(graph, new RegExp(`${FIX}/core\\.js#loadConfig -> .*core\\.js#readValue.*core\\.js#double`));
assert.match(graph, new RegExp(`${FIX}/types\\.ts#combine -> scale\\?`));
assert.match(graph, new RegExp(`${FIX}/module\\.mts#delay ->.*module\\.mts#tick`));
assert.match(graph, new RegExp(`${FIX}/view\\.tsx#Panel -> ${FIX}/view\\.tsx#format`));
assert.match(graph, new RegExp(`${FIX}/legacy\\.cts#render -> ${FIX}/legacy\\.cts#area`));

// Non-standard formatting: split keywords, Allman braces, leading-comma and
// multiline params, operators at line-starts — all still index with normalized
// signatures and correct spans.
assert.match(api, /spread\(first: number, second : string, \.\.\.rest : T\[\]\)  \[4-16\]/);
assert.match(api, /\/\/ Oddly\s+spaced\s+doc\s+that\s+still\s+parses\./); // doc found past a split header
assert.match(api, /join\(a: unknown, b: unknown\)/); // leading comma + inline block comment
assert.match(api, /chained\(value: number\)/); // multiline arrow, operators at line-starts
assert.match(api, /Boxed\.constructor\(readonly value : number\)/); // trailing comma, param property
assert.match(api, /Boxed\.map\(fn : \( n : number \) => U\)/); // function-type param, split generics
assert.match(api, /lookup\(key : string\)/); // annotation split across lines
assert.match(api, /tangled\(alpha, beta\)  \[1-10\]/); // JS Allman braces + split keywords
assert.match(api, /Wrapped\.of\(value\)/); // split `static of ( value )`
assert.match(graph, new RegExp(`${FIX}/oddstyle\\.ts#spread -> ${FIX}/oddstyle\\.ts#join`));
assert.match(graph, new RegExp(`${FIX}/oddstyle\\.js#looped -> ${FIX}/oddstyle\\.js#glue`));
// extract keeps the odd body verbatim, linebreaks and all.
assert.match(run('extract', `${FIX}/oddstyle.ts`, 'spread'), /export\r?\nfunction\r?\nspread/);

// callers: uniquely named function across one file.
const callers = run('callers', `${FIX}/core.js`, 'double');
assert.match(callers, new RegExp(`loadConfig\\(path\\)  ${FIX}/core\\.js:4-6  calls at 5`));
assert.match(callers, /Store\.save\(item\).*calls at 22/);
assert.match(callers, /4 call sites in 4 functions/);

// callers refuses an ambiguous name; name-based calls can't pick a target.
const callersAmbiguous = fail('callers', FIX, 'scale');
assert.equal(callersAmbiguous.status, 1);
assert.match(callersAmbiguous.stderr, /callers unavailable: scale/);

// search: which definitions contain a string, across TSX including inside JSX.
const search = run('search', `${FIX}/view.tsx`, 'format');
assert.match(search, new RegExp(`Panel\\(.*\\)  ${FIX}/view\\.tsx:9-23`));
assert.match(search, /17: <li key=\{item\}>\{format\(item\)\}/);
assert.match(search, new RegExp(`format\\(value: string\\)  ${FIX}/view\\.tsx:25-27`));

// where: the definition enclosing a line.
assert.match(
  run('where', `${FIX}/types.ts`, '31'),
  new RegExp(`Grid\\.add\\(cell: T, options\\?: \\{ silent: boolean \\}\\)  ${FIX}/types\\.ts:30-32`),
);

// extract: `path#name` disambiguates the two `scale` definitions.
const extract = run('extract', FIX, `${FIX}/types.ts#scale`);
assert.match(extract, new RegExp(`---- scale  \\(${FIX}/types\\.ts:20-22\\) ----`));
assert.match(extract, /function scale\(value: number, factor: number\): number/);

// extract without a path is ambiguous and lists both candidates.
const extractAmbiguous = fail('extract', FIX, 'scale');
assert.equal(extractAmbiguous.status, 1);
assert.match(extractAmbiguous.stderr, /ambiguous: scale/);
assert.match(extractAmbiguous.stderr, new RegExp(`${FIX}/module\\.mts#scale`));
assert.match(extractAmbiguous.stderr, new RegExp(`${FIX}/types\\.ts#scale`));

// A file that cannot be parsed is skipped with a note, not fatal.
const tmp = mkdtempSync(join(tmpdir(), 'jsmap-'));
try {
  const bad = join(tmp, 'broken.ts');
  writeFileSync(bad, 'export function oops(: {');
  const skipped = fail('api', bad);
  assert.match(skipped.stderr, /\/\/ skipped .*broken\.ts/);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log('ok');
