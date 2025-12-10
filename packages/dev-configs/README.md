# @venizia/dev-configs

[![npm version](https://img.shields.io/npm/v/@venizia/dev-configs.svg)](https://www.npmjs.com/package/@venizia/dev-configs)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Shared development configurations for the **Ignis Framework** - includes ESLint, Prettier, and TypeScript settings.

## Installation

```bash
bun add -d @venizia/dev-configs
# or
npm install -D @venizia/dev-configs
```

## Usage

### ESLint (`eslint.config.mjs`)

```javascript
import { eslintConfigs } from "@venizia/dev-configs";

export default eslintConfigs;
```

### Prettier (`.prettierrc.mjs`)

```javascript
import { prettierConfigs } from "@venizia/dev-configs";

export default prettierConfigs;
```

### TypeScript (`tsconfig.json`)

```json
{
  "extends": "@venizia/dev-configs/tsconfig.common.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  }
}
```

## About Ignis

Ignis brings together the structured, enterprise development experience of **LoopBack 4** with the blazing speed and simplicity of **Hono** - giving you the best of both worlds.

## Documentation

- [Ignis Repository](https://github.com/venizia-ai/ignis)
- [Getting Started](https://github.com/venizia-ai/ignis/blob/main/packages/docs/wiki/get-started/index.md)
- [Code Style Standards](https://github.com/venizia-ai/ignis/blob/main/packages/docs/wiki/get-started/best-practices/code-style-standards.md)

## License

MIT
