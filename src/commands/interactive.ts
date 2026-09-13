import readline from "node:readline";
import chalk from "chalk";
import { ensureServer } from "../server/manager.js";
import { OceanClient } from "../server/client.js";
import { OCEAN_BLUE, OCEAN_CYAN, renderTopBar, renderUserMessageCard } from "../ui/layout.js";
import { StreamRenderer } from "../ui/renderer.js";
import { runCommand } from "./run.js";
import {
  OCEAN_MODELS,
  getAvailableOceanModels,
  getFriendlyModelName,
  getBackendModelId,
  DEFAULT_MODEL_ID,
} from "../models/registry.js";
import { initializeAgentsDoc } from "../utils/init.js";
import {
  SUPPORTED_BYOK_PROVIDERS,
  getStoredCredentials,
  saveProviderKey,
  removeProviderKey,
  validateProviderKey,
} from "../server/auth.js";
import {
  getConfiguredMcpServers,
  saveMcpServer,
  fetchLiveMcpStatus,
  McpServerConfig,
} from "../server/mcp.js";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { extractToolDetail } from "../ui/toolLabels.js";

const COMMANDS = [
  { name: "/init",        desc: "Initializes context / updates AGENTS.md" },
  { name: "/goal",        desc: "Sets/manages autonomous completion loops" },
  { name: "/new",         desc: "Clears conversation buffer for a fresh session" },
  { name: "/undo",        desc: "Rolls back the last prompt and file changes" },
  { name: "/redo",        desc: "Re-applies or regenerates the last action" },
  { name: "/models",      desc: "Opens model picker UI to switch active LLMs" },
  { name: "/connect",     desc: "Launches popup setup to link & verify provider API keys" },
  { name: "/logout",      desc: "Disconnects linked provider API keys (or /logout all)" },
  { name: "/mcp",         desc: "Lists & configures Model Context Protocol servers" },
  { name: "/diff",        desc: "Inspect files modified in session" },
  { name: "/diff-file",   desc: "Inspect git diff for a specific file" },
  { name: "/commit",      desc: "Generate conventional commit or commit staged changes" },
  { name: "/review",      desc: "Review current git diff or target branch" },
  { name: "/checkpoint",  desc: "Snapshot workspace changes to git stash" },
  { name: "/exec",        desc: "Execute shell command directly (or use !<cmd>)" },
  { name: "/open",        desc: "Open a file in your default code editor" },
  { name: "/add",         desc: "Pin file(s) into model context memory" },
  { name: "/context",     desc: "Inspect pinned files and loaded memory" },
  { name: "/drop",        desc: "Remove pinned file from context (or /drop all)" },
  { name: "/web",         desc: "Fetch web page content and inject into context" },
  { name: "/export",      desc: "Export conversation transcript to Markdown" },
  { name: "/agent",       desc: "Switch mode (build / plan)" },
  { name: "/compact",     desc: "Compact & summarize session memory" },
  { name: "/clear",       desc: "Clear conversation canvas" },
  { name: "/info",        desc: "Session details & status" },
  { name: "/help",        desc: "Help & commands" },
  { name: "/exit",        desc: "Exit the app" },
];

const THINKING_FRAMES = [
  chalk.hex("#f59e0b").bold("  ≋ Thinking   "),
  chalk.hex("#fbbf24").bold("  ≋ Thinking.  "),
  chalk.hex("#fde68a").bold("  ≋ Thinking.. "),
  chalk.hex("#fef08a").bold("  ≋ Thinking..."),
  chalk.hex("#fde68a").bold("  ≋ Thinking.. "),
  chalk.hex("#fbbf24").bold("  ≋ Thinking.  "),
  chalk.hex("#f59e0b").bold("  ≋ Thinking   "),
  chalk.dim("  ≋ Thinking   "),
];

interface HistoryTurn {
  role: "user" | "assistant";
  text: string;
  modelName?: string;
  duration?: number;
}

export async function interactiveChatCommand(options?: { model?: string }) {
  let currentBackendModel = options?.model
    ? getBackendModelId(options.model)
    : DEFAULT_MODEL_ID;

  // Non-TTY (piped) fallback: read stdin and run directly
  if (!process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const lines: string[] = [];
    for await (const line of rl) {
      lines.push(line);
    }
    if (lines.length > 0) {
      await runCommand(lines, { model: currentBackendModel });
    }
    return;
  }

  const baseUrl = await ensureServer();
  const client = new OceanClient(baseUrl);
  const conversationHistory: HistoryTurn[] = [];

  let session = await client.createSession("Ocean Session", process.cwd());

  // State
  let input = "";
  let cursorIndex = 0;
  const promptHistory: string[] = [];
  let historyIndex = -1;
  let tempSavedInput = "";
  let mode: "normal" | "model_selector" | "connect_modal" = "normal";
  let menuIndex = 0;
  let modelIndex = 0;
  let modelSearch = "";

  // Connect modal state
  let connectStep: "provider_list" | "enter_key" | "validating" = "provider_list";
  let connectProviderIndex = 0;
  let connectKeyInput = "";
  let connectErrorMsg = "";
  let connectValidatingProv = "";

  let currentAgent: "build" | "plan" = "build";
  let isProcessing = false;
  let activityTimeoutTimer: NodeJS.Timeout | null = null;
  let userMsgId: string | null = null;
  let lastUserMsgId: string | null = null;
  let lastSubmittedPrompt = "";
  const pinnedContext = new Map<string, string>();

  const renderer = new StreamRenderer();

  // ─── Glued Bottom Bar & Scroll Region ──────────────────────────────────────
  let currentScrollBottom = 0;
  let lastBarStartRow = 0;
  let lastBarLinesCount = 0;

  const printToContent = (text: string) => {
    if (!process.stdout.isTTY) {
      process.stdout.write(text.endsWith("\n") ? text : text + "\n");
      return;
    }
    process.stdout.write("\x1b8");
    const formatted = text.endsWith("\n") ? text : text + "\n";
    process.stdout.write(formatted);
    process.stdout.write("\x1b7");
    paintBar();
  };

  const getBarMetrics = (linesCount: number) => {
    const rows = process.stdout.rows || 24;
    const barRows = linesCount;
    const barStartRow = Math.max(1, rows - barRows + 1);
    const scrollBottom = Math.max(1, barStartRow - 1);
    return { rows, barRows, barStartRow, scrollBottom };
  };

  const applyScrollRegion = (scrollBottom: number) => {
    if (!process.stdout.isTTY) return;
    if (currentScrollBottom !== scrollBottom) {
      currentScrollBottom = scrollBottom;
      process.stdout.write(`\x1b[1;${scrollBottom}r`);
    }
  };

  const resetScrollRegion = () => {
    if (!process.stdout.isTTY) return;
    const rows = process.stdout.rows || 24;
    process.stdout.write(`\x1b[1;${rows}r`);
    currentScrollBottom = 0;
  };

  const onSignal = () => {
    cleanup();
    process.exit(0);
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  const cleanup = () => {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    if (activityTimeoutTimer) clearTimeout(activityTimeoutTimer);
    if (process.stdout.isTTY) {
      process.stdout.write("\x1b[?1000l\x1b[?1002l\x1b[?1006l");
      process.stdout.off("resize", onResize);
      resetScrollRegion();
      const rows = process.stdout.rows || 24;
      if (lastBarStartRow > 0) {
        for (let r = lastBarStartRow; r < lastBarStartRow + lastBarLinesCount; r++) {
          process.stdout.write(`\x1b[${r};1H\x1b[2K`);
        }
      }
      process.stdout.write(`\x1b[${rows};1H\n\x1b[?25h`);
      try {
        process.stdin.setRawMode(false);
      } catch {}
    }
  };

  const onResize = () => {
    if (!process.stdout.isTTY) return;
    const lines = buildBarLines();
    const { scrollBottom } = getBarMetrics(lines.length);
    applyScrollRegion(scrollBottom);
    paintBar();
  };
  if (process.stdout.isTTY) {
    process.stdout.on("resize", onResize);
  }

  const resetActivityTimeout = () => {
    if (activityTimeoutTimer) clearTimeout(activityTimeoutTimer);
    activityTimeoutTimer = setTimeout(() => {
      if (isProcessing) {
        isProcessing = false;
        renderer.finish(currentAgent === "build" ? "Build" : "Plan");
        const friendlyName = getFriendlyModelName(currentBackendModel);
        printToContent(
          chalk.yellow(
            `⚠️ Operation timed out waiting for ${friendlyName}. You can retry or switch models with /models.`
          )
        );
        render();
      }
    }, 180000); // 3 minutes of inactivity
    activityTimeoutTimer.unref();
  };

  /** Build the bar lines array from current UI state */
  const buildBarLines = (): string[] => {
    const cols = process.stdout.columns || 80;
    const friendlyModel = getFriendlyModelName(currentBackendModel);
    const bar = chalk.hex(OCEAN_BLUE)("│");
    const width = Math.min(cols - 4, 80);
    const peachBg = chalk.bgHex("#fba978").black;
    const lines: string[] = [];

    if (mode === "model_selector") {
      const header =
        "Select Model (↑/↓ to navigate, Enter to select, Esc to close)" +
        " ".repeat(Math.max(2, width - 60)) +
        chalk.dim("esc");
      lines.push(chalk.bold.white(header));
      lines.push(
        modelSearch ? `Search: ${modelSearch}` : chalk.dim("Search models (e.g. qwen, step, flash)")
      );
      lines.push("");

      const availableModels = getAvailableOceanModels();
      const searchLower = modelSearch.toLowerCase();
      const filtered = availableModels.filter(
        (m) =>
          m.name.toLowerCase().includes(searchLower) ||
          m.id.toLowerCase().includes(searchLower)
      );

      if (modelIndex >= filtered.length) modelIndex = Math.max(0, filtered.length - 1);

      if (filtered.length === 0) {
        lines.push(chalk.dim("  No matching models found."));
      } else {
        const MAX_MODELS = 8;
        let startIdx = 0;
        if (filtered.length > MAX_MODELS) {
          startIdx = Math.max(0, Math.min(modelIndex - 3, filtered.length - MAX_MODELS));
        }
        const visibleModels = filtered.slice(startIdx, startIdx + MAX_MODELS);
        if (filtered.length > MAX_MODELS) {
          lines.push(chalk.dim(`  Models (${modelIndex + 1}/${filtered.length}) · ↑/↓ to navigate`));
        }
        visibleModels.forEach((m, relIdx) => {
          const idx = startIdx + relIdx;
          const isCurrent = m.id === currentBackendModel;
          const prefix = isCurrent ? "● " : "  ";
          const left = prefix + m.name;
          const spaces = Math.max(0, width - left.length);
          const row = left + " ".repeat(spaces);
          if (idx === modelIndex) {
            lines.push(peachBg(row));
          } else {
            lines.push(chalk.white(row));
          }
        });
      }
    } else if (mode === "connect_modal") {
      const header = "Connect Provider (BYOK)" + " ".repeat(Math.max(2, width - 24)) + chalk.dim("esc");
      lines.push(chalk.bold.white(header));

      if (connectStep === "provider_list") {
        lines.push(chalk.dim("Select provider with ↑/↓ and press Enter (or 'd' to disconnect):"));
        lines.push("");

        const creds = getStoredCredentials();
        SUPPORTED_BYOK_PROVIDERS.forEach((p, idx) => {
          const isConnected = Boolean(creds[p.id]?.key);
          const prefix = isConnected ? "● " : "○ ";
          const left = `  ${prefix}${p.name.padEnd(16)} (${p.id})`;
          const tag = isConnected ? chalk.green("✔ Connected") : chalk.dim("Not linked");
          const spaces = Math.max(2, width - left.length - 12);
          const row = left + " ".repeat(spaces) + tag;
          lines.push(idx === connectProviderIndex ? peachBg(row) : chalk.white(row));
        });

        lines.push("");
        lines.push(chalk.dim("Enter: Link API Key  •  d: Disconnect  •  Esc: Close"));
      } else if (connectStep === "enter_key") {
        const prov = SUPPORTED_BYOK_PROVIDERS[connectProviderIndex];
        lines.push(chalk.bold.hex("#38bdf8")(`Provider: ${prov.name}`));
        lines.push(chalk.dim(`Placeholder format: ${prov.placeholder}`));
        lines.push("");

        const masked =
          connectKeyInput.length > 8
            ? connectKeyInput.slice(0, 4) + "•".repeat(connectKeyInput.length - 8) + connectKeyInput.slice(-4)
            : "•".repeat(connectKeyInput.length);
        const displayKey = connectKeyInput ? masked : chalk.dim("Paste or type API key here");
        lines.push(`${bar} Key: ${displayKey}█`);

        if (connectErrorMsg) {
          lines.push("");
          lines.push(chalk.hex("#ef4444").bold(`  ⚠️  ${connectErrorMsg}`));
        }

        lines.push("");
        lines.push(chalk.dim("Enter: Validate & Save  •  Esc: Back to providers"));
      } else if (connectStep === "validating") {
        lines.push(chalk.bold.hex("#f59e0b")(`Verifying ${connectValidatingProv} API Key...`));
        lines.push("");
        lines.push(chalk.hex("#fbbf24").bold("  ≋ Testing authentication with provider API..."));
        lines.push("");
        lines.push(chalk.dim("Please wait while we verify your key with the provider."));
      }
    } else {
      // Normal mode — slash autocomplete + input bar
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
            chalk.dim(`  Commands (${menuIndex + 1}/${matching.length}) · ↑/↓ navigate · Tab/Enter select · Esc cancel`)
          );
          visible.forEach((c, relIdx) => {
            const absIdx = startIdx + relIdx;
            const isSelected = absIdx === menuIndex;
            const row = "  " + c.name.padEnd(15) + c.desc;
            const padded = row + " ".repeat(Math.max(2, width - row.length));
            lines.push(isSelected ? peachBg(padded) : chalk.white(row));
          });
        }
      }

      const friendlyAgent = currentAgent === "build" ? "Build" : "Plan";
      const bar = chalk.hex(OCEAN_BLUE)("│");
      lines.push(bar);
      if (isProcessing) {
        const frameIdx = renderer.getThinkingFrame() % THINKING_FRAMES.length;
        const thinkingText = THINKING_FRAMES[frameIdx].trim();
        lines.push(`${bar} ${chalk.dim(thinkingText)}`);
      } else {
        lines.push(`${bar} ${input}`);
      }
      lines.push(bar);
      lines.push(
        `${bar} ${chalk.hex(OCEAN_BLUE).bold(friendlyAgent)} ${chalk.dim("·")} ${chalk.white(friendlyModel)} ${chalk.dim("OceanCode")}`
      );

      // Status bar line at the very bottom
      const normCwd = process.cwd().replace(/\\/g, "/");
      const leftStatus = chalk.dim(normCwd);
      const midStatus = `${chalk.bold.white("ctrl+p")} ${chalk.dim("commands")}`;
      const rightStatus = `${chalk.green("●")} ${chalk.cyan("OceanCode 0.1.2")}`;

      const termWidth = process.stdout.columns || 80;
      const plainLeft = normCwd;
      const plainMid = "ctrl+p commands";
      const plainRight = "● OceanCode 0.1.2";
      const totalLen = plainLeft.length + plainMid.length + plainRight.length;
      const availableSpace = Math.max(2, termWidth - totalLen - 2);
      const padLeft = " ".repeat(Math.max(2, Math.floor(availableSpace / 2)));
      const padRight = " ".repeat(Math.max(2, availableSpace - padLeft.length));

      lines.push(`${leftStatus}${padLeft}${midStatus}${padRight}${rightStatus}`);
    }

    return lines;
  };

  /**
   * Paint the bottom bar glued to the bottom rows of the terminal.
   */
  const paintBar = () => {
    try {
      if (!process.stdout.isTTY) return;
      process.stdout.write("\x1b]0;oceancode\x07");
      const lines = buildBarLines();
      const { rows, barStartRow, scrollBottom } = getBarMetrics(lines.length);

      applyScrollRegion(scrollBottom);

      // Erase previous bar rows if the bar moved or shrank
      if (lastBarStartRow > 0) {
        if (lastBarStartRow !== barStartRow) {
          for (let r = lastBarStartRow; r < lastBarStartRow + lastBarLinesCount; r++) {
            process.stdout.write(`\x1b[${r};1H\x1b[2K`);
          }
        } else if (lastBarLinesCount > lines.length) {
          for (let r = barStartRow + lines.length; r < barStartRow + lastBarLinesCount; r++) {
            process.stdout.write(`\x1b[${r};1H\x1b[2K`);
          }
        }
      }
      lastBarStartRow = barStartRow;
      lastBarLinesCount = lines.length;

      // Clear and paint bar lines at the bottom of the terminal screen
      for (let i = 0; i < lines.length; i++) {
        const r = barStartRow + i;
        process.stdout.write(`\x1b[${r};1H\x1b[2K${lines[i]}`);
      }

      // Place cursor appropriately
      if (!isProcessing && mode === "normal") {
        process.stdout.write("\x1b[?25h");
        const targetRow = barStartRow + 1;
        const col = Math.min(process.stdout.columns || 80, 3 + cursorIndex);
        process.stdout.write(`\x1b[${targetRow};${col}H`);
      } else if (!isProcessing && mode === "model_selector") {
        process.stdout.write("\x1b[?25h");
        const col = Math.min(process.stdout.columns || 80, 9 + modelSearch.length);
        process.stdout.write(`\x1b[${barStartRow + 1};${col}H`);
      } else {
        process.stdout.write("\x1b[?25l\x1b8");
      }
    } catch {
      // Safe fallback: never crash terminal loop
    }
  };

  const render = () => paintBar();

  // Wire the renderer: repin bar updates the glued bottom bar without touching content
  renderer.setPinBar(
    () => paintBar(),
    () => {}
  );

  // SSE subscription
  const reasoningPartIds = new Set<string>();
  const textPartIds = new Set<string>();
  const unsubscribe = client.subscribeEvents((event) => {
    // Auto approve permissions with correct OpenCode API payload
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
        const detail = extractToolDetail(part);
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

    if (event.type === "session.idle" || (event.type === "session.status" && event.properties?.status?.type === "idle")) {
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
      const errMsg =
        errObj?.message ||
        errObj?.data?.message ||
        (typeof errObj === "string" ? errObj : "Model request failed or timed out.");
      printToContent(chalk.red(`⚠️ Model Error (${getFriendlyModelName(currentBackendModel)}): ${errMsg}`));
      render();
    }
  }, undefined, session.directory);

  // Keypress input handling
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
  }

  const onKeypress = async (str: string, key: readline.Key) => {
    // Ctrl+C to exit
    if (key && key.ctrl && key.name === "c") {
      cleanup();
      unsubscribe();
      console.log(`\n  ${chalk.cyan("👋 Goodbye!")}\n`);
      process.exit(0);
    }

    // Ignore typing while model is actively processing prompt
    if (isProcessing) return;

    if (mode === "connect_modal") {
      if (connectStep === "validating") return; // ignore keystrokes while network check is active

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
          connectProviderIndex =
            (connectProviderIndex - 1 + SUPPORTED_BYOK_PROVIDERS.length) % SUPPORTED_BYOK_PROVIDERS.length;
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
          printToContent(chalk.yellow(`\n✓ Disconnected API key for ${prov.name}.\n`));
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
            printToContent(
              chalk.green(
                `\n✓ Successfully verified and connected ${prov.name}! Its models are now unlocked in /models.\n`
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
        (m) =>
          m.name.toLowerCase().includes(searchLower) ||
          m.id.toLowerCase().includes(searchLower) ||
          (m.tag ? m.tag.toLowerCase().includes(searchLower) : false) ||
          (m.description ? m.description.toLowerCase().includes(searchLower) : false)
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
          printToContent(chalk.green(`✓ Active model changed to: ${selectedFriendly} (${selectedId})`));
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

    // Normal typing mode
    const matching = input.startsWith("/")
      ? COMMANDS.filter((c) => c.name.startsWith(input))
      : [];

    if (key.name === "escape") {
      input = "";
      menuIndex = 0;
      render();
      return;
    }

    if (key.name === "up") {
      if (matching.length > 0) {
        menuIndex = (menuIndex - 1 + matching.length) % matching.length;
        render();
        return;
      } else if (promptHistory.length > 0) {
        if (historyIndex === -1) {
          tempSavedInput = input;
          historyIndex = promptHistory.length - 1;
        } else if (historyIndex > 0) {
          historyIndex--;
        }
        input = promptHistory[historyIndex] || "";
        cursorIndex = input.length;
        render();
        return;
      }
    }

    if (key.name === "down") {
      if (matching.length > 0) {
        menuIndex = (menuIndex + 1) % matching.length;
        render();
        return;
      } else if (historyIndex !== -1) {
        if (historyIndex < promptHistory.length - 1) {
          historyIndex++;
          input = promptHistory[historyIndex] || "";
        } else {
          historyIndex = -1;
          input = tempSavedInput;
        }
        cursorIndex = input.length;
        render();
        return;
      }
    }

    if (key.name === "tab") {
      if (matching.length > 0 && matching[menuIndex]) {
        input = matching[menuIndex].name;
        cursorIndex = input.length;
      }
      render();
      return;
    }

    if (key.name === "return") {
      let submitted = input.trim();
      if (matching.length > 0 && matching[menuIndex]) {
        submitted = matching[menuIndex].name;
      }

      input = "";
      cursorIndex = 0;
      historyIndex = -1;
      menuIndex = 0;

      if (!submitted) {
        paintBar();
        return;
      }

      if (promptHistory[promptHistory.length - 1] !== submitted) {
        promptHistory.push(submitted);
      }

      // Handle Slash Commands
      if (submitted === "/exit" || submitted === "/quit") {
        cleanup();
        unsubscribe();
        console.log(`\n  ${chalk.cyan("👋 Goodbye!")}\n`);
        process.exit(0);
      }

      if (submitted === "/clear") {
        if (process.stdout.isTTY) {
          process.stdout.write("\x1b[2J\x1b[H");
          const { scrollBottom } = getBarMetrics(3);
          applyScrollRegion(scrollBottom);
          process.stdout.write("\x1b[1;1H");
        }
        renderTopBar(getFriendlyModelName(currentBackendModel));
        process.stdout.write("\x1b7");
        lastBarStartRow = 0;
        paintBar();
        return;
      }

      // /init: Initializes context / updates AGENTS.md
      if (submitted === "/init") {
        try {
          const res = initializeAgentsDoc(process.cwd());
          printToContent(`${chalk.green(`✔ ${res.summary}`)}\n${chalk.dim(`  Location: ${res.filePath}`)}`);
        } catch (err: any) {
          printToContent(chalk.red(`⚠️ Initialization failed: ${err.message}`));
        }
        render();
        return;
      }

      // /new: Clears conversation buffer for a fresh session
      if (submitted === "/new") {
        try {
          session = await client.createSession("Ocean Session", process.cwd());
          printToContent(chalk.green("✔ Started a new coding session."));
        } catch (err: any) {
          printToContent(chalk.red(`Failed to create new session: ${err.message}`));
        }
        render();
        return;
      }

      // /undo: Rolls back the last prompt and file changes
      if (submitted === "/undo") {
        if (lastUserMsgId) {
          try {
            const success = await client.revertSession(session.id, lastUserMsgId);
            if (success) {
              printToContent(chalk.green("✔ Reverted the last AI action and restored previous file states."));
            } else {
              printToContent(chalk.yellow("Could not revert the last action."));
            }
          } catch (err: any) {
            printToContent(chalk.red(`Revert failed: ${err.message}`));
          }
        } else {
          printToContent(chalk.yellow("No previous action found to undo."));
        }
        render();
        return;
      }

      // /redo: Re-applies or regenerates the last action
      if (submitted === "/redo") {
        if (!lastSubmittedPrompt) {
          printToContent(chalk.yellow("No previous action to redo."));
          render();
          return;
        }
        submitted = lastSubmittedPrompt;
        // Falls through to regular prompt submission
      }

      // /goal: Sets/manages background autonomous completion loops
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
        submitted = `[AUTONOMOUS GOAL EXECUTION LOOP]\nGoal: ${goalDesc}\n\nPlease accomplish this goal systematically:\n1. Search and explore relevant files using glob and grep.\n2. Formulate an execution plan and track with todowrite.\n3. Implement code changes cleanly without truncations or placeholders.\n4. Verify code with compiler or tests.\n5. Present a clear final summary of what was accomplished.`;
        // Falls through to prompt execution
      }

      // /connect: Launches popup setup to link provider API keys (BYOK)
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
                `✔ Successfully verified and connected ${provArg.toUpperCase()}! Its models are now unlocked in /models.`
              )
            );
          } else {
            printToContent(chalk.red(`⚠️ Validation failed for ${provArg.toUpperCase()}: ${val.message}`));
          }
          render();
          return;
        } else {
          // Open interactive popup!
          mode = "connect_modal";
          connectStep = "provider_list";
          connectProviderIndex = 0;
          connectKeyInput = "";
          connectErrorMsg = "";
          render();
          return;
        }
      }

      if (submitted === "/logout" || submitted.startsWith("/logout") || submitted === "/disconnect" || submitted.startsWith("/disconnect")) {
        const parts = submitted.split(" ").filter(Boolean);
        const provArg = parts[1]?.toLowerCase();
        if (provArg && provArg !== "all") {
          removeProviderKey(provArg);
          printToContent(chalk.green(`✔ Disconnected API key for ${provArg}.`));
        } else {
          for (const p of SUPPORTED_BYOK_PROVIDERS) {
            removeProviderKey(p.id);
          }
          printToContent(chalk.green("✔ Disconnected all provider API keys."));
        }
        render();
        return;
      }

      // /mcp: Lists and configures Model Context Protocol servers
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
          const mcpConfig: McpServerConfig = isUrl
            ? { type: "remote", url: serverCmdOrUrl, enabled: true }
            : { type: "local", command: serverCmdOrUrl.split(" "), enabled: true };

          saveMcpServer(serverName, mcpConfig);
          printToContent(
            chalk.green(`✓ Added MCP server "${serverName}" (${mcpConfig.type}). Configured in opencode.json.`)
          );
          render();
          return;
        }

        // List MCP servers
        const configured = getConfiguredMcpServers();
        const live = await fetchLiveMcpStatus(baseUrl);
        const names = Array.from(new Set([...Object.keys(configured), ...Object.keys(live)]));

        if (names.length === 0) {
          printToContent(
            chalk.dim(
              "No Model Context Protocol (MCP) servers configured.\n\nTo add an MCP server, run:\n  /mcp add <name> <command-or-url>\nExample:\n  /mcp add filesystem npx -y @modelcontextprotocol/server-filesystem ."
            )
          );
        } else {
          const lines = names
            .map((n) => {
              const conf = configured[n] || {};
              const isLive = live[n] !== undefined;
              const type = conf.type || (conf.url ? "remote" : "local");
              const target = conf.url || (conf.command ? conf.command.join(" ") : "active");
              const badge = isLive ? chalk.green("● Connected") : chalk.cyan("● Configured");
              return `  • ${n} (${type}): ${badge}\n    ${chalk.dim(target)}`;
            })
            .join("\n");

          printToContent(
            chalk.bold("Model Context Protocol (MCP) Servers:\n") +
              lines +
              chalk.dim("\n\nAdd new servers with: /mcp add <name> <command>")
          );
        }
        render();
        return;
      }

      // /agent or /mode
      if (
        submitted === "/agent" ||
        submitted.startsWith("/agent ") ||
        submitted === "/mode" ||
        submitted.startsWith("/mode ")
      ) {
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
        printToContent(chalk.cyan(`✓ Switched mode to: ${currentAgent.toUpperCase()}`));
        render();
        return;
      }

      if (submitted === "/diff") {
        try {
          const diffs = await client.getSessionDiff(session.id);
          if (!diffs || diffs.length === 0) {
            printToContent(chalk.dim("No file modifications recorded in the current session."));
          } else {
            const diffSummary = diffs
              .map(
                (d: any) =>
                  `  • ${d.path || d.file || "file"} (+${d.additions || 0} -${d.deletions || 0})`
              )
              .join("\n");
            printToContent(chalk.bold(`Modified Files (${diffs.length}):\n`) + diffSummary);
          }
        } catch (err: any) {
          printToContent(chalk.red(`Failed to retrieve diff: ${err.message}`));
        }
        render();
        return;
      }

      if (submitted === "/compact") {
        try {
          await client.summarizeSession(session.id);
          printToContent(chalk.green("✓ Session context memory compacted and summarized successfully."));
        } catch (err: any) {
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
          printToContent(chalk.green(`✓ Switched model to: ${friendly} (${resolvedId})`));
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

      // Direct shell command execution: !<cmd> or /exec <cmd>
      if (submitted.startsWith("!") || submitted.startsWith("/exec")) {
        const cmdToRun = submitted.startsWith("!")
          ? submitted.slice(1).trim()
          : submitted.replace(/^\/exec\s*/, "").trim();

        if (!cmdToRun) {
          printToContent(chalk.yellow("Usage: !<command> or /exec <command>\nExample: !git status"));
          render();
          return;
        }

        printToContent(chalk.cyan(`$ ${cmdToRun}`));
        try {
          const res = execSync(cmdToRun, {
            cwd: session.directory,
            encoding: "utf-8",
            stdio: ["ignore", "pipe", "pipe"],
            timeout: 60000,
            maxBuffer: 10 * 1024 * 1024,
          });
          if (res.trim()) {
            printToContent(res.trimEnd());
          } else {
            printToContent(chalk.dim("(Command completed with no output)"));
          }
        } catch (err: any) {
          const out = err.stdout ? String(err.stdout).trim() : "";
          const errOut = err.stderr ? String(err.stderr).trim() : "";
          if (out) printToContent(out);
          if (errOut) printToContent(chalk.red(errOut));
          if (!out && !errOut) printToContent(chalk.red(`Command failed: ${err.message}`));
        }
        render();
        return;
      }

      // /checkpoint: snapshot workspace changes to git stash
      if (submitted === "/checkpoint") {
        try {
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const stashMsg = `oceancode-checkpoint-${timestamp}`;
          const res = execSync(`git stash push -m "${stashMsg}" --include-untracked`, {
            cwd: session.directory,
            encoding: "utf-8",
            stdio: ["ignore", "pipe", "pipe"],
          });
          if (res.includes("No local changes to save")) {
            printToContent(chalk.yellow("No unstaged or modified changes to checkpoint."));
          } else {
            try {
              execSync("git stash apply stash@{0}", {
                cwd: session.directory,
                stdio: ["ignore", "pipe", "pipe"],
              });
            } catch {}
            printToContent(
              `${chalk.green(`✔ Checkpoint created: ${stashMsg}`)}\n` +
                chalk.dim("  Current changes safely recorded in git stash.\n  Revert anytime with: git stash apply")
            );
          }
        } catch (err: any) {
          printToContent(chalk.red(`Checkpoint failed: ${err.message}`));
        }
        render();
        return;
      }

      // /diff-file: inspect git diff for a specific file
      if (submitted.startsWith("/diff-file")) {
        const targetFile = submitted.replace(/^\/diff-file\s*/, "").trim();
        if (!targetFile) {
          printToContent(chalk.yellow("Usage: /diff-file <filepath>\nExample: /diff-file package.json"));
          render();
          return;
        }
        try {
          const res = execSync(`git diff HEAD -- "${targetFile}"`, {
            cwd: session.directory,
            encoding: "utf-8",
            stdio: ["ignore", "pipe", "pipe"],
          });
          if (!res.trim()) {
            printToContent(chalk.dim(`No differences found for "${targetFile}" compared to HEAD.`));
          } else {
            const colored = res
              .split("\n")
              .map((line) => {
                if (line.startsWith("+") && !line.startsWith("+++")) return chalk.green(line);
                if (line.startsWith("-") && !line.startsWith("---")) return chalk.red(line);
                if (line.startsWith("@@")) return chalk.cyan(line);
                return chalk.dim(line);
              })
              .join("\n");
            printToContent(`${chalk.bold(`Diff: ${targetFile}`)}\n${colored}`);
          }
        } catch (err: any) {
          printToContent(chalk.red(`Failed to get diff for ${targetFile}: ${err.message}`));
        }
        render();
        return;
      }

      // /commit: commit staged changes or generate conventional commit message
      if (submitted === "/commit" || submitted.startsWith("/commit ")) {
        const manualMsg = submitted.replace(/^\/commit\s*/, "").trim();
        if (manualMsg) {
          try {
            execSync(`git commit -m "${manualMsg.replace(/"/g, '\\"')}"`, {
              cwd: session.directory,
              encoding: "utf-8",
              stdio: ["ignore", "pipe", "pipe"],
            });
            printToContent(chalk.green(`✔ Committed successfully with message: "${manualMsg}"`));
          } catch (err: any) {
            printToContent(chalk.red(`Git commit failed: ${err.message}`));
          }
          render();
          return;
        } else {
          try {
            const staged = execSync("git diff --staged", {
              cwd: session.directory,
              encoding: "utf-8",
              stdio: ["ignore", "pipe", "pipe"],
            });
            const unstaged = execSync("git diff", {
              cwd: session.directory,
              encoding: "utf-8",
              stdio: ["ignore", "pipe", "pipe"],
            });
            const status = execSync("git status --short", {
              cwd: session.directory,
              encoding: "utf-8",
              stdio: ["ignore", "pipe", "pipe"],
            });

            if (!status.trim()) {
              printToContent(chalk.yellow("No changes detected to commit. Working tree is clean."));
              render();
              return;
            }

            const diffToUse = staged.trim() || unstaged.trim() || status;
            submitted = `[GENERATE CONVENTIONAL COMMIT MESSAGE]\nBased on the following git changes, generate a concise, conventional commit message (e.g. feat:, fix:, refactor:, chore:) with a 1-sentence explanation:\n\n\`\`\`diff\n${diffToUse.slice(0, 4000)}\n\`\`\`\n\nPlease format the commit message clearly so it can be copied or committed.`;
            // Falls through to regular prompt submission
          } catch (err: any) {
            printToContent(chalk.red(`Git inspection failed: ${err.message}`));
            render();
            return;
          }
        }
      }

      // /review: review current git diff or target branch
      if (submitted === "/review" || submitted.startsWith("/review ")) {
        const target = submitted.replace(/^\/review\s*/, "").trim() || "HEAD";
        try {
          let diff = "";
          try {
            diff = execSync(`git diff ${target}`, {
              cwd: session.directory,
              encoding: "utf-8",
              stdio: ["ignore", "pipe", "pipe"],
            });
          } catch {
            diff = execSync("git diff", {
              cwd: session.directory,
              encoding: "utf-8",
              stdio: ["ignore", "pipe", "pipe"],
            });
          }

          if (!diff.trim()) {
            printToContent(chalk.yellow("No git changes found to review. Working directory matches target."));
            render();
            return;
          }

          submitted = `[CODE REVIEW REQUEST]\nPlease review the following diff carefully.\nIdentify: 1) Potential bugs or regressions, 2) Security issues, 3) Edge case handling, 4) Code style or architectural improvements:\n\n\`\`\`diff\n${diff.slice(0, 6000)}\n\`\`\``;
          // Falls through to regular prompt submission
        } catch (err: any) {
          printToContent(chalk.red(`Review failed: ${err.message}`));
          render();
          return;
        }
      }

      // /open: open file in default system editor
      if (submitted.startsWith("/open")) {
        const fileToOpen = submitted.replace(/^\/open\s*/, "").trim();
        if (!fileToOpen) {
          printToContent(chalk.yellow("Usage: /open <filepath>\nExample: /open src/index.ts"));
          render();
          return;
        }
        const resolved = path.resolve(session.directory, fileToOpen);
        if (!fs.existsSync(resolved)) {
          printToContent(chalk.red(`File not found: ${fileToOpen}`));
          render();
          return;
        }

        const openCmd =
          process.platform === "win32"
            ? `start "" "${resolved}"`
            : process.platform === "darwin"
            ? `open "${resolved}"`
            : `xdg-open "${resolved}"`;

        try {
          execSync(openCmd, {
            shell: process.platform === "win32" ? "cmd.exe" : "/bin/sh",
            stdio: "ignore",
          });
          printToContent(chalk.green(`✔ Opened ${fileToOpen}`));
        } catch (err: any) {
          printToContent(chalk.red(`Failed to open file: ${err.message}`));
        }
        render();
        return;
      }

      // /add: pin file into model context memory
      if (submitted.startsWith("/add")) {
        const targetPath = submitted.replace(/^\/add\s*/, "").trim();
        if (!targetPath) {
          printToContent(chalk.yellow("Usage: /add <filepath>\nExample: /add src/server/client.ts"));
          render();
          return;
        }
        const resolved = path.resolve(session.directory, targetPath);
        if (!fs.existsSync(resolved)) {
          printToContent(chalk.red(`File does not exist: ${targetPath}`));
          render();
          return;
        }
        try {
          const stats = fs.statSync(resolved);
          if (stats.isDirectory()) {
            printToContent(chalk.yellow(`Cannot add directory directly. Specify a file path: /add ${targetPath}/<filename>`));
            render();
            return;
          }
          const content = fs.readFileSync(resolved, "utf-8");
          pinnedContext.set(targetPath, content);
          printToContent(chalk.green(`✔ Added "${targetPath}" (${content.length} chars) to active context.`));
        } catch (err: any) {
          printToContent(chalk.red(`Failed to read file: ${err.message}`));
        }
        render();
        return;
      }

      // /drop: remove pinned file from context
      if (submitted.startsWith("/drop")) {
        const targetPath = submitted.replace(/^\/drop\s*/, "").trim();
        if (!targetPath) {
          printToContent(chalk.yellow("Usage: /drop <filepath> or /drop all"));
          render();
          return;
        }
        if (targetPath.toLowerCase() === "all") {
          const count = pinnedContext.size;
          pinnedContext.clear();
          printToContent(chalk.green(`✔ Dropped all ${count} pinned item(s) from session context.`));
        } else if (pinnedContext.has(targetPath)) {
          pinnedContext.delete(targetPath);
          printToContent(chalk.green(`✔ Dropped "${targetPath}" from session context.`));
        } else {
          let matched = false;
          for (const key of pinnedContext.keys()) {
            if (key.includes(targetPath)) {
              pinnedContext.delete(key);
              printToContent(chalk.green(`✔ Dropped "${key}" from session context.`));
              matched = true;
              break;
            }
          }
          if (!matched) {
            printToContent(chalk.yellow(`"${targetPath}" was not found in pinned context.`));
          }
        }
        render();
        return;
      }

      // /context: inspect pinned files and loaded memory
      if (submitted === "/context") {
        const lines: string[] = [];
        lines.push(chalk.bold("Active Session Context:"));
        lines.push(`  • Model: ${chalk.cyan(getFriendlyModelName(currentBackendModel))}`);
        lines.push(`  • Agent Mode: ${chalk.cyan(currentAgent.toUpperCase())}`);
        lines.push(`  • Working Directory: ${chalk.dim(session.directory)}`);

        if (pinnedContext.size === 0) {
          lines.push(chalk.dim("  • Pinned Files: None (use /add <file> to attach context)"));
        } else {
          lines.push(chalk.bold(`  • Pinned Files (${pinnedContext.size}):`));
          for (const [p, content] of pinnedContext.entries()) {
            lines.push(`    - ${chalk.cyan(p)} ${chalk.dim(`(${content.length} chars)`)}`);
          }
        }
        printToContent(lines.join("\n"));
        render();
        return;
      }

      // /web: fetch web page content and inject into context
      if (submitted.startsWith("/web")) {
        const targetUrl = submitted.replace(/^\/web\s*/, "").trim();
        if (!targetUrl || (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://"))) {
          printToContent(chalk.yellow("Usage: /web <url>\nExample: /web https://docs.github.com/en/rest"));
          render();
          return;
        }
        printToContent(chalk.cyan(`Fetching ${targetUrl}...`));
        try {
          const res = await fetch(targetUrl, { headers: { "User-Agent": "OceanCode-CLI" } });
          if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          const html = await res.text();
          const textOnly = html
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();

          const snippet = textOnly.slice(0, 10000);
          pinnedContext.set(targetUrl, snippet);
          printToContent(chalk.green(`✔ Fetched and pinned text from ${targetUrl} (${snippet.length} chars).`));
        } catch (err: any) {
          printToContent(chalk.red(`Failed to fetch URL: ${err.message}`));
        }
        render();
        return;
      }

      // /export: export conversation transcript to Markdown
      if (submitted === "/export" || submitted.startsWith("/export ")) {
        const filenameArg = submitted.replace(/^\/export\s*/, "").trim();
        const exportPath = filenameArg || `oceancode-session-${session.id.slice(0, 8)}.md`;
        const resolvedExport = path.resolve(session.directory, exportPath);

        try {
          printToContent(chalk.cyan("Exporting session history..."));
          const rawMsgs = await client.getSessionMessages(session.id);
          const mdLines: string[] = [
            "# OceanCode Session Export",
            `**Session ID:** \`${session.id}\``,
            `**Date:** ${new Date().toLocaleString()}`,
            `**Model:** ${getFriendlyModelName(currentBackendModel)}`,
            `**Directory:** \`${session.directory}\``,
            "\n---\n",
          ];

          if (Array.isArray(rawMsgs) && rawMsgs.length > 0) {
            for (const msg of rawMsgs) {
              const role = msg.role || msg.type || "message";
              let content = "";
              if (typeof msg.content === "string") {
                content = msg.content;
              } else if (Array.isArray(msg.parts)) {
                content = msg.parts
                  .map((p: any) => (typeof p === "string" ? p : p.text || JSON.stringify(p)))
                  .join("\n");
              } else {
                content = JSON.stringify(msg);
              }
              mdLines.push(`### ${role.toUpperCase()}\n\n${content}\n`);
            }
          } else if (conversationHistory.length > 0) {
            for (const turn of conversationHistory) {
              mdLines.push(`### ${turn.role.toUpperCase()}\n\n${turn.text}\n`);
            }
          } else {
            mdLines.push("_No session messages recorded yet._");
          }

          fs.writeFileSync(resolvedExport, mdLines.join("\n"), "utf-8");
          printToContent(`${chalk.green(`✔ Session successfully exported to:`)}\n  ${resolvedExport}`);
        } catch (err: any) {
          printToContent(chalk.red(`Failed to export session: ${err.message}`));
        }
        render();
        return;
      }

      if (submitted === "/help") {
        const helpLines = [
          chalk.bold("Available Commands:"),
          ...COMMANDS.map((c) => `  ${chalk.hex(OCEAN_BLUE).bold(c.name.padEnd(15))} ${chalk.dim(c.desc)}`),
        ].join("\n");
        printToContent(helpLines);
        render();
        return;
      }

      if (submitted === "/info") {
        printToContent(
          `Session Details:\n  Model:     ${getFriendlyModelName(currentBackendModel)}\n  Agent:     ${currentAgent.toUpperCase()}\n  Directory: ${session.directory}\n  Session:   ${session.id}`
        );
        render();
        return;
      }

      // Regular prompt submission
      const friendlyName = getFriendlyModelName(currentBackendModel);
      process.stdout.write("\x1b8");
      renderUserMessageCard(submitted, friendlyName);
      process.stdout.write("\x1b7");

      isProcessing = true;
      userMsgId = null;
      lastSubmittedPrompt = submitted;

      paintBar();
      resetActivityTimeout();
      renderer.start(friendlyName);

      let promptToSend = submitted;
      if (pinnedContext.size > 0) {
        const parts: string[] = ["--- PINNED CONTEXT FILES ---"];
        for (const [k, v] of pinnedContext.entries()) {
          parts.push(`\n[Reference: ${k}]\n${v}`);
        }
        parts.push("--- END PINNED CONTEXT ---\n");
        promptToSend = parts.join("\n") + "\n" + submitted;
      }

      client
        .promptSession(session.id, promptToSend, {
          model: currentBackendModel,
          agent: currentAgent,
          directory: session.directory,
        })
        .catch((err) => {
          if (activityTimeoutTimer) clearTimeout(activityTimeoutTimer);
          isProcessing = false;
          renderer.finish(currentAgent === "build" ? "Build" : "Plan");
          printToContent(chalk.red(`⚠️ Prompt Error: ${err.message}`));
          paintBar();
        });

      return;
    }

    if (key.name === "left") {
      cursorIndex = Math.max(0, cursorIndex - 1);
      render();
      return;
    }

    if (key.name === "right") {
      cursorIndex = Math.min(input.length, cursorIndex + 1);
      render();
      return;
    }

    if (key.name === "home") {
      cursorIndex = 0;
      render();
      return;
    }

    if (key.name === "end") {
      cursorIndex = input.length;
      render();
      return;
    }

    if (key.name === "delete") {
      if (cursorIndex < input.length) {
        input = input.slice(0, cursorIndex) + input.slice(cursorIndex + 1);
        menuIndex = 0;
        render();
      }
      return;
    }

    if (key.name === "backspace") {
      if (cursorIndex > 0) {
        input = input.slice(0, cursorIndex - 1) + input.slice(cursorIndex);
        cursorIndex--;
        menuIndex = 0;
        render();
      }
      return;
    }

    if (str && !key.ctrl && !key.meta) {
      // Discard escape sequences, mouse tracking fragments (e.g. <0;23;45M) and clutter
      if (str.startsWith("\x1b") || /^<[0-9;]+[Mm]$/.test(str)) {
        return;
      }
      const clean = str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").replace(/[\r\n]+/g, " ");
      if (clean) {
        input = input.slice(0, cursorIndex) + clean + input.slice(cursorIndex);
        cursorIndex += clean.length;
        menuIndex = 0;
        historyIndex = -1;
        render();
        return;
      }
    }
  };

  process.stdin.on("keypress", onKeypress);

  // ── Startup: clear screen, disable mouse tracking, set scroll region, draw header + glued bar ─────
  process.title = "oceancode";
  if (process.stdout.isTTY) {
    process.stdout.write("\x1b]0;oceancode\x07");
    process.stdout.write("\x1b]2;oceancode\x07");
    process.stdout.write("\x1b[2J\x1b[3J\x1b[H"); // clear full screen, scrollback history & move cursor to top-left
    process.stdout.write("\x1b[?1000l\x1b[?1002l\x1b[?1006l"); // disable mouse reporting escape codes so clicks don't inject numbers
    const { scrollBottom } = getBarMetrics(3);
    applyScrollRegion(scrollBottom);
    process.stdout.write("\x1b[1;1H");
    renderTopBar(getFriendlyModelName(currentBackendModel));
    process.stdout.write("\x1b7");
    paintBar();
  }
}
