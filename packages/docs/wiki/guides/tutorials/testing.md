# Testing Your Ignis Application

This guide shows you how to write tests for your Ignis application.

## Choose Your Test Framework

**Ignis works with any test framework.** You can use whichever testing tool you prefer:

| Framework | Description |
|-----------|-------------|
| **Jest** | Popular, feature-rich testing framework |
| **Vitest** | Fast, Vite-native testing framework |
| **Bun Test** | Built-in test runner for Bun |
| **Playwright** | End-to-end testing for web applications |
| **node:test** | Node.js native test module |
| **Mocha** | Flexible testing framework |
| **Any other** | All test frameworks work with Ignis |

Since Ignis is just a TypeScript/JavaScript application framework, you can test it with any tool that supports TypeScript.

::: tip IGNIS Testing Extension
IGNIS provides its own testing utilities built on `node:test`. These utilities (`TestPlan`, `TestCase`, `TestCaseHandler`) offer a structured approach for organizing tests with lifecycle hooks and shared context. This is optional — use it if you prefer this pattern, or use your favorite test framework directly.
:::

## Prerequisites

Before starting, ensure you have:
- A working Ignis application (see [Building a CRUD API](./building-a-crud-api.md))
- Basic understanding of [Controllers](./core-concepts/controllers.md) and [Repositories](./core-concepts/persistent.md)

## Quick Examples with Popular Frameworks

### Using Vitest

```typescript
// __tests__/todo.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app } from '../src/application';

describe('Todo API', () => {
  beforeAll(async () => {
    // Setup: start server, seed database, etc.
  });

  afterAll(async () => {
    // Cleanup: close connections
  });

  it('should return list of todos', async () => {
    const response = await app.request('/api/todos', { method: 'GET' });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('should create a new todo', async () => {
    const response = await app.request('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test Todo' }),
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.title).toBe('Test Todo');
  });
});
```

### Using Jest

```typescript
// __tests__/todo.test.ts
import { app } from '../src/application';

describe('Todo API', () => {
  it('should return list of todos', async () => {
    const response = await app.request('/api/todos', { method: 'GET' });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });
});
```

### Using Bun Test

```typescript
// __tests__/todo.test.ts
import { describe, it, expect } from 'bun:test';
import { app } from '../src/application';

describe('Todo API', () => {
  it('should return list of todos', async () => {
    const response = await app.request('/api/todos', { method: 'GET' });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });
});
```

### Using Playwright (E2E)

```typescript
// e2e/todo.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Todo Application', () => {
  test('should display todo list', async ({ request }) => {
    const response = await request.get('http://localhost:3000/api/todos');

    expect(response.ok()).toBeTruthy();
    const todos = await response.json();
    expect(Array.isArray(todos)).toBe(true);
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
    const message = 'Hello, Ignis!';
    return { message };
  }

  getValidator() {
    // Validate the result
    return (result: { message: string }) => {
      if (result.message === 'Hello, Ignis!') {
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
      expectation: 'Message equals "Hello, Ignis!"',
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
import { app } from '../src/application'; // Your Ignis app

// Handler for testing GET /todos
class GetTodosHandler extends TestCaseHandler {
  async execute() {
    // Make HTTP request to your app
    const response = await app.request('/api/todos', {
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

      // Validate response is an array
      if (!Array.isArray(result.body)) {
        return TestCaseDecisions.FAIL;
      }

      return TestCaseDecisions.SUCCESS;
    };
  }
}

// Handler for testing POST /todos
class CreateTodoHandler extends TestCaseHandler {
  async execute() {
    const response = await app.request('/api/todos', {
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

      if (result.body.title !== 'Test Todo') {
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
      console.log('Setting up Todo controller tests...');
      // Start server or setup test database
    },
    after: async () => {
      console.log('Cleaning up...');
      // Cleanup resources
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

Use the test plan's context to share data between tests (like authentication tokens):

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

    const response = await app.request('/api/profile', {
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
      // Login and store token in context
      const loginResponse = await app.request('/api/auth/login', {
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
  },
  testCases: [
    TestCase.withOptions({
      code: 'AUTH-001',
      description: 'Authenticated user can access profile',
      expectation: 'Returns user profile with status 200',
      handler: new SecureEndpointHandler({ context: {} as any }),
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
import { Container } from '@venizia/ignis-inversion';

// Setup container for DI
const container = new Container();

class CreateTodoRepoHandler extends TestCaseHandler {
  async execute() {
    const todoRepo = container.get<TodoRepository>('repositories.TodoRepository');

    const created = await todoRepo.create({
      title: 'Repository Test',
      description: 'Testing repository layer',
      isCompleted: false,
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
    const todoRepo = container.get<TodoRepository>('repositories.TodoRepository');

    const todos = await todoRepo.find({
      where: { isCompleted: false },
      limit: 10,
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
      // Setup DI container and database connection
      container.bind('repositories.TodoRepository').toClass(TodoRepository);
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

class CompleteTodoHandler extends TestCaseHandler {
  async execute() {
    const todoService = new TodoService();

    // Create a todo first
    const todo = await todoService.create({
      title: 'Test completion',
      isCompleted: false,
    });

    // Mark as complete
    const completed = await todoService.markAsComplete(todo.id);

    return { original: todo, completed };
  }

  getValidator() {
    return (result: { original: any; completed: any }) => {
      // Original should be incomplete
      if (result.original.isCompleted !== false) {
        return TestCaseDecisions.FAIL;
      }

      // Completed should be complete
      if (result.completed.isCompleted !== true) {
        return TestCaseDecisions.FAIL;
      }

      return TestCaseDecisions.SUCCESS;
    };
  }
}

const serviceTests = TestPlan.newInstance({
  scope: 'Todo Service',
  testCases: [
    TestCase.withOptions({
      code: 'SVC-001',
      description: 'Can mark todo as complete',
      expectation: 'Todo isCompleted changes from false to true',
      handler: new CompleteTodoHandler({ context: {} as any }),
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

- [Testing Reference](../../references/helpers/testing.md) - Complete API documentation
- [Best Practices](../../best-practices/code-style-standards.md) - Code quality standards
- [Troubleshooting](../../best-practices/troubleshooting-tips.md) - Common issues

## Summary

| What to Test | How |
|--------------|-----|
| **Controllers** | Use `app.request()` to make HTTP calls |
| **Services** | Instantiate and call methods directly |
| **Repositories** | Use DI container, test with real/mock DB |
| **Integration** | Chain multiple operations with shared context |
| **E2E** | Use Playwright or similar for full flow testing |

**Key Takeaways:**
- Use any test framework you prefer (Jest, Vitest, Bun Test, Playwright, etc.)
- IGNIS provides optional testing utilities (`TestPlan`, `TestCase`, `TestCaseHandler`) built on `node:test`
- All frameworks work seamlessly with Ignis applications
