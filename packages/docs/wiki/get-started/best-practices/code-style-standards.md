# Code Style Standards

Maintain consistent code style using **Prettier** (formatting) and **ESLint** (code quality). Ignis provides centralized configurations via the `@venizia/dev-configs` package.

## Using @venizia/dev-configs

Install the centralized development configurations:

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
- `bracketSpacing: true` - `{ foo: bar }`
- `singleQuote: false` - `"string"` (double quotes)
- `printWidth: 100` - Maximum line length
- `trailingComma: 'all'` - `[1, 2, 3,]`
- `arrowParens: 'avoid'` - `x => x` not `(x) => x`
- `semi: true` - Semicolons required

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

**IDE Integration:** Configure your editor to format on save.

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

**Pre-commit Hook:** Add ESLint to your pre-commit hooks to catch issues before committing.

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
- `target: ES2022` - Modern JavaScript features
- `experimentalDecorators: true` - Required for Ignis decorators
- `emitDecoratorMetadata: true` - Metadata reflection for DI
- `strict: true` - Strict type checking with selective relaxations
- `skipLibCheck: true` - Faster compilation

See [`@venizia/dev-configs` documentation](../../references/src-details/dev-configs.md) for full details.

## Environment Variables Management

Avoid using `process.env` directly in your business logic. Instead, use the `applicationEnvironment` helper and define your keys as constants. This ensures type safety and centralized management.

**Define Keys (`src/common/environments.ts`):**
```typescript
export class EnvironmentKeys {
  static readonly APP_ENV_STRIPE_KEY = 'APP_ENV_STRIPE_KEY';
  static readonly APP_ENV_MAX_RETRIES = 'APP_ENV_MAX_RETRIES';
}
```

**Usage:**
```typescript
import { applicationEnvironment } from '@venizia/ignis';
import { EnvironmentKeys } from '@/common/environments';

// Correct usage
const stripeKey = applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_STRIPE_KEY);
const retries = applicationEnvironment.get<number>(EnvironmentKeys.APP_ENV_MAX_RETRIES);
```

## Standardized Error Handling

Use the `getError` helper and `HTTP` constants to throw consistent, formatted exceptions that the framework's error handler can process correctly.

**Example:**
```typescript
import { getError, HTTP } from '@venizia/ignis';

if (!record) {
  throw getError({
    statusCode: HTTP.ResultCodes.RS_4.NotFound,
    message: 'Record not found',
    // Optional details
    details: { id: requestedId }
  });
}
```

