import { HTTP } from '@/common/constants/http';
import { getError } from '@/modules/error';
import { EchoUtility } from '@/utilities/echo.utility';

const ABSOLUTE_URL_PATTERN = /^[a-z][a-z\d+.-]*:\/\//i;

/** A backslash is a separator to the URL parser, and a control character (a tab or a newline inside `.<TAB>.`) is dropped by it: neither may hide a dot segment. `%5c` is the encoded backslash. */
const UNSAFE_PATH_PATTERN = /[\p{Cc}\\]|%5c/iu;

/** What ends a path segment for the URL parser: a slash, a `?` or a `#` (it ends the path itself, so `..?` is a `..` segment), and the encoded slash, which a server may decode into a separator. */
const PATH_SEPARATOR_PATTERN = /[/?#]|%2f/i;

/** A segment that is `.` or `..` once its `%2e` is decoded. */
const DOT_SEGMENT_PATTERN = /^(?:\.|%2e){1,2}$/i;

/** The longest part of a refused path an error message copies. */
const MAX_ECHOED_PATH_LENGTH = 200;

/** Building the url of a request from a base and path segments, so a segment cannot leave the base. */
export class UrlBuilder {
  /** The origin of the page or Web Worker that runs this, or `undefined` on a server: the browser global `location` is not declared for a server build, so it is probed. */
  static readLocationOrigin(): string | undefined {
    const location: unknown = Reflect.get(globalThis, 'location');

    if (typeof location !== 'object' || location === null || !('origin' in location)) {
      return undefined;
    }

    return typeof location.origin === 'string' ? location.origin : undefined;
  }

  /** The base is an absolute url or a path from the origin (`/api`), and carries no query or fragment. */
  static assertBase(opts: { baseUrl: string; scope: string }): void {
    const { baseUrl, scope } = opts;

    // Against the page, `api` would follow the current route; `localhost:3000` is not a URL at all.
    if (!ABSOLUTE_URL_PATTERN.test(baseUrl) && !baseUrl.startsWith('/')) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[${scope}] baseUrl '${baseUrl}' is neither absolute nor a path from the origin | Pass '/api' or an absolute URL such as 'https://api.example.com'`,
      });
    }

    // A `?` or `#` in the base would swallow the request paths into the query or the fragment.
    if (/[?#]/.test(baseUrl)) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[${scope}] baseUrl must not carry a query or a fragment: the request paths would end up inside it | Pass the base without '?' or '#', and use the call's query option`,
      });
    }
  }

  /** The request paths name a place under the base path, so none may be a dot segment, hide one, or carry a separator the URL parser would read differently from a server. */
  static assertPaths(opts: { paths: ReadonlyArray<string>; scope: string }): void {
    const { paths, scope } = opts;

    for (const path of paths) {
      const segments = path.split(PATH_SEPARATOR_PATTERN);
      const isEscaping =
        UNSAFE_PATH_PATTERN.test(path) ||
        // A trailing space is stripped from the whole URL by the parser, so `.. ` ends as `..`.
        segments.some((segment) => DOT_SEGMENT_PATTERN.test(segment.trimEnd()));

      if (isEscaping) {
        const cut =
          path.length > MAX_ECHOED_PATH_LENGTH ? `${path.slice(0, MAX_ECHOED_PATH_LENGTH)}…` : path;

        throw getError({
          statusCode: HTTP.ResultCodes.RS_4.BadRequest,
          message: `[${scope}] A request path must stay under the base path: no dot segment, backslash or control character | path: '${EchoUtility.toSafeText({ value: cut })}'`,
        });
      }
    }
  }

  /** `baseUrl` (no trailing slash) followed by each path with one leading slash: `('/api/', ['a', '/b'])` is `/api/a/b`. */
  static toText(opts: { baseUrl: string; paths: ReadonlyArray<string> }): string {
    const { baseUrl, paths } = opts;
    const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

    return `${base}${paths.map((path) => (path.startsWith('/') ? path : `/${path}`)).join('')}`;
  }

  /** A call url as sent: an absolute one stays as it is, a relative one is joined to `baseUrl` by `join`, with its refusals. */
  static resolve(opts: { baseUrl: string; url: string; scope: string }): string {
    const { baseUrl, url, scope } = opts;

    return ABSOLUTE_URL_PATTERN.test(url)
      ? url
      : UrlBuilder.join({ baseUrl, paths: [url], scope }).toString();
  }

  /**
   * The url of a request: the base and the paths, checked. A path may not be a dot segment, hide one, or carry a backslash
   * or a control character; a relative base (`/api`) is resolved against `origin` (the page's, by default); and the result
   * must be on the base's origin and under its path.
   */
  static join(opts: {
    baseUrl: string;
    paths: ReadonlyArray<string>;
    scope: string;
    origin?: string;
  }): URL {
    const { baseUrl, paths, scope } = opts;

    UrlBuilder.assertBase({ baseUrl, scope });
    UrlBuilder.assertPaths({ paths, scope });

    const isRelative = !ABSOLUTE_URL_PATTERN.test(baseUrl);
    const text = UrlBuilder.toText({ baseUrl, paths });

    // A page or a Web Worker has an origin to resolve '/api' against; a server has none.
    const origin = isRelative ? (opts.origin ?? UrlBuilder.readLocationOrigin()) : undefined;

    if (isRelative && !origin) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[${scope}] Relative baseUrl '${baseUrl}' needs a page or worker location to resolve against, and there is none here | Pass an absolute baseUrl such as 'https://api.example.com'`,
      });
    }

    const url = new URL(text, origin);

    UrlBuilder.assertUnderBase({ url, baseUrl, origin, scope });

    return url;
  }

  /** The resolved URL, whatever built it, is on the base's origin and under its path: the check that holds when the text checks above miss a form. */
  static assertUnderBase(opts: {
    url: URL;
    baseUrl: string;
    origin?: string;
    scope: string;
  }): void {
    const { url, baseUrl, origin, scope } = opts;
    const base = new URL(baseUrl, origin);
    const basePath = base.pathname.replace(/\/+$/, '');
    const isUnderBase =
      url.origin === base.origin &&
      (url.pathname === basePath || url.pathname.startsWith(`${basePath}/`));

    if (!isUnderBase) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.BadRequest,
        message: `[${scope}] A request path must stay under the base path: the URL left the origin or the base path`,
      });
    }
  }
}
