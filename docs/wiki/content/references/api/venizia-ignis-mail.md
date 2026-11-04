---
title: "@venizia/ignis/mail"
description: "Every export of @venizia/ignis/mail, from the built declarations (generated)."
---

# `@venizia/ignis/mail`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

65 exports, 65 with TSDoc.

## `AmazonSesTransportHelper`

*class*

Amazon SES transport over the HTTPS API (`@aws-sdk/client-sesv2`), sending each message as a raw MIME body.

```ts
export declare class AmazonSesTransportHelper extends BaseHelper implements IMailTransport {
    private client;
    private sendEmailCommandConstructor;
    private getAccountCommandConstructor;
    private module?;
    constructor(opts: {
        config: TAmazonSesConfig;
        module?: TAmazonSesModule;
    });
    send(message: IMailMessage): Promise<IMailSendResult>;
    verify(): Promise<boolean>;
    close(): Promise<void>;
    configure(config: TAmazonSesConfig): void;
    protected buildClient(config: TAmazonSesConfig): TAmazonSesClient;
    private validateConfig;
}
```

Source: `packages/core-server/src/components/mail/helpers/transporters/amazon-ses-transporter.helper.ts`

## `BullMQExecutorModes`

*class*

Values of `IBullMQMailExecutorOpts.mode`: `queue-only` enqueues jobs without starting workers, `worker-only` starts workers without a queue, `both` does each.

```ts
export declare class BullMQExecutorModes {
    static readonly QUEUE_ONLY = "queue-only";
    static readonly WORKER_ONLY = "worker-only";
    static readonly BOTH = "both";
    static readonly MODE_SET: Set<string>;
    static isValid(value: string): boolean;
}
```

Source: `packages/core-server/src/components/mail/common/constants.ts`

## `BullMQMailExecutorHelper`

*class*

Mail queue executor backed by BullMQ. The `mode` option decides whether this process holds the queue, the workers, or both; a processor returning `success: false` fails the job so BullMQ retries it.

```ts
export declare class BullMQMailExecutorHelper extends BaseHelper implements IMailQueueExecutor {
    private queueIdentifier;
    private queueName;
    private mode;
    private queueHelper?;
    private workerHelpers;
    private redisConnection;
    private readonly bullmqModule?;
    private jobIdCounter;
    private processor?;
    constructor(opts: IBullMQMailExecutorOpts);
    initQueue(queue: {
        identifier: string;
        name: string;
    }): void;
    setProcessor(processor: (email: string) => Promise<IMailProcessorResult>, opts?: {
        numberOfWorkers?: number;
        concurrencyPerWorker?: number;
        lockDuration?: number;
    }): Promise<void>;
    addWorker(opts: {
        workerIdentifier: string;
        concurrency?: number;
        lockDuration?: number;
    }): void;
    removeWorker(index: number): Promise<boolean>;
    /** Closes every worker without stopping at the first failure, always empties the list, and returns failures instead of throwing so teardown can continue. */
    private closeWorkers;
    clearWorkers(): Promise<void>;
    /** Full teardown: workers -> queue -> Redis. Every step runs even if an earlier one failed (skipping leaks a queue client + Redis socket); failures are reported once, at the end. */
    close(): Promise<void>;
    getWorkerCount(): number;
    getMode(): TConstValue<typeof BullMQExecutorModes>;
    enqueueVerificationEmail(email: string, options?: IMailQueueOptions): Promise<IMailQueueResult>;
}
```

Source: `packages/core-server/src/components/mail/helpers/executors/bull-mq-executor.helper.ts`

## `DefaultVerificationDataGenerator`

*class*

Builds `IVerificationData` from the bound code and token generators, with every timestamp taken at call time.

```ts
export declare class DefaultVerificationDataGenerator extends BaseHelper implements IVerificationDataGenerator {
    private codeGenerator;
    private tokenGenerator;
    constructor(codeGenerator: IVerificationCodeGenerator, tokenGenerator: IVerificationTokenGenerator);
    generateVerificationData(options: IVerificationGenerationOptions): IVerificationData;
}
```

Source: `packages/core-server/src/components/mail/services/generators/verification-data.ts`

## `DirectMailExecutorHelper`

*class*

Mail queue executor with no queue: runs the processor inline and returns its result. `options` are ignored.

```ts
export declare class DirectMailExecutorHelper extends BaseHelper implements IMailQueueExecutor {
    private processor?;
    constructor();
    setProcessor(processor: (email: string) => Promise<IMailProcessorResult>): void;
    enqueueVerificationEmail(email: string, _options?: IMailQueueOptions): Promise<IMailQueueResult>;
}
```

Source: `packages/core-server/src/components/mail/helpers/executors/direct-executor.helper.ts`

## `IAmazonSesMailOptions`

*interface*

Mail options for the `amazon-ses` provider (SES HTTPS API); use `nodemailer` for SES over SMTP.

```ts
export interface IAmazonSesMailOptions extends IBaseMailOptions {
    provider: 'amazon-ses';
    config: TAmazonSesConfig;
    module?: TAmazonSesModule;
}
```

Source: `packages/core-server/src/components/mail/common/types/options.ts`

## `IBaseMailOptions`

*interface*

Options shared by every mail provider.

```ts
export interface IBaseMailOptions {
    /**
     * Sender used when a message sets none.
     *
     * @default MailDefaults.FALLBACK_FROM
     */
    from?: string;
    fromName?: string;
    /**
     * The only directory an `attachment.path` may be read from; `path` is resolved against it and
     * refused if it lands outside, symlinks included. Unset, every `path` is refused.
     */
    attachmentRoot?: string;
    /**
     * Bytes of attachment content one message may carry, all attachments together.
     *
     * @default MailDefaults.MAX_ATTACHMENT_BYTES
     */
    maxAttachmentBytes?: number;
}
```

Source: `packages/core-server/src/components/mail/common/types/options.ts`

## `IBullMQMailExecutorOpts`

*interface*

Options of the BullMQ mail executor: the Redis connection, the queue `identifier` and BullMQ `name`, and which of queue and workers this process runs.

```ts
export interface IBullMQMailExecutorOpts {
    /** `redis.module` passes `ioredis` itself - see `module` below for why. */
    redis: IRedisSingleHelperOptions;
    queue: {
        identifier: string;
        name: string;
    };
    mode: TConstValue<typeof BullMQExecutorModes>;
    /** `bullmq` itself, for a `bun build --compile` binary that has no `node_modules` to load it from. */
    module?: typeof import('bullmq');
}
```

Source: `packages/core-server/src/components/mail/common/types/queue.ts`

## `ICustomMailOptions`

*interface*

Mail options for the `custom` provider; `config` is the transport to use as is.

```ts
export interface ICustomMailOptions extends IBaseMailOptions {
    provider: 'custom';
    config: IMailTransport;
}
```

Source: `packages/core-server/src/components/mail/common/types/options.ts`

## `IGenericMailOptions`

*interface*

Mail options with an arbitrary provider name and config; accepted by the type, but the transport provider throws on a name it does not support.

```ts
export interface IGenericMailOptions extends IBaseMailOptions {
    provider: string;
    config: Record<string, AnyType>;
}
```

Source: `packages/core-server/src/components/mail/common/types/options.ts`

## `IInternalQueueMailExecutorOpts`

*interface*

Options of the in-process queue executor; `identifier` names its queue.

```ts
export interface IInternalQueueMailExecutorOpts {
    identifier: string;
}
```

Source: `packages/core-server/src/components/mail/common/types/queue.ts`

## `IMailAttachment`

*interface*

One attachment on an `IMailMessage`. Give `content` or `path`; `cid` makes the part inline, referenced as `cid:<value>` from the HTML body.

```ts
export interface IMailAttachment {
    filename?: string;
    contentType?: string;
    /** A file under the mail options' `attachmentRoot`; refused when no root is set. */
    path?: string;
    content?: string | Buffer | Uint8Array | Readable | ReadableStream<Uint8Array>;
    encoding?: BufferEncoding;
    cid?: string;
    [key: string]: any;
}
```

Source: `packages/core-server/src/components/mail/common/types/message.ts`

## `IMailgunMailOptions`

*interface*

Mail options for the `mailgun` provider; `config` needs `username`, `key` and `domain`, and `module` hands over the `mailgun.js` module.

```ts
export interface IMailgunMailOptions extends IBaseMailOptions {
    provider: 'mailgun';
    config: TMailgunConfig;
    module?: TMailgunModule;
}
```

Source: `packages/core-server/src/components/mail/common/types/options.ts`

## `IMailMessage`

*interface*

A mail to send. `to` needs at least one recipient, `subject` is required, and at least one of `text` or `html` must be set; `from` falls back to the options' `from` (with `fromName`).

```ts
export interface IMailMessage {
    /**
     * Sender of this message.
     *
     * @default the mail options' `from` with `fromName`, else `MailDefaults.FALLBACK_FROM`
     */
    from?: string;
    to: string | string[];
    cc?: string | string[];
    bcc?: string | string[];
    replyTo?: string;
    subject: string;
    text?: string;
    html?: string;
    attachments?: IMailAttachment[];
    headers?: Record<string, string>;
    requireValidate?: boolean;
    [key: string]: any;
}
```

Source: `packages/core-server/src/components/mail/common/types/message.ts`

## `IMailProcessorResult`

*interface*

Result a queue processor returns for one verification mail; returning `success: false` marks the job failed so it is retried.

```ts
export interface IMailProcessorResult {
    success: boolean;
    message: string;
    expiresInMinutes: number;
    nextResendAt?: string;
}
```

Source: `packages/core-server/src/components/mail/common/types/queue.ts`

## `IMailQueueExecutor`

*interface*

Queues verification mails and runs them through the processor registered with `setProcessor`.

```ts
export interface IMailQueueExecutor {
    enqueueVerificationEmail(email: string, options?: IMailQueueOptions): Promise<IMailQueueResult>;
    setProcessor(processor: (email: string) => Promise<IMailProcessorResult>): void;
}
```

Source: `packages/core-server/src/components/mail/common/types/queue.ts`

## `IMailQueueExecutorConfig`

*interface*

Selects and configures the mail queue executor; the field matching `type` (`internalQueue` or `bullmq`) is required for that type.

```ts
export interface IMailQueueExecutorConfig {
    type: TConstValue<typeof MailQueueExecutorTypes>;
    internalQueue?: IInternalQueueMailExecutorOpts;
    bullmq?: IBullMQMailExecutorOpts;
}
```

Source: `packages/core-server/src/components/mail/common/types/queue.ts`

## `IMailQueueOptions`

*interface*

Per-job options for a queued verification mail. `delay` and `backoff.delay` are milliseconds; `attempts` is the total number of tries, first included.

```ts
export interface IMailQueueOptions {
    priority?: number;
    delay?: number;
    attempts?: number;
    backoff?: {
        type: TMailBackoffType;
        delay: number;
    };
}
```

Source: `packages/core-server/src/components/mail/common/types/queue.ts`

## `IMailQueueResult`

*interface*

Result of enqueueing a verification mail; `queued` is `false` and `result` is set when the executor ran the mail inline.

```ts
export interface IMailQueueResult {
    jobId?: string;
    queued: boolean;
    message: string;
    result?: IMailProcessorResult;
}
```

Source: `packages/core-server/src/components/mail/common/types/queue.ts`

## `IMailSendResult`

*interface*

Outcome of one send: `success` plus the provider `messageId`, or an `error` string when the send failed.

```ts
export interface IMailSendResult {
    success: boolean;
    messageId?: string;
    response?: any;
    error?: string;
}
```

Source: `packages/core-server/src/components/mail/common/types/message.ts`

## `IMailService`

*interface*

The service callers use to send mail; wraps the configured `IMailTransport`.

```ts
export interface IMailService {
    send(message: IMailMessage): Promise<IMailSendResult>;
    sendBatch(messages: IMailMessage[], options?: {
        concurrency?: number;
    }): Promise<IMailSendResult[]>;
    sendTemplate(opts: {
        templateName: string;
        data: Record<string, any>;
        recipients: string | string[];
        options?: Partial<IMailMessage>;
    }): Promise<IMailSendResult>;
    verify(): Promise<boolean>;
}
```

Source: `packages/core-server/src/components/mail/common/types/message.ts`

## `IMailTemplateEngine`

*interface*

Stores and renders mail templates. Render with a registered `templateName` or inline `templateData`.

```ts
export interface IMailTemplateEngine {
    render(opts: {
        templateData?: string;
        templateName?: string;
        data: Record<string, any>;
        requireValidate?: boolean;
    }): string;
    registerTemplate(opts: {
        name: string;
        content: string;
    }): void;
    validateTemplateData(opts: {
        template: string;
        data: Record<string, any>;
    }): {
        isValid: boolean;
        missingKeys: string[];
        allKeys: string[];
    };
    getTemplate(name: string): ITemplate | undefined;
    listTemplates(): ITemplate[];
    hasTemplate(name: string): boolean;
    removeTemplate(name: string): boolean;
}
```

Source: `packages/core-server/src/components/mail/common/types/template.ts`

## `IMailTransport`

*interface*

A mail provider backend. `verify` checks the connection or credentials; `close`, when present, releases the client.

```ts
export interface IMailTransport {
    send(message: IMailMessage): Promise<IMailSendResult>;
    verify(): Promise<boolean>;
    close?(): Promise<void>;
}
```

Source: `packages/core-server/src/components/mail/common/types/message.ts`

## `INodemailerMailOptions`

*interface*

Mail options for the `nodemailer` provider; `module` hands over the `nodemailer` module instead of loading it by name.

```ts
export interface INodemailerMailOptions extends IBaseMailOptions {
    provider: 'nodemailer';
    config: TNodemailerConfig;
    module?: TNodemailerModule;
}
```

Source: `packages/core-server/src/components/mail/common/types/options.ts`

## `InternalQueueMailExecutorHelper`

*class*

In-process mail queue executor: jobs are lost on restart. Supports `delay`, `attempts` and `backoff`; call `close` to clear pending timers.

```ts
export declare class InternalQueueMailExecutorHelper extends BaseHelper implements IMailQueueExecutor {
    private queue;
    private jobIdCounter;
    private delayedJobs;
    private processor?;
    constructor(opts: IInternalQueueMailExecutorOpts);
    setProcessor(processor: (email: string) => Promise<IMailProcessorResult>): void;
    enqueueVerificationEmail(email: string, options?: IMailQueueOptions): Promise<IMailQueueResult>;
    /** Releases every pending delayed/backoff timer - a live `setTimeout` holds the event loop open past the executor. */
    close(): Promise<void>;
    private processJob;
    private calculateBackoff;
}
```

Source: `packages/core-server/src/components/mail/helpers/executors/internal-queue-executor.helper.ts`

## `IQueueJobPayload`

*interface*

Envelope every queue-backed executor stores for one pending verification email.

```ts
export interface IQueueJobPayload {
    id: string;
    email: string;
    options?: IMailQueueOptions;
    attempts: number;
    scheduledAt: number;
}
```

Source: `packages/core-server/src/components/mail/common/types/queue.ts`

## `ITemplate`

*interface*

A registered mail template: `content` is the body, `subject` and `description` are optional.

```ts
export interface ITemplate {
    name: string;
    content?: string;
    render?: (data: Record<string, AnyType>) => string;
    subject?: string;
    description?: string;
}
```

Source: `packages/core-server/src/components/mail/common/types/template.ts`

## `IVerificationCodeGenerator`

*interface*

Generates a numeric verification code.

```ts
export interface IVerificationCodeGenerator {
    generateCode(length: number): string;
}
```

Source: `packages/core-server/src/components/mail/common/types/verification.ts`

## `IVerificationData`

*interface*

A verification code and token with their generation and expiry times (ISO 8601 strings) and the failed-attempt count.

```ts
export interface IVerificationData {
    verificationCode: string;
    codeGeneratedAt: string;
    codeExpiresAt: string;
    codeAttempts: number;
    verificationToken: string;
    tokenGeneratedAt: string;
    tokenExpiresAt: string;
    lastCodeSentAt: string;
}
```

Source: `packages/core-server/src/components/mail/common/types/verification.ts`

## `IVerificationDataGenerator`

*interface*

Generates a full `IVerificationData` (code, token, timestamps) from the given sizes and lifetimes.

```ts
export interface IVerificationDataGenerator {
    generateVerificationData(options: IVerificationGenerationOptions): IVerificationData;
}
```

Source: `packages/core-server/src/components/mail/common/types/verification.ts`

## `IVerificationGenerationOptions`

*interface*

Sizes and lifetimes for generated verification data: code digits, token bytes, code lifetime in minutes, token lifetime in hours.

```ts
export interface IVerificationGenerationOptions {
    codeLength: number;
    tokenBytes: number;
    codeExpiryMinutes: number;
    tokenExpiryHours: number;
}
```

Source: `packages/core-server/src/components/mail/common/types/verification.ts`

## `IVerificationTokenGenerator`

*interface*

Generates a random verification token.

```ts
export interface IVerificationTokenGenerator {
    generateToken(bytes: number): string;
}
```

Source: `packages/core-server/src/components/mail/common/types/verification.ts`

## `MailAddressUtility`

*class*

Helpers for mailbox address strings.

```ts
export declare class MailAddressUtility {
    /**
     * Splits one or more RFC 5322 mailbox strings into individual addresses. A caller-supplied `to`
     * is frequently a single comma-separated string (`"a@x.com, b@y.com"`), not an array - treating
     * it as one opaque address turns it into a single malformed recipient. Splitting only at
     * top-level commas (outside a quoted display name) keeps `"Doe, Jane" <jane@x.com>` intact while
     * still separating `"Doe, Jane" <jane@x.com>, bob@y.com` into its two mailboxes.
     */
    static splitList(opts: {
        value: string | string[];
    }): string[];
}
```

Source: `packages/core-server/src/components/mail/utilities/address.utility.ts`

## `MailBackoffTypes`

*class*

How the delay between two attempts to send a queued mail grows: FIXED stays the same, EXPONENTIAL doubles.

```ts
export declare class MailBackoffTypes {
    static readonly FIXED = "fixed";
    static readonly EXPONENTIAL = "exponential";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): boolean;
}
```

Source: `packages/core-server/src/components/mail/common/constants.ts`

## `MailComponent`

*class*

Registers the mail transport, queue executor, template engine, `MailService` and verification generators under `MailKeys`. Options come from `MailKeys.MAIL_OPTIONS` or from the options passed to `application.component`; boot throws when they are missing or when `attachmentRoot` or `maxAttachmentBytes` is invalid.

```ts
export declare class MailComponent extends BaseComponent<TMailOptions> {
    private application;
    constructor(application: BaseApplication);
    /** `application.component(MailComponent, { options })` lands here; the call site outranks a key bound earlier. */
    configure(opts?: TMailOptions): Promise<void>;
    binding(): void | Promise<void>;
    initGenerators(): void;
    initProviders(): void;
    initServices(): void;
    /** A bad limit or root would otherwise surface on every send, as a 400 that blames the caller. */
    private validateAttachmentOptions;
    createAndBindInstances(): void;
}
```

Source: `packages/core-server/src/components/mail/component.ts`

## `MailDefaults`

*class*

Fallbacks for mail sending: the batch concurrency, the `from` address used when neither the message nor the options set one, and the attachment size cap.

```ts
export declare class MailDefaults {
    static readonly BATCH_CONCURRENCY = 5;
    static readonly FALLBACK_FROM = "noreply@example.com";
    /** Bytes of attachment content one message may carry, all attachments together. */
    static readonly MAX_ATTACHMENT_BYTES: number;
}
```

Source: `packages/core-server/src/components/mail/common/constants.ts`

## `MailErrorCodes`

*class*

Built via {@link MessageCode.build}: `ApplicationError` lower-cases codes, so a SCREAMING_CASE literal would reach the client in a spelling no const here matches.

```ts
export declare class MailErrorCodes {
    static readonly INVALID_CONFIGURATION: string;
    static readonly SEND_FAILED: string;
    static readonly VERIFICATION_FAILED: string;
    static readonly INVALID_RECIPIENT: string;
    static readonly BATCH_SEND_FAILED: string;
    static readonly TEMPLATE_NOT_FOUND: string;
    static readonly ATTACHMENT_PATH_REFUSED: string;
    static readonly ATTACHMENT_TOO_LARGE: string;
    static readonly BODY_SOURCE_REFUSED: string;
}
```

Source: `packages/core-server/src/components/mail/common/constants.ts`

## `MailErrors`

*const*

Codes are LITERAL strings, deliberately not `MailErrorCodes.*`: `MessageCode.build()` returns `string`, which erases the literal type `TRegisterErrors` is built on and silently kills autocomplete. The values are identical to what those constants produce - they are a public contract and must not shift.

```ts
export declare const MailErrors: {
    readonly TEMPLATE_NOT_FOUND: {
        readonly message: {
            readonly text: "Mail template not found";
            readonly code: "core.mail.template_not_found";
        };
        readonly statusCode: 404;
        readonly category: "business";
    };
    readonly INVALID_CONFIGURATION: {
        readonly message: {
            readonly text: "Invalid mail configuration";
            readonly code: "core.mail.invalid_configuration";
        };
        readonly statusCode: 400;
        readonly category: "validation";
    };
    readonly INVALID_RECIPIENT: {
        readonly message: {
            readonly text: "Invalid mail recipient";
            readonly code: "core.mail.invalid_recipient";
        };
        readonly statusCode: 400;
        readonly category: "validation";
    };
    /** One answer for every refused source - outside the root, missing, not a file - so a caller cannot probe which files exist. */
    readonly ATTACHMENT_PATH_REFUSED: {
        readonly message: {
            readonly text: "Mail attachment path refused";
            readonly code: "core.mail.attachment_path_refused";
        };
        readonly statusCode: 400;
        readonly category: "validation";
    };
    readonly ATTACHMENT_TOO_LARGE: {
        readonly message: {
            readonly text: "Mail attachments are larger than the maximum allowed";
            readonly code: "core.mail.attachment_too_large";
        };
        readonly statusCode: 413;
        readonly category: "validation";
    };
    readonly BODY_SOURCE_REFUSED: {
        readonly message: {
            readonly text: "Mail body must be text";
            readonly code: "core.mail.body_source_refused";
        };
        readonly statusCode: 400;
        readonly category: "validation";
    };
};
```

Source: `packages/core-server/src/components/mail/common/errors.ts`

## `MailExecutorErrors`

*class*

Messages thrown by the mail queue executors.

```ts
export declare class MailExecutorErrors {
    static readonly PROCESSOR_NOT_SET = "Processor not set. Call setProcessor() first.";
}
```

Source: `packages/core-server/src/components/mail/common/constants.ts`

## `MailgunTransportHelper`

*class*

Mailgun transport (`mailgun.js`). The constructor throws when `username`, `key` or `domain` is missing.

```ts
export declare class MailgunTransportHelper extends BaseHelper implements IMailTransport {
    private client;
    private domain;
    private module?;
    constructor(opts: {
        config: TMailgunConfig;
        module?: TMailgunModule;
    });
    configure(config: TMailgunConfig): void;
    /** Credentials and domain are checked here, not on the first send; the error never echoes a credential value back. */
    private validateConfig;
    /** Client factory seam - overridden in tests to run the helper without the mailgun.js peer. */
    protected buildClient(config: TMailgunConfig): AnyType;
    send(message: IMailMessage): Promise<IMailSendResult>;
    verify(): Promise<boolean>;
}
```

Source: `packages/core-server/src/components/mail/helpers/transporters/mailgun-transporter.helper.ts`

## `MailKeys`

*class*

DI binding keys the mail component registers and reads: options, queue executor config, transport and queue provider/instance, services and verification generators.

```ts
export declare class MailKeys {
    static readonly MAIL_OPTIONS = "@app/components/mail/options";
    static readonly MAIL_QUEUE_EXECUTOR_CONFIG = "@app/components/mail/queue/executor-config";
    static readonly MAIL_TRANSPORT_PROVIDER = "@app/components/mail/transport-provider";
    static readonly MAIL_TRANSPORT_INSTANCE = "@app/components/mail/transport-instance";
    static readonly MAIL_TEMPLATE_ENGINE = "@app/components/mail/services/template-engine";
    static readonly MAIL_SERVICE = "@app/components/mail/service";
    static readonly MAIL_VERIFICATION_CODE_GENERATOR = "@app/components/mail/verification/code-generator";
    static readonly MAIL_VERIFICATION_TOKEN_GENERATOR = "@app/components/mail/verification/token-generator";
    static readonly MAIL_VERIFICATION_DATA_GENERATOR = "@app/components/mail/verification/data-generator";
    static readonly MAIL_QUEUE_EXECUTOR_PROVIDER = "@app/components/mail/queue-executor-provider";
    static readonly MAIL_QUEUE_EXECUTOR_INSTANCE = "@app/components/mail/queue-executor-instance";
}
```

Source: `packages/core-server/src/components/mail/common/keys.ts`

## `MailMimeUtility`

*class*

Builds the MIME pieces the Amazon SES transport sends: the raw message and RFC 5322 address headers.

```ts
export declare class MailMimeUtility {
    /** Formats a `to`/`cc`/`from`/`replyTo` field as one RFC 5322 address list: splits a
     * comma-separated string or array into individual mailboxes, RFC 2047-encodes each display name,
     * and rejoins with `, ` - the same shape whether the caller passed a string or an array. */
    static formatAddressHeader(opts: {
        value: string | string[];
    }): string;
    /**
     * Builds a raw RFC 822 message with zero external dependencies - Amazon SES's `SendEmailCommand`
     * `Content.Simple` shape has no attachment field, so attachments require a raw MIME body. Written
     * by hand instead of depending on `nodemailer`'s `MailComposer` so the `ses` provider never needs
     * the `nodemailer` peer installed at all.
     *
     * Inline (`cid`) attachments nest under `multipart/related` next to the body - a mail client
     * only renders `cid:` references inline when they share a `multipart/related` parent with the
     * body; under `multipart/mixed` they show up as ordinary downloadable attachments instead. Plain
     * file attachments (no `cid`) stay under `multipart/mixed`, alongside the body or the
     * `multipart/related` group when both kinds are present.
     */
    static buildRawMessage(opts: {
        message: IMailMessage;
    }): Promise<Buffer>;
}
```

Source: `packages/core-server/src/components/mail/utilities/mime.utility.ts`

## `MailProviders`

*class*

Values of `TMailOptions.provider`, naming the transport the mail component builds.

```ts
export declare class MailProviders {
    static readonly NODEMAILER = "nodemailer";
    static readonly MAILGUN = "mailgun";
    static readonly CUSTOM = "custom";
    static readonly AMAZON_SES = "amazon-ses";
}
```

Source: `packages/core-server/src/components/mail/common/constants.ts`

## `MailQueueExecutorProvider`

*class*

Provides the `TGetMailQueueExecutorFn` factory bound at `MailKeys.MAIL_QUEUE_EXECUTOR_PROVIDER`.

```ts
export declare class MailQueueExecutorProvider extends BaseProvider<TGetMailQueueExecutorFn> {
    constructor();
    value(_container: Container): TGetMailQueueExecutorFn;
}
```

Source: `packages/core-server/src/components/mail/providers/mail-queue-executor.provider.ts`

## `MailQueueExecutorTypes`

*class*

Values of `IMailQueueExecutorConfig.type`, selecting how verification mails are queued: sent inline, held in process, or handed to BullMQ.

```ts
export declare class MailQueueExecutorTypes {
    static readonly DIRECT = "direct";
    static readonly INTERNAL_QUEUE = "internal-queue";
    static readonly BULLMQ = "bullmq";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): boolean;
}
```

Source: `packages/core-server/src/components/mail/common/constants.ts`

## `MailService`

*class*

Sends mail through the bound transport. `send` validates the message, applies the attachment policy and defaults `from`; failures are thrown as application errors with a mail message code, except `sendBatch`, which reports each failure in its result.

```ts
export declare class MailService extends BaseService implements IMailService {
    protected options: TMailOptions;
    protected transport: IMailTransport;
    protected templateEngine?: IMailTemplateEngine | undefined;
    constructor(options: TMailOptions, transport: IMailTransport, templateEngine?: IMailTemplateEngine | undefined);
    send(message: IMailMessage): Promise<IMailSendResult>;
    sendBatch(messages: IMailMessage[], options?: {
        concurrency?: number;
    }): Promise<IMailSendResult[]>;
    sendTemplate(opts: {
        templateName: string;
        data: Record<string, AnyType>;
        recipients: string | string[];
        options?: Partial<IMailMessage>;
    }): Promise<IMailSendResult>;
    verify(): Promise<boolean>;
    protected validateMessage(message: IMailMessage): void;
    protected getDefaultFrom(): string;
}
```

Source: `packages/core-server/src/components/mail/services/mail.service.ts`

## `MailTransportProvider`

*class*

Provides the `TGetMailTransportFn` factory bound at `MailKeys.MAIL_TRANSPORT_PROVIDER`.

```ts
export declare class MailTransportProvider extends BaseProvider<TGetMailTransportFn> {
    constructor();
    value(_container: Container): TGetMailTransportFn;
    private createNodemailerTransport;
    private createMailgunTransport;
    private createAmazonSesTransport;
    private createCustomTransport;
    private isNodemailerOptions;
    private isMailgunOptions;
    private isAmazonSesOptions;
    private isCustomOptions;
}
```

Source: `packages/core-server/src/components/mail/providers/mail-transporter.provider.ts`

## `MailTypeUtility`

*class*

Type guards for the mail component. Each takes its value as a positional parameter, not an options
object (V-C-02): a type predicate narrows its own parameter, so `{ value }` could not narrow the
caller's variable.

```ts
export declare class MailTypeUtility {
    /** Whether `value` is a transport: `send` and `verify` are functions, and `close` is a function or absent. */
    static isTransport(value: AnyType): value is IMailTransport;
    /** Whether `options` has a string `provider` and a truthy `config`; the shape of `config` is not checked. */
    static isValidOptions(options: AnyType): options is TMailOptions;
}
```

Source: `packages/core-server/src/components/mail/utilities/type.utility.ts`

## `MailVerificationUtility`

*class*

Computes expiry timestamps for verification data from now.

```ts
export declare class MailVerificationUtility {
    static getExpiryTime(opts: {
        minutes: number;
    }): Date;
    static getExpiryTimeInHours(opts: {
        hours: number;
    }): Date;
}
```

Source: `packages/core-server/src/components/mail/utilities/verification.utility.ts`

## `NodemailerTransportHelper`

*class*

SMTP transport on `nodemailer`, with its file and URL access switched off.

```ts
export declare class NodemailerTransportHelper extends BaseHelper implements IMailTransport {
    private transporter;
    private module?;
    constructor(opts: {
        config: TNodemailerConfig;
        module?: TNodemailerModule;
    });
    configure(config: TNodemailerConfig): void;
    /** Client factory seam - overridden in tests to run the helper without a real SMTP client. */
    protected buildTransporter(config: TNodemailerConfig): AnyType;
    send(message: IMailMessage): Promise<IMailSendResult>;
    verify(): Promise<boolean>;
    close(): Promise<void>;
}
```

Source: `packages/core-server/src/components/mail/helpers/transporters/nodemail-transporter.helper.ts`

## `NumericCodeGenerator`

*class*

Generates zero-padded numeric codes from a cryptographic source, uniformly distributed. `generateCode` throws unless `10 ** length` is an integer up to 2 ** 48.

```ts
export declare class NumericCodeGenerator extends BaseHelper implements IVerificationCodeGenerator {
    constructor();
    generateCode(length: number): string;
    /**
     * A uniform integer in `[0, max)`. A draw at or above the largest multiple of `max` is thrown away and drawn
     * again, so no code is likelier than another (`value % max` alone favours the low codes).
     */
    private static getRandomBelow;
}
```

Source: `packages/core-server/src/components/mail/services/generators/numeric-code.ts`

## `RandomTokenGenerator`

*class*

Generates base64url tokens from random bytes; `generateToken` throws unless `bytes` is a non-negative integer.

```ts
export declare class RandomTokenGenerator extends BaseHelper implements IVerificationTokenGenerator {
    constructor();
    generateToken(bytes: number): string;
}
```

Source: `packages/core-server/src/components/mail/services/generators/random-token.ts`

## `TAmazonSesClient`

*type*

An Amazon SES client with the command classes the transport sends and verifies with.

```ts
export type TAmazonSesClient = Pick<TAmazonSesModule, 'SendEmailCommand' | 'GetAccountCommand'> & {
    client: AnyType;
};
```

Source: `packages/core-server/src/components/mail/common/types/options.ts`

## `TAmazonSesConfig`

*type*

Amazon SES client configuration: `region` is required; `credentials` and `endpoint` are optional.

```ts
export type TAmazonSesConfig = {
    region: string;
    credentials?: {
        accessKeyId: string;
        secretAccessKey: string;
        sessionToken?: string;
    };
    endpoint?: string;
};
```

Source: `packages/core-server/src/components/mail/common/types/options.ts`

## `TAmazonSesModule`

*type*

Same story as {@link TNodemailerModule} - a compiled binary hands this over explicitly since there is no `node_modules` to resolve `@aws-sdk/client-sesv2` against.

```ts
export type TAmazonSesModule<TConfig extends AnyType = AnyType, TClient extends AnyType = AnyType> = {
    SESv2Client: new (config: TConfig) => TClient;
    SendEmailCommand: new (input: AnyType) => AnyType;
    GetAccountCommand: new (input?: AnyType) => AnyType;
};
```

Source: `packages/core-server/src/components/mail/common/types/options.ts`

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
        data: Record<string, AnyType>;
        requireValidate?: boolean;
    }): string;
    getTemplate(name: string): ITemplate | undefined;
    listTemplates(): ITemplate[];
    hasTemplate(name: string): boolean;
    removeTemplate(name: string): boolean;
    clearTemplates(): void;
    validateTemplateData(opts: {
        template: string;
        data: Record<string, AnyType>;
    }): {
        isValid: boolean;
        missingKeys: string[];
        allKeys: string[];
    };
    renderSimpleTemplate(template: string, data: Record<string, AnyType>, opts?: {
        requireValidate?: boolean;
    }): string;
    private getNestedValue;
}
```

Source: `packages/core-server/src/components/mail/services/template.service.ts`

## `TGetMailQueueExecutorFn`

*type*

Builds the queue executor for a config; throws when the config for its `type` is missing or the type is unknown.

```ts
export type TGetMailQueueExecutorFn = (config: IMailQueueExecutorConfig) => IMailQueueExecutor;
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

Mailgun client options (`mailgun.js`) plus the sending `domain`.

```ts
export type TMailgunConfig = AnyType & {
    domain: string;
};
```

Source: `packages/core-server/src/components/mail/common/types/options.ts`

## `TMailgunModule`

*type*

The `mailgun.js` class, as a constructor taking the form-data implementation.

```ts
export type TMailgunModule = new (formData: AnyType) => AnyType;
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
    createTransport: (config: AnyType, defaults?: AnyType) => AnyType;
};
```

Source: `packages/core-server/src/components/mail/common/types/options.ts`
