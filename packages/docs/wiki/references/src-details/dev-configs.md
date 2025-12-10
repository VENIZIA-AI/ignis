# Package: `@vez/dev-configs`

## Overview

The `@vez/dev-configs` package provides centralized, shared development configurations for all packages in the Venizia/Ignis monorepo. This ensures consistent code style, linting rules, and TypeScript configurations across the entire project.

## Package Information

| Property | Value |
|----------|-------|
| **Package Name** | `@vez/dev-configs` |
| **Location** | `packages/dev-configs/` |
| **Purpose** | Centralized development configurations |
| **Dependencies** | `@minimaltech/eslint-node` |

## Exports

| Export Path | Type | Description |
|-------------|------|-------------|
| `@vez/dev-configs` | Module | Main entry (eslintConfig, prettierConfig) |
| `@vez/dev-configs/eslint` | Module | ESLint configuration array |
| `@vez/dev-configs/prettier` | Module | Prettier configuration object |
| `@vez/dev-configs/tsconfig.base.json` | JSON | Base TypeScript configuration |
| `@vez/dev-configs/tsconfig.common.json` | JSON | Common TypeScript config for packages |
| `@vez/dev-configs/prettierignore` | File | Prettier ignore patterns |

---

## ESLint Configuration

### Usage

Create an `eslint.config.mjs` file in your package:

```javascript
import configs from '@vez/dev-configs/eslint';

export default configs;
```

### Extending the Config

To add package-specific rules:

```javascript
import baseConfigs from '@vez/dev-configs/eslint';

const configs = [
  ...baseConfigs,
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
import config from '@vez/dev-configs/prettier';

export default config;
```

### Configuration Options

| Option | Value | Description |
|--------|-------|-------------|
| `bracketSpacing` | `true` | Spaces inside object braces: `{ foo: bar }` |
| `singleQuote` | `true` | Use single quotes instead of double |
| `printWidth` | `100` | Maximum line width |
| `tabWidth` | `2` | Spaces per indentation level |
| `trailingComma` | `'all'` | Trailing commas everywhere possible |
| `arrowParens` | `'avoid'` | Omit parens for single arrow function params |
| `semi` | `true` | Add semicolons at statement ends |

### Prettier Ignore

Copy or symlink the prettierignore file:

```bash
# In your package directory
cp node_modules/@vez/dev-configs/prettier/.prettierignore .prettierignore
```

Default ignored patterns:
- `dist` - Build output
- `examples` - Example code
- `node_modules` - Dependencies
- `coverage` - Test coverage
- `build` - Alternative build output
- `*.min.js` - Minified JavaScript
- `*.min.css` - Minified CSS

---

## TypeScript Configuration

### Base Configuration (`tsconfig.base.json`)

The base configuration includes all compiler options suitable for Node.js/Bun TypeScript projects.

#### Usage

```json
{
  "$schema": "http://json.schemastore.org/tsconfig",
  "extends": "@vez/dev-configs/tsconfig.base.json",
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
  "extends": "@vez/dev-configs/tsconfig.common.json",
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

---

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

---

## Integration Guide

### Adding to a New Package

1. Add the dependency to your `package.json`:

```json
{
  "devDependencies": {
    "@vez/dev-configs": "workspace:*",
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
  "extends": "@vez/dev-configs/tsconfig.common.json",
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
import configs from '@vez/dev-configs/eslint';
export default configs;
```

**`.prettierrc.mjs`:**
```javascript
import config from '@vez/dev-configs/prettier';
export default config;
```

3. Add lint scripts to `package.json`:

```json
{
  "scripts": {
    "eslint": "eslint --report-unused-disable-directives .",
    "lint": "bun run eslint && bun run prettier:cli",
    "lint:fix": "bun run eslint --fix && bun run prettier:fix",
    "prettier:cli": "prettier \"**/*.{js,ts}\" -l",
    "prettier:fix": "bun run prettier:cli --write"
  }
}
```

---

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
