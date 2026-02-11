# Configuration Options

## JWT Options (`IJWTTokenServiceOptions`)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `jwtSecret` | `string` | -- | Secret for signing and verifying JWT signature |
| `applicationSecret` | `string` | -- | Secret for AES-encrypting JWT payload fields |
| `getTokenExpiresFn` | `() => ValueOrPromise<number>` | -- | Function returning token expiration in seconds |
| `aesAlgorithm` | `AESAlgorithmType` | `'aes-256-cbc'` | AES algorithm for payload encryption |
| `headerAlgorithm` | `string` | `'HS256'` | JWT signing algorithm |

> [!WARNING]
> Both `applicationSecret` and `jwtSecret` are mandatory when using JWT authentication. They must be strong, unique secret values. The component will throw an error if either is missing or set to `'unknown_secret'`.

**Example `.env` file:**

```
APP_ENV_APPLICATION_SECRET=your-strong-application-secret
APP_ENV_JWT_SECRET=your-strong-jwt-secret
APP_ENV_JWT_EXPIRES_IN=86400
```

## Basic Auth Options (`IBasicTokenServiceOptions`)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `verifyCredentials` | `(opts: { credentials, context }) => Promise<IAuthUser \| null>` | -- | Callback to verify Basic auth credentials |

The `verifyCredentials` function receives an options object:

```typescript
type TBasicAuthVerifyFn = (opts: {
  credentials: { username: string; password: string };
  context: Context;
}) => Promise<IAuthUser | null>;
```

## REST Options (`TAuthenticationRestOptions`)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `useAuthController` | `boolean` | `false` | Enable/disable built-in auth controller |
| `controllerOpts` | `TDefineAuthControllerOpts` | -- | Configuration for built-in auth controller (required when `useAuthController` is `true`) |

## Controller Options (`TDefineAuthControllerOpts`)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `restPath` | `string` | `'/auth'` | Base path for auth endpoints |
| `serviceKey` | `string` | `'services.AuthenticationService'` | DI key for the auth service |
| `requireAuthenticatedSignUp` | `boolean` | `false` | Whether sign-up requires JWT authentication |
| `payload` | `object` | `{}` | Custom Zod schemas for request/response payloads |

::: details TDefineAuthControllerOpts — Full Reference
```typescript
type TDefineAuthControllerOpts = {
  restPath?: string;
  serviceKey?: string;
  requireAuthenticatedSignUp?: boolean;
  payload?: {
    signIn?: {
      request: { schema: TAnyObjectSchema };
      response: { schema: TAnyObjectSchema };
    };
    signUp?: {
      request: { schema: TAnyObjectSchema };
      response: { schema: TAnyObjectSchema };
    };
    changePassword?: {
      request: { schema?: TAnyObjectSchema };
      response: { schema: TAnyObjectSchema };
    };
  };
};
```
:::

## Route Configuration Options

These options are used in route configs to control per-route authentication:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `authStrategies` | `TAuthStrategy[]` | -- | Array of strategy names (e.g., `['jwt']`, `['jwt', 'basic']`) |
| `authMode` | `'any' \| 'all'` | `'any'` | How to handle multiple strategies |
| `skipAuth` | `boolean` | `false` | Skip authentication for this route |

::: details IAuthService — Full Interface
```typescript
interface IAuthService<
  E extends Env = Env,
  SIRQ extends TSignInRequest = TSignInRequest,
  SIRS = AnyObject,
  SURQ extends TSignUpRequest = TSignUpRequest,
  SURS = AnyObject,
  CPRQ extends TChangePasswordRequest = TChangePasswordRequest,
  CPRS = AnyObject,
  UIRQ = AnyObject,
  UIRS = AnyObject,
> {
  signIn(context: TContext<E>, opts: SIRQ): Promise<SIRS>;
  signUp(context: TContext<E>, opts: SURQ): Promise<SURS>;
  changePassword(context: TContext<E>, opts: CPRQ): Promise<CPRS>;
  getUserInformation?(context: TContext<E>, opts: UIRQ): Promise<UIRS>;
}
```
:::

::: details IJWTTokenPayload — Full Interface
```typescript
interface IJWTTokenPayload extends JWTPayload, IAuthUser {
  userId: IdType;
  roles: { id: IdType; identifier: string; priority: number }[];
  clientId?: string;
  provider?: string;
  email?: string;
  name?: string;
  [extra: string | symbol]: any;
}
```
:::
