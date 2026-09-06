import readline from "node:readline";
import chalk from "chalk";
import { OCEAN_MODELS, getFriendlyModelName, getBackendModelId } from "../models/registry.js";
import { OCEAN_BLUE } from "./layout.js";

export interface PromptContext {
  getCurrentModel: () => string;
  setCurrentModel: (modelId: string) => void;
  onClear: () => void;
}

const COMMANDS = [
  { name: "/model", desc: "Switch model" },
  { name: "/clear", desc: "Clear screen" },
  { name: "/info",  desc: "Session details & status" },
  { name: "/help",  desc: "Help & commands" },
  { name: "/exit",  desc: "Exit the app" },
];

export function promptUser(ctx: PromptContext): Promise<string> {
  // If not a TTY (piped or CI), fallback to basic readline with bottom bar
  if (!process.stdin.isTTY) {
    const friendlyModel = getFriendlyModelName(ctx.getCurrentModel());
    const bar = chalk.hex(OCEAN_BLUE)("│");
    console.log(`${bar}`);
    console.log(
      `  ${chalk.hex(OCEAN_BLUE).bold("Build")} ${chalk.dim("·")} ${chalk.white(friendlyModel)} ${chalk.dim("· OceanCode")}`
    );
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
      rl.question(`${bar} `, (ans) => {
        rl.close();
        resolve(ans.trim());
      });
    });
  }

  return new Promise((resolve) => {
    let input = "";
    let mode: "normal" | "model_selector" = "normal";
    let menuIndex = 0;
    let modelIndex = 0;
    let modelSearch = "";
    let lastRenderedLines = 0;

    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();

    const cleanup = () => {
      process.stdin.removeListener("keypress", onKeypress);
      try {
        process.stdin.setRawMode(false);
      } catch {}
    };

    const clearLastRender = () => {
      if (lastRenderedLines > 0) {
        readline.moveCursor(process.stdout, 0, -lastRenderedLines);
        readline.cursorTo(process.stdout, 0);
        readline.clearScreenDown(process.stdout);
        lastRenderedLines = 0;
      }
    };

    const render = () => {
      clearLastRender();

      const width = Math.min(80, (process.stdout.columns || 80) - 4);
      const peachBg = chalk.bgHex("#fba978").black;
      const lines: string[] = [];

      if (mode === "model_selector") {
        const header = "Select model" + " ".repeat(Math.max(2, width - 16)) + chalk.dim("esc");
        lines.push(chalk.bold.white(header));
        lines.push(modelSearch ? `Search: ${modelSearch}` : chalk.dim("Search"));
        lines.push("");

        const currentModelId = ctx.getCurrentModel();
        const filtered = OCEAN_MODELS.filter(
          (m) =>
            m.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
            m.description.toLowerCase().includes(modelSearch.toLowerCase())
        );

        if (modelIndex >= filtered.length) {
          modelIndex = Math.max(0, filtered.length - 1);
        }

        filtered.forEach((m, idx) => {
          const isCurrent = m.id === currentModelId;
          const prefix = isCurrent ? "● " : "  ";
          const left = prefix + m.name;
          const tag = "Free";
          const spaces = Math.max(2, width - left.length - tag.length);
          const row = left + " ".repeat(spaces) + tag;
          if (idx === modelIndex) {
            lines.push(peachBg(row));
          } else {
            lines.push(chalk.white(row));
          }
        });
        lines.push("");
      } else {
        // Normal or Slash command mode
        if (input.startsWith("/")) {
          const matching = COMMANDS.filter((c) => c.name.startsWith(input));
          if (menuIndex >= matching.length) {
            menuIndex = Math.max(0, matching.length - 1);
          }
          if (matching.length > 0) {
            matching.forEach((c, idx) => {
              const row = "  " + c.name.padEnd(14) + c.desc;
              const padded = row + " ".repeat(Math.max(2, width - row.length));
              if (idx === menuIndex) {
                lines.push(peachBg(padded));
              } else {
                lines.push(chalk.white(row));
              }
            });
          }
        }

        // Bottom Input Box
        const bar = chalk.hex(OCEAN_BLUE)("│");
        const friendlyModel = getFriendlyModelName(ctx.getCurrentModel());
        lines.push(`${bar} ${input}█`);
        lines.push(`${bar}`);
        lines.push(
          `  ${chalk.hex(OCEAN_BLUE).bold("Build")} ${chalk.dim("·")} ${chalk.white(friendlyModel)} ${chalk.dim("· OceanCode")}`
        );
      }

      for (let i = 0; i < lines.length; i++) {
        process.stdout.write(lines[i] + (i < lines.length - 1 ? "\n" : ""));
      }
      lastRenderedLines = lines.length - 1;
    };

    const onKeypress = (str: string, key: readline.Key) => {
      // Ctrl+C to exit
      if (key && key.ctrl && key.name === "c") {
        clearLastRender();
        cleanup();
        console.log(`\n  ${chalk.cyan("👋 Goodbye!")}\n`);
        process.exit(0);
      }

      if (mode === "model_selector") {
        const filtered = OCEAN_MODELS.filter(
          (m) =>
            m.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
            m.description.toLowerCase().includes(modelSearch.toLowerCase())
        );

        if (key.name === "escape") {
          mode = "normal";
          modelSearch = "";
          render();
          return;
        }

        if (key.name === "up") {
          if (filtered.length > 0) {
            modelIndex = (modelIndex - 1 + filtered.length) % filtered.length;
          }
          render();
          return;
        }

        if (key.name === "down") {
          if (filtered.length > 0) {
            modelIndex = (modelIndex + 1) % filtered.length;
          }
          render();
          return;
        }

        if (key.name === "return") {
          if (filtered[modelIndex]) {
            ctx.setCurrentModel(filtered[modelIndex].id);
          }
          mode = "normal";
          input = "";
          modelSearch = "";
          render();
          return;
        }

        if (key.name === "backspace") {
          modelSearch = modelSearch.slice(0, -1);
          modelIndex = 0;
          render();
          return;
        }

        if (str && str.length === 1 && !key.ctrl && !key.meta) {
          modelSearch += str;
          modelIndex = 0;
          render();
          return;
        }

        return;
      }

      // Mode: normal / slash menu
      const matching = input.startsWith("/")
        ? COMMANDS.filter((c) => c.name.startsWith(input))
        : [];

      if (key.name === "escape") {
        input = "";
        menuIndex = 0;
        render();
        return;
      }

      if (matching.length > 0) {
        if (key.name === "up") {
          menuIndex = (menuIndex - 1 + matching.length) % matching.length;
          render();
          return;
        }

        if (key.name === "down") {
          menuIndex = (menuIndex + 1) % matching.length;
          render();
          return;
        }

        if (key.name === "tab") {
          if (matching[menuIndex]) {
            input = matching[menuIndex].name;
          }
          render();
          return;
        }
      }

      if (key.name === "return") {
        let submitted = input.trim();
        if (matching.length > 0 && matching[menuIndex]) {
          submitted = matching[menuIndex].name;
        }

        if (submitted === "/model" || submitted === "/models") {
          mode = "model_selector";
          input = "";
          modelSearch = "";
          modelIndex = 0;
          render();
          return;
        }

        clearLastRender();
        cleanup();
        console.log("");
        resolve(submitted);
        return;
      }

      if (key.name === "backspace") {
        input = input.slice(0, -1);
        menuIndex = 0;
        render();
        return;
      }

      if (str && str.length === 1 && !key.ctrl && !key.meta) {
        input += str;
        menuIndex = 0;
        render();
        return;
      }
    };

    process.stdin.on("keypress", onKeypress);
    render();
  });
}

