import { getStoredCredentials, StoredCredentials } from "../server/auth.js";

export interface OceanModel {
  id: string;              // Backend ID
  name: string;            // User-facing friendly name
  description: string;     // Friendly description
  tag: string;             // e.g. "1M Context", "Reasoning", "BYOK"
  isFree?: boolean;
  provider: "opencode" | "openai" | "anthropic" | "google" | "deepseek" | "groq" | "openrouter";
}

export const OCEAN_MODELS: OceanModel[] = [
  {
    id: "opencode/muse-spark-1.3-contributor-free",
    name: "Muse Spark 1.3 (1M Context)",
    description: "1,048,576 tokens · Best for big codebases & large files",
    tag: "1M Context",
    isFree: true,
    provider: "opencode",
  },
  {
    id: "opencode/nemotron-3-ultra-free",
    name: "Nemotron 3 Ultra",
    description: "Deep reasoning & architecture analysis",
    tag: "Reasoning",
    isFree: true,
    provider: "opencode",
  },
  {
    id: "opencode/nemotron-3.5-lightning-free",
    name: "Nemotron 3.5 Lightning",
    description: "Ultra-fast completions · 262k context",
    tag: "Speed",
    isFree: true,
    provider: "opencode",
  },
  {
    id: "opencode/mimo-v2.5-free",
    name: "MiMo 2.5",
    description: "High accuracy code refactoring & design",
    tag: "Pro",
    isFree: true,
    provider: "opencode",
  },
  {
    id: "opencode/big-pickle",
    name: "Big Pickle",
    description: "General purpose & code generation",
    tag: "Default",
    isFree: true,
    provider: "opencode",
  },
  {
    id: "opencode/ling-3.0-flash-fin-free",
    name: "Ling 3.0 Flash",
    description: "Instant responses & quick answers",
    tag: "Instant",
    isFree: true,
    provider: "opencode",
  },
  {
    id: "opencode/muse-spark-1.2-contributor-free",
    name: "Muse Spark 1.2",
    description: "Lightweight efficient companion · 1M context",
    tag: "Light",
    isFree: true,
    provider: "opencode",
  },
  // BYOK Models (Only visible when the respective provider API key is connected)
  {
    id: "openai/gpt-4o",
    name: "OpenAI GPT-4o",
    description: "Flagship multimodal intelligence",
    tag: "OpenAI",
    isFree: false,
    provider: "openai",
  },
  {
    id: "openai/o3-mini",
    name: "OpenAI o3-mini",
    description: "High-speed reasoning for coding",
    tag: "OpenAI",
    isFree: false,
    provider: "openai",
  },
  {
    id: "anthropic/claude-3-5-sonnet-latest",
    name: "Claude 3.5 Sonnet",
    description: "State-of-the-art coding & refactoring",
    tag: "Anthropic",
    isFree: false,
    provider: "anthropic",
  },
  {
    id: "google/gemini-2.5-pro",
    name: "Google Gemini 2.5 Pro",
    description: "Long-context reasoning & coding",
    tag: "Google",
    isFree: false,
    provider: "google",
  },
  {
    id: "deepseek/deepseek-chat",
    name: "DeepSeek V3",
    description: "Powerful open-weight architecture",
    tag: "DeepSeek",
    isFree: false,
    provider: "deepseek",
  },
  {
    id: "deepseek/deepseek-reasoner",
    name: "DeepSeek R1",
    description: "Pure reasoning & mathematical logic",
    tag: "DeepSeek",
    isFree: false,
    provider: "deepseek",
  },
  {
    id: "groq/llama-3.3-70b-versatile",
    name: "Groq Llama 3.3 70B",
    description: "Ultra-low latency inference",
    tag: "Groq",
    isFree: false,
    provider: "groq",
  },
];

/**
 * Returns models that are currently available to use.
 * Free OpenCode models are always available.
 * BYOK models are ONLY returned if the user has connected the provider with an API key.
 */
export function getAvailableOceanModels(credentials?: StoredCredentials): OceanModel[] {
  const creds = credentials || getStoredCredentials();
  return OCEAN_MODELS.filter((m) => {
    if (m.isFree || m.provider === "opencode") return true;
    return Boolean(creds[m.provider]?.key);
  });
}

export function getFriendlyModelName(backendId: string): string {
  const match = OCEAN_MODELS.find((m) => m.id === backendId);
  if (match) return match.name;
  return backendId.replace(/^opencode\//, "").replace(/-free$/, "");
}

export function getBackendModelId(friendlyOrPartial: string): string {
  const lower = friendlyOrPartial.toLowerCase().trim();
  const num = parseInt(lower);
  if (!isNaN(num) && num >= 1 && num <= OCEAN_MODELS.length) {
    return OCEAN_MODELS[num - 1].id;
  }
  const match = OCEAN_MODELS.find(
    (m) =>
      m.name.toLowerCase() === lower ||
      m.id.toLowerCase() === lower ||
      m.name.toLowerCase().includes(lower) ||
      m.id.toLowerCase().includes(lower)
  );
  if (match) return match.id;

  // Keyword mappings
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
