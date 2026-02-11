# Troubleshooting

### `get()` returns `undefined`

**Cause:** The key does not start with the configured prefix, so it was filtered out during construction.

**Fix:** Ensure your `.env` keys use the correct prefix:

```
# Wrong - missing prefix
SERVER_PORT=3000

# Correct - matches default prefix
APP_ENV_SERVER_PORT=3000
```

### Custom prefix not taking effect

**Cause:** `APPLICATION_ENV_PREFIX` must be set **before** the module loads. If it is set after import, the singleton is already constructed with the default `APP_ENV`.

**Fix:** Set the prefix in your `.env` file or at process start, before any import of `@venizia/ignis-helpers`:

```
APPLICATION_ENV_PREFIX=MY_APP_ENV
```

### `get<number>()` returns a string

**Cause:** `get<T>()` performs a TypeScript type cast, not a runtime conversion. All `process.env` values are strings.

**Fix:** Parse the value explicitly:

```typescript
const port = Number(applicationEnvironment.get<string>('APP_ENV_SERVER_PORT'));
```
