#!/usr/bin/env node
// jsmap: answer what/where/how-wired about JS files without reading them.
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

const USAGE = `usage: jsmap.js <cmd> <path...> [arg]
  api     <path...>            signatures + first doc line, no bodies
  graph   <path...> [name]     call edges
  callers <path...> <name>     who calls name
  search  <path...> <regex>    which definitions contain a string
  extract <path...> <name>     body of name + callee signatures
  where   <path...> <line>     definition enclosing a line`;

const argv = process.argv.slice(2);
const cmd = argv.shift();
if (!cmd || !argv.length) { console.error(USAGE); process.exit(1); }

const paths = [];
const rejected = [];
while (argv.length && !argv[0].startsWith('--')) {
  try { statSync(argv[0]); paths.push(argv.shift()); } catch { rejected.push(argv.shift()); break; }
}
const arg = rejected[0] ?? argv.find((a) => !a.startsWith('--'));

// A rejected leading arg is a bad path, not the command's name/regex argument.
if (!paths.length) {
  console.error(`no readable path in: ${rejected.join(' ')}
Pass a path first, then the argument: jsmap.js ${cmd} <path...> [arg]
Use relative, forward-slash paths (web, web/model/units.js) — a shell eats backslashes.`);
  process.exit(1);
}

/** Every .js file under the given paths. */
const expand = (p) => statSync(p).isDirectory()
  ? readdirSync(p).flatMap((f) => (f === 'node_modules' ? [] : expand(join(p, f))))
  : (p.endsWith('.js') ? [p] : []);
const files = paths.flatMap(expand);
if (!files.length) {
  console.error(`no .js files under: ${paths.join(', ')}\njsmap is JS-only; use Grep for .ts/.tsx.`);
  process.exit(1);
}

/** All top-level definitions across every indexed file. */
const defs = [];
const byName = new Map();
const add = (d) => {
  defs.push(d);
  if (!byName.has(d.name)) byName.set(d.name, []);
  byName.get(d.name).push(d);
};
/** Local name -> source module, for every import across indexed files. */
const imports = [];

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const comments = [];
  let ast;
  try {
    ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true, onComment: comments });
  } catch (e) { console.error(`// skipped ${file}: ${e.message}`); continue; }

  const rec = (name, node, outer) => {
    if (name) add({ name, node, outer, file, src, comments, ast });
  };
  for (const stmt of ast.body) {
    if (stmt.type === 'ImportDeclaration') {
      for (const s of stmt.specifiers) imports.push({ file, local: s.local.name, source: stmt.source.value });
      continue;
    }
    const decl = stmt.type.startsWith('ExportNamed') || stmt.type.startsWith('ExportDefault')
      ? stmt.declaration : stmt;
    if (!decl) continue;
    if (decl.type === 'FunctionDeclaration') rec(decl.id?.name, decl, stmt);
    else if (decl.type === 'ClassDeclaration') {
      rec(decl.id?.name, decl, stmt);
      for (const m of decl.body.body) {
        if (m.key && m.type === 'MethodDefinition') rec(`${decl.id?.name}.${m.key.name}`, m, m);
      }
    } else if (decl.type === 'VariableDeclaration') {
      for (const d of decl.declarations) {
        if (d.init && /Function/.test(d.init.type)) rec(d.id?.name, d.init, stmt);
      }
    }
  }
}

const loc = (d) => `${relative(process.cwd(), d.file).replace(/\\/g, '/')}:${d.outer.loc.start.line}-${d.outer.loc.end.line}`;

const sigOf = (d) => {
  const fn = d.node.value ?? d.node;
  if (!fn.params) return d.name;
  const ps = fn.params.map((p) => d.src.slice(p.start, p.end).replace(/\s+/g, ' ')).join(', ');
  return `${d.name}(${ps})`;
};

/** First sentence of the JSDoc immediately above a definition. */
const docOf = (d) => {
  const c = d.comments
    .filter((x) => x.type === 'Block' && x.value.startsWith('*') && x.end <= d.outer.start)
    .sort((a, b) => b.end - a.end)[0];
  if (!c || d.src.slice(c.end, d.outer.start).trim() !== '') return null;
  const flat = c.value.split('\n').map((l) => l.replace(/^\s*\*?\s?/, '').trim()).filter(Boolean).join(' ');
  const stop = flat.search(/\.(\s|$)|\s@/);
  return (stop === -1 ? flat : flat.slice(0, stop + 1)).trim();
};

/** Names called inside a definition that resolve to another indexed definition. */
const callsIn = (d) => {
  const found = new Set();
  walk.simple(d.node, {
    CallExpression(n) {
      const c = n.callee;
      if (c.type === 'Identifier') found.add(c.name);
      else if (c.type === 'MemberExpression' && !c.computed) found.add(c.property.name);
    },
  });
  return [...found].filter((n) => byName.has(n) && n !== d.name);
};

/** Lines inside a definition where it calls `name`. */
const callSites = (d, name) => {
  const lines = new Set();
  walk.simple(d.node, {
    CallExpression(n) {
      const c = n.callee;
      const called = c.type === 'Identifier' ? c.name
        : (c.type === 'MemberExpression' && !c.computed ? c.property.name : null);
      if (called === name) lines.add(n.loc.start.line);
    },
  });
  return [...lines].sort((a, b) => a - b);
};

/** Definition with the tightest span containing a line in a file. */
const enclosing = (file, line) => defs
  .filter((d) => d.file === file && line >= d.outer.loc.start.line && line <= d.outer.loc.end.line)
  .sort((a, b) => (a.outer.end - a.outer.start) - (b.outer.end - b.outer.start))[0];

const pick = (name) => {
  const hits = byName.get(name);
  if (hits) return hits;
  const hit = imports.find((i) => i.local === name);
  const where = hit ? ` (imported in ${relative(process.cwd(), hit.file).replace(/\\/g, '/')} from ${hit.source} — try that file)` : '';
  console.error(`not found: ${name}${where}`);
  process.exit(1);
};

if (cmd === 'api') {
  let cur = null;
  for (const d of defs) {
    if (d.file !== cur) { cur = d.file; console.log(`\n## ${relative(process.cwd(), d.file).replace(/\\/g, '/')}`); }
    const doc = docOf(d);
    console.log(`${sigOf(d)}  [${d.outer.loc.start.line}-${d.outer.loc.end.line}]${doc ? `\n    // ${doc}` : ''}`);
  }
} else if (cmd === 'graph') {
  for (const d of defs) {
    if (arg && d.name !== arg) continue;
    const edges = callsIn(d);
    if (edges.length) console.log(`${d.name} -> ${edges.join(', ')}`);
  }
} else if (cmd === 'callers') {
  const hits = defs
    .map((d) => [d, callSites(d, arg)])
    .filter(([d, sites]) => sites.length && d.name !== arg);
  for (const [d, sites] of hits) console.log(`${sigOf(d)}  ${loc(d)}  calls at ${sites.join(', ')}`);
  const total = hits.reduce((n, [, sites]) => n + sites.length, 0);
  const note = `${total} call sites in ${hits.length} functions`;
  console.log(`\n// ${note}; comments and imports excluded`);
} else if (cmd === 'search') {
  const re = new RegExp(arg);
  const out = new Map();
  for (const file of [...new Set(defs.map((d) => d.file))]) {
    const src = defs.find((d) => d.file === file).src;
    src.split('\n').forEach((text, i) => {
      if (!re.test(text)) return;
      const d = enclosing(file, i + 1);
      const key = d ? `${sigOf(d)}  ${loc(d)}` : `${relative(process.cwd(), file).replace(/\\/g, '/')}  (top level)`;
      if (!out.has(key)) out.set(key, []);
      const t = text.trim();
      out.get(key).push(`${i + 1}: ${t.length > 100 ? `${t.slice(0, 100)}…` : t}`);
    });
  }
  if (!out.size) console.log(`no match: ${arg}`);
  for (const [key, hits] of out) {
    console.log(`\n${key}`);
    for (const h of hits) console.log(`    ${h}`);
  }
} else if (cmd === 'where') {
  const d = enclosing(files[0], Number(arg));
  console.log(d ? `${sigOf(d)}  ${loc(d)}` : 'top level');
} else if (cmd === 'extract') {
  const [d] = pick(arg);
  console.log(`// ---- ${d.name}  (${loc(d)}) ----`);
  console.log(d.src.slice(d.outer.start, d.outer.end));
  const callees = callsIn(d);
  if (callees.length) {
    console.log('\n// ---- calls (signature only) ----');
    for (const n of callees) {
      for (const c of byName.get(n)) {
        const doc = docOf(c);
        console.log(`// ${sigOf(c)}  ${loc(c)}${doc ? `  ${doc}` : ''}`);
      }
    }
  }
} else { console.error(USAGE); process.exit(1); }
