export class MailDefaults {
  static readonly BATCH_CONCURRENCY = 5;
}

export class MailErrorCodes {
  static readonly INVALID_CONFIGURATION = 'MAIL_INVALID_CONFIGURATION';
  static readonly SEND_FAILED = 'MAIL_SEND_FAILED';
  static readonly VERIFICATION_FAILED = 'MAIL_VERIFICATION_FAILED';
  static readonly INVALID_RECIPIENT = 'MAIL_INVALID_RECIPIENT';
  static readonly BATCH_SEND_FAILED = 'MAIL_BATCH_SEND_FAILED';
  static readonly TEMPLATE_NOT_FOUND = 'TEMPLATE_NOT_FOUND';
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
