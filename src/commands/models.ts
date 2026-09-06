import chalk from "chalk";
import { ensureServer } from "../server/manager.js";
import { OceanClient } from "../server/client.js";
import { getLayoutDimensions } from "../ui/layout.js";
import { getAvailableOceanModels } from "../models/registry.js";
import { getStoredCredentials, SUPPORTED_BYOK_PROVIDERS } from "../server/auth.js";

export async function listModelsCommand(options?: { provider?: string; all?: boolean }) {
  const baseUrl = await ensureServer();
  const client = new OceanClient(baseUrl);
  const { leftMargin } = getLayoutDimensions();
  const indent = " ".repeat(leftMargin);
  const creds = getStoredCredentials();
  const available = getAvailableOceanModels(creds);

  console.log("");
  console.log(`${indent}${chalk.hex("#00d2ff").bold("Ocean AI Models")}`);
  console.log(`${indent}${chalk.dim("Switch anytime in chat with /models")}\n`);
  console.log(`${indent}${chalk.dim("-".repeat(54))}`);

  const freeModels = available.filter((m) => m.isFree);
  const byokModels = available.filter((m) => !m.isFree);

  console.log(`${indent}${chalk.bold.hex("#00f2fe")("Free Built-in Models:")}`);
  for (const m of freeModels) {
    const badge = chalk.bgHex("#00b4d8").black.bold(` ${m.tag} `);
    console.log(`${indent}  ${badge} ${chalk.white.bold(m.name.padEnd(30))} ${chalk.dim(m.description)}`);
  }

  if (byokModels.length > 0) {
    console.log(`\n${indent}${chalk.bold.hex("#3a7bd5")("Connected BYOK Models:")}`);
    for (const m of byokModels) {
      const badge = chalk.bgHex("#10b981").black.bold(` ${m.tag} `);
      console.log(`${indent}  ${badge} ${chalk.white.bold(m.name.padEnd(30))} ${chalk.dim(m.description)}`);
    }
  }

  // Show status of unconnected providers
  const unconnected = SUPPORTED_BYOK_PROVIDERS.filter((p) => !creds[p.id]?.key);
  if (unconnected.length > 0) {
    console.log(`\n${indent}${chalk.dim("Connect more models via 'oceancode connect <provider> <key>' or /connect in chat:")}`);
    console.log(`${indent}${chalk.dim(`Unlinked: ${unconnected.map((p) => p.name).join(", ")}`)}`);
  }

  console.log(`\n${indent}${chalk.dim("Tip: Type /models in interactive chat to switch models with arrow keys.")}\n`);
}
