/**
 * Options of `ServerInfoComponent`, bound at `ServerInfoBindingKeys.SERVER_INFO_OPTIONS`.
 *
 * @example
 * ```typescript
 * import { ServerInfoBindingKeys, type BaseApplication, type IServerInfoOptions } from '@venizia/ignis';
 *
 * export const bindServerInfo = (application: BaseApplication) => {
 *   application
 *     .bind<IServerInfoOptions>({ key: ServerInfoBindingKeys.SERVER_INFO_OPTIONS })
 *     .toValue({ restOptions: { path: '/clock' } });
 * };
 * ```
 */
export interface IServerInfoOptions {
  /** Partially-filled bindings are accepted; every missing field falls back to its default. */
  restOptions?: {
    /**
     * Base path the server info routes mount under. The routes are public by design.
     *
     * @default '/server/info'
     */
    path?: string;
  };
}

/**
 * Body of `GET <path>/time`. Every field comes from ONE captured instant, so they never disagree.
 *
 * @example
 * ```json
 * {
 *   "server": {
 *     "date": "2026-11-10",
 *     "time": "15:00:00.123",
 *     "epoch": 1794297600123,
 *     "iso": "2026-11-10T15:00:00.123+07:00"
 *   },
 *   "tz": "Asia/Ho_Chi_Minh",
 *   "utc": { "offset": "+07:00", "minutes": 420, "iso": "2026-11-10T08:00:00.123Z" }
 * }
 * ```
 */
export interface IServerTime {
  server: {
    /** Calendar date in the server time zone, `YYYY-MM-DD`. */
    date: string;
    /** Wall-clock time in the server time zone, `HH:mm:ss.SSS`. */
    time: string;
    /** Milliseconds since 1970-01-01T00:00:00Z (`Date.now()`). Compute clock skew from this field. */
    epoch: number;
    /** `date`, `time` and `utc.offset` joined as ISO-8601, e.g. `2026-11-10T15:00:00.123+07:00`. */
    iso: string;
  };
  /** IANA time zone the server process resolved, e.g. `Asia/Ho_Chi_Minh`. */
  tz: string;
  utc: {
    /** Offset of `tz` from UTC at response time, `+07:00` style. */
    offset: string;
    /**
     * The same offset in minutes, POSITIVE east of UTC (`420` for `+07:00`). This is the opposite
     * sign of JavaScript's `Date.prototype.getTimezoneOffset()`.
     */
    minutes: number;
    /** The same instant in UTC, ISO-8601 with milliseconds (`toISOString()`). */
    iso: string;
  };
}
