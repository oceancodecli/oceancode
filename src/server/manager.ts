import { spawn, spawnSync, ChildProcess } from "node:child_process";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

export interface ServerConfig {
  host?: string;
  port?: number;
}

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4196; // Isolated port separate from OpenCode's 4096

let managedProcess: ChildProcess | null = null;

export function getBaseUrl(config?: ServerConfig): string {
  const host = config?.host || process.env.OCEAN_SERVER_HOST || DEFAULT_HOST;
  const port = config?.port || (process.env.OCEAN_SERVER_PORT ? parseInt(process.env.OCEAN_SERVER_PORT) : DEFAULT_PORT);
  return `http://${host}:${port}`;
}

export async function isServerHealthy(baseUrl: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1000);
    const res = await fetch(`${baseUrl}/global/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return false;
    const data = (await res.json()) as { healthy?: boolean };
    return Boolean(data.healthy);
  } catch {
    return false;
  }
}

/**
 * Silently ensures the local backend is online.
 * Isolated from OpenCode on port 4196 with its own ~/.local/share/oceancode database.
 * Zero popup windows on Windows.
 */
const AGENT_SYSTEM_PROMPT = `You are OceanCode, an elite, autonomous AI software engineer designed to master large, complex codebases and write production-quality code without hallucination or truncation.

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
     • 🎯 Bullet Points with Emojis: Use clean bullet points prefixed with contextual emojis (📁, 🔧, 💡, ⚡, 🚀, ⚠️, ✅, 📌, 🎯, 🔍) so key takeaways scan instantly.
     • 🔢 Numbered Steps: Use numbered lists (1., 2., 3.) for chronological execution steps, install steps, or procedures.
     • 🔤 Bold & Code Highlights: Bold key concepts (**keyword**, **feature**) and use inline code (\`path/file.ts\`, \`function()\`) to clearly separate technical terms from explanation.
     • 💻 Fenced Code Blocks: Always specify syntax language for code snippets (\`\`\`typescript, \`\`\`bash, etc.).
     • ✂️ Crisp Executive Summaries: Start with a brief, punchy overview, present the structured content (bullets), and finish with clear next steps.
7. CLEAN, TO THE POINT & DECORATIVE GREETINGS / RESPONSES:
   - When introducing yourself, greeting the user, or providing project overviews:
     • Keep it concise, punchy, decorative, and directly to the point — avoid rambling filler.
     • Open with a stylish, clean greeting header (e.g. 🌊 **OceanCode** · *<Project Name> Engineer*).
     • Highlight capabilities with crisp emoji bullets (🚀, ⚡, 🔧, 🔍).
     • Present project tech stack in a clean, compact bullet list (never a table).
     • Finish with a friendly, direct prompt asking what the user wants to tackle.`;

export function getEffectiveSystemPrompt(cwd = process.cwd()): string {
  const agentsPath = path.join(cwd, "AGENTS.md");
  let promptText = "";
  if (fs.existsSync(agentsPath)) {
    try {
      promptText = fs.readFileSync(agentsPath, "utf-8").trim();
    } catch {}
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

export const OCEAN_CUSTOM_MODELS = {
  "Qwen3.6-35B-A3B": {
    name: "Qwen 3.6 (35B)",
    tool_call: true,
    limit: { context: 131072, output: 8192 },
  },
  "step-3.7-flash": {
    name: "Step 3.7 Flash",
    tool_call: true,
    limit: { context: 131072, output: 8192 },
  },
  "deepseek-v4-flash-vision-exp": {
    name: "DeepSeek V4 Flash Vision",
    tool_call: true,
    limit: { context: 131072, output: 8192 },
  },
  "DeepSeek-V4-Flash": {
    name: "DeepSeek V4 Flash",
    tool_call: true,
    limit: { context: 131072, output: 8192 },
  },
  "step-router-v1": {
    name: "Step Router V1",
    tool_call: true,
    limit: { context: 131072, output: 8192 },
  },
  "spark-x2.5": {
    name: "Spark X2.5",
    tool_call: true,
    limit: { context: 131072, output: 8192 },
  },
  "Qwen3.8-Flash-Next": {
    name: "Qwen 3.8 Flash Next",
    tool_call: true,
    limit: { context: 131072, output: 8192 },
  },
  "glm-5.3-flash": {
    name: "GLM 5.3 Flash",
    tool_call: true,
    limit: { context: 131072, output: 8192 },
  },
};

export function setupServerConfig(oceanConfigDir: string) {
  const opencodeConfigDir = path.join(oceanConfigDir, "opencode");
  fs.mkdirSync(opencodeConfigDir, { recursive: true });
  const configPath = path.join(opencodeConfigDir, "opencode.json");

  let existing: Record<string, any> = {};
  if (fs.existsSync(configPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    } catch {}
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
    question: "allow",
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
      apiKey: oceanApiKey,
    },
    models: OCEAN_CUSTOM_MODELS,
  };

  const merged = {
    $schema: "https://opencode.ai/config.json",
    ...existing,
    disabled_providers: ["opencode"],
    model: "ocean/Qwen3.6-35B-A3B",
    provider: {
      ...(existing.provider || {}),
      ocean: oceanProvider,
    },
    permission: {
      ...permissions,
      ...(existing.permission || {}),
    },
    agent: {
      ...(existing.agent || {}),
      build: {
        ...(existing.agent?.build || {}),
        prompt: effectivePrompt,
        permission: permissions,
      },
      plan: {
        ...(existing.agent?.plan || {}),
        prompt: effectivePrompt,
        permission: {
          ...permissions,
          edit: "deny",
          write: "deny",
        },
      },
    },
  };

  fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), "utf-8");

  // Also sync to project-level opencode.json if present
  const projectConfigPath = path.join(process.cwd(), "opencode.json");
  if (fs.existsSync(projectConfigPath)) {
    try {
      const projExisting = JSON.parse(fs.readFileSync(projectConfigPath, "utf-8"));
      const projMerged = {
        ...projExisting,
        disabled_providers: ["opencode"],
        model: "ocean/Qwen3.6-35B-A3B",
        provider: {
          ...(projExisting.provider || {}),
          ocean: oceanProvider,
        },
        agent: {
          ...(projExisting.agent || {}),
          build: {
            ...(projExisting.agent?.build || {}),
            prompt: effectivePrompt,
            permission: permissions,
          },
          plan: {
            ...(projExisting.agent?.plan || {}),
            prompt: effectivePrompt,
            permission: {
              ...permissions,
              edit: "deny",
              write: "deny",
            },
          },
        },
      };
      fs.writeFileSync(projectConfigPath, JSON.stringify(projMerged, null, 2), "utf-8");
    } catch {}
  }
}

function findOpencodeBinary(): string {
  const isWin = process.platform === "win32";
  const exeName = isWin ? "opencode.exe" : "opencode";

  // 1. Resolve relative to this module/package (whether running from dist/ or src/)
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
  } catch {}

  // 2. Resolve in global npm root on Windows
  if (isWin && process.env.APPDATA) {
    const globalCandidates = [
      path.join(process.env.APPDATA, "npm", "node_modules", "oceancode", "node_modules", "opencode-ai", "bin", "opencode.exe"),
      path.join(process.env.APPDATA, "npm", "node_modules", "opencode-ai", "bin", "opencode.exe"),
    ];
    for (const cand of globalCandidates) {
      if (fs.existsSync(cand)) return cand;
    }
  }

  // 3. Resolve in current working directory
  const cwdExe = path.join(process.cwd(), "node_modules", "opencode-ai", "bin", exeName);
  if (fs.existsSync(cwdExe)) return cwdExe;

  // 4. Resolve exact binary name on PATH (search specifically for opencode.exe, never .ps1 or .cmd)
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
  } catch {}

  return "";
}

export async function ensureServer(config?: ServerConfig): Promise<string> {
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

  // Prepend local and package node_modules/.bin to PATH so opencode is always found
  const localBin = path.join(process.cwd(), "node_modules", ".bin");
  const pkgBin = path.join(path.dirname(path.dirname(import.meta.dirname || "")), "node_modules", ".bin");
  const pathSeparator = process.platform === "win32" ? ";" : ":";
  const updatedPath = [localBin, pkgBin, process.env.PATH || ""].filter(Boolean).join(pathSeparator);

  const env = {
    ...process.env,
    PATH: updatedPath,
    XDG_DATA_HOME: oceanDataDir,
    XDG_CONFIG_HOME: oceanConfigDir,
    XDG_STATE_HOME: oceanStateDir,
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
      detached: false,
    });

    child.unref();
    managedProcess = child;

    // Poll until healthy
    const startTime = Date.now();
    const MAX_WAIT_MS = 15000;

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
    } catch {}

    throw new Error(`Ocean backend failed to respond on ${baseUrl}.${logSnippet ? ` Backend log:${logSnippet}` : ""}`);
  } catch (err: any) {
    throw err;
  }
}
