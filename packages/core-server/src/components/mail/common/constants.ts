import type { TConstValue } from '@venizia/ignis-helpers/common';
import { MessageCode } from '@venizia/ignis-helpers/core';

/** Fallbacks for mail sending: the batch concurrency, the `from` address used when neither the message nor the options set one, and the attachment size cap. */
export class MailDefaults {
  static readonly BATCH_CONCURRENCY = 5;
  static readonly FALLBACK_FROM = 'noreply@example.com';
  /** Bytes of attachment content one message may carry, all attachments together. */
  static readonly MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
  /** The subject of a template mail that has none of its own. */
  static readonly SUBJECT = 'No Subject';
  /** Tries per queued mail, the first included, unless the job options say otherwise. */
  static readonly ATTEMPTS = 3;
  static readonly BACKOFF_DELAY_MS = 1000;
  /** How long a failed BullMQ mail job stays in Redis (it holds a recipient address), and the most that stay. */
  static readonly FAILED_JOB_RETENTION = { age: 7 * 24 * 60 * 60, count: 1000 };
}

/** Where a rendered template is going: `HTML` escapes every double-brace placeholder, `TEXT` (a subject, a plain-text part) inserts it as it is. A triple-brace placeholder is raw in both. */
export class MailTemplateFormats {
  static readonly HTML = 'html';
  static readonly TEXT = 'text';
}

/** Union of the `MailTemplateFormats` values. */
export type TMailTemplateFormat = TConstValue<typeof MailTemplateFormats>;

/** Names of the jobs the BullMQ mail executor adds. */
export class MailQueueJobNames {
  static readonly SEND_VERIFICATION_EMAIL = 'send-verification-email';
}

/** The codes of the server-side failures, which are not in the 4xx `MailErrors` catalog. Built via {@link MessageCode.build}: `ApplicationError` lower-cases codes, so a SCREAMING_CASE literal would reach the client in a spelling no const here matches. */
export class MailErrorCodes {
  static readonly SEND_FAILED = MessageCode.build({ parts: ['core', 'mail', 'send_failed'] });
  static readonly VERIFICATION_FAILED = MessageCode.build({
    parts: ['core', 'mail', 'verification_failed'],
  });

  static readonly BATCH_SEND_FAILED = MessageCode.build({
    parts: ['core', 'mail', 'batch_send_failed'],
  });
}

/** Messages thrown by the mail queue executors. */
export class MailExecutorErrors {
  static readonly PROCESSOR_NOT_SET = 'Processor not set. Call setProcessor() first.';
  static readonly CLOSED = 'The executor is closed and takes no more jobs.';
}

/** Values of `TMailQueueExecutorConfig.type`, selecting how verification mails are queued: sent inline, held in process, or handed to BullMQ. */
export class MailQueueExecutorTypes {
  static readonly DIRECT = 'direct';
  static readonly INTERNAL_QUEUE = 'internal-queue';
  static readonly BULLMQ = 'bullmq';
}

/** Values of `IBullMQMailExecutorOpts.mode`: `queue-only` enqueues jobs without starting workers, `worker-only` starts workers without a queue, `both` does each. */
export class BullMQExecutorModes {
  static readonly QUEUE_ONLY = 'queue-only';
  static readonly WORKER_ONLY = 'worker-only';
  static readonly BOTH = 'both';
}

/** Values of `TMailOptions.provider`, naming the transport the mail component builds. */
export class MailProviders {
  static readonly NODEMAILER = 'nodemailer';
  static readonly MAILGUN = 'mailgun';
  static readonly CUSTOM = 'custom';
  // Amazon SES supports both SMTP and HTTPS - this provider is the HTTPS API path; SMTP goes through NODEMAILER instead.
  static readonly AMAZON_SES = 'amazon-ses';
}

/** Union of the `MailProviders` values. */
export type TMailProvider = TConstValue<typeof MailProviders>;

/** How the delay between two attempts to send a queued mail grows: FIXED stays the same, EXPONENTIAL doubles. */
export class MailBackoffTypes {
  static readonly FIXED = 'fixed';
  static readonly EXPONENTIAL = 'exponential';
}

/** Valid mail backoff type values. */
export type TMailBackoffType = TConstValue<typeof MailBackoffTypes>;
