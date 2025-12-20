# @venizia/ignis-boot

[![npm version](https://img.shields.io/npm/v/@venizia/ignis-boot.svg)](https://www.npmjs.com/package/@venizia/ignis-boot)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An **automated bootstrapping system** for the **Ignis Framework** - provides artifact auto-discovery and loading during application startup.

## Installation

```bash
bun add @venizia/ignis-boot
# or
npm install @venizia/ignis-boot
```

## Quick Example

```typescript
import { BaseApplication, IApplicationConfigs } from "@venizia/ignis";
import { IBootOptions } from "@venizia/ignis-boot";

// Configure auto-discovery
export const appConfigs: IApplicationConfigs = {
  name: "MyApp",
  bootOptions: {
    controllers: { dirs: ["controllers"], isNested: true },
    services: { dirs: ["services"], isNested: true },
    repositories: { dirs: ["repositories"] },
    datasources: { dirs: ["datasources"] },
  },
};

export class Application extends BaseApplication {
  constructor() {
    super(appConfigs);
    // That's it! All artifacts are auto-discovered and registered
  }
}
```

## Features

| Feature | Description |
|---------|-------------|
| **Auto-Discovery** | Automatically finds controllers, services, repositories, and datasources |
| **Convention-Based** | Follow naming patterns (`.controller.js`, `.service.js`, etc.) |
| **Three-Phase Boot** | Configure → Discover → Load lifecycle |
| **Customizable** | Configure directories, extensions, and glob patterns |
| **Extensible** | Create custom booters for new artifact types |

## Built-in Booters

| Booter | Default Directory | Default Extension |
|--------|-------------------|-------------------|
| **ControllerBooter** | `controllers/` | `.controller.js` |
| **ServiceBooter** | `services/` | `.service.js` |
| **RepositoryBooter** | `repositories/` | `.repository.js` |
| **DatasourceBooter** | `datasources/` | `.datasource.js` |

## About Ignis

Ignis brings together the structured, enterprise development experience of **LoopBack 4** with the blazing speed and simplicity of **Hono** - giving you the best of both worlds.

## Documentation

- [Ignis Repository](https://github.com/venizia-ai/ignis)
- [Getting Started](https://github.com/venizia-ai/ignis/blob/main/packages/docs/wiki/get-started/index.md)
- [Bootstrapping Guide](https://github.com/venizia-ai/ignis/blob/main/packages/docs/wiki/get-started/core-concepts/bootstrapping.md)
- [Boot Package Reference](https://github.com/venizia-ai/ignis/blob/main/packages/docs/wiki/references/src-details/boot.md)

## License

MIT
