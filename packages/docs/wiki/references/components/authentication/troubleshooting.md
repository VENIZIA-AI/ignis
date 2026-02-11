# Troubleshooting

### "At least one of jwtOptions or basicOptions must be provided"

**Cause:** The `AuthenticateComponent` requires at least one authentication method to be configured. Neither `JWT_OPTIONS` nor `BASIC_OPTIONS` was bound in the DI container.

**Fix:** Bind at least one set of options before registering the component:

```typescript
this.bind<IJWTTokenServiceOptions>({ key: AuthenticateBindingKeys.JWT_OPTIONS }).toValue({
  applicationSecret: process.env.APP_ENV_APPLICATION_SECRET,
  jwtSecret: process.env.APP_ENV_JWT_SECRET,
  getTokenExpiresFn: () => Number(process.env.APP_ENV_JWT_EXPIRES_IN || 86400),
});
```

### "Invalid jwtSecret" / "Invalid applicationSecret"

**Cause:** The JWT secret or application secret is missing, empty, or set to the default placeholder `'unknown_secret'`. The `JWTTokenService` validates these values during construction.

**Fix:** Set strong, unique values for both secrets in your environment variables:

```
APP_ENV_APPLICATION_SECRET=your-strong-application-secret
APP_ENV_JWT_SECRET=your-strong-jwt-secret
```

### "Auth controller requires jwtOptions to be configured"

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

### "Failed to init auth controller | Invalid injectable authentication service!"

**Cause:** The auth controller factory could not resolve the auth service from the DI container. The service key (default `'services.AuthenticationService'`) is not bound.

**Fix:** Register your `AuthenticationService` before registering the component:

```typescript
this.service(AuthenticationService);
// Then register the component
this.component(AuthenticateComponent);
```
