import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import type { IMailTransport } from './message';

/** Options shared by every mail provider. */
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

/** Mail options for the `nodemailer` provider; `module` hands over the `nodemailer` module instead of loading it by name. */
export interface INodemailerMailOptions extends IBaseMailOptions {
  provider: 'nodemailer';
  config: TNodemailerConfig;
  module?: TNodemailerModule;
}

/** Mail options for the `mailgun` provider; `config` needs `username`, `key` and `domain`, and `module` hands over the `mailgun.js` module. */
export interface IMailgunMailOptions extends IBaseMailOptions {
  provider: 'mailgun';
  config: TMailgunConfig;
  module?: TMailgunModule;
}

/** Mail options for the `amazon-ses` provider (SES HTTPS API); use `nodemailer` for SES over SMTP. */
export interface IAmazonSesMailOptions extends IBaseMailOptions {
  provider: 'amazon-ses';
  config: TAmazonSesConfig;
  module?: TAmazonSesModule;
}

/** Mail options for the `custom` provider; `config` is the transport to use as is. */
export interface ICustomMailOptions extends IBaseMailOptions {
  provider: 'custom';
  config: IMailTransport;
}

/** Mail options with an arbitrary provider name and config; accepted by the type, but the transport provider throws on a name it does not support. */
export interface IGenericMailOptions extends IBaseMailOptions {
  provider: string;
  config: Record<string, unknown>;
}

/** Options passed to the mail component, discriminated by `provider`. */
export type TMailOptions =
  | INodemailerMailOptions
  | IAmazonSesMailOptions
  | IMailgunMailOptions
  | ICustomMailOptions
  | IGenericMailOptions;

/** Nodemailer `createTransport` argument: a transport instance, SMTP options or a connection URL. */
export type TNodemailerConfig = SMTPTransport | SMTPTransport.Options | string;

/** Mailgun client options (`mailgun.js`) plus the sending `domain`; the transport throws on a missing `username`, `key` or `domain`. */
export type TMailgunConfig = {
  username: string;
  key: string;
  domain: string;
  url?: string;
  [option: string]: unknown;
};

/**
 * The peer module itself, handed over by an application that already holds it. A `bun build
 * --compile` binary carries no `node_modules`, so the runtime lookup these transports fall back to
 * has nothing to resolve against - passing the module through the options is what a compiled
 * application does instead. Typed as the shape each transport actually uses, so a wrong module is
 * a compile error rather than a boot crash.
 */
export type TNodemailerModule = {
  createTransport(config: TNodemailerConfig, defaults?: object): INodemailerTransporter;
};

/** The part of a `nodemailer` transporter the transport calls. */
export interface INodemailerTransporter {
  sendMail(mailOptions: object): Promise<{ messageId?: string; response?: unknown }>;
  verify(): Promise<unknown>;
  close(): void;
}

/** The result of one `mailgun.js` send; `id` is the message id. */
export interface IMailgunSendResult {
  id?: string;
}

/** The part of the `mailgun.js` messages client the transport calls. */
export interface IMailgunMessagesClient {
  create(domain: string, message: object): Promise<IMailgunSendResult>;
}

/** The `mailgun.js` class, as a constructor taking the form-data implementation. */
export type TMailgunModule = new (formData: typeof FormData) => {
  client(config: object): { messages: IMailgunMessagesClient };
};

/** Amazon SES client configuration: `region` is required; `credentials` and `endpoint` are optional. */
export type TAmazonSesConfig = {
  region: string;
  credentials?: { accessKeyId: string; secretAccessKey: string; sessionToken?: string };
  endpoint?: string;
};

/** The part of an `@aws-sdk/client-sesv2` client the transport calls; `send` resolves with the command's output. */
export interface IAmazonSesClient {
  send(command: object): Promise<unknown>;
  destroy?(): void;
}

/** The input of a `SendEmailCommand`: the sender, the recipients and the raw MIME body. */
export interface IAmazonSesSendEmailInput {
  FromEmailAddress?: string;
  Destination: { ToAddresses: string[]; CcAddresses?: string[]; BccAddresses?: string[] };
  ReplyToAddresses?: string[];
  Content: { Raw: { Data: Uint8Array } };
}

/** Same story as {@link TNodemailerModule} - a compiled binary hands this over explicitly since there is no `node_modules` to resolve `@aws-sdk/client-sesv2` against. */
export type TAmazonSesModule<
  TConfig = TAmazonSesConfig,
  TClient extends IAmazonSesClient = IAmazonSesClient,
> = {
  SESv2Client: new (config: TConfig) => TClient;
  SendEmailCommand: new (input: IAmazonSesSendEmailInput) => object;
  GetAccountCommand: new (input: object) => object;
};

/** An Amazon SES client with the command classes the transport sends and verifies with. */
export type TAmazonSesClient = Pick<TAmazonSesModule, 'SendEmailCommand' | 'GetAccountCommand'> & {
  client: IAmazonSesClient;
};
