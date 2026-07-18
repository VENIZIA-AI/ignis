import { MessageCode } from '@venizia/ignis-helpers';

export class MailDefaults {
  static readonly BATCH_CONCURRENCY = 5;
  static readonly FALLBACK_FROM = 'noreply@example.com';
}

/**
 * Built via {@link MessageCode.build}: `ApplicationError` lower-cases codes, so a SCREAMING_CASE
 * literal here would reach the client in a spelling no const in this file matches.
 */
export class MailErrorCodes {
  static readonly INVALID_CONFIGURATION = MessageCode.build({
    parts: ['core', 'mail', 'invalid_configuration'],
  });
  static readonly SEND_FAILED = MessageCode.build({ parts: ['core', 'mail', 'send_failed'] });
  static readonly VERIFICATION_FAILED = MessageCode.build({
    parts: ['core', 'mail', 'verification_failed'],
  });
  static readonly INVALID_RECIPIENT = MessageCode.build({
    parts: ['core', 'mail', 'invalid_recipient'],
  });
  static readonly BATCH_SEND_FAILED = MessageCode.build({
    parts: ['core', 'mail', 'batch_send_failed'],
  });
  static readonly TEMPLATE_NOT_FOUND = MessageCode.build({
    parts: ['core', 'mail', 'template_not_found'],
  });
}

export class MailExecutorErrors {
  static readonly PROCESSOR_NOT_SET = 'Processor not set. Call setProcessor() first.';
}

export class MailQueueExecutorTypes {
  static readonly DIRECT = 'direct';
  static readonly INTERNAL_QUEUE = 'internal-queue';
  static readonly BULLMQ = 'bullmq';

  static readonly SCHEME_SET = new Set<string>([this.DIRECT, this.INTERNAL_QUEUE, this.BULLMQ]);
  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

export class BullMQExecutorModes {
  static readonly QUEUE_ONLY = 'queue-only';
  static readonly WORKER_ONLY = 'worker-only';
  static readonly BOTH = 'both';

  static readonly MODE_SET = new Set<string>([this.QUEUE_ONLY, this.WORKER_ONLY, this.BOTH]);
  static isValid(value: string): boolean {
    return this.MODE_SET.has(value);
  }
}
