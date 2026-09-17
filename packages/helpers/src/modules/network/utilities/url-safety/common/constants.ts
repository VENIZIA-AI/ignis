import { TConstValue } from '@/common/types';

/** The only schemes a guarded fetch will speak. `file:` and `gopher:` are the classic SSRF pivots. */
export class UrlSchemes {
  static readonly HTTP = 'http:';
  static readonly HTTPS = 'https:';

  static readonly SCHEME_SET = new Set<string>([this.HTTP, this.HTTPS]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}
export type TUrlScheme = TConstValue<typeof UrlSchemes>;

/** Safe by default: https only, no private address, three hops, ten seconds. */
export class UrlSafetyDefaults {
  static readonly ALLOWED_SCHEMES: string[] = [UrlSchemes.HTTPS];
  static readonly ALLOW_PRIVATE_ADDRESS = false;
  static readonly MAX_REDIRECTS = 3;
  static readonly TIMEOUT_MILLISECONDS = 10_000;
  static readonly MAX_BYTES = 10 * 1024 * 1024;
}
