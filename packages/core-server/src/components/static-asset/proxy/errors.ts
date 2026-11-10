import { HTTP } from '@venizia/ignis-helpers/common';
import type { TErrorDefinition, TRegisterErrors } from '@venizia/ignis-helpers/core';
import { ErrorScopes } from '@venizia/ignis-helpers/core';

/** Codes of the presigned-URL proxy. A separate catalog from `StaticAssetErrors`, which holds only caller-facing 4xx codes: a dead storage is a 5xx. */
export const AssetProxyErrors = {
  /** The proxy was asked for a storage path outside `allowedPathPrefixes`; nothing is forwarded. */
  PATH_REFUSED: {
    message: {
      text: 'Storage path is not served by this proxy',
      code: 'core.static_asset.proxy_path_refused',
    },
    statusCode: HTTP.ResultCodes.RS_4.NotFound,
    category: ErrorScopes.VALIDATION,
  },
  /** The storage did not answer. The cause goes to the log, never to the response. */
  UPSTREAM_FAILED: {
    message: {
      text: 'Storage is unreachable',
      code: 'core.static_asset.proxy_upstream_failed',
    },
    statusCode: HTTP.ResultCodes.RS_5.BadGateway,
    category: ErrorScopes.INTEGRATION,
  },
} as const satisfies Record<string, TErrorDefinition>;

declare module '@venizia/ignis-helpers' {
  interface IErrorKeyRegistry extends TRegisterErrors<typeof AssetProxyErrors> {}
}
