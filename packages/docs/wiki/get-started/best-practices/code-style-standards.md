# Code Style Standards

Maintain consistent code style using **Prettier** (formatting) and **ESLint** (code quality).

## Prettier Configuration

Automatic code formatting eliminates style debates.

**`.prettierrc.mjs`:**
```javascript
const config = {
  bracketSpacing: true,    // { foo: bar }
  singleQuote: true,       // 'string' not "string"
  printWidth: 90,          // Line length
  trailingComma: 'all',    // [1, 2, 3,]
  arrowParens: 'avoid',    // x => x (not (x) => x)
  semi: true,              // Semicolons required
};

export default config;
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
import minimaltechLinter from '@minimaltech/eslint-node';

const configs = [
  ...minimaltechLinter,  // Pre-configured rules for Node.js/TypeScript
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',  // Allow 'any' type
    },
  },
];

export default configs;
```

**Usage:**
```bash
bun run eslint           # Check for issues
bun run eslint --fix     # Auto-fix issues
bun run lint:fix         # Run both ESLint + Prettier
```

**Pre-commit Hook:** Add ESLint to your pre-commit hooks to catch issues before committing.