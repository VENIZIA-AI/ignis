# Welcome to Ignis Framework

Ignis is a powerful and extensible backend framework for TypeScript, built on top of [Hono](https://hono.dev/). It is designed to be modular, scalable, and easy to use, providing a solid foundation for building modern, high-performance web applications and APIs.

This documentation will guide you through the process of setting up your first Ignis application, understanding its core concepts, and leveraging its features to build robust backend services.

## Getting Started

This guide will walk you through creating a simple "Hello World" application with Ignis.

### Prerequisites

- [Bun](https://bun.sh/) (or Node.js) installed on your system.
- Basic knowledge of TypeScript.

### 1. Project Setup

First, let's set up a new project.

```bash
mkdir my-ignis-app
cd my-ignis-app
bun init
```

### 2. Install Dependencies

Next, install `hono` and the Ignis framework.

```bash
bun add hono
bun add @vez/ignis
```

### 3. Create the Application File

Create a new file `src/application.ts`. This file will define your application.

```typescript
import { BaseApplication, IApplicationConfigs, IApplicationInfo, ValueOrPromise } from '@vez/ignis';
import path from 'node:path';
import packageJson from './../package.json';

// Application configurations
export const appConfigs: IApplicationConfigs = {
  host: process.env.APP_ENV_SERVER_HOST,
  port: +(process.env.APP_ENV_SERVER_PORT ?? 3000),
  path: {
    base: process.env.APP_ENV_SERVER_BASE_PATH,
    isStrict: true,
  },
  debug: {
    showRoutes: process.env.NODE_ENV !== 'production',
  },
};

// Main Application class
export class Application extends BaseApplication {
  override getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return packageJson;
  }

  staticConfigure(): void {
    this.static({ folderPath: path.join(__dirname, '../public') });
  }

  preConfigure(): ValueOrPromise<void> {
    // Register your components, controllers, services here
  }

  postConfigure(): ValueOrPromise<void> {}
  
  setupMiddlewares(): ValueOrPromise<void> {}
}
```

### 4. Create the Entry Point

Create a file `src/index.ts` to instantiate and run your application.

```typescript
import { LoggerFactory } from '@vez/ignis';
import { Application, appConfigs } from './application';

const logger = LoggerFactory.getLogger(['main']);

const main = () => {
  const application = new Application({
    scope: 'Application',
    config: appConfigs,
  });

  const applicationName = process.env.APP_ENV_APPLICATION_NAME?.toUpperCase() ?? 'MY-APP';
  logger.info(
    '[runApplication] Getting ready to start up %s Application...',
    applicationName,
  );
  return application.start();
};

export default main();
```

### 5. Add a Controller

Create a controller to handle requests. Create `src/controllers/hello.controller.ts`:

```typescript
import { BaseController, controller, HTTP, IControllerOptions, ValueOrPromise } from '@vez/ignis';
import { z } from '@hono/zod-openapi';

@controller({ path: '/hello' })
export class HelloController extends BaseController {
  constructor(opts: IControllerOptions) {
    super({
      ...opts,
      scope: HelloController.name,
      path: '/hello',
    });
  }

  override binding(): ValueOrPromise<void> {
    this.defineRoute({
      configs: {
        path: '/',
        method: 'get',
        responses: {
          [HTTP.ResultCodes.RS_2.Ok]: {
            description: 'A simple hello message',
            content: {
              'application/json': {
                schema: z.object({ message: z.string() }),
              },
            },
          },
        },
      },
      handler: (c) => {
        return c.json({ message: 'Hello, Ignis!' });
      },
    });
  }
}
```

Now, register the controller in your `src/application.ts`:
```typescript
// ... in src/application.ts inside the Application class
  preConfigure(): ValueOrPromise<void> {
    this.controller(HelloController);
  }
// ...
```

### 6. Run the Application

Create a `.env` file in the root of your project:
```
APP_ENV_SERVER_PORT=3000
```

Add a `start` script to your `package.json`:
```json
"scripts": {
  "start": "bun src/index.ts"
}
```

Finally, run the application:
```bash
bun start
```

Your application will be running at `http://localhost:3000`. You can visit `http://localhost:3000/hello` to see the response from your controller.

## Next Steps

- **Core Concepts**: Learn about the fundamental concepts of the Ignis framework.
- **Features**: Explore the built-in features and components.
- **Guides**: Follow tutorials to build more complex applications.
- **API Reference**: Detailed API documentation for all classes and functions.