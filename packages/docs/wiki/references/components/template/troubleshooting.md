# Troubleshooting

Required for all components. Lists 2-5 common errors with causes and fixes.

## Structure

```markdown
## Troubleshooting

### "Exact error message or symptom"

**Cause:** Why this happens.

**Fix:** How to resolve it:

` ``typescript
// Fix example if applicable
` ``

### "Another common issue"

**Cause:** Why this happens.

**Fix:** How to resolve it.
```

## Rules

- **Heading** uses the exact error message in quotes, or a clear symptom description
- **Cause** is 1-2 sentences explaining why
- **Fix** includes a code example when the fix involves code changes
- Minimum 2 entries, maximum 5
- Order by frequency — most common issue first

## Where to Find Error Messages

1. Component source: `component.ts` — look for `throw getError()` and `ApplicationError`
2. Helper source: the underlying helper's error handling
3. Common misconfiguration patterns from the binding keys and options

## Example

From the Authentication component:

```markdown
### "No authentication strategy bound"

**Cause:** The component requires `AuthenticateKeys.STRATEGY` to be bound
before it initializes. This binding was not found in the DI container.

**Fix:** Bind the strategy in your application's `preConfigure()`:

` ``typescript
this.bind<TAuthStrategy>({ key: AuthenticateKeys.STRATEGY }).toValue('jwt');
` ``
```
