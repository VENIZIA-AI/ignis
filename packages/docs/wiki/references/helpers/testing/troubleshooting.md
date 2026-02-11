# Troubleshooting

### Validator throws "Invalid test case validator!"

**Full message:** `[validate] Invalid test case validator!`

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

### Test case construction fails with "Invalid value for key"

**Full message:** `[TestCase] Invalid value for key: <key> | value: <value> | Opts: ...`

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

### Tests run but always fail with assertion error

**Cause:** The `_execute()` method on `TestCaseHandler` asserts that the validation result equals `TestCaseDecisions.SUCCESS` (`'200_SUCCESS'`). If your validator returns `undefined`, `null`, or a string that is not exactly `'200_SUCCESS'`, the assertion fails.

**Fix:** Ensure your validator always returns one of the `TestCaseDecisions` constants and that the success path returns `TestCaseDecisions.SUCCESS` explicitly.
