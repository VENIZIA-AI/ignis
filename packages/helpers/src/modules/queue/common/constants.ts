import type { TConstValue } from '@/common/types';

/** What a BullMQ helper is: the QUEUE that jobs are added to, or the WORKER that runs them. */
export class BullQueueRoles {
  static readonly QUEUE = 'queue';
  static readonly WORKER = 'worker';

  static readonly SCHEME_SET = new Set<string>([this.QUEUE, this.WORKER]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

/** Valid BullMQ queue role values. */
export type TBullQueueRole = TConstValue<typeof BullQueueRoles>;
