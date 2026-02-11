# Configuration Options

The Request Tracker component has no user-configurable options. Its behavior is fully automatic.

| Behavior | Description |
|----------|-------------|
| **Request ID** | Generated automatically via `hono/request-id` middleware |
| **IP Detection** | Uses `x-real-ip`, `x-forwarded-for` headers, or connection info |
| **Body Logging** | Logs request body and query params in non-production environments only |
| **Timing** | Measures and logs request duration in milliseconds |
| **Scope** | Registered as a singleton middleware |

> [!NOTE]
> In **production** (`NODE_ENV=production`), request body and query parameters are excluded from log output to prevent sensitive data exposure. Only the request ID, client IP, method, path, and duration are logged.
