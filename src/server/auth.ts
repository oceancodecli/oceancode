import path from "node:path";
import os from "node:os";
import fs from "node:fs";

export interface StoredCredential {
  type: "api" | "oauth";
  key: string;
}

export type StoredCredentials = Record<string, StoredCredential>;

export interface ProviderDefinition {
  id: string;
  name: string;
  envVar: string;
  placeholder: string;
}

export const SUPPORTED_BYOK_PROVIDERS: ProviderDefinition[] = [
  { id: "openai", name: "OpenAI", envVar: "OPENAI_API_KEY", placeholder: "sk-proj-..." },
  { id: "anthropic", name: "Anthropic", envVar: "ANTHROPIC_API_KEY", placeholder: "sk-ant-..." },
  { id: "google", name: "Google Gemini", envVar: "GEMINI_API_KEY", placeholder: "AIzaSy..." },
  { id: "deepseek", name: "DeepSeek", envVar: "DEEPSEEK_API_KEY", placeholder: "sk-..." },
  { id: "groq", name: "Groq", envVar: "GROQ_API_KEY", placeholder: "gsk_..." },
  { id: "openrouter", name: "OpenRouter", envVar: "OPENROUTER_API_KEY", placeholder: "sk-or-..." },
];

export interface ValidationResult {
  valid: boolean;
  message: string;
}

export async function validateProviderKey(providerId: string, key: string): Promise<ValidationResult> {
  const cleanKey = key.trim();
  if (!cleanKey) {
    return { valid: false, message: "API key cannot be empty." };
  }

  const normalized = providerId.toLowerCase().trim();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    let res: Response;
    if (normalized === "openai") {
      res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${cleanKey}` },
        signal: controller.signal,
      });
    } else if (normalized === "anthropic") {
      res = await fetch("https://api.anthropic.com/v1/models", {
        headers: {
          "x-api-key": cleanKey,
          "anthropic-version": "2023-06-01",
        },
        signal: controller.signal,
      });
    } else if (normalized === "google" || normalized === "gemini") {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(cleanKey)}`, {
        signal: controller.signal,
      });
    } else if (normalized === "deepseek") {
      res = await fetch("https://api.deepseek.com/models", {
        headers: { Authorization: `Bearer ${cleanKey}` },
        signal: controller.signal,
      });
    } else if (normalized === "groq") {
      res = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: `Bearer ${cleanKey}` },
        signal: controller.signal,
      });
    } else if (normalized === "openrouter") {
      res = await fetch("https://openrouter.ai/api/v1/auth/key", {
        headers: { Authorization: `Bearer ${cleanKey}` },
        signal: controller.signal,
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
      const data = (await res.json()) as any;
      detail = data.error?.message || data.message || `HTTP ${res.status}`;
    } catch {
      detail = `HTTP status ${res.status}`;
    }

    return { valid: false, message: `Rejected by ${providerId}: ${detail}` };
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      return { valid: false, message: "Validation timed out after 8 seconds." };
    }
    return { valid: false, message: `Network error during validation: ${err.message}` };
  }
}

function getAuthPaths(): string[] {
  const oceanAuth = path.join(os.homedir(), ".local", "share", "oceancode", "auth.json");
  const opencodeAuth = path.join(os.homedir(), ".local", "share", "opencode", "auth.json");
  return [oceanAuth, opencodeAuth];
}

export function getStoredCredentials(): StoredCredentials {
  const paths = getAuthPaths();
  const merged: StoredCredentials = {};

  for (const p of paths) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, "utf-8");
        const parsed = JSON.parse(raw);
        if (typeof parsed === "object" && parsed !== null) {
          Object.assign(merged, parsed);
        }
      } catch {}
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

export function isProviderConnected(providerId: string): boolean {
  const creds = getStoredCredentials();
  const normalized = providerId.toLowerCase().trim();
  return Boolean(creds[normalized]?.key);
}

export function saveProviderKey(providerId: string, key: string): void {
  const normalizedId = providerId.toLowerCase().trim();
  const paths = getAuthPaths();

  for (const p of paths) {
    try {
      const dir = path.dirname(p);
      fs.mkdirSync(dir, { recursive: true });

      let current: StoredCredentials = {};
      if (fs.existsSync(p)) {
        try {
          current = JSON.parse(fs.readFileSync(p, "utf-8"));
        } catch {}
      }

      current[normalizedId] = { type: "api", key: key.trim() };
      fs.writeFileSync(p, JSON.stringify(current, null, 2), "utf-8");
    } catch {}
  }

  const matched = SUPPORTED_BYOK_PROVIDERS.find((p) => p.id === normalizedId);
  if (matched) {
    process.env[matched.envVar] = key.trim();
  }
}

export function removeProviderKey(providerId: string): void {
  const normalizedId = providerId.toLowerCase().trim();
  const paths = getAuthPaths();

  for (const p of paths) {
    try {
      if (fs.existsSync(p)) {
        const current: StoredCredentials = JSON.parse(fs.readFileSync(p, "utf-8"));
        if (current[normalizedId]) {
          delete current[normalizedId];
          fs.writeFileSync(p, JSON.stringify(current, null, 2), "utf-8");
        }
      }
    } catch {}
  }

  const matched = SUPPORTED_BYOK_PROVIDERS.find((p) => p.id === normalizedId);
  if (matched) {
    delete process.env[matched.envVar];
  }
}
