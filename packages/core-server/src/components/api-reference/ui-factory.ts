import type { Context, Next } from 'hono';
import type { IGetProviderParams, IUIConfig, IUIProvider } from './common';
import { DocumentUITypes } from './common';
import { BaseHelper, getError } from '@venizia/ignis-helpers/core';
import { MemoryStorageHelper } from '@venizia/ignis-helpers';

export class SwaggerUIProvider extends BaseHelper implements IUIProvider {
  constructor() {
    super({ scope: SwaggerUIProvider.name });
  }

  async render(context: Context, config: IUIConfig, next: Next): Promise<Response | void> {
    let swaggerModule: typeof import('@hono/swagger-ui');

    try {
      swaggerModule = await import('@hono/swagger-ui');
    } catch (error) {
      this.logger
        .for(this.render.name)
        .error("Failed to load '@hono/swagger-ui' | Error: %s", error);

      throw getError({
        message:
          "[SwaggerUIProvider][render] '@hono/swagger-ui' is required to render the Swagger UI. Please install it",
      });
    }

    const { swaggerUI } = swaggerModule;
    const { title, url, ...customConfig } = config;
    return swaggerUI({ title, url, ...customConfig })(context, next);
  }
}

export class ScalarUIProvider extends BaseHelper implements IUIProvider {
  constructor() {
    super({ scope: ScalarUIProvider.name });
  }

  async render(context: Context, config: IUIConfig, next: Next): Promise<Response | void> {
    let scalarModule: typeof import('@scalar/hono-api-reference');

    try {
      scalarModule = await import('@scalar/hono-api-reference');
    } catch (error) {
      this.logger
        .for(this.render.name)
        .error("Failed to load '@scalar/hono-api-reference' | Error: %s", error);

      throw getError({
        message:
          "[ScalarUIProvider][render] '@scalar/hono-api-reference' is required to render the Scalar UI. Please install it",
      });
    }

    const { Scalar } = scalarModule;
    const { title, url, ...customConfig } = config;
    return Scalar({ url, pageTitle: title, ...customConfig })(context, next);
  }
}

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

  getProvider({ type }: IGetProviderParams): IUIProvider {
    if (!this.isBound(type)) {
      const availableProviders = this.keys();
      throw getError({
        message: `[UIProviderFactory][getProvider] Unknown UI Provider | type: ${type} | available: ${availableProviders.join(', ')}`,
      });
    }

    return this.get(type);
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
