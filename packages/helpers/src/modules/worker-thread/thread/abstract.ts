import { type TValueOrPromise } from '@/common/types';
import { BaseHelper } from '@/modules/base';
import { type IWorkerBus, type IWorkerThread } from '../common';

/** Base for the worker-side helper that holds message buses by key. */
export abstract class AbstractWorkerThreadHelper extends BaseHelper implements IWorkerThread {
  buses: {
    [workerKey: string | symbol]: IWorkerBus<never, never>;
  };

  abstract bindWorkerBus<IC, IP>(opts: {
    key: string;
    bus: IWorkerBus<IC, IP>;
  }): TValueOrPromise<void>;

  abstract getWorkerBus<IC, IP>(opts: { key: string }): IWorkerBus<IC, IP>;
}
