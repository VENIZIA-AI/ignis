# Creating an Instance

## `ApplicationError`

Extends native `Error` with HTTP status codes and machine-readable message codes.

```typescript
import { getError, HTTP } from '@venizia/ignis';

// Throw an error for a resource not found
throw getError({
  message: 'User not found',
  statusCode: HTTP.ResultCodes.RS_4.NotFound,
  messageCode: 'USER_NOT_FOUND',
});
```

## `getError()` Utility

For convenience, you can use the `getError()` utility function to create `ApplicationError` instances.

```typescript
import { getError, HTTP } from '@venizia/ignis';

throw getError({
  message: 'Invalid credentials',
  statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
});
```

::: details TError Schema
```typescript
const ErrorSchema = z
  .object({
    name: z.string().optional(),
    statusCode: z.number().optional(),
    messageCode: z.string().optional(),
    message: z.string(),
  })
  .catchall(z.any());
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `message` | `string` | -- | Error message (required) |
| `statusCode` | `number` | `400` | HTTP status code |
| `messageCode` | `string` | -- | Machine-readable error code |
| `name` | `string` | -- | Error name |
:::
