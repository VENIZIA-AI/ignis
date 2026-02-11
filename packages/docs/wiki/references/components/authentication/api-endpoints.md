# API Endpoints

The built-in auth controller is created by the `defineAuthController()` factory function and is only available when `useAuthController: true` is set in `REST_OPTIONS`.

| Method | Path | Auth Required | Description |
|--------|------|---------------|-------------|
| `POST` | `/auth/sign-in` | No | Authenticate and receive a JWT token |
| `POST` | `/auth/sign-up` | Configurable | Create a new user account |
| `POST` | `/auth/change-password` | JWT | Change the authenticated user's password |
| `GET` | `/auth/who-am-i` | JWT | Return the current user's JWT payload |

> [!NOTE]
> The base path `/auth` is configurable via `controllerOpts.restPath`. All paths shown above use the default.

::: details API Specifications

**POST /auth/sign-in**

Request body uses `SignInRequestSchema` by default, or a custom schema via `payload.signIn.request.schema`.

Response `200`:
```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9..."
}
```

**POST /auth/sign-up**

Request body uses `SignUpRequestSchema` by default, or a custom schema via `payload.signUp.request.schema`.

Authentication: No authentication by default. Set `requireAuthenticatedSignUp: true` in controller options to require JWT authentication.

Response `200`:
```json
{
  "id": "user-id",
  "...": "..."
}
```

**POST /auth/change-password**

Request body uses `ChangePasswordRequestSchema` by default, or a custom schema via `payload.changePassword.request.schema`.

Authentication: Always requires JWT (`Authentication.STRATEGY_JWT`).

Response `200`:
```json
{
  "success": true
}
```

**GET /auth/who-am-i**

No request body. Requires JWT authentication.

Response `200`:
```json
{
  "userId": "123",
  "roles": [
    { "id": "1", "identifier": "admin", "priority": 0 }
  ],
  "clientId": "optional-client-id",
  "provider": "optional-provider",
  "email": "user@example.com"
}
```

:::

## Controller Factory

The `defineAuthController()` function dynamically creates a controller class at runtime:

- It uses `@controller({ path: restPath })` to set the base path
- The auth service is injected via `@inject({ key: serviceKey })` where `serviceKey` defaults to `'services.AuthenticationService'`
- Routes are defined in the controller's `binding()` method using `this.defineRoute()`
- Custom Zod schemas can be provided per endpoint via the `payload` option

> [!TIP]
> If the default request/response schemas do not fit your needs, provide custom Zod schemas through the `payload` option in `controllerOpts`. This allows full control over validation while keeping the built-in routing.
