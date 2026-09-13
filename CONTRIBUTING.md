# Contributing to OceanCode

Thank you for your interest in contributing to OceanCode. We welcome contributions from the community to help make OceanCode faster, more reliable, and more versatile.

---

## Code of Conduct

All contributors are expected to adhere to our [Code of Conduct](file:///D:/Oceancode%20CLI/CODE_OF_CONDUCT.md). Please treat all members of the community with respect.

---

## Getting Started

### Prerequisites

- Node.js 18.0.0 or higher
- Git
- npm 9+ or compatible package manager

### Fork and Clone

1. Fork the repository on GitHub: `https://github.com/oceancodecli/oceancode`
2. Clone your fork locally:
   ```bash
   git clone https://github.com/<your-username>/oceancode.git
   cd oceancode
   ```
3. Add the upstream remote:
   ```bash
   git remote add upstream https://github.com/oceancodecli/oceancode.git
   ```

### Install Dependencies

```bash
npm install
```

---

## Development Workflow

### Running Locally

To run the TypeScript source code directly without building:

```bash
npm run dev
```

To test subcommands or specific flags:

```bash
npx tsx src/index.ts --help
npx tsx src/index.ts models
```

### Building

We use `tsup` for bundling the CLI into a standalone ESM distribution:

```bash
npm run build
```

Verify that the generated bundle in `dist/index.js` executes correctly:

```bash
node dist/index.js --help
```

---

## Code Style & Conventions

- Written in modern TypeScript targeting Node 18+ ESM.
- Keep terminal interactions responsive and handle ANSI escape codes gracefully.
- Do not introduce runtime dependencies unless strictly necessary. Check `package.json` before adding third-party packages.
- Ensure cross-platform compatibility across Windows, macOS, and Linux.

---

## Submitting a Pull Request

1. Create a descriptive feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Make your changes and verify that the project builds cleanly:
   ```bash
   npm run build
   ```
3. Commit your changes following conventional commit messages:
   - `feat: add support for custom MCP transports`
   - `fix: correct status bar rendering on narrow terminals`
   - `docs: update slash command documentation`
4. Push your branch to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```
5. Open a Pull Request against the `main` branch of `Veloxx-Labs/oceancode`.
6. Fill in the provided Pull Request template completely.

---

## Reporting Issues

If you encounter bugs, regressions, or unexpected behavior:
1. Search existing issues to verify that the bug has not already been reported.
2. Open a new issue using our Bug Report template.
3. Provide your operating system, Node.js version, OceanCode version, and relevant terminal logs.

Thank you for helping build OceanCode.
