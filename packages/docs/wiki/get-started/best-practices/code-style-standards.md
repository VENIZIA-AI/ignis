# Code Style Standards

Maintain consistent code style using **Prettier** (formatting) and **ESLint** (code quality). Ignis provides centralized configurations via the `@vez/dev-configs` package.

## Using @vez/dev-configs

Install the centralized development configurations:

```bash
bun add -d @vez/dev-configs
```

This package provides:
- **ESLint rules** - Pre-configured for Node.js/TypeScript projects
- **Prettier settings** - Consistent formatting across all Ignis projects
- **TypeScript configs** - Shared base and common configurations

## Prettier Configuration

Automatic code formatting eliminates style debates.

**`.prettierrc.mjs`:**
```javascript
import config from '@vez/dev-configs/prettier';
export default config;
```

**Default Settings:**
- `bracketSpacing: true` - `{ foo: bar }`
- `singleQuote: true` - `'string'` not `"string"`
- `printWidth: 100` - Maximum line length
- `trailingComma: 'all'` - `[1, 2, 3,]`
- `arrowParens: 'avoid'` - `x => x` not `(x) => x`
- `semi: true` - Semicolons required

**Customization:**
```javascript
import baseConfig from '@vez/dev-configs/prettier';

export default {
  ...baseConfig,
  printWidth: 120,  // Override specific settings
};
```

**Usage:**
```bash
bun run prettier:cli      # Check formatting
bun run prettier:fix      # Auto-fix
```

**IDE Integration:** Configure your editor to format on save.

## ESLint Configuration

Prevents common errors and enforces best practices.

**`eslint.config.mjs`:**
```javascript
import configs from '@vez/dev-configs/eslint';
export default configs;
```

**Includes:**
- Pre-configured rules for Node.js/TypeScript (via `@minimaltech/eslint-node`)
- Disables `@typescript-eslint/no-explicit-any` by default

**Customization:**
```javascript
import baseConfigs from '@vez/dev-configs/eslint';

export default [
  ...baseConfigs,
  {
    rules: {
      'no-console': 'warn',  // Add project-specific rules
    },
  },
];
```

**Usage:**
```bash
bun run eslint           # Check for issues
bun run eslint --fix     # Auto-fix issues
bun run lint:fix         # Run both ESLint + Prettier
```

**Pre-commit Hook:** Add ESLint to your pre-commit hooks to catch issues before committing.

## TypeScript Configuration

Use the centralized TypeScript configs:

**`tsconfig.json`:**
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

**What's Included:**
- `target: ES2022` - Modern JavaScript features
- `experimentalDecorators: true` - Required for Ignis decorators
- `emitDecoratorMetadata: true` - Metadata reflection for DI
- `strict: true` - Strict type checking with selective relaxations
- `skipLibCheck: true` - Faster compilation

See [`@vez/dev-configs` documentation](../../references/src-details/dev-configs.md) for full details.