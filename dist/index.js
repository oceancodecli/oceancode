#!/usr/bin/env node
import {
  OCEAN_BLUE,
  OceanClient,
  SUPPORTED_BYOK_PROVIDERS,
  StreamRenderer,
  ensureServer,
  getAvailableOceanModels,
  getBackendModelId,
  getBigLogo,
  getFriendlyModelName,
  getLayoutDimensions,
  getStoredCredentials,
  removeProviderKey,
  renderTopBar,
  renderUserMessageCard,
  runCommand,
  saveProviderKey,
  validateProviderKey
} from "./chunk-U5PZQWEB.js";

// src/index.ts
import { Command } from "commander";

// src/commands/interactive.ts
import readline from "readline";
import chalk from "chalk";

// src/utils/init.ts
import fs from "fs";
import path from "path";
function initializeAgentsDoc(workspaceDir = process.cwd()) {
  const agentsPath = path.join(workspaceDir, "AGENTS.md");
  const alreadyExists = fs.existsSync(agentsPath);
  let projectType = "General Codebase";
  let techDetails = [];
  let buildCommands = [];
  let testCommands = [];
  let conventions = [];
  const pkgJsonPath = path.join(workspaceDir, "package.json");
  const tsConfigPath = path.join(workspaceDir, "tsconfig.json");
  const pyProjectPath = path.join(workspaceDir, "pyproject.toml");
  const reqTxtPath = path.join(workspaceDir, "requirements.txt");
  const cargoPath = path.join(workspaceDir, "Cargo.toml");
  const goModPath = path.join(workspaceDir, "go.mod");
  if (fs.existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
      projectType = `Node.js / JavaScript${fs.existsSync(tsConfigPath) ? " / TypeScript" : ""}`;
      if (pkg.name) techDetails.push(`- **Project Name**: ${pkg.name}`);
      if (pkg.version) techDetails.push(`- **Version**: ${pkg.version}`);
      if (pkg.description) techDetails.push(`- **Description**: ${pkg.description}`);
      if (pkg.scripts) {
        if (pkg.scripts.build) buildCommands.push(`- Build: \`npm run build\` (${pkg.scripts.build})`);
        if (pkg.scripts.test) testCommands.push(`- Test: \`npm test\` (${pkg.scripts.test})`);
        if (pkg.scripts.dev) buildCommands.push(`- Dev: \`npm run dev\` (${pkg.scripts.dev})`);
        if (pkg.scripts.lint) buildCommands.push(`- Lint: \`npm run lint\` (${pkg.scripts.lint})`);
      }
      const deps = Object.keys(pkg.dependencies || {});
      const devDeps = Object.keys(pkg.devDependencies || {});
      if (deps.length > 0) {
        techDetails.push(`- **Core Dependencies**: ${deps.slice(0, 15).join(", ")}${deps.length > 15 ? ` (+${deps.length - 15} more)` : ""}`);
      }
      if (devDeps.length > 0) {
        techDetails.push(`- **Dev Dependencies**: ${devDeps.slice(0, 10).join(", ")}`);
      }
    } catch {
    }
  } else if (fs.existsSync(pyProjectPath) || fs.existsSync(reqTxtPath)) {
    projectType = "Python Project";
    testCommands.push("- Test: `pytest`");
    buildCommands.push("- Run: `python main.py`");
  } else if (fs.existsSync(cargoPath)) {
    projectType = "Rust Project";
    buildCommands.push("- Build: `cargo build`");
    testCommands.push("- Test: `cargo test`");
  } else if (fs.existsSync(goModPath)) {
    projectType = "Go Project";
    buildCommands.push("- Build: `go build ./...`");
    testCommands.push("- Test: `go test ./...`");
  }
  const dirs = [];
  try {
    const entries = fs.readdirSync(workspaceDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules" && e.name !== "dist") {
        dirs.push(e.name);
      }
    }
  } catch {
  }
  const agentsContent = `# AGENTS.md - Repository Guidelines & AI Context

This document guides AI agents (like OceanCode) working in this repository to ensure accurate, non-hallucinatory, and maintainable software engineering.

## Project Overview
- **Project Type**: ${projectType}
- **Root Directory**: \`${workspaceDir}\`
${techDetails.join("\n")}

## Key Directories
${dirs.length > 0 ? dirs.map((d) => `- \`${d}/\``).join("\n") : "- Single root project directory"}

## Build & Test Workflow
${buildCommands.length > 0 ? buildCommands.join("\n") : "- Standard build scripts"}
${testCommands.length > 0 ? testCommands.join("\n") : "- Standard unit tests"}

## Coding Rules for AI Agents
1. **Never Hallucinate or Truncate**:
   - Always produce full, working code when writing or updating files.
   - Never insert placeholder comments like \`// ... existing code ...\` or \`// TODO\`.
2. **Search & Read First**:
   - Use \`glob\` and \`grep\` to verify types, exports, and imports across the codebase before modifying or adding code.
   - For files over 200 lines, use chunked reading (\`offset\` and \`limit\`) to inspect specific functions or classes.
3. **Surgical Modifications**:
   - When updating existing files, always use \`edit\` with exact matching lines rather than overwriting the entire file with \`write\`.
4. **Verification**:
   - After completing edits, run available verification scripts or tests via \`bash\` to ensure syntax, compilation, and tests succeed.
5. **Readable, Structured Formatting (No Walls of Text)**:
   - Never output dense, unbroken walls of text.
   - Always format explanations with markdown tables, clear bullet points with contextual emojis (\u{1F4C1}, \u{1F527}, \u{1F4A1}, \u26A1, \u{1F680}, \u26A0\uFE0F, \u2705, \u{1F4CC}, \u{1F3AF}), numbered steps, bold keywords, and fenced code blocks.
`;
  fs.writeFileSync(agentsPath, agentsContent, "utf-8");
  return {
    filePath: agentsPath,
    created: !alreadyExists,
    projectType,
    summary: `Configured context for ${projectType}. Generated repository guidelines in AGENTS.md.`
  };
}

// src/server/mcp.ts
import path2 from "path";
import os from "os";
import fs2 from "fs";
function getOpencodeConfigPath() {
  return path2.join(os.homedir(), ".config", "oceancode", "opencode", "opencode.json");
}
function getConfiguredMcpServers() {
  const configPath = getOpencodeConfigPath();
  if (!fs2.existsSync(configPath)) return {};
  try {
    const raw = fs2.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed.mcp || {};
  } catch {
    return {};
  }
}
function saveMcpServer(name, config) {
  const configPath = getOpencodeConfigPath();
  const dir = path2.dirname(configPath);
  fs2.mkdirSync(dir, { recursive: true });
  let fullConfig = {};
  if (fs2.existsSync(configPath)) {
    try {
      fullConfig = JSON.parse(fs2.readFileSync(configPath, "utf-8"));
    } catch {
    }
  }
  if (!fullConfig.mcp) fullConfig.mcp = {};
  fullConfig.mcp[name] = config;
  fs2.writeFileSync(configPath, JSON.stringify(fullConfig, null, 2), "utf-8");
  try {
    const projectConfig = path2.join(process.cwd(), "opencode.json");
    let proj = {};
    if (fs2.existsSync(projectConfig)) {
      proj = JSON.parse(fs2.readFileSync(projectConfig, "utf-8"));
    }
    if (!proj.mcp) proj.mcp = {};
    proj.mcp[name] = config;
    fs2.writeFileSync(projectConfig, JSON.stringify(proj, null, 2), "utf-8");
  } catch {
  }
}
async function fetchLiveMcpStatus(baseUrl) {
  try {
    const res = await fetch(`${baseUrl}/mcp`);
    if (!res.ok) return {};
    return await res.json();
  } catch {
    return {};
  }
}

// src/commands/interactive.ts
var COMMANDS = [
  { name: "/init", desc: "Initializes context / updates AGENTS.md" },
  { name: "/goal", desc: "Sets/manages autonomous completion loops" },
  { name: "/new", desc: "Clears conversation buffer for a fresh session" },
  { name: "/undo", desc: "Rolls back the last prompt and file changes" },
  { name: "/redo", desc: "Re-applies or regenerates the last action" },
  { name: "/models", desc: "Opens model picker UI to switch active LLMs" },
  { name: "/connect", desc: "Launches popup setup to link & verify provider API keys" },
  { name: "/mcp", desc: "Lists & configures Model Context Protocol servers" },
  { name: "/diff", desc: "Inspect files modified in session" },
  { name: "/agent", desc: "Switch mode (build / plan)" },
  { name: "/compact", desc: "Compact & summarize session memory" },
  { name: "/clear", desc: "Clear conversation canvas" },
  { name: "/info", desc: "Session details & status" },
  { name: "/help", desc: "Help & commands" },
  { name: "/exit", desc: "Exit the app" }
];
var THINKING_FRAMES = [
  chalk.hex("#f59e0b").bold("  \u224B Thinking   "),
  chalk.hex("#fbbf24").bold("  \u224B Thinking.  "),
  chalk.hex("#fde68a").bold("  \u224B Thinking.. "),
  chalk.hex("#fef08a").bold("  \u224B Thinking..."),
  chalk.hex("#fde68a").bold("  \u224B Thinking.. "),
  chalk.hex("#fbbf24").bold("  \u224B Thinking.  "),
  chalk.hex("#f59e0b").bold("  \u224B Thinking   "),
  chalk.dim("  \u224B Thinking   ")
];
async function interactiveChatCommand(options) {
  let currentBackendModel = options?.model ? getBackendModelId(options.model) : "opencode/muse-spark-1.3-contributor-free";
  if (!process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const lines = [];
    for await (const line of rl) {
      lines.push(line);
    }
    if (lines.length > 0) {
      const { runCommand: runCommand2 } = await import("./run-WPMSAWQ3.js");
      await runCommand2(lines, { model: currentBackendModel });
    }
    return;
  }
  const baseUrl = await ensureServer();
  const client = new OceanClient(baseUrl);
  const conversationHistory = [];
  let session = await client.createSession("Ocean Session", process.cwd());
  let input = "";
  let mode = "normal";
  let menuIndex = 0;
  let modelIndex = 0;
  let modelSearch = "";
  let connectStep = "provider_list";
  let connectProviderIndex = 0;
  let connectKeyInput = "";
  let connectErrorMsg = "";
  let connectValidatingProv = "";
  let currentAgent = "build";
  let isProcessing = false;
  let activityTimeoutTimer = null;
  let userMsgId = null;
  let lastUserMsgId = null;
  let lastSubmittedPrompt = "";
  const renderer = new StreamRenderer();
  let currentScrollBottom = 0;
  let contentRow = 8;
  let lastBarStartRow = 0;
  const printToContent = (text) => {
    if (!process.stdout.isTTY) {
      process.stdout.write(text.endsWith("\n") ? text : text + "\n");
      return;
    }
    process.stdout.write(`\x1B[${contentRow};1H`);
    const formatted = text.endsWith("\n") ? text : text + "\n";
    process.stdout.write(formatted);
    const lineCount = (formatted.match(/\n/g) || []).length;
    contentRow = Math.min(currentScrollBottom || 20, contentRow + lineCount);
  };
  const getBarMetrics = (linesCount) => {
    const rows = process.stdout.rows || 24;
    const barRows = linesCount;
    const barStartRow = Math.max(1, rows - barRows + 1);
    const scrollBottom = Math.max(1, barStartRow - 1);
    return { rows, barRows, barStartRow, scrollBottom };
  };
  const applyScrollRegion = (scrollBottom) => {
    if (!process.stdout.isTTY) return;
    if (currentScrollBottom !== scrollBottom) {
      currentScrollBottom = scrollBottom;
      process.stdout.write(`\x1B[1;${scrollBottom}r`);
    }
  };
  const resetScrollRegion = () => {
    if (!process.stdout.isTTY) return;
    const rows = process.stdout.rows || 24;
    process.stdout.write(`\x1B[1;${rows}r`);
    currentScrollBottom = 0;
  };
  const cleanup = () => {
    if (activityTimeoutTimer) clearTimeout(activityTimeoutTimer);
    if (process.stdout.isTTY) {
      resetScrollRegion();
      const rows = process.stdout.rows || 24;
      if (lastBarStartRow > 0) {
        for (let r = lastBarStartRow; r <= rows; r++) {
          process.stdout.write(`\x1B[${r};1H\x1B[2K`);
        }
      }
      process.stdout.write(`\x1B[${rows};1H
\x1B[?25h`);
      try {
        process.stdin.setRawMode(false);
      } catch {
      }
    }
  };
  const resetActivityTimeout = () => {
    if (activityTimeoutTimer) clearTimeout(activityTimeoutTimer);
    activityTimeoutTimer = setTimeout(() => {
      if (isProcessing) {
        isProcessing = false;
        renderer.finish(currentAgent === "build" ? "Build" : "Plan");
        const friendlyName = getFriendlyModelName(currentBackendModel);
        process.stdout.write(
          chalk.yellow(
            `
\u26A0\uFE0F Operation timed out waiting for ${friendlyName}. You can retry or switch models with /models.
`
          )
        );
        render();
      }
    }, 18e4);
    activityTimeoutTimer.unref();
  };
  const buildBarLines = () => {
    const cols = process.stdout.columns || 80;
    const friendlyModel = getFriendlyModelName(currentBackendModel);
    const bar = chalk.hex(OCEAN_BLUE)("\u2502");
    const width = Math.min(cols - 4, 80);
    const peachBg = chalk.bgHex("#fba978").black;
    const lines = [];
    if (mode === "model_selector") {
      const header = "Select Model (\u2191/\u2193 to navigate, Enter to select, Esc to close)" + " ".repeat(Math.max(2, width - 60)) + chalk.dim("esc");
      lines.push(chalk.bold.white(header));
      lines.push(
        modelSearch ? `Search: ${modelSearch}` : chalk.dim("Search models (e.g. 1m, reasoning, gpt-4o, claude)")
      );
      lines.push("");
      const availableModels = getAvailableOceanModels();
      const searchLower = modelSearch.toLowerCase();
      const filtered = availableModels.filter(
        (m) => m.name.toLowerCase().includes(searchLower) || m.id.toLowerCase().includes(searchLower) || m.tag.toLowerCase().includes(searchLower) || m.description.toLowerCase().includes(searchLower)
      );
      if (modelIndex >= filtered.length) modelIndex = Math.max(0, filtered.length - 1);
      if (filtered.length === 0) {
        lines.push(chalk.dim("  No matching models found."));
      } else {
        const MAX_MODELS = 6;
        let startIdx = 0;
        if (filtered.length > MAX_MODELS) {
          startIdx = Math.max(0, Math.min(modelIndex - 2, filtered.length - MAX_MODELS));
        }
        const visibleModels = filtered.slice(startIdx, startIdx + MAX_MODELS);
        if (filtered.length > MAX_MODELS) {
          lines.push(chalk.dim(`  Models (${modelIndex + 1}/${filtered.length}) \xB7 \u2191/\u2193 to navigate`));
        }
        visibleModels.forEach((m, relIdx) => {
          const idx = startIdx + relIdx;
          const isCurrent = m.id === currentBackendModel;
          const prefix = isCurrent ? "\u25CF " : "  ";
          const left = prefix + m.name;
          const tag = m.tag || (m.isFree ? "Free" : "BYOK");
          const spaces = Math.max(2, width - left.length - tag.length);
          const row = left + " ".repeat(spaces) + tag;
          if (idx === modelIndex) {
            lines.push(peachBg(row));
            if (m.description) lines.push(chalk.dim(`    ${m.description}`));
          } else {
            lines.push(chalk.white(row));
          }
        });
      }
      lines.push("");
      lines.push(chalk.dim("Type /connect to link API keys (OpenAI, Anthropic, Gemini, DeepSeek, Groq)."));
    } else if (mode === "connect_modal") {
      const header = "Connect Provider (BYOK)" + " ".repeat(Math.max(2, width - 24)) + chalk.dim("esc");
      lines.push(chalk.bold.white(header));
      if (connectStep === "provider_list") {
        lines.push(chalk.dim("Select provider with \u2191/\u2193 and press Enter (or 'd' to disconnect):"));
        lines.push("");
        const creds = getStoredCredentials();
        SUPPORTED_BYOK_PROVIDERS.forEach((p, idx) => {
          const isConnected = Boolean(creds[p.id]?.key);
          const prefix = isConnected ? "\u25CF " : "\u25CB ";
          const left = `  ${prefix}${p.name.padEnd(16)} (${p.id})`;
          const tag = isConnected ? chalk.green("\u2714 Connected") : chalk.dim("Not linked");
          const spaces = Math.max(2, width - left.length - 12);
          const row = left + " ".repeat(spaces) + tag;
          lines.push(idx === connectProviderIndex ? peachBg(row) : chalk.white(row));
        });
        lines.push("");
        lines.push(chalk.dim("Enter: Link API Key  \u2022  d: Disconnect  \u2022  Esc: Close"));
      } else if (connectStep === "enter_key") {
        const prov = SUPPORTED_BYOK_PROVIDERS[connectProviderIndex];
        lines.push(chalk.bold.hex("#38bdf8")(`Provider: ${prov.name}`));
        lines.push(chalk.dim(`Placeholder format: ${prov.placeholder}`));
        lines.push("");
        const masked = connectKeyInput.length > 8 ? connectKeyInput.slice(0, 4) + "\u2022".repeat(connectKeyInput.length - 8) + connectKeyInput.slice(-4) : "\u2022".repeat(connectKeyInput.length);
        const displayKey = connectKeyInput ? masked : chalk.dim("Paste or type API key here");
        lines.push(`${bar} Key: ${displayKey}\u2588`);
        if (connectErrorMsg) {
          lines.push("");
          lines.push(chalk.hex("#ef4444").bold(`  \u26A0\uFE0F  ${connectErrorMsg}`));
        }
        lines.push("");
        lines.push(chalk.dim("Enter: Validate & Save  \u2022  Esc: Back to providers"));
      } else if (connectStep === "validating") {
        lines.push(chalk.bold.hex("#f59e0b")(`Verifying ${connectValidatingProv} API Key...`));
        lines.push("");
        lines.push(chalk.hex("#fbbf24").bold("  \u224B Testing authentication with provider API..."));
        lines.push("");
        lines.push(chalk.dim("Please wait while we verify your key with the provider."));
      }
    } else {
      if (!isProcessing && input.startsWith("/")) {
        const matching = COMMANDS.filter((c) => c.name.startsWith(input));
        if (menuIndex >= matching.length) menuIndex = Math.max(0, matching.length - 1);
        if (matching.length > 0) {
          const MAX_VISIBLE = 6;
          let startIdx = 0;
          if (matching.length > MAX_VISIBLE) {
            startIdx = Math.max(0, Math.min(menuIndex - 2, matching.length - MAX_VISIBLE));
          }
          const visible = matching.slice(startIdx, startIdx + MAX_VISIBLE);
          lines.push(
            chalk.dim(`  Commands (${menuIndex + 1}/${matching.length}) \xB7 \u2191/\u2193 navigate \xB7 Tab/Enter select \xB7 Esc cancel`)
          );
          visible.forEach((c, relIdx) => {
            const absIdx = startIdx + relIdx;
            const isSelected = absIdx === menuIndex;
            const row = "  " + c.name.padEnd(12) + c.desc;
            const padded = row + " ".repeat(Math.max(2, width - row.length));
            lines.push(isSelected ? peachBg(padded) : chalk.white(row));
          });
        }
      }
      const friendlyAgent = currentAgent === "build" ? "Build" : "Plan";
      if (isProcessing) {
        const frameIdx = renderer.getThinkingFrame() % THINKING_FRAMES.length;
        const thinkingText = THINKING_FRAMES[frameIdx].trim();
        lines.push(`${bar} ${thinkingText}`);
      } else {
        lines.push(`${bar} ${input}\u2588`);
      }
      lines.push(`${bar}`);
      lines.push(
        `  ${chalk.hex(OCEAN_BLUE).bold(friendlyAgent)} ${chalk.dim("\xB7")} ${chalk.white(friendlyModel)} ${chalk.dim("\xB7 OceanCode")}`
      );
    }
    return lines;
  };
  const paintBar = () => {
    try {
      if (!process.stdout.isTTY) return;
      const lines = buildBarLines();
      const { rows, barStartRow, scrollBottom } = getBarMetrics(lines.length);
      applyScrollRegion(scrollBottom);
      if (lastBarStartRow > 0 && lastBarStartRow < barStartRow) {
        for (let r = lastBarStartRow; r < barStartRow; r++) {
          process.stdout.write(`\x1B[${r};1H\x1B[2K`);
        }
      }
      lastBarStartRow = barStartRow;
      for (let i = 0; i < lines.length; i++) {
        const r = barStartRow + i;
        process.stdout.write(`\x1B[${r};1H\x1B[2K${lines[i]}`);
      }
      if (!isProcessing && mode === "normal") {
        process.stdout.write("\x1B[?25h");
        const inputLineIdx = Math.max(0, lines.length - 3);
        const targetRow = barStartRow + inputLineIdx;
        const col = Math.min(process.stdout.columns || 80, 3 + input.length);
        process.stdout.write(`\x1B[${targetRow};${col}H`);
      } else if (!isProcessing && mode === "model_selector") {
        process.stdout.write("\x1B[?25h");
        const col = Math.min(process.stdout.columns || 80, 9 + modelSearch.length);
        process.stdout.write(`\x1B[${barStartRow + 1};${col}H`);
      } else {
        process.stdout.write("\x1B[?25l");
        process.stdout.write(`\x1B[${contentRow};1H`);
      }
    } catch {
    }
  };
  const render = () => paintBar();
  renderer.setPinBar(
    () => paintBar(),
    () => {
    }
  );
  const reasoningPartIds = /* @__PURE__ */ new Set();
  const textPartIds = /* @__PURE__ */ new Set();
  const unsubscribe = client.subscribeEvents((event) => {
    if (event.type && typeof event.type === "string" && event.type.startsWith("permission.")) {
      const reqId = event.properties?.requestID || event.properties?.id;
      if (reqId) client.replyPermission(reqId, "always");
    }
    if (event.properties?.sessionID !== session.id) return;
    if (event.type === "message.updated") {
      if (event.properties?.info?.role === "user") {
        userMsgId = event.properties.info.id;
        lastUserMsgId = userMsgId;
      }
    }
    if (event.type === "message.part.updated") {
      const part = event.properties?.part;
      if (!part) return;
      if (userMsgId && part.messageID === userMsgId) return;
      isProcessing = true;
      resetActivityTimeout();
      if (part.type === "reasoning") {
        reasoningPartIds.add(part.id);
        if (typeof part.text === "string") {
          renderer.handleReasoning(part.text);
        }
      } else if (part.type === "tool") {
        const toolName = part.tool || "tool";
        const inputObj = part.state?.input || {};
        const detail = inputObj.filePath || inputObj.command || inputObj.pattern || inputObj.query || inputObj.url || inputObj.name || part.state?.title || part.call?.command || part.call?.path || part.call?.description || "";
        const status = part.state?.status || part.status || "";
        renderer.handleTool(toolName, detail, part.id, status);
      } else if (part.type === "text" && typeof part.text === "string") {
        textPartIds.add(part.id);
        renderer.handleText(part.text, part.id);
      }
    }
    if (event.type === "message.part.delta") {
      const partId = event.properties?.partID || event.properties?.partId || event.properties?.id || "default";
      if (reasoningPartIds.has(partId)) return;
      const delta = event.properties?.delta;
      const field = event.properties?.field;
      if (field === "text" && typeof delta === "string") {
        resetActivityTimeout();
        renderer.handleDelta(delta, partId);
      }
    }
    if (event.type === "session.idle" || event.type === "session.status" && event.properties?.status?.type === "idle") {
      if (isProcessing) {
        if (activityTimeoutTimer) clearTimeout(activityTimeoutTimer);
        isProcessing = false;
        renderer.finish(currentAgent === "build" ? "Build" : "Plan");
        render();
      }
    }
    if (event.type === "session.error") {
      if (activityTimeoutTimer) clearTimeout(activityTimeoutTimer);
      isProcessing = false;
      renderer.finish(currentAgent === "build" ? "Build" : "Plan");
      const errObj = event.properties?.error;
      const errMsg = errObj?.message || errObj?.data?.message || (typeof errObj === "string" ? errObj : "Model request failed or timed out.");
      console.error(chalk.red(`
\u26A0\uFE0F Model Error (${getFriendlyModelName(currentBackendModel)}): ${errMsg}
`));
      render();
    }
  }, void 0, session.directory);
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
  }
  const onKeypress = async (str, key) => {
    if (key && key.ctrl && key.name === "c") {
      cleanup();
      unsubscribe();
      console.log(`
  ${chalk.cyan("\u{1F44B} Goodbye!")}
`);
      process.exit(0);
    }
    if (isProcessing) return;
    if (mode === "connect_modal") {
      if (connectStep === "validating") return;
      if (key.name === "escape") {
        if (connectStep === "enter_key") {
          connectStep = "provider_list";
          connectKeyInput = "";
          connectErrorMsg = "";
        } else {
          mode = "normal";
          connectStep = "provider_list";
          connectKeyInput = "";
          connectErrorMsg = "";
        }
        render();
        return;
      }
      if (connectStep === "provider_list") {
        if (key.name === "up") {
          connectProviderIndex = (connectProviderIndex - 1 + SUPPORTED_BYOK_PROVIDERS.length) % SUPPORTED_BYOK_PROVIDERS.length;
          render();
          return;
        }
        if (key.name === "down") {
          connectProviderIndex = (connectProviderIndex + 1) % SUPPORTED_BYOK_PROVIDERS.length;
          render();
          return;
        }
        if (key.name === "return") {
          connectStep = "enter_key";
          connectKeyInput = "";
          connectErrorMsg = "";
          render();
          return;
        }
        if (str === "d" || str === "D") {
          const prov = SUPPORTED_BYOK_PROVIDERS[connectProviderIndex];
          removeProviderKey(prov.id);
          console.log(chalk.yellow(`
\u2713 Disconnected API key for ${prov.name}.
`));
          render();
          return;
        }
        return;
      }
      if (connectStep === "enter_key") {
        if (key.name === "backspace") {
          connectKeyInput = connectKeyInput.slice(0, -1);
          connectErrorMsg = "";
          render();
          return;
        }
        if (key.name === "return") {
          if (!connectKeyInput.trim()) {
            connectErrorMsg = "Please enter an API key.";
            render();
            return;
          }
          const prov = SUPPORTED_BYOK_PROVIDERS[connectProviderIndex];
          connectStep = "validating";
          connectValidatingProv = prov.name;
          connectErrorMsg = "";
          render();
          const result = await validateProviderKey(prov.id, connectKeyInput);
          if (result.valid) {
            saveProviderKey(prov.id, connectKeyInput);
            mode = "normal";
            connectStep = "provider_list";
            connectKeyInput = "";
            connectErrorMsg = "";
            console.log(
              chalk.green(
                `
\u2713 Successfully verified and connected ${prov.name}! Its models are now unlocked in /models.
`
              )
            );
            render();
          } else {
            connectStep = "enter_key";
            connectErrorMsg = result.message;
            render();
          }
          return;
        }
        if (str && !key.ctrl && !key.meta) {
          connectKeyInput += str;
          connectErrorMsg = "";
          render();
          return;
        }
      }
      return;
    }
    if (mode === "model_selector") {
      const availableModels = getAvailableOceanModels();
      const searchLower = modelSearch.toLowerCase();
      const filtered = availableModels.filter(
        (m) => m.name.toLowerCase().includes(searchLower) || m.id.toLowerCase().includes(searchLower) || m.tag.toLowerCase().includes(searchLower) || m.description.toLowerCase().includes(searchLower)
      );
      if (key.name === "escape") {
        mode = "normal";
        modelSearch = "";
        render();
        return;
      }
      if (key.name === "up") {
        if (filtered.length > 0) {
          modelIndex = (modelIndex - 1 + filtered.length) % filtered.length;
        }
        render();
        return;
      }
      if (key.name === "down") {
        if (filtered.length > 0) {
          modelIndex = (modelIndex + 1) % filtered.length;
        }
        render();
        return;
      }
      if (key.name === "return") {
        let selectedFriendly = "";
        let selectedId = "";
        if (filtered[modelIndex]) {
          currentBackendModel = filtered[modelIndex].id;
          selectedId = currentBackendModel;
          selectedFriendly = getFriendlyModelName(currentBackendModel);
        }
        mode = "normal";
        input = "";
        modelSearch = "";
        if (selectedFriendly) {
          printToContent(chalk.green(`\u2713 Active model changed to: ${selectedFriendly} (${selectedId})`));
        }
        render();
        return;
      }
      if (key.name === "backspace") {
        modelSearch = modelSearch.slice(0, -1);
        modelIndex = 0;
        render();
        return;
      }
      if (str && str.length === 1 && !key.ctrl && !key.meta) {
        modelSearch += str;
        modelIndex = 0;
        render();
        return;
      }
      return;
    }
    const matching = input.startsWith("/") ? COMMANDS.filter((c) => c.name.startsWith(input)) : [];
    if (key.name === "escape") {
      input = "";
      menuIndex = 0;
      render();
      return;
    }
    if (matching.length > 0) {
      if (key.name === "up") {
        menuIndex = (menuIndex - 1 + matching.length) % matching.length;
        render();
        return;
      }
      if (key.name === "down") {
        menuIndex = (menuIndex + 1) % matching.length;
        render();
        return;
      }
      if (key.name === "tab") {
        if (matching[menuIndex]) {
          input = matching[menuIndex].name;
        }
        render();
        return;
      }
    }
    if (key.name === "return") {
      let submitted = input.trim();
      if (matching.length > 0 && matching[menuIndex]) {
        submitted = matching[menuIndex].name;
      }
      input = "";
      menuIndex = 0;
      if (!submitted) {
        paintBar();
        return;
      }
      if (submitted === "/exit" || submitted === "/quit") {
        cleanup();
        unsubscribe();
        console.log(`
  ${chalk.cyan("\u{1F44B} Goodbye!")}
`);
        process.exit(0);
      }
      if (submitted === "/clear") {
        if (process.stdout.isTTY) {
          process.stdout.write("\x1B[2J\x1B[H");
          const { scrollBottom } = getBarMetrics(3);
          applyScrollRegion(scrollBottom);
          process.stdout.write("\x1B[1;1H");
        }
        renderTopBar(getFriendlyModelName(currentBackendModel));
        contentRow = 8;
        lastBarStartRow = 0;
        paintBar();
        return;
      }
      if (submitted === "/init") {
        try {
          const res = initializeAgentsDoc(process.cwd());
          printToContent(`${chalk.green(`\u2714 ${res.summary}`)}
${chalk.dim(`  Location: ${res.filePath}`)}`);
        } catch (err) {
          printToContent(chalk.red(`\u26A0\uFE0F Initialization failed: ${err.message}`));
        }
        render();
        return;
      }
      if (submitted === "/new") {
        try {
          session = await client.createSession("Ocean Session", process.cwd());
          printToContent(chalk.green("\u2714 Started a new coding session."));
        } catch (err) {
          printToContent(chalk.red(`Failed to create new session: ${err.message}`));
        }
        render();
        return;
      }
      if (submitted === "/undo") {
        if (lastUserMsgId) {
          try {
            const success = await client.revertSession(session.id, lastUserMsgId);
            if (success) {
              printToContent(chalk.green("\u2714 Reverted the last AI action and restored previous file states."));
            } else {
              printToContent(chalk.yellow("Could not revert the last action."));
            }
          } catch (err) {
            printToContent(chalk.red(`Revert failed: ${err.message}`));
          }
        } else {
          printToContent(chalk.yellow("No previous action found to undo."));
        }
        render();
        return;
      }
      if (submitted === "/redo") {
        if (!lastSubmittedPrompt) {
          printToContent(chalk.yellow("No previous action to redo."));
          render();
          return;
        }
        submitted = lastSubmittedPrompt;
      }
      if (submitted.startsWith("/goal")) {
        const goalDesc = submitted.replace(/^\/goal\s*/, "").trim();
        if (!goalDesc) {
          printToContent(
            chalk.yellow(
              "Please provide a goal description.\nUsage: /goal <your objective or feature description>\nExample: /goal Add user authentication with JWT and refresh tokens"
            )
          );
          render();
          return;
        }
        submitted = `[AUTONOMOUS GOAL EXECUTION LOOP]
Goal: ${goalDesc}

Please accomplish this goal systematically:
1. Search and explore relevant files using glob and grep.
2. Formulate an execution plan and track with todowrite.
3. Implement code changes cleanly without truncations or placeholders.
4. Verify code with compiler or tests.
5. Present a clear final summary of what was accomplished.`;
      }
      if (submitted === "/connect" || submitted.startsWith("/connect")) {
        const parts = submitted.split(" ").filter(Boolean);
        const provArg = parts[1]?.toLowerCase();
        const keyArg = parts[2];
        if (provArg && keyArg) {
          printToContent(chalk.cyan(`Validating API key with ${provArg.toUpperCase()}...`));
          const val = await validateProviderKey(provArg, keyArg);
          if (val.valid) {
            saveProviderKey(provArg, keyArg);
            printToContent(
              chalk.green(
                `\u2714 Successfully verified and connected ${provArg.toUpperCase()}! Its models are now unlocked in /models.`
              )
            );
          } else {
            printToContent(chalk.red(`\u26A0\uFE0F Validation failed for ${provArg.toUpperCase()}: ${val.message}`));
          }
          render();
          return;
        } else {
          mode = "connect_modal";
          connectStep = "provider_list";
          connectProviderIndex = 0;
          connectKeyInput = "";
          connectErrorMsg = "";
          render();
          return;
        }
      }
      if (submitted.startsWith("/mcp")) {
        const parts = submitted.split(" ").filter(Boolean);
        const sub = parts[1]?.toLowerCase();
        if (sub === "add") {
          const serverName = parts[2];
          const serverCmdOrUrl = parts.slice(3).join(" ");
          if (!serverName || !serverCmdOrUrl) {
            printToContent(
              chalk.yellow(
                "Usage: /mcp add <server-name> <command-or-url>\nExamples:\n  /mcp add filesystem npx -y @modelcontextprotocol/server-filesystem .\n  /mcp add remote https://example.com/mcp"
              )
            );
            render();
            return;
          }
          const isUrl = serverCmdOrUrl.startsWith("http://") || serverCmdOrUrl.startsWith("https://");
          const mcpConfig = isUrl ? { type: "remote", url: serverCmdOrUrl, enabled: true } : { type: "local", command: serverCmdOrUrl.split(" "), enabled: true };
          saveMcpServer(serverName, mcpConfig);
          printToContent(
            chalk.green(`\u2713 Added MCP server "${serverName}" (${mcpConfig.type}). Configured in opencode.json.`)
          );
          render();
          return;
        }
        const configured = getConfiguredMcpServers();
        const live = await fetchLiveMcpStatus(baseUrl);
        const names = Array.from(/* @__PURE__ */ new Set([...Object.keys(configured), ...Object.keys(live)]));
        if (names.length === 0) {
          printToContent(
            chalk.dim(
              "No Model Context Protocol (MCP) servers configured.\n\nTo add an MCP server, run:\n  /mcp add <name> <command-or-url>\nExample:\n  /mcp add filesystem npx -y @modelcontextprotocol/server-filesystem ."
            )
          );
        } else {
          const lines = names.map((n) => {
            const conf = configured[n] || {};
            const isLive = live[n] !== void 0;
            const type = conf.type || (conf.url ? "remote" : "local");
            const target = conf.url || (conf.command ? conf.command.join(" ") : "active");
            const badge = isLive ? chalk.green("\u25CF Connected") : chalk.cyan("\u25CF Configured");
            return `  \u2022 ${n} (${type}): ${badge}
    ${chalk.dim(target)}`;
          }).join("\n");
          printToContent(
            chalk.bold("Model Context Protocol (MCP) Servers:\n") + lines + chalk.dim("\n\nAdd new servers with: /mcp add <name> <command>")
          );
        }
        render();
        return;
      }
      if (submitted === "/agent" || submitted.startsWith("/agent ") || submitted === "/mode" || submitted.startsWith("/mode ")) {
        if (submitted.includes(" ")) {
          const target = submitted.split(" ")[1].toLowerCase().trim();
          if (target === "plan" || target === "build") {
            currentAgent = target;
          } else {
            currentAgent = currentAgent === "build" ? "plan" : "build";
          }
        } else {
          currentAgent = currentAgent === "build" ? "plan" : "build";
        }
        printToContent(chalk.cyan(`\u2713 Switched mode to: ${currentAgent.toUpperCase()}`));
        render();
        return;
      }
      if (submitted === "/diff") {
        try {
          const diffs = await client.getSessionDiff(session.id);
          if (!diffs || diffs.length === 0) {
            printToContent(chalk.dim("No file modifications recorded in the current session."));
          } else {
            const diffSummary = diffs.map(
              (d) => `  \u2022 ${d.path || d.file || "file"} (+${d.additions || 0} -${d.deletions || 0})`
            ).join("\n");
            printToContent(chalk.bold(`Modified Files (${diffs.length}):
`) + diffSummary);
          }
        } catch (err) {
          printToContent(chalk.red(`Failed to retrieve diff: ${err.message}`));
        }
        render();
        return;
      }
      if (submitted === "/compact") {
        try {
          await client.summarizeSession(session.id);
          printToContent(chalk.green("\u2713 Session context memory compacted and summarized successfully."));
        } catch (err) {
          printToContent(chalk.red(`Compact failed: ${err.message}`));
        }
        render();
        return;
      }
      if (submitted.startsWith("/model") || submitted.startsWith("/models")) {
        const parts = submitted.split(" ");
        const targetArg = parts.slice(1).join(" ").trim();
        if (targetArg) {
          const resolvedId = getBackendModelId(targetArg);
          currentBackendModel = resolvedId;
          const friendly = getFriendlyModelName(resolvedId);
          printToContent(chalk.green(`\u2713 Switched model to: ${friendly} (${resolvedId})`));
          render();
          return;
        } else {
          mode = "model_selector";
          modelSearch = "";
          modelIndex = 0;
          render();
          return;
        }
      }
      if (submitted === "/help") {
        const helpLines = [
          chalk.bold("Available Commands:"),
          ...COMMANDS.map((c) => `  ${chalk.hex(OCEAN_BLUE).bold(c.name.padEnd(12))} ${chalk.dim(c.desc)}`)
        ].join("\n");
        printToContent(helpLines);
        render();
        return;
      }
      if (submitted === "/info") {
        printToContent(
          `Session Details:
  Model:     ${getFriendlyModelName(currentBackendModel)}
  Agent:     ${currentAgent.toUpperCase()}
  Directory: ${session.directory}
  Session:   ${session.id}`
        );
        render();
        return;
      }
      const friendlyName = getFriendlyModelName(currentBackendModel);
      process.stdout.write(`\x1B[${contentRow};1H`);
      renderUserMessageCard(submitted, friendlyName);
      const promptLines = submitted.split("\n").length;
      contentRow = Math.min(currentScrollBottom || 20, contentRow + promptLines);
      isProcessing = true;
      userMsgId = null;
      lastSubmittedPrompt = submitted;
      paintBar();
      resetActivityTimeout();
      renderer.start(friendlyName);
      client.promptSession(session.id, submitted, {
        model: currentBackendModel,
        agent: currentAgent,
        directory: session.directory
      }).catch((err) => {
        if (activityTimeoutTimer) clearTimeout(activityTimeoutTimer);
        isProcessing = false;
        renderer.finish(currentAgent === "build" ? "Build" : "Plan");
        console.error(chalk.red(`
\u26A0\uFE0F Prompt Error: ${err.message}
`));
        paintBar();
      });
      return;
    }
    if (key.name === "backspace") {
      input = input.slice(0, -1);
      menuIndex = 0;
      render();
      return;
    }
    if (str && str.length === 1 && !key.ctrl && !key.meta) {
      input += str;
      menuIndex = 0;
      render();
      return;
    }
  };
  process.stdin.on("keypress", onKeypress);
  if (process.stdout.isTTY) {
    process.stdout.on("resize", () => {
      const { scrollBottom } = getBarMetrics(buildBarLines().length);
      applyScrollRegion(scrollBottom);
      paintBar();
    });
  }
  if (process.stdout.isTTY) {
    process.stdout.write("\x1B[2J\x1B[H");
    const { scrollBottom } = getBarMetrics(3);
    applyScrollRegion(scrollBottom);
    process.stdout.write("\x1B[1;1H");
    renderTopBar(getFriendlyModelName(currentBackendModel));
    contentRow = 8;
    paintBar();
  }
}

// src/commands/models.ts
import chalk2 from "chalk";
async function listModelsCommand(options) {
  const baseUrl = await ensureServer();
  const client = new OceanClient(baseUrl);
  const { leftMargin } = getLayoutDimensions();
  const indent = " ".repeat(leftMargin);
  const creds = getStoredCredentials();
  const available = getAvailableOceanModels(creds);
  console.log("");
  console.log(`${indent}${chalk2.hex("#00d2ff").bold("Ocean AI Models")}`);
  console.log(`${indent}${chalk2.dim("Switch anytime in chat with /models")}
`);
  console.log(`${indent}${chalk2.dim("-".repeat(54))}`);
  const freeModels = available.filter((m) => m.isFree);
  const byokModels = available.filter((m) => !m.isFree);
  console.log(`${indent}${chalk2.bold.hex("#00f2fe")("Free Built-in Models:")}`);
  for (const m of freeModels) {
    const badge = chalk2.bgHex("#00b4d8").black.bold(` ${m.tag} `);
    console.log(`${indent}  ${badge} ${chalk2.white.bold(m.name.padEnd(30))} ${chalk2.dim(m.description)}`);
  }
  if (byokModels.length > 0) {
    console.log(`
${indent}${chalk2.bold.hex("#3a7bd5")("Connected BYOK Models:")}`);
    for (const m of byokModels) {
      const badge = chalk2.bgHex("#10b981").black.bold(` ${m.tag} `);
      console.log(`${indent}  ${badge} ${chalk2.white.bold(m.name.padEnd(30))} ${chalk2.dim(m.description)}`);
    }
  }
  const unconnected = SUPPORTED_BYOK_PROVIDERS.filter((p) => !creds[p.id]?.key);
  if (unconnected.length > 0) {
    console.log(`
${indent}${chalk2.dim("Connect more models via 'oceancode connect <provider> <key>' or /connect in chat:")}`);
    console.log(`${indent}${chalk2.dim(`Unlinked: ${unconnected.map((p) => p.name).join(", ")}`)}`);
  }
  console.log(`
${indent}${chalk2.dim("Tip: Type /models in interactive chat to switch models with arrow keys.")}
`);
}

// src/commands/session.ts
import chalk3 from "chalk";
async function sessionCommand() {
  const baseUrl = await ensureServer();
  const client = new OceanClient(baseUrl);
  const { leftMargin } = getLayoutDimensions();
  const indent = " ".repeat(leftMargin);
  console.log("");
  console.log(`${indent}${chalk3.hex("#00d2ff").bold("Recent Sessions")}`);
  console.log(`${indent}${chalk3.dim("-".repeat(54))}`);
  try {
    const sessions = await client.listSessions(10);
    if (!sessions || sessions.length === 0) {
      console.log(`${indent}${chalk3.dim("No previous sessions found.")}
`);
      return;
    }
    for (const s of sessions) {
      const date = new Date(s.time?.created || Date.now()).toLocaleDateString();
      const tokens = (s.tokens?.input || 0) + (s.tokens?.output || 0);
      console.log(`${indent}${chalk3.cyan(s.id.slice(0, 16))}  ${chalk3.bold.white(s.title || "Untitled")}`);
      console.log(`${indent}  ${chalk3.dim(date)} \uFFFD ${chalk3.dim(`${tokens} tokens`)} \uFFFD ${chalk3.dim(s.directory)}`);
      console.log("");
    }
  } catch (err) {
    console.error(`${indent}${chalk3.red(`Failed to list sessions: ${err.message}`)}`);
  }
}

// src/commands/stats.ts
import chalk4 from "chalk";
async function statsCommand() {
  const baseUrl = await ensureServer();
  const client = new OceanClient(baseUrl);
  const { leftMargin } = getLayoutDimensions();
  const indent = " ".repeat(leftMargin);
  console.log("");
  console.log(`${indent}${chalk4.hex("#00d2ff").bold("Usage & Analytics")}`);
  console.log(`${indent}${chalk4.dim("-".repeat(54))}`);
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
    console.log(`${indent}${chalk4.dim("Total Sessions:")}   ${chalk4.bold.white(sessions.length)}`);
    console.log(`${indent}${chalk4.dim("Total Tokens:")}     ${chalk4.bold.cyan(totalTokens.toLocaleString())}`);
    console.log(`${indent}${chalk4.dim("Input Tokens:")}     ${chalk4.white(totalInput.toLocaleString())}`);
    console.log(`${indent}${chalk4.dim("Output Tokens:")}    ${chalk4.white(totalOutput.toLocaleString())}`);
    console.log(`${indent}${chalk4.dim("Total Cost:")}       ${chalk4.bold.green("$" + totalCost.toFixed(4))} ${chalk4.bgHex("#00b4d8").black.bold(" FREE ")}`);
    console.log("");
  } catch (err) {
    console.error(`${indent}${chalk4.red(`Failed to load stats: ${err.message}`)}`);
  }
}

// src/index.ts
import chalk5 from "chalk";
var program = new Command();
program.enablePositionalOptions();
program.name("oceancode").description("Ocean CLI: Next-generation AI coding assistant built for large codebases").version("0.1.0").addHelpText("before", `
${getBigLogo()}
`);
program.option("-m, --model <model>", "Model to use (default: opencode/muse-spark-1.3-contributor-free [1M Context])").action(async (options) => {
  try {
    await interactiveChatCommand({ model: options.model });
  } catch (err) {
    if (process.stdout.isTTY) {
      const rows = process.stdout.rows || 24;
      process.stdout.write(`\x1B[1;${rows}r\x1B[?25h
`);
    }
    console.error(chalk5.red(`
An error occurred: ${err?.message || err}
`));
    process.exit(1);
  }
});
program.command("run [message...]").description("Run a prompt or instruction directly").option("-m, --model <model>", "Model to use (default: opencode/muse-spark-1.3-contributor-free)").option("-a, --agent <agent>", "Agent mode (default: build)").option("--auto", "Auto-approve tool permissions").action(async (messages, options, cmd) => {
  const opts = cmd?.optsWithGlobals ? cmd.optsWithGlobals() : options;
  await runCommand(messages, opts);
  process.exit(0);
});
program.command("init").description("Initialize codebase context and generate or update AGENTS.md").action(async () => {
  try {
    const res = initializeAgentsDoc(process.cwd());
    console.log(chalk5.green(`\u2714 ${res.summary}`));
    console.log(chalk5.dim(`  Path: ${res.filePath}`));
  } catch (err) {
    console.error(chalk5.red(`Error initializing AGENTS.md: ${err.message}`));
  }
  process.exit(0);
});
program.command("connect [provider] [key]").description("Link provider API keys (OpenAI, Anthropic, Gemini, DeepSeek, Groq, OpenRouter)").action(async (provider, key) => {
  if (provider && key) {
    console.log(chalk5.cyan(`Validating API key with ${provider.toUpperCase()}...`));
    const val = await validateProviderKey(provider, key);
    if (val.valid) {
      saveProviderKey(provider, key);
      console.log(chalk5.green(`\u2714 ${val.message}`));
    } else {
      console.error(chalk5.red(`\u2716 Validation failed: ${val.message}`));
      process.exit(1);
    }
    process.exit(0);
  }
  const creds = getStoredCredentials();
  console.log(chalk5.bold("\nBring Your Own Key (BYOK) Status:"));
  for (const p of SUPPORTED_BYOK_PROVIDERS) {
    const isSet = Boolean(creds[p.id]);
    const badge = isSet ? chalk5.green("\u2714 Connected") : chalk5.dim("Not linked");
    console.log(`  \u2022 ${p.name.padEnd(16)} (${p.id}): ${badge}`);
  }
  console.log(chalk5.dim("\nTo link a key, run:"));
  console.log(chalk5.cyan("  oceancode connect <provider> <api-key>"));
  console.log(chalk5.dim("Examples:"));
  console.log("  oceancode connect openai sk-proj-...");
  console.log("  oceancode connect anthropic sk-ant-...");
  console.log("  oceancode connect google AIzaSy...");
  console.log("  oceancode connect deepseek sk-...\n");
  process.exit(0);
});
program.command("mcp").description("List or configure Model Context Protocol (MCP) servers").allowUnknownOption().passThroughOptions().argument("[action]", "list or add").argument("[name]", "server name").argument("[command...]", "command or url").action(async (action, name, commandArgs) => {
  const act = (action || "list").toLowerCase();
  if (act === "add") {
    if (!name || !commandArgs || commandArgs.length === 0) {
      console.error(chalk5.red("Usage: oceancode mcp add <name> <command-or-url>"));
      console.log("Example: oceancode mcp add filesystem npx -y @modelcontextprotocol/server-filesystem .");
      process.exit(1);
    }
    const target = commandArgs.join(" ");
    const isUrl = target.startsWith("http://") || target.startsWith("https://");
    const config = isUrl ? { type: "remote", url: target, enabled: true } : { type: "local", command: commandArgs, enabled: true };
    saveMcpServer(name, config);
    console.log(chalk5.green(`\u2714 Added MCP server "${name}" (${config.type}) to opencode.json`));
    process.exit(0);
  }
  const baseUrl = await ensureServer();
  const configured = getConfiguredMcpServers();
  const live = await fetchLiveMcpStatus(baseUrl);
  const allNames = Array.from(/* @__PURE__ */ new Set([...Object.keys(configured), ...Object.keys(live)]));
  console.log(chalk5.bold("\nModel Context Protocol (MCP) Servers:"));
  if (allNames.length === 0) {
    console.log(chalk5.dim("  No MCP servers configured."));
    console.log(chalk5.dim("\nTo add an MCP server, run:"));
    console.log(chalk5.cyan("  oceancode mcp add <name> <command-or-url>"));
  } else {
    for (const n of allNames) {
      const conf = configured[n] || {};
      const isLive = live[n] !== void 0;
      const type = conf.type || (conf.url ? "remote" : "local");
      const target = conf.url || (conf.command ? conf.command.join(" ") : "active");
      const status = isLive ? chalk5.green("\u25CF Connected") : chalk5.cyan("\u25CF Configured");
      console.log(`  \u2022 ${chalk5.bold(n)} (${type}) ${status}
    ${chalk5.dim(target)}`);
    }
  }
  console.log();
  process.exit(0);
});
program.command("models").description("List available AI models (highlighting free models)").option("-p, --provider <provider>", "Filter by provider").option("--all", "Show all models across all providers").action(async (options) => {
  await listModelsCommand(options);
  process.exit(0);
});
program.command("session").description("Manage and inspect coding sessions").action(async () => {
  await sessionCommand();
  process.exit(0);
});
program.command("stats").description("View token consumption and session statistics").action(async () => {
  await statsCommand();
  process.exit(0);
});
program.command("serve").description("Ensure or start the Ocean server backend").action(async () => {
  const url = await ensureServer();
  console.log(chalk5.green(`\u2714 Ocean backend is running at: ${url}`));
});
program.parse(process.argv);
