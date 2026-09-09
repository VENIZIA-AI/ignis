import type { IGetProviderParams, IUIProvider } from '../common';
import { DocumentUITypes } from '../common';
import { getError } from '@venizia/ignis-helpers/core';
import { MemoryStorageHelper } from '@venizia/ignis-helpers';
import { ScalarUIProvider } from './scalar';
import { SwaggerUIProvider } from './swagger';

export class UIProviderFactory extends MemoryStorageHelper<{
  [key: string | symbol]: IUIProvider;
}> {
  private static instance: UIProviderFactory;

  static getInstance() {
    if (!UIProviderFactory.instance) {
      UIProviderFactory.instance = new UIProviderFactory();
    }

    return UIProviderFactory.instance;
  }

  // One lookup, not a `isBound` probe followed by a second `get` of the same key.
  getProvider({ type }: IGetProviderParams): IUIProvider {
    const provider = this.get(type);

    if (!provider) {
      throw getError({
        message: `[UIProviderFactory][getProvider] Unknown UI Provider | type: ${type} | available: ${this.keys().join(', ')}`,
      });
    }

    return provider;
  }

  register(opts: { type: string }): void {
    if (this.isBound(opts.type)) {
      this.logger
        .for(this.register.name)
        .warn('Skip registering BOUNDED Document UI | type: %s', opts.type);
      return;
    }

    switch (opts.type) {
      case DocumentUITypes.SWAGGER: {
        this.set(opts.type, new SwaggerUIProvider());
        return;
      }
      case DocumentUITypes.SCALAR: {
        this.set(opts.type, new ScalarUIProvider());
        return;
      }
      default: {
        throw getError({
          message: `[register] Invalid document UI Type | uiType: ${opts.type} | valids: ${[...DocumentUITypes.SCHEME_SET]}`,
        });
      }
    }
  }

  getRegisteredProviders() {
    return this.keys();
  }
}
