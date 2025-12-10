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
| `get-started/` | Tutorials, quickstart, core concepts, best practices |
| `references/` | API reference, components, helpers, base classes |
| `.vitepress/` | Site configuration and theme |

## Project Structure Overview

Top-level breakdown of the `@packages/docs/` directory:

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


### `wiki`

This directory holds the actual documentation content and the VitePress configuration for building the documentation website.

| File/Folder             | Purpose/Key Details                                                                                                            |
| :---------------------- | :----------------------------------------------------------------------------------------------------------------------------- |
| `.vitepress/`           | VitePress-specific configuration and theme files.                                                                              |
| `.vitepress/config.mts` | The main configuration file for VitePress, defining the documentation's title, description, navigation, and sidebar structure. |
| `.vitepress/theme/`     | Custom theme files for the VitePress documentation.                                                                            |
| `get-started/`          | Guides and tutorials for getting started with `Ignis`.                                                                           |
| `references/`           | Detailed reference documentation for various aspects of the framework.                                                         |
| `index.md`              | The homepage content for the documentation site.                                                                               |
| `logo.svg`              | The logo used in the documentation.                                                                                            |

---

This detailed breakdown illustrates the modular and layered design of the `Ignis` framework, emphasizing its extensibility and adherence to robust architectural patterns.
