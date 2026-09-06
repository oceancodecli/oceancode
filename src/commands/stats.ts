import chalk from "chalk";
import { ensureServer } from "../server/manager.js";
import { OceanClient } from "../server/client.js";
import { getLayoutDimensions } from "../ui/layout.js";

export async function statsCommand() {
  const baseUrl = await ensureServer();
  const client = new OceanClient(baseUrl);
  const { leftMargin } = getLayoutDimensions();
  const indent = " ".repeat(leftMargin);

  console.log("");
  console.log(`${indent}${chalk.hex("#00d2ff").bold("Usage & Analytics")}`);
  console.log(`${indent}${chalk.dim("-".repeat(54))}`);

  try {
    const sessions = await client.listSessions(100);
    let totalTokens = 0;
    let totalInput = 0;
    let totalOutput = 0;
    let totalCost = 0;

    for (const s of sessions) {
      totalInput += s.tokens?.input || 0;
      totalOutput += s.tokens?.output || 0;
      totalCost += s.cost || 0;
    }
    totalTokens = totalInput + totalOutput;

    console.log(`${indent}${chalk.dim("Total Sessions:")}   ${chalk.bold.white(sessions.length)}`);
    console.log(`${indent}${chalk.dim("Total Tokens:")}     ${chalk.bold.cyan(totalTokens.toLocaleString())}`);
    console.log(`${indent}${chalk.dim("Input Tokens:")}     ${chalk.white(totalInput.toLocaleString())}`);
    console.log(`${indent}${chalk.dim("Output Tokens:")}    ${chalk.white(totalOutput.toLocaleString())}`);
    console.log(`${indent}${chalk.dim("Total Cost:")}       ${chalk.bold.green("$" + totalCost.toFixed(4))} ${chalk.bgHex("#00b4d8").black.bold(" FREE ")}`);
    console.log("");
  } catch (err: any) {
    console.error(`${indent}${chalk.red(`Failed to load stats: ${err.message}`)}`);
  }
}
