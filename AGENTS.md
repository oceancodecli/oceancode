# AGENTS.md - Repository Guidelines & AI Context

This document guides AI agents (like OceanCode) working in this repository to ensure accurate, non-hallucinatory, and maintainable software engineering.

## Project Overview
- **Project Type**: Node.js / JavaScript / TypeScript
- **Root Directory**: `D:\Ocean CLI`
- **Project Name**: oceancode
- **Version**: 0.1.0
- **Description**: Next-generation CLI coding assistant powered by OpenCode server
- **Core Dependencies**: @inquirer/prompts, chalk, commander, dotenv, ora
- **Dev Dependencies**: @types/node, tsup, tsx, typescript

## Key Directories
- `src/`

## Build & Test Workflow
- Build: `npm run build` (tsup)
- Dev: `npm run dev` (tsx src/index.ts)
- Standard unit tests

## Coding Rules for AI Agents
1. **Never Hallucinate or Truncate**:
   - Always produce full, working code when writing or updating files.
   - Never insert placeholder comments like `// ... existing code ...` or `// TODO`.
2. **Search & Read First**:
   - Use `glob` and `grep` to verify types, exports, and imports across the codebase before modifying or adding code.
   - For files over 200 lines, use chunked reading (`offset` and `limit`) to inspect specific functions or classes.
3. **Surgical Modifications**:
   - When updating existing files, always use `edit` with exact matching lines rather than overwriting the entire file with `write`.
4. **Verification**:
   - After completing edits, run available verification scripts or tests via `bash` to ensure syntax, compilation, and tests succeed.
5. **Readable, Structured Formatting (No Walls of Text)**:
   - Never output dense, unbroken walls of text.
   - Always format explanations with markdown tables, clear bullet points with contextual emojis (📁, 🔧, 💡, ⚡, 🚀, ⚠️, ✅, 📌, 🎯), numbered steps, bold keywords, and fenced code blocks.

