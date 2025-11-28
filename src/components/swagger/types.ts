import type { Context, Next } from 'hono';

export interface ISwaggerOptions {
  restOptions: {
    path: {
      base: string;
      doc: string;
      ui: string;
      uiType?: 'swagger' | 'scalar';
    };
  };
  explorer: {
    openapi: string;
    info?: {
      title: string;
      version: string;
      description: string;
      contact?: { name: string; email: string };
    };
    servers?: Array<{
      url: string;
      description?: string;
    }>;
  };
}

export interface IUIProvider {
  render(context: Context, config: IUIConfig, next: Next): Promise<Response | void>;
}

export interface IUIConfig {
  title: string;
  url: string;
}

export interface IGetProviderParams {
  type: string;
}
