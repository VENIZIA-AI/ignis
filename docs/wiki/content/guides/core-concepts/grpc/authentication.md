---
title: gRPC auth - authentication and authorization
description: Protect a gRPC method with authenticate and authorize, and send the token from a client
---

# gRPC auth

gRPC auth in IGNIS is `authenticate` and `authorize`. A gRPC method takes the same `authenticate` and `authorize` settings as a REST route. A method with neither is public.

```typescript
import { Authentication, unary } from '@venizia/ignis';

@unary({
  configs: {
    name: 'getNote',
    authenticate: { strategies: [Authentication.STRATEGY_JWT] },
    authorize: { action: 'read', resource: 'Note' },
  },
})
async getNote(opts: { request: GetNoteRequest }) {
  // runs only for a signed-in caller who may read notes
}
```

Both ports run the same checks.

## Register the authentication strategy

Authentication is the ordinary IGNIS [authentication component](/extensions/components/authentication/). Configure it in `preConfigure()`:

```typescript
import {
  AuthenticateBindingKeys,
  AuthenticateComponent,
  Authentication,
  AuthenticationStrategyRegistry,
  JOSEStandards,
  JWSAuthenticationStrategy,
} from '@venizia/ignis';
import { AppEnvs } from '@venizia/ignis-helpers';

// in preConfigure()
this.bind({ key: AuthenticateBindingKeys.JWT_OPTIONS }).toValue({
  standard: JOSEStandards.JWS,
  options: {
    jwtSecret: AppEnvs.getRequired('APP_ENV_JWT_SECRET'),
    claims: { issuer: 'notes', audience: 'notes' },
    getTokenExpiresFn: () => 3_600,
  },
});
this.component(AuthenticateComponent);

AuthenticationStrategyRegistry.getInstance().register({
  container: this,
  strategies: [{ name: Authentication.STRATEGY_JWT, strategy: JWSAuthenticationStrategy }],
});
```

A strategy name no one registered is logged as an error at startup, and calls that rely on it cannot sign in.

## Require a permission on an RPC

`authorize` runs after `authenticate` and needs the signed-in user, so declare both. Set up an enforcer with the [authorization component](/extensions/components/authorization/).

```typescript
authorize: [
  { action: 'read', resource: 'Note' },
  { action: 'read', resource: 'Attachment' },
]
```

With an array, every spec must allow.

## authenticate options for gRPC methods

| Field | Type | Default | Meaning |
|---|---|---|---|
| `authenticate.strategies` | `string[]` | none | Strategy names. Empty or absent adds no authentication |
| `authenticate.mode` | `'any' \| 'all'` | `'any'` | One strategy must succeed, or all of them |
| `authorize` | spec or spec[] | none | Permissions checked after authentication |

## Send a token from a gRPC client

The strategy reads request headers, which gRPC calls metadata. A client interceptor sets them on every call.

```typescript
import { createClient, type Interceptor } from '@connectrpc/connect';
import { createGrpcTransport } from '@connectrpc/connect-node';
import { NotesService } from './generated/notes/v1/notes_pb';

const bearer =
  (opts: { token: string }): Interceptor =>
  (next) =>
  (request) => {
    request.header.set('authorization', `Bearer ${opts.token}`);

    return next(request);
  };

const client = createClient(
  NotesService,
  createGrpcTransport({
    baseUrl: 'http://127.0.0.1:50051',
    interceptors: [bearer({ token })],
  }),
);
```

With `grpcurl`, use `-H "authorization: Bearer $TOKEN"`.

## What a refused call looks like

| Case | gRPC code |
|---|---|
| Missing or wrong credentials | `unauthenticated` |
| Signed in, not allowed | `permission_denied` |

The handler does not run. On a client stream and a bidi call the refusal arrives before the first message is read.

## Server interceptors run before authentication

ConnectRPC interceptors from the [component options](/guides/core-concepts/grpc/configuration#component-options) wrap the whole call, `authenticate` and `authorize` included. Use them for logging and metrics. Do not read the signed-in user in an interceptor before `next()`.

Every authentication and authorization middleware runs before the handler starts. Code after `await next()` in such a middleware does not wrap the handler.

An authenticated call also has no [idle timeout](/guides/core-concepts/grpc/deadlines-and-timeouts#idle-timeout) while it runs.
