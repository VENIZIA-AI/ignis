# Guide: Setting Up Your Project

This guide will walk you through setting up the development environment for your Ignis project, including linting, formatting, and TypeScript configurations.

## 1. Install Development Dependencies

Install the necessary development packages for maintaining code quality and consistency.

```bash
bun add -d eslint prettier typescript @minimaltech/eslint-node
```

## 2. Set Up TypeScript

Create a `tsconfig.json` file in your project's root with the following content. This configuration is optimized for a modern Node.js/Bun environment with decorators and path aliases.

```json
{
  "$schema": "http://json.schemastore.org/tsconfig",
  "extends": "@vez/ignis/configs/tsconfig.common.json",
  "compilerOptions": {
    "target": "ES2022",
    "outDir": "dist",
    "rootDir": "src",
    "baseUrl": "src",
    "paths": {
      "@/*": ["./*"]
    },
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "importHelpers": false,
    "esModuleInterop": true,
    "module": "nodenext",
    "moduleResolution": "nodenext"
  },
  "include": ["src", "./*.config.*", ".prettierrc.*"],
  "exclude": ["node_modules", "dist"]
}
```

## 3. Set Up Prettier

Create the following files in your project's root to configure Prettier for code formatting.

### `.prettierrc.mjs`

```javascript
const config = {
  bracketSpacing: true,
  singleQuote: true,
  printWidth: 90,
  trailingComma: 'all',
  arrowParens: 'avoid',
  semi: true,
};

export default config;
```

### `.prettierignore`

```
dist
*.json
```

## 4. Set Up ESLint

Create an `eslint.config.mjs` file in your project's root to configure ESLint. This setup uses `@minimaltech/eslint-node` for a robust set of rules for Node.js projects.

```javascript
import minimaltechLinter from '@minimaltech/eslint-node';

const configs = [
  ...minimaltechLinter,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];

export default configs;
```
