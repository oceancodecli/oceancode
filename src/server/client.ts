import http from "node:http";

export interface ModelInfo {
  id: string;
  providerID: string;
  name: string;
  isFree?: boolean;
}

export interface ProviderInfo {
  id: string;
  name: string;
  models: Record<string, any>;
}

export interface SessionInfo {
  id: string;
  slug: string;
  title: string;
  directory: string;
  tokens: {
    input: number;
    output: number;
    reasoning: number;
  };
  cost: number;
  time: {
    created: number;
    updated: number;
  };
}

export interface PromptOptions {
  model?: string; // e.g. "opencode/big-pickle" or "big-pickle"
  agent?: string;
}

export class OceanClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async getHealth() {
    const res = await fetch(`${this.baseUrl}/global/health`);
    return await res.json();
  }

  async getProviders(): Promise<ProviderInfo[]> {
    const res = await fetch(`${this.baseUrl}/provider`);
    if (!res.ok) throw new Error(`Failed to fetch providers: ${res.statusText}`);
    const data = await res.json() as { all: ProviderInfo[] };
    return data.all || [];
  }

  async getModels(): Promise<ModelInfo[]> {
    const providers = await this.getProviders();
    const list: ModelInfo[] = [];

    for (const p of providers) {
      if (!p.models) continue;
      for (const [modelKey, modelData] of Object.entries(p.models)) {
        const isFree =
          p.id === "opencode" ||
          modelKey.includes("free") ||
          (modelData as any).cost?.input === 0;

        list.push({
          id: (modelData as any).id || modelKey,
          providerID: p.id,
          name: (modelData as any).name || modelKey,
          isFree,
        });
      }
    }
    return list;
  }

  async createSession(title = "Ocean Session", directory = process.cwd()): Promise<SessionInfo> {
    const url = new URL(`${this.baseUrl}/session`);
    url.searchParams.set("directory", directory);

    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-opencode-directory": directory,
      },
      body: JSON.stringify({ title, directory }),
    });

    if (!res.ok) {
      throw new Error(`Failed to create session: ${res.statusText}`);
    }

    return (await res.json()) as SessionInfo;
  }

  async getSessionDiff(sessionID: string): Promise<any[]> {
    try {
      const res = await fetch(`${this.baseUrl}/session/${sessionID}/diff`);
      if (!res.ok) return [];
      return (await res.json()) as any[];
    } catch {
      return [];
    }
  }

  async revertSession(sessionID: string, messageID: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/session/${sessionID}/revert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageID }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async summarizeSession(sessionID: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/session/${sessionID}/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async listSessions(limit = 20): Promise<SessionInfo[]> {
    const res = await fetch(`${this.baseUrl}/session?limit=${limit}`);
    if (!res.ok) throw new Error(`Failed to list sessions: ${res.statusText}`);
    return (await res.json()) as SessionInfo[];
  }

  async getSessionMessages(sessionID: string) {
    const res = await fetch(`${this.baseUrl}/session/${sessionID}/message`);
    if (!res.ok) throw new Error(`Failed to get session messages: ${res.statusText}`);
    return await res.json();
  }

  async promptSession(sessionID: string, text: string, options?: PromptOptions & { directory?: string }) {
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
        modelID,
      },
      agent: options?.agent || "build",
    };

    const dir = options?.directory || process.cwd();
    const res = await fetch(`${this.baseUrl}/session/${sessionID}/prompt_async`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-opencode-directory": dir,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Prompt error (${res.status}): ${errText}`);
    }

    const resText = await res.text();
    return resText ? JSON.parse(resText) : { success: true };
  }

  async replyPermission(requestID: string, reply: "once" | "always" | "reject" = "always") {
    const res = await fetch(`${this.baseUrl}/permission/${requestID}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reply }),
    });
    return res.ok;
  }

  async replyQuestion(requestID: string, answers: any[]) {
    const res = await fetch(`${this.baseUrl}/question/${requestID}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    });
    return res.ok;
  }

  async abortSession(sessionID: string) {
    const res = await fetch(`${this.baseUrl}/session/${sessionID}/abort`, {
      method: "POST",
    });
    return res.ok;
  }

  /**
   * Subscribe to server SSE stream. Returns an unsubscribe function.
   */
  subscribeEvents(
    onEvent: (event: any) => void,
    onError?: (err: any) => void,
    directory = process.cwd()
  ): () => void {
    const url = new URL(`${this.baseUrl}/event`);
    if (directory) {
      url.searchParams.set("directory", directory);
    }
    let isCancelled = false;
    let currentRes: http.IncomingMessage | null = null;

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        headers: { Accept: "text/event-stream" },
      },
      (res) => {
        currentRes = res;
        let buffer = "";

        res.on("data", (chunk: Buffer) => {
          if (isCancelled) return;
          buffer += chunk.toString("utf-8");

          const lines = buffer.split("\n");
          // Keep incomplete line in buffer
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("data: ")) {
              const dataStr = trimmed.slice(6);
              try {
                const parsed = JSON.parse(dataStr);
                onEvent(parsed);
              } catch {
                // partial/malformed chunk
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
}

