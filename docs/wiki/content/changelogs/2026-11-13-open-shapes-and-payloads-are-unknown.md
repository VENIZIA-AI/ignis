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
        // src/common/auth-claims.ts: any file of your program, never imported
        declare module '@venizia/ignis' {
          interface IAuthUser {
            tenantId: string;
          }
        }

        export {};

        // the read is typed, with no cast and no parse
        const currentUser = context.get(Authentication.CURRENT_USER);
        const tenantId: string = currentUser.tenantId;
    downgrade:
      steps:
        - "Read the extra claims off IAuthUser and IJWTTokenPayload directly again; the older index signature is any. The declare module block you added keeps compiling."
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
    symbols: [IRequestOptions, BaseNetworkTcpClient, BaseNetworkTcpServer, ITcpSocketClient, ITcpSocketServerOptions]
    upgrade:
      before: |
        const client = NetworkTcpClient.newInstance({
          identifier: 'tcp',
          options: { host, port },
          onError: (error) => console.log(error.message),
        });
        const server = NetworkTcpServer.newInstance({
          identifier: 'tcp',
          serverOptions: { port },
          extraEvents: { ping: ({ args }) => handle(args.value) },
        });
      after: |
        const client = NetworkTcpClient.newInstance({
          identifier: 'tcp',
          options: { host, port },
          onError: (error) => console.log(error instanceof Error ? error.message : String(error)),
        });
        const server = NetworkTcpServer.newInstance({
          identifier: 'tcp',
          serverOptions: { port },
          extraEvents: { ping: ({ args }) => handle(PingSchema.parse(args)) },
        });
    downgrade:
      steps:
        - "Read error.message in onError and the fields of args in the extraEvents handlers directly again; the older types are any."
        - "A subclass of BaseNetworkTcpClient that assigns the protected reconnectTimeout something other than a timer handle or null compiles again (it was any)."
  - id: axios-send-response-type
    symbols: [AxiosFetcher.send]
    upgrade:
      before: |
        const response = await fetcher.send({ url, method: 'get' });
        const name: string = response.data.name; // data was any
      after: |
        const ProfileSchema = z.object({ name: z.string() });
        const response = await fetcher.send<unknown>({ url, method: 'get' });
        const { name } = ProfileSchema.parse(response.data);
    downgrade:
      steps:
        - "Read response.data directly again; send<T = any> is the older default. A call that names its own type, send<TProfile>(...), is unchanged."
  - id: socket-io-payloads-unknown
    symbols: [ISocketIOServerBunOptions, SocketIOServerHelper.getEngine, SocketIOServerHelper.send, TSocketIOBunEngine, IHandshake, IOptions, SocketIOClientHelper]
    upgrade:
      before: |
        const engine = server.getEngine(); // any
        engine.handleRequest(request, bunServer);

        const options: IOptions = { path: '/io', extraHeaders: { 'x-attempt': 1 } };
      after: |
        const engine = server.getEngine(); // TSocketIOBunEngine | undefined, an object
        const bunEngine = await SocketIOBunHandler.createEngine({ serverOptions }); // keep the engine from the call that builds it
        bunEngine.engine.handleRequest(request, bunServer);

        const options: IOptions = { path: '/io', extraHeaders: { 'x-attempt': '1' } };
    downgrade:
      steps:
        - "getEngine() answers any again, so engine.handleRequest(...) needs no engine from createEngine. extraHeaders takes any value again, and handshake.auth and the data of send() are any."
  - id: socket-io-bun-handler-types
    symbols: [SocketIOBunHandler.createEngine, SocketIOBunHandler.createFetchHandler]
    upgrade:
      steps:
        - "createEngine answers { engine, engineHandler } with the types @socket.io/bun-engine declares, and createFetchHandler takes that engine: pass the engine createEngine returned. A hand-built engine of another type needs to be a @socket.io/bun-engine Server."
    downgrade:
      steps:
        - "Both took and answered any: pass any engine again."
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
    data: "Only when applicationSecret is configured (AES on): tokens already issued decode the same, and only a token whose encrypted claim is not a string, or that has no userId, is refused now. Without AES, nothing changes."
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
- **Token encryption.** `encryptPayload` returns `Record<string, unknown>`. With `applicationSecret` set, `decryptPayload` refuses with `401` an encrypted claim that is not a string, and a decrypted claim set with no `userId`.

## Who is affected

- **Apps that read an extra claim of the current user or a custom key of a config.** Narrow it or parse it: see the migration below.
- **Apps that read `result.response` of a mail send, or the `error` of a TCP `onError`.** Narrow it.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> These are type-level breaks: nothing changes at runtime except the two `decryptPayload` refusals, and only when AES is configured. The typecheck names each line.

**Before:**

```typescript
const currentUser = context.get(Authentication.CURRENT_USER);
const tenantId: string = currentUser.tenantId;
```

**After:** declare the claim once on `IAuthUser` (see [Read the claims your app adds](/extensions/components/authentication/usage#read-the-claims-your-app-adds)), then read it typed:

```typescript
declare module '@venizia/ignis' {
  interface IAuthUser {
    tenantId: string;
  }
}

export {};
```
