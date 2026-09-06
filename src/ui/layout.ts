import readline from "node:readline";
import chalk from "chalk";

export const INDENT = "  ";
export const OCEAN_BLUE = "#0088ff";
export const OCEAN_CYAN = "#38bdf8";

export function getLayoutDimensions() {
  const terminalWidth = process.stdout.columns || 80;
  return { terminalWidth, contentWidth: 80, leftMargin: 2 };
}

export function getBigLogo(): string {
  const line0 = "\u2800" + " ".repeat(37) + "▄";
  const line1 = "█▀▀█ █▀▀▀ █▀▀█ ▄▀▀█ █▀▀▄ █▀▀▀ █▀▀█ █▀▀█ █▀▀█";
  const line2 = "█  █ █    █▀▀▀ █▄▄█ █  █ █    █  █ █  █ █▀▀▀";
  const line3 = "▀▀▀▀ ▀▀▀▀ ▀▀▀▀    ▀ ▀  ▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀";

  return [
    chalk.hex("#60a5fa")(line0),
    chalk.hex(OCEAN_CYAN).bold(line1),
    chalk.hex(OCEAN_BLUE).bold(line2),
    chalk.hex("#0055b3")(line3),
  ].join("\n");
}

export function renderBigLogo(indent = INDENT): void {
  const line0 = "\u2800" + " ".repeat(37) + "▄";
  const line1 = "█▀▀█ █▀▀▀ █▀▀█ ▄▀▀█ █▀▀▄ █▀▀▀ █▀▀█ █▀▀█ █▀▀█";
  const line2 = "█  █ █    █▀▀▀ █▄▄█ █  █ █    █  █ █  █ █▀▀▀";
  const line3 = "▀▀▀▀ ▀▀▀▀ ▀▀▀▀    ▀ ▀  ▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀";

  console.log("");
  console.log(indent + chalk.hex("#60a5fa")(line0));
  console.log(indent + chalk.hex(OCEAN_CYAN).bold(line1));
  console.log(indent + chalk.hex(OCEAN_BLUE).bold(line2));
  console.log(indent + chalk.hex("#0055b3")(line3));
}

export function renderTopBar(modelName: string, cwd = process.cwd()): void {
  const width = Math.max(60, process.stdout.columns || 80);
  const folderStr = cwd.length > 35 ? "..." + cwd.slice(-32) : cwd;

  renderBigLogo(INDENT);
  console.log("");

  const leftText = folderStr;
  const rightText = modelName + "  /help";
  const spaces = Math.max(2, width - (leftText.length + rightText.length + 6));

  console.log(
    INDENT +
      chalk.dim(leftText) +
      " ".repeat(spaces) +
      chalk.hex(OCEAN_BLUE).bold(modelName) +
      "  " +
      chalk.dim("/help")
  );
  console.log(INDENT + chalk.dim("─".repeat(Math.max(40, width - 4))));
  console.log("");
}

export function renderUserPrompt(text: string): void {
  console.log(`\n${chalk.hex(OCEAN_BLUE)("▌")} ${chalk.bold.white(text)}`);
}

export function renderUserMessageCard(text: string, _modelName?: string): void {
  const width = Math.min(80, (process.stdout.columns || 80) - 4);
  const bar = chalk.hex(OCEAN_BLUE)("▌");
  const bg = chalk.bgHex("#161b22");
  const lines = text.split("\n");
  for (const l of lines) {
    const pad = Math.max(2, width - l.length - 3);
    console.log(bar + bg(" " + l + " ".repeat(pad)));
  }
  console.log("");
}

export function renderPromptFooter(modelName: string): void {
  const bar = chalk.hex(OCEAN_BLUE)("▌");
  console.log(chalk.dim("  ········  / commands  ·  /model switch  ·  ctrl+c exit"));
  console.log(
    bar +
      " " +
      chalk.hex(OCEAN_BLUE).bold("Build") +
      chalk.dim(" · ") +
      chalk.hex("#94a3b8")(modelName) +
      chalk.dim(" OceanCode")
  );
}

export function renderThoughtHeader(durationMs: number): void {
  const formatted = durationMs > 1000 ? `${(durationMs / 1000).toFixed(1)}s` : `${durationMs}ms`;
  console.log(`${INDENT}${chalk.hex("#f59e0b")(`+ Thought: ${formatted}`)}\n`);
}

export function renderFooter(modelName: string, durationSec: number, agent = "Build"): void {
  const icon = chalk.hex(OCEAN_BLUE)("▣");
  const agentLabel = chalk.bold.white(agent);
  const dot = chalk.dim(" · ");
  const modelLabel = chalk.hex("#94a3b8")(modelName);
  const timeLabel = chalk.dim(`${durationSec.toFixed(1)}s`);

  console.log(`\n${INDENT}${icon}  ${agentLabel}${dot}${modelLabel}${dot}${timeLabel}`);
}
