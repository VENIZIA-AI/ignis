# Package: `@venizia/ignis-docs`

Documentation package housing guides, references, and MCP server for the Ignis framework.

## Quick Reference

**Package:** Documentation built with VitePress + MCP server for external tool integration.

### Main Components

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Wiki** | VitePress | Main documentation site (guides + references) |
| **MCP Server** | Model Context Protocol | External tool documentation discovery |

### Wiki Structure

| Section | Content |
|---------|---------|
| `guides/` | Tutorials, quickstart, core concepts, best practices |
| `references/` | API reference, components, helpers, base classes |
| `.vitepress/` | Site configuration and theme |

## Project Structure Overview

Top-level breakdown of the `packages/docs/` directory:

| Folder           | Purpose                                                                            |
| :--------------- | :--------------------------------------------------------------------------------- |
| **`mcp-server`** | Contains the Model Context Protocol (MCP) server implementation for documentation and code search. |
| **`wiki`**       | The main documentation content, built using VitePress.                             |

---

## Detailed Sections

### `mcp-server`

This directory contains the implementation of a Model Context Protocol (MCP) server, which allows external tools (AI assistants) to discover and read documentation resources, as well as search the source code.

| File/Folder | Purpose/Key Details |
| :---------- | :------------------ |
| `index.ts` | Server entry point, tool registration, and CLI argument parsing |
| `common/config.ts` | `MCPConfigs` class with server, GitHub, search, and Fuse.js settings |
| `common/paths.ts` | Path resolution for wiki directory |
| `helpers/docs.helper.ts` | `DocsHelper` for documentation loading, caching, and Fuse.js search |
| `helpers/github.helper.ts` | `GithubHelper` for GitHub API integration (code search, file fetching) |
| `helpers/logger.helper.ts` | Logging utilities |
| `tools/base.tool.ts` | Abstract `BaseTool` class for all MCP tools |
| `tools/docs/` | Documentation tools: `searchDocs`, `getDocContent`, `listDocs`, `listCategories`, `getDocMetadata`, `getPackageOverview` |
| `tools/github/` | Code/project tools: `searchCode`, `listProjectFiles`, `viewSourceFile`, `verifyDependencies` |

For detailed MCP server documentation, see [MCP Server Deep Dive](./mcp-server.md).

### `wiki`

This directory holds the actual documentation content and the VitePress configuration for building the documentation website.

| File/Folder             | Purpose/Key Details                                                                                                            |
| :---------------------- | :----------------------------------------------------------------------------------------------------------------------------- |
| `.vitepress/`           | VitePress-specific configuration and theme files.                                                                              |
| `.vitepress/config.mts` | The main configuration file for VitePress, defining the documentation's title, description, navigation, and sidebar structure. |
| `.vitepress/theme/`     | Custom theme files for the VitePress documentation.                                                                            |
| `guides/`          | Guides and tutorials for getting started with `Ignis`.                                                                           |
| `references/`           | Detailed reference documentation for various aspects of the framework.                                                         |
| `index.md`              | The homepage content for the documentation site.                                                                               |
| `logo.svg`              | The logo used in the documentation.                                                                                            |

---

This detailed breakdown illustrates the modular and layered design of the `Ignis` framework, emphasizing its extensibility and adherence to robust architectural patterns.
