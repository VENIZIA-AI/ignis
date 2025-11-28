import { ValueOrPromise } from '@/common';
import { Binding, Container } from '@/helpers/inversion';
import { BaseHelper } from '../helpers';
import { getError } from '@/helpers';

type TInitDefault = { enable: false } | { enable: true; container: Container };

export abstract class BaseComponent extends BaseHelper {
  protected bindings: Record<string | symbol, Binding>;

  protected initDefault: TInitDefault;

  constructor(opts: {
    scope: string;
    initDefault?: TInitDefault;
    bindings?: Record<string | symbol, Binding>;
  }) {
    super(opts);

    this.initDefault = opts.initDefault ?? { enable: false };
    this.bindings = opts.bindings ?? {};
  }

  abstract binding(): ValueOrPromise<void>;

  // ------------------------------------------------------------------------------
  protected initDefaultBindings(opts: { container: Container }) {
    const { container } = opts;

    if (!container) {
      throw getError({
        message: '[initBindings] Invalid DI Container to init bindings!',
      });
    }

    for (const key in this.bindings) {
      if (container.isBound({ key })) {
        continue;
      }

      container.set({ binding: this.bindings[key] });
    }
  }

  // ------------------------------------------------------------------------------
  async configure(): Promise<void> {
    const t = performance.now();
    this.logger.info('[binding] START | Binding component');

    if (this.initDefault?.enable) {
      this.initDefaultBindings({ container: this.initDefault.container });
    }

    // this.initDefaultBindings({})

    await this.binding();

    this.logger.info('[binding] DONE | Binding component | Took: %s (ms)', performance.now() - t);
  }
}
