import path from "node:path";
import os from "node:os";
import fs from "node:fs";

export interface McpServerConfig {
  type: "local" | "remote";
  command?: string[];
  url?: string;
  environment?: Record<string, string>;
  headers?: Record<string, string>;
  enabled?: boolean;
}

export type McpConfigMap = Record<string, McpServerConfig>;

function getOpencodeConfigPath(): string {
  return path.join(os.homedir(), ".config", "oceancode", "opencode", "opencode.json");
}

export function getConfiguredMcpServers(): McpConfigMap {
  const configPath = getOpencodeConfigPath();
  if (!fs.existsSync(configPath)) return {};

  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed.mcp || {};
  } catch {
    return {};
  }
}

export function saveMcpServer(name: string, config: McpServerConfig): void {
  const configPath = getOpencodeConfigPath();
  const dir = path.dirname(configPath);
  fs.mkdirSync(dir, { recursive: true });

  let fullConfig: Record<string, any> = {};
  if (fs.existsSync(configPath)) {
    try {
      fullConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    } catch {}
  }

  if (!fullConfig.mcp) fullConfig.mcp = {};
  fullConfig.mcp[name] = config;

  fs.writeFileSync(configPath, JSON.stringify(fullConfig, null, 2), "utf-8");

  // Also write to project opencode.json if in a git/code directory
  try {
    const projectConfig = path.join(process.cwd(), "opencode.json");
    let proj: Record<string, any> = {};
    if (fs.existsSync(projectConfig)) {
      proj = JSON.parse(fs.readFileSync(projectConfig, "utf-8"));
    }
    if (!proj.mcp) proj.mcp = {};
    proj.mcp[name] = config;
    fs.writeFileSync(projectConfig, JSON.stringify(proj, null, 2), "utf-8");
  } catch {}
}

export async function fetchLiveMcpStatus(baseUrl: string): Promise<Record<string, any>> {
  try {
    const res = await fetch(`${baseUrl}/mcp`);
    if (!res.ok) return {};
    return (await res.json()) as Record<string, any>;
  } catch {
    return {};
  }
}
