# jsmap skill

An Agent Skill that explores JS files without reading them (API listings, call
graphs, callers, extraction). The repo root is the skill: `SKILL.md` and the
`jsmap.js` CLI it tells the agent to run. Installed by cloning into the Claude
Code or Codex skills directory.

Acorn is vendored as two self-contained ESM files in `vendor/` (no `node_modules`
at install time). Refresh with `npm run vendor` after bumping the version in
`package.json`.

## The one contract that matters

Agents invoke `node jsmap.js <cmd> <path...> [arg]` per `SKILL.md`. Command names,
argument order, and stdout format are the public interface. After touching
`jsmap.js`, run every command against it, e.g. `node jsmap.js api jsmap.js`.
