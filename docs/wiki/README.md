<div align="center">

# :fire: IGNIS - @venizia/ignis-docs

**Documentation site for the IGNIS Framework**

[![npm](https://img.shields.io/npm/v/@venizia/ignis-docs.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@venizia/ignis-docs)
[![License](https://img.shields.io/badge/License-MIT-3DA639.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-3178C6.svg?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

VitePress-powered documentation site with guides, API references, and best practices for the IGNIS Framework.

[Installation](#installation) &#8226; [MCP Server](#mcp-server) &#8226; [Online Docs](https://ignis.venizia.ai)

</div>

---

## Highlights

| | Feature | |
| :---: | :--- | :--- |
| **1** | **VitePress Site** | Full-featured docs with guides, API references, and tutorials |

---

## Features

- **VitePress Documentation Site** - Full-featured docs with guides, API references, tutorials, and best practices

---

## Installation

```bash
bun add @venizia/ignis-docs
# or
npm install @venizia/ignis-docs
```

---

## MCP Server

The MCP server for AI assistants moved to `@venizia/ignis-atlas`.

```bash
bunx @venizia/ignis-atlas mcp
```

See the [migration changelog](https://ignis.venizia.ai/changelogs/2026-09-06-ignis-atlas) for what changed.

---

## Documentation Site

### Development

```bash
# Start dev server
bun run docs:dev

# Build static site
bun run docs:build

# Preview production build
bun run docs:preview
```

### Structure

```
wiki/
├── guides/              # Getting started, core concepts, tutorials
├── references/          # API documentation
│   ├── base/            # BaseApplication, BaseRestController, BaseEntity, etc.
│   ├── components/      # HealthCheck, Swagger, Auth, Mail, SocketIO, etc.
│   ├── helpers/         # Logger, Redis, Queue, Storage, Crypto, etc.
│   └── utilities/       # Parse, Date, Promise, Performance utilities
├── best-practices/      # Architecture, security, performance, code style
└── changelogs/          # Version release notes
```

### Online Documentation

[https://ignis.venizia.ai](https://ignis.venizia.ai)

---

## Related Links

- [IGNIS Framework](https://github.com/VENIZIA-AI/ignis) - Main repository
- [Online Documentation](https://ignis.venizia.ai) - Full documentation site
- [Model Context Protocol](https://modelcontextprotocol.io/) - MCP specification

---

## License

MIT
