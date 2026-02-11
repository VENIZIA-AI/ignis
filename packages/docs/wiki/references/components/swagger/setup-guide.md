# Setup Guide

## Step 1: Bind Configuration (Optional)

Skip this step to use the defaults (Scalar UI at `/doc/explorer`). To customize:

```typescript
import { SwaggerBindingKeys, ISwaggerOptions } from '@venizia/ignis';

// In your Application class's preConfigure method
this.bind<ISwaggerOptions>({
  key: SwaggerBindingKeys.SWAGGER_OPTIONS,
}).toValue({
  restOptions: {
    base: { path: '/doc' },
    doc: { path: '/openapi.json' },
    ui: { path: '/explorer', type: 'swagger' }, // Use Swagger UI instead of Scalar
  },
  explorer: {
    openapi: '3.0.0',
  },
});
```

## Step 2: Register Component

```typescript
// src/application.ts
import { SwaggerComponent, BaseApplication, ValueOrPromise } from '@venizia/ignis';

export class Application extends BaseApplication {
  preConfigure(): ValueOrPromise<void> {
    // ...
    this.component(SwaggerComponent);
    // ...
  }
}
```

## Step 3: Define Routes with Zod Schemas

To get the most out of the documentation, define your routes with `zod` schemas:

```typescript
// src/controllers/hello.controller.ts
import { z } from '@hono/zod-openapi';
import { BaseController, controller, HTTP, jsonContent, ValueOrPromise } from '@venizia/ignis';

@controller({ path: '/hello' })
export class HelloController extends BaseController {
  constructor() {
    super({ scope: HelloController.name, path: '/hello' });
  }

  override binding(): ValueOrPromise<void> {
    this.defineRoute({
      configs: {
        path: '/',
        method: 'get',
        responses: {
          [HTTP.ResultCodes.RS_2.Ok]: jsonContent({
            description: 'A simple hello message',
            schema: z.object({ message: z.string() }),
          }),
        },
      },
      handler: (c) => {
        return c.json({ message: 'Hello, `Ignis`!' }, HTTP.ResultCodes.RS_2.Ok);
      },
    });
  }
}
```

> [!TIP]
> Controllers using `defineRoute` with Zod schemas automatically generate OpenAPI specs. The Swagger component discovers all registered controller routes and renders them in the documentation UI.
