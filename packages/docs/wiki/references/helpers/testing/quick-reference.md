# Quick Reference

| Component | Purpose |
|-----------|---------|
| **TestPlan** | Organizes test suite with lifecycle hooks, shared context, and test cases |
| **BaseTestPlan** | Abstract base class for `TestPlan` -- extend for custom plan behavior |
| **TestCase** | Single runnable test unit with metadata (code, description, expectation) |
| **TestCaseHandler** | Abstract handler encapsulating test execution and validation logic |
| **BaseTestCaseHandler** | Lower-level abstract base for `TestCaseHandler` |
| **TestDescribe** | Runs a test plan inside a `node:test` `describe()` block with hooks |
| **AppTestDescribe** | Subclass of `TestDescribe` for application-level test suites |
| **TestCaseDecisions** | Constants for test outcomes: `SUCCESS`, `FAIL`, `UNKNOWN` |

::: details Import Paths
```typescript
// Via helpers directly (testing is NOT re-exported from @venizia/ignis)
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

// Types
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
:::

### Test Lifecycle Hooks

| Hook | When | Purpose |
|------|------|---------|
| `before` | Before all tests | Setup (e.g., start server, seed DB) |
| `after` | After all tests | Cleanup (e.g., close connections) |
| `beforeEach` | Before each test | Reset state |
| `afterEach` | After each test | Cleanup per test |

> [!NOTE]
> Hook callbacks receive the full `ITestPlan` instance (not just the context), giving access to `bind()`, `getSync()`, `getTestCases()`, `getHooks()`, and `getRegistry()`.

### TestCaseDecisions

| Decision | Value | Meaning |
|----------|-------|---------|
| `SUCCESS` | `'200_SUCCESS'` | Test passed |
| `FAIL` | `'000_FAIL'` | Test failed |
| `UNKNOWN` | `'000_UNKNOWN'` | No decision reached (treated as failure) |
