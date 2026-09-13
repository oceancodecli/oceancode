import chalk from "chalk";
import { ensureServer } from "../server/manager.js";
import { OceanClient } from "../server/client.js";
import { StreamRenderer } from "../ui/renderer.js";
import { renderUserMessageCard } from "../ui/layout.js";
import { getFriendlyModelName, getBackendModelId, DEFAULT_MODEL_ID } from "../models/registry.js";
import { extractToolDetail } from "../ui/toolLabels.js";

export interface RunOptions {
  model?: string;
  agent?: string;
  auto?: boolean;
}

export async function runCommand(messages: string[], options: RunOptions) {
  const promptText = messages.join(" ").trim();
  if (!promptText) {
    console.error(chalk.red("Error: No prompt provided. Usage: oceancode run <message>"));
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

  await new Promise<void>((resolve, reject) => {
    let resolved = false;
    let userMsgId: string | null = null;
    let activityTimer: NodeJS.Timeout | null = null;
    const reasoningPartIds = new Set<string>();
    const textPartIds = new Set<string>();

    const resetTimeout = () => {
      if (activityTimer) clearTimeout(activityTimer);
      activityTimer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          renderer.finish(options.agent === "plan" ? "Plan" : "Build");
          unsubscribe();
          console.log(chalk.yellow(`\n⚠️ Execution timed out after 3 minutes of inactivity.`));
          resolve();
        }
      }, 180000);
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

      if (event.type === "session.idle" || (event.type === "session.status" && event.properties?.status?.type === "idle")) {
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
          console.error(chalk.red(`\nError: ${errDetail}`));
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
      directory: session.directory,
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
