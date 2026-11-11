import type { TConstValue } from '@venizia/ignis-helpers/common';
import { HTTP } from '@venizia/ignis-helpers/common';

/** The response headers a controller echoes from the backend's metadata. */
export class StaticAssetHeaders {
  /** `content-type` is absent on purpose: it is decided from the object name, never from the backend. */
  static readonly ALLOWED = [
    HTTP.Headers.CONTENT_ENCODING,
    HTTP.Headers.CACHE_CONTROL,
    HTTP.Headers.ETAG,
    HTTP.Headers.LAST_MODIFIED,
  ] as const;

  /** Of what a controller sends with every object. */
  static readonly NOSNIFF = 'nosniff';
  static readonly CSP_SANDBOX = 'sandbox';
  static readonly RANGE_UNIT = HTTP.HeaderValues.RANGE_UNIT_BYTES;
}

/** Content types the controller serves. */
export class StaticAssetContentTypes {
  /**
   * Types the controller will let a browser render, keyed off the object name. Anything absent here is
   * served as an attachment, because a renderable upload on the API origin is stored XSS - and `nosniff`
   * cannot stop a type we declared ourselves. `image/svg+xml` is deliberately excluded: SVG carries script.
   */
  static readonly RENDERABLE = new Set<string>([
    HTTP.HeaderValues.IMAGE_PNG,
    HTTP.HeaderValues.IMAGE_JPEG,
    HTTP.HeaderValues.IMAGE_GIF,
    HTTP.HeaderValues.IMAGE_WEBP,
    'image/avif',
    'image/bmp',
    'image/x-icon',
    'video/mp4',
    'video/webm',
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    HTTP.HeaderValues.APPLICATION_PDF,
    HTTP.HeaderValues.TEXT_PLAIN,
    HTTP.HeaderValues.TEXT_CSV,
  ]);
}

/** The built-in routes of a generated controller, the keys of `routes`. */
export class StaticAssetRouteKeys {
  static readonly UPLOAD = 'upload';
  static readonly LIST_OBJECTS = 'listObjects';
  static readonly DELETE_OBJECT = 'deleteObject';
  static readonly GET_OBJECT_BY_NAME = 'getObjectByName';
  static readonly DOWNLOAD_OBJECT_BY_NAME = 'downloadObjectByName';

  static readonly UPLOAD_POLICY = 'uploadPolicy';
  static readonly UPLOAD_COMMIT = 'uploadCommit';
  static readonly UPLOAD_VALIDATE = 'uploadValidate';

  static readonly RECREATE_META_LINK = 'recreateMetaLink';

  /** Every key, in registration order. */
  static readonly ALL = [
    StaticAssetRouteKeys.GET_OBJECT_BY_NAME,
    StaticAssetRouteKeys.DOWNLOAD_OBJECT_BY_NAME,
    StaticAssetRouteKeys.UPLOAD,
    StaticAssetRouteKeys.DELETE_OBJECT,
    StaticAssetRouteKeys.LIST_OBJECTS,
    StaticAssetRouteKeys.UPLOAD_POLICY,
    StaticAssetRouteKeys.UPLOAD_COMMIT,
    StaticAssetRouteKeys.UPLOAD_VALIDATE,
    StaticAssetRouteKeys.RECREATE_META_LINK,
  ] as const;
}

/** What `recreate-metalink` did: refreshed the rows of an object, or created its first one. */
export class MetaLinkRecreateActions {
  static readonly CREATED = 'created';
  static readonly REFRESHED = 'refreshed';
}

/** One of the `MetaLinkRecreateActions` values. */
export type TMetaLinkRecreateAction = TConstValue<typeof MetaLinkRecreateActions>;

/** Where a commit token is in its life: issued with the policy, then validated against the content it pins. */
export class StaticAssetTokenStages {
  static readonly ISSUED = 'issued';
  static readonly VALIDATED = 'validated';
}

/** One of the `StaticAssetTokenStages` values. */
export type TStaticAssetTokenStage = TConstValue<typeof StaticAssetTokenStages>;

/** Defaults of the static asset component. */
export class StaticAssetDefaults {
  /** Where a signed policy may write. The final key is never inside it, so content cannot be replaced after the commit. */
  static readonly PENDING_PREFIX = 'pending/';

  /** The most file parts one upload request may carry unless `serverUpload.maxFiles` says otherwise. */
  static readonly MAX_UPLOAD_FILES = 20;
}

/** Codes the component reports in a body instead of throwing. */
export class StaticAssetMetaLinkCodes {
  /** Reported in the body, never thrown: the bytes are stored, only the row is not. A CODE, because a 200 bypasses the middleware that strips the driver's `detail`/`table`/`constraint`. */
  static readonly CREATE_FAILED = 'META_LINK_CREATE_FAILED';
}
