import { Readable } from 'node:stream';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import { MailQueueExecutorTypes } from './constants';
import { AnyType, TConstValue } from '@/helpers';
import { IBullMQMailExecutorOpts } from '../helpers';

export class MailProviders {
  static readonly NODEMAILER = 'nodemailer';
  static readonly MAILGUN = 'mailgun';
  static readonly CUSTOM = 'custom';
}

export type TMailProvider = TConstValue<typeof MailProviders>;

export interface IBaseMailOptions {
  from?: string;
  fromName?: string;
}

export interface INodemailerMailOptions extends IBaseMailOptions {
  provider: 'nodemailer';
  config: TNodemailerConfig;
}

export interface IMailgunMailOptions extends IBaseMailOptions {
  provider: 'mailgun';
  config: TMailgunConfig;
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
  | INodemailerMailOptions
  | IMailgunMailOptions
  | ICustomMailOptions
  | IGenericMailOptions;

export type TNodemailerConfig = SMTPTransport | SMTPTransport.Options | string;

// MailgunClientOptions & {domain: string}
export type TMailgunConfig = AnyType & { domain: string };

export interface IMailAttachment {
  filename?: string;
  contentType?: string;
  path?: string;
  content?: string | Buffer | Readable;
  cid?: string;
  [key: string]: any;
}

export interface IMailMessage {
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

export interface IMailSendResult {
  success: boolean;
  messageId?: string;
  response?: any;
  error?: string;
}

export interface IMailTransport {
  send(message: IMailMessage): Promise<IMailSendResult>;
  verify(): Promise<boolean>;
  close?(): Promise<void>;
}

export interface IMailService {
  send(message: IMailMessage): Promise<IMailSendResult>;
  sendBatch(
    messages: IMailMessage[],
    options?: {
      concurrency?: number;
    },
  ): Promise<IMailSendResult[]>;
  sendTemplate(opts: {
    templateName: string;
    data: Record<string, any>;
    recipients: string | string[];
    options?: Partial<IMailMessage>;
  }): Promise<IMailSendResult>;
  verify(): Promise<boolean>;
}

export interface ITemplate {
  name: string;
  content?: string;
  render?: (data: Record<string, AnyType>) => string;
  subject?: string;
  description?: string;
}

export interface IMailTemplateEngine {
  render(opts: {
    templateData?: string;
    templateName?: string;
    data: Record<string, any>;
    requireValidate?: boolean;
  }): string;
  registerTemplate(opts: { name: string; content: string }): void;
  validateTemplateData(opts: { template: string; data: Record<string, any> }): {
    isValid: boolean;
    missingKeys: string[];
    allKeys: string[];
  };
  getTemplate(name: string): ITemplate | undefined;
  listTemplates(): ITemplate[];
  hasTemplate(name: string): boolean;
  removeTemplate(name: string): boolean;
}

export interface IVerificationGenerationOptions {
  codeLength: number;
  tokenBytes: number;
  codeExpiryMinutes: number;
  tokenExpiryHours: number;
}

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

export interface IVerificationCodeGenerator {
  generateCode(length: number): string;
}

export interface IVerificationTokenGenerator {
  generateToken(bytes: number): string;
}

export interface IVerificationDataGenerator {
  generateVerificationData(options: IVerificationGenerationOptions): IVerificationData;
}

export interface IMailQueueOptions {
  priority?: number;
  delay?: number;
  attempts?: number;
  backoff?: {
    type: 'fixed' | 'exponential';
    delay: number;
  };
}

export interface IMailProcessorResult {
  success: boolean;
  message: string;
  expiresInMinutes: number;
  nextResendAt?: string;
}

export interface IMailQueueResult {
  jobId?: string;
  queued: boolean;
  message: string;
  result?: IMailProcessorResult;
}

export interface IMailQueueExecutor {
  enqueueVerificationEmail(email: string, options?: IMailQueueOptions): Promise<IMailQueueResult>;
  setProcessor(processor: (email: string) => Promise<IMailProcessorResult>): void;
}

export interface IInternalQueueMailExecutorOpts {
  identifier: string;
}

export interface IMailQueueExecutorConfig {
  type: TConstValue<typeof MailQueueExecutorTypes>;
  internalQueue?: IInternalQueueMailExecutorOpts;
  bullmq?: IBullMQMailExecutorOpts;
}
