---
name: jsmap
description: Explore JavaScript codebases compactly. Lists a file's API, maps name-based call graphs, finds candidate callers of uniquely named functions, locates which function contains a string, and extracts one function with callee signatures. Use before reading large .js files when answering "what's in this file", "where is X", "what does X call", or "which function contains this line". JS only; not for .ts/.tsx.
---

# jsmap

Run it from the shell — the plugin puts `jsmap` on `PATH`:

```
jsmap <cmd> <path...> [arg]
```

Only if that command is not found, fall back to
`node <directory containing this SKILL.md>/jsmap.js <cmd> <path...> [arg]`.
Never search the filesystem for `jsmap.js`.

Its stdout is your answer — the command reference below is how you choose the
arguments. Do not reproduce the operation with grep or by reading the file.

Paths are files or directories (directories recurse `.js`, skipping `node_modules`).
Use **relative, forward-slash** paths — `web`, `web/model/units.js`. Never absolute
Windows paths (`C:\...`); the shell eats the backslashes.

Prefer these compact views before reading a large JS file. Read the reported span when
the body or exact module resolution matters.

## Commands

| Command | Answers |
|---|---|
| `api <path...>` | What's in here? Signatures + first JSDoc line + spans, no bodies. |
| `search <path...> <regex>` | Which functions contain this string, and where are they? |
| `callers <path...> <name>` | Candidate callers of a uniquely named function. |
| `graph <path...> [name]` | File-qualified call edges; `?` marks ambiguous callee names. |
| `extract <path...> <name>` | Body of one function + callee signatures; use `path#name` if ambiguous. |
| `where <file> <line>` | Which function is this line in? |

## Recipes

- Cold on a file → `api <file>`, not `Read`.
- Cold on a codebase → `graph <dir>`, then `api` on the file that matters.
- "Where is X used?" → `search <dir> X`.
- "Where might unique X be called?" → `callers <dir> X`; confirm module resolution before impact decisions.
- "What does X do?" → `extract <file> X`. Callee contracts included; usually enough to stop there.
- Stack trace at a line → `where <file> <line>`, then `extract`.
- Unused definitions or exports → that's lint's job, not jsmap's.
