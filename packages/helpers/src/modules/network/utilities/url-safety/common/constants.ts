import { type TConstValue } from '@/common/types';

/** The only schemes a guarded fetch will speak. `file:` and `gopher:` are the classic SSRF pivots. */
export class UrlSchemes {
  static readonly HTTP = 'http:';
  static readonly HTTPS = 'https:';
}
/** A scheme a guarded fetch accepts: `http:` or `https:`. */
export type TUrlScheme = TConstValue<typeof UrlSchemes>;

/** The values `IUrlSafetyPolicy` uses for a field the caller leaves unset; each is the safe choice. */
export class UrlSafetyDefaults {
  static readonly ALLOWED_SCHEMES: string[] = [UrlSchemes.HTTPS];
  static readonly ALLOW_PRIVATE_ADDRESS = false;
  static readonly MAX_REDIRECTS = 3;
  static readonly TIMEOUT_MILLISECONDS = 10_000;
  static readonly MAX_BYTES = 10 * 1024 * 1024;
}
