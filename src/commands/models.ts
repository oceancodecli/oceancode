import chalk from "chalk";
import { ensureServer } from "../server/manager.js";
import { OceanClient } from "../server/client.js";
import { getLayoutDimensions } from "../ui/layout.js";
import { getAvailableOceanModels } from "../models/registry.js";

export async function listModelsCommand(options?: { provider?: string; all?: boolean }) {
  const { leftMargin } = getLayoutDimensions();
  const indent = " ".repeat(leftMargin);
  const available = getAvailableOceanModels();

  if (options?.all) {
    try {
      const baseUrl = await ensureServer();
      const client = new OceanClient(baseUrl);
      const serverModels = await client.getModels();
      console.log(`\n${indent}${chalk.bold.hex("#00f2fe")(`All Models from Server (${serverModels.length}):`)}`);
      for (const m of serverModels) {
        console.log(`${indent}  • ${chalk.white.bold(m.id.padEnd(35))} ${chalk.dim(m.providerID)}`);
      }
      return;
    } catch {}
  }

  console.log("");
  console.log(`${indent}${chalk.hex("#00d2ff").bold("Ocean AI Models")}`);
  console.log(`${indent}${chalk.dim("Switch anytime in chat with /models")}\n`);
  console.log(`${indent}${chalk.dim("-".repeat(40))}`);

  for (const m of available) {
    console.log(`${indent}  • ${chalk.white.bold(m.name)}`);
  }

  console.log(`\n${indent}${chalk.dim("Tip: Type /models in interactive chat to switch models with arrow keys.")}\n`);
}
