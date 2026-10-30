import type { TAuthMode, TAuthStrategy } from '@venizia/ignis-kernel';
import type { IAuthorizationSpec } from '@venizia/ignis-kernel';
import type { z } from '@hono/zod-openapi';
import { SearchControllerFactory } from './factory';

/** @deprecated Use SearchControllerFactory.defineRouteConfigs({ selectSchema, authenticate, authorize }). Removed in 0.5. */
export const defineSearchRouteConfigs = (opts: {
  selectSchema: z.ZodType;
  authenticate?: { strategies?: TAuthStrategy[]; mode?: TAuthMode };
  authorize?: IAuthorizationSpec | IAuthorizationSpec[];
}) => SearchControllerFactory.defineRouteConfigs(opts);
