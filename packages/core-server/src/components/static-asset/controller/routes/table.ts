import type { BaseRestController } from '@/base/controllers';
import type { TStaticAssetAuth, TStaticAssetRoutes } from '../../common';
import { StaticAssetRouteOptionsUtility } from '../../utilities/route-options.utility';
import { bucketRoutes } from './buckets';
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

/** Every built-in route, in registration order. Whether one is registered is decided in `registerRoutes`, nowhere else. */
export const STATIC_ASSET_ROUTES: IStaticAssetRoute[] = [
  ...bucketRoutes,
  ...serveRoutes,
  uploadRoute,
  ...objectRoutes,
  ...directUploadRoutes,
  ...metaLinkRoutes,
];

/** Whether the entry has the feature a route belongs to. */
const FEATURE_GATES: Record<TStaticAssetFeature, (env: IStaticAssetRouteEnv) => boolean> = {
  // With the bucket in the URL the bucket routes exist; a configured bucket has no use for them.
  [StaticAssetFeatures.BUCKET]: (env) => env.bucket === undefined,
  [StaticAssetFeatures.OBJECT]: () => true,
  [StaticAssetFeatures.SERVER_UPLOAD]: () => true,
  [StaticAssetFeatures.DIRECT_UPLOAD]: (env) => env.direct !== undefined,
  [StaticAssetFeatures.VALIDATION]: (env) => env.direct?.options.validation !== undefined,
  [StaticAssetFeatures.META_LINK]: (env) => env.metaLink !== undefined,
};

/** Binds each route whose feature is on and that the application did not turn off. */
export const registerRoutes = (opts: {
  controller: BaseRestController;
  env: IStaticAssetRouteEnv;
  routes?: TStaticAssetRoutes;
  auth?: TStaticAssetAuth;
}): void => {
  const { controller, env, routes, auth } = opts;

  for (const route of STATIC_ASSET_ROUTES) {
    if (!FEATURE_GATES[route.feature](env)) {
      continue;
    }

    const { isEnabled, override } = StaticAssetRouteOptionsUtility.readRoute({
      key: route.key,
      route: routes?.[route.key],
      auth,
      // Bucket management is an opt-in, never a default.
      isOffByDefault: route.feature === StaticAssetFeatures.BUCKET,
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
          middleware: route.middleware?.({ env, own: override.middleware }) ?? override.middleware,
        },
      })
      .to({ handler });
  }
};
