import type { IObjectLocation } from '@venizia/ignis-helpers';

/** Builds the URL of an object in the shape its controller serves. */
export class StaticAssetObjectLinkUtility {
  /** The mount path may be declared with or without a leading slash; a link must carry exactly one. */
  static normalizeBasePath(opts: { basePath: string }): string {
    return opts.basePath.startsWith('/') ? opts.basePath : `/${opts.basePath}`;
  }

  /** Encodes an object path into a SINGLE url segment: `{objectName}` matches one segment only, so `/` must be percent-encoded too (Hono decodes it back before the handler reads the param). */
  private static encodeObjectPath(opts: { objectPath: string }): string {
    return encodeURIComponent(opts.objectPath);
  }

  /** The URL of one object, in the shape its controller serves: a raw path with `rawObjectPath`, a percent-encoded one without. */
  static build(opts: IObjectLocation & { basePath: string; rawObjectPath?: boolean }): string {
    const { basePath, object, rawObjectPath = false } = opts;
    const objectSegment = rawObjectPath
      ? object.key
      : StaticAssetObjectLinkUtility.encodeObjectPath({ objectPath: object.key });

    return `${basePath}/objects/${objectSegment}`;
  }
}
