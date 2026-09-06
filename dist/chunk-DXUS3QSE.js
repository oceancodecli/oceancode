// src/commands/run.ts
import chalk3 from "chalk";

// src/server/manager.ts
import { spawn } from "child_process";
import path from "path";
import os from "os";
import fs from "fs";
var DEFAULT_HOST = "127.0.0.1";
var DEFAULT_PORT = 4196;
var managedProcess = null;
function getBaseUrl(config) {
  const host = config?.host || process.env.OCEAN_SERVER_HOST || DEFAULT_HOST;
  const port = config?.port || (process.env.OCEAN_SERVER_PORT ? parseInt(process.env.OCEAN_SERVER_PORT) : DEFAULT_PORT);
  return `http://${host}:${port}`;
}
async function isServerHealthy(baseUrl) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1e3);
    const res = await fetch(`${baseUrl}/global/health`, {
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data.healthy);
  } catch {
    return false;
  }
}
var AGENT_SYSTEM_PROMPT = `You are OceanCode, an elite, autonomous AI software engineer designed to master large, complex codebases and write production-quality code without hallucination or truncation.

### CRITICAL PRINCIPLES FOR LARGE CODEBASES:
1. EXPLORE BEFORE ASSUMING:
   - Always use \`glob\` or \`grep\` to locate files, symbols, types, and imports before modifying or referencing them.
   - For broad codebase investigation, use the \`task\` tool with \`subagent_type: "explore"\`.
   - Never assume an import, function, or class exists without verifying where it is defined.

2. PRECISE FILE READING:
   - For large files (>200 lines), use the \`read\` tool with \`offset\` and \`limit\` to inspect the exact sections you need.
   - Never skim or guess file contents.

3. CLEAN, SURGICAL FILE MODIFICATION:
   - NEVER overwrite a large existing file with \`write\` when making targeted changes.
   - ALWAYS read the file first, then use \`edit\` with the exact unique \`oldString\` and updated \`newString\`.
   - Ensure \`oldString\` contains enough surrounding context lines (3-5 lines) to be completely unique in the file.

4. COMPLETE, PRODUCTION-READY WRITING (ZERO HALLUCINATIONS):
   - When using \`write\` to create new files or rewrite small files, ALWAYS output complete, functional, working code.
   - NEVER output placeholders, ellipsis comments, or abbreviations like:
     // ... rest of code unchanged ...
     // TODO: implement later
     /* existing code goes here */
   - Every file written MUST be syntactically valid and completely filled in.

5. VERIFICATION & RECOVERY:
   - After making changes, use \`bash\` to run typechecks (\`tsc --noEmit\`), build steps (\`npm run build\`), or tests (\`npm test\`).
6. READABLE, STRUCTURED & ENGAGING RESPONSES (NO WALLS OF TEXT):
   - NEVER output dense, unbroken walls of text or rambling paragraphs.
   - ALWAYS format your responses with high visual structure:
     \u2022 \u{1F3AF} Bullet Points with Emojis: Use clean bullet points prefixed with contextual emojis (\u{1F4C1}, \u{1F527}, \u{1F4A1}, \u26A1, \u{1F680}, \u26A0\uFE0F, \u2705, \u{1F4CC}, \u{1F3AF}, \u{1F50D}) so key takeaways scan instantly.
     \u2022 \u{1F522} Numbered Steps: Use numbered lists (1., 2., 3.) for chronological execution steps, install steps, or procedures.
     \u2022 \u{1F524} Bold & Code Highlights: Bold key concepts (**keyword**, **feature**) and use inline code (\`path/file.ts\`, \`function()\`) to clearly separate technical terms from explanation.
     \u2022 \u{1F4BB} Fenced Code Blocks: Always specify syntax language for code snippets (\`\`\`typescript, \`\`\`bash, etc.).
     \u2022 \u2702\uFE0F Crisp Executive Summaries: Start with a brief, punchy overview, present the structured content (bullets), and finish with clear next steps.
7. CLEAN, TO THE POINT & DECORATIVE GREETINGS / RESPONSES:
   - When introducing yourself, greeting the user, or providing project overviews:
     \u2022 Keep it concise, punchy, decorative, and directly to the point \u2014 avoid rambling filler.
     \u2022 Open with a stylish, clean greeting header (e.g. \u{1F30A} **OceanCode** \xB7 *<Project Name> Engineer*).
     \u2022 Highlight capabilities with crisp emoji bullets (\u{1F680}, \u26A1, \u{1F527}, \u{1F50D}).
     \u2022 Present project tech stack in a clean, compact markdown table.
     \u2022 Finish with a friendly, direct prompt asking what the user wants to tackle.`;
function setupServerConfig(oceanConfigDir) {
  const opencodeConfigDir = path.join(oceanConfigDir, "opencode");
  fs.mkdirSync(opencodeConfigDir, { recursive: true });
  const configPath = path.join(opencodeConfigDir, "opencode.json");
  let existing = {};
  if (fs.existsSync(configPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    } catch {
    }
  }
  const permissions = {
    "*": "allow",
    read: "allow",
    write: "allow",
    edit: "allow",
    glob: "allow",
    grep: "allow",
    list: "allow",
    bash: "allow",
    task: "allow",
    external_directory: "allow",
    todowrite: "allow",
    doom_loop: "allow",
    skill: "allow",
    webfetch: "allow",
    websearch: "allow",
    question: "allow"
  };
  const merged = {
    $schema: "https://opencode.ai/config.json",
    ...existing,
    permission: {
      ...permissions,
      ...existing.permission || {}
    },
    agent: {
      ...existing.agent || {},
      build: {
        ...existing.agent?.build || {},
        prompt: AGENT_SYSTEM_PROMPT,
        permission: permissions
      },
      plan: {
        ...existing.agent?.plan || {},
        prompt: AGENT_SYSTEM_PROMPT,
        permission: {
          ...permissions,
          edit: "deny",
          write: "deny"
        }
      }
    }
  };
  fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), "utf-8");
  const projectConfigPath = path.join(process.cwd(), "opencode.json");
  if (fs.existsSync(projectConfigPath)) {
    try {
      const projExisting = JSON.parse(fs.readFileSync(projectConfigPath, "utf-8"));
      const projMerged = {
        ...projExisting,
        agent: {
          ...projExisting.agent || {},
          build: {
            ...projExisting.agent?.build || {},
            prompt: AGENT_SYSTEM_PROMPT,
            permission: permissions
          },
          plan: {
            ...projExisting.agent?.plan || {},
            prompt: AGENT_SYSTEM_PROMPT,
            permission: {
              ...permissions,
              edit: "deny",
              write: "deny"
            }
          }
        }
      };
      fs.writeFileSync(projectConfigPath, JSON.stringify(projMerged, null, 2), "utf-8");
    } catch {
    }
  }
}
async function ensureServer(config) {
  const oceanConfigDir = path.join(os.homedir(), ".config", "oceancode");
  setupServerConfig(oceanConfigDir);
  const baseUrl = getBaseUrl(config);
  const healthy = await isServerHealthy(baseUrl);
  if (healthy) {
    return baseUrl;
  }
  const port = config?.port || (process.env.OCEAN_SERVER_PORT ? parseInt(process.env.OCEAN_SERVER_PORT) : DEFAULT_PORT);
  const host = config?.host || process.env.OCEAN_SERVER_HOST || DEFAULT_HOST;
  const oceanDataDir = path.join(os.homedir(), ".local", "share", "oceancode");
  const oceanStateDir = path.join(os.homedir(), ".local", "state", "oceancode");
  fs.mkdirSync(oceanDataDir, { recursive: true });
  fs.mkdirSync(oceanConfigDir, { recursive: true });
  fs.mkdirSync(oceanStateDir, { recursive: true });
  const env = {
    ...process.env,
    XDG_DATA_HOME: oceanDataDir,
    XDG_CONFIG_HOME: oceanConfigDir,
    XDG_STATE_HOME: oceanStateDir
  };
  try {
    const child = spawn(`opencode serve --port ${port} --hostname ${host}`, {
      shell: true,
      windowsHide: true,
      stdio: "ignore",
      cwd: process.cwd(),
      env
    });
    managedProcess = child;
    process.on("exit", () => {
      try {
        if (managedProcess && !managedProcess.killed) {
          managedProcess.kill();
        }
      } catch {
      }
    });
    const startTime = Date.now();
    const MAX_WAIT_MS = 15e3;
    while (Date.now() - startTime < MAX_WAIT_MS) {
      await new Promise((r) => setTimeout(r, 200));
      if (await isServerHealthy(baseUrl)) {
        return baseUrl;
      }
    }
    throw new Error(`Ocean backend failed to respond on ${baseUrl}.`);
  } catch (err) {
    throw err;
  }
}

// src/server/client.ts
import http from "http";
var OceanClient = class {
  baseUrl;
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }
  async getHealth() {
    const res = await fetch(`${this.baseUrl}/global/health`);
    return await res.json();
  }
  async getProviders() {
    const res = await fetch(`${this.baseUrl}/provider`);
    if (!res.ok) throw new Error(`Failed to fetch providers: ${res.statusText}`);
    const data = await res.json();
    return data.all || [];
  }
  async getModels() {
    const providers = await this.getProviders();
    const list = [];
    for (const p of providers) {
      if (!p.models) continue;
      for (const [modelKey, modelData] of Object.entries(p.models)) {
        const isFree = p.id === "opencode" || modelKey.includes("free") || modelData.cost?.input === 0;
        list.push({
          id: modelData.id || modelKey,
          providerID: p.id,
          name: modelData.name || modelKey,
          isFree
        });
      }
    }
    return list;
  }
  async createSession(title = "Ocean Session", directory = process.cwd()) {
    const url = new URL(`${this.baseUrl}/session`);
    url.searchParams.set("directory", directory);
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-opencode-directory": directory
      },
      body: JSON.stringify({ title, directory })
    });
    if (!res.ok) {
      throw new Error(`Failed to create session: ${res.statusText}`);
    }
    return await res.json();
  }
  async getSessionDiff(sessionID) {
    try {
      const res = await fetch(`${this.baseUrl}/session/${sessionID}/diff`);
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  }
  async revertSession(sessionID, messageID) {
    try {
      const res = await fetch(`${this.baseUrl}/session/${sessionID}/revert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageID })
      });
      return res.ok;
    } catch {
      return false;
    }
  }
  async summarizeSession(sessionID) {
    try {
      const res = await fetch(`${this.baseUrl}/session/${sessionID}/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      return res.ok;
    } catch {
      return false;
    }
  }
  async listSessions(limit = 20) {
    const res = await fetch(`${this.baseUrl}/session?limit=${limit}`);
    if (!res.ok) throw new Error(`Failed to list sessions: ${res.statusText}`);
    return await res.json();
  }
  async getSessionMessages(sessionID) {
    const res = await fetch(`${this.baseUrl}/session/${sessionID}/message`);
    if (!res.ok) throw new Error(`Failed to get session messages: ${res.statusText}`);
    return await res.json();
  }
  async promptSession(sessionID, text, options) {
    let providerID = "opencode";
    let modelID = "big-pickle";
    if (options?.model) {
      if (options.model.includes("/")) {
        const parts = options.model.split("/");
        providerID = parts[0];
        modelID = parts.slice(1).join("/");
      } else {
        modelID = options.model;
      }
    }
    const payload = {
      parts: [{ type: "text", text }],
      model: {
        providerID,
        modelID
      },
      agent: options?.agent || "build"
    };
    const dir = options?.directory || process.cwd();
    const res = await fetch(`${this.baseUrl}/session/${sessionID}/prompt_async`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-opencode-directory": dir
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Prompt error (${res.status}): ${errText}`);
    }
    const resText = await res.text();
    return resText ? JSON.parse(resText) : { success: true };
  }
  async replyPermission(requestID, reply = "always") {
    const res = await fetch(`${this.baseUrl}/permission/${requestID}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reply })
    });
    return res.ok;
  }
  async replyQuestion(requestID, answers) {
    const res = await fetch(`${this.baseUrl}/question/${requestID}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers })
    });
    return res.ok;
  }
  async abortSession(sessionID) {
    const res = await fetch(`${this.baseUrl}/session/${sessionID}/abort`, {
      method: "POST"
    });
    return res.ok;
  }
  /**
   * Subscribe to server SSE stream. Returns an unsubscribe function.
   */
  subscribeEvents(onEvent, onError, directory = process.cwd()) {
    const url = new URL(`${this.baseUrl}/event`);
    if (directory) {
      url.searchParams.set("directory", directory);
    }
    let isCancelled = false;
    let currentRes = null;
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        headers: { Accept: "text/event-stream" }
      },
      (res) => {
        currentRes = res;
        let buffer = "";
        res.on("data", (chunk) => {
          if (isCancelled) return;
          buffer += chunk.toString("utf-8");
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("data: ")) {
              const dataStr = trimmed.slice(6);
              try {
                const parsed = JSON.parse(dataStr);
                onEvent(parsed);
              } catch {
              }
            }
          }
        });
        res.on("error", (err) => {
          if (!isCancelled && onError) onError(err);
        });
      }
    );
    req.on("error", (err) => {
      if (!isCancelled && onError) onError(err);
    });
    req.end();
    return () => {
      isCancelled = true;
      if (currentRes) {
        currentRes.destroy();
        currentRes = null;
      }
      req.destroy();
    };
  }
};

// src/ui/renderer.ts
import chalk2 from "chalk";

// src/ui/layout.ts
import chalk from "chalk";
var INDENT = "  ";
var OCEAN_BLUE = "#0088ff";
var OCEAN_CYAN = "#38bdf8";
function getLayoutDimensions() {
  const terminalWidth = process.stdout.columns || 80;
  return { terminalWidth, contentWidth: 80, leftMargin: 2 };
}
function getBigLogo() {
  const line0 = "\u2800" + " ".repeat(37) + "\u2584";
  const line1 = "\u2588\u2580\u2580\u2588 \u2588\u2580\u2580\u2580 \u2588\u2580\u2580\u2588 \u2584\u2580\u2580\u2588 \u2588\u2580\u2580\u2584 \u2588\u2580\u2580\u2580 \u2588\u2580\u2580\u2588 \u2588\u2580\u2580\u2588 \u2588\u2580\u2580\u2588";
  const line2 = "\u2588  \u2588 \u2588    \u2588\u2580\u2580\u2580 \u2588\u2584\u2584\u2588 \u2588  \u2588 \u2588    \u2588  \u2588 \u2588  \u2588 \u2588\u2580\u2580\u2580";
  const line3 = "\u2580\u2580\u2580\u2580 \u2580\u2580\u2580\u2580 \u2580\u2580\u2580\u2580    \u2580 \u2580  \u2580 \u2580\u2580\u2580\u2580 \u2580\u2580\u2580\u2580 \u2580\u2580\u2580\u2580 \u2580\u2580\u2580\u2580";
  return [
    chalk.hex("#60a5fa")(line0),
    chalk.hex(OCEAN_CYAN).bold(line1),
    chalk.hex(OCEAN_BLUE).bold(line2),
    chalk.hex("#0055b3")(line3)
  ].join("\n");
}
function renderBigLogo(indent = INDENT) {
  const line0 = "\u2800" + " ".repeat(37) + "\u2584";
  const line1 = "\u2588\u2580\u2580\u2588 \u2588\u2580\u2580\u2580 \u2588\u2580\u2580\u2588 \u2584\u2580\u2580\u2588 \u2588\u2580\u2580\u2584 \u2588\u2580\u2580\u2580 \u2588\u2580\u2580\u2588 \u2588\u2580\u2580\u2588 \u2588\u2580\u2580\u2588";
  const line2 = "\u2588  \u2588 \u2588    \u2588\u2580\u2580\u2580 \u2588\u2584\u2584\u2588 \u2588  \u2588 \u2588    \u2588  \u2588 \u2588  \u2588 \u2588\u2580\u2580\u2580";
  const line3 = "\u2580\u2580\u2580\u2580 \u2580\u2580\u2580\u2580 \u2580\u2580\u2580\u2580    \u2580 \u2580  \u2580 \u2580\u2580\u2580\u2580 \u2580\u2580\u2580\u2580 \u2580\u2580\u2580\u2580 \u2580\u2580\u2580\u2580";
  console.log("");
  console.log(indent + chalk.hex("#60a5fa")(line0));
  console.log(indent + chalk.hex(OCEAN_CYAN).bold(line1));
  console.log(indent + chalk.hex(OCEAN_BLUE).bold(line2));
  console.log(indent + chalk.hex("#0055b3")(line3));
}
function renderTopBar(modelName, cwd = process.cwd()) {
  const width = Math.max(60, process.stdout.columns || 80);
  const folderStr = cwd.length > 35 ? "..." + cwd.slice(-32) : cwd;
  renderBigLogo(INDENT);
  console.log("");
  const leftText = folderStr;
  const rightText = modelName + "  /help";
  const spaces = Math.max(2, width - (leftText.length + rightText.length + 6));
  console.log(
    INDENT + chalk.dim(leftText) + " ".repeat(spaces) + chalk.hex(OCEAN_BLUE).bold(modelName) + "  " + chalk.dim("/help")
  );
  console.log(INDENT + chalk.dim("\u2500".repeat(Math.max(40, width - 4))));
  console.log("");
}
function renderUserMessageCard(text, _modelName) {
  const width = Math.min(80, (process.stdout.columns || 80) - 4);
  const bar = chalk.hex(OCEAN_BLUE)("\u258C");
  const bg = chalk.bgHex("#161b22");
  const lines = text.split("\n");
  for (const l of lines) {
    const pad = Math.max(2, width - l.length - 3);
    console.log(bar + bg(" " + l + " ".repeat(pad)));
  }
  console.log("");
}
function renderFooter(modelName, durationSec, agent = "Build") {
  const icon = chalk.hex(OCEAN_BLUE)("\u25A3");
  const agentLabel = chalk.bold.white(agent);
  const dot = chalk.dim(" \xB7 ");
  const modelLabel = chalk.hex("#94a3b8")(modelName);
  const timeLabel = chalk.dim(`${durationSec.toFixed(1)}s`);
  console.log(`
${INDENT}${icon}  ${agentLabel}${dot}${modelLabel}${dot}${timeLabel}`);
}

// src/ui/toolLabels.ts
var TOOL_LABEL_MAP = {
  // ── Filesystem ─────────────────────────────────────────────────────────────
  filesystem_read_text_file: { icon: "\u{1F4D6}", label: "Reading file" },
  filesystem_read_file: { icon: "\u{1F4D6}", label: "Reading file" },
  read_file: { icon: "\u{1F4D6}", label: "Reading file" },
  read: { icon: "\u{1F4D6}", label: "Reading file" },
  filesystem_write_file: { icon: "\u270F\uFE0F ", label: "Writing file" },
  filesystem_write_text_file: { icon: "\u270F\uFE0F ", label: "Writing file" },
  write_file: { icon: "\u270F\uFE0F ", label: "Writing file" },
  write: { icon: "\u270F\uFE0F ", label: "Writing file" },
  filesystem_edit_file: { icon: "\u{1F527}", label: "Editing file" },
  edit_file: { icon: "\u{1F527}", label: "Editing file" },
  edit: { icon: "\u{1F527}", label: "Editing file" },
  patch: { icon: "\u{1F527}", label: "Patching file" },
  filesystem_list_directory: { icon: "\u{1F4C1}", label: "Listing directory" },
  filesystem_list_allowed_directories: { icon: "\u{1F4C1}", label: "Listing allowed directories" },
  list_directory: { icon: "\u{1F4C1}", label: "Listing directory" },
  ls: { icon: "\u{1F4C1}", label: "Listing directory" },
  filesystem_create_directory: { icon: "\u{1F4C2}", label: "Creating directory" },
  create_directory: { icon: "\u{1F4C2}", label: "Creating directory" },
  filesystem_move_file: { icon: "\u{1F4E6}", label: "Moving file" },
  filesystem_copy_file: { icon: "\u{1F4CB}", label: "Copying file" },
  filesystem_delete_file: { icon: "\u{1F5D1}\uFE0F ", label: "Deleting file" },
  filesystem_rename_file: { icon: "\u{1F3F7}\uFE0F ", label: "Renaming file" },
  filesystem_search_files: { icon: "\u{1F50D}", label: "Searching files" },
  filesystem_find_files: { icon: "\u{1F50D}", label: "Finding files" },
  filesystem_get_file_info: { icon: "\u2139\uFE0F ", label: "Getting file info" },
  filesystem_stat: { icon: "\u2139\uFE0F ", label: "Getting file info" },
  // ── Shell / Bash ───────────────────────────────────────────────────────────
  bash: { icon: "\u26A1", label: "Running command" },
  shell: { icon: "\u26A1", label: "Running command" },
  run_command: { icon: "\u26A1", label: "Running command" },
  exec: { icon: "\u26A1", label: "Running command" },
  execute: { icon: "\u26A1", label: "Running command" },
  run_terminal_cmd: { icon: "\u26A1", label: "Running command" },
  // ── Search / Grep ──────────────────────────────────────────────────────────
  grep: { icon: "\u{1F50E}", label: "Searching code" },
  grep_search: { icon: "\u{1F50E}", label: "Searching code" },
  ripgrep: { icon: "\u{1F50E}", label: "Searching code" },
  glob: { icon: "\u{1F50D}", label: "Globbing files" },
  find: { icon: "\u{1F50D}", label: "Finding files" },
  // ── Web / HTTP ─────────────────────────────────────────────────────────────
  web_search: { icon: "\u{1F310}", label: "Searching web" },
  search_web: { icon: "\u{1F310}", label: "Searching web" },
  browser: { icon: "\u{1F310}", label: "Opening browser" },
  fetch: { icon: "\u{1F310}", label: "Fetching URL" },
  http_request: { icon: "\u{1F310}", label: "HTTP request" },
  curl: { icon: "\u{1F310}", label: "Fetching URL" },
  // ── Todo / Task management ─────────────────────────────────────────────────
  todowrite: { icon: "\u{1F4DD}", label: "Updating todo list" },
  todo_write: { icon: "\u{1F4DD}", label: "Updating todo list" },
  todoread: { icon: "\u{1F4CB}", label: "Reading todo list" },
  todo_read: { icon: "\u{1F4CB}", label: "Reading todo list" },
  // ── Subagent / Task ────────────────────────────────────────────────────────
  task: { icon: "\u{1F916}", label: "Spawning subagent" },
  spawn_agent: { icon: "\u{1F916}", label: "Spawning subagent" },
  agent: { icon: "\u{1F916}", label: "Running agent" },
  // ── Git ────────────────────────────────────────────────────────────────────
  git_status: { icon: "\u{1F500}", label: "Git status" },
  git_diff: { icon: "\u{1F500}", label: "Git diff" },
  git_commit: { icon: "\u{1F500}", label: "Git commit" },
  git_log: { icon: "\u{1F500}", label: "Git log" },
  git: { icon: "\u{1F500}", label: "Git" },
  // ── AI / Model ─────────────────────────────────────────────────────────────
  openai: { icon: "\u{1F9E0}", label: "Calling model" },
  anthropic: { icon: "\u{1F9E0}", label: "Calling model" },
  gemini: { icon: "\u{1F9E0}", label: "Calling model" }
};
function getFriendlyToolLabel(rawName) {
  const exact = TOOL_LABEL_MAP[rawName];
  if (exact) return exact;
  for (const [key, val] of Object.entries(TOOL_LABEL_MAP)) {
    if (rawName.startsWith(key) || key.startsWith(rawName)) return val;
  }
  const clean = rawName.replace(/^(filesystem_|mcp_)/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return { icon: "\u{1F527}", label: clean };
}

// src/ui/renderer.ts
var StreamRenderer = class {
  reasoningStarted = false;
  textStarted = false;
  currentReasoningLength = 0;
  currentTextLength = 0;
  startTime = 0;
  modelName = "Big Pickle";
  toolsUsed = [];
  thinkingTimer = null;
  thinkingFrame = 0;
  eraseBarFn = null;
  pinBarFn = null;
  /** Dedupe tracker: OpenCode emits pending → running → completed updates per tool part */
  seenTools = /* @__PURE__ */ new Map();
  /** Per-part streamed text length — prevents duplicate/lost output across parts */
  textLens = /* @__PURE__ */ new Map();
  /** Wire the interactive bar renderer and eraser */
  setPinBar(pinFn, eraseFn) {
    this.pinBarFn = pinFn;
    this.eraseBarFn = eraseFn;
  }
  getThinkingFrame() {
    return this.thinkingFrame;
  }
  eraseBar() {
    this.eraseBarFn?.();
  }
  repinBar() {
    this.pinBarFn?.();
  }
  /** Collapse a tool detail to a single short line so long commands don't scroll */
  formatDetail(detail) {
    if (detail === void 0 || detail === null) return "";
    const raw = Array.isArray(detail) ? detail.join(" ") : String(detail);
    const oneLine = raw.replace(/[\r\n]+/g, " ").replace(/\s{2,}/g, " ").trim();
    const MAX = 100;
    return oneLine.length > MAX ? oneLine.slice(0, MAX - 1) + "\u2026" : oneLine;
  }
  // ── Thinking animation ───────────────────────────────────────────────────────
  start(modelName = "Big Pickle") {
    this.stopThinkingAnimation();
    this.modelName = modelName;
    this.startTime = Date.now();
    this.reasoningStarted = false;
    this.textStarted = false;
    this.currentReasoningLength = 0;
    this.currentTextLength = 0;
    this.toolsUsed = [];
    this.seenTools.clear();
    this.textLens.clear();
    this.thinkingFrame = 0;
    this.repinBar();
    this.startThinkingAnimation();
  }
  startThinkingAnimation() {
    if (this.thinkingTimer) return;
    this.thinkingTimer = setInterval(() => {
      this.thinkingFrame++;
      this.repinBar();
    }, 200);
  }
  stopThinkingAnimation() {
    if (!this.thinkingTimer) return;
    clearInterval(this.thinkingTimer);
    this.thinkingTimer = null;
  }
  // ── Public event handlers ────────────────────────────────────────────────────
  handleReasoning(fullText) {
    this.reasoningStarted = true;
    this.currentReasoningLength = fullText.length;
  }
  handleTool(toolName, detail, partId, status) {
    const key = partId ?? `${toolName}::${typeof detail === "string" ? detail : ""}`;
    const prev = this.seenTools.get(key);
    if (prev) {
      if (status && (status === "completed" || status === "error")) this.seenTools.set(key, status);
      return;
    }
    this.seenTools.set(key, status ?? "running");
    this.stopThinkingAnimation();
    if (!this.toolsUsed.includes(toolName)) this.toolsUsed.push(toolName);
    this.eraseBar();
    const { icon, label } = getFriendlyToolLabel(toolName);
    const badge = chalk2.bgHex("#3b82f6").black.bold(" TOOL ");
    const action = chalk2.bold.hex("#60a5fa")(`${icon} ${label}`);
    const clean = this.formatDetail(detail);
    const info = clean ? chalk2.dim(`  ${clean}`) : "";
    process.stdout.write(`
${INDENT}${badge} ${action}${info}
`);
    this.repinBar();
    this.startThinkingAnimation();
  }
  handleDelta(delta, partId = "default") {
    if (!delta) return;
    this.stopThinkingAnimation();
    if (!this.textStarted) {
      this.textStarted = true;
      this.eraseBar();
      if (this.toolsUsed.length > 0) {
        process.stdout.write(
          `${INDENT}${chalk2.green("\u2713")} ${chalk2.dim(`Used tools: ${this.toolsUsed.join(", ")}`)}

`
        );
      }
    }
    this.currentTextLength += delta.length;
    this.textLens.set(partId, (this.textLens.get(partId) ?? 0) + delta.length);
    process.stdout.write(delta);
  }
  handleText(fullText, partId = "default") {
    if (!fullText) return;
    this.stopThinkingAnimation();
    if (!this.textStarted) {
      this.textStarted = true;
      this.eraseBar();
      if (this.toolsUsed.length > 0) {
        process.stdout.write(
          `${INDENT}${chalk2.green("\u2713")} ${chalk2.dim(`Used tools: ${this.toolsUsed.join(", ")}`)}

`
        );
      }
    }
    const written = this.textLens.get(partId) ?? 0;
    if (fullText.length <= written) return;
    const slice = fullText.slice(written);
    this.textLens.set(partId, fullText.length);
    this.currentTextLength += slice.length;
    process.stdout.write(slice);
  }
  finish(agent = "Build") {
    this.stopThinkingAnimation();
    const totalSec = Math.max(0.1, (Date.now() - this.startTime) / 1e3);
    process.stdout.write("\n");
    renderFooter(this.modelName, totalSec, agent);
    this.reasoningStarted = false;
    this.textStarted = false;
    this.currentReasoningLength = 0;
    this.currentTextLength = 0;
    this.toolsUsed = [];
    this.seenTools.clear();
    this.textLens.clear();
    this.repinBar();
  }
};

// src/server/auth.ts
import path2 from "path";
import os2 from "os";
import fs2 from "fs";
var SUPPORTED_BYOK_PROVIDERS = [
  { id: "openai", name: "OpenAI", envVar: "OPENAI_API_KEY", placeholder: "sk-proj-..." },
  { id: "anthropic", name: "Anthropic", envVar: "ANTHROPIC_API_KEY", placeholder: "sk-ant-..." },
  { id: "google", name: "Google Gemini", envVar: "GEMINI_API_KEY", placeholder: "AIzaSy..." },
  { id: "deepseek", name: "DeepSeek", envVar: "DEEPSEEK_API_KEY", placeholder: "sk-..." },
  { id: "groq", name: "Groq", envVar: "GROQ_API_KEY", placeholder: "gsk_..." },
  { id: "openrouter", name: "OpenRouter", envVar: "OPENROUTER_API_KEY", placeholder: "sk-or-..." }
];
async function validateProviderKey(providerId, key) {
  const cleanKey = key.trim();
  if (!cleanKey) {
    return { valid: false, message: "API key cannot be empty." };
  }
  const normalized = providerId.toLowerCase().trim();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8e3);
  try {
    let res;
    if (normalized === "openai") {
      res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${cleanKey}` },
        signal: controller.signal
      });
    } else if (normalized === "anthropic") {
      res = await fetch("https://api.anthropic.com/v1/models", {
        headers: {
          "x-api-key": cleanKey,
          "anthropic-version": "2023-06-01"
        },
        signal: controller.signal
      });
    } else if (normalized === "google" || normalized === "gemini") {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(cleanKey)}`, {
        signal: controller.signal
      });
    } else if (normalized === "deepseek") {
      res = await fetch("https://api.deepseek.com/models", {
        headers: { Authorization: `Bearer ${cleanKey}` },
        signal: controller.signal
      });
    } else if (normalized === "groq") {
      res = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: `Bearer ${cleanKey}` },
        signal: controller.signal
      });
    } else if (normalized === "openrouter") {
      res = await fetch("https://openrouter.ai/api/v1/auth/key", {
        headers: { Authorization: `Bearer ${cleanKey}` },
        signal: controller.signal
      });
    } else {
      clearTimeout(timeout);
      return { valid: false, message: `Unknown provider: ${providerId}` };
    }
    clearTimeout(timeout);
    if (res.ok) {
      return { valid: true, message: "API key is valid and connected." };
    }
    let detail = "";
    try {
      const data = await res.json();
      detail = data.error?.message || data.message || `HTTP ${res.status}`;
    } catch {
      detail = `HTTP status ${res.status}`;
    }
    return { valid: false, message: `Rejected by ${providerId}: ${detail}` };
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      return { valid: false, message: "Validation timed out after 8 seconds." };
    }
    return { valid: false, message: `Network error during validation: ${err.message}` };
  }
}
function getAuthPaths() {
  const oceanAuth = path2.join(os2.homedir(), ".local", "share", "oceancode", "auth.json");
  const opencodeAuth = path2.join(os2.homedir(), ".local", "share", "opencode", "auth.json");
  return [oceanAuth, opencodeAuth];
}
function getStoredCredentials() {
  const paths = getAuthPaths();
  const merged = {};
  for (const p of paths) {
    if (fs2.existsSync(p)) {
      try {
        const raw = fs2.readFileSync(p, "utf-8");
        const parsed = JSON.parse(raw);
        if (typeof parsed === "object" && parsed !== null) {
          Object.assign(merged, parsed);
        }
      } catch {
      }
    }
  }
  for (const prov of SUPPORTED_BYOK_PROVIDERS) {
    const envVal = process.env[prov.envVar];
    if (envVal && !merged[prov.id]) {
      merged[prov.id] = { type: "api", key: envVal };
    }
  }
  return merged;
}
function saveProviderKey(providerId, key) {
  const normalizedId = providerId.toLowerCase().trim();
  const paths = getAuthPaths();
  for (const p of paths) {
    try {
      const dir = path2.dirname(p);
      fs2.mkdirSync(dir, { recursive: true });
      let current = {};
      if (fs2.existsSync(p)) {
        try {
          current = JSON.parse(fs2.readFileSync(p, "utf-8"));
        } catch {
        }
      }
      current[normalizedId] = { type: "api", key: key.trim() };
      fs2.writeFileSync(p, JSON.stringify(current, null, 2), "utf-8");
    } catch {
    }
  }
  const matched = SUPPORTED_BYOK_PROVIDERS.find((p) => p.id === normalizedId);
  if (matched) {
    process.env[matched.envVar] = key.trim();
  }
}
function removeProviderKey(providerId) {
  const normalizedId = providerId.toLowerCase().trim();
  const paths = getAuthPaths();
  for (const p of paths) {
    try {
      if (fs2.existsSync(p)) {
        const current = JSON.parse(fs2.readFileSync(p, "utf-8"));
        if (current[normalizedId]) {
          delete current[normalizedId];
          fs2.writeFileSync(p, JSON.stringify(current, null, 2), "utf-8");
        }
      }
    } catch {
    }
  }
  const matched = SUPPORTED_BYOK_PROVIDERS.find((p) => p.id === normalizedId);
  if (matched) {
    delete process.env[matched.envVar];
  }
}

// src/models/registry.ts
var OCEAN_MODELS = [
  {
    id: "opencode/muse-spark-1.3-contributor-free",
    name: "Muse Spark 1.3 (1M Context)",
    description: "1,048,576 tokens \xB7 Best for big codebases & large files",
    tag: "1M Context",
    isFree: true,
    provider: "opencode"
  },
  {
    id: "opencode/nemotron-3-ultra-free",
    name: "Nemotron 3 Ultra",
    description: "Deep reasoning & architecture analysis",
    tag: "Reasoning",
    isFree: true,
    provider: "opencode"
  },
  {
    id: "opencode/nemotron-3.5-lightning-free",
    name: "Nemotron 3.5 Lightning",
    description: "Ultra-fast completions \xB7 262k context",
    tag: "Speed",
    isFree: true,
    provider: "opencode"
  },
  {
    id: "opencode/mimo-v2.5-free",
    name: "MiMo 2.5",
    description: "High accuracy code refactoring & design",
    tag: "Pro",
    isFree: true,
    provider: "opencode"
  },
  {
    id: "opencode/big-pickle",
    name: "Big Pickle",
    description: "General purpose & code generation",
    tag: "Default",
    isFree: true,
    provider: "opencode"
  },
  {
    id: "opencode/ling-3.0-flash-fin-free",
    name: "Ling 3.0 Flash",
    description: "Instant responses & quick answers",
    tag: "Instant",
    isFree: true,
    provider: "opencode"
  },
  {
    id: "opencode/muse-spark-1.2-contributor-free",
    name: "Muse Spark 1.2",
    description: "Lightweight efficient companion \xB7 1M context",
    tag: "Light",
    isFree: true,
    provider: "opencode"
  },
  // BYOK Models (Only visible when the respective provider API key is connected)
  {
    id: "openai/gpt-4o",
    name: "OpenAI GPT-4o",
    description: "Flagship multimodal intelligence",
    tag: "OpenAI",
    isFree: false,
    provider: "openai"
  },
  {
    id: "openai/o3-mini",
    name: "OpenAI o3-mini",
    description: "High-speed reasoning for coding",
    tag: "OpenAI",
    isFree: false,
    provider: "openai"
  },
  {
    id: "anthropic/claude-3-5-sonnet-latest",
    name: "Claude 3.5 Sonnet",
    description: "State-of-the-art coding & refactoring",
    tag: "Anthropic",
    isFree: false,
    provider: "anthropic"
  },
  {
    id: "google/gemini-2.5-pro",
    name: "Google Gemini 2.5 Pro",
    description: "Long-context reasoning & coding",
    tag: "Google",
    isFree: false,
    provider: "google"
  },
  {
    id: "deepseek/deepseek-chat",
    name: "DeepSeek V3",
    description: "Powerful open-weight architecture",
    tag: "DeepSeek",
    isFree: false,
    provider: "deepseek"
  },
  {
    id: "deepseek/deepseek-reasoner",
    name: "DeepSeek R1",
    description: "Pure reasoning & mathematical logic",
    tag: "DeepSeek",
    isFree: false,
    provider: "deepseek"
  },
  {
    id: "groq/llama-3.3-70b-versatile",
    name: "Groq Llama 3.3 70B",
    description: "Ultra-low latency inference",
    tag: "Groq",
    isFree: false,
    provider: "groq"
  }
];
function getAvailableOceanModels(credentials) {
  const creds = credentials || getStoredCredentials();
  return OCEAN_MODELS.filter((m) => {
    if (m.isFree || m.provider === "opencode") return true;
    return Boolean(creds[m.provider]?.key);
  });
}
function getFriendlyModelName(backendId) {
  const match = OCEAN_MODELS.find((m) => m.id === backendId);
  if (match) return match.name;
  return backendId.replace(/^opencode\//, "").replace(/-free$/, "");
}
function getBackendModelId(friendlyOrPartial) {
  const lower = friendlyOrPartial.toLowerCase().trim();
  const num = parseInt(lower);
  if (!isNaN(num) && num >= 1 && num <= OCEAN_MODELS.length) {
    return OCEAN_MODELS[num - 1].id;
  }
  const match = OCEAN_MODELS.find(
    (m) => m.name.toLowerCase() === lower || m.id.toLowerCase() === lower || m.name.toLowerCase().includes(lower) || m.id.toLowerCase().includes(lower)
  );
  if (match) return match.id;
  if (lower.includes("spark-1.3") || lower.includes("spark 1.3") || lower.includes("1m")) return "opencode/muse-spark-1.3-contributor-free";
  if (lower.includes("gpt-4o") || lower.includes("gpt4o") || lower.includes("openai")) return "openai/gpt-4o";
  if (lower.includes("o3") || lower.includes("o3-mini")) return "openai/o3-mini";
  if (lower.includes("claude") || lower.includes("sonnet") || lower.includes("anthropic")) return "anthropic/claude-3-5-sonnet-latest";
  if (lower.includes("gemini")) return "google/gemini-2.5-pro";
  if (lower.includes("r1") || lower.includes("reasoner")) return "deepseek/deepseek-reasoner";
  if (lower.includes("deepseek") || lower.includes("v3")) return "deepseek/deepseek-chat";
  if (lower.includes("groq")) return "groq/llama-3.3-70b-versatile";
  if (lower.includes("mimo")) return "opencode/mimo-v2.5-free";
  if (lower.includes("ultra")) return "opencode/nemotron-3-ultra-free";
  if (lower.includes("nemotron") || lower.includes("lightning")) return "opencode/nemotron-3.5-lightning-free";
  if (lower.includes("ling") || lower.includes("flash")) return "opencode/ling-3.0-flash-fin-free";
  if (lower.includes("muse") || lower.includes("spark")) return "opencode/muse-spark-1.3-contributor-free";
  if (lower.includes("pickle")) return "opencode/big-pickle";
  if (lower.includes("/")) return lower;
  return `opencode/${lower}`;
}

// src/commands/run.ts
async function runCommand(messages, options) {
  const promptText = messages.join(" ").trim();
  if (!promptText) {
    console.error(chalk3.red("Error: No prompt provided. Usage: oceancode run <message>"));
    process.exit(1);
  }
  const baseUrl = await ensureServer();
  const client = new OceanClient(baseUrl);
  const renderer = new StreamRenderer();
  const backendModel = options.model ? getBackendModelId(options.model) : "opencode/muse-spark-1.3-contributor-free";
  const friendlyName = getFriendlyModelName(backendModel);
  const session = await client.createSession(
    promptText.length > 30 ? promptText.slice(0, 30) + "..." : promptText,
    process.cwd()
  );
  renderUserMessageCard(promptText, friendlyName);
  renderer.start(friendlyName);
  await new Promise((resolve, reject) => {
    let resolved = false;
    let userMsgId = null;
    let activityTimer = null;
    const reasoningPartIds = /* @__PURE__ */ new Set();
    const textPartIds = /* @__PURE__ */ new Set();
    const resetTimeout = () => {
      if (activityTimer) clearTimeout(activityTimer);
      activityTimer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          renderer.finish(options.agent === "plan" ? "Plan" : "Build");
          unsubscribe();
          console.log(chalk3.yellow(`
\u26A0\uFE0F Execution timed out after 3 minutes of inactivity.`));
          resolve();
        }
      }, 18e4);
      activityTimer.unref();
    };
    resetTimeout();
    const unsubscribe = client.subscribeEvents(async (event) => {
      if (event.type && typeof event.type === "string" && event.type.startsWith("permission.")) {
        const reqId = event.properties?.requestID || event.properties?.id;
        if (reqId) client.replyPermission(reqId, "always");
      }
      const sessId = event.properties?.sessionID;
      if (sessId && sessId !== session.id) return;
      if (event.type === "message.updated") {
        if (event.properties?.info?.role === "user") {
          userMsgId = event.properties.info.id;
        }
      }
      if (event.type === "message.part.updated") {
        const part = event.properties?.part;
        if (!part) return;
        if (userMsgId && part.messageID === userMsgId) return;
        resetTimeout();
        if (part.type === "reasoning") {
          reasoningPartIds.add(part.id);
          if (typeof part.text === "string") {
            renderer.handleReasoning(part.text);
          }
        } else if (part.type === "text") {
          textPartIds.add(part.id);
          if (typeof part.text === "string") {
            renderer.handleText(part.text, part.id);
          }
        } else if (part.type === "tool") {
          const toolName = part.tool || "tool";
          const inputObj = part.state?.input || {};
          const detail = inputObj.filePath || inputObj.command || inputObj.pattern || inputObj.query || inputObj.url || inputObj.name || part.state?.title || part.call?.command || part.call?.path || "";
          const status = part.state?.status || part.status || "";
          renderer.handleTool(toolName, detail, part.id, status);
        }
      }
      if (event.type === "message.part.delta") {
        const partId = event.properties?.partID || event.properties?.partId || event.properties?.id || "default";
        if (reasoningPartIds.has(partId)) return;
        const delta = event.properties?.delta;
        const field = event.properties?.field;
        if (field === "text" && typeof delta === "string") {
          resetTimeout();
          renderer.handleDelta(delta, partId);
        }
      }
      if (event.type === "session.idle" || event.type === "session.status" && event.properties?.status?.type === "idle") {
        if (!resolved) {
          resolved = true;
          if (activityTimer) clearTimeout(activityTimer);
          renderer.finish(options.agent === "plan" ? "Plan" : "Build");
          unsubscribe();
          resolve();
        }
      }
      if (event.type === "session.error") {
        if (!resolved) {
          resolved = true;
          if (activityTimer) clearTimeout(activityTimer);
          renderer.finish(options.agent === "plan" ? "Plan" : "Build");
          unsubscribe();
          const errDetail = event.properties?.error || "Model execution error";
          console.error(chalk3.red(`
Error: ${errDetail}`));
          resolve();
        }
      }
    }, (err) => {
      if (!resolved) {
        resolved = true;
        if (activityTimer) clearTimeout(activityTimer);
        unsubscribe();
        reject(err);
      }
    }, session.directory);
    client.promptSession(session.id, promptText, {
      model: backendModel,
      agent: options.agent || "build",
      directory: session.directory
    }).catch((err) => {
      if (!resolved) {
        resolved = true;
        if (activityTimer) clearTimeout(activityTimer);
        unsubscribe();
        reject(err);
      }
    });
  });
}

export {
  ensureServer,
  OceanClient,
  OCEAN_BLUE,
  getLayoutDimensions,
  getBigLogo,
  renderTopBar,
  renderUserMessageCard,
  StreamRenderer,
  SUPPORTED_BYOK_PROVIDERS,
  validateProviderKey,
  getStoredCredentials,
  saveProviderKey,
  removeProviderKey,
  getAvailableOceanModels,
  getFriendlyModelName,
  getBackendModelId,
  runCommand
};
