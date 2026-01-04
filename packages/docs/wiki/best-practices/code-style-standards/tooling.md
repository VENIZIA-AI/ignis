# Tooling Configuration

Ignis provides centralized development configurations via the `@venizia/dev-configs` package.

## Installation

```bash
bun add -d @venizia/dev-configs
```

This package provides:
- **ESLint rules** - Pre-configured for Node.js/TypeScript projects
- **Prettier settings** - Consistent formatting across all Ignis projects
- **TypeScript configs** - Shared base and common configurations

## Prettier Configuration

Automatic code formatting eliminates style debates.

**`.prettierrc.mjs`:**
```javascript
import { prettierConfigs } from '@venizia/dev-configs';

export default prettierConfigs;
```

**Default Settings:**

| Setting | Value | Description |
|---------|-------|-------------|
| `bracketSpacing` | `true` | `{ foo: bar }` |
| `singleQuote` | `false` | `"string"` (double quotes) |
| `printWidth` | `100` | Maximum line length |
| `trailingComma` | `'all'` | `[1, 2, 3,]` |
| `arrowParens` | `'avoid'` | `x => x` not `(x) => x` |
| `semi` | `true` | Semicolons required |

**Customization:**
```javascript
import { prettierConfigs } from '@venizia/dev-configs';

export default {
  ...prettierConfigs,
  printWidth: 120,  // Override specific settings
};
```

**Usage:**
```bash
bun run prettier:cli      # Check formatting
bun run prettier:fix      # Auto-fix
```

## ESLint Configuration

Prevents common errors and enforces best practices.

**`eslint.config.mjs`:**
```javascript
import { eslintConfigs } from '@venizia/dev-configs';

export default eslintConfigs;
```

**Includes:**
- Pre-configured rules for Node.js/TypeScript (via `@minimaltech/eslint-node`)
- Disables `@typescript-eslint/no-explicit-any` by default

**Customization:**
```javascript
import { eslintConfigs } from '@venizia/dev-configs';

export default [
  ...eslintConfigs,
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

## TypeScript Configuration

Use the centralized TypeScript configs:

**`tsconfig.json`:**
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

**What's Included:**

| Option | Value | Purpose |
|--------|-------|---------|
| `target` | `ES2022` | Modern JavaScript features |
| `experimentalDecorators` | `true` | Required for Ignis decorators |
| `emitDecoratorMetadata` | `true` | Metadata reflection for DI |
| `strict` | `true` | Strict type checking |
| `skipLibCheck` | `true` | Faster compilation |

See [`@venizia/dev-configs` documentation](../../references/src-details/dev-configs) for full details.

## IDE Integration

### VS Code

**Recommended Extensions:**
- ESLint (`dbaeumer.vscode-eslint`)
- Prettier (`esbenp.prettier-vscode`)

**`.vscode/settings.json`:**
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "typescript.preferences.importModuleSpecifier": "relative"
}
```

### WebStorm / IntelliJ

1. Go to **Settings → Languages & Frameworks → JavaScript → Prettier**
2. Enable "Run on save"
3. Go to **Settings → Languages & Frameworks → JavaScript → Code Quality Tools → ESLint**
4. Select "Automatic ESLint configuration"

## See Also

- [Naming Conventions](./naming-conventions) - File and class naming
- [Type Safety](./type-safety) - TypeScript best practices
- [@venizia/dev-configs Reference](../../references/src-details/dev-configs) - Full documentation
