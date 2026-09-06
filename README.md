# OceanCode 🌊

Next-generation CLI coding assistant powered by the OpenCode server backend.

## Install

Requires **Node.js 18+**.

```bash
npm install -g oceancode
```

This installs two commands — `oceancode` and its short alias `ocean` — plus the
`opencode` backend binary (via the `opencode-ai` dependency), which the CLI
manages automatically on first run. No other setup needed.

## Usage

```bash
oceancode              # launch interactive chat
ocean                  # same thing, shorter
oceancode run "explain this repo and fix the failing build"
oceancode run "add tests for the parser" -m gpt-4o --agent build
```

Slash commands inside interactive mode: `/init` `/goal` `/new` `/undo` `/redo`
`/models` `/connect` `/mcp` `/diff` `/agent` `/compact` `/clear` `/info` `/help` `/exit`

## How it works

On startup the CLI spawns a local `opencode serve` backend (isolated on port
4196 with its own config under `~/.config/oceancode`) and talks to it over HTTP/SSE.

## Uninstall

```bash
npm uninstall -g oceancode
```

## License

MIT
