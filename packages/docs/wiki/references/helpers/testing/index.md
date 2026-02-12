# Testing

Structured test framework built on Node.js's native `node:test` module that organizes tests into plans, cases, and handlers with lifecycle hooks and shared context.

## Quick Reference

| Item | Value |
|------|-------|
| **Package** | `@venizia/ignis-helpers` |
| **Classes** | `TestPlan`, `BaseTestPlan`, `TestCase`, `TestCaseHandler`, `BaseTestCaseHandler`, `TestDescribe`, `AppTestDescribe`, `TestCaseDecisions` |
| **Extends** | `BaseTestPlan` (uses `Logger` + `MemoryStorageHelper`, does not extend `BaseHelper`) |
| **Runtimes** | Both |

#### Import Paths

```typescript
import {
  TestPlan,
  BaseTestPlan,
  TestCase,
  TestCaseHandler,
  BaseTestCaseHandler,
  TestDescribe,
  AppTestDescribe,
  TestCaseDecisions,
} from '@venizia/ignis-helpers';

import type {
  ITestContext,
  ITestPlan,
  ITestPlanOptions,
  ITestHooks,
  TTestHook,
  ITestCase,
  ITestCaseHandler,
  ITestCaseInput,
  ITestCaseHandlerOptions,
  ITestCaseOptions,
  TTestCaseDecision,
} from '@venizia/ignis-helpers';
```

## Creating an Instance

A test suite is assembled from three layers: a **TestCaseHandler** (execution + validation logic), a **TestCase** (metadata wrapper), and a **TestPlan** (orchestrator with hooks and shared context). The plan is then executed via **TestDescribe**.

```typescript
import {
  TestPlan,
  TestDescribe,
  TestCase,
  TestCaseHandler,
  TestCaseDecisions,
} from '@venizia/ignis-helpers';
import type { ITestContext, TTestCaseDecision } from '@venizia/ignis-helpers';

// 1. Define a handler
class MyTestHandler extends TestCaseHandler {
  async execute() {
    return { result: 'some-value' };
  }

  getValidator() {
    return (opts: { result: string }): TTestCaseDecision => {
      if (opts.result === 'some-value') {
        return TestCaseDecisions.SUCCESS;
      }
      return TestCaseDecisions.FAIL;
    };
  }
}

// 2. Create a test plan
const myTestPlan = TestPlan.newInstance({
  scope: 'My Feature',
  hooks: {
    before: async (testPlan) => console.log('Starting tests for:', testPlan.scope),
    after: async () => console.log('Finished tests.'),
  },
  testCases: [
    TestCase.withOptions({
      code: 'MY-FEATURE-001',
      description: 'It should return the correct value',
      expectation: 'The result should be "some-value"',
      handler: new MyTestHandler({ context: {} as any }),
    }),
  ],
});

// 3. Run the test plan
TestDescribe.withTestPlan({ testPlan: myTestPlan }).run();
```

## Usage

### Shared Context

`TestPlan` implements `ITestContext`, providing `bind()` and `getSync()` methods backed by a `MemoryStorageHelper` registry. Use this to share data between lifecycle hooks and test case handlers.

```typescript
import {
  TestPlan,
  TestDescribe,
  TestCase,
  TestCaseHandler,
  TestCaseDecisions,
} from '@venizia/ignis-helpers';
import type { ITestPlan, TTestCaseDecision } from '@venizia/ignis-helpers';

class SecureApiHandler extends TestCaseHandler<{ token: string }> {
  async execute() {
    const token = this.context.getSync<string>({ key: 'token' });
    const response = await app.request('/api/secure-data', {
      headers: { Authorization: `Bearer ${token}` },
    });
    return { status: response.status };
  }

  getValidator() {
    return (opts: { status: number }): TTestCaseDecision => {
      return opts.status === 200
        ? TestCaseDecisions.SUCCESS
        : TestCaseDecisions.FAIL;
    };
  }
}

const authTestPlan = TestPlan.newInstance<{ token: string }>({
  scope: 'Authentication',
  hooks: {
    before: async (testPlan: ITestPlan<{ token: string }>) => {
      const token = await generateTestToken();
      testPlan.bind({ key: 'token', value: token });
    },
  },
  testCases: [
    TestCase.withOptions({
      code: 'AUTH-001',
      description: 'Secure endpoint returns 200 with valid token',
      expectation: 'Response status is 200',
      handler: new SecureApiHandler({ context: {} as any }),
    }),
  ],
});

TestDescribe.withTestPlan({ testPlan: authTestPlan }).run();
```

### Test Case Resolver

Instead of (or in addition to) providing `testCases` directly, supply a `testCaseResolver` function that dynamically generates test cases at plan construction time. The resolver receives the plan context. Both `testCases` and `testCaseResolver` results are concatenated.

```typescript
const plan = TestPlan.newInstance({
  scope: 'Dynamic Tests',
  testCaseResolver: ({ context }) => {
    return endpoints.map((endpoint) =>
      TestCase.withOptions({
        code: `EP-${endpoint.name}`,
        description: `Test ${endpoint.name}`,
        expectation: 'Returns 200',
        handler: new EndpointHandler({ context }),
      }),
    );
  },
});
```

### Handler Arguments

Handlers support `args` (static) and `argResolver` (dynamic) for injecting test-specific input data. If both are omitted, `getArguments()` returns `null`. If both are provided, `args` takes priority.

```typescript
class CreateUserHandler extends TestCaseHandler<{}, { name: string }> {
  async execute() {
    const args = this.getArguments(); // { name: 'Alice' }
    return await userService.create(args!);
  }

  getValidator() {
    return (user: { id: string; name: string }): TTestCaseDecision => {
      return user.name === 'Alice'
        ? TestCaseDecisions.SUCCESS
        : TestCaseDecisions.FAIL;
    };
  }
}

// Static args
new CreateUserHandler({ context: {} as any, args: { name: 'Alice' } });

// Dynamic args via resolver
new CreateUserHandler({
  context: {} as any,
  argResolver: () => ({ name: 'Alice' }),
});
```

### Lifecycle Hooks

Hooks are registered via `ITestPlanOptions.hooks` and executed by `TestDescribe` using `node:test`'s `before`, `beforeEach`, `after`, and `afterEach` functions.

| Hook | When | Purpose |
|------|------|---------|
| `before` | Before all tests | Setup (e.g., start server, seed database) |
| `beforeEach` | Before each test | Reset state |
| `afterEach` | After each test | Cleanup per test |
| `after` | After all tests | Cleanup (e.g., close connections) |

> [!NOTE]
> Hook callbacks receive the full `ITestPlan` instance (not just the context), giving access to `bind()`, `getSync()`, `getTestCases()`, `getHooks()`, and `getRegistry()`.

```typescript
const plan = TestPlan.newInstance<{ db: Database }>({
  scope: 'With Hooks',
  hooks: {
    before: async (testPlan) => {
      const db = await connectDatabase();
      testPlan.bind({ key: 'db', value: db });
    },
    afterEach: async (testPlan) => {
      const db = testPlan.getSync<Database>({ key: 'db' });
      await db.truncateAll();
    },
    after: async (testPlan) => {
      const db = testPlan.getSync<Database>({ key: 'db' });
      await db.close();
    },
  },
  testCases: [/* ... */],
});
```

### Modifying Test Cases After Construction

`BaseTestPlan` exposes `withTestCases()` for replacing the test case array after construction. This returns `this` for chaining.

```typescript
const plan = TestPlan.newInstance({ scope: 'Mutable' });
plan.withTestCases({
  testCases: [
    TestCase.withOptions({
      code: 'TC-001',
      description: 'Added after construction',
      expectation: 'Should pass',
      handler: myHandler,
    }),
  ],
});
```

> [!WARNING]
> `withTestCases()` fully replaces the existing test case array rather than appending to it.

### TestCaseDecisions

Test case validators must return one of these decision constants:

| Decision | Value | Meaning |
|----------|-------|---------|
| `SUCCESS` | `'200_SUCCESS'` | Test passed |
| `FAIL` | `'000_FAIL'` | Test failed |
| `UNKNOWN` | `'000_UNKNOWN'` | No decision reached (treated as failure by `_execute()`) |

The `_execute()` method on `TestCaseHandler` calls `assert.equal(validateRs, TestCaseDecisions.SUCCESS)`, so any value other than `'200_SUCCESS'` causes the test to fail.

## API Summary

### Class Hierarchy

```
BaseTestCaseHandler (abstract)
  └── TestCaseHandler (abstract) -- execute(), getValidator(), validate()
                                       └── Your concrete handler

BaseTestPlan (abstract)
  └── TestPlan -- newInstance()

TestDescribe -- withTestPlan(), run()
  └── AppTestDescribe
```

### ITestPlanOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `scope` | `string` | -- | Name for the test suite (used as the `describe()` label). Required. |
| `hooks` | `ITestHooks<R>` | `{}` | Lifecycle hooks (`before`, `beforeEach`, `after`, `afterEach`). |
| `testCases` | `Array<ITestCase<R>>` | `[]` | Static list of test cases. |
| `testCaseResolver` | `(opts: { context: ITestContext<R> }) => Array<ITestCase<R>>` | `undefined` | Dynamic test case generator, receives the plan context. |

### BaseTestPlan / TestPlan Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `TestPlan.newInstance(opts)` | `TestPlan<R>` | Static factory method. |
| `withTestCases({ testCases })` | `this` | Replace the plan's test case array. |
| `getTestCases()` | `Array<ITestCase<R>>` | Get all registered test cases. |
| `getHooks()` | `ITestHooks<R>` | Get all lifecycle hooks. |
| `getHook({ key })` | `TTestHook<R> \| null` | Get a specific hook by name. |
| `getRegistry()` | `MemoryStorageHelper<R>` | Get the backing context registry. |
| `getContext()` | `ITestContext<R>` | Returns `this` (the plan is the context). |
| `bind({ key, value })` | `void` | Store a value in the context registry. |
| `getSync({ key })` | `T` | Retrieve a value from the context registry. |
| `execute()` | `void` | Run all test cases via `node:test` `it()` blocks. |

### ITestCaseOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `code` | `string` | -- | Unique test case identifier (e.g., `'AUTH-001'`). Required, must be non-empty. |
| `name` | `string` | `undefined` | Optional short name for the test case. |
| `description` | `string` | -- | What the test case does. Required, must be non-empty. |
| `expectation` | `string` | `undefined` | Expected outcome description. Validated as required and non-empty by constructor. |
| `handler` | `TestCaseHandler<R, I>` | -- | The handler that executes and validates the test. Required. |

### TestCase Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `TestCase.withOptions(opts)` | `TestCase<R, I>` | Static factory. Validates `code`, `description`, `expectation` are non-empty. |
| `run()` | `Promise<void>` | Delegates to `handler._execute()`. |

### ITestCaseHandlerOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `scope` | `string` | `'TestCaseHandler'` | Logger scope. |
| `context` | `ITestContext<R>` | -- | The test plan context for shared state. Required. |
| `args` | `I \| null` | `null` | Static arguments for the handler. |
| `argResolver` | `(...args: any[]) => I \| null` | `undefined` | Dynamic argument resolver, called once at construction. |
| `validator` | `(opts: any) => ValueOrPromise<TTestCaseDecision>` | `undefined` | Validator function. Overrides `getValidator()` if provided. |

### TestCaseHandler Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `execute()` | `ValueOrPromise<any>` | **Abstract.** Perform the action under test. |
| `getValidator()` | `((opts) => ValueOrPromise<TTestCaseDecision>) \| null` | **Abstract.** Return a validator function or `null`. |
| `validate(opts)` | `ValueOrPromise<TTestCaseDecision>` | Runs the validator (from `this.validator` or `getValidator()`). |
| `getArguments()` | `I \| null` | Returns the handler's `args`. |
| `_execute()` | `Promise<void>` | Internal. Calls `execute()`, then `validate()`, then `assert.equal(result, SUCCESS)`. |

### TestDescribe Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `TestDescribe.withTestPlan({ testPlan })` | `TestDescribe<R>` | Static factory method. |
| `run()` | `void` | Wraps the test plan in a `node:test` `describe()` block with all lifecycle hooks wired up. Throws if `testPlan` is not set. |

### Type Definitions

#### ITestContext

```typescript
interface ITestContext<R extends object> {
  scope: string;
  getRegistry: () => MemoryStorageHelper<R>;
  bind: <T>(opts: { key: string; value: T }) => void;
  getSync: <E = AnyType>(opts: { key: keyof R }) => E;
}
```

#### ITestPlan

```typescript
interface ITestPlan<R extends object = {}> extends ITestContext<R> {
  getTestCases: () => Array<ITestCase<R>>;
  getContext: () => ITestContext<R>;
  getHooks: () => ITestHooks<R>;
  getHook: (opts: { key: keyof ITestHooks<R> }) => TTestHook<R> | null;
  execute: () => ValueOrPromise<void>;
}
```

#### ITestHooks / TTestHook

```typescript
type TTestHook<R extends object> = (testPlan: ITestPlan<R>) => ValueOrPromise<void>;

interface ITestHooks<R extends object> {
  before?: TTestHook<R>;
  beforeEach?: TTestHook<R>;
  after?: TTestHook<R>;
  afterEach?: TTestHook<R>;
}
```

#### ITestCase

```typescript
interface ITestCase<R extends object = {}, I extends object = {}> {
  code: string;
  name?: string;
  description: string;
  expectation?: string;
  handler: ITestCaseHandler<R, I>;
  run: () => ValueOrPromise<void>;
}
```

#### ITestCaseHandler

```typescript
interface ITestCaseHandler<R extends object = {}, I extends object = {}> {
  context: ITestContext<R>;
  args: I | null;
  validator?: (args: AnyObject) => ValueOrPromise<TTestCaseDecision>;
}
```

#### TTestCaseDecision

```typescript
type TTestCaseDecision = '000_UNKNOWN' | '000_FAIL' | '200_SUCCESS';
```

## Troubleshooting

### "[validate] Invalid test case validator!"

**Cause:** `TestCaseHandler.validate()` is called but neither a `validator` was passed in the constructor options nor does `getValidator()` return a function.

**Fix:** Implement `getValidator()` to return a validation function, or pass a `validator` in the handler options:

```typescript
// Option 1: Implement getValidator()
class MyHandler extends TestCaseHandler {
  execute() { return { ok: true }; }
  getValidator() {
    return (opts: { ok: boolean }) =>
      opts.ok ? TestCaseDecisions.SUCCESS : TestCaseDecisions.FAIL;
  }
}

// Option 2: Pass validator in constructor options
new MyHandler({
  context: {} as any,
  validator: (opts) => opts.ok ? TestCaseDecisions.SUCCESS : TestCaseDecisions.FAIL,
});
```

### "[TestCase] Invalid value for key: \<key\> | value: \<value\> | Opts: ..."

**Cause:** `TestCase.withOptions()` validates that `code`, `description`, and `expectation` are all non-empty strings. If any is missing or empty, this error is thrown.

**Fix:** Ensure all three required fields are provided:

```typescript
// Wrong -- missing expectation
TestCase.withOptions({
  code: 'TC-001',
  description: 'Some test',
  handler: myHandler,
});

// Correct
TestCase.withOptions({
  code: 'TC-001',
  description: 'Some test',
  expectation: 'Should return 200',
  handler: myHandler,
});
```

### "[run] Invalid test plan!"

**Cause:** `TestDescribe.run()` was called but `this.testPlan` is falsy. This happens if the `TestDescribe` instance was constructed without a valid test plan.

**Fix:** Ensure a valid `ITestPlan` is provided via the constructor or `withTestPlan()`:

```typescript
const describe = TestDescribe.withTestPlan({ testPlan: myTestPlan });
describe.run();
```

### Tests run but always fail with assertion error

**Cause:** The `_execute()` method on `TestCaseHandler` asserts that the validation result equals `TestCaseDecisions.SUCCESS` (`'200_SUCCESS'`). If your validator returns `undefined`, `null`, or a string that is not exactly `'200_SUCCESS'`, the assertion fails.

**Fix:** Ensure your validator always returns one of the `TestCaseDecisions` constants and that the success path returns `TestCaseDecisions.SUCCESS` explicitly:

```typescript
getValidator() {
  return (opts: { value: number }): TTestCaseDecision => {
    // Always return an explicit decision constant
    return opts.value > 0
      ? TestCaseDecisions.SUCCESS
      : TestCaseDecisions.FAIL;
  };
}
```

### "Failed to execute test handler | Error: ..."

**Cause:** An unhandled exception was thrown inside `execute()` or `validate()` within `_execute()`. The error is caught and logged, but `validateRs` remains `TestCaseDecisions.UNKNOWN`, causing the subsequent `assert.equal` to fail.

**Fix:** Check the logged error message for the root cause. Common issues include missing context values (calling `getSync()` for a key that was never `bind()`-ed) or network/database errors in the handler's `execute()` method.

## See Also

- **Related Concepts:**
  - [Dependency Injection](/guides/core-concepts/dependency-injection) -- Testing with DI
  - [Application](/guides/core-concepts/application/) -- Application lifecycle in tests

- **Other Helpers:**
  - [Helpers Index](../index) -- All available helpers

- **External Resources:**
  - [Node.js Test Runner](https://nodejs.org/api/test.html) -- Native `node:test` module documentation
