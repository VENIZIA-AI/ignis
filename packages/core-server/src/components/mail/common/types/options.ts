import type { AnyType } from '@venizia/ignis-helpers/common';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import type { IMailTransport } from './message';

export interface IBaseMailOptions {
  from?: string;
  fromName?: string;
}

export interface INodemailerMailOptions extends IBaseMailOptions {
  provider: 'nodemailer';
  config: TNodemailerConfig;
  module?: TNodemailerModule;
}

export interface IMailgunMailOptions extends IBaseMailOptions {
  provider: 'mailgun';
  config: TMailgunConfig;
  module?: TMailgunModule;
}

export interface ICustomMailOptions extends IBaseMailOptions {
  provider: 'custom';
  config: IMailTransport;
}

export interface IGenericMailOptions extends IBaseMailOptions {
  provider: string;
  config: Record<string, AnyType>;
}

export type TMailOptions =
  INodemailerMailOptions | IMailgunMailOptions | ICustomMailOptions | IGenericMailOptions;

export type TNodemailerConfig = SMTPTransport | SMTPTransport.Options | string;

// MailgunClientOptions & {domain: string}
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

export type TMailgunModule = new (formData: AnyType) => AnyType;
