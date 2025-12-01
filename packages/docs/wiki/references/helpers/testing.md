# Testing Helper

The Testing helper in Ignis provides a structured and extensible framework for defining and executing tests, integrating with Node.js's native `node:test` module. It promotes a clear separation of test execution from validation.

## Core Concepts

-   **`TestPlan`**: Organizes a collection of `TestCase` units into a test suite. It manages lifecycle hooks (`before`, `after`, etc.) and a shared context for its test cases.
-   **`TestCase`**: Represents a single, runnable test unit. It contains metadata (like a description and expectation) and a `TestCaseHandler`.
-   **`TestCaseHandler`**: An abstract class that encapsulates the execution (`execute`) and validation (`validate`) logic for a test case.

## Creating a Test Plan

A test plan is the main entry point for a test suite. You define the scope, hooks, and test cases within the plan.

```typescript
// __tests__/my-feature.test.ts
import { TestPlan, TestDescribe, TestCase, TestCaseHandler, TestCaseDecisions } from '@vez/ignis';

// 1. Define a Test Case Handler
class MyTestHandler extends TestCaseHandler {
  async execute() {
    // Perform the action to be tested
    return { result: 'some-value' };
  }

  getValidator() {
    return (opts: { result: string }) => {
      if (opts.result === 'some-value') {
        return TestCaseDecisions.SUCCESS;
      }
      return TestCaseDecisions.FAIL;
    };
  }
}

// 2. Create a Test Plan
const myTestPlan = TestPlan.newInstance({
  scope: 'My Feature',
  hooks: {
    before: async () => console.log('Starting My Feature tests...'),
    after: async () => console.log('Finished My Feature tests.'),
  },
  testCases: [
    TestCase.withOptions({
      code: 'MY-FEATURE-001',
      description: 'It should return the correct value',
      expectation: 'The result should be "some-value"',
      handler: new MyTestHandler({ context: {} as any }), // Context is provided by the plan
    }),
  ],
});

// 3. Run the Test Plan
TestDescribe.withTestPlan({ testPlan: myTestPlan }).run();
```

## Shared Context

The `TestPlan` provides a `context` that can be used to share data between test cases and hooks. This is useful for setup tasks like creating a JWT token or seeding a database.

```typescript
// __tests__/auth.test.ts
import { TestPlan, TestDescribe, TestCase, TestCaseHandler, ITestContext } from '@vez/ignis';

// A handler that uses the context
class SecureApiHandler extends TestCaseHandler<{ token: string }> {
  async execute() {
    const token = this.context.getSync<{ token: string }>({ key: 'token' });
    const response = await app.request('/api/secure-data', {
      headers: { Authorization: `Bearer ${token}` },
    });
    return { status: response.status };
  }
  // ... validator
}

const authTestPlan = TestPlan.newInstance({
  scope: 'Authentication',
  hooks: {
    before: async (context: ITestContext<{ token: string }>) => {
      // Generate a token and bind it to the context
      const token = await generateTestToken();
      context.bind({ key: 'token', value: token });
    },
  },
  testCases: [
    TestCase.withOptions({
      // ...
      handler: new SecureApiHandler({ context: {} as any }),
    }),
  ],
});

TestDescribe.withTestPlan({ testPlan: authTestPlan }).run();
```
