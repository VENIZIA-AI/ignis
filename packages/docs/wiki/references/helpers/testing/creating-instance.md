# Creating an Instance

A test plan is the main entry point for a test suite. You define the scope, hooks, and test cases within the plan.

```typescript
import {
  TestPlan,
  TestDescribe,
  TestCase,
  TestCaseHandler,
  TestCaseDecisions,
} from '@venizia/ignis-helpers';
import type { ITestContext, TTestCaseDecision } from '@venizia/ignis-helpers';

// 1. Define a Test Case Handler
class MyTestHandler extends TestCaseHandler {
  async execute() {
    // Perform the action to be tested
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

// 2. Create a Test Plan
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

// 3. Run the Test Plan
TestDescribe.withTestPlan({ testPlan: myTestPlan }).run();
```
