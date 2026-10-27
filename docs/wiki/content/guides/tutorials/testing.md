# Testing Your IGNIS Application

This guide shows you how to write tests for your IGNIS application.

**Time to Complete:** ~30 minutes

## Choose Your Test Framework

**IGNIS works with any test framework.** You can use whichever testing tool you prefer:

| Framework | Description |
|-----------|-------------|
| **Jest** | Popular, feature-rich testing framework |
| **Vitest** | Fast, Vite-native testing framework |
| **Bun Test** | Built-in test runner for Bun |
| **Playwright** | End-to-end testing for web applications |
| **Mocha** | Flexible testing framework |
| **Any other** | All test frameworks work with IGNIS |

Since IGNIS is just a TypeScript/JavaScript application framework, you can test it with any tool that supports TypeScript.

> [!TIP] IGNIS Testing Extension
> IGNIS does not ship its own test framework - use the runner your project already standardizes on (the framework itself is tested with Bun Test).

## Prerequisites

Before starting, ensure you have:
- A working IGNIS application (see [Building a CRUD API](./building-a-crud-api.md))
- Basic understanding of [Controllers](../core-concepts/rest-controllers.md) and [Repositories](../core-concepts/persistent/)

## Prove the Application Boots

A controller that injects a service nobody registered passes every unit test of its own and then stops the server at boot. `assertApplicationBoots` runs the application's own boot in a test and fails with the error boot raises. Apps created from the `ignis` preset ship it as `src/boot.test.ts`. An existing app adds the same file:

```typescript
// src/boot.test.ts
import { describe, expect, test } from 'bun:test';
import { assertApplicationBoots } from '@venizia/ignis/testing';
import { application } from '#src/application';

describe('boot', () => {
  test('boots and mounts its routes', async () => {
    const booted = await assertApplicationBoots(application);

    // The root router has no base path yet: `start()` mounts it under `/api`.
    const response = await booted.getRootRouter().request('/hello');

    expect(response.status).toBe(200);
  });
});
```

The helper runs `init()` and `initialize()`, never `start()`: no socket opens and no post-start hook runs. Datasources are bound and resolved but not configured, so no connection is made. Every other step and every component runs as in a real boot.

| Option | Default | Meaning |
|--------|---------|---------|
| `keepDataSources` | `[]` | Datasources whose real `configure()` runs. A class, a class name or a binding key (`datasources.Main`) selects one. Close a kept one with `await application.stop()` |
| `skipComponents` | `[]` | Components whose `configure()` (and so `binding()`) is skipped, for one that needs infrastructure. What it would have registered is not registered |
| `skipSteps` | `['hydrateSecrets', 'wireSecretRotatables']` | Boot steps that do not run. A value replaces the default; an unknown name rejects before anything boots |
| `verifyBindings` | `true` | After boot, resolves every service and repository with [`assertBindingsResolve`](/extensions/helpers/inversion/reference#verifying-a-container), so an injection nobody references at boot still fails. A value you pass wins over the app's own `bootChecks`, whose boot step is off for the run |
| `skipBindings` | `[]` | Services or repositories the verification leaves out, for one whose constructor needs infrastructure. A class, a class name or a binding key. A name that matches nothing rejects |
| `allowNoControllers` | `false` | An application that registered no controller is rejected, because an empty artifact index would otherwise pass |
| `routes` | `true` | The helper's own check that no method and path is mounted twice. IGNIS boot does not detect that |

**Components run for real.** The helper stubs datasource connections, the secrets provider and the socket, nothing else. A component's `binding()` registers the services and controllers the check then resolves, so it must run. A component that opens Redis, Kafka or S3 there needs a name in `skipComponents`; what it would have registered is then missing, so list the services that depend on it in `skipBindings`. When a boot fails inside a component, the helper logs one warning that names it (`skipComponents: ['RedisComponent']`); the rejection stays the original error.

The first argument is a built application or a function that returns one. Pass a function when a test boots the same application more than once: a second call on the same instance is rejected, also after a failed first call.

Verification runs after the last boot step, so if `validateScopeFilterSupport` also fails, that error comes first. What it catches: an unregistered injection, a missing binding, a bad component wiring, a duplicate route, an application with no controller. What it does not catch: a wrong database URL or password, a migration, anything `start()` does, or code of your own that opens a connection while it boots. `printStartUpInfo`, `validateEnvs` and `registerDefaultMiddlewares` still run, so a test supplies the environment variables its application needs.

## Quick Examples with Popular Frameworks

### Shared Test App Helper

`BaseApplication` has no `request()` method of its own, and `getServer()` has no routes mounted on it until `start()` runs `server.route(basePath, rootRouter)`. The router that actually carries your bound controllers is `getRootRouter()` (an `OpenAPIHono` instance, which has Hono's in-process `request()` testing helper). Start the real application once and reuse it across test files:

```typescript
// __tests__/helpers/test-app.ts
import { Application, appConfigs } from '../../src/application';

export const testApp = new Application({ scope: 'TestApp', config: appConfigs });

// getRootRouter() carries the bound controllers - request() exercises them in-process,
// with no network socket involved.
export const testServer = () => testApp.getRootRouter();
```

> [!IMPORTANT]
> Request paths on `getRootRouter()` carry no `path.base` prefix. Controllers mount at their own `@controller` path, and the `/api` base is applied only when `start()` routes the root router onto the outer server. In a test you ask for `/todos`, not `/api/todos`.

### Using Vitest

```typescript
// __tests__/todo.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { testApp, testServer } from './helpers/test-app';

describe('Todo API', () => {
  beforeAll(async () => {
    // init() binds CoreBindings.APPLICATION_INSTANCE. Without it the first
    // component resolution throws, because every built-in component injects that key.
    testApp.init();
    // start() then runs the boot sequence, sets up middlewares and opens the HTTP server.
    await testApp.start();
  });

  afterAll(async () => {
    await testApp.stop();
  });

  it('should return list of todos', async () => {
    const response = await testServer().request('/todos', { method: 'GET' });

    expect(response.status).toBe(200);
    // ControllerFactory's generated GET / wraps reads in { count, data } by default too
    // (unless the caller sends `x-request-count: false`) - unlike the repository API,
    // where find()/findOne()/findById() return rows directly.
    const body = await response.json();
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('should create a new todo', async () => {
    const response = await testServer().request('/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test Todo' }),
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.title).toBe('Test Todo');
  });
});
```

### Using Jest

```typescript
// __tests__/todo.test.ts
import { testApp, testServer } from './helpers/test-app';

describe('Todo API', () => {
  beforeAll(async () => {
    testApp.init();
    await testApp.start();
  });

  afterAll(async () => {
    await testApp.stop();
  });

  it('should return list of todos', async () => {
    const response = await testServer().request('/todos', { method: 'GET' });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.data)).toBe(true);
  });
});
```

### Using Bun Test

```typescript
// __tests__/todo.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { testApp, testServer } from './helpers/test-app';

describe('Todo API', () => {
  beforeAll(async () => {
    testApp.init();
    await testApp.start();
  });

  afterAll(async () => {
    await testApp.stop();
  });

  it('should return list of todos', async () => {
    const response = await testServer().request('/todos', { method: 'GET' });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.data)).toBe(true);
  });
});
```

### Using Playwright (E2E)

An end-to-end test talks to the running server over the network, so here the `/api` base path does apply.

```typescript
// e2e/todo.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Todo Application', () => {
  test('should display todo list', async ({ request }) => {
    const response = await request.get(`http://localhost:3000/api/todos`);

    expect(response.ok()).toBeTruthy();
    const todos = await response.json();
    expect(Array.isArray(todos.data)).toBe(true);
  });
});
```

## Project Structure

Organize your tests alongside your source code:

```
my-ignis-app/
├── src/
│   ├── controllers/
│   ├── services/
│   └── repositories/
├── __tests__/
│   ├── controllers/
│   │   └── todo.controller.test.ts
│   ├── services/
│   │   └── todo.service.test.ts
│   ├── repositories/
│   │   └── todo.repository.test.ts
│   └── integration/
│       └── auth-flow.test.ts
└── package.json
```

### Package.json Scripts

Choose scripts based on your preferred test framework:

**Bun Test:**
```json
{
  "scripts": {
    "test": "bun test",
    "test:watch": "bun test --watch",
    "test:coverage": "bun test --coverage"
  }
}
```

**Vitest:**
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

**Jest:**
```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  }
}
```

**Playwright (E2E):**
```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui"
  }
}
```

## Best Practices

### 1. Use Descriptive Test Names

```typescript
test('login with valid credentials returns a JWT and the user id', async () => {
  // ...
});
```

### 2. Isolate Test Data

Give every test its own fixtures - unique ids, fresh records - so tests never depend on execution order.

### 3. Test Edge Cases

Cover the boundaries alongside the happy path: empty input, duplicate ids, missing records, unauthorized callers.

## Next Steps

- [Best Practices](../../best-practices/code-style-standards/) - Code quality standards
- [Troubleshooting](../../best-practices/troubleshooting-tips.md) - Common issues

## Summary

| What to Test | How |
|--------------|-----|
| **Boot** | `assertApplicationBoots(application)` from `@venizia/ignis/testing`: every binding and injection resolves, with no database or port |
| **Controllers** | Use `getRootRouter().request()` to make in-process HTTP calls, with no `path.base` prefix |
| **Services** | Instantiate and call methods directly |
| **Repositories** | Use DI container, test with real/mock DB |
| **Integration** | Chain multiple operations with shared context |
| **E2E** | Use Playwright or similar for full flow testing |

**Key Takeaways:**
- Use any test framework you prefer (Jest, Vitest, Bun Test, Playwright, etc.)
- All frameworks work seamlessly with IGNIS applications
- Call `init()` before `start()` in every test setup, exactly as you do in production
