/** `Cache-Control` values the server info controller sends. */
export class ServerInfoCacheControls {
  /** A cached server time is a wrong server time: no cache and no service worker may store the answer. */
  static readonly NO_STORE = 'no-store';
}
