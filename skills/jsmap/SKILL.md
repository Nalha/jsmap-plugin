---
name: jsmap
description: Explore JavaScript codebases without reading the files. Lists a file's API (signatures + docs, no bodies), maps call graphs, finds the real callers of a function, locates which function contains a string, and extracts one function with its callees' signatures. Use BEFORE Read or Grep on any .js file — when answering "what's in this file", "where is X", "who calls X", "what does X call", "how is this wired", or "which function contains this line". JS only; not for .ts/.tsx.
---

# jsmap

A PostToolUse hook runs jsmap for you and injects the result as an
`additionalContext` block right after this text. Read that block — it is your
answer.

You invoke this skill with `<cmd> <path...> [arg]` as the arguments — the command
reference below is how you choose them.

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
