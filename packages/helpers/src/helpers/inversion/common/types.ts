import type { TAuthStrategy } from "@/common/types";
import { RouteConfig } from "@hono/zod-openapi";
import {
  IInjectMetadata as _IInjectMetadata,
  IPropertyMetadata as _IPropertyMetadata,
  TBindingScope,
} from "@venizia/ignis-inversion";

// ----------------------------------------------------------------------------------------------------------------------------------------
// Metadata
// ----------------------------------------------------------------------------------------------------------------------------------------
export type TRouteMetadata = RouteConfig & {
  authStrategies?: readonly TAuthStrategy[];
};

export interface IControllerMetadata {
  path: string;
  tags?: string[];
  description?: string;
}

export interface IPropertyMetadata extends _IPropertyMetadata {}

export interface IInjectMetadata extends _IInjectMetadata {}

export interface IInjectableMetadata {
  scope?: TBindingScope;
  tags?: Record<string, any>;
}

export interface IModelMetadata {
  type: "entity" | "view";
  skipMigrate?: boolean;
}

export interface IDataSourceMetadata {}

export interface IRepositoryMetadata {}

/* export interface IMiddlewareMetadata {
  handler: Function;
  priority?: number;
}

export interface IInterceptorMetadata {
  handler: Function;
  group?: string;
} */
