export interface OceanModel {
  id: string;              // Backend ID
  name: string;            // User-facing friendly name
  description?: string;
  tag?: string;
  isFree?: boolean;
  provider: "ocean";
}

export const DEFAULT_MODEL_ID = "ocean/Qwen3.6-35B-A3B";

export const OCEAN_MODELS: OceanModel[] = [
  {
    id: "ocean/Qwen3.6-35B-A3B",
    name: "Qwen 3.6 (35B)",
    isFree: true,
    provider: "ocean",
  },
  {
    id: "ocean/step-3.7-flash",
    name: "Step 3.7 Flash",
    isFree: true,
    provider: "ocean",
  },
  {
    id: "ocean/deepseek-v4-flash-vision-exp",
    name: "DeepSeek V4 Flash Vision",
    isFree: true,
    provider: "ocean",
  },
  {
    id: "ocean/DeepSeek-V4-Flash",
    name: "DeepSeek V4 Flash",
    isFree: true,
    provider: "ocean",
  },
  {
    id: "ocean/step-router-v1",
    name: "Step Router V1",
    isFree: true,
    provider: "ocean",
  },
  {
    id: "ocean/spark-x2.5",
    name: "Spark X2.5",
    isFree: true,
    provider: "ocean",
  },
  {
    id: "ocean/Qwen3.8-Flash-Next",
    name: "Qwen 3.8 Flash Next",
    isFree: true,
    provider: "ocean",
  },
  {
    id: "ocean/glm-5.3-flash",
    name: "GLM 5.3 Flash",
    isFree: true,
    provider: "ocean",
  },
];

/**
 * Returns models that are currently available to use.
 */
export function getAvailableOceanModels(): OceanModel[] {
  return OCEAN_MODELS;
}

export function getFriendlyModelName(backendId: string): string {
  const match = OCEAN_MODELS.find((m) => m.id === backendId);
  if (match) return match.name;
  return backendId.replace(/^ocean\//, "").replace(/^opencode\//, "").replace(/-free$/, "");
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

  // Keyword mappings for ocean models
  if (lower.includes("qwen3.6") || lower.includes("35b") || lower.includes("qwen")) return "ocean/Qwen3.6-35B-A3B";
  if (lower.includes("step-3.7") || lower.includes("3.7") || lower.includes("step")) return "ocean/step-3.7-flash";
  if (lower.includes("vision") || lower.includes("flash-vision")) return "ocean/deepseek-v4-flash-vision-exp";
  if (lower.includes("deepseek-v4") || lower.includes("v4-flash") || lower.includes("deepseek")) return "ocean/DeepSeek-V4-Flash";
  if (lower.includes("router")) return "ocean/step-router-v1";
  if (lower.includes("spark")) return "ocean/spark-x2.5";
  if (lower.includes("3.8") || lower.includes("next")) return "ocean/Qwen3.8-Flash-Next";
  if (lower.includes("glm")) return "ocean/glm-5.3-flash";

  // Default fallback
  if (lower.includes("/")) return lower;
  return `ocean/${lower}`;
}

