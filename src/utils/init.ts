import fs from "node:fs";
import path from "node:path";

export interface InitResult {
  filePath: string;
  created: boolean;
  projectType: string;
  summary: string;
}

export function initializeAgentsDoc(workspaceDir = process.cwd()): InitResult {
  const agentsPath = path.join(workspaceDir, "AGENTS.md");
  const alreadyExists = fs.existsSync(agentsPath);

  // Analyze workspace
  let projectType = "General Codebase";
  let techDetails: string[] = [];
  let buildCommands: string[] = [];
  let testCommands: string[] = [];
  let conventions: string[] = [];

  const pkgJsonPath = path.join(workspaceDir, "package.json");
  const tsConfigPath = path.join(workspaceDir, "tsconfig.json");
  const pyProjectPath = path.join(workspaceDir, "pyproject.toml");
  const reqTxtPath = path.join(workspaceDir, "requirements.txt");
  const cargoPath = path.join(workspaceDir, "Cargo.toml");
  const goModPath = path.join(workspaceDir, "go.mod");

  if (fs.existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
      projectType = `Node.js / JavaScript${fs.existsSync(tsConfigPath) ? " / TypeScript" : ""}`;
      if (pkg.name) techDetails.push(`- **Project Name**: ${pkg.name}`);
      if (pkg.version) techDetails.push(`- **Version**: ${pkg.version}`);
      if (pkg.description) techDetails.push(`- **Description**: ${pkg.description}`);

      if (pkg.scripts) {
        if (pkg.scripts.build) buildCommands.push(`- Build: \`npm run build\` (${pkg.scripts.build})`);
        if (pkg.scripts.test) testCommands.push(`- Test: \`npm test\` (${pkg.scripts.test})`);
        if (pkg.scripts.dev) buildCommands.push(`- Dev: \`npm run dev\` (${pkg.scripts.dev})`);
        if (pkg.scripts.lint) buildCommands.push(`- Lint: \`npm run lint\` (${pkg.scripts.lint})`);
      }

      const deps = Object.keys(pkg.dependencies || {});
      const devDeps = Object.keys(pkg.devDependencies || {});
      if (deps.length > 0) {
        techDetails.push(`- **Core Dependencies**: ${deps.slice(0, 15).join(", ")}${deps.length > 15 ? ` (+${deps.length - 15} more)` : ""}`);
      }
      if (devDeps.length > 0) {
        techDetails.push(`- **Dev Dependencies**: ${devDeps.slice(0, 10).join(", ")}`);
      }
    } catch {}
  } else if (fs.existsSync(pyProjectPath) || fs.existsSync(reqTxtPath)) {
    projectType = "Python Project";
    testCommands.push("- Test: `pytest`");
    buildCommands.push("- Run: `python main.py`");
  } else if (fs.existsSync(cargoPath)) {
    projectType = "Rust Project";
    buildCommands.push("- Build: `cargo build`");
    testCommands.push("- Test: `cargo test`");
  } else if (fs.existsSync(goModPath)) {
    projectType = "Go Project";
    buildCommands.push("- Build: `go build ./...`");
    testCommands.push("- Test: `go test ./...`");
  }

  // Find directories
  const dirs: string[] = [];
  try {
    const entries = fs.readdirSync(workspaceDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules" && e.name !== "dist") {
        dirs.push(e.name);
      }
    }
  } catch {}

  const agentsContent = `# AGENTS.md - Repository Guidelines & AI Context

This document guides AI agents (like OceanCode) working in this repository to ensure accurate, non-hallucinatory, and maintainable software engineering.

## Project Overview
- **Project Type**: ${projectType}
- **Root Directory**: \`${workspaceDir}\`
${techDetails.join("\n")}

## Key Directories
${dirs.length > 0 ? dirs.map((d) => `- \`${d}/\``).join("\n") : "- Single root project directory"}

## Build & Test Workflow
${buildCommands.length > 0 ? buildCommands.join("\n") : "- Standard build scripts"}
${testCommands.length > 0 ? testCommands.join("\n") : "- Standard unit tests"}

## Coding Rules for AI Agents
1. **Never Hallucinate or Truncate**:
   - Always produce full, working code when writing or updating files.
   - Never insert placeholder comments like \`// ... existing code ...\` or \`// TODO\`.
2. **Search & Read First**:
   - Use \`glob\` and \`grep\` to verify types, exports, and imports across the codebase before modifying or adding code.
   - For files over 200 lines, use chunked reading (\`offset\` and \`limit\`) to inspect specific functions or classes.
3. **Surgical Modifications**:
   - When updating existing files, always use \`edit\` with exact matching lines rather than overwriting the entire file with \`write\`.
4. **Verification**:
   - After completing edits, run available verification scripts or tests via \`bash\` to ensure syntax, compilation, and tests succeed.
5. **Readable, Structured Formatting (No Walls of Text, No Tables)**:
   - Never output dense, unbroken walls of text.
   - Never output markdown tables. Always format explanations with clean, readable bullet points with contextual emojis (📁, 🔧, 💡, ⚡, 🚀, ⚠️, ✅, 📌, 🎯), numbered steps, bold keywords, and fenced code blocks.
`;

  fs.writeFileSync(agentsPath, agentsContent, "utf-8");

  return {
    filePath: agentsPath,
    created: !alreadyExists,
    projectType,
    summary: `Configured context for ${projectType}. Generated repository guidelines in AGENTS.md.`,
  };
}
