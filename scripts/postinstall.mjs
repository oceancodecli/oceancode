/**
 * Fail-soft postinstall check for oceancode.
 *
 * The `opencode-ai` dependency ships the `opencode` backend binary that the
 * CLI shells out to (`opencode serve`). This script only VERIFIES it resolves
 * from PATH and prints friendly guidance if not — it must NEVER fail the
 * install (exit code is always 0).
 */
import { spawnSync } from "node:child_process";

try {
  const cmd = process.platform === "win32" ? "where" : "which";
  const res = spawnSync(cmd, ["opencode"], { encoding: "utf-8", shell: false });
  if (res.status === 0) {
    const foundAt = (res.stdout || "").split(/\r?\n/).filter(Boolean)[0] || "on PATH";
    console.log(`\x1b[32m✔ oceancode: backend 'opencode' found (${foundAt}). You're ready — run \`oceancode\`.\x1b[0m`);
  } else {
    console.log(
      "\x1b[33m⚠ oceancode: the 'opencode' backend binary was not found on PATH.\n" +
        "  It is bundled via the 'opencode-ai' dependency — if this was a global install, " +
        "make sure your npm global bin dir is on PATH, or run: npm install -g opencode-ai\x1b[0m"
    );
  }
} catch {
  // Intentionally silent — postinstall must never break installation.
}
process.exit(0);
