#!/usr/bin/env node
// jsmap: answer what/where/how-wired about JS files without reading them.
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as acorn from './vendor/acorn.mjs';
import * as walk from './vendor/walk.mjs';

const USAGE = `usage: jsmap.js <cmd> <path...> [arg]
  api     <path...>            signatures + first doc line, no bodies
  graph   <path...> [name]     call edges
  callers <path...> <name>     who calls name
  search  <path...> <regex>    which definitions contain a string
  extract <path...> <name>     body of name + callee signatures
  where   <path...> <line>     definition enclosing a line`;

/** The whole flow: read args, find the files, index them, run one command. */
function main() {
  const { cmd, paths, arg } = parseArgs();
  const files = collectJsFiles(paths);
  new JsMap(files).run(cmd, arg);
}

// ---- argument parsing: leading args that stat() are paths, the rest is [arg] ----

function parseArgs() {
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
  return { cmd, paths, arg };
}

function collectJsFiles(paths) {
  const jsFilesUnder = (path) => statSync(path).isDirectory()
    ? readdirSync(path).flatMap((f) => (f === 'node_modules' ? [] : jsFilesUnder(join(path, f))))
    : (path.endsWith('.js') ? [path] : []);
  const files = paths.flatMap(jsFilesUnder);
  if (!files.length) {
    console.error(`no .js files under: ${paths.join(', ')}\njsmap is JS-only; use Grep for .ts/.tsx.`);
    process.exit(1);
  }
  return files;
}

// ---- pure formatters over a single definition (no index needed) ----

/** Project-relative path with forward slashes, as shown in all output. */
const displayPath = (file) => relative(process.cwd(), file).replace(/\\/g, '/');

/** "path:start-end" location of a definition. */
const locationOf = (def) => `${displayPath(def.file)}:${def.outer.loc.start.line}-${def.outer.loc.end.line}`;

/** "name(params)" signature of a definition. */
const signatureOf = (def) => {
  const fn = def.node.value ?? def.node;
  if (!fn.params) return def.name;
  const params = fn.params.map((p) => def.src.slice(p.start, p.end).replace(/\s+/g, ' ')).join(', ');
  return `${def.name}(${params})`;
};

/** First sentence of the JSDoc immediately above a definition. */
const docLineOf = (def) => {
  const jsdoc = def.comments
    .filter((c) => c.type === 'Block' && c.value.startsWith('*') && c.end <= def.outer.start)
    .sort((a, b) => b.end - a.end)[0];
  if (!jsdoc || def.src.slice(jsdoc.end, def.outer.start).trim() !== '') return null;
  const flat = jsdoc.value.split('\n').map((l) => l.replace(/^\s*\*?\s?/, '').trim()).filter(Boolean).join(' ');
  const stop = flat.search(/\.(\s|$)|\s@/);
  return (stop === -1 ? flat : flat.slice(0, stop + 1)).trim();
};

/** Name a call expression's callee goes by: `foo()` -> foo, `x.foo()` -> foo. */
const calleeName = (callee) => callee.type === 'Identifier' ? callee.name
  : (callee.type === 'MemberExpression' && !callee.computed ? callee.property.name : null);

/** Lines inside a definition where it calls `name`. */
const callSites = (def, name) => {
  const lines = new Set();
  walk.simple(def.node, {
    CallExpression(node) { if (calleeName(node.callee) === name) lines.add(node.loc.start.line); },
  });
  return [...lines].sort((a, b) => a - b);
};

// ---- the index: every top-level definition and import across the given files ----

class JsMap {
  constructor(files) {
    this.files = files;
    this.defs = [];
    this.defsByName = new Map();
    this.imports = []; // local name -> source module, per import
    for (const file of files) this.indexFile(file);
  }

  /** Parse one file and record its top-level definitions and imports. */
  indexFile(file) {
    const src = readFileSync(file, 'utf8');
    const comments = [];
    let ast;
    try {
      ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true, onComment: comments });
    } catch (e) { console.error(`// skipped ${file}: ${e.message}`); return; }

    // `node` is the function/class itself; `outer` includes any export wrapper.
    const record = (name, node, outer) => {
      if (name) this.addDef({ name, node, outer, file, src, comments });
    };
    for (const stmt of ast.body) {
      if (stmt.type === 'ImportDeclaration') {
        for (const spec of stmt.specifiers) this.imports.push({ file, local: spec.local.name, source: stmt.source.value });
        continue;
      }
      const decl = stmt.type.startsWith('ExportNamed') || stmt.type.startsWith('ExportDefault')
        ? stmt.declaration : stmt;
      if (!decl) continue;
      if (decl.type === 'FunctionDeclaration') record(decl.id?.name, decl, stmt);
      else if (decl.type === 'ClassDeclaration') {
        record(decl.id?.name, decl, stmt);
        for (const member of decl.body.body) {
          if (member.key && member.type === 'MethodDefinition') record(`${decl.id?.name}.${member.key.name}`, member, member);
        }
      } else if (decl.type === 'VariableDeclaration') {
        for (const declarator of decl.declarations) {
          if (declarator.init && /Function/.test(declarator.init.type)) record(declarator.id?.name, declarator.init, stmt);
        }
      }
    }
  }

  addDef(def) {
    this.defs.push(def);
    if (!this.defsByName.has(def.name)) this.defsByName.set(def.name, []);
    this.defsByName.get(def.name).push(def);
  }

  /** Names called inside a definition that resolve to another indexed definition. */
  callsIn(def) {
    const found = new Set();
    walk.simple(def.node, {
      CallExpression(node) { found.add(calleeName(node.callee)); },
    });
    return [...found].filter((name) => name && this.defsByName.has(name) && name !== def.name);
  }

  /** Definition with the tightest span containing a line in a file. */
  enclosingDef(file, line) {
    return this.defs
      .filter((def) => def.file === file && line >= def.outer.loc.start.line && line <= def.outer.loc.end.line)
      .sort((a, b) => (a.outer.end - a.outer.start) - (b.outer.end - b.outer.start))[0];
  }

  /** Definitions named `name`, or die pointing at the import that provides it. */
  defsNamed(name) {
    const hits = this.defsByName.get(name);
    if (hits) return hits;
    const imported = this.imports.find((i) => i.local === name);
    const hint = imported ? ` (imported in ${displayPath(imported.file)} from ${imported.source} — try that file)` : '';
    console.error(`not found: ${name}${hint}`);
    process.exit(1);
  }

  // ---- commands ----

  run(cmd, arg) {
    switch (cmd) {
      case 'api': return this.api();
      case 'graph': return this.graph(arg);
      case 'callers': return this.callers(arg);
      case 'search': return this.search(arg);
      case 'where': return this.where(arg);
      case 'extract': return this.extract(arg);
      default: console.error(USAGE); process.exit(1);
    }
  }

  api() {
    let currentFile = null;
    for (const def of this.defs) {
      if (def.file !== currentFile) { currentFile = def.file; console.log(`\n## ${displayPath(def.file)}`); }
      const doc = docLineOf(def);
      console.log(`${signatureOf(def)}  [${def.outer.loc.start.line}-${def.outer.loc.end.line}]${doc ? `\n    // ${doc}` : ''}`);
    }
  }

  graph(name) {
    for (const def of this.defs) {
      if (name && def.name !== name) continue;
      const callees = this.callsIn(def);
      if (callees.length) console.log(`${def.name} -> ${callees.join(', ')}`);
    }
  }

  callers(name) {
    const callers = this.defs
      .map((def) => [def, callSites(def, name)])
      .filter(([def, sites]) => sites.length && def.name !== name);
    for (const [def, sites] of callers) console.log(`${signatureOf(def)}  ${locationOf(def)}  calls at ${sites.join(', ')}`);
    const total = callers.reduce((n, [, sites]) => n + sites.length, 0);
    console.log(`\n// ${total} call sites in ${callers.length} functions; comments and imports excluded`);
  }

  search(pattern) {
    const re = new RegExp(pattern);
    const matchesByDef = new Map();
    for (const file of [...new Set(this.defs.map((def) => def.file))]) {
      const src = this.defs.find((def) => def.file === file).src;
      src.split('\n').forEach((text, i) => {
        if (!re.test(text)) return;
        const def = this.enclosingDef(file, i + 1);
        const key = def ? `${signatureOf(def)}  ${locationOf(def)}` : `${displayPath(file)}  (top level)`;
        if (!matchesByDef.has(key)) matchesByDef.set(key, []);
        const line = text.trim();
        matchesByDef.get(key).push(`${i + 1}: ${line.length > 100 ? `${line.slice(0, 100)}…` : line}`);
      });
    }
    if (!matchesByDef.size) console.log(`no match: ${pattern}`);
    for (const [key, hits] of matchesByDef) {
      console.log(`\n${key}`);
      for (const hit of hits) console.log(`    ${hit}`);
    }
  }

  where(line) {
    const def = this.enclosingDef(this.files[0], Number(line));
    console.log(def ? `${signatureOf(def)}  ${locationOf(def)}` : 'top level');
  }

  extract(name) {
    const [def] = this.defsNamed(name);
    console.log(`// ---- ${def.name}  (${locationOf(def)}) ----`);
    console.log(def.src.slice(def.outer.start, def.outer.end));
    const callees = this.callsIn(def);
    if (callees.length) {
      console.log('\n// ---- calls (signature only) ----');
      for (const called of callees) {
        for (const callee of this.defsNamed(called)) {
          const doc = docLineOf(callee);
          console.log(`// ${signatureOf(callee)}  ${locationOf(callee)}${doc ? `  ${doc}` : ''}`);
        }
      }
    }
  }
}

main();
