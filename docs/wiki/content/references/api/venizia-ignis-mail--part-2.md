---
title: "@venizia/ignis/mail (2 of 2)"
description: "Every export of @venizia/ignis/mail, from the built declarations (generated)."
---

# `@venizia/ignis/mail (2 of 2)`

> Generated from the built declarations by `vulcan atlas api gen` - do not edit.

Part 2 of 2 of [`@venizia/ignis/mail`](/references/api/venizia-ignis-mail).

## `TemplateEngineService`

*class*

In-memory template store and renderer. Templates registered here are lost on restart.

```ts
export declare class TemplateEngineService extends BaseService implements IMailTemplateEngine {
    private templates;
    constructor();
    registerTemplate(opts: {
        name: string;
        content: string;
        options?: Partial<ITemplate>;
    }): void;
    render(opts: {
        templateData?: string;
        templateName?: string;
        data: Record<string, unknown>;
        requireValidate?: boolean;
        missing?: TMailTemplateMissing;
        format?: TMailTemplateFormat;
    }): string;
    getTemplate(name: string): ITemplate | undefined;
    listTemplates(): ITemplate[];
    hasTemplate(name: string): boolean;
    removeTemplate(name: string): boolean;
    clearTemplates(): void;
    validateTemplateData(opts: {
        template: string;
        data: Record<string, unknown>;
    }): {
        isValid: boolean;
        missingKeys: string[];
        allKeys: string[];
    };
    renderSimpleTemplate(template: string, data: Record<string, unknown>, opts?: {
        requireValidate?: boolean;
        missing?: TMailTemplateMissing;
        format?: TMailTemplateFormat;
    }): string;
}
```

Source: `packages/core-server/src/components/mail/services/template.service.ts`

## `TGetMailQueueExecutorFn`

*type*

Builds the queue executor for a config; throws when the config for its `type` is missing or the type is unknown.

```ts
export type TGetMailQueueExecutorFn = (config: TMailQueueExecutorConfig) => IMailQueueExecutor;
```

Source: `packages/core-server/src/components/mail/providers/mail-queue-executor.provider.ts`

## `TGetMailTransportFn`

*type*

Builds the transport for the given mail options; throws on an unsupported provider.

```ts
export type TGetMailTransportFn = (options: TMailOptions) => IMailTransport;
```

Source: `packages/core-server/src/components/mail/providers/mail-transporter.provider.ts`

## `TMailBackoffType`

*type*

Valid mail backoff type values.

```ts
export type TMailBackoffType = TConstValue<typeof MailBackoffTypes>;
```

Source: `packages/core-server/src/components/mail/common/constants.ts`

## `TMailgunConfig`

*type*

Mailgun client options (`mailgun.js`) plus the sending `domain`; the transport throws on a missing `username`, `key` or `domain`.

```ts
export type TMailgunConfig = {
    username: string;
    key: string;
    domain: string;
    url?: string;
    [option: string]: unknown;
};
```

Source: `packages/core-server/src/components/mail/common/types/options.ts`

## `TMailgunModule`

*type*

The `mailgun.js` class, as a constructor taking the form-data implementation.

```ts
export type TMailgunModule = new (formData: typeof FormData) => {
    client(config: object): {
        messages: IMailgunMessagesClient;
    };
};
```

Source: `packages/core-server/src/components/mail/common/types/options.ts`

## `TMailOptions`

*type*

Options passed to the mail component, discriminated by `provider`.

```ts
export type TMailOptions = INodemailerMailOptions | IAmazonSesMailOptions | IMailgunMailOptions | ICustomMailOptions | IGenericMailOptions;
```

Source: `packages/core-server/src/components/mail/common/types/options.ts`

## `TMailProvider`

*type*

Union of the `MailProviders` values.

```ts
export type TMailProvider = TConstValue<typeof MailProviders>;
```

Source: `packages/core-server/src/components/mail/common/constants.ts`

## `TMailQueueExecutorConfig`

*type*

Selects and configures the mail queue executor: `type` picks one of three, and the options its executor needs are required by the types.

```ts
export type TMailQueueExecutorConfig = {
    type: typeof MailQueueExecutorTypes.DIRECT;
    options?: never;
} | {
    type: typeof MailQueueExecutorTypes.INTERNAL_QUEUE;
    options: IInternalQueueMailExecutorOpts;
} | {
    type: typeof MailQueueExecutorTypes.BULLMQ;
    options: IBullMQMailExecutorOpts;
};
```

Source: `packages/core-server/src/components/mail/common/types/queue.ts`

## `TMailTemplateFormat`

*type*

Union of the `MailTemplateFormats` values.

```ts
export type TMailTemplateFormat = TConstValue<typeof MailTemplateFormats>;
```

Source: `packages/core-server/src/components/mail/common/constants.ts`

## `TMailTemplateMissing`

*type*

Union of the `MailTemplateMissingModes` values.

```ts
export type TMailTemplateMissing = TConstValue<typeof MailTemplateMissingModes>;
```

Source: `packages/core-server/src/components/mail/common/constants.ts`

## `TNodemailerConfig`

*type*

Nodemailer `createTransport` argument: a transport instance, SMTP options or a connection URL.

```ts
export type TNodemailerConfig = SMTPTransport | SMTPTransport.Options | string;
```

Source: `packages/core-server/src/components/mail/common/types/options.ts`

## `TNodemailerModule`

*type*

The peer module itself, handed over by an application that already holds it. A `bun build
--compile` binary carries no `node_modules`, so the runtime lookup these transports fall back to
has nothing to resolve against - passing the module through the options is what a compiled
application does instead. Typed as the shape each transport actually uses, so a wrong module is
a compile error rather than a boot crash.

```ts
export type TNodemailerModule = {
    createTransport(config: TNodemailerConfig): INodemailerTransporter;
};
```

Source: `packages/core-server/src/components/mail/common/types/options.ts`
