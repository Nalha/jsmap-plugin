const path = require("path");
const { execFileSync } = require("child_process");

let data = "";
process.stdin.on("data", (c) => (data += c));
process.stdin.on("end", () => {
  let input;
  try {
    input = JSON.parse(data);
  } catch {
    return;
  }

  const skill = input.tool_input && input.tool_input.skill;
  const args = input.tool_input && input.tool_input.args;
  if (skill !== "jsmap" || !args) return;

  const jsmapPath = path.join(__dirname, "..", "skills", "jsmap", "jsmap.js");
  let out;
  try {
    out = execFileSync("node", [jsmapPath, ...args.split(/\s+/)], {
      encoding: "utf8",
      cwd: process.cwd(),
    });
  } catch (e) {
    out = (e.stdout || "") + (e.stderr || e.message);
  }

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: out },
    })
  );
});
