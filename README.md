# OceanCode

<p align="center">
  <strong>Next-generation CLI coding assistant built for speed, autonomous workflows, and deep repository awareness.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/oceancode"><img src="https://img.shields.io/npm/v/oceancode.svg?style=flat-square&color=0088ff" alt="npm version" /></a>
  <a href="https://github.com/oceancodecli/oceancode/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="license" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg?style=flat-square" alt="node version" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.7-blue.svg?style=flat-square" alt="TypeScript" /></a>
  <a href="https://modelcontextprotocol.io/"><img src="https://img.shields.io/badge/MCP-Compatible-cyan.svg?style=flat-square" alt="MCP Compatible" /></a>
  <a href="https://github.com/oceancodecli/oceancode/pulls"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square" alt="PRs Welcome" /></a>
</p>

```text
 ██████╗  ██████╗███████╗ █████╗ ███╗   ██╗ ██████╗ ██████╗ ██████╗ ███████╗
██╔═══██╗██╔════╝██╔════╝██╔══██╗████╗  ██║██╔════╝██╔═══██╗██╔══██╗██╔════╝
██║   ██║██║     █████╗  ███████║██╔██╗ ██║██║     ██║   ██║██║  ██║█████╗  
██║   ██║██║     ██╔══╝  ██╔══██║██║╚██╗██║██║     ██║   ██║██║  ██║██╔══╝  
╚██████╔╝╚██████╗███████╗██║  ██║██║ ╚████║╚██████╗╚██████╔╝██████╔╝███████╗
 ╚═════╝  ╚═════╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝
```

---

## Overview

OceanCode is a developer-centric terminal assistant powered by a headless OpenCode engine backend. It combines zero-configuration access to leading open models with the ability to bring your own API keys, hook up Model Context Protocol (MCP) tool servers, run autonomous goal-seeking agent loops, and maintain repository context with zero friction.

Whether you run quick one-shot refactors or work inside a persistent split-screen interactive session, OceanCode streamlines coding across small scripts and massive enterprise monorepos.

---

## Key Features

- **Free AI Models Out of the Box**: Start building immediately with free access to high-performance models (Qwen 3.6 35B, Step 3.7 Flash, DeepSeek V4, Spark X2.5, GLM 5.3 Flash) with zero API keys required.
- **Bring Your Own Key (BYOK)**: Connect your own API keys for OpenAI, Anthropic Claude, Google Gemini, DeepSeek, Groq, and OpenRouter with real-time ping verification.
- **Model Context Protocol (MCP)**: Attach local stdio tools and remote HTTP/SSE servers to expand the agent's capability with custom databases, file systems, browsers, and APIs.
- **Autonomous Goal Loops (`/goal`)**: Define an objective and let OceanCode plan, execute, verify, and iterate autonomously until all acceptance criteria are met.
- **Full Interactive Terminal UI**: Split-screen status bar, animated thinking spinners, live tool streaming, token consumption metrics, and interactive slash command autocomplete.
- **Native Git & Codebase Tools**: Automated `AGENTS.md` context discovery (`/init`), file change diff inspections (`/diff`), git snapshots (`/checkpoint`), code review (`/review`), and semantic commit creation (`/commit`).
- **Context Pinning & Web Fetch**: Pin specific files into model working memory (`/add`, `/context`, `/drop`) and scrape live web documentation directly into prompts (`/web`).
- **Dual Agent Modes**: Switch seamlessly between `build` mode for active code writing and `plan` mode for architecture and design exploration.

---

## Installation

### Prerequisites

- Node.js 18.0.0 or higher
- npm, pnpm, or yarn

### Global Installation

```bash
npm install -g oceancode
```

This installs both the primary `oceancode` command and its convenient short alias `ocean`. The OpenCode backend binary is bundled and orchestrated automatically on first launch.

To verify installation:

```bash
oceancode --version
```

---

## Quick Start

### 1. Launch Interactive Chat

Launch the interactive split-screen environment in your current workspace:

```bash
oceancode
# or using the short alias:
ocean
```

To start with a specific model:

```bash
ocean -m ocean/deepseek-v4-flash-vision-exp
```

### 2. Run a One-Shot Prompt

Execute a prompt directly from your terminal shell without entering interactive mode:

```bash
oceancode run "Audit this directory for security issues and generate a summary"
```

Pass target models or agent modes directly:

```bash
oceancode run "Implement unit tests for the auth middleware" -m anthropic/claude-3-7-sonnet-20250219 -a build --auto
```

### 3. Initialize Codebase Context

Analyze repository structure and create or update the standard `AGENTS.md` instruction file:

```bash
oceancode init
```

---

## Interactive Slash Commands

Inside interactive chat mode, type `/` to access rich command autocomplete:

| Command | Syntax | Description |
| :--- | :--- | :--- |
| `/init` | `/init` | Scans workspace and initializes or updates `AGENTS.md` |
| `/goal` | `/goal <objective>` | Sets and executes an autonomous task completion loop |
| `/new` | `/new` | Clears conversation memory for a fresh session |
| `/undo` | `/undo` | Rolls back the last prompt and associated file modifications |
| `/redo` | `/redo` | Re-applies or regenerates the last undone action |
| `/models` | `/models` | Opens the interactive model switcher UI |
| `/connect` | `/connect [provider] [key]` | Links and verifies provider API keys (OpenAI, Anthropic, Gemini, etc.) |
| `/logout` | `/logout [provider\|all]` | Disconnects linked provider API keys |
| `/mcp` | `/mcp [list\|add]` | Lists active MCP servers or registers a new local/remote server |
| `/diff` | `/diff` | Displays git diff of files modified during the session |
| `/diff-file` | `/diff-file <path>` | Displays git diff for a specific file |
| `/commit` | `/commit [message]` | Generates conventional commit message and commits staged changes |
| `/review` | `/review [branch]` | Conducts AI review of working diff or specified target branch |
| `/checkpoint` | `/checkpoint` | Creates a git stash snapshot of the current workspace |
| `/exec` | `/exec <command>` or `!<cmd>` | Runs a shell command directly within the session |
| `/open` | `/open <path>` | Opens a file in your configured default editor |
| `/add` | `/add <file...>` | Pins file contents into persistent model working memory |
| `/context` | `/context` | Displays current pinned files and context token consumption |
| `/drop` | `/drop <file\|all>` | Removes specified file or all pinned files from memory |
| `/web` | `/web <url>` | Fetches live web page content and injects markdown into context |
| `/export` | `/export [file]` | Exports session transcript to a clean Markdown file |
| `/agent` | `/agent <build\|plan>` | Switches agent operating mode |
| `/compact` | `/compact` | Summarizes and compacts active context to free token window |
| `/clear` | `/clear` | Clears the terminal output screen |
| `/info` | `/info` | Displays session ID, active model, token statistics, and server status |
| `/help` | `/help` | Shows interactive command reference |
| `/exit` | `/exit` | Exits the interactive chat session |

---

## Models & Providers

OceanCode provides ready-to-use models out of the box and supports custom keys for all major AI providers.

### Built-in Free Models

The following models are available immediately without any configuration:

- `ocean/Qwen3.6-35B-A3B` (Default)
- `ocean/step-3.7-flash`
- `ocean/deepseek-v4-flash-vision-exp`
- `ocean/DeepSeek-V4-Flash`
- `ocean/step-router-v1`
- `ocean/spark-x2.5`
- `ocean/Qwen3.8-Flash-Next`
- `ocean/glm-5.3-flash`

List all available models:

```bash
oceancode models
oceancode models --all
```

### Bring Your Own Key (BYOK)

To link your own provider API keys:

```bash
# Check linked provider status
oceancode connect

# Link a provider key directly (or use 'login' alias)
oceancode connect openai sk-proj-...
oceancode login anthropic sk-ant-...
oceancode connect google AIzaSy...
oceancode connect deepseek sk-...
oceancode connect groq gsk_...
oceancode connect openrouter sk-or-...

# Disconnect or log out from a provider
oceancode logout openai
# Or disconnect all providers
oceancode logout
```

Inside interactive chat mode, run `/connect` and press `d` on any selected provider, or run `/logout <provider>` / `/logout all`.

Keys are validated against provider health endpoints before saving and stored securely in `~/.config/oceancode/credentials.json`.

---

## Model Context Protocol (MCP)

OceanCode natively supports the Model Context Protocol (MCP), allowing models to use tools and data sources from any MCP server.

### Listing Configured MCP Servers

```bash
oceancode mcp
```

### Adding a Local MCP Server (stdio)

```bash
# Add filesystem MCP server
oceancode mcp add filesystem npx -y @modelcontextprotocol/server-filesystem .

# Add SQLite MCP server
oceancode mcp add sqlite npx -y @modelcontextprotocol/server-sqlite --db-path ./dev.db

# Add GitHub MCP server
oceancode mcp add github npx -y @modelcontextprotocol/server-github
```

### Adding a Remote MCP Server (SSE / HTTP)

```bash
oceancode mcp add remote-docs https://mcp.example.com/sse
```

Server configurations are persisted in `~/.config/oceancode/opencode.json` and activated on backend connection.

---

## CLI Command Reference

```text
Usage: oceancode [options] [command]

OceanCode CLI: Next-generation AI coding assistant built for large codebases

Options:
  -V, --version                Output the version number
  -m, --model <model>          Model to use (default: ocean/Qwen3.6-35B-A3B)
  -h, --help                   Display help for command

Commands:
  run [options] [message...]   Run a prompt or instruction directly
  init                         Initialize codebase context and generate or update AGENTS.md
  connect [provider] [key]     Link provider API keys (OpenAI, Anthropic, Gemini, DeepSeek, Groq, OpenRouter)
  mcp [action] [name] [cmd...] List or configure Model Context Protocol (MCP) servers
  models [options]             List available AI models (highlighting free models)
  session                      Manage and inspect coding sessions
  stats                        View token consumption and session statistics
  serve                        Ensure or start the Ocean server backend
```

---

## Architecture

```text
  ┌─────────────────────────────────────────────────────────┐
  │                     OceanCode CLI                       │
  │     (Interactive Terminal UI, Command Dispatcher)       │
  └────────────────────────────┬────────────────────────────┘
                               │ HTTP / SSE / REST
                               ▼
  ┌─────────────────────────────────────────────────────────┐
  │                 OpenCode Engine Daemon                  │
  │               (Port 4196, Local Process)                │
  │                                                         │
  │   - Session Store            - Git / Workspace Tools    │
  │   - Tool Permission Sandbox  - MCP Client Registry      │
  │   - SSE Streaming Pipeline   - Model Routing Bridge     │
  └─────────────┬─────────────────────────────┬─────────────┘
                │                             │
                ▼                             ▼
  ┌───────────────────────────┐ ┌───────────────────────────┐
  │   Remote LLM Providers    │ │   MCP Tool Servers        │
  │ (Free Open Models / BYOK) │ │ (Filesystem, DB, Git...)  │
  └───────────────────────────┘ └───────────────────────────┘
```

1. **CLI Layer**: Built with TypeScript, Commander, and an ANSI split-screen renderer handling input buffering, autocomplete, diff displays, and terminal styling.
2. **Local Engine**: Orchestrates a local OpenCode headless backend running on an isolated port (`4196`), maintaining persistent conversation threads and tracking workspace changes.
3. **Storage & Config**:
   - `~/.config/oceancode/opencode.json`: Global MCP server configurations and provider bindings.
   - `~/.config/oceancode/credentials.json`: Authenticated BYOK credential store.
   - `<workspace>/AGENTS.md`: Project-level agent behavioral guidelines and architectural conventions.

---

## Development & Contributing

### Local Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/oceancodecli/oceancode.git
   cd oceancode
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run in development mode:
   ```bash
   npm run dev
   ```

4. Build production bundle:
   ```bash
   npm run build
   ```

5. Test the built CLI locally:
   ```bash
   node dist/index.js --help
   ```

Please read [CONTRIBUTING.md](file:///D:/Oceancode%20CLI/CONTRIBUTING.md) for details on code style, branch conventions, and the pull request process.

---

## Uninstallation

To remove OceanCode and clean up global links:

```bash
npm uninstall -g oceancode
```

Optionally remove local configuration:

```bash
# macOS / Linux
rm -rf ~/.config/oceancode

# Windows (PowerShell)
Remove-Item -Recurse -Force "$env:USERPROFILE\.config\oceancode"
```

---

## Community & Security

- **Issues & Discussions**: [GitHub Issues](https://github.com/oceancodecli/oceancode/issues)
- **Security Policy**: See [SECURITY.md](file:///D:/Oceancode%20CLI/SECURITY.md) for reporting vulnerabilities.
- **Code of Conduct**: See [CODE_OF_CONDUCT.md](file:///D:/Oceancode%20CLI/CODE_OF_CONDUCT.md).

---

## License

This project is licensed under the MIT License. See the [LICENSE](file:///D:/Oceancode%20CLI/LICENSE) file for details.
