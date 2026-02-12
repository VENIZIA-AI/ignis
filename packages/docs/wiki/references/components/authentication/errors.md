# Authentication -- Error Reference

> Complete error messages and troubleshooting for the authentication module. See [Setup & Configuration](./) for initial setup.

## Complete Error Reference

All error messages from the authentication module, organized by source:

### Component Errors (AuthenticateComponent)

| Error Message | Status | Method |
|---------------|--------|--------|
| `[AuthenticateComponent] At least one of jwtOptions or basicOptions must be provided` | 500 | `validateOptions` |
| <code v-pre>[defineJWTAuth] Invalid jwtSecret &#124; Provided: {{jwtSecret}}</code> | 500 | `defineJWTAuth` |
| <code v-pre>[defineJWTAuth] Invalid applicationSecret &#124; Provided: {{applicationSecret}}</code> | 500 | `defineJWTAuth` |
| `[defineJWTAuth] getTokenExpiresFn is required` | 500 | `defineJWTAuth` |
| `[defineBasicAuth] verifyCredentials function is required` | 500 | `defineBasicAuth` |
| `[defineControllers] Auth controller requires jwtOptions to be configured` | 500 | `defineControllers` |

### JWTTokenService Errors

| Error Message | Status | Method |
|---------------|--------|--------|
| `[JWTTokenService] Invalid jwtSecret` | 500 | `constructor` |
| `[JWTTokenService] Invalid applicationSecret` | 500 | `constructor` |
| `[JWTTokenService] Invalid getTokenExpiresFn` | 500 | `constructor` |
| `Unauthorized user! Missing authorization header` | 401 | `extractCredentials` |
| `Unauthorized user! Invalid schema of request token!` | 401 | `extractCredentials` |
| <code v-pre>Authorization header value is invalid format. It must follow the pattern: 'Bearer xx.yy.zz' where xx.yy.zz is a valid JWT token.</code> | 401 | `extractCredentials` |
| `[verify] Invalid request token!` | 401 | `verify` |
| <code v-pre>[verify] Failed to verify token &#124; Message: {{error.message}}</code> | 401 | `verify` |
| `[generate] Invalid token payload!` | 401 | `generate` |
| <code v-pre>[generate] Failed to generate token &#124; Error: {{error.message}}</code> | 500 | `generate` |

### BasicTokenService Errors

| Error Message | Status | Method |
|---------------|--------|--------|
| `[BasicTokenService] Invalid verifyCredentials function` | 500 | `constructor` |
| `Unauthorized! Missing authorization header` | 401 | `extractCredentials` |
| `Unauthorized! Invalid authorization schema, expected Basic` | 401 | `extractCredentials` |
| `Unauthorized! Invalid authorization header format` | 401 | `extractCredentials` |
| `Unauthorized! Invalid base64 credentials format` | 401 | `extractCredentials` |
| `Unauthorized! Invalid username or password` | 401 | `verify` |

### Strategy Registry Errors

| Error Message | Status | Method |
|---------------|--------|--------|
| <code v-pre>[getStrategyKey] Invalid strategy name &#124; name: {{name}}</code> | 500 | `getStrategyKey` |
| <code v-pre>[executeStrategy] Strategy not found: {{strategyName}}</code> | 500 | `executeStrategy` |
| <code v-pre>[executeStrategy] strategy: {{strategyName}} &#124; Authentication Strategy NOT FOUND</code> | 500 | `executeStrategy` |
| <code v-pre>Authentication failed. Tried strategies: {{strategies}}</code> | 401 | `authenticate` (any mode) |
| `Failed to identify authenticated user!` | 401 | `authenticate` (all mode) |
| <code v-pre>Invalid authentication mode &#124; mode: {{mode}}</code> | 500 | `authenticate` (default) |

### Controller Factory Errors

| Error Message | Status | Method |
|---------------|--------|--------|
| `[AuthController] Failed to init auth controller | Invalid injectable authentication service!` | 500 | `constructor` |

## Troubleshooting

### "[AuthenticateComponent] At least one of jwtOptions or basicOptions must be provided"

**Cause:** The `AuthenticateComponent` requires at least one authentication method to be configured. Neither `JWT_OPTIONS` nor `BASIC_OPTIONS` was bound in the DI container.

**Fix:** Bind at least one set of options before registering the component:

```typescript
this.bind<IJWTTokenServiceOptions>({ key: AuthenticateBindingKeys.JWT_OPTIONS }).toValue({
  applicationSecret: process.env.APP_ENV_APPLICATION_SECRET,
  jwtSecret: process.env.APP_ENV_JWT_SECRET,
  getTokenExpiresFn: () => Number(process.env.APP_ENV_JWT_EXPIRES_IN || 86400),
});
```

### "[defineJWTAuth] Invalid jwtSecret" / "[defineJWTAuth] Invalid applicationSecret"

**Cause:** The JWT secret or application secret is missing, empty, or set to the default placeholder `'unknown_secret'`. The component's `defineJWTAuth()` method validates these values during binding. The error message includes the actual provided value (e.g., <code v-pre>[defineJWTAuth] Invalid jwtSecret | Provided: {{jwtSecret}}</code>).

**Fix:** Set strong, unique values for both secrets in your environment variables:

```
APP_ENV_APPLICATION_SECRET=your-strong-application-secret
APP_ENV_JWT_SECRET=your-strong-jwt-secret
```

### "[defineJWTAuth] getTokenExpiresFn is required"

**Cause:** The `getTokenExpiresFn` function was not provided in the JWT options.

**Fix:** Include a `getTokenExpiresFn` in your JWT options binding:

```typescript
this.bind<IJWTTokenServiceOptions>({ key: AuthenticateBindingKeys.JWT_OPTIONS }).toValue({
  applicationSecret: process.env.APP_ENV_APPLICATION_SECRET,
  jwtSecret: process.env.APP_ENV_JWT_SECRET,
  getTokenExpiresFn: () => Number(process.env.APP_ENV_JWT_EXPIRES_IN || 86400),
});
```

### "[defineBasicAuth] verifyCredentials function is required"

**Cause:** `BASIC_OPTIONS` was bound but without a `verifyCredentials` callback function.

**Fix:** Provide a `verifyCredentials` function in the Basic options:

```typescript
this.bind<IBasicTokenServiceOptions>({ key: AuthenticateBindingKeys.BASIC_OPTIONS }).toValue({
  verifyCredentials: async (opts) => {
    // Your credential verification logic
    return { userId: user.id };
  },
});
```

### "[defineControllers] Auth controller requires jwtOptions to be configured"

**Cause:** The built-in auth controller (`useAuthController: true`) was enabled without binding JWT options. The auth controller requires JWT for token generation.

**Fix:** Always bind `JWT_OPTIONS` when using the auth controller:

```typescript
this.bind<TAuthenticationRestOptions>({ key: AuthenticateBindingKeys.REST_OPTIONS }).toValue({
  useAuthController: true,
  controllerOpts: { restPath: '/auth' },
});

// This is required when useAuthController is true
this.bind<IJWTTokenServiceOptions>({ key: AuthenticateBindingKeys.JWT_OPTIONS }).toValue({
  applicationSecret: process.env.APP_ENV_APPLICATION_SECRET,
  jwtSecret: process.env.APP_ENV_JWT_SECRET,
  getTokenExpiresFn: () => Number(process.env.APP_ENV_JWT_EXPIRES_IN || 86400),
});
```

### "Authentication failed. Tried strategies: jwt, basic"

**Cause:** All configured strategies failed to authenticate the request. In `'any'` mode, every strategy is tried in order; if none succeeds, this error is thrown with a `401 Unauthorized` status.

**Fix:** Verify the client is sending the correct `Authorization` header:
- For JWT: `Authorization: Bearer <token>`
- For Basic: `Authorization: Basic <base64(username:password)>`

Check that the token is not expired and the credentials are valid.

### "[AuthController] Failed to init auth controller | Invalid injectable authentication service!"

**Cause:** The auth controller factory could not resolve the auth service from the DI container. The service key (default `'services.AuthenticationService'`) is not bound.

**Fix:** Register your `AuthenticationService` before registering the component:

```typescript
this.service(AuthenticationService);
// Then register the component
this.component(AuthenticateComponent);
```

### "[JWTTokenService] Invalid jwtSecret" / "[JWTTokenService] Invalid applicationSecret" / "[JWTTokenService] Invalid getTokenExpiresFn"

**Cause:** The `JWTTokenService` constructor validates its injected options. These errors (status 500) occur when the service is instantiated with missing or falsy values. This is separate from the component-level `defineJWTAuth` validation and fires during DI resolution.

**Fix:** Ensure the bound `IJWTTokenServiceOptions` has all required fields populated with valid values.

### "[BasicTokenService] Invalid verifyCredentials function"

**Cause:** The `BasicTokenService` constructor validates that the injected `verifyCredentials` option is present. This error (status 500) fires during DI resolution.

**Fix:** Ensure the bound `IBasicTokenServiceOptions` includes a `verifyCredentials` function.

## See Also

- [Setup & Configuration](./) -- Binding keys, options interfaces, and initial setup
- [Usage & Examples](./usage) -- Securing routes, auth flows, and API endpoints
- [API Reference](./api) -- Architecture, service internals, and strategy registry
