import { BaseHelper } from '@/helpers/base';
import { getError } from '@/helpers/error';
import os from 'node:os';
import { IWorker } from './types';

export class WorkerPoolHelper extends BaseHelper {
  private static instance: WorkerPoolHelper;
  protected registry: Map<string | symbol, IWorker<any>>;

  private numberOfCPUs: number;
  private ignoreMaxWarning: boolean;

  constructor(opts?: { ignoreMaxWarning?: boolean }) {
    super({ scope: WorkerPoolHelper.name });
    this.registry = new Map([]);

    const cpus = os.cpus();
    this.numberOfCPUs = cpus.length;
    this.ignoreMaxWarning = opts?.ignoreMaxWarning ?? false;
  }

  static getInstance(): WorkerPoolHelper {
    if (!WorkerPoolHelper.instance) {
      WorkerPoolHelper.instance = new WorkerPoolHelper({ ignoreMaxWarning: false });
    }

    return WorkerPoolHelper.instance;
  }

  size() {
    return this.registry.size;
  }

  get<MessageType>(opts: { key: string }) {
    return this.registry.get(opts.key) as IWorker<MessageType> | undefined;
  }

  has(opts: { key: string }) {
    return this.registry.has(opts.key);
  }

  register<MessageType>(opts: { key: string; worker: IWorker<MessageType> }) {
    if (!this.registry) {
      throw getError({
        message:
          '[register] Invalid worker registry instance | please init registry before register new worker!',
      });
    }

    if (this.registry.size === this.numberOfCPUs && !this.ignoreMaxWarning) {
      this.logger
        .for(this.register.name)
        .warn(
          'SKIP register worker | Pool size reached maximum number of cores | CPUs: %s | ignoreMaxWarning: %s',
          this.numberOfCPUs,
          this.ignoreMaxWarning,
        );
      return;
    }

    const { key, worker } = opts;
    if (this.registry.has(key)) {
      this.logger
        .for(this.register.name)
        .error('SKIP register worker | Worker key existed in pool | key: %s', key);
      return;
    }

    this.registry.set(key, worker);
    this.logger
      .for(this.register.name)
      .info('Successfully register worker | key: %s | poolSize: %s', key, this.registry.size);
  }

  async unregister(opts: { key: string }) {
    const { key } = opts;

    if (!this.has({ key })) {
      this.logger
        .for(this.unregister.name)
        .warn('SKIP unregister worker | Worker not existed | key: %s', key);
      return;
    }

    const w = this.get({ key });
    if (w?.worker) {
      await w.worker.terminate();
    }

    this.registry.delete(key);
    this.logger
      .for(this.unregister.name)
      .info('Successfully unregister worker | key: %s | poolSize: %s', key, this.registry.size);
  }
}
