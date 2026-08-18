import type { Context, Next } from 'hono';
import type { DocumentUITypes } from './constants';
import type { TConstValue } from '@venizia/ignis-helpers/common';

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
}

export interface IUIProvider {
  render(context: Context, config: IUIConfig, next: Next): Promise<Response | void>;
}

export interface IUIConfig {
  title: string;
  url: string;
  [key: string]: any;
}

export interface IGetProviderParams {
  type: string;
}

/** @deprecated Use `IApiReferenceOptions`. */
export type ISwaggerOptions = IApiReferenceOptions;
