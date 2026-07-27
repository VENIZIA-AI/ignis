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
| **node:test** | Node.js native test module |
| **Mocha** | Flexible testing framework |
| **Any other** | All test frameworks work with IGNIS |

Since IGNIS is just a TypeScript/JavaScript application framework, you can test it with any tool that supports TypeScript.

> [!TIP] IGNIS Testing Extension
> IGNIS does not ship its own test framework - use the runner your project already standardizes on (the framework itself is tested with Bun Test).

## Prerequisites

Before starting, ensure you have:
- A working IGNIS application (see [Building a CRUD API](./building-a-crud-api.md))
- Basic understanding of [Controllers](../core-concepts/rest-controllers.md) and [Repositories](../core-concepts/persistent/)

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

### Using Vitest

```typescript
// __tests__/todo.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { testApp, testServer } from './helpers/test-app';

describe('Todo API', () => {
  beforeAll(async () => {
    // start() runs the full lifecycle (preConfigure -> registerDataSources ->
    // registerComponents -> registerControllers) and opens the HTTP server.
    await testApp.start();
  });

  afterAll(async () => {
    await testApp.stop();
  });

  it('should return list of todos', async () => {
    const response = await testServer().request('/api/todos', { method: 'GET' });

    expect(response.status).toBe(200);
    // ControllerFactory's generated GET / wraps reads in { count, data } by default too
    // (unless the caller sends `x-request-count-data: false`) - unlike the repository API,
    // where find()/findOne()/findById() return rows directly.
    const body = await response.json();
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('should create a new todo', async () => {
    const response = await testServer().request('/api/todos', {
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
    await testApp.start();
  });

  afterAll(async () => {
    await testApp.stop();
  });

  it('should return list of todos', async () => {
    const response = await testServer().request('/api/todos', { method: 'GET' });

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
    await testApp.start();
  });

  afterAll(async () => {
    await testApp.stop();
  });

  it('should return list of todos', async () => {
    const response = await testServer().request('/api/todos', { method: 'GET' });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.data)).toBe(true);
  });
});
```

### Using Playwright (E2E)

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
| **Controllers** | Use `getRootRouter().request()` to make in-process HTTP calls |
| **Services** | Instantiate and call methods directly |
| **Repositories** | Use DI container, test with real/mock DB |
| **Integration** | Chain multiple operations with shared context |
| **E2E** | Use Playwright or similar for full flow testing |

**Key Takeaways:**
- Use any test framework you prefer (Jest, Vitest, Bun Test, Playwright, etc.)
- All frameworks work seamlessly with IGNIS applications
