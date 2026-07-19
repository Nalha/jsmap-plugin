# jsmap skill

A hook-free plugin with one skill: `skills/jsmap/` holds `SKILL.md` and the
`jsmap.js` CLI it tells the agent to run (API listings, call graphs, callers,
extraction). Both Claude Code (`.claude-plugin/`) and Codex (`.codex-plugin/` +
`.agents/plugins/marketplace.json`) install it from this repo's marketplace.
Bump `version` in both plugin.json files when shipping a change.

Acorn is vendored as two self-contained ESM files in `skills/jsmap/vendor/` (no
`node_modules` at install time). Refresh with `npm run vendor` after bumping the
version in `skills/jsmap/package.json`.

## The one contract that matters

Agents invoke `node skills/jsmap/jsmap.js <cmd> <path...> [arg]` per `SKILL.md`.
Command names, argument order, and stdout format are the public interface. After
touching `jsmap.js`, run every command against it, e.g.
`node skills/jsmap/jsmap.js api skills/jsmap/jsmap.js`.
