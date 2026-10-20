import type { Readable } from 'node:stream';

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
