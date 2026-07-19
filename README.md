# jsmap

An [Agent Skill](https://agentskills.io) for exploring JavaScript codebases without
reading whole files. Lists a file's API (signatures + docs, no bodies), maps call
graphs, finds real callers of a function, locates which function contains a string,
and extracts one function with its callees' signatures.

The plugin bundles one skill: `skills/jsmap/` holds `SKILL.md` and the `jsmap.js` CLI
it shells out to (acorn vendored in `vendor/`, so no `npm install` needed). Requires Node.

## Install

Claude Code — via the marketplace, so `/plugin marketplace update jsmap` pulls updates:

```
/plugin marketplace add Nalha/jsmap-plugin
/plugin install jsmap@jsmap
```

Codex — via the marketplace:

```
codex plugin marketplace add Nalha/jsmap-plugin
codex plugin add jsmap@jsmap
```

## Usage

The agent triggers it automatically on JS-exploration questions, or invoke
directly, e.g. `/jsmap` in Claude Code. Under the hood it runs:

```
node skills/jsmap/jsmap.js <cmd> <path...> [arg]
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
