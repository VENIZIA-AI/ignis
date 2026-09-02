import { getError } from '@/modules/error';
import { isMainThread } from 'node:worker_threads';
import { IWorkerBus } from '../common';
import { AbstractWorkerThreadHelper } from './abstract';

export class BaseWorkerThreadHelper extends AbstractWorkerThreadHelper {
  constructor(opts: { scope: string }) {
    const { scope } = opts;
    super({ scope, identifier: scope });

    if (isMainThread) {
      throw getError({
        message: '[BaseWorker] Cannot start worker in MAIN_THREAD',
      });
    }

    this.buses = {};
  }

  bindWorkerBus<IC, IP>(opts: { key: string; bus: IWorkerBus<IC, IP> }) {
    if (!this.buses) {
      this.buses = {};
    }

    const { key, bus } = opts;
    if (this.buses[key]) {
      this.logger.for(this.bindWorkerBus.name).warn('Worker Bus existed | key: %s', key);
      return;
    }

    this.buses[key] = bus;
  }

  unbindWorkerBus(opts: { key: string }) {
    if (!this.buses) {
      return;
    }

    const { key } = opts;
    if (!(key in this.buses)) {
      this.logger.for(this.unbindWorkerBus.name).warn('Worker Bus not existed | key: %s', key);
      return;
    }

    this.buses[key]?.port?.removeAllListeners();
    delete this.buses[key];
  }

  getWorkerBus<IC, IP>(opts: { key: string }) {
    const rs = this.buses[opts.key];
    if (!rs) {
      throw getError({
        message: `[getWorkerBus] Not found worker bus | key: ${opts.key}`,
      });
    }

    return rs as IWorkerBus<IC, IP>;
  }
}
