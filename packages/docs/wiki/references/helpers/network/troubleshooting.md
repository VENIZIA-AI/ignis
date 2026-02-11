# Troubleshooting

### TCP Client reconnect loop never stops

**Cause:** `maxRetry` is set to `-1` (infinite retries) and the target server is unreachable.

**Fix:** Use a finite `maxRetry` value, or set `reconnect: false` if you handle reconnection logic externally. The reconnect delay is fixed at 5 seconds between attempts.

```typescript
const client = new NetworkTcpClient({
  identifier: 'my-client',
  options: { host: 'localhost', port: 8080 },
  reconnect: true,
  maxRetry: 5,  // Stop after 5 attempts
  // ...
});
```

### TCP Server: "Invalid authenticate duration"

**Cause:** `authenticateOptions.required` is `true` but `duration` is missing, zero, or negative.

**Fix:** Provide a positive `duration` value when authentication is required:

```typescript
// Correct
authenticateOptions: { required: true, duration: 5000 }

// Wrong -- will throw at construction
authenticateOptions: { required: true }
authenticateOptions: { required: true, duration: -1 }
```

### HTTP request timeout not working with NodeFetchNetworkRequest

**Cause:** The `timeout` option on the constructor's `networkOptions` is not automatically applied to individual requests. Timeout must be set per-request.

**Fix:** Pass `timeout` in each `send()` call:

```typescript
await this.getNetworkService().send({
  url: '/slow-endpoint',
  method: 'get',
  timeout: 5000,  // 5 second timeout per request
});
```

The `NodeFetcher` internally creates an `AbortController` and aborts the request after the specified timeout.
