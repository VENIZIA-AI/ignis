# Authentication -- API Reference

> Architecture, service internals, strategy registry, and controller factory. See [Setup & Configuration](./) for initial setup.

## Architecture

```
  ┌──────────────────────────────────────────────────────────┐
  │                     Application                          │
  │                                                          │
  │  preConfigure()                                          │
  │    ├── bind JWT_OPTIONS / BASIC_OPTIONS / REST_OPTIONS   │
  │    ├── this.component(AuthenticateComponent)             │
  │    └── AuthenticationStrategyRegistry.register()         │
  └──────────────────────┬───────────────────────────────────┘
                         │
                         ▼
  ┌──────────────────────────────────────────────────────────┐
  │              AuthenticateComponent.binding()              │
  │                                                          │
  │  1. validateOptions() — at least one auth required       │
  │  2. defineJWTAuth() — bind JWTTokenService               │
  │  3. defineBasicAuth() — bind BasicTokenService           │
  │  4. defineControllers() — defineAuthController()         │
  │  5. defineOAuth2() — stub (not yet implemented)          │
  └──────────────────────┬───────────────────────────────────┘
                         │
           ┌─────────────┼─────────────┐
           ▼             ▼             ▼
  ┌────────────┐ ┌──────────────┐ ┌──────────────────┐
  │ JWTToken   │ │ BasicToken   │ │  AuthController   │
  │ Service    │ │ Service      │ │  (factory-built)  │
  └──────┬─────┘ └──────┬───────┘ └────────┬─────────┘
         │              │                   │
         ▼              ▼                   ▼
  ┌────────────┐ ┌──────────────┐ ┌──────────────────┐
  │ JWT        │ │ Basic        │ │ /sign-in          │
  │ Strategy   │ │ Strategy     │ │ /sign-up          │
  │            │ │              │ │ /change-password   │
  └────────────┘ └──────────────┘ │ /who-am-i         │
                                  └──────────────────┘
```

### Tech Stack

| Technology | Purpose |
|------------|---------|
| **`jose`** | JWT signing (`SignJWT`), verification (`jwtVerify`), and type definitions (`JWTPayload`, `JWTVerifyResult`) |
| **`@venizia/ignis-helpers`** | `AES` utility for payload field encryption, `BaseHelper`/`BaseService` base classes, `getError` for error creation, `HTTP` result codes |
| **Hono middleware** | Route-level authentication integration via `createMiddleware` from `hono/factory` |
| **Drizzle ORM** | Database access for user lookup (in your implementation) |
| **lodash/isEmpty** | Used in strategy registry for name validation |

## Component Private Methods

The `AuthenticateComponent` uses four private methods during its `binding()` lifecycle:

| Method | Purpose |
|--------|---------|
| `validateOptions(opts)` | Validates that at least one of `jwtOptions` or `basicOptions` is present. Throws if neither is provided. |
| `defineJWTAuth(opts)` | Validates JWT secrets (rejects falsy values and `'unknown_secret'`), validates `getTokenExpiresFn`, binds `JWTTokenService` as a service. Logs debug if skipped. |
| `defineBasicAuth(opts)` | Validates `verifyCredentials` callback presence, binds `BasicTokenService` as a service. Logs debug if skipped. |
| `defineControllers(opts)` | Requires `jwtOptions` when `useAuthController: true`. Calls `defineAuthController()` factory and registers the generated controller. |
| `defineOAuth2()` | Stub method -- not yet implemented. Called during `binding()` but performs no action. |

> [!WARNING]
> **Security concern:** The `defineJWTAuth()` method includes the actual secret value in its error message when validation fails (e.g., <code v-pre>[defineJWTAuth] Invalid jwtSecret | Provided: {{jwtSecret}}</code>). Ensure these startup errors are never exposed to end users or logged in production without sanitization.

## Strategy Registry

<code v-pre>AuthenticationStrategyRegistry&lt;E extends Env = Env&gt;</code> is a **singleton** that manages all registered strategies. It extends `BaseHelper`.

### API

| Method | Signature | Returns | Description |
|--------|-----------|---------|-------------|
| `getInstance()` | `static` | `AuthenticationStrategyRegistry` | Returns the singleton instance (creates if not exists) |
| `getStrategyKey` | `(opts: { name: string }) => string` | `string` | Returns the binding key for a strategy: <code v-pre>authentication.strategy.{{name}}</code> |
| `getStrategy` | `(opts: { container: Container; name: string }) => IAuthenticationStrategy` | `IAuthenticationStrategy` | Resolves a strategy instance from the container by name |
| `register` | <code v-pre>(opts: { container: Container; strategies: Array&lt;{ name: string; strategy: TClass&lt;IAuthenticationStrategy&lt;E&gt;&gt; }&gt; }) =&gt; this</code> | `this` | Registers strategies as singletons in the container. Returns `this` for chaining. |
| `authenticate` | `(opts: { strategies: string[]; mode?: TAuthMode }) => MiddlewareHandler` | `MiddlewareHandler` | Creates a Hono middleware that performs the auth check |

**Registration:**
```typescript
AuthenticationStrategyRegistry.getInstance().register({
  container: this,
  strategies: [
    { name: Authentication.STRATEGY_JWT, strategy: JWTAuthenticationStrategy },
    { name: Authentication.STRATEGY_BASIC, strategy: BasicAuthenticationStrategy },
  ],
});
```

> [!NOTE]
> `register()` returns `this`, enabling method chaining if needed.

**How it works:**
- Strategies are stored in an internal <code v-pre>Map&lt;string, { container, strategyClass }&gt;</code> and also bound to the DI container as singletons
- Binding keys follow the pattern `authentication.strategy.{name}` (e.g., `authentication.strategy.jwt`, `authentication.strategy.basic`)
- The `authenticate()` method returns a Hono `MiddlewareHandler` that performs the auth check
- The standalone `authenticate()` function is a convenience wrapper around the registry singleton

**Strategy binding:**
```typescript
// Internally, the registry binds strategies like this:
container.bind({ key: 'authentication.strategy.jwt' })
  .toClass(JWTAuthenticationStrategy)
  .setScope(BindingScopes.SINGLETON);
```

**Middleware creation:**

The `authenticate()` function returns a Hono middleware that:
1. Checks if `Authentication.SKIP_AUTHENTICATION` is set on context -- if true, skips entirely (logs debug)
2. Checks if `Authentication.CURRENT_USER` is already set on context -- if true, skips (already authenticated)
3. Reads `strategies` and `mode` from the provided options
4. Executes strategies based on mode (`any` or `all`)
5. On success, sets `Authentication.CURRENT_USER` and `Authentication.AUDIT_USER_ID` on context
6. On failure, throws 401 with list of tried strategies

### Standalone `authenticate()` Function

```typescript
export const authenticate = (opts: { strategies: string[]; mode?: TAuthMode }) => {
  return AuthenticationStrategyRegistry.getInstance().authenticate(opts);
};
```

This is the primary export for creating auth middleware. It delegates directly to the singleton registry.

> [!NOTE]
> In `all` mode, if every strategy passes but the final user payload has no `userId`, the middleware throws a `401` with message `"Failed to identify authenticated user!"`. The `any` mode collects errors from each failing strategy and only throws after all strategies are exhausted.

## JWTTokenService

All methods are instance methods on <code v-pre>JWTTokenService&lt;E extends Env = Env&gt;</code>, which extends `BaseService`.

### JWTAuthenticationStrategy

Extends `BaseHelper` and implements <code v-pre>IAuthenticationStrategy&lt;E&gt;</code>. Generic on <code v-pre>&lt;E extends Env = Env&gt;</code>.

```typescript
class JWTAuthenticationStrategy<E extends Env = Env>
  extends BaseHelper
  implements IAuthenticationStrategy<E>
{
  name = Authentication.STRATEGY_JWT; // 'jwt'

  constructor(
    @inject({ key: 'services.JWTTokenService' })
    private service: JWTTokenService<E>,
  ) { ... }

  authenticate(context: TContext<E, string>): Promise<IAuthUser> {
    const token = this.service.extractCredentials(context);
    return this.service.verify(token);
  }
}
```

### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `extractCredentials` | <code v-pre>(context: TContext&lt;E, string&gt;) =&gt; { type: string; token: string }</code> | Extracts Bearer token from Authorization header |
| `verify` | <code v-pre>(opts: { type: string; token: string }) =&gt; Promise&lt;IJWTTokenPayload&gt;</code> | Verifies JWT signature via `jose.jwtVerify()` and decrypts payload |
| `generate` | <code v-pre>(opts: { payload: IJWTTokenPayload; getTokenExpiresFn?: TGetTokenExpiresFn }) =&gt; Promise&lt;string&gt;</code> | Encrypts payload, signs JWT with configurable expiration |
| `getSigner` | <code v-pre>(opts: { payload: IJWTTokenPayload; getTokenExpiresFn: TGetTokenExpiresFn }) =&gt; Promise&lt;SignJWT&gt;</code> | Creates a `jose.SignJWT` instance with encrypted payload, iat, exp, nbf |
| `encryptPayload` | <code v-pre>(payload: IJWTTokenPayload) =&gt; Record&lt;string, string&gt;</code> | AES-encrypts non-standard JWT fields (keys + values) |
| `decryptPayload` | <code v-pre>(opts: { result: JWTVerifyResult&lt;IJWTTokenPayload&gt; }) =&gt; IJWTTokenPayload</code> | Decrypts AES-encrypted fields back to IJWTTokenPayload |

### Static Fields

- `JWT_COMMON_FIELDS`: <code v-pre>Set&lt;'iss' | 'sub' | 'aud' | 'jti' | 'nbf' | 'exp' | 'iat'&gt;</code> -- fields preserved as-is during encryption

### Protected Fields

- `aes`: `AES` -- AES utility instance initialized with the configured algorithm
- `jwtSecret`: `Uint8Array` -- encoded JWT secret for `jose` signing/verification
- `options`: `IJWTTokenServiceOptions` -- injected options

### Constructor Behavior

The constructor validates all three required options and throws immediately (status 500) if any are missing:

```typescript
constructor(
  @inject({ key: AuthenticateBindingKeys.JWT_OPTIONS })
  protected options: IJWTTokenServiceOptions,
) {
  // Throws '[JWTTokenService] Invalid jwtSecret' if !jwtSecret
  // Throws '[JWTTokenService] Invalid applicationSecret' if !applicationSecret
  // Throws '[JWTTokenService] Invalid getTokenExpiresFn' if !getTokenExpiresFn
  // Initializes AES with configured algorithm (default 'aes-256-cbc')
  // Encodes jwtSecret to Uint8Array for jose
}
```

## BasicTokenService

All methods are instance methods on <code v-pre>BasicTokenService&lt;E extends Env = Env&gt;</code>, which extends `BaseService`.

### BasicAuthenticationStrategy

Extends `BaseHelper` and implements <code v-pre>IAuthenticationStrategy&lt;E&gt;</code>. Generic on <code v-pre>&lt;E extends Env = Env&gt;</code>.

```typescript
class BasicAuthenticationStrategy<E extends Env = Env>
  extends BaseHelper
  implements IAuthenticationStrategy<E>
{
  name = Authentication.STRATEGY_BASIC; // 'basic'

  constructor(
    @inject({ key: 'services.BasicTokenService' })
    private service: BasicTokenService<E>,
  ) { ... }

  async authenticate(context: TContext<E, string>): Promise<IAuthUser> {
    const credentials = this.service.extractCredentials(context);
    return this.service.verify({ credentials, context });
  }
}
```

### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `extractCredentials` | <code v-pre>(context: TContext&lt;E, string&gt;) =&gt; { username: string; password: string }</code> | Decodes Base64 <code v-pre>Authorization: Basic &lt;base64&gt;</code> header |
| `verify` | <code v-pre>(opts: { credentials: { username: string; password: string }; context: TContext&lt;E, string&gt; }) =&gt; Promise&lt;IAuthUser&gt;</code> | Calls user-provided `verifyCredentials` callback |

### Private Fields

- `verifyCredentials` -- the callback function extracted from injected options

### Constructor Behavior

```typescript
constructor(
  @inject({ key: AuthenticateBindingKeys.BASIC_OPTIONS })
  protected options: IBasicTokenServiceOptions<E>,
) {
  // Throws '[BasicTokenService] Invalid verifyCredentials function' if !options?.verifyCredentials
}
```

## Entity Column Helper Types

The following types are exported for use when extending the auth entity column helpers:

### Permission Types

```typescript
type TPermissionOptions = {
  idType?: 'string' | 'number';
};

type TPermissionCommonColumns = {
  code: NotNull<PgTextBuilderInitial<...>>;
  name: NotNull<PgTextBuilderInitial<...>>;
  subject: NotNull<PgTextBuilderInitial<...>>;
  pType: NotNull<PgTextBuilderInitial<...>>;
  action: NotNull<PgTextBuilderInitial<...>>;
  scope: NotNull<PgTextBuilderInitial<...>>;
};
```

### Permission Mapping Types

```typescript
type TPermissionMappingOptions = {
  idType?: 'string' | 'number';
};

type TPermissionMappingCommonColumns = {
  effect: PgTextBuilderInitial<...>;
};
```

### User Role Types

```typescript
type TUserRoleOptions = {
  idType?: 'string' | 'number';
};

type TUserRoleCommonColumns = ReturnType<
  typeof generatePrincipalColumnDefs<'principal', 'string' | 'number'>
>;
```

## Controller Factory

The `defineAuthController()` function dynamically creates a controller class at runtime using decorator composition:

**How it works:**

1. **Class creation:** A new class is created dynamically with `class AuthController extends BaseController {}` inside the factory closure
2. **Decorator application:** The `@controller({ path: restPath })` decorator is applied to set the base path. The controller is created with `isStrict: true`
3. **Service injection:** The auth service is injected via `inject({ key: serviceKey })(AuthController, undefined, 0)` after class definition -- this programmatically applies `@inject` to constructor parameter 0
   - Default service key: `'services.AuthenticationService'`
   - Service must implement `IAuthService` interface
4. **Route definition:** Routes are defined in the controller's `binding()` method using `this.defineRoute()`
5. **Schema customization:** Custom Zod schemas can be provided per endpoint via the `payload` option. Defaults to built-in schemas when not provided, with `AnyObjectSchema` as the response fallback.

**Factory signature:**

```typescript
function defineAuthController(opts: TDefineAuthControllerOpts): typeof AuthController;
```

> [!NOTE]
> The factory also exports `JWTTokenPayloadSchema`, a Zod schema used for the `/who-am-i` response validation.

**Internal route binding:**

```typescript
// Inside the factory-generated controller
binding(): void {
  // /sign-in -- no auth, delegates to service.signIn()
  this.defineRoute({
    configs: {
      path: '/sign-in',
      method: 'post',
      request: {
        body: jsonContent({
          description: 'Sign-in request body',
          required: true,
          schema: payload?.signIn?.request?.schema ?? SignInRequestSchema,
        }),
      },
      responses: jsonResponse({
        schema: payload?.signIn?.request?.schema ?? AnyObjectSchema,
        description: 'Success Response',
      }),
    },
    handler: async (context) => {
      const body = await context.req.json();
      const rs = await this.service.signIn(context, body);
      return context.json(rs, HTTP.ResultCodes.RS_2.Ok);
    },
  });

  // /sign-up -- conditionally requires JWT auth
  this.defineRoute({
    configs: {
      path: '/sign-up',
      method: 'post',
      authenticate: {
        strategies: !requireAuthenticatedSignUp ? [] : [Authentication.STRATEGY_JWT],
      },
      request: {
        body: jsonContent({
          description: 'Sign-up request body',
          required: true,
          schema: payload?.signUp?.request?.schema ?? SignUpRequestSchema,
        }),
      },
      responses: jsonResponse({
        schema: payload?.signUp?.response?.schema ?? AnyObjectSchema,
        description: 'Success Response',
      }),
    },
    handler: async (context) => {
      const body = await context.req.json();
      const rs = await this.service.signUp(context, body);
      return context.json(rs, HTTP.ResultCodes.RS_2.Ok);
    },
  });

  // /change-password -- always requires JWT auth
  this.defineRoute({
    configs: {
      path: '/change-password',
      method: 'post',
      authenticate: { strategies: [Authentication.STRATEGY_JWT] },
      request: {
        body: jsonContent({
          description: 'Change password request body',
          required: true,
          schema: payload?.changePassword?.request?.schema ?? ChangePasswordRequestSchema,
        }),
      },
      responses: jsonResponse({
        schema: payload?.changePassword?.response?.schema ?? AnyObjectSchema,
        description: 'Success Response',
      }),
    },
    handler: async (context) => {
      const body = await context.req.json();
      const rs = await this.service.changePassword(context, body);
      return context.json(rs, HTTP.ResultCodes.RS_2.Ok);
    },
  });

  // /who-am-i -- always requires JWT, returns current user from context
  this.defineRoute({
    configs: {
      path: '/who-am-i',
      method: 'get',
      authenticate: { strategies: [Authentication.STRATEGY_JWT] },
      responses: {
        [HTTP.ResultCodes.RS_2.Ok]: jsonContent({
          description: 'Success Response',
          schema: JWTTokenPayloadSchema,
        }),
      },
    },
    handler: (context) => {
      const currentUser = context.get(Authentication.CURRENT_USER as never) as IJWTTokenPayload;
      return context.json(currentUser, HTTP.ResultCodes.RS_2.Ok);
    },
  });
}
```

> [!TIP]
> If the default request/response schemas do not fit your needs, provide custom Zod schemas through the `payload` option in `controllerOpts`. This allows full control over validation while keeping the built-in routing.

**Service resolution:**

The factory applies `@inject` programmatically to constructor parameter 0:

```typescript
// Inside defineAuthController, after class definition:
inject({ key: serviceKey })(AuthController, undefined, 0);
```

This is equivalent to:
```typescript
constructor(
  @inject({ key: serviceKey })
  authService: IAuthService,
) { ... }
```

If the service is not bound, the component will throw: `"[AuthController] Failed to init auth controller | Invalid injectable authentication service!"`

## See Also

- [Setup & Configuration](./) -- Binding keys, options interfaces, and initial setup
- [Usage & Examples](./usage) -- Securing routes, auth flows, and API endpoints
- [Error Reference](./errors) -- Error messages and troubleshooting
