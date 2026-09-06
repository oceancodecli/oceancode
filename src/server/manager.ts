import { spawn, ChildProcess } from "node:child_process";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

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
6. READABLE, STRUCTURED & ENGAGING RESPONSES (NO WALLS OF TEXT):
   - NEVER output dense, unbroken walls of text or rambling paragraphs.
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
     • Present project tech stack in a clean, compact markdown table.
     • Finish with a friendly, direct prompt asking what the user wants to tackle.`;

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

  const merged = {
    $schema: "https://opencode.ai/config.json",
    ...existing,
    permission: {
      ...permissions,
      ...(existing.permission || {}),
    },
    agent: {
      ...(existing.agent || {}),
      build: {
        ...(existing.agent?.build || {}),
        prompt: AGENT_SYSTEM_PROMPT,
        permission: permissions,
      },
      plan: {
        ...(existing.agent?.plan || {}),
        prompt: AGENT_SYSTEM_PROMPT,
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
        agent: {
          ...(projExisting.agent || {}),
          build: {
            ...(projExisting.agent?.build || {}),
            prompt: AGENT_SYSTEM_PROMPT,
            permission: permissions,
          },
          plan: {
            ...(projExisting.agent?.plan || {}),
            prompt: AGENT_SYSTEM_PROMPT,
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

  const env = {
    ...process.env,
    XDG_DATA_HOME: oceanDataDir,
    XDG_CONFIG_HOME: oceanConfigDir,
    XDG_STATE_HOME: oceanStateDir,
  };

  try {
    // Spawn cleanly with cwd set to current workspace directory
    const child = spawn(`opencode serve --port ${port} --hostname ${host}`, {
      shell: true,
      windowsHide: true,
      stdio: "ignore",
      cwd: process.cwd(),
      env,
    });

    managedProcess = child;

    // Clean up when the process exits
    process.on("exit", () => {
      try {
        if (managedProcess && !managedProcess.killed) {
          managedProcess.kill();
        }
      } catch {}
    });

    // Poll silently until healthy
    const startTime = Date.now();
    const MAX_WAIT_MS = 15000;

    while (Date.now() - startTime < MAX_WAIT_MS) {
      await new Promise((r) => setTimeout(r, 200));
      if (await isServerHealthy(baseUrl)) {
        return baseUrl;
      }
    }

    throw new Error(`Ocean backend failed to respond on ${baseUrl}.`);
  } catch (err: any) {
    throw err;
  }
}
