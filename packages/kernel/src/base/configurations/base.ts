import type { IConfigurable, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { BaseHelper } from '@venizia/ignis-helpers/core';
import type { IConfiguration } from './common';

export abstract class BaseConfiguration<ConfigurableOptions extends object = {}>
  extends BaseHelper
  implements IConfiguration, IConfigurable<ConfigurableOptions>
{
  protected isConfigured = false;

  constructor(opts?: { scope?: string; identifier?: string }) {
    super({ scope: opts?.scope ?? BaseConfiguration.name, identifier: opts?.identifier });
  }

  async configure(opts?: ConfigurableOptions): Promise<void> {
    if (this.isConfigured) {
      return;
    }

    await this.setup(opts);
    this.isConfigured = true;
  }

  /** Override to perform setup work when the configuration is booted. */
  protected setup(_opts?: ConfigurableOptions): ValueOrPromise<void> {}
}
