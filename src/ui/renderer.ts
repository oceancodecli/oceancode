import readline from "node:readline";
import chalk from "chalk";
import { INDENT, renderFooter } from "./layout.js";
import { getFriendlyToolLabel } from "./toolLabels.js";


// Number of terminal rows reserved for the bottom bar:
// slash menu lines (variable) + input line + blank line + model line
// We track this dynamically via pinBar, but the renderer needs to know
// the minimum fixed rows when doing erase-before-print.
export const BOTTOM_BAR_ROWS = 3; // input line + blank + model line

export class StreamRenderer {
  private reasoningStarted = false;
  private textStarted = false;
  private currentReasoningLength = 0;
  private currentTextLength = 0;
  private startTime = 0;
  private modelName = "Big Pickle";
  private toolsUsed: string[] = [];

  private thinkingTimer: NodeJS.Timeout | null = null;
  private thinkingFrame = 0;

  private eraseBarFn: (() => void) | null = null;
  private pinBarFn: (() => void) | null = null;

  /** Dedupe tracker: OpenCode emits pending → running → completed updates per tool part */
  private seenTools = new Map<string, string>();
  /** Per-part streamed text length — prevents duplicate/lost output across parts */
  private textLens = new Map<string, number>();

  /** Wire the interactive bar renderer and eraser */
  setPinBar(pinFn: () => void, eraseFn: () => void) {
    this.pinBarFn = pinFn;
    this.eraseBarFn = eraseFn;
  }

  getThinkingFrame(): number {
    return this.thinkingFrame;
  }

  private eraseBar() {
    this.eraseBarFn?.();
  }

  private repinBar() {
    this.pinBarFn?.();
  }

  /** Collapse a tool detail to a single short line so long commands don't scroll */
  private formatDetail(detail?: unknown): string {
    if (detail === undefined || detail === null) return "";
    const raw = Array.isArray(detail) ? detail.join(" ") : String(detail);
    const oneLine = raw.replace(/[\r\n]+/g, " ").replace(/\s{2,}/g, " ").trim();
    const MAX = 100;
    return oneLine.length > MAX ? oneLine.slice(0, MAX - 1) + "…" : oneLine;
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

  private startThinkingAnimation() {
    if (this.thinkingTimer) return;
    this.thinkingTimer = setInterval(() => {
      this.thinkingFrame++;
      this.repinBar();
    }, 200);
  }

  private stopThinkingAnimation() {
    if (!this.thinkingTimer) return;
    clearInterval(this.thinkingTimer);
    this.thinkingTimer = null;
  }

  // ── Public event handlers ────────────────────────────────────────────────────

  handleReasoning(fullText: string) {
    this.reasoningStarted = true;
    this.currentReasoningLength = fullText.length;
  }

  handleTool(toolName: string, detail?: unknown, partId?: string, status?: string) {
    // OpenCode emits several updates (pending → running → completed) for one
    // tool call. Render it ONCE as a single compact line; later updates are
    // completion bookkeeping, not new lines — this is the main scroll fix.
    const key = partId ?? `${toolName}::${typeof detail === "string" ? detail : ""}`;
    const prev = this.seenTools.get(key);
    if (prev) {
      // Duplicate or follow-up update for an already-rendered tool — skip.
      // Just record terminal states so we don't re-render if it updates again.
      if (status && (status === "completed" || status === "error")) this.seenTools.set(key, status);
      return;
    }
    this.seenTools.set(key, status ?? "running");

    this.stopThinkingAnimation();
    if (!this.toolsUsed.includes(toolName)) this.toolsUsed.push(toolName);

    this.eraseBar();
    const { icon, label } = getFriendlyToolLabel(toolName);
    const badge = chalk.bgHex("#3b82f6").black.bold(" TOOL ");
    const action = chalk.bold.hex("#60a5fa")(`${icon} ${label}`);
    const clean = this.formatDetail(detail);
    const info = clean ? chalk.dim(`  ${clean}`) : "";
    process.stdout.write(`${INDENT}${badge} ${action}${info}\n`);
    this.repinBar();

    this.startThinkingAnimation();
  }

  handleDelta(delta: string, partId = "default") {
    if (!delta) return;
    this.stopThinkingAnimation();

    if (!this.textStarted) {
      this.textStarted = true;

      this.eraseBar();
      if (this.toolsUsed.length > 0) {
        process.stdout.write(
          `${INDENT}${chalk.green("✓")} ${chalk.dim(`Used tools: ${this.toolsUsed.join(", ")}`)}\n`
        );
      }
    }

    this.currentTextLength += delta.length;
    this.textLens.set(partId, (this.textLens.get(partId) ?? 0) + delta.length);
    process.stdout.write(delta);
  }

  handleText(fullText: string, partId = "default") {
    if (!fullText) return;
    this.stopThinkingAnimation();

    if (!this.textStarted) {
      this.textStarted = true;

      this.eraseBar();
      if (this.toolsUsed.length > 0) {
        process.stdout.write(
          `${INDENT}${chalk.green("✓")} ${chalk.dim(`Used tools: ${this.toolsUsed.join(", ")}`)}\n`
        );
      }
    }

    // Per-part offset: each text part streams its own full text from 0.
    // A shared global offset swallowed every part after the first tool call.
    const written = this.textLens.get(partId) ?? 0;
    if (fullText.length <= written) return; // stale / duplicate update
    const slice = fullText.slice(written);
    this.textLens.set(partId, fullText.length);
    this.currentTextLength += slice.length;
    process.stdout.write(slice);
  }

  finish(agent = "Build") {
    this.stopThinkingAnimation();
    const totalSec = Math.max(0.1, (Date.now() - this.startTime) / 1000);
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
}

