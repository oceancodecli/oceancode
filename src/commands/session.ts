import chalk from "chalk";
import { ensureServer } from "../server/manager.js";
import { OceanClient } from "../server/client.js";
import { getLayoutDimensions } from "../ui/layout.js";

export async function sessionCommand() {
  const baseUrl = await ensureServer();
  const client = new OceanClient(baseUrl);
  const { leftMargin } = getLayoutDimensions();
  const indent = " ".repeat(leftMargin);

  console.log("");
  console.log(`${indent}${chalk.hex("#00d2ff").bold("Recent Sessions")}`);
  console.log(`${indent}${chalk.dim("-".repeat(54))}`);

  try {
    const sessions = await client.listSessions(10);
    if (!sessions || sessions.length === 0) {
      console.log(`${indent}${chalk.dim("No previous sessions found.")}\n`);
      return;
    }

    for (const s of sessions) {
      const date = new Date(s.time?.created || Date.now()).toLocaleDateString();
      const tokens = (s.tokens?.input || 0) + (s.tokens?.output || 0);
      console.log(`${indent}${chalk.cyan(s.id.slice(0, 16))}  ${chalk.bold.white(s.title || "Untitled")}`);
      console.log(`${indent}  ${chalk.dim(date)} · ${chalk.dim(`${tokens} tokens`)} · ${chalk.dim(s.directory)}`);
      console.log("");
    }
  } catch (err: any) {
    console.error(`${indent}${chalk.red(`Failed to list sessions: ${err.message}`)}`);
  }
}
