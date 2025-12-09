# Error Helper

Standardized error handling with consistent responses across the application.

## Quick Reference

| Class/Function | Purpose |
|----------------|---------|
| **ApplicationError** | Custom error class with `statusCode` and `messageCode` |
| **getError()** | Utility to create `ApplicationError` instances |
| **appErrorHandler** | Middleware catching and formatting errors |

### Error Response Format

| Environment | Includes |
|-------------|----------|
| **Production** | `message`, `statusCode`, `requestId` |
| **Development** | Above + `stack`, `cause`, `url`, `path` |

## `ApplicationError`

Extends native `Error` with HTTP status codes and machine-readable message codes.

### Creating an `ApplicationError`

You can create a new `ApplicationError` with a message, status code, and an optional message code.

```typescript
import { ApplicationError, HTTP } from '@vez/ignis';

// Throw an error for a resource not found
throw new ApplicationError({
  message: 'User not found',
  statusCode: HTTP.ResultCodes.RS_4.NotFound,
  messageCode: 'USER_NOT_FOUND',
});
```

### `getError()` Utility

For convenience, you can use the `getError()` utility function to create `ApplicationError` instances.

```typescript
import { getError, HTTP } from '@vez/ignis';

throw getError({
  message: 'Invalid credentials',
  statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
});
```

## Error Handling Middleware

`Ignis` provides a default error handling middleware (`appErrorHandler`) that catches instances of `ApplicationError` (and other errors) and formats them into a consistent JSON response.

In development mode, the response will include the stack trace and error cause for easier debugging. In production, these details are omitted.

**Example Error Response (Production):**

```json
{
  "message": "User not found",
  "statusCode": 404,
  "requestId": "some-request-id"
}
```

**Example Error Response (Development):**

```json
{
  "message": "User not found",
  "statusCode": 404,
  "requestId": "some-request-id",
  "stack": "Error: User not found\n    at ...",
  "cause": "...",
  "url": "/api/users/123",
  "path": "/api/users/123"
}
```
