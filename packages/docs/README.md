<div align="center">

# :fire: IGNIS - @venizia/ignis-docs

**Documentation site and MCP server for the Ignis Framework**

[![npm](https://img.shields.io/npm/v/@venizia/ignis-docs.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@venizia/ignis-docs)
[![License](https://img.shields.io/badge/License-MIT-3DA639.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-Compatible-8B5CF6.svg?style=flat-square)](https://modelcontextprotocol.io/)

VitePress-powered documentation site and an MCP server with 11 tools that gives AI assistants real-time access to Ignis knowledge -- search docs, browse source code, and verify dependencies.

[Installation](#installation) &#8226; [MCP Setup](#mcp-server-setup) &#8226; [Available Tools](#available-mcp-tools) &#8226; [Online Docs](https://venizia-ai.github.io/ignis)

</div>

---

## Highlights

| | Feature | |
| :---: | :--- | :--- |
| **1** | **11 MCP Tools** | Search docs, browse code, verify deps from any AI assistant |
| **2** | **Fuzzy Search** | Fuse.js-powered search across all documentation |
| **3** | **VitePress Site** | Full-featured docs with guides, API references, and tutorials |
| **4** | **CLI Binary** | Ships as `ignis-docs-mcp` for easy MCP integration |

---

## Features

- **VitePress Documentation Site** -- Full-featured docs with guides, API references, tutorials, and best practices
- **MCP Server** -- 11 tools for AI assistants to search docs, browse source code, and verify dependencies
- **Fuzzy Search** -- Fuse.js-powered search across all documentation (title weight 0.7, content weight 0.3)
- **GitHub Integration** -- Browse project files, search code, and verify dependency versions directly from AI tools
- **CLI Binary** -- Ships as `ignis-docs-mcp` for easy integration with Claude Desktop and other MCP-compatible clients

---

## Installation

```bash
bun add @venizia/ignis-docs
# or
npm install @venizia/ignis-docs
```

---

## MCP Server Setup

### Claude Desktop

Add to your Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "ignis-docs": {
      "command": "bunx",
      "args": ["@venizia/ignis-docs@latest"]
    }
  }
}
```

Alternatively, use `npx`:

```json
{
  "mcpServers": {
    "ignis-docs": {
      "command": "npx",
      "args": ["@venizia/ignis-docs@latest"]
    }
  }
}
```

### Claude Code

Add to your Claude Code MCP settings:

```json
{
  "mcpServers": {
    "ignis-docs": {
      "command": "bunx",
      "args": ["@venizia/ignis-docs@latest"]
    }
  }
}
```

---

## Available MCP Tools

### Documentation Tools

| Tool | Description |
| --- | --- |
| **searchDocs** | Search documentation by keyword with fuzzy matching |
| **getDocContent** | Get the full content of a specific document |
| **listDocs** | List all available documentation pages |
| **listCategories** | List documentation categories and their structure |
| **getDocMetadata** | Get metadata (title, path, category) for a document |
| **getPackageOverview** | Get an overview of a specific Ignis package |

### GitHub Tools

| Tool | Description |
| --- | --- |
| **searchCode** | Search the Ignis source code by keyword |
| **listProjectFiles** | List files in a specific directory of the repository |
| **viewSourceFile** | View the contents of a source file |
| **verifyDependencies** | Check dependency versions and compatibility |

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
│   ├── base/            # BaseApplication, BaseController, BaseEntity, etc.
│   ├── components/      # HealthCheck, Swagger, Auth, Mail, SocketIO, etc.
│   ├── helpers/         # Logger, Redis, Queue, Storage, Crypto, etc.
│   └── utilities/       # Parse, Date, Promise, Performance utilities
├── best-practices/      # Architecture, security, performance, code style
└── changelogs/          # Version release notes
```

### Online Documentation

[https://venizia-ai.github.io/ignis](https://venizia-ai.github.io/ignis)

---

## MCP Server Development

```bash
# Development mode
bun run mcp:dev

# Build MCP server
bun run mcp:build

# Start MCP server
bun run mcp:start

# Clean + rebuild
bun run mcp:rebuild
```

### Configuration

| Setting | Default | Description |
| --- | --- | --- |
| `snippetLength` | `320` | Max characters per search result snippet |
| `defaultLimit` | `10` | Default number of search results |
| `maxLimit` | `50` | Maximum number of search results |
| `searchThreshold` | `0.4` | Fuse.js fuzzy match threshold (0 = exact, 1 = loose) |
| `repo` | `VENIZIA-AI/ignis` | GitHub repository for source code tools |

---

## Related Links

- [Ignis Framework](https://github.com/VENIZIA-AI/ignis) -- Main repository
- [Online Documentation](https://venizia-ai.github.io/ignis) -- Full documentation site
- [MCP Server Guide](https://github.com/VENIZIA-AI/ignis/blob/main/packages/docs/wiki/get-started/mcp-docs-server.md) -- Detailed setup guide
- [Model Context Protocol](https://modelcontextprotocol.io/) -- MCP specification

---

## License

MIT
