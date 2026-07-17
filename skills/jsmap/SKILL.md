---
name: jsmap
description: Explore JavaScript codebases without reading the files. Lists a file's API (signatures + docs, no bodies), maps call graphs, finds the real callers of a function, locates which function contains a string, and extracts one function with its callees' signatures. Use BEFORE Read or Grep on any .js file — when answering "what's in this file", "where is X", "who calls X", "what does X call", "how is this wired", or "which function contains this line". JS only; not for .ts/.tsx.
---

# jsmap

A PostToolUse hook runs this automatically and injects the result as an
`additionalContext` block right after this text. **If that block is present, you
already have the output — do NOT run `node jsmap.js` yourself. Read the block and
move on.** Running it again via Bash is redundant and wrong.

Only if no `additionalContext` block follows, run
`node <base directory shown above>/jsmap.js <ARGUMENTS>` via Bash yourself as a
fallback; never fall back to Read/Grep instead.

The command reference below is for that fallback case and for reading the output —
not an instruction to invoke node when the hook already answered.

`node jsmap.js <cmd> <path...> [arg]`

Paths are files or directories (directories recurse `.js`, skipping `node_modules`).
Use **relative, forward-slash** paths — `web`, `web/model/units.js`. Never absolute
Windows paths (`C:\...`); the shell eats the backslashes.

**Never Read a JS file to find out what's in it. Never grep-then-read to find where
something is.** Read only once you know the span — `api`/`search`/`callers` hand you spans.

## Commands

| Command | Answers |
|---|---|
| `api <path...>` | What's in here? Signatures + first JSDoc line + spans, no bodies. |
| `search <path...> <regex>` | Which functions contain this string, and where are they? |
| `callers <path...> <name>` | Who calls this? Call nodes only, not imports or comments. |
| `graph <path...> [name]` | How is this wired? One `a -> b, c` edge line per function. |
| `extract <path...> <name>` | Body of one function + every callee's signature and doc. |
| `where <file> <line>` | Which function is this line in? |

## Recipes

- Cold on a file → `api <file>`, not `Read`.
- Cold on a codebase → `graph <dir>`, then `api` on the file that matters.
- "Where is X used?" → `search <dir> X`.
- "Is it safe to change X?" → `callers <dir> X`. Callers in another module = cross-surface.
- "What does X do?" → `extract <file> X`. Callee contracts included; usually enough to stop there.
- Stack trace at a line → `where <file> <line>`, then `extract`.
- Unused definitions or exports → that's lint's job, not jsmap's.
