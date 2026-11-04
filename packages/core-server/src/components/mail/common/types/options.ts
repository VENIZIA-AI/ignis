import type { AnyType } from '@venizia/ignis-helpers/common';
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
  config: Record<string, AnyType>;
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

// MailgunClientOptions & {domain: string}
/** Mailgun client options (`mailgun.js`) plus the sending `domain`. */
export type TMailgunConfig = AnyType & { domain: string };

/**
 * The peer module itself, handed over by an application that already holds it. A `bun build
 * --compile` binary carries no `node_modules`, so the runtime lookup these transports fall back to
 * has nothing to resolve against - passing the module through the options is what a compiled
 * application does instead. Typed as the shape each transport actually uses, so a wrong module is
 * a compile error rather than a boot crash.
 */
export type TNodemailerModule = {
  createTransport: (config: AnyType, defaults?: AnyType) => AnyType;
};

/** The `mailgun.js` class, as a constructor taking the form-data implementation. */
export type TMailgunModule = new (formData: AnyType) => AnyType;

/** Amazon SES client configuration: `region` is required; `credentials` and `endpoint` are optional. */
export type TAmazonSesConfig = {
  region: string;
  credentials?: { accessKeyId: string; secretAccessKey: string; sessionToken?: string };
  endpoint?: string;
};

/** Same story as {@link TNodemailerModule} - a compiled binary hands this over explicitly since there is no `node_modules` to resolve `@aws-sdk/client-sesv2` against. */
export type TAmazonSesModule<
  TConfig extends AnyType = AnyType,
  TClient extends AnyType = AnyType,
> = {
  SESv2Client: new (config: TConfig) => TClient;
  SendEmailCommand: new (input: AnyType) => AnyType;
  GetAccountCommand: new (input?: AnyType) => AnyType;
};

/** An Amazon SES client with the command classes the transport sends and verifies with. */
export type TAmazonSesClient = Pick<TAmazonSesModule, 'SendEmailCommand' | 'GetAccountCommand'> & {
  client: AnyType;
};
