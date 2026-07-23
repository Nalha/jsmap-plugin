# jsmap skill

A hook-free plugin with one skill: `skills/jsmap/` holds `SKILL.md` and the
`jsmap.js` CLI it tells the agent to run (API listings, call graphs, callers,
extraction). Both Claude Code (`.claude-plugin/`) and Codex (`.codex-plugin/` +
`.agents/plugins/marketplace.json`) install it from this repo's marketplace.
Bump `version` in both plugin.json files when shipping a change.

Acorn, acorn-walk, and `@sveltejs/acorn-typescript` (the maintained fork; parses
`.ts`/`.tsx`) are vendored as self-contained ESM files in `skills/jsmap/vendor/`
(no `node_modules` at install time). `npm run vendor` refreshes them, rewriting
the fork's bare `acorn` import to the vendored `./acorn.mjs`.

## The one contract that matters

Agents invoke `node skills/jsmap/jsmap.js <cmd> <path...> [arg]` per `SKILL.md`.
Command names, argument order, and stdout format are the public interface. After
touching `jsmap.js`, run every command against it, e.g.
`node skills/jsmap/jsmap.js api skills/jsmap/jsmap.js`.
