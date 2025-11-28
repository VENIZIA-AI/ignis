# Quickstart Guide

This guide provides a comprehensive walkthrough for creating a new web application using the Ignis framework and setting up a professional development environment.

## 1. Initialize Your Project

Start by creating a new directory for your project and initializing it with Bun (or your preferred package manager like npm or yarn).

```bash
mkdir my-app
cd my-app
bun init
```

This will create a `package.json` file.

## 2. Install Dependencies

### Production Dependencies

Install the core framework and essential libraries for building your application.

```bash
bun add hono @vez/ignis dotenv-flow drizzle-orm pg lodash
```

- **`hono`**: The underlying high-performance web framework.
- **`@vez/ignis`**: The core Ignis framework.
- **`dotenv-flow`**: For managing environment variables.
- **`drizzle-orm` & `pg`**: For database access using Drizzle ORM with PostgreSQL.
- **`lodash`**: A utility library for common programming tasks.

### Development Dependencies

Install packages for TypeScript, linting, formatting, and database migrations.

```bash
bun add -d typescript @types/bun @types/lodash @types/pg eslint prettier @minimaltech/eslint-node drizzle-kit tsc-alias tsconfig-paths
```

## 3. Configure Your Development Environment

### TypeScript (`tsconfig.json`)

Create a `tsconfig.json` file in your project's root. This configuration is optimized for a modern Node.js/Bun environment with decorators and path aliases.

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

### Prettier (`.prettierrc.mjs` & `.prettierignore`)

Create the following files for consistent code formatting.

**`.prettierrc.mjs`**:

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

**`.prettierignore`**:

```
dist
*.json
```

### ESLint (`eslint.config.mjs`)

Create an `eslint.config.mjs` file for code linting. This setup uses `@minimaltech/eslint-node` for a robust set of rules.

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

## 4. Build Your First Application

### Application Structure

Create the following directory structure inside your `src` folder:

```
src/
├── application.ts
├── index.ts
└── controllers/
    └── hello.controller.ts
```

### `src/application.ts`

This is the main class for your application. It extends `BaseApplication` and is where you register your controllers, components, and other resources.

```typescript
import { BaseApplication, IApplicationConfigs, IApplicationInfo, ValueOrPromise } from '@vez/ignis';
import { HelloController } from './controllers/hello.controller';
import packageJson from '../package.json';

// Define application configurations
export const appConfigs: IApplicationConfigs = {
  host: process.env.HOST ?? '0.0.0.0',
  port: +(process.env.PORT ?? 3000),
  path: { base: '/api', isStrict: true },
};

export class Application extends BaseApplication {
  override getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return packageJson;
  }

  staticConfigure(): void {}

  preConfigure(): ValueOrPromise<void> {
    this.controller(HelloController);
  }

  postConfigure(): ValueOrPromise<void> {}
  setupMiddlewares(): ValueOrPromise<void> {}
}
```

### `src/controllers/hello.controller.ts`

This controller handles a simple `/hello` route.

```typescript
import { BaseController, controller, HTTP, IControllerOptions, ValueOrPromise } from '@vez/ignis';

@controller({ path: '/hello' })
export class HelloController extends BaseController {
  constructor(opts: IControllerOptions) {
    super({ ...opts, scope: HelloController.name, path: '/hello' });
  }

  override binding(): ValueOrPromise<void> {
    this.defineRoute({
      configs: { path: '/', method: 'get' },
      handler: c => c.json({ message: 'Hello, World!' }),
    });
  }
}
```

### `src/index.ts`

This is the entry point that instantiates and starts your application.

```typescript
import { Application, appConfigs } from './application';
import { LoggerFactory } from '@vez/ignis';

const logger = LoggerFactory.getLogger(['main']);

const main = async () => {
  const application = new Application({
    scope: 'MyApp',
    config: appConfigs,
  });

  const applicationName = process.env.APP_ENV_APPLICATION_NAME?.toUpperCase() ?? 'My-App';
  logger.info('[main] Getting ready to start up %s Application...', applicationName);
  await application.start();
  return application;
};

export default main();
```

## 5. Run Your Application

Add common application scripts to your `package.json`:

```json
"scripts": {
    "build": "tsc -p tsconfig.json && tsc-alias -p tsconfig.json",
    "compile:linux": "bun build --compile --minify --sourcemap --target=bun-linux-x64 ./src/index.ts --outfile ./dist/vert",
    "lint": "bun run eslint && bun run prettier:cli",
    "lint:fix": "bun run eslint --fix && bun run prettier:fix",
    "prettier:cli": "prettier \"**/*.{js,ts}\" -l",
    "prettier:fix": "bun run prettier:cli --write",
    "eslint": "eslint --report-unused-disable-directives .",
    "clean": "sh ./scripts/clean.sh",
    "rebuild": "bun run clean && bun run build",
    "migrate:dev": "NODE_ENV=development drizzle-kit push --config=src/migration.ts",
    "generate-migration:dev": "NODE_ENV=development drizzle-kit generate --config=src/datasources/migration.ts",
    "preserver:dev": "bun run rebuild",
    "server:dev": "NODE_ENV=development bun .",
    "server:prod": "NODE_ENV=production bun ."
}
```

Now, start your application:

```bash
bun server:dev
```

Your server will be running on `http://localhost:3000`. You can access your new endpoint at `http://localhost:3000/api/hello`.

Congratulations! You have successfully created and configured your first application with the Ignis framework.
