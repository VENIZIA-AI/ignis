# Usage

## Shared Context

The `TestPlan` implements `ITestContext`, providing `bind()` and `getSync()` methods backed by a `MemoryStorageHelper` registry. Use this to share data between hooks and test cases.

```typescript
import {
  TestPlan,
  TestDescribe,
  TestCase,
  TestCaseHandler,
} from '@venizia/ignis-helpers';
import type { ITestPlan } from '@venizia/ignis-helpers';

// A handler that reads from context
class SecureApiHandler extends TestCaseHandler<{ token: string }> {
  async execute() {
    const token = this.context.getSync<string>({ key: 'token' });
    const response = await app.request('/api/secure-data', {
      headers: { Authorization: `Bearer ${token}` },
    });
    return { status: response.status };
  }

  getValidator() {
    return (opts: { status: number }) => {
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

## Test Case Resolver

Instead of (or in addition to) providing `testCases` directly, you can supply a `testCaseResolver` function that dynamically generates test cases at plan construction time. The resolver receives the plan context.

```typescript
const plan = TestPlan.newInstance({
  scope: 'Dynamic Tests',
  testCaseResolver: ({ context }) => {
    return endpoints.map((endpoint) =>
      TestCase.withOptions({
        code: `EP-${endpoint.name}`,
        description: `Test ${endpoint.name}`,
        expectation: `Returns 200`,
        handler: new EndpointHandler({ context }),
      }),
    );
  },
});
```

## Handler Arguments

Handlers support `args` and `argResolver` for injecting test-specific input data.

```typescript
class CreateUserHandler extends TestCaseHandler<{}, { name: string }> {
  async execute() {
    const args = this.getArguments(); // { name: 'Alice' }
    return await userService.create(args!);
  }

  getValidator() {
    return (user: { id: string; name: string }) => {
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

## Modifying Test Cases After Construction

`BaseTestPlan` exposes `withTestCases()` for replacing the test case array after construction.

```typescript
const plan = TestPlan.newInstance({ scope: 'Mutable' });
plan.withTestCases({
  testCases: [
    TestCase.withOptions({ /* ... */ }),
  ],
});
```

## API Reference

::: details ITestContext
```typescript
interface ITestContext<R extends object> {
  scope: string;
  getRegistry: () => MemoryStorageHelper<R>;
  bind: <T>(opts: { key: string; value: T }) => void;
  getSync: <E = AnyType>(opts: { key: keyof R }) => E;
}
```
:::

::: details ITestPlan
```typescript
interface ITestPlan<R extends object = {}> extends ITestContext<R> {
  getTestCases: () => Array<ITestCase<R>>;
  getContext: () => ITestContext<R>;
  getHooks: () => ITestHooks<R>;
  getHook: (opts: { key: keyof ITestHooks<R> }) => TTestHook<R> | null;
  execute: () => ValueOrPromise<void>;
}
```
:::

::: details ITestPlanOptions
```typescript
interface ITestPlanOptions<R extends object> {
  scope: string;
  hooks?: ITestHooks<R>;
  testCases?: Array<ITestCase<R>>;
  testCaseResolver?: (opts: { context: ITestContext<R> }) => Array<ITestCase<R>>;
}
```
:::

::: details ITestHooks and TTestHook
```typescript
type TTestHook<R extends object> = (testPlan: ITestPlan<R>) => ValueOrPromise<void>;

interface ITestHooks<R extends object> {
  before?: TTestHook<R>;
  beforeEach?: TTestHook<R>;
  after?: TTestHook<R>;
  afterEach?: TTestHook<R>;
}
```
:::

::: details ITestCase
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
:::

::: details ITestCaseOptions
```typescript
interface ITestCaseOptions<R extends object = {}, I extends object = {}> {
  code: string;
  name?: string;
  description: string;
  expectation?: string;
  handler: TestCaseHandler<R, I>;
}
```
`TestCase.withOptions()` validates that `code`, `description`, and `expectation` are non-empty.
:::

::: details ITestCaseHandler
```typescript
interface ITestCaseHandler<R extends object = {}, I extends object = {}> {
  context: ITestContext<R>;
  args: I | null;
  validator?: (args: AnyObject) => ValueOrPromise<TTestCaseDecision>;
}
```
:::

::: details ITestCaseHandlerOptions
```typescript
interface ITestCaseHandlerOptions<R extends object, I extends ITestCaseInput = {}> {
  scope?: string;
  context: ITestContext<R>;
  args?: I | null;
  argResolver?: (...args: any[]) => I | null;
  validator?: (opts: any) => ValueOrPromise<TTestCaseDecision>;
}
```
:::

::: details TTestCaseDecision
```typescript
type TTestCaseDecision = '000_UNKNOWN' | '000_FAIL' | '200_SUCCESS';
```
:::

## Class Hierarchy

```
BaseTestCaseHandler (abstract)
  └── TestCaseHandler (abstract) ── execute(), getValidator(), validate()
                                       └── Your concrete handler

BaseTestPlan (abstract)
  └── TestPlan ── newInstance()

TestDescribe ── withTestPlan(), run()
  └── AppTestDescribe
```

### TestCaseHandler Methods

| Method | Returns | Purpose |
|--------|---------|---------|
| `execute()` | `ValueOrPromise<any>` | **Abstract** -- perform the action under test |
| `getValidator()` | `((opts) => ValueOrPromise<TTestCaseDecision>) \| null` | **Abstract** -- return a validator function or `null` |
| `validate(opts)` | `ValueOrPromise<TTestCaseDecision>` | Runs the validator (from `this.validator` or `getValidator()`) |
| `getArguments()` | `I \| null` | Returns the handler's `args` |
| `_execute()` | `Promise<void>` | Internal -- calls `execute()`, then `validate()`, then `assert.equal(result, SUCCESS)` |

### BaseTestPlan / TestPlan Methods

| Method | Returns | Purpose |
|--------|---------|---------|
| `TestPlan.newInstance(opts)` | `TestPlan<R>` | Factory method |
| `withTestCases({ testCases })` | `this` | Replace the plan's test cases |
| `getTestCases()` | `Array<ITestCase<R>>` | Get all registered test cases |
| `getHooks()` | `ITestHooks<R>` | Get all lifecycle hooks |
| `getHook({ key })` | `TTestHook<R> \| null` | Get a specific hook by name |
| `getRegistry()` | `MemoryStorageHelper<R>` | Get the backing context registry |
| `getContext()` | `ITestContext<R>` | Returns `this` (the plan is the context) |
| `bind({ key, value })` | `void` | Store a value in the context registry |
| `getSync({ key })` | `T` | Retrieve a value from the context registry |
| `execute()` | `void` | Run all test cases via `node:test` `it()` blocks |

### TestDescribe Methods

| Method | Returns | Purpose |
|--------|---------|---------|
| `TestDescribe.withTestPlan({ testPlan })` | `TestDescribe<R>` | Factory method |
| `run()` | `void` | Wraps test plan in `node:test` `describe()` with lifecycle hooks |
