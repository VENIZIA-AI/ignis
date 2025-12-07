# Package: `@vez/ignis-docs`

## Documentation Package Directory: Detailed Breakdown

The `@vez/ignis-docs` package is responsible for housing all documentation related to the Ignis framework, including guides, references, and an MCP (Model Context Protocol) server for documentation discovery.

## Project Structure Overview

Here's the top-level breakdown of the `@packages/docs/` directory:

| Folder     | Purpose                                                                            |
| :--------- | :--------------------------------------------------------------------------------- |
| **`mcp`**  | Contains the Model Context Protocol (MCP) server implementation for documentation. |
| **`wiki`** | The main documentation content, built using VitePress.                             |

---

## Detailed Sections

### `mcp`

This directory contains the implementation of a Model Context Protocol (MCP) server, which allows external tools to discover and read documentation resources.

| File/Folder | Purpose/Key Details                                                                                                                                                              |
| :---------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server.ts` | The entry point for the MCP server, responsible for initializing and serving documentation resources via the MCP. It uses `glob` to find markdown files in the `wiki` directory. |

### `wiki`

This directory holds the actual documentation content and the VitePress configuration for building the documentation website.

| File/Folder             | Purpose/Key Details                                                                                                            |
| :---------------------- | :----------------------------------------------------------------------------------------------------------------------------- |
| `.vitepress/`           | VitePress-specific configuration and theme files.                                                                              |
| `.vitepress/config.mts` | The main configuration file for VitePress, defining the documentation's title, description, navigation, and sidebar structure. |
| `.vitepress/theme/`     | Custom theme files for the VitePress documentation.                                                                            |
| `get-started/`          | Guides and tutorials for getting started with Ignis.                                                                           |
| `references/`           | Detailed reference documentation for various aspects of the framework.                                                         |
| `index.md`              | The homepage content for the documentation site.                                                                               |
| `logo.svg`              | The logo used in the documentation.                                                                                            |

---

This detailed breakdown illustrates the modular and layered design of the Ignis framework, emphasizing its extensibility and adherence to robust architectural patterns.
