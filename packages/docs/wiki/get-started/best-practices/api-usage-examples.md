# API Usage Examples

Practical examples for defining endpoints and working with data in Ignis applications.

## Routing Patterns

### Decorator-Based Routing (Recommended)

Use `@get`, `@post` decorators with `as const` route configs for full type safety:

**`src/controllers/test/definitions.ts`**
```typescript
import { z } from '@hono/zod-openapi';
import { Authentication, HTTP, jsonContent, jsonResponse } from '@venizia/ignis';

// Define route configs as const for type inference
export const ROUTE_CONFIGS = {
  // ... (other routes)
  ['/4']: {
    method: HTTP.Methods.GET,
    path: '/4',
    responses: jsonResponse({
      description: 'Test decorator GET endpoint',
      schema: z.object({ message: z.string(), method: z.string() }),
    }),
  },
  ['/5']: {
    method: HTTP.Methods.POST,
    path: '/5',
    authStrategies: [Authentication.STRATEGY_JWT], // Secure this endpoint
    request: {
      body: jsonContent({
        description: 'Request body for POST',
        schema: z.object({ name: z.string(), age: z.number().int().positive() }),
      }),
    },
    responses: jsonResponse({
      description: 'Test decorator POST endpoint',
      schema: z.object({ id: z.string(), name: z.string(), age: z.number() }),
    }),
  },
} as const;
```

Then, use the decorators in your controller class. The `TRouteContext` type provides a fully typed context, including request parameters, body, and response types.

**`src/controllers/test/controller.ts`**
```typescript
import {
  BaseController,
  controller,
  get,
  post,
  TRouteContext,
} from '@venizia/ignis';
import { ROUTE_CONFIGS } from './definitions';

@controller({ path: '/test' })
export class TestController extends BaseController {
  // ...

  @get({ configs: ROUTE_CONFIGS['/4'] })
  getWithDecorator(context: TRouteContext<(typeof ROUTE_CONFIGS)['/4']>) {
    // context is fully typed!
    return context.json({ message: 'Hello from decorator', method: 'GET' });
  }

  @post({ configs: ROUTE_CONFIGS['/5'] })
  createWithDecorator(context: TRouteContext<(typeof ROUTE_CONFIGS)['/5']>) {
    // context.req.valid('json') is automatically typed as { name: string, age: number }
    const body = context.req.valid('json');

    // The response is validated against the schema
    return context.json({
      id: crypto.randomUUID(),
      name: body.name,
      age: body.age,
    });
  }
}
```

### Example 2: Manual Route Definition in `binding()`

You can also define routes manually within the controller's `binding()` method using `defineRoute` or `bindRoute`. This is useful for more complex scenarios or for developers who prefer a non-decorator syntax.

**`src/controllers/test/controller.ts`**
```typescript
import { BaseController, controller, HTTP, ValueOrPromise } from '@venizia/ignis';
import { ROUTE_CONFIGS } from './definitions';

@controller({ path: '/test' })
export class TestController extends BaseController {
  // ...
  override binding(): ValueOrPromise<void> {
    // Using 'defineRoute'
    this.defineRoute({
      configs: ROUTE_CONFIGS['/1'],
      handler: context => {
        return context.json({ message: 'Hello' });
      },
    });

    // Using 'bindRoute' for a fluent API
    this.bindRoute({
      configs: ROUTE_CONFIGS['/3'],
    }).to({
      handler: context => {
        return context.json({ message: 'Hello 3' });
      },
    });
  }
  // ...
}
```

### Example 3: Auto-Generated CRUD Controller

For standard database entities, you can use `ControllerFactory.defineCrudController` to instantly generate a controller with a full set of CRUD endpoints.

**`src/controllers/configuration.controller.ts`**
```typescript
import { Configuration } from '@/models';
import { ConfigurationRepository } from '@/repositories';
import {
  BindingKeys,
  BindingNamespaces,
  controller,
  ControllerFactory,
  inject,
} from '@venizia/ignis';

const BASE_PATH = '/configurations';

// 1. The factory generates a controller class with all CRUD routes
const _Controller = ControllerFactory.defineCrudController({
  repository: { name: ConfigurationRepository.name },
  controller: {
    name: 'ConfigurationController',
    basePath: BASE_PATH,
  },
  entity: () => Configuration, // The entity is used to generate OpenAPI schemas
});

// 2. Extend the generated controller to inject the repository
@controller({ path: BASE_PATH })
export class ConfigurationController extends _Controller {
  constructor(
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: ConfigurationRepository.name,
      }),
    })
    repository: ConfigurationRepository,
  ) {
    super(repository);
  }
}
```
This automatically creates endpoints like `GET /configurations`, `POST /configurations`, `GET /configurations/:id`, etc.

## Repository (Data Access) Usage

Repositories are used to interact with your database. The `DefaultCRUDRepository` provides a rich set of methods for data manipulation. Here are examples from the `postConfigure` method in `src/application.ts`, which demonstrates how to use an injected repository.

```typescript
// In src/application.ts

// Get the repository instance from the DI container
const configurationRepository = this.get<ConfigurationRepository>({
  key: BindingKeys.build({
    namespace: BindingNamespaces.REPOSITORY,
    key: ConfigurationRepository.name,
  }),
});

// --- Find One Record ---
const record = await configurationRepository.findOne({
  filter: { where: { code: 'CODE_1' } },
});

// --- Find Multiple Records with Relations ---
const records = await configurationRepository.find({
  filter: {
    where: { code: 'CODE_2' },
    fields: { id: true, code: true, createdBy: true },
    limit: 100,
    include: [{ relation: 'creator' }], // Eager load the 'creator' relation
  },
});

// --- Create a Single Record ---
const newRecord = await configurationRepository.create({
  data: {
    code: 'NEW_CODE',
    group: 'SYSTEM',
    dataType: 'TEXT',
    tValue: 'some value',
  },
});

// --- Create Multiple Records ---
const newRecords = await configurationRepository.createAll({
  data: [
    { code: 'CODE_A', group: 'SYSTEM' },
    { code: 'CODE_B', group: 'SYSTEM' },
  ],
});

// --- Update a Record by ID ---
const updated = await configurationRepository.updateById({
  id: 'some-uuid',
  data: { tValue: 'new value' },
});

// --- Delete a Record by ID ---
const deleted = await configurationRepository.deleteById({
  id: newRecord.data!.id,
  options: { shouldReturn: true }, // Option to return the deleted record
});
```
