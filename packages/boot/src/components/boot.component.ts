import { ControllerBooter, DatasourceBooter, RepositoryBooter, ServiceBooter } from '@/booters';
import { BaseHelper, getError, IConfigurable, ValueOrPromise } from '@venizia/ignis-helpers';
import { Binding, IContainer, inject } from '@venizia/ignis-inversion';

type TInitDefault = { enable: false } | { enable: true; container: IContainer };

// ================================================================================
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
  protected initDefaultBindings(opts: { container: IContainer }) {
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

// ================================================================================
export class BootComponent extends BaseComponent {
  // TODO: remove '@app/instance' with constant later
  constructor(@inject({ key: '@app/instance' }) private application: IContainer) {
    super({ scope: BootComponent.name });
  }

  // --------------------------------------------------------------------------------
  override binding(): ValueOrPromise<void> {
    this.application
      .bind({
        key: 'booter.DatasourceBooter',
      })
      .toClass(DatasourceBooter)
      .setTags('booter');

    this.application
      .bind({ key: 'booter.RepositoryBooter' })
      .toClass(RepositoryBooter)
      .setTags('booter');

    this.application
      .bind({
        key: 'booter.ServiceBooter',
      })
      .toClass(ServiceBooter)
      .setTags('booter');

    this.application
      .bind({
        key: 'booter.ControllerBooter',
      })
      .toClass(ControllerBooter)
      .setTags('booter');
  }
}
