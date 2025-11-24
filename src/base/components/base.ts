import { ValueOrPromise } from '@/common';
import { Binding } from '@/helpers/inversion';
import { BaseHelper } from '../helpers';

export abstract class BaseComponent extends BaseHelper {
  protected bindings: Record<string | symbol, Binding>;

  constructor(opts: { scope: string }) {
    super(opts);
    this.bindings = {};
  }

  abstract binding(): ValueOrPromise<void>;

  // ------------------------------------------------------------------------------
  async configure(): Promise<void> {
    const t = performance.now();
    this.logger.info('[binding] START | Binding component');

    await this.binding();

    this.logger.info('[binding] DONE | Binding component | Took: %s (ms)', performance.now() - t);
  }
}
