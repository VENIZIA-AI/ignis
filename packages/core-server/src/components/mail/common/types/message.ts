import type { Readable } from 'node:stream';

/** One attachment on an `IMailMessage`. Give `content` or `path`; `cid` makes the part inline, referenced as `cid:<value>` from the HTML body. */
export interface IMailAttachment {
  filename?: string;
  contentType?: string;
  /** A file under the mail options' `attachmentRoot`; refused when no root is set. */
  path?: string;
  content?: string | Buffer | Uint8Array | Readable | ReadableStream<Uint8Array>;
  encoding?: BufferEncoding;
  cid?: string;
  [key: string]: unknown;
}

/** A mail to send. `to` needs at least one recipient, `subject` is required, and at least one of `text` or `html` must be set; `from` falls back to the options' `from` (with `fromName`). */
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
  [key: string]: unknown;
}

/** Outcome of one send: `success` plus the provider `messageId`, or an `error` string when the send failed. */
export interface IMailSendResult {
  success: boolean;
  messageId?: string;
  response?: unknown;
  error?: string;
}

/** A mail provider backend. `verify` checks the connection or credentials; `close`, when present, releases the client. */
export interface IMailTransport {
  send(message: IMailMessage): Promise<IMailSendResult>;
  verify(): Promise<boolean>;
  close?(): Promise<void>;
}

/** The service callers use to send mail; wraps the configured `IMailTransport`. */
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
    data: Record<string, unknown>;
    recipients: string | string[];
    options?: Partial<IMailMessage>;
  }): Promise<IMailSendResult>;
  verify(): Promise<boolean>;
}
