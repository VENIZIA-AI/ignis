import type { Context, Next } from 'hono';
import type { DocumentUITypes } from './constants';
import type { TConstValue } from '@venizia/ignis-helpers/common';

/** One of the `DocumentUITypes` values. */
export type TDocumentUIType = TConstValue<typeof DocumentUITypes>;

/** Every field is optional: a partially-filled binding falls back to the component defaults. */
export interface IApiReferenceOptions {
  restOptions?: {
    base?: { path?: string };
    doc?: { path?: string };
    ui?: { path?: string; type?: TDocumentUIType };
  };
  explorer?: {
    openapi?: string;
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
  uiConfig?: Record<string, any>;
  securitySchemes?: Record<string, Record<string, any>>;
}

/** Renders the interactive API documentation page for the OpenAPI document. Register an implementation on `UIProviderFactory` to serve a custom UI. */
export interface IUIProvider {
  render(context: Context, config: IUIConfig, next: Next): Promise<Response | void>;
}

/** Input of `IUIProvider.render`. Fields beyond `title` and `url` are passed through to the underlying UI library. */
export interface IUIConfig {
  title: string;
  url: string;
  [key: string]: any;
}

/** Selects a registered UI provider by its type name. */
export interface IGetProviderParams {
  type: string;
}
