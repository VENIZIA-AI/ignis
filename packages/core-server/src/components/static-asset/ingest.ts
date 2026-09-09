import { getError } from '@venizia/ignis-helpers/core';
import {
  UrlIngest,
  UrlSafetyDefaults,
  UrlSafetyErrors,
  type IBucketRef,
  type IObjectRef,
  type IFileStat,
  type IStorageHelper,
  type IUploadResult,
  type IUrlSafetyPolicy,
} from '@venizia/ignis-helpers';

/**
 * What was stored, and what the backend reports about it. The stat is returned because `getStat`
 * already ran to size the result - a caller writing its own row would otherwise pay for it twice.
 *
 * This does NOT write a meta link. The columns an application attaches to an object - a principal,
 * a variant - come from its own domain, not from the object, so the row stays the caller's.
 */
export interface IIngestFromUrlResult {
  upload: IUploadResult;
  stat: IFileStat;
}

/** Where a fetched object lands, and what it is attached to. */
export interface IIngestFromUrlOptions {
  helper: IStorageHelper;
  url: string;
  bucket: IBucketRef;

  /**
   * Decides the stored key.
   *
   * **Absent, the key comes from the remote url's last path segment - which on an untrusted url is
   * named by whoever supplied it.** Pass `resolveKey` whenever the url is not your own; the
   * validation below bounds what it can do, but it does not make the remote name yours.
   */
  resolveKey?: (opts: { url: URL; contentType: string }) => string;
  folderPath?: string;

  /** Absent leaves IGNIS's own default: https only, no private address, 3 hops, 10s, 10 MB. */
  policy?: IUrlSafetyPolicy;

  /** Folder nesting the key may carry. Absent uses `BaseStorageHelper.DEFAULT_MAX_FOLDER_DEPTH`. */
  maxFolderDepth?: number;

  /**
   * Where the object is served from. **Required**: an absent hook used to yield an empty link, which
   * is exactly the value that satisfies a NOT NULL column and points nowhere.
   */
  normalizeLinkFn: (opts: { bucket: IBucketRef; object: IObjectRef }) => string;
}

const readKeyFromUrl = (opts: { url: URL; folderPath?: string }): string => {
  const { url, folderPath } = opts;
  const lastSegment = url.pathname.split('/').filter(Boolean).pop() ?? 'object';
  const normalized = lastSegment.toLowerCase().replace(/ /g, '_');

  return folderPath ? `${folderPath}/${normalized}` : normalized;
};

/** Storing an object that came from somewhere else. */
export class AssetIngest {
  /**
   * Fetches an untrusted url and stores what comes back, without the bytes passing through this
   * process: the guarded body is capped and handed to `writeStream` as a stream.
   *
   * The url is guarded by `UrlIngest.fetchGuarded` - scheme allow-list, every resolved address
   * checked, redirects walked by hand with a per-hop re-check, and a timeout. A rebinding window
   * remains open between the check and the connect; see `UrlIngest.assertPublicHost`.
   *
   * The served content type is decided from the stored KEY, never from what the remote host
   * claimed - the same rule the asset routes apply, and for the same reason.
   */
  static async fromUrl(opts: IIngestFromUrlOptions): Promise<IIngestFromUrlResult> {
    const { helper, url, bucket, folderPath, policy, resolveKey, normalizeLinkFn } = opts;

    const response = await UrlIngest.fetchGuarded({ url, policy });
    const remoteType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
    const parsed = new URL(url);

    const key = resolveKey
      ? resolveKey({ url: parsed, contentType: remoteType })
      : readKeyFromUrl({ url: parsed, folderPath });

    // The helper's own default, not an unbounded one: an object arriving through ingest must obey
    // the same depth rule as one arriving through the upload route.
    if (!helper.isValidObjectKey({ object: { key }, maxDepth: opts.maxFolderDepth })) {
      await response.body?.cancel();
      throw getError({ message: `[AssetIngest.fromUrl] Invalid object key | key: ${key}` });
    }

    // Refused BEFORE the write starts, so a body that declares its size never opens a multipart
    // upload at all. A body that lies or omits the header is caught mid-flight by `capStream`, and
    // Bun's client answers that with `AbortMultipartUpload` - measured against a recording endpoint,
    // not assumed - so no orphaned parts are left behind either way.
    const declaredLength = Number(response.headers.get('content-length') ?? 0);
    const maxBytes = policy?.maxBytes ?? UrlSafetyDefaults.MAX_BYTES;

    if (declaredLength > maxBytes) {
      await response.body?.cancel();
      throw getError({
        error: UrlSafetyErrors.URL_REFUSED,
        message: `[AssetIngest.fromUrl] Body exceeds the cap | declared: ${declaredLength} | max: ${maxBytes}`,
      });
    }

    if (!response.body) {
      throw getError({ message: `[AssetIngest.fromUrl] Response carried no body | url: ${url}` });
    }

    const object: IObjectRef = { key };
    const contentType = helper.getMimeType({ filename: key });

    await helper.writeStream({
      bucket,
      object,
      source: UrlIngest.capStream({ source: response.body, policy }),
      contentType,
      maxFolderDepth: opts.maxFolderDepth,
    });

    const stat = await helper.getStat({ bucket, object });
    const link = normalizeLinkFn({ bucket, object });

    if (!link) {
      throw getError({
        message: `[AssetIngest.fromUrl] normalizeLinkFn returned an empty link | key: ${key}`,
      });
    }

    return {
      upload: {
        bucket: { name: bucket.name },
        object: { key, size: stat.size, contentType },
        link,
      },
      stat,
    };
  }
}
