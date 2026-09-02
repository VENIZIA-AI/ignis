import type { Context, Next } from 'hono';
import type { IUIConfig, IUIProvider } from '../common';
import { BaseHelper, getError } from '@venizia/ignis-helpers/core';

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
