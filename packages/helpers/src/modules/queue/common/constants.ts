import type { TConstValue } from '@/common/types';

/** What a BullMQ helper is: the QUEUE that jobs are added to, or the WORKER that runs them. */
export class BullQueueRoles {
  static readonly QUEUE = 'queue';
  static readonly WORKER = 'worker';
}

/** What a BullMQ helper uses when its options leave a field out. */
export class BullMQDefaults {
  static readonly NUMBER_OF_WORKER = 1;

  /** How long a worker holds a job's lock: 90 minutes, in milliseconds. */
  static readonly LOCK_DURATION_MS = 90 * 60 * 1000;
}

/** Valid BullMQ queue role values. */
export type TBullQueueRole = TConstValue<typeof BullQueueRoles>;
