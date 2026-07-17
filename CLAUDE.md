# jsmap plugin

A Claude Code plugin that explores JS files without reading them (API listings, call
graphs, callers, extraction). Installed via its own marketplace.

## Layout

- `.claude-plugin/` — the shipped manifest. `plugin.json` (name/version, points at skills
  and hooks) and `marketplace.json` (this repo is its own single-plugin marketplace).
- `skills/jsmap/` — `SKILL.md` (what Claude reads) and `jsmap.js` (the CLI it shells out to).
  Its one dependency, acorn, is vendored as two self-contained ESM files in `vendor/` (not
  a committed `node_modules`, since installed plugins get no `npm install`). Refresh with
  `npm run vendor` after bumping the version in `package.json`.
- `hooks/` — `hooks.json` (PostToolUse matcher on `Skill`) and `jsmap-hook.js`, which runs
  `jsmap.js` and injects its output back as context.
- `.claude/` — local dev config, not shipped. `settings.local.json` is per-developer and
  gitignored; a shared `settings.json` could be committed but there isn't one.

## The one contract that matters

The hook invokes `jsmap.js` over the CLI: `node jsmap.js <cmd> <path...> [arg]`. Command
names, argument order, and stdout format are the public interface — changing them breaks the
hook silently. After touching `jsmap.js`, run every command against it and check the hook
still works:

```
echo '{"tool_input":{"skill":"jsmap:jsmap","args":"api skills/jsmap/jsmap.js"}}' | node hooks/jsmap-hook.js
```

Bump `version` in `plugin.json` when shipping a change.
