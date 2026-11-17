import type { TRouteContext } from '@/base/controllers';
import {
  ContentDispositionTypes,
  RequestUtility,
  type IFileStat,
  type IObjectRef,
  type IStorageHelper,
} from '@venizia/ignis-helpers';
import { HTTP } from '@venizia/ignis-helpers/common';
import { StaticAssetContentTypes, StaticAssetHeaders, StaticAssetRouteKeys } from '../../common';
import {
  type IStaticAssetRoute,
  type IStaticAssetRouteEnv,
  StaticAssetFeatures,
  StaticAssetRouteUtility,
} from './context';
import { StaticAssetDefinition, StaticAssetPaths } from './definition';

/** The serve side of an entry's controller, public so a route of your own makes the same decisions: the served content type and the `ETag` and `304` answers. */
export class StaticAssetServe {
  /**
   * The served type comes from the object NAME, never the backend or the uploader: a renderable type on
   * the API origin is stored XSS. The backend's own content-type is never sent.
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

  /**
   * Sets `ETag` and `Last-Modified` from `stat` and answers whether the client's copy is current. A `true`
   * means the caller returns a 304 without reading the object; the headers are already on `ctx`.
   * `If-None-Match` decides alone when present (weak comparison, `*` matches any); otherwise
   * `If-Modified-Since` does. An application's own route can call it with a `stat` it already holds.
   */
  static applyValidators(opts: { ctx: TRouteContext; stat: IFileStat }): boolean {
    const { ctx, stat } = opts;
    const { etag, lastModified } = stat;
    const quotedEtag =
      etag && !etag.startsWith('"') && !etag.startsWith('W/"') ? `"${etag}"` : etag;

    if (quotedEtag) {
      ctx.header(HTTP.Headers.ETAG, quotedEtag);
    }

    if (lastModified) {
      ctx.header(HTTP.Headers.LAST_MODIFIED, lastModified.toUTCString());
    }

    const ifNoneMatch = ctx.req.header(HTTP.Headers.IF_NONE_MATCH);

    if (ifNoneMatch !== undefined) {
      const wanted = ifNoneMatch.split(',').map((tag) => tag.trim());
      const stripWeak = (tag: string) => tag.replace(/^W\//, '');

      return wanted.some(
        (tag) => tag === '*' || (!!quotedEtag && stripWeak(tag) === stripWeak(quotedEtag)),
      );
    }

    const ifModifiedSince = ctx.req.header(HTTP.Headers.IF_MODIFIED_SINCE);

    if (!ifModifiedSince || !lastModified) {
      return false;
    }

    const since = Date.parse(ifModifiedSince);

    // HTTP dates have whole-second precision.
    return !Number.isNaN(since) && Math.floor(lastModified.getTime() / 1000) * 1000 <= since;
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
  const stat = await helper.getStat({ bucket, object });
  const { size } = stat;

  if (StaticAssetServe.applyValidators({ ctx, stat })) {
    return new Response(null, {
      headers: ctx.res.headers,
      status: HTTP.ResultCodes.RS_3.NotModified,
    });
  }

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
