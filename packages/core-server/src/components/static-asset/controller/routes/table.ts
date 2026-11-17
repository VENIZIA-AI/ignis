import type { BaseRestController } from '@/base/controllers';
import { StaticAssetRouteOptionsUtility } from '../../utilities/route-options.utility';
import {
  type IStaticAssetRoute,
  type IStaticAssetRouteEnv,
  StaticAssetFeatures,
  type TStaticAssetFeature,
} from './context';
import { directUploadRoutes } from './direct-upload';
import { metaLinkRoutes, objectRoutes } from './objects';
import { serveRoutes } from './serve';
import { uploadRoute } from './upload';

/** Whether the entry has the feature a route belongs to. */
const FEATURE_GATES: Record<TStaticAssetFeature, (env: IStaticAssetRouteEnv) => boolean> = {
  [StaticAssetFeatures.OBJECT]: () => true,
  [StaticAssetFeatures.SERVER_UPLOAD]: (env) => env.serverUpload !== undefined,
  [StaticAssetFeatures.DIRECT_UPLOAD]: (env) => env.directUpload !== undefined,
  [StaticAssetFeatures.VALIDATION]: (env) => env.directUpload?.validation !== undefined,
  [StaticAssetFeatures.META_LINK]: (env) => env.metaLink !== undefined,
};

export class StaticAssetRouteTable {
  /** Every built-in route, in registration order. Whether one is registered is decided in `register`, nowhere else. */
  static readonly ROUTES: IStaticAssetRoute[] = [
    ...serveRoutes,
    uploadRoute,
    ...objectRoutes,
    ...directUploadRoutes,
    ...metaLinkRoutes,
  ];

  /** Binds each route whose feature is on and that the application did not turn off. */
  static register(opts: { controller: BaseRestController; env: IStaticAssetRouteEnv }): void {
    const { controller, env } = opts;

    for (const route of StaticAssetRouteTable.ROUTES) {
      if (!FEATURE_GATES[route.feature](env)) {
        continue;
      }

      const { isEnabled, override } = StaticAssetRouteOptionsUtility.readRoute({
        key: route.key,
        route: env.routes[route.key],
        auth: env.auth,
      });

      if (!isEnabled) {
        continue;
      }

      const { config, handler } = route.build(env);

      controller
        .bindRoute({
          configs: {
            ...config,
            ...override,
            middleware:
              route.middleware?.({ env, own: override.middleware }) ?? override.middleware,
          },
        })
        .to({ handler });
    }
  }
}
