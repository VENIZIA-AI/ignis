<div align="center">

# <img src="https://ignis.venizia.ai/logo.svg" alt="" height="32" align="top"> IGNIS - @venizia/ignis-docs

**Documentation site for the IGNIS Framework**

[![License](https://img.shields.io/badge/License-MIT-3DA639.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-3178C6.svg?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

[Online docs](https://ignis.venizia.ai) &#8226; [Quickstart](https://ignis.venizia.ai/guides/get-started/5-minute-quickstart) &#8226; [Changelog](https://ignis.venizia.ai/changelogs/)

</div>

---

The VitePress site at [ignis.venizia.ai](https://ignis.venizia.ai): guides, API references, extensions,
best practices and changelogs for IGNIS. It is built from `content/`, is not published to npm and is not
meant to be imported.

## Work on the site

```bash
bun run docs:dev       # dev server
bun run docs:build     # check the sidebar, then build the static site
bun run docs:preview   # serve the build
```

## Layout

| Folder | Holds |
| :--- | :--- |
| `content/guides/` | Getting started, core concepts, tutorials, migrations |
| `content/references/` | The API: base classes, configuration, utilities |
| `content/extensions/` | Components and helpers, one folder each |
| `content/best-practices/` | Architecture, security, performance, code style |
| `content/changelogs/` | One entry per change, newest first |
| `site/.vitepress/` | The site config (sidebar, nav, footer) and the theme |

The AI-assistant MCP server ships from VULCAN as `@venizia/vulcan-atlas`
(`bun x @venizia/vulcan-atlas mcp`); see the [Atlas page](https://ignis.venizia.ai/extensions/atlas/).
MIT licensed. Part of [IGNIS](https://github.com/VENIZIA-AI/ignis).

---

<p align="center">
  <a href="https://venizia.ai">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://venizia.ai/assets/logo-white.svg">
      <img src="https://venizia.ai/assets/logo.svg" alt="VENIZIA" height="28">
    </picture>
  </a>
  <br>
  <sub>IGNIS is built and maintained by <a href="https://venizia.ai">VENIZIA</a>.</sub>
</p>
