# @venizia/ignis-docs

[![npm version](https://img.shields.io/npm/v/@venizia/ignis-docs.svg)](https://www.npmjs.com/package/@venizia/ignis-docs)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Documentation and **MCP (Model Context Protocol) Server** for the **Ignis Framework**. The MCP server allows AI assistants to access Ignis documentation in real-time.

## Installation

```bash
bun add @venizia/ignis-docs
# or
npm install @venizia/ignis-docs
```

## MCP Server Usage

Add to your Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "ignis-docs": {
      "command": "npx",
      "args": ["@venizia/ignis-docs"]
    }
  }
}
```

## Available MCP Tools

| Tool | Description |
|------|-------------|
| **search** | Search documentation by keyword |
| **getDocContent** | Get full content of a document |
| **listDocs** | List all available documents |
| **listCategories** | List documentation categories |
| **getDocMetadata** | Get document metadata |

## About Ignis

Ignis brings together the structured, enterprise development experience of **LoopBack 4** with the blazing speed and simplicity of **Hono** - giving you the best of both worlds.

## Documentation

- [Ignis Repository](https://github.com/venizia-ai/ignis)
- [MCP Server Guide](https://github.com/venizia-ai/ignis/blob/main/packages/docs/wiki/get-started/mcp-docs-server.md)
- [Main Documentation](https://github.com/venizia-ai/ignis/blob/main/packages/docs/wiki/index.md)

## License

MIT
