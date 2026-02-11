# Troubleshooting

### Error response missing `stack` and `cause`

**Cause:** The application is running in production mode. Development-only fields (`stack`, `cause`, `url`, `path`) are stripped in production for security.

**Fix:** Set `NODE_ENV=development` to see full error details during debugging.

### `statusCode` defaults to 400

**Cause:** `getError()` was called without specifying a `statusCode`. The `ApplicationError` constructor defaults to `400` (Bad Request).

**Fix:** Always provide an explicit status code using `HTTP.ResultCodes`:

```typescript
throw getError({
  message: 'Resource not found',
  statusCode: HTTP.ResultCodes.RS_4.NotFound,
});
```
