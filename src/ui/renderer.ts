import readline from "node:readline";
import chalk from "chalk";
import { INDENT, OCEAN_CYAN, renderFooter } from "./layout.js";
import { getFriendlyToolLabel } from "./toolLabels.js";


// Number of terminal rows reserved for the bottom bar:
// slash menu lines (variable) + input line + blank line + model line
// We track this dynamically via pinBar, but the renderer needs to know
// the minimum fixed rows when doing erase-before-print.
export const BOTTOM_BAR_ROWS = 3; // input line + blank + model line

export class TerminalMarkdownFormatter {
  private isBold = false;
  private isCode = false;
  private isItalic = false;
  private pendingStars = "";
  private lineBuffer = "";

  format(chunk: string): string {
    this.lineBuffer += chunk;
    let output = "";

    // Process complete lines if lineBuffer contains newlines
    if (this.lineBuffer.includes("\n")) {
      const lines = this.lineBuffer.split("\n");
      // Keep the incomplete last segment in lineBuffer
      this.lineBuffer = lines.pop() || "";

      for (const line of lines) {
        const processed = this.processLine(line);
        if (processed !== null) {
          output += processed + "\n";
        }
      }
    }

    // For the current incomplete line:
    // If it starts with '|', wait for newline so we can transform table into list
    if (this.lineBuffer.startsWith("|")) {
      return output;
    }

    // Otherwise, if there is non-table text in lineBuffer, we stream it immediately
    if (this.lineBuffer) {
      const flushed = this.processInline(this.lineBuffer);
      this.lineBuffer = "";
      output += flushed;
    }

    return output;
  }

  private processLine(line: string): string | null {
    const trimmed = line.trim();

    // Suppress markdown table separators (e.g. |---|---| or |:---:|)
    if (/^\|?(\s*:?-+:?\s*\|?)+$/.test(trimmed) && trimmed.includes("-")) {
      return null;
    }

    // Transform markdown table rows into clean bullet lists
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const cells = trimmed
        .slice(1, -1)
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean);

      if (cells.length === 0) return null;

      // Suppress table header rows
      const lower0 = cells[0].toLowerCase().replace(/[*_`]/g, "");
      const lower1 = (cells[1] || "").toLowerCase().replace(/[*_`]/g, "");
      if (
        (lower0 === "field" && lower1 === "value") ||
        (lower0 === "key" && lower1 === "value") ||
        (lower0 === "property" && lower1 === "value") ||
        (lower0 === "option" && lower1 === "description") ||
        (lower0 === "name" && lower1 === "description") ||
        (lower0 === "parameter" && lower1 === "description")
      ) {
        return null;
      }

      if (cells.length === 1) {
        return `  • ${this.processInline(cells[0])}`;
      } else {
        const rawTitle = cells[0].replace(/^[*_]+|[*_]+$/g, "");
        const title = this.processInline(rawTitle);
        const desc = cells.slice(1).map((c) => this.processInline(c)).join(" — ");
        return `  • \x1b[1m${title}\x1b[22m: ${desc}`;
      }
    }

    return this.processInline(line);
  }

  private processInline(text: string): string {
    let result = "";
    const combined = this.pendingStars + text;
    this.pendingStars = "";

    let i = 0;
    while (i < combined.length) {
      const ch = combined[i];

      // Handle bold ** or __
      if (ch === "*" || ch === "_") {
        if (i + 1 < combined.length && combined[i + 1] === ch) {
          this.isBold = !this.isBold;
          result += this.isBold ? "\x1b[1m" : "\x1b[22m";
          i += 2;
          continue;
        } else if (i + 1 === combined.length) {
          // Incomplete delimiter at the very end of chunk
          this.pendingStars = ch;
          break;
        } else {
          this.isItalic = !this.isItalic;
          result += this.isItalic ? "\x1b[3m" : "\x1b[23m";
          i++;
          continue;
        }
      }

      // Handle inline code `
      if (ch === "`") {
        if (combined.slice(i, i + 3) === "```") {
          result += "```";
          i += 3;
          continue;
        }
        this.isCode = !this.isCode;
        result += this.isCode ? "\x1b[36m" : "\x1b[39m";
        i++;
        continue;
      }

      result += ch;
      i++;
    }

    return result;
  }

  finish(): string {
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
      output += "\x1b[22m";
      this.isBold = false;
    }
    if (this.isCode) {
      output += "\x1b[39m";
      this.isCode = false;
    }
    if (this.isItalic) {
      output += "\x1b[23m";
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
}

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
  /** Track parts streamed via deltas so handleText doesn't duplicate them */
  private deltaParts = new Set<string>();

  private formatter = new TerminalMarkdownFormatter();

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

  private lastOutputWasTool = false;

  private shortenPath(text: string): string {
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
  private formatDetail(detail?: unknown): string {
    if (detail === undefined || detail === null) return "";
    const raw = Array.isArray(detail) ? detail.join(" ") : String(detail);
    const shortened = this.shortenPath(raw);
    const oneLine = shortened.replace(/[\r\n]+/g, " ").replace(/\s{2,}/g, " ").trim();
    const MAX = 60;
    return oneLine.length > MAX ? oneLine.slice(0, 25) + "…" + oneLine.slice(-30) : oneLine;
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

  private toPascalCaseTool(name: string): string {
    const map: Record<string, string> = {
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
      filesystemwritefile: "Write",
    };
    const lower = name.toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (map[lower]) return map[lower];
    return name.split(/[_-]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
  }

  handleTool(toolName: string, detail?: unknown, partId?: string, status?: string) {
    const key = partId ?? toolName;
    const prev = this.seenTools.get(key);
    if (prev && prev !== "pending_empty") {
      return;
    }

    const clean = this.formatDetail(detail)
      .replace(/\(ctrl\+o\s+to\s+expand\)/gi, "")
      .replace(/\\/g, "/")
      .trim();

    // If pending update arrives without arguments, wait for the running update
    if (!clean && status === "pending") {
      this.seenTools.set(key, "pending_empty");
      return;
    }

    this.seenTools.set(key, status ?? "running");

    this.stopThinkingAnimation();
    if (!this.toolsUsed.includes(toolName)) this.toolsUsed.push(toolName);

    this.eraseBar();
    const arrow = chalk.hex(OCEAN_CYAN)("→");
    const nameStr = chalk.white(this.toPascalCaseTool(toolName));
    const argsStr = clean ? ` ${chalk.dim(clean)}` : "";

    const prefix = this.lastOutputWasTool ? "" : "\n";
    process.stdout.write(`${prefix}  ${arrow} ${nameStr}${argsStr}\n`);
    process.stdout.write("\x1b7");
    this.lastOutputWasTool = true;
    this.repinBar();

    this.startThinkingAnimation();
  }

  handleDelta(delta: string, partId = "default") {
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
      process.stdout.write("\x1b7");
    }
  }

  handleText(fullText: string, partId = "default") {
    if (!fullText) return;
    if (this.deltaParts.has(partId)) return; // Avoid duplicate / racing output when delta streaming
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
    if (fullText.length <= written) return; // stale / duplicate update
    const slice = fullText.slice(written);
    this.textLens.set(partId, fullText.length);
    this.currentTextLength += slice.length;
    const formatted = this.formatter.format(slice);
    if (formatted) {
      process.stdout.write(formatted);
      process.stdout.write("\x1b7");
    }
  }

  finish(agent = "Build") {
    this.stopThinkingAnimation();
    const flushed = this.formatter.finish();
    if (flushed) {
      process.stdout.write(flushed);
    }
    const totalSec = Math.max(0.1, (Date.now() - this.startTime) / 1000);
    process.stdout.write("\n");
    renderFooter(this.modelName, totalSec, agent);
    process.stdout.write("\x1b7");

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
}
