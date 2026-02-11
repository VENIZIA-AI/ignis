# Binding Keys

| Key | Constant | Type | Required | Default |
|-----|----------|------|----------|---------|
| `@app/authenticate/rest-options` | `AuthenticateBindingKeys.REST_OPTIONS` | `TAuthenticationRestOptions` | No | `{ useAuthController: false }` |
| `@app/authenticate/jwt-options` | `AuthenticateBindingKeys.JWT_OPTIONS` | `IJWTTokenServiceOptions` | Conditional | -- |
| `@app/authenticate/basic-options` | `AuthenticateBindingKeys.BASIC_OPTIONS` | `IBasicTokenServiceOptions` | Conditional | -- |

> [!IMPORTANT]
> At least one of `JWT_OPTIONS` or `BASIC_OPTIONS` must be bound. If neither is configured, the component will throw an error during `binding()`.

## Context Variables

These values are set on the Hono `Context` during authentication and can be accessed via `context.get()`:

| Key | Constant | Type | Description |
|-----|----------|------|-------------|
| `auth.current.user` | `Authentication.CURRENT_USER` | `IAuthUser` | Authenticated user payload |
| `audit.user.id` | `Authentication.AUDIT_USER_ID` | `IdType` | Authenticated user's ID |
| `authentication.skip` | `Authentication.SKIP_AUTHENTICATION` | `boolean` | Dynamically skip auth |

## Strategy Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `Authentication.STRATEGY_JWT` | `'jwt'` | JWT strategy name |
| `Authentication.STRATEGY_BASIC` | `'basic'` | Basic strategy name |
| `Authentication.TYPE_BEARER` | `'Bearer'` | Bearer token type |
| `Authentication.TYPE_BASIC` | `'Basic'` | Basic token type |
