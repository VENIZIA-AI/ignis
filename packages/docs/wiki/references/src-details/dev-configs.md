# Package: `@venizia/dev-configs`

## Overview

The `@venizia/dev-configs` package provides centralized, shared development configurations for all packages in the Venizia/Ignis monorepo. This ensures consistent code style, linting rules, and TypeScript configurations across the entire project.

## Package Information

| Property | Value |
|----------|-------|
| **Package Name** | `@venizia/dev-configs` |
| **Location** | `packages/dev-configs/` |
| **Purpose** | Centralized development configurations |
| **Dependencies** | `@minimaltech/eslint-node` |

## Exports

| Export Path | Type | Description |
|-------------|------|-------------|
| `@venizia/dev-configs` | Module | Named exports: `eslintConfigs`, `prettierConfigs` |
| `@venizia/dev-configs/tsconfig.base.json` | JSON | Base TypeScript configuration |
| `@venizia/dev-configs/tsconfig.common.json` | JSON | Common TypeScript config for packages |

### Named Exports

```typescript
import { eslintConfigs, prettierConfigs } from '@venizia/dev-configs';
```

- **`eslintConfigs`**: `Linter.Config[]` - ESLint flat config array
- **`prettierConfigs`**: `Config` - Prettier configuration object

---

## ESLint Configuration

### Usage

Create an `eslint.config.mjs` file in your package:

```javascript
import { eslintConfigs } from '@venizia/dev-configs';

export default eslintConfigs;
```

### Extending the Config

To add package-specific rules:

```javascript
import { eslintConfigs } from '@venizia/dev-configs';

const configs = [
  ...eslintConfigs,
  {
    // Add custom ignores
    ignores: ['custom-folder/**'],
  },
  {
    // Add custom rules
    rules: {
      'no-console': 'warn',
    },
  },
];

export default configs;
```

### Included Rules

| Rule | Setting | Description |
|------|---------|-------------|
| `@typescript-eslint/no-explicit-any` | `off` | Allows `any` type usage |
| *Base rules* | *inherited* | All rules from `@minimaltech/eslint-node` |

---

## Prettier Configuration

### Usage

Create a `.prettierrc.mjs` file in your package:

```javascript
import { prettierConfigs } from '@venizia/dev-configs';

export default prettierConfigs;
```

### Configuration Options

| Option | Value | Description |
|--------|-------|-------------|
| `bracketSpacing` | `true` | Spaces inside object braces: `{ foo: bar }` |
| `singleQuote` | `false` | Use double quotes (changed from single) |
| `printWidth` | `100` | Maximum line width |
| `tabWidth` | `2` | Spaces per indentation level |
| `trailingComma` | `'all'` | Trailing commas everywhere possible |
| `arrowParens` | `'avoid'` | Omit parens for single arrow function params |
| `semi` | `true` | Add semicolons at statement ends |

### Prettier Ignore

Create a `.prettierignore` file in your package:

```
dist
node_modules
*.log
.*-audit.json
```

Recommended ignore patterns:
- `dist` - Build output
- `node_modules` - Dependencies
- `*.log` - Log files
- `.*-audit.json` - Audit files
- `coverage` - Test coverage (if applicable)
- `*.min.js` - Minified files (if applicable)


## TypeScript Configuration

### Base Configuration (`tsconfig.base.json`)

The base configuration includes all compiler options suitable for Node.js/Bun TypeScript projects.

#### Usage

```json
{
  "$schema": "http://json.schemastore.org/tsconfig",
  "extends": "@venizia/dev-configs/tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

#### Compiler Options Summary

| Category | Options |
|----------|---------|
| **Target** | ES2022, lib: ES2022 |
| **Modules** | Node16, resolveJsonModule, esModuleInterop |
| **Decorators** | experimentalDecorators, emitDecoratorMetadata |
| **Emit** | declaration, declarationMap, sourceMap |
| **Strict** | strict (with selective relaxations) |
| **Performance** | incremental, skipLibCheck |

#### Strict Mode Configuration

| Option | Value | Rationale |
|--------|-------|-----------|
| `strict` | `true` | Enable all strict checks |
| `noImplicitAny` | `false` | Allow implicit any for flexibility |
| `strictNullChecks` | `true` | Enforce null safety |
| `strictPropertyInitialization` | `false` | Allow uninitialized properties (for DI) |
| `useUnknownInCatchVariables` | `false` | Use `any` in catch blocks |

### Common Configuration (`tsconfig.common.json`)

Extends the base config with settings for standard packages:

```json
{
  "$schema": "http://json.schemastore.org/tsconfig",
  "extends": "@venizia/dev-configs/tsconfig.common.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "baseUrl": "src",
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

**Note:** Path-related options (`outDir`, `rootDir`, `baseUrl`, `paths`, `include`, `exclude`) must be defined in each package's tsconfig.json as they are resolved relative to the config file location.


## Project Structure

```
packages/dev-configs/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          # Re-exports all configs
│   ├── eslint.ts         # ESLint configuration
│   └── prettier.ts       # Prettier configuration
├── tsconfig/
│   ├── tsconfig.base.json    # Base TypeScript config
│   └── tsconfig.common.json  # Common package config
├── prettier/
│   └── .prettierignore   # Prettier ignore patterns
├── scripts/
│   ├── build.sh
│   ├── clean.sh
│   └── rebuild.sh
└── dist/                 # Built output
    ├── index.js / .d.ts
    ├── eslint.js / .d.ts
    └── prettier.js / .d.ts
```


## Integration Guide

### Adding to a New Package

1. Add the dependency to your `package.json`:

```json
{
  "devDependencies": {
    "@venizia/dev-configs": "latest",
    "eslint": "^9.36.0",
    "prettier": "^3.6.2",
    "typescript": "^5.9.3"
  }
}
```

2. Create configuration files:

**`tsconfig.json`:**
```json
{
  "$schema": "http://json.schemastore.org/tsconfig",
  "extends": "@venizia/dev-configs/tsconfig.common.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "baseUrl": "src",
    "paths": { "@/*": ["./*"] }
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

**`eslint.config.mjs`:**
```javascript
import { eslintConfigs } from '@venizia/dev-configs';

export default eslintConfigs;
```

**`.prettierrc.mjs`:**
```javascript
import { prettierConfigs } from '@venizia/dev-configs';

export default prettierConfigs;
```

**`.prettierignore`:**
```
dist
node_modules
*.log
.*-audit.json
```

3. Add lint scripts to `package.json`:

```json
{
  "scripts": {
    "lint": "eslint --report-unused-disable-directives . && prettier \"**/*.{js,ts}\" -l",
    "lint:fix": "eslint --report-unused-disable-directives . --fix && prettier \"**/*.{js,ts}\" --write"
  }
}
```


## Building the Package

```bash
cd packages/dev-configs

# Build
bun run build

# Clean
bun run clean

# Rebuild (clean + build)
bun run rebuild
```
