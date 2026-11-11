import type { TRouteContext } from '@/base/controllers';
import {
  ContentDispositionTypes,
  RequestUtility,
  type IObjectMetadata,
  type IObjectRef,
  type IStorageHelper,
} from '@venizia/ignis-helpers';
import { HTTP } from '@venizia/ignis-helpers/common';
import type { Env } from 'hono';
import { StaticAssetContentTypes, StaticAssetHeaders, StaticAssetRouteKeys } from '../../common';
import {
  type IStaticAssetRoute,
  type IStaticAssetRouteEnv,
  StaticAssetFeatures,
  StaticAssetRouteUtility,
} from './context';
import { StaticAssetDefinition, StaticAssetPaths } from './definition';

export class StaticAssetServe {
  /**
   * The served type comes from the object NAME, never the backend or the uploader: a renderable type on
   * the API origin is stored XSS. The backend's own content-type is dropped by `StaticAssetHeaders.ALLOWED`.
   */
  static resolveServedContentType(opts: { helper: IStorageHelper; object: IObjectRef }): {
    contentType: string;
    isRenderable: boolean;
  } {
    const { helper, object } = opts;
    const candidate = helper
      .getMimeType({ filename: object.key })
      .toLowerCase()
      .split(';')[0]
      .trim();

    if (!StaticAssetContentTypes.RENDERABLE.has(candidate)) {
      return { contentType: HTTP.HeaderValues.APPLICATION_OCTET_STREAM, isRenderable: false };
    }

    return { contentType: candidate, isRenderable: true };
  }
}

/**
 * Reads one `Range` header. Only a single byte range is honoured - multipart ranges need a multipart
 * body no browser asks for here. An unsatisfiable or malformed range returns `null`, and the caller
 * serves the whole object, which is what RFC 9110 allows.
 */
const readByteRange = (opts: {
  header: string | undefined;
  size: number;
}): { start: number; end: number } | null => {
  const { header, size } = opts;

  if (!header || size <= 0) {
    return null;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());

  if (!match) {
    return null;
  }

  const [, rawStart, rawEnd] = match;

  // `bytes=-500` means the LAST 500 bytes, not "from 0 to 500".
  if (!rawStart) {
    const suffixLength = Number(rawEnd);

    if (!Number.isInteger(suffixLength) || suffixLength <= 0) {
      return null;
    }

    return { start: Math.max(size - suffixLength, 0), end: size - 1 };
  }

  const start = Number(rawStart);
  const end = rawEnd ? Number(rawEnd) : size - 1;

  if (!Number.isInteger(start) || !Number.isInteger(end) || start > end || start >= size) {
    return null;
  }

  return { start, end: Math.min(end, size - 1) };
};

/** The storage headers a response may carry; every other one is dropped. */
const ALLOWED_HEADER_NAMES: ReadonlySet<string> = new Set(StaticAssetHeaders.ALLOWED);

/** Sets whitelisted metadata headers on the response context. `content-type` is not among them. */
const applyMetadataHeaders = (opts: {
  ctx: TRouteContext<Env>;
  metadata: IObjectMetadata;
}): void => {
  Object.entries(opts.metadata).forEach(([key, value]) => {
    const name = key.toLowerCase();

    if (!ALLOWED_HEADER_NAMES.has(name)) {
      return;
    }

    opts.ctx.header(name, String(value).replace(/[\r\n]/g, ''));
  });
};

/**
 * Streams one object. `attach` forces a download; without it a type outside the allow-list still
 * downloads instead of rendering, which is the XSS boundary. Both honour `Range`.
 */
const serve = async (opts: {
  ctx: TRouteContext;
  env: IStaticAssetRouteEnv;
  attach: boolean;
}): Promise<Response> => {
  const { ctx, env, attach } = opts;
  const { helper } = env;
  const { bucket, object } = await StaticAssetRouteUtility.resolveTarget({
    ctx,
    env,
    isObject: true,
  });
  const { size, metadata } = await helper.getStat({ bucket, object });
  applyMetadataHeaders({ ctx, metadata });

  const served = StaticAssetServe.resolveServedContentType({ helper, object });
  ctx.header(HTTP.Headers.CONTENT_TYPE, served.contentType);
  ctx.header(HTTP.Headers.X_CONTENT_TYPE_OPTIONS, StaticAssetHeaders.NOSNIFF);
  // Sandboxed even when renderable, so an unforeseen renderable type cannot reach this origin.
  ctx.header(HTTP.Headers.CONTENT_SECURITY_POLICY, StaticAssetHeaders.CSP_SANDBOX);
  // Advertised unconditionally: a player only offers seeking once it sees this.
  ctx.header(HTTP.Headers.ACCEPT_RANGES, StaticAssetHeaders.RANGE_UNIT);

  if (attach || !served.isRenderable) {
    ctx.header(
      HTTP.Headers.CONTENT_DISPOSITION,
      RequestUtility.buildContentDispositionHeader({
        filename: object.key.split('/').pop() ?? object.key,
        type: ContentDispositionTypes.ATTACHMENT,
      }),
    );
  }

  const range = readByteRange({ header: ctx.req.header(HTTP.Headers.RANGE), size });

  if (range) {
    ctx.header(HTTP.Headers.CONTENT_LENGTH, String(range.end - range.start + 1));
    ctx.header(
      HTTP.Headers.CONTENT_RANGE,
      `${StaticAssetHeaders.RANGE_UNIT} ${range.start}-${range.end}/${size}`,
    );
  } else {
    ctx.header(HTTP.Headers.CONTENT_LENGTH, size.toString());
  }

  const stream = await helper.getObjectStream({ bucket, object, range: range ?? undefined });

  return new Response(stream, {
    headers: ctx.res.headers,
    status: range ? HTTP.ResultCodes.RS_2.PartialContent : HTTP.ResultCodes.RS_2.Ok,
  });
};

const streamRoute = (opts: {
  key:
    | typeof StaticAssetRouteKeys.GET_OBJECT_BY_NAME
    | typeof StaticAssetRouteKeys.DOWNLOAD_OBJECT_BY_NAME;
  segment: string;
  attach: boolean;
}): IStaticAssetRoute => ({
  key: opts.key,
  feature: StaticAssetFeatures.OBJECT,
  build: (env) => ({
    config: StaticAssetDefinition.stream({
      method: HTTP.Methods.GET,
      path: `/${opts.segment}/${StaticAssetPaths.object({ env })}`,
      params: StaticAssetPaths.objectParams(),
    }),
    handler: (ctx) => serve({ ctx, env, attach: opts.attach }),
  }),
});

export const serveRoutes: IStaticAssetRoute[] = [
  streamRoute({ key: StaticAssetRouteKeys.GET_OBJECT_BY_NAME, segment: 'objects', attach: false }),
  streamRoute({
    key: StaticAssetRouteKeys.DOWNLOAD_OBJECT_BY_NAME,
    segment: 'download',
    attach: true,
  }),
];
