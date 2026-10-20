import { type AnyType, type ValueOrPromise } from '@/common/types';
import { BaseHelper } from '@/modules/base';
import { type IWorkerBus, type IWorkerThread } from '../common';

export abstract class AbstractWorkerThreadHelper extends BaseHelper implements IWorkerThread {
  buses: {
    [workerKey: string | symbol]: IWorkerBus<AnyType, AnyType>;
  };

  abstract bindWorkerBus<IC, IP>(opts: {
    key: string;
    bus: IWorkerBus<IC, IP>;
  }): ValueOrPromise<void>;

  abstract getWorkerBus<IC, IP>(opts: { key: string }): IWorkerBus<IC, IP>;
}
