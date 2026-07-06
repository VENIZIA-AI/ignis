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
> IGNIS provides its own testing utilities built on `node:test`. These utilities (`TestPlan`, `TestCase`, `TestCaseHandler`) offer a structured approach for organizing tests with lifecycle hooks and shared context. This is optional - use it if you prefer this pattern, or use your favorite test framework directly.

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

## Using IGNIS Testing Extension

IGNIS provides its own testing utilities built on `node:test` for a more structured approach.

### 1. Create Your First Test

Create a test file in your project:

```typescript
// __tests__/hello.test.ts
import {
  TestPlan,
  TestDescribe,
  TestCase,
  TestCaseHandler,
  TestCaseDecisions,
} from '@venizia/ignis-helpers';

// Step 1: Define a Test Handler
class HelloHandler extends TestCaseHandler {
  async execute() {
    // The action to test
    const message = 'Hello, IGNIS!';
    return { message };
  }

  getValidator() {
    // Validate the result
    return (result: { message: string }) => {
      if (result.message === 'Hello, IGNIS!') {
        return TestCaseDecisions.SUCCESS;
      }
      return TestCaseDecisions.FAIL;
    };
  }
}

// Step 2: Create a Test Plan
const helloTestPlan = TestPlan.newInstance({
  scope: 'Hello World Tests',
  testCases: [
    TestCase.withOptions({
      code: 'HELLO-001',
      description: 'Should return greeting message',
      expectation: 'Message equals "Hello, IGNIS!"',
      handler: new HelloHandler({ context: {} as any }),
    }),
  ],
});

// Step 3: Run the Test
TestDescribe.withTestPlan({ testPlan: helloTestPlan }).run();
```

### 2. Run Tests

```bash
# Using Bun
bun test

# Using Node.js
node --test __tests__/*.test.ts
```

## Core Concepts

### Test Framework Components

| Component | Purpose |
|-----------|---------|
| **TestPlan** | Organizes a test suite with lifecycle hooks and shared context |
| **TestCase** | A single test unit with code, description, and handler |
| **TestCaseHandler** | Encapsulates test execution and validation logic |
| **TestDescribe** | Runs test plans using `node:test` |

### Test Case Decisions

| Decision | Meaning |
|----------|---------|
| `TestCaseDecisions.SUCCESS` | Test passed |
| `TestCaseDecisions.FAIL` | Test failed |
| `TestCaseDecisions.UNKNOWN` | Result undetermined |

### Lifecycle Hooks

| Hook | When | Use Case |
|------|------|----------|
| `before` | Before all tests | Start server, seed database |
| `after` | After all tests | Close connections, cleanup |
| `beforeEach` | Before each test | Reset state |
| `afterEach` | After each test | Clear test data |

## Testing Controllers

Here's how to test an HTTP controller:

```typescript
// __tests__/todo.controller.test.ts
import {
  TestPlan,
  TestDescribe,
  TestCase,
  TestCaseHandler,
  TestCaseDecisions,
} from '@venizia/ignis-helpers';
import { testApp, testServer } from './helpers/test-app'; // See "Shared Test App Helper" above

// Handler for testing GET /todos
class GetTodosHandler extends TestCaseHandler {
  async execute() {
    // Make an in-process HTTP request against the bound router
    const response = await testServer().request('/api/todos', {
      method: 'GET',
    });

    return {
      status: response.status,
      body: await response.json(),
    };
  }

  getValidator() {
    return (result: { status: number; body: any }) => {
      // Validate status code
      if (result.status !== 200) {
        return TestCaseDecisions.FAIL;
      }

      // ControllerFactory's generated GET / wraps reads in { count, data } by default
      if (!Array.isArray(result.body.data)) {
        return TestCaseDecisions.FAIL;
      }

      return TestCaseDecisions.SUCCESS;
    };
  }
}

// Handler for testing POST /todos
class CreateTodoHandler extends TestCaseHandler {
  async execute() {
    const response = await testServer().request('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Test Todo',
        description: 'Created by test',
      }),
    });

    return {
      status: response.status,
      body: await response.json(),
    };
  }

  getValidator() {
    return (result: { status: number; body: any }) => {
      if (result.status !== 201) {
        return TestCaseDecisions.FAIL;
      }

      // Write endpoints return { count, data } too
      if (result.body.data.title !== 'Test Todo') {
        return TestCaseDecisions.FAIL;
      }

      return TestCaseDecisions.SUCCESS;
    };
  }
}

// Create test plan
const todoControllerTests = TestPlan.newInstance({
  scope: 'Todo Controller',
  hooks: {
    before: async () => {
      await testApp.start();
    },
    after: async () => {
      await testApp.stop();
    },
  },
  testCases: [
    TestCase.withOptions({
      code: 'TODO-001',
      description: 'GET /todos returns list of todos',
      expectation: 'Status 200 with array response',
      handler: new GetTodosHandler({ context: {} as any }),
    }),
    TestCase.withOptions({
      code: 'TODO-002',
      description: 'POST /todos creates a new todo',
      expectation: 'Status 201 with created todo',
      handler: new CreateTodoHandler({ context: {} as any }),
    }),
  ],
});

TestDescribe.withTestPlan({ testPlan: todoControllerTests }).run();
```

## Testing with Shared Context

Use the test plan's context to share data between tests (like authentication tokens). A handler that reads shared context must be constructed via `testCaseResolver` (not a plain `testCases` array), because `testCaseResolver` is called with the test plan's own `context` object - the same instance `before` binds values onto. Constructing a handler with a placeholder `context: {} as any` before the test plan exists leaves it with nothing to read from.

```typescript
// __tests__/auth.test.ts
import {
  TestPlan,
  TestDescribe,
  TestCase,
  TestCaseHandler,
  TestCaseDecisions,
  ITestContext,
} from '@venizia/ignis-helpers';
import { testApp, testServer } from './helpers/test-app'; // See "Shared Test App Helper" above

// Define context shape
interface AuthContext {
  token: string;
  userId: string;
}

// Handler that uses shared context
class SecureEndpointHandler extends TestCaseHandler<AuthContext> {
  async execute() {
    // Get token from context (set in before hook)
    const token = this.context.getSync<string>({ key: 'token' });

    const response = await testServer().request('/api/profile', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return {
      status: response.status,
      body: await response.json(),
    };
  }

  getValidator() {
    return (result: { status: number; body: any }) => {
      if (result.status === 200 && result.body.id) {
        return TestCaseDecisions.SUCCESS;
      }
      return TestCaseDecisions.FAIL;
    };
  }
}

const authTests = TestPlan.newInstance<AuthContext>({
  scope: 'Authentication Tests',
  hooks: {
    before: async (testPlan: ITestContext<AuthContext>) => {
      await testApp.start();

      // Login and store token in context
      const loginResponse = await testServer().request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password123',
        }),
      });

      const { token, userId } = await loginResponse.json();

      // Bind to context for use in test cases
      testPlan.bind({ key: 'token', value: token });
      testPlan.bind({ key: 'userId', value: userId });
    },
    after: async () => {
      await testApp.stop();
    },
  },
  // testCaseResolver receives the test plan's own context - handlers built here can read
  // whatever `before` bound onto it via `this.context.getSync()`.
  testCaseResolver: ({ context }) => [
    TestCase.withOptions({
      code: 'AUTH-001',
      description: 'Authenticated user can access profile',
      expectation: 'Returns user profile with status 200',
      handler: new SecureEndpointHandler({ context }),
    }),
  ],
});

TestDescribe.withTestPlan({ testPlan: authTests }).run();
```

## Testing Repositories

Test your data access layer directly:

```typescript
// __tests__/todo.repository.test.ts
import {
  TestPlan,
  TestDescribe,
  TestCase,
  TestCaseHandler,
  TestCaseDecisions,
} from '@venizia/ignis-helpers';
import { TodoRepository } from '../src/repositories/todo.repository';
import { PostgresDataSource } from '../src/datasources/postgres.datasource';
import { Container } from '@venizia/ignis-inversion';

// Setup container for DI. `@repository({ model: Todo, dataSource: PostgresDataSource })`
// auto-injects PostgresDataSource at TodoRepository's constructor param[0] - that binding is
// NOT optional, so it must be registered under the exact key 'datasources.PostgresDataSource'
// before the container can resolve TodoRepository.
const container = new Container();

class CreateTodoRepoHandler extends TestCaseHandler {
  async execute() {
    const todoRepo = container.get<TodoRepository>({ key: 'repositories.TodoRepository' });

    const { data: created } = await todoRepo.create({
      data: {
        title: 'Repository Test',
        description: 'Testing repository layer',
        isCompleted: false,
      },
    });

    return { todo: created };
  }

  getValidator() {
    return (result: { todo: any }) => {
      if (result.todo && result.todo.id && result.todo.title === 'Repository Test') {
        return TestCaseDecisions.SUCCESS;
      }
      return TestCaseDecisions.FAIL;
    };
  }
}

class FindTodoRepoHandler extends TestCaseHandler {
  async execute() {
    const todoRepo = container.get<TodoRepository>({ key: 'repositories.TodoRepository' });

    const todos = await todoRepo.find({
      filter: { where: { isCompleted: false }, limit: 10 },
    });

    return { todos, count: todos.length };
  }

  getValidator() {
    return (result: { todos: any[]; count: number }) => {
      if (Array.isArray(result.todos) && result.count >= 0) {
        return TestCaseDecisions.SUCCESS;
      }
      return TestCaseDecisions.FAIL;
    };
  }
}

const repoTests = TestPlan.newInstance({
  scope: 'Todo Repository',
  hooks: {
    before: async () => {
      // Bind + configure the real DataSource (a test database), then the repository that
      // depends on it - order matters, the repository binding resolves the DataSource eagerly.
      const dataSource = new PostgresDataSource();
      await dataSource.configure();

      container.bind({ key: 'datasources.PostgresDataSource' }).toValue(dataSource);
      container.bind({ key: 'repositories.TodoRepository' }).toClass(TodoRepository);
    },
    after: async () => {
      // Cleanup test data
    },
  },
  testCases: [
    TestCase.withOptions({
      code: 'REPO-001',
      description: 'Can create a todo via repository',
      expectation: 'Returns created todo with ID',
      handler: new CreateTodoRepoHandler({ context: {} as any }),
    }),
    TestCase.withOptions({
      code: 'REPO-002',
      description: 'Can find todos with filters',
      expectation: 'Returns array of matching todos',
      handler: new FindTodoRepoHandler({ context: {} as any }),
    }),
  ],
});

TestDescribe.withTestPlan({ testPlan: repoTests }).run();
```

## Testing Services

Test business logic in isolation:

This exercises the `TodoService` defined in [Building a CRUD API's "Adding Business Logic with Services"](./building-a-crud-api.md#adding-business-logic-with-services) - `createTodo()` is its only method, and it depends on `TodoRepository` via constructor injection. Since `@inject` only matters when the *DI container* resolves the class, a plain `new TodoService(mockRepository)` bypasses DI entirely and lets you pass a hand-rolled mock - no container, no real database:

```typescript
// __tests__/todo.service.test.ts
import {
  TestPlan,
  TestDescribe,
  TestCase,
  TestCaseHandler,
  TestCaseDecisions,
} from '@venizia/ignis-helpers';
import { TodoService } from '../src/services/todo.service';
import { TodoRepository } from '../src/repositories/todo.repository';

// createTodo() only calls findOne() and create() - the mock only needs those two.
const mockTodoRepository = {
  findOne: async () => null,
  create: async (opts: { data: { title: string } }) => ({
    count: 1,
    data: { id: 'mock-id', ...opts.data },
  }),
} as unknown as TodoRepository;

class CreateTodoHandler extends TestCaseHandler {
  async execute() {
    const todoService = new TodoService(mockTodoRepository);
    const { data: created } = await todoService.createTodo({ title: 'Write tests' });
    return { created };
  }

  getValidator() {
    return (result: { created: any }) => {
      if (result.created?.title === 'Write tests') {
        return TestCaseDecisions.SUCCESS;
      }
      return TestCaseDecisions.FAIL;
    };
  }
}

class RejectShortTitleHandler extends TestCaseHandler {
  async execute() {
    const todoService = new TodoService(mockTodoRepository);

    try {
      await todoService.createTodo({ title: 'ab' });
      return { threw: false };
    } catch {
      return { threw: true };
    }
  }

  getValidator() {
    return (result: { threw: boolean }) => {
      return result.threw ? TestCaseDecisions.SUCCESS : TestCaseDecisions.FAIL;
    };
  }
}

const serviceTests = TestPlan.newInstance({
  scope: 'Todo Service',
  testCases: [
    TestCase.withOptions({
      code: 'SVC-001',
      description: 'Creates a todo when validation passes',
      expectation: 'Returns the created todo',
      handler: new CreateTodoHandler({ context: {} as any }),
    }),
    TestCase.withOptions({
      code: 'SVC-002',
      description: 'Rejects a title shorter than 3 characters',
      expectation: 'Throws a validation error',
      handler: new RejectShortTitleHandler({ context: {} as any }),
    }),
  ],
});

TestDescribe.withTestPlan({ testPlan: serviceTests }).run();
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

### 1. Use Descriptive Test Codes

```typescript
TestCase.withOptions({
  code: 'AUTH-LOGIN-001',  // Feature-Action-Number
  description: 'User can login with valid credentials',
  expectation: 'Returns JWT token and user ID',
  // ...
});
```

### 2. Isolate Test Data

```typescript
hooks: {
  beforeEach: async (testPlan) => {
    // Create fresh test data for each test
    const testTodo = await createTestTodo();
    testPlan.bind({ key: 'testTodoId', value: testTodo.id });
  },
  afterEach: async (testPlan) => {
    // Clean up after each test
    const todoId = testPlan.getSync({ key: 'testTodoId' });
    await deleteTestTodo(todoId);
  },
}
```

### 3. Test Edge Cases

```typescript
// Test empty results
TestCase.withOptions({
  code: 'TODO-FIND-002',
  description: 'Returns empty array when no todos match filter',
  expectation: 'Empty array with status 200',
  handler: new FindNonExistentHandler({ context: {} as any }),
});

// Test validation errors
TestCase.withOptions({
  code: 'TODO-CREATE-003',
  description: 'Rejects todo without title',
  expectation: 'Status 400 with validation error',
  handler: new CreateInvalidTodoHandler({ context: {} as any }),
});
```

### 4. Keep Handlers Focused

Each handler should test one specific behavior:

```typescript
// Good: Focused on one behavior
class CreateTodoHandler extends TestCaseHandler {
  async execute() { /* only create logic */ }
}

// Avoid: Multiple behaviors in one handler
class CreateAndUpdateAndDeleteHandler extends TestCaseHandler {
  async execute() { /* too many things */ }
}
```

## Next Steps

- [Testing Reference](../../extensions/helpers/testing/) - Complete API documentation
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
- IGNIS provides optional testing utilities (`TestPlan`, `TestCase`, `TestCaseHandler`) built on `node:test`
- All frameworks work seamlessly with IGNIS applications
