---
title: Open claim, config and payload shapes are unknown, not any
description: "IAuthUser, IJWTTokenPayload, the application and middleware config bags, mail, API reference, field mapping, network, socket and multipart payload types no longer let an unread value through as any: a read needs a narrow or a schema."
packages: ['@venizia/ignis', '@venizia/ignis-kernel', '@venizia/ignis-helpers']
migration:
  - id: open-user-claims-unknown
    symbols: [IAuthUser, IJWTTokenPayload]
    upgrade:
      before: |
        const currentUser = context.get(Authentication.CURRENT_USER);
        const tenantId: string = currentUser.tenantId; // any
      after: |
        interface IMyUser extends IAuthUser {
          tenantId: string;
        }

        const TenantSchema = z.object({ tenantId: z.string() });
        const currentUser = context.get(Authentication.CURRENT_USER);
        const { tenantId } = TenantSchema.parse(currentUser); // or declare IMyUser and parse once at the edge
    downgrade:
      steps:
        - "Read the extra claims off IAuthUser and IJWTTokenPayload directly again; the older index signature is any. Your IMyUser extension and your schema keep compiling."
  - id: open-config-bags-unknown
    symbols: [IApplicationConfigs, IApplicationInfo, IMiddlewareConfigs, IBaseMiddlewareOptions, IModelAuthorizeSettings]
    upgrade:
      before: |
        const flag: boolean = this.getAppConfigs().myFeature;
      after: |
        interface IMyAppConfigs extends IApplicationConfigs {
          myFeature?: boolean;
        }

        // declare the key you read on your own configs type
    downgrade:
      steps:
        - "Remove the keys you declared on your own configs interface if you like; the older bag is any and takes any read."
  - id: mail-payloads-unknown
    symbols: [IMailMessage, IMailAttachment, IMailSendResult, IMailService, IMailTemplateEngine]
    upgrade:
      before: |
        const result = await mailService.send(message);
        const id = result.response.messageId; // any
      after: |
        const result = await mailService.send(message);
        const MessageIdSchema = z.object({ messageId: z.string() });
        const { messageId } = MessageIdSchema.parse(result.response);
    downgrade:
      steps:
        - "Read result.response and the template data keys without parsing again; the older types are any."
  - id: api-reference-options-unknown
    symbols: [IApiReferenceOptions, IUIConfig]
    upgrade:
      steps:
        - "Nothing to change when you only pass uiConfig and securitySchemes. A read back of one of their values needs a narrow."
    downgrade:
      steps:
        - "Read the values directly again; the older types are any."
  - id: field-mappings-unknown
    symbols: [TObjectFromFieldMappings]
    upgrade:
      steps:
        - "An extra key you put on a field mapping is unknown when you read it back: declare the key on your own mapping type, or narrow the read."
    downgrade:
      steps:
        - "Read the extra keys directly again; the older type is any."
  - id: network-extras-unknown
    symbols: [IRequestOptions, AxiosFetcher, BaseNetworkTcpClient, BaseNetworkTcpServer, ITcpSocketClient, ITcpSocketServerOptions]
    upgrade:
      before: |
        const client = NetworkTcpClient.newInstance({
          identifier: 'tcp',
          options: { host, port },
          onError: (error) => console.log(error.message),
        });
      after: |
        const client = NetworkTcpClient.newInstance({
          identifier: 'tcp',
          options: { host, port },
          onError: (error) => console.log(error instanceof Error ? error.message : String(error)),
        });
    downgrade:
      steps:
        - "Read error.message directly in onError again, and the args of the server callbacks; the older types are any. The protected reconnectTimeout of BaseNetworkTcpClient is typed again as any and set to null instead of undefined."
  - id: socket-io-payloads-unknown
    symbols: [ISocketIOServerBunOptions, SocketIOServerHelper, IHandshake, IOptions, SocketIOClientHelper]
    upgrade:
      before: |
        const server = new SocketIOServerHelper({ runtime: RuntimeModules.BUN, engine, ... });
        server.send({ payload: { topic: 'notice', data: { id: 1 } } });
        const options: IOptions = { path: '/io', extraHeaders: { 'x-id': 1 } };
      after: |
        const server = new SocketIOServerHelper({ runtime: RuntimeModules.BUN, engine, ... });
        server.send({ payload: { topic: 'notice', data: { id: 1 } } });
        const options: IOptions = { path: '/io', extraHeaders: { 'x-id': '1' } };
    downgrade:
      steps:
        - "extraHeaders accepts any value again; engine is any again instead of TSocketIOBunEngine (an object). A read of handshake.auth values needs no narrowing."
  - id: multipart-context-typed
    symbols: [RequestUtility.parseMultipartBody, IRequestedRemark]
    upgrade:
      steps:
        - "parseMultipartBody takes a context whose req has formData(): a Hono context does. A hand-built context with another req shape stops compiling: give it a formData() method."
    downgrade:
      steps:
        - "Any object with a req property is accepted again."
  - id: bearer-payload-encryption-unknown
    symbols: [AbstractBearerTokenService.encryptPayload, AbstractBearerTokenService.decryptPayload, AbstractBearerTokenService.serializeField]
    upgrade:
      steps:
        - "A subclass that overrides encryptPayload returns Promise<Record<string, unknown>>, and serializeField takes value: unknown."
        - "decryptPayload answers 401 when an encrypted claim is not a string or the decrypted claims carry no userId: a token this service issued always has both."
    downgrade:
      steps:
        - "Return Promise<Record<string, any>> and take value: any again in the overrides."
    data: "Tokens already issued decode the same: only a token whose encrypted claim is not a string, or that has no userId, is refused now."
---

# Changelog - 2026-11-13

## Open claim, config and payload shapes are unknown, not any

<Badge type="warning" text="Breaking Change" />

**In one line.** A value read off an open index signature or a message payload is `unknown` now, so the compiler asks you to narrow or parse it instead of trusting it.

## What changed

- **User claims and config bags.** `IAuthUser`, `IJWTTokenPayload`, `IApplicationConfigs`, `IApplicationInfo`, `IMiddlewareConfigs`, `IBaseMiddlewareOptions` and `IModelAuthorizeSettings` keep their open `[extra]` index, typed `unknown` instead of `any`.
- **Payloads.** The mail types (`IMailMessage`, `IMailAttachment`, `IMailSendResult`, the template data of `IMailService` and `IMailTemplateEngine`), the API reference `uiConfig` and `securitySchemes`, field mappings, the network request and TCP types, the Socket.IO event payloads and the multipart context use `unknown` or the real type.
- **Socket.IO.** `IOptions.extraHeaders` is `Record<string, string>`, the Bun `engine` is typed `TSocketIOBunEngine` (an object), and the client helper keeps its wrapped listeners typed by Socket.IO itself.
- **Multipart.** `RequestUtility.parseMultipartBody` takes a context whose `req.formData()` it reads, which is what a Hono context is.
- **Token encryption.** `encryptPayload` returns `Record<string, unknown>`, and `decryptPayload` refuses with `401` an encrypted claim that is not a string.

## Who is affected

- **Apps that read an extra claim of the current user or a custom key of a config.** Narrow it or parse it: see the migration below.
- **Apps that read `result.response` of a mail send, or the `error` of a TCP `onError`.** Narrow it.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> These are type-level breaks: nothing changes at runtime except the `decryptPayload` refusals. The typecheck names each line.

**Before:**

```typescript
const currentUser = context.get(Authentication.CURRENT_USER);
const tenantId: string = currentUser.tenantId;
```

**After:**

```typescript
const TenantSchema = z.object({ tenantId: z.string() });
const currentUser = context.get(Authentication.CURRENT_USER);
const { tenantId } = TenantSchema.parse(currentUser);
```
