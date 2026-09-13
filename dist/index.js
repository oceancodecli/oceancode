#!/usr/bin/env node

// src/index.ts
import { Command } from "commander";

// src/commands/interactive.ts
import readline from "readline";
import chalk4 from "chalk";

// src/server/manager.ts
import { spawn, spawnSync } from "child_process";
import path from "path";
import os from "os";
import fs from "fs";
import { fileURLToPath } from "url";
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
6. READABLE, STRUCTURED & ENGAGING RESPONSES (NO WALLS OF TEXT, NO TABLES):
   - NEVER output dense, unbroken walls of text or rambling paragraphs.
   - NEVER USE TABLES: Do not output markdown tables under any circumstances. Tables look un-neat and broken in the terminal. Always format structured data with clean, aligned bullet lists instead.
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
     \u2022 Present project tech stack in a clean, compact bullet list (never a table).
     \u2022 Finish with a friendly, direct prompt asking what the user wants to tackle.`;
function getEffectiveSystemPrompt(cwd = process.cwd()) {
  const agentsPath = path.join(cwd, "AGENTS.md");
  let promptText = "";
  if (fs.existsSync(agentsPath)) {
    try {
      promptText = fs.readFileSync(agentsPath, "utf-8").trim();
    } catch {
    }
  }
  if (!promptText) {
    promptText = AGENT_SYSTEM_PROMPT;
  }
  const formattingRules = `

# Critical Output Formatting Guidelines:
- NEVER USE TABLES: Do not output markdown tables under any circumstances. Tables look un-neat and broken in the terminal. Always format structured data with clean bullet lists instead.
- Bold formatting: Bold important keywords with **text** so they are rendered bold in the terminal.
- Provide clear, thorough, and complete explanations and working code without artificial line limits. Do not give overly brief or truncated one-word answers.
- Avoid unnecessary fluff or preambles, but answer questions completely and helpfully.`;
  if (!promptText.includes("NEVER USE TABLES")) {
    promptText += formattingRules;
  }
  return promptText;
}
var OCEAN_CUSTOM_MODELS = {
  "Qwen3.6-35B-A3B": {
    name: "Qwen 3.6 (35B)",
    tool_call: true,
    limit: { context: 131072, output: 8192 }
  },
  "step-3.7-flash": {
    name: "Step 3.7 Flash",
    tool_call: true,
    limit: { context: 131072, output: 8192 }
  },
  "deepseek-v4-flash-vision-exp": {
    name: "DeepSeek V4 Flash Vision",
    tool_call: true,
    limit: { context: 131072, output: 8192 }
  },
  "DeepSeek-V4-Flash": {
    name: "DeepSeek V4 Flash",
    tool_call: true,
    limit: { context: 131072, output: 8192 }
  },
  "step-router-v1": {
    name: "Step Router V1",
    tool_call: true,
    limit: { context: 131072, output: 8192 }
  },
  "spark-x2.5": {
    name: "Spark X2.5",
    tool_call: true,
    limit: { context: 131072, output: 8192 }
  },
  "Qwen3.8-Flash-Next": {
    name: "Qwen 3.8 Flash Next",
    tool_call: true,
    limit: { context: 131072, output: 8192 }
  },
  "glm-5.3-flash": {
    name: "GLM 5.3 Flash",
    tool_call: true,
    limit: { context: 131072, output: 8192 }
  }
};
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
  const effectivePrompt = getEffectiveSystemPrompt();
  const oceanApiKey = process.env.OCEAN_API_KEY || "sk-eO7z73CJ1SnBRPfDE0gTRCi2UzLqTqPdgG8WK5XOzfkHsGGf";
  const oceanBaseUrl = process.env.OCEAN_BASE_URL || "https://api.hcnsec.cn/v1";
  const oceanProvider = {
    name: "Ocean",
    npm: "@ai-sdk/openai-compatible",
    api: "openai",
    options: {
      baseURL: oceanBaseUrl,
      apiKey: oceanApiKey
    },
    models: OCEAN_CUSTOM_MODELS
  };
  const merged = {
    $schema: "https://opencode.ai/config.json",
    ...existing,
    disabled_providers: ["opencode"],
    model: "ocean/Qwen3.6-35B-A3B",
    provider: {
      ...existing.provider || {},
      ocean: oceanProvider
    },
    permission: {
      ...permissions,
      ...existing.permission || {}
    },
    agent: {
      ...existing.agent || {},
      build: {
        ...existing.agent?.build || {},
        prompt: effectivePrompt,
        permission: permissions
      },
      plan: {
        ...existing.agent?.plan || {},
        prompt: effectivePrompt,
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
        disabled_providers: ["opencode"],
        model: "ocean/Qwen3.6-35B-A3B",
        provider: {
          ...projExisting.provider || {},
          ocean: oceanProvider
        },
        agent: {
          ...projExisting.agent || {},
          build: {
            ...projExisting.agent?.build || {},
            prompt: effectivePrompt,
            permission: permissions
          },
          plan: {
            ...projExisting.agent?.plan || {},
            prompt: effectivePrompt,
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
function findOpencodeBinary() {
  const isWin = process.platform === "win32";
  const exeName = isWin ? "opencode.exe" : "opencode";
  try {
    let currentDir = "";
    if (typeof import.meta.dirname === "string") {
      currentDir = import.meta.dirname;
    } else if (import.meta.url) {
      currentDir = path.dirname(fileURLToPath(import.meta.url));
    }
    if (currentDir) {
      const pkgRoot = path.basename(currentDir) === "dist" ? path.resolve(currentDir, "..") : currentDir;
      const pkgExe = path.join(pkgRoot, "node_modules", "opencode-ai", "bin", exeName);
      if (fs.existsSync(pkgExe)) return pkgExe;
      const hoistedExe = path.resolve(pkgRoot, "..", "opencode-ai", "bin", exeName);
      if (fs.existsSync(hoistedExe)) return hoistedExe;
    }
  } catch {
  }
  if (isWin && process.env.APPDATA) {
    const globalCandidates = [
      path.join(process.env.APPDATA, "npm", "node_modules", "oceancode", "node_modules", "opencode-ai", "bin", "opencode.exe"),
      path.join(process.env.APPDATA, "npm", "node_modules", "opencode-ai", "bin", "opencode.exe")
    ];
    for (const cand of globalCandidates) {
      if (fs.existsSync(cand)) return cand;
    }
  }
  const cwdExe = path.join(process.cwd(), "node_modules", "opencode-ai", "bin", exeName);
  if (fs.existsSync(cwdExe)) return cwdExe;
  try {
    const lookupCmd = isWin ? "where.exe" : "which";
    const res = spawnSync(lookupCmd, [exeName], { encoding: "utf-8", shell: false });
    if (res.status === 0 && res.stdout) {
      const paths = res.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      for (const p of paths) {
        if (p.toLowerCase().endsWith(exeName.toLowerCase()) && fs.existsSync(p)) {
          return p;
        }
      }
    }
  } catch {
  }
  return "";
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
  const serverLogPath = path.join(oceanStateDir, "server.log");
  const logFd = fs.openSync(serverLogPath, "a");
  const localBin = path.join(process.cwd(), "node_modules", ".bin");
  const pkgBin = path.join(path.dirname(path.dirname(import.meta.dirname || "")), "node_modules", ".bin");
  const pathSeparator = process.platform === "win32" ? ";" : ":";
  const updatedPath = [localBin, pkgBin, process.env.PATH || ""].filter(Boolean).join(pathSeparator);
  const env = {
    ...process.env,
    PATH: updatedPath,
    XDG_DATA_HOME: oceanDataDir,
    XDG_CONFIG_HOME: oceanConfigDir,
    XDG_STATE_HOME: oceanStateDir
  };
  const binary = findOpencodeBinary();
  if (!binary || !fs.existsSync(binary)) {
    throw new Error(
      "Could not locate the opencode backend binary (opencode.exe). Please ensure opencode-ai is installed in Oceancode."
    );
  }
  const args = ["serve", "--port", String(port), "--hostname", host];
  try {
    const child = spawn(binary, args, {
      windowsHide: true,
      shell: false,
      stdio: ["ignore", logFd, logFd],
      cwd: process.cwd(),
      env,
      detached: false
    });
    child.unref();
    managedProcess = child;
    const startTime = Date.now();
    const MAX_WAIT_MS = 15e3;
    while (Date.now() - startTime < MAX_WAIT_MS) {
      await new Promise((r) => setTimeout(r, 200));
      if (await isServerHealthy(baseUrl)) {
        return baseUrl;
      }
    }
    let logSnippet = "";
    try {
      if (fs.existsSync(serverLogPath)) {
        const fullLog = fs.readFileSync(serverLogPath, "utf-8");
        logSnippet = "\n" + fullLog.slice(-500);
      }
    } catch {
    }
    throw new Error(`Ocean backend failed to respond on ${baseUrl}.${logSnippet ? ` Backend log:${logSnippet}` : ""}`);
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
    let providerID = "ocean";
    let modelID = "Qwen3.6-35B-A3B";
    if (options?.model) {
      if (options.model.includes("/")) {
        const parts = options.model.split("/");
        providerID = parts[0];
        modelID = parts.slice(1).join("/");
      } else {
        modelID = options.model;
      }
    }
    if (providerID === "opencode") {
      providerID = "ocean";
      modelID = "Qwen3.6-35B-A3B";
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

// src/ui/layout.ts
import chalk from "chalk";
var INDENT = "  ";
var OCEAN_BLUE = "#0088ff";
var OCEAN_CYAN = "#38bdf8";
function getLayoutDimensions() {
  const terminalWidth = process.stdout.columns || 80;
  return { terminalWidth, contentWidth: 80, leftMargin: 2 };
}
var BIG_HEADING_LINES = [
  " \u2588\u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2557   \u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557",
  "\u2588\u2588\u2554\u2550\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D\u2588\u2588\u2554\u2550\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D",
  "\u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2551     \u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2554\u2588\u2588\u2557 \u2588\u2588\u2551\u2588\u2588\u2551     \u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2557  ",
  "\u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2551     \u2588\u2588\u2554\u2550\u2550\u255D  \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2551\u2588\u2588\u2551\u255A\u2588\u2588\u2557\u2588\u2588\u2551\u2588\u2588\u2551     \u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u255D  ",
  "\u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2551 \u255A\u2588\u2588\u2588\u2588\u2551\u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557",
  " \u255A\u2550\u2550\u2550\u2550\u2550\u255D  \u255A\u2550\u2550\u2550\u2550\u2550\u255D\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u255D\u255A\u2550\u255D  \u255A\u2550\u255D\u255A\u2550\u255D  \u255A\u2550\u2550\u2550\u255D \u255A\u2550\u2550\u2550\u2550\u2550\u255D \u255A\u2550\u2550\u2550\u2550\u2550\u255D \u255A\u2550\u2550\u2550\u2550\u2550\u255D \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u255D"
];
var COMPACT_HEADING_LINES = [
  " \u2588\u2580\u2588 \u2588\u2580\u2580 \u2588\u2580\u2580 \u2584\u2580\u2588 \u2588\u2584 \u2588 \u2588\u2580\u2580 \u2588\u2580\u2588 \u2588\u2580\u2584 \u2588\u2580\u2580",
  " \u2588\u2584\u2588 \u2588\u2584\u2584 \u2588\u2588\u2584 \u2588\u2580\u2588 \u2588 \u2580\u2588 \u2588\u2584\u2584 \u2588\u2584\u2588 \u2588\u2584\u2580 \u2588\u2588\u2584"
];
var ZINC_GRAYS = ["#f4f4f5", "#d4d4d8", "#a1a1aa", "#71717a", "#52525b", "#3f3f46"];
function getBigLogo() {
  return BIG_HEADING_LINES.map((l, i) => chalk.hex(ZINC_GRAYS[i]).bold(l)).join("\n");
}
function renderBigLogo(indent = INDENT) {
  const cols = process.stdout.columns || 80;
  console.log("");
  if (cols < 80) {
    COMPACT_HEADING_LINES.forEach(
      (l, i) => console.log(indent + chalk.hex(i === 0 ? "#e4e4e7" : "#71717a").bold(l))
    );
  } else {
    BIG_HEADING_LINES.forEach(
      (l, i) => console.log(indent + chalk.hex(ZINC_GRAYS[i]).bold(l))
    );
  }
}
function renderTopBar(modelName, cwd = process.cwd()) {
  if (process.stdout.isTTY) {
    process.stdout.write("\x1B]0;oceancode\x07");
    process.stdout.write("\x1B]2;oceancode\x07");
  }
  const normCwd = cwd.replace(/\\/g, "/");
  const cols = process.stdout.columns || 80;
  renderBigLogo(INDENT);
  console.log("");
  console.log(
    `${INDENT}${chalk.bold.white("OceanCode CLI 0.1.2")}${chalk.dim(" \xB7 ")}${chalk.hex("#94a3b8")(modelName)}${chalk.dim(" \xB7 ")}${chalk.dim(normCwd)}`
  );
  console.log(`${INDENT}${chalk.dim("\u2500".repeat(Math.max(40, cols - 4)))}`);
}
function renderUserMessageCard(text, _modelName) {
  const bar = chalk.hex(OCEAN_BLUE)("\u2502");
  process.stdout.write(`
${bar}
${bar} ${chalk.bold.white(text)}
${bar}

`);
}
function renderFooter(modelName, durationSec, agent = "Build") {
  const icon = chalk.hex(OCEAN_CYAN)("\u25A3");
  const agentStr = chalk.bold.white(agent);
  const modelStr = chalk.dim(modelName);
  const timeStr = chalk.dim(`${durationSec.toFixed(1)}s`);
  console.log(`
${icon} ${agentStr} \xB7 ${modelStr} \xB7 ${timeStr}
`);
}

// src/ui/renderer.ts
import chalk2 from "chalk";
var TerminalMarkdownFormatter = class {
  isBold = false;
  isCode = false;
  isItalic = false;
  pendingStars = "";
  lineBuffer = "";
  format(chunk) {
    this.lineBuffer += chunk;
    let output = "";
    if (this.lineBuffer.includes("\n")) {
      const lines = this.lineBuffer.split("\n");
      this.lineBuffer = lines.pop() || "";
      for (const line of lines) {
        const processed = this.processLine(line);
        if (processed !== null) {
          output += processed + "\n";
        }
      }
    }
    if (this.lineBuffer.startsWith("|")) {
      return output;
    }
    if (this.lineBuffer) {
      const flushed = this.processInline(this.lineBuffer);
      this.lineBuffer = "";
      output += flushed;
    }
    return output;
  }
  processLine(line) {
    const trimmed = line.trim();
    if (/^\|?(\s*:?-+:?\s*\|?)+$/.test(trimmed) && trimmed.includes("-")) {
      return null;
    }
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const cells = trimmed.slice(1, -1).split("|").map((c) => c.trim()).filter(Boolean);
      if (cells.length === 0) return null;
      const lower0 = cells[0].toLowerCase().replace(/[*_`]/g, "");
      const lower1 = (cells[1] || "").toLowerCase().replace(/[*_`]/g, "");
      if (lower0 === "field" && lower1 === "value" || lower0 === "key" && lower1 === "value" || lower0 === "property" && lower1 === "value" || lower0 === "option" && lower1 === "description" || lower0 === "name" && lower1 === "description" || lower0 === "parameter" && lower1 === "description") {
        return null;
      }
      if (cells.length === 1) {
        return `  \u2022 ${this.processInline(cells[0])}`;
      } else {
        const rawTitle = cells[0].replace(/^[*_]+|[*_]+$/g, "");
        const title = this.processInline(rawTitle);
        const desc = cells.slice(1).map((c) => this.processInline(c)).join(" \u2014 ");
        return `  \u2022 \x1B[1m${title}\x1B[22m: ${desc}`;
      }
    }
    return this.processInline(line);
  }
  processInline(text) {
    let result = "";
    const combined = this.pendingStars + text;
    this.pendingStars = "";
    let i = 0;
    while (i < combined.length) {
      const ch = combined[i];
      if (ch === "*" || ch === "_") {
        if (i + 1 < combined.length && combined[i + 1] === ch) {
          this.isBold = !this.isBold;
          result += this.isBold ? "\x1B[1m" : "\x1B[22m";
          i += 2;
          continue;
        } else if (i + 1 === combined.length) {
          this.pendingStars = ch;
          break;
        } else {
          this.isItalic = !this.isItalic;
          result += this.isItalic ? "\x1B[3m" : "\x1B[23m";
          i++;
          continue;
        }
      }
      if (ch === "`") {
        if (combined.slice(i, i + 3) === "```") {
          result += "```";
          i += 3;
          continue;
        }
        this.isCode = !this.isCode;
        result += this.isCode ? "\x1B[36m" : "\x1B[39m";
        i++;
        continue;
      }
      result += ch;
      i++;
    }
    return result;
  }
  finish() {
    let output = "";
    if (this.lineBuffer) {
      const processed = this.processLine(this.lineBuffer);
      if (processed !== null) {
        output += processed;
      }
      this.lineBuffer = "";
    }
    if (this.pendingStars) {
      output += this.pendingStars;
      this.pendingStars = "";
    }
    if (this.isBold) {
      output += "\x1B[22m";
      this.isBold = false;
    }
    if (this.isCode) {
      output += "\x1B[39m";
      this.isCode = false;
    }
    if (this.isItalic) {
      output += "\x1B[23m";
      this.isItalic = false;
    }
    return output;
  }
  reset() {
    this.isBold = false;
    this.isCode = false;
    this.isItalic = false;
    this.pendingStars = "";
    this.lineBuffer = "";
  }
};
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
  /** Track parts streamed via deltas so handleText doesn't duplicate them */
  deltaParts = /* @__PURE__ */ new Set();
  formatter = new TerminalMarkdownFormatter();
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
  lastOutputWasTool = false;
  shortenPath(text) {
    const cwd = process.cwd().replace(/\\/g, "/");
    const cwdLower = cwd.toLowerCase();
    let res = text.replace(/\\/g, "/");
    let idx = res.toLowerCase().indexOf(cwdLower + "/");
    while (idx !== -1) {
      res = res.slice(0, idx) + res.slice(idx + cwd.length + 1);
      idx = res.toLowerCase().indexOf(cwdLower + "/");
    }
    if (res.toLowerCase() === cwdLower) {
      res = ".";
    }
    return res;
  }
  /** Collapse a tool detail to a single short line so long commands don't scroll */
  formatDetail(detail) {
    if (detail === void 0 || detail === null) return "";
    const raw = Array.isArray(detail) ? detail.join(" ") : String(detail);
    const shortened = this.shortenPath(raw);
    const oneLine = shortened.replace(/[\r\n]+/g, " ").replace(/\s{2,}/g, " ").trim();
    const MAX = 60;
    return oneLine.length > MAX ? oneLine.slice(0, 25) + "\u2026" + oneLine.slice(-30) : oneLine;
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
    this.deltaParts.clear();
    this.thinkingFrame = 0;
    this.lastOutputWasTool = false;
    this.formatter.reset();
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
  toPascalCaseTool(name) {
    const map = {
      list: "ListDir",
      list_dir: "ListDir",
      listdir: "ListDir",
      read: "Read",
      read_file: "Read",
      readfile: "Read",
      write: "Write",
      write_to_file: "Write",
      writefile: "Write",
      edit: "Edit",
      replace_file_content: "Edit",
      replace: "Edit",
      multi_replace_file_content: "Edit",
      bash: "Bash",
      run_command: "Bash",
      grep: "Grep",
      grep_search: "Grep",
      glob: "Glob",
      task: "Task",
      webfetch: "WebFetch",
      websearch: "WebSearch",
      filesystemdirectorytree: "DirectoryTree",
      filesystem_directory_tree: "DirectoryTree",
      filesystem_read_file: "Read",
      filesystemreadfile: "Read",
      filesystem_write_file: "Write",
      filesystemwritefile: "Write"
    };
    const lower = name.toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (map[lower]) return map[lower];
    return name.split(/[_-]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
  }
  handleTool(toolName, detail, partId, status) {
    const key = partId ?? toolName;
    const prev = this.seenTools.get(key);
    if (prev && prev !== "pending_empty") {
      return;
    }
    const clean = this.formatDetail(detail).replace(/\(ctrl\+o\s+to\s+expand\)/gi, "").replace(/\\/g, "/").trim();
    if (!clean && status === "pending") {
      this.seenTools.set(key, "pending_empty");
      return;
    }
    this.seenTools.set(key, status ?? "running");
    this.stopThinkingAnimation();
    if (!this.toolsUsed.includes(toolName)) this.toolsUsed.push(toolName);
    this.eraseBar();
    const arrow = chalk2.hex(OCEAN_CYAN)("\u2192");
    const nameStr = chalk2.white(this.toPascalCaseTool(toolName));
    const argsStr = clean ? ` ${chalk2.dim(clean)}` : "";
    const prefix = this.lastOutputWasTool ? "" : "\n";
    process.stdout.write(`${prefix}  ${arrow} ${nameStr}${argsStr}
`);
    process.stdout.write("\x1B7");
    this.lastOutputWasTool = true;
    this.repinBar();
    this.startThinkingAnimation();
  }
  handleDelta(delta, partId = "default") {
    if (!delta) return;
    this.deltaParts.add(partId);
    this.stopThinkingAnimation();
    if (!this.textStarted) {
      this.textStarted = true;
      this.eraseBar();
      if (this.lastOutputWasTool) {
        process.stdout.write("\n");
      }
    }
    this.lastOutputWasTool = false;
    this.currentTextLength += delta.length;
    this.textLens.set(partId, (this.textLens.get(partId) ?? 0) + delta.length);
    const formatted = this.formatter.format(delta);
    if (formatted) {
      process.stdout.write(formatted);
      process.stdout.write("\x1B7");
    }
  }
  handleText(fullText, partId = "default") {
    if (!fullText) return;
    if (this.deltaParts.has(partId)) return;
    this.stopThinkingAnimation();
    if (!this.textStarted) {
      this.textStarted = true;
      this.eraseBar();
      if (this.lastOutputWasTool) {
        process.stdout.write("\n");
      }
    }
    this.lastOutputWasTool = false;
    const written = this.textLens.get(partId) ?? 0;
    if (fullText.length <= written) return;
    const slice = fullText.slice(written);
    this.textLens.set(partId, fullText.length);
    this.currentTextLength += slice.length;
    const formatted = this.formatter.format(slice);
    if (formatted) {
      process.stdout.write(formatted);
      process.stdout.write("\x1B7");
    }
  }
  finish(agent = "Build") {
    this.stopThinkingAnimation();
    const flushed = this.formatter.finish();
    if (flushed) {
      process.stdout.write(flushed);
    }
    const totalSec = Math.max(0.1, (Date.now() - this.startTime) / 1e3);
    process.stdout.write("\n");
    renderFooter(this.modelName, totalSec, agent);
    process.stdout.write("\x1B7");
    this.reasoningStarted = false;
    this.textStarted = false;
    this.currentReasoningLength = 0;
    this.currentTextLength = 0;
    this.toolsUsed = [];
    this.seenTools.clear();
    this.textLens.clear();
    this.deltaParts.clear();
    this.repinBar();
  }
};

// src/commands/run.ts
import chalk3 from "chalk";

// src/models/registry.ts
var DEFAULT_MODEL_ID = "ocean/Qwen3.6-35B-A3B";
var OCEAN_MODELS = [
  {
    id: "ocean/Qwen3.6-35B-A3B",
    name: "Qwen 3.6 (35B)",
    isFree: true,
    provider: "ocean"
  },
  {
    id: "ocean/step-3.7-flash",
    name: "Step 3.7 Flash",
    isFree: true,
    provider: "ocean"
  },
  {
    id: "ocean/deepseek-v4-flash-vision-exp",
    name: "DeepSeek V4 Flash Vision",
    isFree: true,
    provider: "ocean"
  },
  {
    id: "ocean/DeepSeek-V4-Flash",
    name: "DeepSeek V4 Flash",
    isFree: true,
    provider: "ocean"
  },
  {
    id: "ocean/step-router-v1",
    name: "Step Router V1",
    isFree: true,
    provider: "ocean"
  },
  {
    id: "ocean/spark-x2.5",
    name: "Spark X2.5",
    isFree: true,
    provider: "ocean"
  },
  {
    id: "ocean/Qwen3.8-Flash-Next",
    name: "Qwen 3.8 Flash Next",
    isFree: true,
    provider: "ocean"
  },
  {
    id: "ocean/glm-5.3-flash",
    name: "GLM 5.3 Flash",
    isFree: true,
    provider: "ocean"
  }
];
function getAvailableOceanModels() {
  return OCEAN_MODELS;
}
function getFriendlyModelName(backendId) {
  const match = OCEAN_MODELS.find((m) => m.id === backendId);
  if (match) return match.name;
  return backendId.replace(/^ocean\//, "").replace(/^opencode\//, "").replace(/-free$/, "");
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
  if (lower.includes("qwen3.6") || lower.includes("35b") || lower.includes("qwen")) return "ocean/Qwen3.6-35B-A3B";
  if (lower.includes("step-3.7") || lower.includes("3.7") || lower.includes("step")) return "ocean/step-3.7-flash";
  if (lower.includes("vision") || lower.includes("flash-vision")) return "ocean/deepseek-v4-flash-vision-exp";
  if (lower.includes("deepseek-v4") || lower.includes("v4-flash") || lower.includes("deepseek")) return "ocean/DeepSeek-V4-Flash";
  if (lower.includes("router")) return "ocean/step-router-v1";
  if (lower.includes("spark")) return "ocean/spark-x2.5";
  if (lower.includes("3.8") || lower.includes("next")) return "ocean/Qwen3.8-Flash-Next";
  if (lower.includes("glm")) return "ocean/glm-5.3-flash";
  if (lower.includes("/")) return lower;
  return `ocean/${lower}`;
}

// src/ui/toolLabels.ts
function extractToolDetail(part) {
  let input = part?.state?.input ?? part?.input ?? part?.args ?? part?.call?.input ?? part?.call?.args;
  if (typeof input === "string" && input.trim().startsWith("{")) {
    try {
      input = JSON.parse(input);
    } catch {
    }
  }
  if (typeof input === "string" && input.trim()) {
    return input.trim();
  }
  if (input && typeof input === "object") {
    const candidate = input.filePath || input.path || input.file || input.command || input.pattern || input.query || input.url || input.name || input.directory || input.dir || input.description || (Object.values(input)[0] !== void 0 ? String(Object.values(input)[0]) : "");
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  if (typeof part?.state?.title === "string" && part.state.title.trim()) return part.state.title.trim();
  if (typeof part?.call?.path === "string" && part.call.path.trim()) return part.call.path.trim();
  if (typeof part?.call?.command === "string" && part.call.command.trim()) return part.call.command.trim();
  return "";
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
  const backendModel = options.model ? getBackendModelId(options.model) : DEFAULT_MODEL_ID;
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
          const detail = extractToolDetail(part);
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

// src/utils/init.ts
import fs2 from "fs";
import path2 from "path";
function initializeAgentsDoc(workspaceDir = process.cwd()) {
  const agentsPath = path2.join(workspaceDir, "AGENTS.md");
  const alreadyExists = fs2.existsSync(agentsPath);
  let projectType = "General Codebase";
  let techDetails = [];
  let buildCommands = [];
  let testCommands = [];
  let conventions = [];
  const pkgJsonPath = path2.join(workspaceDir, "package.json");
  const tsConfigPath = path2.join(workspaceDir, "tsconfig.json");
  const pyProjectPath = path2.join(workspaceDir, "pyproject.toml");
  const reqTxtPath = path2.join(workspaceDir, "requirements.txt");
  const cargoPath = path2.join(workspaceDir, "Cargo.toml");
  const goModPath = path2.join(workspaceDir, "go.mod");
  if (fs2.existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(fs2.readFileSync(pkgJsonPath, "utf-8"));
      projectType = `Node.js / JavaScript${fs2.existsSync(tsConfigPath) ? " / TypeScript" : ""}`;
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
  } else if (fs2.existsSync(pyProjectPath) || fs2.existsSync(reqTxtPath)) {
    projectType = "Python Project";
    testCommands.push("- Test: `pytest`");
    buildCommands.push("- Run: `python main.py`");
  } else if (fs2.existsSync(cargoPath)) {
    projectType = "Rust Project";
    buildCommands.push("- Build: `cargo build`");
    testCommands.push("- Test: `cargo test`");
  } else if (fs2.existsSync(goModPath)) {
    projectType = "Go Project";
    buildCommands.push("- Build: `go build ./...`");
    testCommands.push("- Test: `go test ./...`");
  }
  const dirs = [];
  try {
    const entries = fs2.readdirSync(workspaceDir, { withFileTypes: true });
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
5. **Readable, Structured Formatting (No Walls of Text, No Tables)**:
   - Never output dense, unbroken walls of text.
   - Never output markdown tables. Always format explanations with clean, readable bullet points with contextual emojis (\u{1F4C1}, \u{1F527}, \u{1F4A1}, \u26A1, \u{1F680}, \u26A0\uFE0F, \u2705, \u{1F4CC}, \u{1F3AF}), numbered steps, bold keywords, and fenced code blocks.
`;
  fs2.writeFileSync(agentsPath, agentsContent, "utf-8");
  return {
    filePath: agentsPath,
    created: !alreadyExists,
    projectType,
    summary: `Configured context for ${projectType}. Generated repository guidelines in AGENTS.md.`
  };
}

// src/server/auth.ts
import path3 from "path";
import os2 from "os";
import fs3 from "fs";
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
  const oceanAuth = path3.join(os2.homedir(), ".local", "share", "oceancode", "auth.json");
  const opencodeAuth = path3.join(os2.homedir(), ".local", "share", "opencode", "auth.json");
  return [oceanAuth, opencodeAuth];
}
function getStoredCredentials() {
  const paths = getAuthPaths();
  const merged = {};
  for (const p of paths) {
    if (fs3.existsSync(p)) {
      try {
        const raw = fs3.readFileSync(p, "utf-8");
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
      const dir = path3.dirname(p);
      fs3.mkdirSync(dir, { recursive: true });
      let current = {};
      if (fs3.existsSync(p)) {
        try {
          current = JSON.parse(fs3.readFileSync(p, "utf-8"));
        } catch {
        }
      }
      current[normalizedId] = { type: "api", key: key.trim() };
      fs3.writeFileSync(p, JSON.stringify(current, null, 2), "utf-8");
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
      if (fs3.existsSync(p)) {
        const current = JSON.parse(fs3.readFileSync(p, "utf-8"));
        if (current[normalizedId]) {
          delete current[normalizedId];
          fs3.writeFileSync(p, JSON.stringify(current, null, 2), "utf-8");
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

// src/server/mcp.ts
import path4 from "path";
import os3 from "os";
import fs4 from "fs";
function getOpencodeConfigPath() {
  return path4.join(os3.homedir(), ".config", "oceancode", "opencode", "opencode.json");
}
function getConfiguredMcpServers() {
  const configPath = getOpencodeConfigPath();
  if (!fs4.existsSync(configPath)) return {};
  try {
    const raw = fs4.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed.mcp || {};
  } catch {
    return {};
  }
}
function saveMcpServer(name, config) {
  const configPath = getOpencodeConfigPath();
  const dir = path4.dirname(configPath);
  fs4.mkdirSync(dir, { recursive: true });
  let fullConfig = {};
  if (fs4.existsSync(configPath)) {
    try {
      fullConfig = JSON.parse(fs4.readFileSync(configPath, "utf-8"));
    } catch {
    }
  }
  if (!fullConfig.mcp) fullConfig.mcp = {};
  fullConfig.mcp[name] = config;
  fs4.writeFileSync(configPath, JSON.stringify(fullConfig, null, 2), "utf-8");
  try {
    const projectConfig = path4.join(process.cwd(), "opencode.json");
    let proj = {};
    if (fs4.existsSync(projectConfig)) {
      proj = JSON.parse(fs4.readFileSync(projectConfig, "utf-8"));
    }
    if (!proj.mcp) proj.mcp = {};
    proj.mcp[name] = config;
    fs4.writeFileSync(projectConfig, JSON.stringify(proj, null, 2), "utf-8");
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
import fs5 from "fs";
import path5 from "path";
import { execSync } from "child_process";
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
  { name: "/diff-file", desc: "Inspect git diff for a specific file" },
  { name: "/commit", desc: "Generate conventional commit or commit staged changes" },
  { name: "/review", desc: "Review current git diff or target branch" },
  { name: "/checkpoint", desc: "Snapshot workspace changes to git stash" },
  { name: "/exec", desc: "Execute shell command directly (or use !<cmd>)" },
  { name: "/open", desc: "Open a file in your default code editor" },
  { name: "/add", desc: "Pin file(s) into model context memory" },
  { name: "/context", desc: "Inspect pinned files and loaded memory" },
  { name: "/drop", desc: "Remove pinned file from context (or /drop all)" },
  { name: "/web", desc: "Fetch web page content and inject into context" },
  { name: "/export", desc: "Export conversation transcript to Markdown" },
  { name: "/agent", desc: "Switch mode (build / plan)" },
  { name: "/compact", desc: "Compact & summarize session memory" },
  { name: "/clear", desc: "Clear conversation canvas" },
  { name: "/info", desc: "Session details & status" },
  { name: "/help", desc: "Help & commands" },
  { name: "/exit", desc: "Exit the app" }
];
var THINKING_FRAMES = [
  chalk4.hex("#f59e0b").bold("  \u224B Thinking   "),
  chalk4.hex("#fbbf24").bold("  \u224B Thinking.  "),
  chalk4.hex("#fde68a").bold("  \u224B Thinking.. "),
  chalk4.hex("#fef08a").bold("  \u224B Thinking..."),
  chalk4.hex("#fde68a").bold("  \u224B Thinking.. "),
  chalk4.hex("#fbbf24").bold("  \u224B Thinking.  "),
  chalk4.hex("#f59e0b").bold("  \u224B Thinking   "),
  chalk4.dim("  \u224B Thinking   ")
];
async function interactiveChatCommand(options) {
  let currentBackendModel = options?.model ? getBackendModelId(options.model) : DEFAULT_MODEL_ID;
  if (!process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const lines = [];
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
  const conversationHistory = [];
  let session = await client.createSession("Ocean Session", process.cwd());
  let input = "";
  let cursorIndex = 0;
  const promptHistory = [];
  let historyIndex = -1;
  let tempSavedInput = "";
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
  const pinnedContext = /* @__PURE__ */ new Map();
  const renderer = new StreamRenderer();
  let currentScrollBottom = 0;
  let lastBarStartRow = 0;
  let lastBarLinesCount = 0;
  const printToContent = (text) => {
    if (!process.stdout.isTTY) {
      process.stdout.write(text.endsWith("\n") ? text : text + "\n");
      return;
    }
    process.stdout.write("\x1B8");
    const formatted = text.endsWith("\n") ? text : text + "\n";
    process.stdout.write(formatted);
    process.stdout.write("\x1B7");
    paintBar();
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
      process.stdout.write("\x1B[?1000l\x1B[?1002l\x1B[?1006l");
      process.stdout.off("resize", onResize);
      resetScrollRegion();
      const rows = process.stdout.rows || 24;
      if (lastBarStartRow > 0) {
        for (let r = lastBarStartRow; r < lastBarStartRow + lastBarLinesCount; r++) {
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
          chalk4.yellow(
            `\u26A0\uFE0F Operation timed out waiting for ${friendlyName}. You can retry or switch models with /models.`
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
    const bar = chalk4.hex(OCEAN_BLUE)("\u2502");
    const width = Math.min(cols - 4, 80);
    const peachBg = chalk4.bgHex("#fba978").black;
    const lines = [];
    if (mode === "model_selector") {
      const header = "Select Model (\u2191/\u2193 to navigate, Enter to select, Esc to close)" + " ".repeat(Math.max(2, width - 60)) + chalk4.dim("esc");
      lines.push(chalk4.bold.white(header));
      lines.push(
        modelSearch ? `Search: ${modelSearch}` : chalk4.dim("Search models (e.g. qwen, step, flash)")
      );
      lines.push("");
      const availableModels = getAvailableOceanModels();
      const searchLower = modelSearch.toLowerCase();
      const filtered = availableModels.filter(
        (m) => m.name.toLowerCase().includes(searchLower) || m.id.toLowerCase().includes(searchLower)
      );
      if (modelIndex >= filtered.length) modelIndex = Math.max(0, filtered.length - 1);
      if (filtered.length === 0) {
        lines.push(chalk4.dim("  No matching models found."));
      } else {
        const MAX_MODELS = 8;
        let startIdx = 0;
        if (filtered.length > MAX_MODELS) {
          startIdx = Math.max(0, Math.min(modelIndex - 3, filtered.length - MAX_MODELS));
        }
        const visibleModels = filtered.slice(startIdx, startIdx + MAX_MODELS);
        if (filtered.length > MAX_MODELS) {
          lines.push(chalk4.dim(`  Models (${modelIndex + 1}/${filtered.length}) \xB7 \u2191/\u2193 to navigate`));
        }
        visibleModels.forEach((m, relIdx) => {
          const idx = startIdx + relIdx;
          const isCurrent = m.id === currentBackendModel;
          const prefix = isCurrent ? "\u25CF " : "  ";
          const left = prefix + m.name;
          const spaces = Math.max(0, width - left.length);
          const row = left + " ".repeat(spaces);
          if (idx === modelIndex) {
            lines.push(peachBg(row));
          } else {
            lines.push(chalk4.white(row));
          }
        });
      }
    } else if (mode === "connect_modal") {
      const header = "Connect Provider (BYOK)" + " ".repeat(Math.max(2, width - 24)) + chalk4.dim("esc");
      lines.push(chalk4.bold.white(header));
      if (connectStep === "provider_list") {
        lines.push(chalk4.dim("Select provider with \u2191/\u2193 and press Enter (or 'd' to disconnect):"));
        lines.push("");
        const creds = getStoredCredentials();
        SUPPORTED_BYOK_PROVIDERS.forEach((p, idx) => {
          const isConnected = Boolean(creds[p.id]?.key);
          const prefix = isConnected ? "\u25CF " : "\u25CB ";
          const left = `  ${prefix}${p.name.padEnd(16)} (${p.id})`;
          const tag = isConnected ? chalk4.green("\u2714 Connected") : chalk4.dim("Not linked");
          const spaces = Math.max(2, width - left.length - 12);
          const row = left + " ".repeat(spaces) + tag;
          lines.push(idx === connectProviderIndex ? peachBg(row) : chalk4.white(row));
        });
        lines.push("");
        lines.push(chalk4.dim("Enter: Link API Key  \u2022  d: Disconnect  \u2022  Esc: Close"));
      } else if (connectStep === "enter_key") {
        const prov = SUPPORTED_BYOK_PROVIDERS[connectProviderIndex];
        lines.push(chalk4.bold.hex("#38bdf8")(`Provider: ${prov.name}`));
        lines.push(chalk4.dim(`Placeholder format: ${prov.placeholder}`));
        lines.push("");
        const masked = connectKeyInput.length > 8 ? connectKeyInput.slice(0, 4) + "\u2022".repeat(connectKeyInput.length - 8) + connectKeyInput.slice(-4) : "\u2022".repeat(connectKeyInput.length);
        const displayKey = connectKeyInput ? masked : chalk4.dim("Paste or type API key here");
        lines.push(`${bar} Key: ${displayKey}\u2588`);
        if (connectErrorMsg) {
          lines.push("");
          lines.push(chalk4.hex("#ef4444").bold(`  \u26A0\uFE0F  ${connectErrorMsg}`));
        }
        lines.push("");
        lines.push(chalk4.dim("Enter: Validate & Save  \u2022  Esc: Back to providers"));
      } else if (connectStep === "validating") {
        lines.push(chalk4.bold.hex("#f59e0b")(`Verifying ${connectValidatingProv} API Key...`));
        lines.push("");
        lines.push(chalk4.hex("#fbbf24").bold("  \u224B Testing authentication with provider API..."));
        lines.push("");
        lines.push(chalk4.dim("Please wait while we verify your key with the provider."));
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
            chalk4.dim(`  Commands (${menuIndex + 1}/${matching.length}) \xB7 \u2191/\u2193 navigate \xB7 Tab/Enter select \xB7 Esc cancel`)
          );
          visible.forEach((c, relIdx) => {
            const absIdx = startIdx + relIdx;
            const isSelected = absIdx === menuIndex;
            const row = "  " + c.name.padEnd(15) + c.desc;
            const padded = row + " ".repeat(Math.max(2, width - row.length));
            lines.push(isSelected ? peachBg(padded) : chalk4.white(row));
          });
        }
      }
      const friendlyAgent = currentAgent === "build" ? "Build" : "Plan";
      const bar2 = chalk4.hex(OCEAN_BLUE)("\u2502");
      lines.push(bar2);
      if (isProcessing) {
        const frameIdx = renderer.getThinkingFrame() % THINKING_FRAMES.length;
        const thinkingText = THINKING_FRAMES[frameIdx].trim();
        lines.push(`${bar2} ${chalk4.dim(thinkingText)}`);
      } else {
        lines.push(`${bar2} ${input}`);
      }
      lines.push(bar2);
      lines.push(
        `${bar2} ${chalk4.hex(OCEAN_BLUE).bold(friendlyAgent)} ${chalk4.dim("\xB7")} ${chalk4.white(friendlyModel)} ${chalk4.dim("OceanCode")}`
      );
      const normCwd = process.cwd().replace(/\\/g, "/");
      const leftStatus = chalk4.dim(normCwd);
      const midStatus = `${chalk4.bold.white("ctrl+p")} ${chalk4.dim("commands")}`;
      const rightStatus = `${chalk4.green("\u25CF")} ${chalk4.cyan("OceanCode 0.1.2")}`;
      const termWidth = process.stdout.columns || 80;
      const plainLeft = normCwd;
      const plainMid = "ctrl+p commands";
      const plainRight = "\u25CF OceanCode 0.1.2";
      const totalLen = plainLeft.length + plainMid.length + plainRight.length;
      const availableSpace = Math.max(2, termWidth - totalLen - 2);
      const padLeft = " ".repeat(Math.max(2, Math.floor(availableSpace / 2)));
      const padRight = " ".repeat(Math.max(2, availableSpace - padLeft.length));
      lines.push(`${leftStatus}${padLeft}${midStatus}${padRight}${rightStatus}`);
    }
    return lines;
  };
  const paintBar = () => {
    try {
      if (!process.stdout.isTTY) return;
      process.stdout.write("\x1B]0;oceancode\x07");
      const lines = buildBarLines();
      const { rows, barStartRow, scrollBottom } = getBarMetrics(lines.length);
      applyScrollRegion(scrollBottom);
      if (lastBarStartRow > 0) {
        if (lastBarStartRow !== barStartRow) {
          for (let r = lastBarStartRow; r < lastBarStartRow + lastBarLinesCount; r++) {
            process.stdout.write(`\x1B[${r};1H\x1B[2K`);
          }
        } else if (lastBarLinesCount > lines.length) {
          for (let r = barStartRow + lines.length; r < barStartRow + lastBarLinesCount; r++) {
            process.stdout.write(`\x1B[${r};1H\x1B[2K`);
          }
        }
      }
      lastBarStartRow = barStartRow;
      lastBarLinesCount = lines.length;
      for (let i = 0; i < lines.length; i++) {
        const r = barStartRow + i;
        process.stdout.write(`\x1B[${r};1H\x1B[2K${lines[i]}`);
      }
      if (!isProcessing && mode === "normal") {
        process.stdout.write("\x1B[?25h");
        const targetRow = barStartRow + 1;
        const col = Math.min(process.stdout.columns || 80, 3 + cursorIndex);
        process.stdout.write(`\x1B[${targetRow};${col}H`);
      } else if (!isProcessing && mode === "model_selector") {
        process.stdout.write("\x1B[?25h");
        const col = Math.min(process.stdout.columns || 80, 9 + modelSearch.length);
        process.stdout.write(`\x1B[${barStartRow + 1};${col}H`);
      } else {
        process.stdout.write("\x1B[?25l\x1B8");
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
      printToContent(chalk4.red(`\u26A0\uFE0F Model Error (${getFriendlyModelName(currentBackendModel)}): ${errMsg}`));
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
  ${chalk4.cyan("\u{1F44B} Goodbye!")}
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
          printToContent(chalk4.yellow(`
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
            printToContent(
              chalk4.green(
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
        (m) => m.name.toLowerCase().includes(searchLower) || m.id.toLowerCase().includes(searchLower) || (m.tag ? m.tag.toLowerCase().includes(searchLower) : false) || (m.description ? m.description.toLowerCase().includes(searchLower) : false)
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
          printToContent(chalk4.green(`\u2713 Active model changed to: ${selectedFriendly} (${selectedId})`));
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
      if (submitted === "/exit" || submitted === "/quit") {
        cleanup();
        unsubscribe();
        console.log(`
  ${chalk4.cyan("\u{1F44B} Goodbye!")}
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
        process.stdout.write("\x1B7");
        lastBarStartRow = 0;
        paintBar();
        return;
      }
      if (submitted === "/init") {
        try {
          const res = initializeAgentsDoc(process.cwd());
          printToContent(`${chalk4.green(`\u2714 ${res.summary}`)}
${chalk4.dim(`  Location: ${res.filePath}`)}`);
        } catch (err) {
          printToContent(chalk4.red(`\u26A0\uFE0F Initialization failed: ${err.message}`));
        }
        render();
        return;
      }
      if (submitted === "/new") {
        try {
          session = await client.createSession("Ocean Session", process.cwd());
          printToContent(chalk4.green("\u2714 Started a new coding session."));
        } catch (err) {
          printToContent(chalk4.red(`Failed to create new session: ${err.message}`));
        }
        render();
        return;
      }
      if (submitted === "/undo") {
        if (lastUserMsgId) {
          try {
            const success = await client.revertSession(session.id, lastUserMsgId);
            if (success) {
              printToContent(chalk4.green("\u2714 Reverted the last AI action and restored previous file states."));
            } else {
              printToContent(chalk4.yellow("Could not revert the last action."));
            }
          } catch (err) {
            printToContent(chalk4.red(`Revert failed: ${err.message}`));
          }
        } else {
          printToContent(chalk4.yellow("No previous action found to undo."));
        }
        render();
        return;
      }
      if (submitted === "/redo") {
        if (!lastSubmittedPrompt) {
          printToContent(chalk4.yellow("No previous action to redo."));
          render();
          return;
        }
        submitted = lastSubmittedPrompt;
      }
      if (submitted.startsWith("/goal")) {
        const goalDesc = submitted.replace(/^\/goal\s*/, "").trim();
        if (!goalDesc) {
          printToContent(
            chalk4.yellow(
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
          printToContent(chalk4.cyan(`Validating API key with ${provArg.toUpperCase()}...`));
          const val = await validateProviderKey(provArg, keyArg);
          if (val.valid) {
            saveProviderKey(provArg, keyArg);
            printToContent(
              chalk4.green(
                `\u2714 Successfully verified and connected ${provArg.toUpperCase()}! Its models are now unlocked in /models.`
              )
            );
          } else {
            printToContent(chalk4.red(`\u26A0\uFE0F Validation failed for ${provArg.toUpperCase()}: ${val.message}`));
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
              chalk4.yellow(
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
            chalk4.green(`\u2713 Added MCP server "${serverName}" (${mcpConfig.type}). Configured in opencode.json.`)
          );
          render();
          return;
        }
        const configured = getConfiguredMcpServers();
        const live = await fetchLiveMcpStatus(baseUrl);
        const names = Array.from(/* @__PURE__ */ new Set([...Object.keys(configured), ...Object.keys(live)]));
        if (names.length === 0) {
          printToContent(
            chalk4.dim(
              "No Model Context Protocol (MCP) servers configured.\n\nTo add an MCP server, run:\n  /mcp add <name> <command-or-url>\nExample:\n  /mcp add filesystem npx -y @modelcontextprotocol/server-filesystem ."
            )
          );
        } else {
          const lines = names.map((n) => {
            const conf = configured[n] || {};
            const isLive = live[n] !== void 0;
            const type = conf.type || (conf.url ? "remote" : "local");
            const target = conf.url || (conf.command ? conf.command.join(" ") : "active");
            const badge = isLive ? chalk4.green("\u25CF Connected") : chalk4.cyan("\u25CF Configured");
            return `  \u2022 ${n} (${type}): ${badge}
    ${chalk4.dim(target)}`;
          }).join("\n");
          printToContent(
            chalk4.bold("Model Context Protocol (MCP) Servers:\n") + lines + chalk4.dim("\n\nAdd new servers with: /mcp add <name> <command>")
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
        printToContent(chalk4.cyan(`\u2713 Switched mode to: ${currentAgent.toUpperCase()}`));
        render();
        return;
      }
      if (submitted === "/diff") {
        try {
          const diffs = await client.getSessionDiff(session.id);
          if (!diffs || diffs.length === 0) {
            printToContent(chalk4.dim("No file modifications recorded in the current session."));
          } else {
            const diffSummary = diffs.map(
              (d) => `  \u2022 ${d.path || d.file || "file"} (+${d.additions || 0} -${d.deletions || 0})`
            ).join("\n");
            printToContent(chalk4.bold(`Modified Files (${diffs.length}):
`) + diffSummary);
          }
        } catch (err) {
          printToContent(chalk4.red(`Failed to retrieve diff: ${err.message}`));
        }
        render();
        return;
      }
      if (submitted === "/compact") {
        try {
          await client.summarizeSession(session.id);
          printToContent(chalk4.green("\u2713 Session context memory compacted and summarized successfully."));
        } catch (err) {
          printToContent(chalk4.red(`Compact failed: ${err.message}`));
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
          printToContent(chalk4.green(`\u2713 Switched model to: ${friendly} (${resolvedId})`));
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
      if (submitted.startsWith("!") || submitted.startsWith("/exec")) {
        const cmdToRun = submitted.startsWith("!") ? submitted.slice(1).trim() : submitted.replace(/^\/exec\s*/, "").trim();
        if (!cmdToRun) {
          printToContent(chalk4.yellow("Usage: !<command> or /exec <command>\nExample: !git status"));
          render();
          return;
        }
        printToContent(chalk4.cyan(`$ ${cmdToRun}`));
        try {
          const res = execSync(cmdToRun, {
            cwd: session.directory,
            encoding: "utf-8",
            stdio: ["ignore", "pipe", "pipe"],
            timeout: 6e4,
            maxBuffer: 10 * 1024 * 1024
          });
          if (res.trim()) {
            printToContent(res.trimEnd());
          } else {
            printToContent(chalk4.dim("(Command completed with no output)"));
          }
        } catch (err) {
          const out = err.stdout ? String(err.stdout).trim() : "";
          const errOut = err.stderr ? String(err.stderr).trim() : "";
          if (out) printToContent(out);
          if (errOut) printToContent(chalk4.red(errOut));
          if (!out && !errOut) printToContent(chalk4.red(`Command failed: ${err.message}`));
        }
        render();
        return;
      }
      if (submitted === "/checkpoint") {
        try {
          const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
          const stashMsg = `oceancode-checkpoint-${timestamp}`;
          const res = execSync(`git stash push -m "${stashMsg}" --include-untracked`, {
            cwd: session.directory,
            encoding: "utf-8",
            stdio: ["ignore", "pipe", "pipe"]
          });
          if (res.includes("No local changes to save")) {
            printToContent(chalk4.yellow("No unstaged or modified changes to checkpoint."));
          } else {
            try {
              execSync("git stash apply stash@{0}", {
                cwd: session.directory,
                stdio: ["ignore", "pipe", "pipe"]
              });
            } catch {
            }
            printToContent(
              `${chalk4.green(`\u2714 Checkpoint created: ${stashMsg}`)}
` + chalk4.dim("  Current changes safely recorded in git stash.\n  Revert anytime with: git stash apply")
            );
          }
        } catch (err) {
          printToContent(chalk4.red(`Checkpoint failed: ${err.message}`));
        }
        render();
        return;
      }
      if (submitted.startsWith("/diff-file")) {
        const targetFile = submitted.replace(/^\/diff-file\s*/, "").trim();
        if (!targetFile) {
          printToContent(chalk4.yellow("Usage: /diff-file <filepath>\nExample: /diff-file package.json"));
          render();
          return;
        }
        try {
          const res = execSync(`git diff HEAD -- "${targetFile}"`, {
            cwd: session.directory,
            encoding: "utf-8",
            stdio: ["ignore", "pipe", "pipe"]
          });
          if (!res.trim()) {
            printToContent(chalk4.dim(`No differences found for "${targetFile}" compared to HEAD.`));
          } else {
            const colored = res.split("\n").map((line) => {
              if (line.startsWith("+") && !line.startsWith("+++")) return chalk4.green(line);
              if (line.startsWith("-") && !line.startsWith("---")) return chalk4.red(line);
              if (line.startsWith("@@")) return chalk4.cyan(line);
              return chalk4.dim(line);
            }).join("\n");
            printToContent(`${chalk4.bold(`Diff: ${targetFile}`)}
${colored}`);
          }
        } catch (err) {
          printToContent(chalk4.red(`Failed to get diff for ${targetFile}: ${err.message}`));
        }
        render();
        return;
      }
      if (submitted === "/commit" || submitted.startsWith("/commit ")) {
        const manualMsg = submitted.replace(/^\/commit\s*/, "").trim();
        if (manualMsg) {
          try {
            execSync(`git commit -m "${manualMsg.replace(/"/g, '\\"')}"`, {
              cwd: session.directory,
              encoding: "utf-8",
              stdio: ["ignore", "pipe", "pipe"]
            });
            printToContent(chalk4.green(`\u2714 Committed successfully with message: "${manualMsg}"`));
          } catch (err) {
            printToContent(chalk4.red(`Git commit failed: ${err.message}`));
          }
          render();
          return;
        } else {
          try {
            const staged = execSync("git diff --staged", {
              cwd: session.directory,
              encoding: "utf-8",
              stdio: ["ignore", "pipe", "pipe"]
            });
            const unstaged = execSync("git diff", {
              cwd: session.directory,
              encoding: "utf-8",
              stdio: ["ignore", "pipe", "pipe"]
            });
            const status = execSync("git status --short", {
              cwd: session.directory,
              encoding: "utf-8",
              stdio: ["ignore", "pipe", "pipe"]
            });
            if (!status.trim()) {
              printToContent(chalk4.yellow("No changes detected to commit. Working tree is clean."));
              render();
              return;
            }
            const diffToUse = staged.trim() || unstaged.trim() || status;
            submitted = `[GENERATE CONVENTIONAL COMMIT MESSAGE]
Based on the following git changes, generate a concise, conventional commit message (e.g. feat:, fix:, refactor:, chore:) with a 1-sentence explanation:

\`\`\`diff
${diffToUse.slice(0, 4e3)}
\`\`\`

Please format the commit message clearly so it can be copied or committed.`;
          } catch (err) {
            printToContent(chalk4.red(`Git inspection failed: ${err.message}`));
            render();
            return;
          }
        }
      }
      if (submitted === "/review" || submitted.startsWith("/review ")) {
        const target = submitted.replace(/^\/review\s*/, "").trim() || "HEAD";
        try {
          let diff = "";
          try {
            diff = execSync(`git diff ${target}`, {
              cwd: session.directory,
              encoding: "utf-8",
              stdio: ["ignore", "pipe", "pipe"]
            });
          } catch {
            diff = execSync("git diff", {
              cwd: session.directory,
              encoding: "utf-8",
              stdio: ["ignore", "pipe", "pipe"]
            });
          }
          if (!diff.trim()) {
            printToContent(chalk4.yellow("No git changes found to review. Working directory matches target."));
            render();
            return;
          }
          submitted = `[CODE REVIEW REQUEST]
Please review the following diff carefully.
Identify: 1) Potential bugs or regressions, 2) Security issues, 3) Edge case handling, 4) Code style or architectural improvements:

\`\`\`diff
${diff.slice(0, 6e3)}
\`\`\``;
        } catch (err) {
          printToContent(chalk4.red(`Review failed: ${err.message}`));
          render();
          return;
        }
      }
      if (submitted.startsWith("/open")) {
        const fileToOpen = submitted.replace(/^\/open\s*/, "").trim();
        if (!fileToOpen) {
          printToContent(chalk4.yellow("Usage: /open <filepath>\nExample: /open src/index.ts"));
          render();
          return;
        }
        const resolved = path5.resolve(session.directory, fileToOpen);
        if (!fs5.existsSync(resolved)) {
          printToContent(chalk4.red(`File not found: ${fileToOpen}`));
          render();
          return;
        }
        const openCmd = process.platform === "win32" ? `start "" "${resolved}"` : process.platform === "darwin" ? `open "${resolved}"` : `xdg-open "${resolved}"`;
        try {
          execSync(openCmd, {
            shell: process.platform === "win32" ? "cmd.exe" : "/bin/sh",
            stdio: "ignore"
          });
          printToContent(chalk4.green(`\u2714 Opened ${fileToOpen}`));
        } catch (err) {
          printToContent(chalk4.red(`Failed to open file: ${err.message}`));
        }
        render();
        return;
      }
      if (submitted.startsWith("/add")) {
        const targetPath = submitted.replace(/^\/add\s*/, "").trim();
        if (!targetPath) {
          printToContent(chalk4.yellow("Usage: /add <filepath>\nExample: /add src/server/client.ts"));
          render();
          return;
        }
        const resolved = path5.resolve(session.directory, targetPath);
        if (!fs5.existsSync(resolved)) {
          printToContent(chalk4.red(`File does not exist: ${targetPath}`));
          render();
          return;
        }
        try {
          const stats = fs5.statSync(resolved);
          if (stats.isDirectory()) {
            printToContent(chalk4.yellow(`Cannot add directory directly. Specify a file path: /add ${targetPath}/<filename>`));
            render();
            return;
          }
          const content = fs5.readFileSync(resolved, "utf-8");
          pinnedContext.set(targetPath, content);
          printToContent(chalk4.green(`\u2714 Added "${targetPath}" (${content.length} chars) to active context.`));
        } catch (err) {
          printToContent(chalk4.red(`Failed to read file: ${err.message}`));
        }
        render();
        return;
      }
      if (submitted.startsWith("/drop")) {
        const targetPath = submitted.replace(/^\/drop\s*/, "").trim();
        if (!targetPath) {
          printToContent(chalk4.yellow("Usage: /drop <filepath> or /drop all"));
          render();
          return;
        }
        if (targetPath.toLowerCase() === "all") {
          const count = pinnedContext.size;
          pinnedContext.clear();
          printToContent(chalk4.green(`\u2714 Dropped all ${count} pinned item(s) from session context.`));
        } else if (pinnedContext.has(targetPath)) {
          pinnedContext.delete(targetPath);
          printToContent(chalk4.green(`\u2714 Dropped "${targetPath}" from session context.`));
        } else {
          let matched = false;
          for (const key2 of pinnedContext.keys()) {
            if (key2.includes(targetPath)) {
              pinnedContext.delete(key2);
              printToContent(chalk4.green(`\u2714 Dropped "${key2}" from session context.`));
              matched = true;
              break;
            }
          }
          if (!matched) {
            printToContent(chalk4.yellow(`"${targetPath}" was not found in pinned context.`));
          }
        }
        render();
        return;
      }
      if (submitted === "/context") {
        const lines = [];
        lines.push(chalk4.bold("Active Session Context:"));
        lines.push(`  \u2022 Model: ${chalk4.cyan(getFriendlyModelName(currentBackendModel))}`);
        lines.push(`  \u2022 Agent Mode: ${chalk4.cyan(currentAgent.toUpperCase())}`);
        lines.push(`  \u2022 Working Directory: ${chalk4.dim(session.directory)}`);
        if (pinnedContext.size === 0) {
          lines.push(chalk4.dim("  \u2022 Pinned Files: None (use /add <file> to attach context)"));
        } else {
          lines.push(chalk4.bold(`  \u2022 Pinned Files (${pinnedContext.size}):`));
          for (const [p, content] of pinnedContext.entries()) {
            lines.push(`    - ${chalk4.cyan(p)} ${chalk4.dim(`(${content.length} chars)`)}`);
          }
        }
        printToContent(lines.join("\n"));
        render();
        return;
      }
      if (submitted.startsWith("/web")) {
        const targetUrl = submitted.replace(/^\/web\s*/, "").trim();
        if (!targetUrl || !targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
          printToContent(chalk4.yellow("Usage: /web <url>\nExample: /web https://docs.github.com/en/rest"));
          render();
          return;
        }
        printToContent(chalk4.cyan(`Fetching ${targetUrl}...`));
        try {
          const res = await fetch(targetUrl, { headers: { "User-Agent": "OceanCode-CLI" } });
          if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          const html = await res.text();
          const textOnly = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "").replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
          const snippet = textOnly.slice(0, 1e4);
          pinnedContext.set(targetUrl, snippet);
          printToContent(chalk4.green(`\u2714 Fetched and pinned text from ${targetUrl} (${snippet.length} chars).`));
        } catch (err) {
          printToContent(chalk4.red(`Failed to fetch URL: ${err.message}`));
        }
        render();
        return;
      }
      if (submitted === "/export" || submitted.startsWith("/export ")) {
        const filenameArg = submitted.replace(/^\/export\s*/, "").trim();
        const exportPath = filenameArg || `oceancode-session-${session.id.slice(0, 8)}.md`;
        const resolvedExport = path5.resolve(session.directory, exportPath);
        try {
          printToContent(chalk4.cyan("Exporting session history..."));
          const rawMsgs = await client.getSessionMessages(session.id);
          const mdLines = [
            "# OceanCode Session Export",
            `**Session ID:** \`${session.id}\``,
            `**Date:** ${(/* @__PURE__ */ new Date()).toLocaleString()}`,
            `**Model:** ${getFriendlyModelName(currentBackendModel)}`,
            `**Directory:** \`${session.directory}\``,
            "\n---\n"
          ];
          if (Array.isArray(rawMsgs) && rawMsgs.length > 0) {
            for (const msg of rawMsgs) {
              const role = msg.role || msg.type || "message";
              let content = "";
              if (typeof msg.content === "string") {
                content = msg.content;
              } else if (Array.isArray(msg.parts)) {
                content = msg.parts.map((p) => typeof p === "string" ? p : p.text || JSON.stringify(p)).join("\n");
              } else {
                content = JSON.stringify(msg);
              }
              mdLines.push(`### ${role.toUpperCase()}

${content}
`);
            }
          } else if (conversationHistory.length > 0) {
            for (const turn of conversationHistory) {
              mdLines.push(`### ${turn.role.toUpperCase()}

${turn.text}
`);
            }
          } else {
            mdLines.push("_No session messages recorded yet._");
          }
          fs5.writeFileSync(resolvedExport, mdLines.join("\n"), "utf-8");
          printToContent(`${chalk4.green(`\u2714 Session successfully exported to:`)}
  ${resolvedExport}`);
        } catch (err) {
          printToContent(chalk4.red(`Failed to export session: ${err.message}`));
        }
        render();
        return;
      }
      if (submitted === "/help") {
        const helpLines = [
          chalk4.bold("Available Commands:"),
          ...COMMANDS.map((c) => `  ${chalk4.hex(OCEAN_BLUE).bold(c.name.padEnd(15))} ${chalk4.dim(c.desc)}`)
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
      process.stdout.write("\x1B8");
      renderUserMessageCard(submitted, friendlyName);
      process.stdout.write("\x1B7");
      isProcessing = true;
      userMsgId = null;
      lastSubmittedPrompt = submitted;
      paintBar();
      resetActivityTimeout();
      renderer.start(friendlyName);
      let promptToSend = submitted;
      if (pinnedContext.size > 0) {
        const parts = ["--- PINNED CONTEXT FILES ---"];
        for (const [k, v] of pinnedContext.entries()) {
          parts.push(`
[Reference: ${k}]
${v}`);
        }
        parts.push("--- END PINNED CONTEXT ---\n");
        promptToSend = parts.join("\n") + "\n" + submitted;
      }
      client.promptSession(session.id, promptToSend, {
        model: currentBackendModel,
        agent: currentAgent,
        directory: session.directory
      }).catch((err) => {
        if (activityTimeoutTimer) clearTimeout(activityTimeoutTimer);
        isProcessing = false;
        renderer.finish(currentAgent === "build" ? "Build" : "Plan");
        printToContent(chalk4.red(`\u26A0\uFE0F Prompt Error: ${err.message}`));
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
      if (str.startsWith("\x1B") || /^<[0-9;]+[Mm]$/.test(str)) {
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
  process.title = "oceancode";
  if (process.stdout.isTTY) {
    process.stdout.write("\x1B]0;oceancode\x07");
    process.stdout.write("\x1B]2;oceancode\x07");
    process.stdout.write("\x1B[2J\x1B[3J\x1B[H");
    process.stdout.write("\x1B[?1000l\x1B[?1002l\x1B[?1006l");
    const { scrollBottom } = getBarMetrics(3);
    applyScrollRegion(scrollBottom);
    process.stdout.write("\x1B[1;1H");
    renderTopBar(getFriendlyModelName(currentBackendModel));
    process.stdout.write("\x1B7");
    paintBar();
  }
}

// src/commands/models.ts
import chalk5 from "chalk";
async function listModelsCommand(options) {
  const { leftMargin } = getLayoutDimensions();
  const indent = " ".repeat(leftMargin);
  const available = getAvailableOceanModels();
  if (options?.all) {
    try {
      const baseUrl = await ensureServer();
      const client = new OceanClient(baseUrl);
      const serverModels = await client.getModels();
      console.log(`
${indent}${chalk5.bold.hex("#00f2fe")(`All Models from Server (${serverModels.length}):`)}`);
      for (const m of serverModels) {
        console.log(`${indent}  \u2022 ${chalk5.white.bold(m.id.padEnd(35))} ${chalk5.dim(m.providerID)}`);
      }
      return;
    } catch {
    }
  }
  console.log("");
  console.log(`${indent}${chalk5.hex("#00d2ff").bold("Ocean AI Models")}`);
  console.log(`${indent}${chalk5.dim("Switch anytime in chat with /models")}
`);
  console.log(`${indent}${chalk5.dim("-".repeat(40))}`);
  for (const m of available) {
    console.log(`${indent}  \u2022 ${chalk5.white.bold(m.name)}`);
  }
  console.log(`
${indent}${chalk5.dim("Tip: Type /models in interactive chat to switch models with arrow keys.")}
`);
}

// src/commands/session.ts
import chalk6 from "chalk";
async function sessionCommand() {
  const baseUrl = await ensureServer();
  const client = new OceanClient(baseUrl);
  const { leftMargin } = getLayoutDimensions();
  const indent = " ".repeat(leftMargin);
  console.log("");
  console.log(`${indent}${chalk6.hex("#00d2ff").bold("Recent Sessions")}`);
  console.log(`${indent}${chalk6.dim("-".repeat(54))}`);
  try {
    const sessions = await client.listSessions(10);
    if (!sessions || sessions.length === 0) {
      console.log(`${indent}${chalk6.dim("No previous sessions found.")}
`);
      return;
    }
    for (const s of sessions) {
      const date = new Date(s.time?.created || Date.now()).toLocaleDateString();
      const tokens = (s.tokens?.input || 0) + (s.tokens?.output || 0);
      console.log(`${indent}${chalk6.cyan(s.id.slice(0, 16))}  ${chalk6.bold.white(s.title || "Untitled")}`);
      console.log(`${indent}  ${chalk6.dim(date)} \xB7 ${chalk6.dim(`${tokens} tokens`)} \xB7 ${chalk6.dim(s.directory)}`);
      console.log("");
    }
  } catch (err) {
    console.error(`${indent}${chalk6.red(`Failed to list sessions: ${err.message}`)}`);
  }
}

// src/commands/stats.ts
import chalk7 from "chalk";
async function statsCommand() {
  const baseUrl = await ensureServer();
  const client = new OceanClient(baseUrl);
  const { leftMargin } = getLayoutDimensions();
  const indent = " ".repeat(leftMargin);
  console.log("");
  console.log(`${indent}${chalk7.hex("#00d2ff").bold("Usage & Analytics")}`);
  console.log(`${indent}${chalk7.dim("-".repeat(54))}`);
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
    console.log(`${indent}${chalk7.dim("Total Sessions:")}   ${chalk7.bold.white(sessions.length)}`);
    console.log(`${indent}${chalk7.dim("Total Tokens:")}     ${chalk7.bold.cyan(totalTokens.toLocaleString())}`);
    console.log(`${indent}${chalk7.dim("Input Tokens:")}     ${chalk7.white(totalInput.toLocaleString())}`);
    console.log(`${indent}${chalk7.dim("Output Tokens:")}    ${chalk7.white(totalOutput.toLocaleString())}`);
    console.log(`${indent}${chalk7.dim("Total Cost:")}       ${chalk7.bold.green("$" + totalCost.toFixed(4))} ${chalk7.bgHex("#00b4d8").black.bold(" FREE ")}`);
    console.log("");
  } catch (err) {
    console.error(`${indent}${chalk7.red(`Failed to load stats: ${err.message}`)}`);
  }
}

// src/index.ts
import chalk8 from "chalk";
process.title = "oceancode";
if (process.stdout.isTTY) {
  process.stdout.write("\x1B]0;oceancode\x07");
  process.stdout.write("\x1B]2;oceancode\x07");
}
var program = new Command();
program.enablePositionalOptions();
program.name("oceancode").description("OceanCode CLI: Next-generation AI coding assistant built for large codebases").version("0.1.2").addHelpText("before", `
${getBigLogo()}
`);
program.option("-m, --model <model>", "Model to use (default: ocean/Qwen3.6-35B-A3B)").action(async (options) => {
  try {
    await interactiveChatCommand({ model: options.model });
  } catch (err) {
    if (process.stdout.isTTY) {
      const rows = process.stdout.rows || 24;
      process.stdout.write(`\x1B[1;${rows}r\x1B[?25h
`);
    }
    console.error(chalk8.red(`
An error occurred: ${err?.message || err}
`));
    process.exit(1);
  }
});
program.command("run [message...]").description("Run a prompt or instruction directly").option("-m, --model <model>", "Model to use (default: ocean/Qwen3.6-35B-A3B)").option("-a, --agent <agent>", "Agent mode (default: build)").option("--auto", "Auto-approve tool permissions").action(async (messages, options, cmd) => {
  const opts = cmd?.optsWithGlobals ? cmd.optsWithGlobals() : options;
  await runCommand(messages, opts);
  process.exit(0);
});
program.command("init").description("Initialize codebase context and generate or update AGENTS.md").action(async () => {
  try {
    const res = initializeAgentsDoc(process.cwd());
    console.log(chalk8.green(`\u2714 ${res.summary}`));
    console.log(chalk8.dim(`  Path: ${res.filePath}`));
  } catch (err) {
    console.error(chalk8.red(`Error initializing AGENTS.md: ${err.message}`));
  }
  process.exit(0);
});
program.command("connect [provider] [key]").description("Link provider API keys (OpenAI, Anthropic, Gemini, DeepSeek, Groq, OpenRouter)").action(async (provider, key) => {
  if (provider && key) {
    console.log(chalk8.cyan(`Validating API key with ${provider.toUpperCase()}...`));
    const val = await validateProviderKey(provider, key);
    if (val.valid) {
      saveProviderKey(provider, key);
      console.log(chalk8.green(`\u2714 ${val.message}`));
    } else {
      console.error(chalk8.red(`\u2716 Validation failed: ${val.message}`));
      process.exit(1);
    }
    process.exit(0);
  }
  const creds = getStoredCredentials();
  console.log(chalk8.bold("\nBring Your Own Key (BYOK) Status:"));
  for (const p of SUPPORTED_BYOK_PROVIDERS) {
    const isSet = Boolean(creds[p.id]?.key);
    const badge = isSet ? chalk8.green("\u2714 Connected") : chalk8.dim("Not linked");
    console.log(`  \u2022 ${p.name.padEnd(16)} (${p.id}): ${badge}`);
  }
  console.log(chalk8.dim("\nTo link a key, run:"));
  console.log(chalk8.cyan("  oceancode connect <provider> <api-key>"));
  console.log(chalk8.dim("Examples:"));
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
      console.error(chalk8.red("Usage: oceancode mcp add <name> <command-or-url>"));
      console.log("Example: oceancode mcp add filesystem npx -y @modelcontextprotocol/server-filesystem .");
      process.exit(1);
    }
    const target = commandArgs.join(" ");
    const isUrl = target.startsWith("http://") || target.startsWith("https://");
    const config = isUrl ? { type: "remote", url: target, enabled: true } : { type: "local", command: commandArgs, enabled: true };
    saveMcpServer(name, config);
    console.log(chalk8.green(`\u2714 Added MCP server "${name}" (${config.type}) to opencode.json`));
    process.exit(0);
  }
  const baseUrl = await ensureServer();
  const configured = getConfiguredMcpServers();
  const live = await fetchLiveMcpStatus(baseUrl);
  const allNames = Array.from(/* @__PURE__ */ new Set([...Object.keys(configured), ...Object.keys(live)]));
  console.log(chalk8.bold("\nModel Context Protocol (MCP) Servers:"));
  if (allNames.length === 0) {
    console.log(chalk8.dim("  No MCP servers configured."));
    console.log(chalk8.dim("\nTo add an MCP server, run:"));
    console.log(chalk8.cyan("  oceancode mcp add <name> <command-or-url>"));
  } else {
    for (const n of allNames) {
      const conf = configured[n] || {};
      const isLive = live[n] !== void 0;
      const type = conf.type || (conf.url ? "remote" : "local");
      const target = conf.url || (conf.command ? conf.command.join(" ") : "active");
      const status = isLive ? chalk8.green("\u25CF Connected") : chalk8.cyan("\u25CF Configured");
      console.log(`  \u2022 ${chalk8.bold(n)} (${type}) ${status}
    ${chalk8.dim(target)}`);
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
  console.log(chalk8.green(`\u2714 Ocean backend is running at: ${url}`));
});
program.parse(process.argv);
