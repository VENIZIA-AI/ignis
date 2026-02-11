# Setup Guide

## Step 1: Bind Configuration

Bind at least one of `JWT_OPTIONS` or `BASIC_OPTIONS` in your application's `preConfigure()`.

**JWT Only:**

```typescript
import {
  AuthenticateBindingKeys,
  IJWTTokenServiceOptions,
} from '@venizia/ignis';

// Bind JWT options
this.bind<IJWTTokenServiceOptions>({ key: AuthenticateBindingKeys.JWT_OPTIONS }).toValue({
  applicationSecret: process.env.APP_ENV_APPLICATION_SECRET,
  jwtSecret: process.env.APP_ENV_JWT_SECRET,
  getTokenExpiresFn: () => Number(process.env.APP_ENV_JWT_EXPIRES_IN || 86400),
});
```

**Basic Auth Only:**

```typescript
import {
  AuthenticateBindingKeys,
  IBasicTokenServiceOptions,
} from '@venizia/ignis';

// Bind Basic auth options
this.bind<IBasicTokenServiceOptions>({ key: AuthenticateBindingKeys.BASIC_OPTIONS }).toValue({
  verifyCredentials: async (opts) => {
    const { credentials, context } = opts;
    const user = await userRepo.findByUsername(credentials.username);
    if (user && await bcrypt.compare(credentials.password, user.passwordHash)) {
      return { userId: user.id, roles: user.roles };
    }
    return null;
  },
});
```

**Combined JWT + Basic (with Auth Controller):**

```typescript
import {
  AuthenticateBindingKeys,
  IJWTTokenServiceOptions,
  IBasicTokenServiceOptions,
  TAuthenticationRestOptions,
} from '@venizia/ignis';

// Bind REST options (enables auth controller)
this.bind<TAuthenticationRestOptions>({ key: AuthenticateBindingKeys.REST_OPTIONS }).toValue({
  useAuthController: true,
  controllerOpts: {
    restPath: '/auth',
    payload: {
      signIn: {
        request: { schema: SignInRequestSchema },
        response: { schema: SignInResponseSchema },
      },
      signUp: {
        request: { schema: SignUpRequestSchema },
        response: { schema: SignUpResponseSchema },
      },
    },
  },
});

// Bind JWT options
this.bind<IJWTTokenServiceOptions>({ key: AuthenticateBindingKeys.JWT_OPTIONS }).toValue({
  applicationSecret: process.env.APP_ENV_APPLICATION_SECRET,
  jwtSecret: process.env.APP_ENV_JWT_SECRET,
  getTokenExpiresFn: () => Number(process.env.APP_ENV_JWT_EXPIRES_IN || 86400),
});

// Bind Basic auth options
this.bind<IBasicTokenServiceOptions>({ key: AuthenticateBindingKeys.BASIC_OPTIONS }).toValue({
  verifyCredentials: async (opts) => {
    const authenticateService = this.get<AuthenticationService>({
      key: BindingKeys.build({
        namespace: BindingNamespaces.SERVICE,
        key: AuthenticationService.name,
      }),
    });
    return authenticateService.signIn(opts.context, {
      identifier: { scheme: 'username', value: opts.credentials.username },
      credential: { scheme: 'basic', value: opts.credentials.password },
    });
  },
});
```

## Step 2: Register Component

```typescript
import {
  AuthenticateComponent,
  Authentication,
  AuthenticationStrategyRegistry,
  JWTAuthenticationStrategy,
  BasicAuthenticationStrategy,
  BaseApplication,
  ValueOrPromise,
} from '@venizia/ignis';

export class Application extends BaseApplication {
  preConfigure(): ValueOrPromise<void> {
    // Register your auth service (if using auth controller)
    this.service(AuthenticationService);

    // Step 1 bindings here...

    // Register component
    this.component(AuthenticateComponent);

    // Register strategies
    AuthenticationStrategyRegistry.getInstance().register({
      container: this,
      strategies: [
        { name: Authentication.STRATEGY_JWT, strategy: JWTAuthenticationStrategy },
        { name: Authentication.STRATEGY_BASIC, strategy: BasicAuthenticationStrategy },
      ],
    });
  }
}
```

> [!NOTE]
> Only register the strategies you need. JWT-only setups can omit `BasicAuthenticationStrategy` and vice versa.

## Step 3: Use in Services and Routes

### Securing Routes

Use `authStrategies` and `authMode` in route configurations:

```typescript
// Single strategy
const SECURE_ROUTE_CONFIG = {
  path: '/secure-data',
  method: HTTP.Methods.GET,
  authStrategies: [Authentication.STRATEGY_JWT],
  responses: jsonResponse({
    description: 'Protected data',
    schema: z.object({ message: z.string() }),
  }),
} as const;

// Multiple strategies with fallback (any mode)
const FALLBACK_AUTH_CONFIG = {
  path: '/api/data',
  method: HTTP.Methods.GET,
  authStrategies: [Authentication.STRATEGY_JWT, Authentication.STRATEGY_BASIC],
  authMode: 'any',
  responses: jsonResponse({
    description: 'Data accessible via JWT or Basic auth',
    schema: z.object({ data: z.any() }),
  }),
} as const;

// Skip authentication
const PUBLIC_ROUTE_CONFIG = {
  path: '/public',
  method: HTTP.Methods.GET,
  skipAuth: true,
  responses: jsonResponse({
    description: 'Public endpoint',
    schema: z.object({ message: z.string() }),
  }),
} as const;
```

### Accessing the Current User

After authentication, the user payload is available on the Hono `Context`:

```typescript
import { Context } from 'hono';
import { Authentication, IJWTTokenPayload } from '@venizia/ignis';

// Inside a route handler
const user = c.get(Authentication.CURRENT_USER) as IJWTTokenPayload | undefined;

if (user) {
  console.log('Authenticated user ID:', user.userId);
  console.log('User roles:', user.roles);
}
```

### Dynamic Skip Authentication

Use `Authentication.SKIP_AUTHENTICATION` to dynamically skip auth in middleware:

```typescript
import { Authentication } from '@venizia/ignis';
import { createMiddleware } from 'hono/factory';

const conditionalAuthMiddleware = createMiddleware(async (c, next) => {
  if (c.req.header('X-API-Key') === 'valid-api-key') {
    c.set(Authentication.SKIP_AUTHENTICATION, true);
  }
  return next();
});
```

### Implementing an AuthenticationService

The `AuthenticateComponent` depends on a service implementing the `IAuthService` interface when using the built-in auth controller:

```typescript
import {
  BaseService,
  inject,
  IAuthService,
  IJWTTokenPayload,
  JWTTokenService,
  TSignInRequest,
  getError,
} from '@venizia/ignis';
import { Context } from 'hono';

export class AuthenticationService extends BaseService implements IAuthService {
  constructor(
    @inject({ key: 'services.JWTTokenService' })
    private _jwtTokenService: JWTTokenService,
  ) {
    super({ scope: AuthenticationService.name });
  }

  async signIn(context: Context, opts: TSignInRequest): Promise<{ token: string }> {
    const { identifier, credential } = opts;
    const user = await this.userRepo.findByIdentifier(identifier);

    if (!user || !await this.verifyCredential(credential, user)) {
      throw getError({ message: 'Invalid credentials' });
    }

    const payload: IJWTTokenPayload = {
      userId: user.id,
      roles: user.roles,
    };

    const token = await this._jwtTokenService.generate({ payload });
    return { token };
  }

  async signUp(context: Context, opts: any): Promise<any> {
    // Implement your sign-up logic
  }

  async changePassword(context: Context, opts: any): Promise<any> {
    // Implement your change password logic
  }
}
```
