import {
  BaseHelper,
  Binding,
  Container,
  getError,
  IConfigurable,
  ValueOrPromise,
} from '@venizia/ignis-helpers';

type TInitDefault = { enable: false } | { enable: true; container: Container };

export abstract class BaseComponent<ConfigurableOptions extends object = {}>
  extends BaseHelper
  implements IConfigurable<ConfigurableOptions>
{
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
  async configure(opts?: ConfigurableOptions): Promise<void> {
    const t = performance.now();

    const configureOptions = opts ?? {};
    this.logger.info('[binding] START | Binding component | Options: %j', configureOptions);

    if (this.initDefault?.enable) {
      this.initDefaultBindings({ container: this.initDefault.container });
    }

    await this.binding();

    this.logger.info('[binding] DONE | Binding component | Took: %s (ms)', performance.now() - t);
  }
}
