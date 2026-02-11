# Troubleshooting

Required for all helpers. Lists 2-5 common errors with causes and fixes.

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

1. Helper source: look for `throw getError()`, `ApplicationError`, and `this.logger.error()`
2. Constructor validation: invalid options, missing required fields
3. Runtime errors: connection failures, timeout, invalid state

```
packages/helpers/src/helpers/{name}/helper.ts
packages/helpers/src/helpers/{name}/common/constants.ts
```

## Example

From the Redis helper:

```markdown
### Connection Refused / Timeout

**Symptoms:** `ECONNREFUSED`, connection hangs, or `onError` fires immediately.

**Checklist:**
- Verify Redis is running at the configured `host:port`
- Check firewall rules
- If using `autoConnect: false`, call `await client.connect()` before operations
- Verify `password` is correct

### Pub/Sub Subscriber Mode Conflicts

**Symptoms:** `ERR only (P|S)SUBSCRIBE / (P|S)UNSUBSCRIBE / PING / QUIT allowed`

**Cause:** Called `subscribe()` then attempted a regular command on the same client.

**Fix:** Use separate connections for Pub/Sub and data operations.
```

## Checklist Format

For infrastructure-related errors (connections, permissions), use a checklist instead of Cause/Fix:

```markdown
**Checklist:**
- Point 1
- Point 2
- Point 3
```
