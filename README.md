# jsmap

Claude Code plugin for exploring JavaScript codebases without reading whole files.
Lists a file's API (signatures + docs, no bodies), maps call graphs, finds real
callers of a function, locates which function contains a string, and extracts one
function with its callees' signatures.

A bundled `PostToolUse` hook runs jsmap automatically whenever the `jsmap` skill is
invoked and injects the result as context — no separate `Bash` call needed.

## Install

```
/plugin marketplace add Nalha/jsmap-plugin
/plugin install jsmap@jsmap
```

## Usage

Invoke the `jsmap` skill with a command and path, e.g.:

```
/jsmap api web/model/units.js
```

| Command | Answers |
|---|---|
| `api <path...>` | What's in here? Signatures + first JSDoc line + spans, no bodies. |
| `search <path...> <regex>` | Which functions contain this string, and where are they? |
| `callers <path...> <name>` | Who calls this? Call nodes only, not imports or comments. |
| `graph <path...> [name]` | How is this wired? One `a -> b, c` edge line per function. |
| `extract <path...> <name>` | Body of one function + every callee's signature and doc. |
| `where <file> <line>` | Which function is this line in? |

Paths are files or directories (directories recurse `.js`, skipping `node_modules`).
JS only — not `.ts`/`.tsx`.

## Structure

- `skills/jsmap/` — `SKILL.md` + `jsmap.js` (with vendored `acorn`/`acorn-walk`)
- `hooks/` — the auto-run `PostToolUse` hook (`hooks.json` + `jsmap-hook.js`)
- `.claude-plugin/` — plugin and marketplace manifests
