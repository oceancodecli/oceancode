import readline from "node:readline";
import chalk from "chalk";

export const INDENT = "  ";
export const OCEAN_BLUE = "#0088ff";
export const OCEAN_CYAN = "#38bdf8";

export function getLayoutDimensions() {
  const terminalWidth = process.stdout.columns || 80;
  return { terminalWidth, contentWidth: 80, leftMargin: 2 };
}


const BIG_HEADING_LINES = [
  " ██████╗  ██████╗███████╗ █████╗ ███╗   ██╗ ██████╗ ██████╗ ██████╗ ███████╗",
  "██╔═══██╗██╔════╝██╔════╝██╔══██╗████╗  ██║██╔════╝██╔═══██╗██╔══██╗██╔════╝",
  "██║   ██║██║     █████╗  ███████║██╔██╗ ██║██║     ██║   ██║██║  ██║█████╗  ",
  "██║   ██║██║     ██╔══╝  ██╔══██║██║╚██╗██║██║     ██║   ██║██║  ██║██╔══╝  ",
  "╚██████╔╝╚██████╗███████╗██║  ██║██║ ╚████║╚██████╗╚██████╔╝██████╔╝███████╗",
  " ╚═════╝  ╚═════╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝",
];

const COMPACT_HEADING_LINES = [
  " █▀█ █▀▀ █▀▀ ▄▀█ █▄ █ █▀▀ █▀█ █▀▄ █▀▀",
  " █▄█ █▄▄ ██▄ █▀█ █ ▀█ █▄▄ █▄█ █▄▀ ██▄",
];

const ZINC_GRAYS = ["#f4f4f5", "#d4d4d8", "#a1a1aa", "#71717a", "#52525b", "#3f3f46"];

export function getBigLogo(): string {
  return BIG_HEADING_LINES.map((l, i) => chalk.hex(ZINC_GRAYS[i]).bold(l)).join("\n");
}

export function renderBigLogo(indent = INDENT): void {
  const cols = process.stdout.columns || 80;
  console.log("");
  if (cols < 80) {
    COMPACT_HEADING_LINES.forEach((l, i) =>
      console.log(indent + chalk.hex(i === 0 ? "#e4e4e7" : "#71717a").bold(l))
    );
  } else {
    BIG_HEADING_LINES.forEach((l, i) =>
      console.log(indent + chalk.hex(ZINC_GRAYS[i]).bold(l))
    );
  }
}

export function renderTopBar(modelName: string, cwd = process.cwd()): void {
  if (process.stdout.isTTY) {
    process.stdout.write("\x1b]0;oceancode\x07");
    process.stdout.write("\x1b]2;oceancode\x07");
  }
  const normCwd = cwd.replace(/\\/g, "/");
  const cols = process.stdout.columns || 80;

  renderBigLogo(INDENT);
  console.log("");
  console.log(
    `${INDENT}${chalk.bold.white("OceanCode CLI 0.1.2")}${chalk.dim(" · ")}${chalk.hex("#94a3b8")(modelName)}${chalk.dim(" · ")}${chalk.dim(normCwd)}`
  );
  console.log(`${INDENT}${chalk.dim("─".repeat(Math.max(40, cols - 4)))}`);
}

export function renderUserPrompt(text: string): void {
  const bar = chalk.hex(OCEAN_BLUE)("│");
  process.stdout.write(`\n${bar}\n${bar} ${chalk.bold.white(text)}\n${bar}\n\n`);
}

export function renderUserMessageCard(text: string, _modelName?: string): void {
  const bar = chalk.hex(OCEAN_BLUE)("│");
  process.stdout.write(`\n${bar}\n${bar} ${chalk.bold.white(text)}\n${bar}\n\n`);
}

export function renderPromptFooter(modelName: string): void {
  const bar = chalk.hex(OCEAN_BLUE)("│");
  console.log(
    `${bar} ${chalk.hex(OCEAN_BLUE).bold("Build")} ${chalk.dim("·")} ${chalk.white(modelName)} ${chalk.dim("OceanCode")}`
  );
}

export function renderThoughtHeader(durationMs: number): void {
  const sec = (durationMs / 1000).toFixed(1);
  console.log(chalk.hex(OCEAN_CYAN)(`\nThought · ${sec}s`));
}

export function renderFooter(modelName: string, durationSec: number, agent = "Build"): void {
  const icon = chalk.hex(OCEAN_CYAN)("▣");
  const agentStr = chalk.bold.white(agent);
  const modelStr = chalk.dim(modelName);
  const timeStr = chalk.dim(`${durationSec.toFixed(1)}s`);
  console.log(`\n${icon} ${agentStr} · ${modelStr} · ${timeStr}\n`);
}

