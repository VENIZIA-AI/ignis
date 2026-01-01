# Framework Internals

Deep dive into Ignis package structure and source code organization.

## Quick Reference

| Package | npm | Purpose |
|---------|-----|---------|
| `@venizia/ignis` | Core | Main framework with controllers, repositories, components |
| `@venizia/ignis-boot` | Boot | Auto-discovery and bootstrapping utilities |
| `@venizia/ignis-helpers` | Helpers | Reusable utilities (logger, crypto, redis, etc.) |
| `@venizia/ignis-inversion` | Inversion | Standalone dependency injection container |
| `@venizia/dev-configs` | Dev Configs | TypeScript, ESLint, Prettier configurations |
| `@venizia/ignis-docs` | Docs | Documentation site and MCP server |

## Monorepo Structure

```
ignis/
├── packages/
│   ├── core/           → @venizia/ignis (main framework)
│   ├── boot/           → @venizia/ignis-boot (auto-discovery)
│   ├── helpers/        → @venizia/ignis-helpers (utilities)
│   ├── inversion/      → @venizia/ignis-inversion (DI container)
│   ├── dev-configs/    → @venizia/dev-configs (linting/formatting)
│   └── docs/           → @venizia/ignis-docs (documentation)
├── examples/           → Example applications
└── scripts/            → Build and maintenance scripts
```

## Package Dependencies

```
┌─────────────────────────────────────────────────────────┐
│                    @venizia/ignis                        │
│                   (Core Framework)                       │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ base/        │  │ components/  │  │ utilities/   │  │
│  │ (Controllers,│  │ (Auth, Swagger,│ │ (Crypto,     │  │
│  │  Repos, etc.)│  │  HealthCheck) │ │  Date, etc.) │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │ depends on
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
┌────────────────┐ ┌────────────┐ ┌────────────────┐
│ @vez/ignis-boot│ │@vez/ignis- │ │ @vez/ignis-    │
│ (Auto-Discovery)│ │  helpers   │ │  inversion     │
│                │ │ (Logger,   │ │ (DI Container) │
│                │ │  Redis,etc)│ │                │
└────────────────┘ └─────┬──────┘ └────────────────┘
                         │ depends on
                         ▼
               ┌─────────────────────┐
               │ @vez/ignis-inversion│
               │   (Standalone DI)   │
               └─────────────────────┘
```

## What's in This Section

### Core Package
- [Core (@venizia/ignis)](./core.md) - Main framework with base classes, components, and utilities

### Supporting Packages
- [Boot (@venizia/ignis-boot)](./boot.md) - Automatic artifact discovery and registration
- [Helpers (@venizia/ignis-helpers)](./helpers.md) - Reusable helper classes (logger, crypto, redis, etc.)
- [Inversion (@venizia/ignis-inversion)](./inversion.md) - Standalone dependency injection container

### Development Tools
- [Dev Configs (@venizia/dev-configs)](./dev-configs.md) - Shared TypeScript, ESLint, Prettier configs
- [Documentation (@venizia/ignis-docs)](./docs.md) - VitePress site and wiki structure
- [MCP Docs Server](./mcp-server.md) - Model Context Protocol server for AI-assisted development

## Package Purposes

| Package | When to Use |
|---------|-------------|
| **@venizia/ignis** | Building Ignis applications (always needed) |
| **@venizia/ignis-boot** | Auto-discovery of controllers, services, repositories |
| **@venizia/ignis-helpers** | Standalone utilities without full framework |
| **@venizia/ignis-inversion** | DI container without framework dependencies |
| **@venizia/dev-configs** | Consistent dev tooling across projects |

> **Related:** [Core Concepts Guide](../../guides/core-concepts/application/) | [Base Abstractions Reference](../base/)
