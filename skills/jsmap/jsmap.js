#!/usr/bin/env node
// jsmap: answer what/where/how-wired about JS/TS files without reading them.
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as acorn from './vendor/acorn.mjs';
import * as walk from './vendor/walk.mjs';
import { tsPlugin } from './vendor/acorn-typescript.mjs';

const SOURCE_RE = /\.(js|ts|mts|cts|tsx)$/;
const TsParser = acorn.Parser.extend(tsPlugin());
const TsxParser = acorn.Parser.extend(tsPlugin({ jsx: {} }));

/** The acorn parser for a file: plain for .js, TS for .ts/.mts/.cts, TS+JSX for .tsx. */
const parserFor = (file) => {
  if (file.endsWith('.tsx')) return TsxParser;
  if (/\.[cm]?ts$/.test(file)) return TsParser;
  return acorn.Parser;
};

// acorn-walk lacks visitors for TS/JSX node types; descend into their children
// generically so a walk never throws on an unknown type.
function walkChildren(node, state, c) {
  for (const key in node) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range') continue;
    const value = node[key];
    for (const child of Array.isArray(value) ? value : [value]) {
      if (child && typeof child.type === 'string') c(child, state);
    }
  }
}
const walkBase = new Proxy(walk.base, { get: (base, type) => (type in base ? base[type] : walkChildren) });

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
  const files = collectSourceFiles(paths);
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

function collectSourceFiles(paths) {
  const filesUnder = (path) => statSync(path).isDirectory()
    ? readdirSync(path).flatMap((f) => (f === 'node_modules' ? [] : filesUnder(join(path, f))))
    : (SOURCE_RE.test(path) ? [path] : []);
  const files = paths.flatMap(filesUnder);
  if (!files.length) {
    console.error(`no .js/.ts files under: ${paths.join(', ')}`);
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
  return def.name.endsWith(')') ? def.name : `${def.name}(${params})`;
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
  }, walkBase);
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
    this.defs.sort((a, b) => a.file.localeCompare(b.file) || a.outer.start - b.outer.start);
  }

  /** Parse one file and record its definitions and imports. */
  indexFile(file) {
    const src = readFileSync(file, 'utf8');
    const comments = [];
    const parser = parserFor(file);
    let ast;
    try {
      ast = parser.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true, onComment: comments });
    } catch (e) { console.error(`// skipped ${file}: ${e.message}`); return; }

    // `node` is the function/class itself; `outer` includes any export wrapper.
    const seen = new Set();
    const record = (name, node, outer) => {
      const key = `${name}:${node.start}`;
      if (name && !seen.has(key)) {
        seen.add(key);
        this.addDef({ name, node, outer, file, src, comments });
      }
    };
    const outer = (node, ancestors) => {
      const parent = ancestors.at(-2);
      return parent?.type?.startsWith('Export') ? parent : node;
    };
    const keyName = (node) => node?.computed ? src.slice(node.key.start, node.key.end) : node?.key?.name ?? node?.key?.value;
    walk.ancestor(ast, {
      ImportDeclaration: (node) => {
        for (const spec of node.specifiers) this.imports.push({ file, local: spec.local.name, source: node.source.value });
      },
      FunctionDeclaration: (node, _state, ancestors) => record(node.id?.name, node, outer(node, ancestors)),
      ClassDeclaration: (node, _state, ancestors) => record(node.id?.name, node, outer(node, ancestors)),
      VariableDeclarator(node, _state, ancestors) {
        const wrapper = ancestors.find((a) => a.type?.startsWith('Export')) ?? node;
        if (node.init && /Function/.test(node.init.type)) record(node.id?.name, node.init, wrapper);
      },
      MethodDefinition(node, _state, ancestors) {
        const owner = [...ancestors].reverse().find((a) => /Class/.test(a.type) && a.id)?.id.name;
        record(`${owner ?? 'class'}.${keyName(node)}`, node, node);
      },
      Property(node) {
        if (node.value && /Function/.test(node.value.type)) record(keyName(node), node.value, node);
      },
      CallExpression(node) {
        const call = calleeName(node.callee);
        const label = call && node.arguments[0]?.type === 'Literal' ? `${call}(${JSON.stringify(node.arguments[0].value)})` : null;
        for (const arg of node.arguments) if (label && /Function/.test(arg.type)) record(label, arg, arg);
      },
    }, walkBase, this);
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
    }, walkBase);
    return [...found].filter((name) => name && this.defsByName.has(name) && name !== def.name);
  }

  /** Definition with the tightest span containing a line in a file. */
  enclosingDef(file, line) {
    return this.defs
      .filter((def) => def.file === file && line >= def.outer.loc.start.line && line <= def.outer.loc.end.line)
      .sort((a, b) => (a.outer.end - a.outer.start) - (b.outer.end - b.outer.start))[0];
  }

  /** One definition named `name` (optionally `path#name`), or a useful error. */
  defsNamed(selector) {
    const split = selector.lastIndexOf('#');
    const path = split === -1 ? null : selector.slice(0, split);
    const name = split === -1 ? selector : selector.slice(split + 1);
    const hits = this.defsByName.get(name);
    const selected = path ? hits?.filter((def) => displayPath(def.file) === path) : hits;
    if (selected?.length === 1) return selected;
    if (selected?.length > 1 || (hits?.length && !path)) {
      console.error(`ambiguous: ${name}\n${hits.map((def) => `  ${displayPath(def.file)}#${name}  ${locationOf(def)}`).join('\n')}\nUse path#name with extract; callers cannot distinguish same-named functions.`);
      process.exit(1);
    }
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
    const selected = name ? new Set(this.defsNamed(name)) : null;
    for (const def of this.defs) {
      if (selected && !selected.has(def)) continue;
      const callees = this.callsIn(def).map((name) => {
        const hits = this.defsByName.get(name);
        return hits.length === 1 ? `${displayPath(hits[0].file)}#${name}` : `${name}?`;
      });
      if (callees.length) console.log(`${displayPath(def.file)}#${def.name} -> ${callees.join(', ')}`);
    }
  }

  callers(name) {
    const plainName = name?.slice(name.lastIndexOf('#') + 1);
    if ((this.defsByName.get(plainName)?.length ?? 0) > 1) {
      console.error(`callers unavailable: ${plainName} has multiple definitions; name-based calls cannot identify the target`);
      process.exit(1);
    }
    this.defsNamed(name);
    const callers = this.defs
      .map((def) => [def, callSites(def, plainName)])
      .filter(([def, sites]) => sites.length && def.name !== plainName);
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
