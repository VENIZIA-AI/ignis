# Usage

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
