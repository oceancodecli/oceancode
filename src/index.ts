#!/usr/bin/env node
import { Command } from "commander";
import { interactiveChatCommand } from "./commands/interactive.js";
import { runCommand } from "./commands/run.js";
import { listModelsCommand } from "./commands/models.js";
import { sessionCommand } from "./commands/session.js";
import { statsCommand } from "./commands/stats.js";
import { ensureServer } from "./server/manager.js";
import { initializeAgentsDoc } from "./utils/init.js";
import { getStoredCredentials, saveProviderKey, validateProviderKey, removeProviderKey, SUPPORTED_BYOK_PROVIDERS } from "./server/auth.js";
import { getConfiguredMcpServers, saveMcpServer, fetchLiveMcpStatus, McpServerConfig } from "./server/mcp.js";
import { getBigLogo } from "./ui/layout.js";
import chalk from "chalk";

process.title = "oceancode";
if (process.stdout.isTTY) {
  process.stdout.write("\x1b]0;oceancode\x07");
  process.stdout.write("\x1b]2;oceancode\x07");
}

const program = new Command();
program.enablePositionalOptions();

program
  .name("oceancode")
  .description("OceanCode CLI: Next-generation AI coding assistant built for large codebases")
  .version("0.1.2")
  .addHelpText("before", `\n${getBigLogo()}\n`);

// Default command: launch interactive chat
program
  .option("-m, --model <model>", "Model to use (default: ocean/Qwen3.6-35B-A3B)")
  .action(async (options) => {
    try {
      await interactiveChatCommand({ model: options.model });
    } catch (err: any) {
      if (process.stdout.isTTY) {
        const rows = process.stdout.rows || 24;
        process.stdout.write(`\x1b[1;${rows}r\x1b[?25h\n`);
      }
      console.error(chalk.red(`\nAn error occurred: ${err?.message || err}\n`));
      process.exit(1);
    }
  });

program
  .command("run [message...]")
  .description("Run a prompt or instruction directly")
  .option("-m, --model <model>", "Model to use (default: ocean/Qwen3.6-35B-A3B)")
  .option("-a, --agent <agent>", "Agent mode (default: build)")
  .option("--auto", "Auto-approve tool permissions")
  .action(async (messages: string[], options, cmd) => {
    const opts = cmd?.optsWithGlobals ? cmd.optsWithGlobals() : options;
    await runCommand(messages, opts);
    process.exit(0);
  });

program
  .command("init")
  .description("Initialize codebase context and generate or update AGENTS.md")
  .action(async () => {
    try {
      const res = initializeAgentsDoc(process.cwd());
      console.log(chalk.green(`✔ ${res.summary}`));
      console.log(chalk.dim(`  Path: ${res.filePath}`));
    } catch (err: any) {
      console.error(chalk.red(`Error initializing AGENTS.md: ${err.message}`));
    }
    process.exit(0);
  });

program
  .command("connect [provider] [key]")
  .alias("login")
  .description("Link provider API keys (OpenAI, Anthropic, Gemini, DeepSeek, Groq, OpenRouter)")
  .action(async (provider?: string, key?: string) => {
    if (provider && key) {
      console.log(chalk.cyan(`Validating API key with ${provider.toUpperCase()}...`));
      const val = await validateProviderKey(provider, key);
      if (val.valid) {
        saveProviderKey(provider, key);
        console.log(chalk.green(`✔ ${val.message}`));
      } else {
        console.error(chalk.red(`✖ Validation failed: ${val.message}`));
        process.exit(1);
      }
      process.exit(0);
    }

    const creds = getStoredCredentials();
    console.log(chalk.bold("\nBring Your Own Key (BYOK) Status:"));
    for (const p of SUPPORTED_BYOK_PROVIDERS) {
      const isSet = Boolean(creds[p.id]?.key);
      const badge = isSet ? chalk.green("✔ Connected") : chalk.dim("Not linked");
      console.log(`  • ${p.name.padEnd(16)} (${p.id}): ${badge}`);
    }
    console.log(chalk.dim("\nTo link a key, run:"));
    console.log(chalk.cyan("  oceancode connect <provider> <api-key>"));
    console.log(chalk.dim("Examples:"));
    console.log("  oceancode connect openai sk-proj-...");
    console.log("  oceancode connect anthropic sk-ant-...");
    console.log("  oceancode connect google AIzaSy...");
    console.log("  oceancode connect deepseek sk-...\n");
    process.exit(0);
  });

program
  .command("logout [provider]")
  .alias("disconnect")
  .description("Disconnect/remove linked provider API keys or log out all")
  .action(async (provider?: string) => {
    if (provider && provider.toLowerCase() !== "all") {
      removeProviderKey(provider);
      console.log(chalk.green(`✔ Disconnected API key for ${provider}.`));
    } else {
      for (const p of SUPPORTED_BYOK_PROVIDERS) {
        removeProviderKey(p.id);
      }
      console.log(chalk.green("✔ Disconnected all provider API keys."));
    }
    process.exit(0);
  });

program
  .command("mcp")
  .description("List or configure Model Context Protocol (MCP) servers")
  .allowUnknownOption()
  .passThroughOptions()
  .argument("[action]", "list or add")
  .argument("[name]", "server name")
  .argument("[command...]", "command or url")
  .action(async (action?: string, name?: string, commandArgs?: string[]) => {
    const act = (action || "list").toLowerCase();

    if (act === "add") {
      if (!name || !commandArgs || commandArgs.length === 0) {
        console.error(chalk.red("Usage: oceancode mcp add <name> <command-or-url>"));
        console.log("Example: oceancode mcp add filesystem npx -y @modelcontextprotocol/server-filesystem .");
        process.exit(1);
      }

      const target = commandArgs.join(" ");
      const isUrl = target.startsWith("http://") || target.startsWith("https://");
      const config: McpServerConfig = isUrl
        ? { type: "remote", url: target, enabled: true }
        : { type: "local", command: commandArgs, enabled: true };

      saveMcpServer(name, config);
      console.log(chalk.green(`✔ Added MCP server "${name}" (${config.type}) to opencode.json`));
      process.exit(0);
    }

    // List MCP servers
    const baseUrl = await ensureServer();
    const configured = getConfiguredMcpServers();
    const live = await fetchLiveMcpStatus(baseUrl);
    const allNames = Array.from(new Set([...Object.keys(configured), ...Object.keys(live)]));

    console.log(chalk.bold("\nModel Context Protocol (MCP) Servers:"));
    if (allNames.length === 0) {
      console.log(chalk.dim("  No MCP servers configured."));
      console.log(chalk.dim("\nTo add an MCP server, run:"));
      console.log(chalk.cyan("  oceancode mcp add <name> <command-or-url>"));
    } else {
      for (const n of allNames) {
        const conf = configured[n] || {};
        const isLive = live[n] !== undefined;
        const type = conf.type || (conf.url ? "remote" : "local");
        const target = conf.url || (conf.command ? conf.command.join(" ") : "active");
        const status = isLive ? chalk.green("● Connected") : chalk.cyan("● Configured");
        console.log(`  • ${chalk.bold(n)} (${type}) ${status}\n    ${chalk.dim(target)}`);
      }
    }
    console.log();
    process.exit(0);
  });

program
  .command("models")
  .description("List available AI models (highlighting free models)")
  .option("-p, --provider <provider>", "Filter by provider")
  .option("--all", "Show all models across all providers")
  .action(async (options) => {
    await listModelsCommand(options);
    process.exit(0);
  });

program
  .command("session")
  .description("Manage and inspect coding sessions")
  .action(async () => {
    await sessionCommand();
    process.exit(0);
  });

program
  .command("stats")
  .description("View token consumption and session statistics")
  .action(async () => {
    await statsCommand();
    process.exit(0);
  });

program
  .command("serve")
  .description("Ensure or start the Ocean server backend")
  .action(async () => {
    const url = await ensureServer();
    console.log(chalk.green(`✔ Ocean backend is running at: ${url}`));
  });

program.parse(process.argv);
