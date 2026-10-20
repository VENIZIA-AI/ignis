import type { Context, Next } from 'hono';
import type { IUIConfig, IUIProvider } from '../common';
import { BaseHelper, getError } from '@venizia/ignis-helpers/core';

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
