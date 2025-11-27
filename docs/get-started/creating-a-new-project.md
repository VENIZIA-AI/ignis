# Guide: Creating a New Project

This guide provides a step-by-step walkthrough for creating a new web application using the Ignis framework.

## 1. Initialize Your Project

Start by creating a new directory for your project and initializing it with Bun (or npm/yarn).

```bash
mkdir my-app
cd my-app
bun init
```

This will create a `package.json` file and a `tsconfig.json` file.

## 2. Install Dependencies

You'll need `hono` and `@vez/ignis`, which is the core framework.

```bash
bun add hono @vez/ignis
```

You will also need `typescript` and `ts-node` (or `tsx`) for running the application.

```bash
bun add -d typescript @types/bun
```

## 3. Set Up Your `tsconfig.json`

A typical `tsconfig.json` for an Ignis project looks like this:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ESNext"],
    "moduleResolution": "node",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "baseUrl": "./src",
    "paths": {
      "@/*": ["*"]
    },
    "outDir": "./dist",
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
  },
  "include": ["src"]
}
```

## 4. Create the Application Structure

Create the following directory structure inside your `src` folder:

```
src/
├── application.ts
├── index.ts
└── controllers/
    └── hello.controller.ts
```

## 5. Write the Code

### `src/application.ts`

This is the main class for your application. It extends `BaseApplication` from the Ignis framework.

```typescript
import { BaseApplication, IApplicationConfigs, IApplicationInfo, ValueOrPromise } from '@vez/ignis';
import { HelloController } from './controllers/hello.controller';
import packageJson from '../package.json';

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

This controller will handle a simple `/hello` route.

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
      handler: (c) => c.json({ message: 'Hello, World!' }),
    });
  }
}
```

### `src/index.ts`

This is the entry point that starts your application.

```typescript
import 'reflect-metadata';
import { Application, appConfigs } from './application';

const app = new Application({
  scope: 'MyApp',
  config: appConfigs,
});

app.start().catch(error => {
  console.error('Failed to start application:', error);
  process.exit(1);
});

export default app;
```

## 6. Run Your Application

Add a `start` script to your `package.json`:

```json
"scripts": {
  "start": "bun run src/index.ts"
}
```

Now, you can start your application:

```bash
bun start
```

Your server will be running on `http://localhost:3000`. You can access your new endpoint at `http://localhost:3000/api/hello`.

Congratulations! You have successfully created your first application with the Ignis framework.

## Next Steps

Now that you have a basic application running, it's a good practice to set up your development environment with tools for linting and formatting. Follow the [Setting up Project](./setting-up-project.md) guide to configure ESLint, Prettier, and other development tools.

