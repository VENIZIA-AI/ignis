---
title: "@venizia/ignis-helpers/common"
description: "Every export of @venizia/ignis-helpers/common, from the built declarations (generated)."
---

# `@venizia/ignis-helpers/common`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

52 exports, 52 with TSDoc. 7 more are re-exported from other entries (listed at the end).

## `AnyObject`

*type*

An object with any string, number or symbol keys.

```ts
export type AnyObject = Record<string | symbol | number, any>;
```

Source: `packages/helpers/src/common/types/utility.ts`

## `AnyType`

*type*

Escape hatch for a value of unknown shape; prefer a real type.

```ts
export type AnyType = any;
```

Source: `packages/helpers/src/common/types/utility.ts`

## `ClassResolver`

*class*

Resolves a class reference that may be given directly, lazily through a resolver function, or as a string binding key.

```ts
export declare class ClassResolver {
    /** Resolves a class reference, passing through string binding keys as-is. */
    static resolveClass<T>(opts: {
        ref: TClass<T> | TResolver<TClass<T>> | string;
    }): TClass<T> | string;
}
```

Source: `packages/helpers/src/common/resolvers.ts`

## `CONTENT_TYPE_BY_EXTENSION`

*const*

Published before the table moved onto the class; kept as the one-line delegate it now is.

```ts
export declare const CONTENT_TYPE_BY_EXTENSION: Readonly<Partial<Record<string, TContentType>>>;
```

Source: `packages/helpers/src/common/constants/mime.ts`

## `ContentTypes`

*class*

Full content types, as they go on the wire. `MimeTypes` holds only the top-level part.

```ts
export declare class ContentTypes {
    static readonly OCTET_STREAM = "application/octet-stream";
    static readonly PNG = "image/png";
    static readonly JPEG = "image/jpeg";
    static readonly GIF = "image/gif";
    static readonly WEBP = "image/webp";
    static readonly SVG = "image/svg+xml";
    static readonly PDF = "application/pdf";
    static readonly JSON = "application/json";
    static readonly PLAIN_TEXT = "text/plain";
    static readonly HTML = "text/html";
    static readonly CSS = "text/css";
    static readonly JAVASCRIPT = "text/javascript";
    static readonly MP4 = "video/mp4";
    static readonly WEBM = "video/webm";
    static readonly MPEG_AUDIO = "audio/mpeg";
    static readonly WAV = "audio/wav";
    static readonly ZIP = "application/zip";
    static readonly CSV = "text/csv";
    static readonly XML = "application/xml";
    static readonly XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    static readonly XLS = "application/vnd.ms-excel";
    static readonly DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    static readonly DOC = "application/msword";
    static readonly PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    static readonly PPT = "application/vnd.ms-powerpoint";
    static readonly ODT = "application/vnd.oasis.opendocument.text";
    static readonly ODS = "application/vnd.oasis.opendocument.spreadsheet";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): boolean;
}
```

Source: `packages/helpers/src/common/constants/mime.ts`

## `ContentTypeTable`

*class*

The extension table and the lookup that reads it, together - the `DurationMultipliers` shape.

```ts
export declare class ContentTypeTable {
    /** `satisfies` makes the table total; the declared `string` key keeps a lookup cast-free. */
    static readonly BY_EXTENSION: Readonly<Partial<Record<string, TContentType>>>;
    /**
     * The content type an object name implies. `node:path` is deliberately not used: this file is
     * reachable from the browser-pure `./common` subpath, and an extension is the tail after the last
     * dot either way.
     */
    static resolve(opts: {
        filename: string;
    }): TContentType;
}
```

Source: `packages/helpers/src/common/constants/mime.ts`

## `DataTypes`

*class*

The value kinds a stored field can hold; `isValid` tests a string against them.

```ts
export declare class DataTypes {
    static readonly NUMBER = "NUMBER";
    static readonly TEXT = "TEXT";
    static readonly BYTE = "BYTE";
    static readonly JSON = "JSON";
    static readonly BOOLEAN = "BOOLEAN";
    static readonly SCHEME_SET: Set<string>;
    static isValid(orgType: string): boolean;
}
```

Source: `packages/helpers/src/common/constants/app.ts`

## `Defaults`

*class*

Application-wide defaults: the application name and the paging values of a list query.

```ts
export declare class Defaults {
    /**
     * The application name; reads `APP_ENV_APPLICATION_NAME`.
     * @default 'APP'
     */
    static readonly APPLICATION_NAME: string;
    /**
     * Rows a list query returns.
     * @default 50
     */
    static readonly QUERY_LIMIT = 50;
    /**
     * Rows a list query skips.
     * @default 0
     */
    static readonly QUERY_OFFSET = 0;
}
```

Source: `packages/helpers/src/common/constants/app.ts`

## `DurationAliases`

*class*

Written spellings that resolve to a unit. Member names are the spelling, upper-cased - so
{@link resolve} upper-cases its input and reads one property, with no second table to keep in step.

`M` is MINUTE and `MO` is MONTH - the same choice every duration library makes, and the one
ambiguity a reader will trip on. There is no single-letter month.

```ts
export declare class DurationAliases {
    static readonly MS = "millisecond";
    static readonly MSEC = "millisecond";
    static readonly MILLISECOND = "millisecond";
    static readonly MILLISECONDS = "millisecond";
    static readonly S = "second";
    static readonly SEC = "second";
    static readonly SECOND = "second";
    static readonly SECONDS = "second";
    static readonly M = "minute";
    static readonly MIN = "minute";
    static readonly MINUTE = "minute";
    static readonly MINUTES = "minute";
    static readonly H = "hour";
    static readonly HR = "hour";
    static readonly HOUR = "hour";
    static readonly HOURS = "hour";
    static readonly D = "day";
    static readonly DAY = "day";
    static readonly DAYS = "day";
    static readonly W = "week";
    static readonly WK = "week";
    static readonly WEEK = "week";
    static readonly WEEKS = "week";
    static readonly MO = "month";
    static readonly MON = "month";
    static readonly MONTH = "month";
    static readonly MONTHS = "month";
    static readonly Y = "year";
    static readonly YR = "year";
    static readonly YEAR = "year";
    static readonly YEARS = "year";
    /** Resolves a written unit - `'d'`, `'days'`, `'DAY'` - to its canonical name, or `null`. */
    static resolve(input: string): TDurationUnit | null;
}
```

Source: `packages/helpers/src/common/constants/duration.ts`

## `DurationMultipliers`

*class*

A month is 30 days and a year 365, nominal. These size a WINDOW - a grace period, a cache TTL, a
near-expiry horizon - and must never compute a calendar date: adding `MONTH` to 31 January lands
on 2 March in a leap year and 3 March otherwise. Use a date library for calendar arithmetic.

```ts
export declare class DurationMultipliers {
    static readonly MILLISECOND = 1;
    static readonly SECOND: number;
    static readonly MINUTE: number;
    static readonly HOUR: number;
    static readonly DAY: number;
    static readonly WEEK: number;
    static readonly MONTH: number;
    static readonly YEAR: number;
    static readonly BY_UNIT: Record<string, number>;
    /** The multiplier of a known unit, `null` for anything else - inherited property names included. */
    private static multiplierOf;
    /**
     * `null` rather than a throw, so a caller that wants an error raises its own with its own context.
     * Every method here answers the same way.
     *
     * The unit is checked against {@link DurationUnits.SCHEME_SET} first: a plain-object read alone
     * would answer `'constructor'` or `'toString'` with a member of `Object.prototype`, not `undefined`.
     */
    static toMilliseconds(opts: IDuration | null): number | null;
    /** The inverse of {@link toMilliseconds}. Fractional on purpose - rounding here would silently lose a 36-hour window asked for in days. */
    static fromMilliseconds(opts: {
        milliseconds: number;
        unit: TDurationUnit;
    }): number | null;
    /** Unit to unit, through milliseconds. Fractional, for the reason {@link fromMilliseconds} gives. */
    static convert(opts: {
        value: number;
        from: TDurationUnit;
        to: TDurationUnit;
    }): number | null;
    /** Reads a written duration - `'30d'`, `'1500 ms'`, `'2 hours'` - into {@link IDuration}. Aliases and the `M`/`MO` rule are on {@link DurationAliases}. */
    static parse(input: string): IDuration | null;
    /** `'30d'` straight to milliseconds - the shape a TTL or a grace period is usually configured in. */
    static parseToMilliseconds(input: string): number | null;
}
```

Source: `packages/helpers/src/common/constants/duration.ts`

## `DurationUnits`

*class*

The time units a duration can be expressed in, smallest first.

```ts
export declare class DurationUnits {
    static readonly MILLISECOND = "millisecond";
    static readonly SECOND = "second";
    static readonly MINUTE = "minute";
    static readonly HOUR = "hour";
    static readonly DAY = "day";
    static readonly WEEK = "week";
    static readonly MONTH = "month";
    static readonly YEAR = "year";
    static readonly SCHEME_SET: Set<string>;
    static isValid(input: string): input is TDurationUnit;
}
```

Source: `packages/helpers/src/common/constants/duration.ts`

## `FieldMappingDataTypes`

*class*

The value kinds a field mapping reads.

```ts
export declare class FieldMappingDataTypes {
    static readonly STRING = "string";
    static readonly NUMBER = "number";
    static readonly STRINGS = "strings";
    static readonly NUMBERS = "numbers";
    static readonly BOOLEAN = "boolean";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): boolean;
}
```

Source: `packages/helpers/src/common/types/field-mapping.ts`

## `FileExtensions`

*class*

The leading dot is part of the value: `path.extname` returns one.

```ts
export declare class FileExtensions {
    static readonly PNG = ".png";
    static readonly JPG = ".jpg";
    static readonly JPEG = ".jpeg";
    static readonly GIF = ".gif";
    static readonly WEBP = ".webp";
    static readonly SVG = ".svg";
    static readonly PDF = ".pdf";
    static readonly JSON = ".json";
    static readonly TXT = ".txt";
    static readonly HTML = ".html";
    static readonly CSS = ".css";
    static readonly JS = ".js";
    static readonly MP4 = ".mp4";
    static readonly WEBM = ".webm";
    static readonly MP3 = ".mp3";
    static readonly WAV = ".wav";
    static readonly ZIP = ".zip";
    static readonly CSV = ".csv";
    static readonly XML = ".xml";
    static readonly XLSX = ".xlsx";
    static readonly XLS = ".xls";
    static readonly DOCX = ".docx";
    static readonly DOC = ".doc";
    static readonly PPTX = ".pptx";
    static readonly PPT = ".ppt";
    static readonly ODT = ".odt";
    static readonly ODS = ".ods";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): boolean;
}
```

Source: `packages/helpers/src/common/constants/mime.ts`

## `GRPC`

*class*

gRPC constants: call kinds, protocol headers and header values, and the numeric status codes by name.

```ts
export declare class GRPC {
    /** Standard gRPC methods (lowercase). */
    static readonly Methods: {
        readonly UNARY: "unary";
        readonly SERVER_STREAMING: "server_streaming";
        readonly CLIENT_STREAMING: "client_streaming";
        readonly BIDI_STREAMING: "bidi_streaming";
    };
    /** Standard gRPC protocol headers (PROTOCOL-HTTP2.md). */
    static readonly Headers: {
        readonly CONTENT_TYPE: "content-type";
        readonly TE: "te";
        readonly USER_AGENT: "user-agent";
        readonly GRPC_TIMEOUT: "grpc-timeout";
        readonly GRPC_ENCODING: "grpc-encoding";
        readonly GRPC_ACCEPT_ENCODING: "grpc-accept-encoding";
        readonly GRPC_MESSAGE_TYPE: "grpc-message-type";
        readonly GRPC_STATUS: "grpc-status";
        readonly GRPC_MESSAGE: "grpc-message";
        readonly GRPC_STATUS_DETAILS_BIN: "grpc-status-details-bin";
        readonly GRPC_PREVIOUS_RPC_ATTEMPTS: "grpc-previous-rpc-attempts";
        readonly GRPC_RETRY_PUSHBACK_MS: "grpc-retry-pushback-ms";
        readonly GRPC_TRACE_BIN: "grpc-trace-bin";
        readonly GRPC_TAGS_BIN: "grpc-tags-bin";
    };
    /** gRPC MIME / Content-Type values. */
    static readonly HeaderValues: {
        readonly GRPC: "application/grpc";
        readonly GRPC_PROTO: "application/grpc+proto";
        readonly GRPC_JSON: "application/grpc+json";
        readonly GRPC_WEB: "application/grpc-web";
        readonly GRPC_WEB_PROTO: "application/grpc-web+proto";
        readonly GRPC_WEB_JSON: "application/grpc-web+json";
        readonly GRPC_WEB_TEXT: "application/grpc-web-text";
    };
    /** Standard gRPC status codes (google.rpc.Code). */
    static readonly ResultCodes: {
        readonly OK: 0;
        readonly CANCELLED: 1;
        readonly UNKNOWN: 2;
        readonly INVALID_ARGUMENT: 3;
        readonly DEADLINE_EXCEEDED: 4;
        readonly NOT_FOUND: 5;
        readonly ALREADY_EXISTS: 6;
        readonly PERMISSION_DENIED: 7;
        readonly RESOURCE_EXHAUSTED: 8;
        readonly FAILED_PRECONDITION: 9;
        readonly ABORTED: 10;
        readonly OUT_OF_RANGE: 11;
        readonly UNIMPLEMENTED: 12;
        readonly INTERNAL: 13;
        readonly UNAVAILABLE: 14;
        readonly DATA_LOSS: 15;
        readonly UNAUTHENTICATED: 16;
    };
}
```

Source: `packages/helpers/src/common/constants/grpc.ts`

## `HTTP`

*class*

HTTP constants: header names, CORS headers, header values, methods, protocols and status codes. Header names, methods and protocols are lowercase.

```ts
export declare class HTTP {
    /** Standard and common HTTP headers (lowercase per HTTP/2 convention). */
    static readonly Headers: {
        readonly CONTENT_DISPOSITION: "content-disposition";
        readonly CONTENT_ENCODING: "content-encoding";
        readonly CONTENT_LENGTH: "content-length";
        readonly CONTENT_TYPE: "content-type";
        readonly CONTENT_RANGE: "content-range";
        readonly CONTENT_SECURITY_POLICY: "content-security-policy";
        readonly ACCEPT: "accept";
        readonly ACCEPT_ENCODING: "accept-encoding";
        readonly ACCEPT_LANGUAGE: "accept-language";
        readonly AUTHORIZATION: "authorization";
        readonly COOKIE: "cookie";
        readonly HOST: "host";
        readonly IF_MODIFIED_SINCE: "if-modified-since";
        readonly IF_NONE_MATCH: "if-none-match";
        readonly ORIGIN: "origin";
        readonly REFERER: "referer";
        readonly USER_AGENT: "user-agent";
        readonly ALLOW: "allow";
        readonly CACHE_CONTROL: "cache-control";
        readonly ETAG: "etag";
        readonly LAST_MODIFIED: "last-modified";
        readonly LOCATION: "location";
        readonly RETRY_AFTER: "retry-after";
        readonly SET_COOKIE: "set-cookie";
        readonly VARY: "vary";
        readonly WWW_AUTHENTICATE: "www-authenticate";
        readonly ACCESS_CONTROL_ALLOW_CREDENTIALS: "access-control-allow-credentials";
        readonly ACCESS_CONTROL_ALLOW_HEADERS: "access-control-allow-headers";
        readonly ACCESS_CONTROL_ALLOW_METHODS: "access-control-allow-methods";
        readonly ACCESS_CONTROL_ALLOW_ORIGIN: "access-control-allow-origin";
        readonly ACCESS_CONTROL_EXPOSE_HEADERS: "access-control-expose-headers";
        readonly ACCESS_CONTROL_MAX_AGE: "access-control-max-age";
        readonly ACCESS_CONTROL_REQUEST_HEADERS: "access-control-request-headers";
        readonly ACCESS_CONTROL_REQUEST_METHOD: "access-control-request-method";
        readonly CONNECTION: "connection";
        readonly TRANSFER_ENCODING: "transfer-encoding";
        readonly UPGRADE: "upgrade";
        readonly STRICT_TRANSPORT_SECURITY: "strict-transport-security";
        readonly X_CONTENT_TYPE_OPTIONS: "x-content-type-options";
        readonly X_FRAME_OPTIONS: "x-frame-options";
        readonly FORWARDED: "forwarded";
        readonly X_FORWARDED_FOR: "x-forwarded-for";
        readonly X_FORWARDED_HOST: "x-forwarded-host";
        readonly X_FORWARDED_PROTO: "x-forwarded-proto";
        readonly X_RATELIMIT_LIMIT: "x-ratelimit-limit";
        readonly X_RATELIMIT_REMAINING: "x-ratelimit-remaining";
        readonly X_RATELIMIT_RESET: "x-ratelimit-reset";
        readonly REQUEST_TRACING_ID: "x-request-id";
        readonly REQUEST_DEVICE_INFO: "x-device-info";
        readonly REQUEST_CHANNEL: "x-request-channel";
        readonly REQUEST_COUNT_DATA: "x-request-count";
        readonly REQUEST_EXTRA: "x-request-extra";
        readonly RESPONSE_COUNT_DATA: "x-response-count";
        readonly RESPONSE_FORMAT: "x-response-format";
        readonly RESPONSE_EXTRA: "x-response-extra";
    };
    /**
     * The headers IGNIS adds to a request and to a response, for a CORS configuration that lists them
     * by hand: spread `ALLOW` into the allowed request headers and `EXPOSE` into the exposed ones, so
     * a header IGNIS adds later needs no change there.
     */
    static readonly CorsHeaders: {
        readonly ALLOW: readonly ["x-request-id", "x-request-count", "x-request-extra", "x-request-channel", "x-device-info"];
        readonly EXPOSE: readonly ["content-range", "x-request-id", "x-response-count", "x-response-format", "x-response-extra"];
    };
    /** Common MIME / Content-Type values. */
    static readonly HeaderValues: {
        readonly APPLICATION_FORM_URLENCODED: "application/x-www-form-urlencoded";
        readonly APPLICATION_GRAPHQL_JSON: "application/graphql+json";
        readonly APPLICATION_GZIP: "application/gzip";
        readonly APPLICATION_JAVASCRIPT: "application/javascript";
        readonly APPLICATION_JSON: "application/json";
        readonly APPLICATION_MSGPACK: "application/msgpack";
        readonly APPLICATION_NDJSON: "application/x-ndjson";
        readonly APPLICATION_OCTET_STREAM: "application/octet-stream";
        readonly APPLICATION_PDF: "application/pdf";
        readonly APPLICATION_PROTOBUF: "application/x-protobuf";
        readonly APPLICATION_XML: "application/xml";
        readonly APPLICATION_ZIP: "application/zip";
        readonly MULTIPART_FORM_DATA: "multipart/form-data";
        readonly TEXT_CSS: "text/css";
        readonly TEXT_CSV: "text/csv";
        readonly TEXT_EVENT_STREAM: "text/event-stream";
        readonly TEXT_HTML: "text/html";
        readonly TEXT_PLAIN: "text/plain";
        readonly TEXT_XML: "text/xml";
        readonly IMAGE_GIF: "image/gif";
        readonly IMAGE_JPEG: "image/jpeg";
        readonly IMAGE_PNG: "image/png";
        readonly IMAGE_SVG: "image/svg+xml";
        readonly IMAGE_WEBP: "image/webp";
    };
    /** Standard HTTP methods (lowercase). */
    static readonly Methods: {
        readonly GET: "get";
        readonly POST: "post";
        readonly PUT: "put";
        readonly PATCH: "patch";
        readonly DELETE: "delete";
        readonly HEAD: "head";
        readonly OPTIONS: "options";
        readonly QUERY: "query";
    };
    /** Standard HTTP protocols (lowercase). */
    static readonly Protocols: {
        readonly HTTP: "http";
        readonly HTTPS: "https";
    };
    /** HTTP status codes grouped by class (1xx - 5xx). */
    static readonly ResultCodes: {
        /** 1xx - Informational. */
        readonly RS_1: {
            readonly Continue: 100;
            readonly SwitchingProtocols: 101;
            readonly EarlyHints: 103;
        };
        /** 2xx - Success. */
        readonly RS_2: {
            readonly Ok: 200;
            readonly Created: 201;
            readonly Accepted: 202;
            readonly NonAuthoritativeInformation: 203;
            readonly NoContent: 204;
            readonly ResetContent: 205;
            readonly PartialContent: 206;
            readonly MultiStatus: 207;
        };
        /** 3xx - Redirection. */
        readonly RS_3: {
            readonly MovedPermanently: 301;
            readonly Found: 302;
            readonly NotModified: 304;
            readonly TemporaryRedirect: 307;
            readonly PermanentRedirect: 308;
        };
        /** 4xx - Client error. */
        readonly RS_4: {
            readonly BadRequest: 400;
            readonly Unauthorized: 401;
            readonly PaymentRequired: 402;
            readonly Forbidden: 403;
            readonly NotFound: 404;
            readonly MethodNotAllowed: 405;
            readonly NotAcceptable: 406;
            readonly RequestTimeout: 408;
            readonly Conflict: 409;
            readonly Gone: 410;
            readonly LengthRequired: 411;
            readonly PreconditionFailed: 412;
            readonly ContentTooLarge: 413;
            readonly URITooLong: 414;
            readonly UnsupportedMediaType: 415;
            readonly RangeNotSatisfiable: 416;
            readonly ExpectationFailed: 417;
            readonly UnprocessableEntity: 422;
            readonly Locked: 423;
            readonly FailedDependency: 424;
            readonly TooEarly: 425;
            readonly UpgradeRequired: 426;
            readonly PreconditionRequired: 428;
            readonly TooManyRequests: 429;
            readonly RequestHeaderFieldsTooLarge: 431;
            readonly UnavailableForLegalReasons: 451;
        };
        /** 5xx - Server error. */
        readonly RS_5: {
            readonly InternalServerError: 500;
            readonly NotImplemented: 501;
            readonly BadGateway: 502;
            readonly ServiceUnavailable: 503;
            readonly GatewayTimeout: 504;
            readonly HTTPVersionNotSupported: 505;
            readonly InsufficientStorage: 507;
            readonly LoopDetected: 508;
            readonly NetworkAuthenticationRequired: 511;
        };
    };
}
```

Source: `packages/helpers/src/common/constants/http.ts`

## `IConfigurable`

*interface*

Something set up by a `configure` call, which may be asynchronous.

```ts
export interface IConfigurable<Options extends object = any, Result = any> {
    configure(opts?: Options): ValueOrPromise<Result>;
}
```

Source: `packages/helpers/src/common/types/injection.ts`

## `IDuration`

*interface*

A parsed duration: a `value` counted in `unit`. The value may be negative or fractional.

```ts
export interface IDuration {
    unit: TDurationUnit;
    value: number;
}
```

Source: `packages/helpers/src/common/constants/duration.ts`

## `IFieldMapping`

*interface*

Describes one field to read: its `name`, its value `type`, and an optional `default`.

```ts
export interface IFieldMapping {
    name: string;
    type: TFieldMappingDataType;
    default?: string | number | Array<string> | Array<number> | boolean;
}
```

Source: `packages/helpers/src/common/types/field-mapping.ts`

## `MimeTypes`

*class*

The top-level part of a MIME type (`image`, `video`, `text`), plus `unknown`. For the full content type see `ContentTypes`.

```ts
export declare class MimeTypes {
    static readonly UNKNOWN = "unknown";
    static readonly IMAGE = "image";
    static readonly VIDEO = "video";
    static readonly TEXT = "text";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): boolean;
}
```

Source: `packages/helpers/src/common/constants/mime.ts`

## `REDACTED`

*const*

The placeholder that replaces a secret value in redacted output.

```ts
export declare const REDACTED = "[REDACTED]";
```

Source: `packages/helpers/src/common/redact.ts`

## `RedactUtility`

*class*

Makes a log argument safe to print: masks secret-looking keys, breaks cycles, caps long strings and strips URL credentials. `APP_ENV_LOGGER_DO_REDACT=false` turns off the key masking only.

```ts
export declare class RedactUtility {
    /**
     * Redacts every secret-looking KEY (not value shape - buffers/typed arrays are summarized, not
     * serialized). `APP_ENV_LOGGER_DO_REDACT=false` makes this the identity function.
     *
     * `depth` bounds the walk, exactly as {@link RedactUtility.toJsonSafe} already does. It defaults to
     * `Infinity` for callers that really do want the whole graph, but the logger passes its own bound:
     * rendering only inspects a handful of levels, so walking to `Infinity` did work whose result was
     * thrown away - 12x on a deep graph, and a `RangeError` on a very deep chain.
     *
     * `force: true` masks secret-looking KEYS even when `APP_ENV_LOGGER_DO_REDACT=false`. The result is still the
     * log-shaped copy: long strings are capped, a second reference to one object reads `[Circular]`, binary is
     * summarized, and a key is masked by name only (a card number under `number` is not). It is not a faithful
     * redacted document. The logger never sets it.
     */
    static redactSecrets(opts: {
        value: unknown;
        seen?: WeakSet<object>;
        depth?: number;
        force?: boolean;
    }): unknown;
    /** Projects a value into something `JSON.stringify` can render: it answers `[Circular]` for the WHOLE payload when one cycle sits anywhere inside it, so cycles must be broken per-branch first. `depth` bounds the walk the way `util.inspect` does - a log argument may hold a live connector or request context, whose graph is effectively unbounded. The projection itself is unconditional: `APP_ENV_LOGGER_DO_REDACT=false` turns off the key masking, never the structural pass. `force: true` keeps the key masking on whatever the switch says; the projection stays lossy, as in {@link RedactUtility.redactSecrets}. */
    static toJsonSafe(opts: {
        value: unknown;
        depth?: number;
        force?: boolean;
    }): unknown;
    /** Strips credentials from a connection URL's authority section (`user:hunter2@host` -> `user:[REDACTED]@host`) - {@link RedactUtility.redactSecrets} matches on KEY names and can't see them there. A value that fails to parse as a URL is returned unchanged. `force: true` strips even when `APP_ENV_LOGGER_DO_REDACT=false`. */
    static redactUrlCredentials(opts: {
        url: string;
        force?: boolean;
    }): string;
}
```

Source: `packages/helpers/src/common/redact.ts`

## `RuntimeModules`

*class*

IGNIS runs on Bun only: `detect()` answers `'bun'` there and `undefined` anywhere else (a browser, another runtime).

```ts
export declare class RuntimeModules {
    static readonly BUN = "bun";
    static detect(): TRuntimeModule | undefined;
    static isBun(): boolean;
}
```

Source: `packages/helpers/src/common/constants/app.ts`

## `TAbstractClass`

*type*

An abstract class producing `T`, with any static members allowed.

```ts
export type TAbstractClass<T> = TAbstractConstructor<T> & {
    [property: string]: any;
};
```

Source: `packages/helpers/src/common/types/class.ts`

## `TAbstractConstructor`

*type*

An abstract class constructor producing `T`; it cannot be called with `new` directly.

```ts
export type TAbstractConstructor<T> = abstract new (...args: any[]) => T;
```

Source: `packages/helpers/src/common/types/class.ts`

## `TAbstractMixinTarget`

*type*

`TMixinTarget` for an abstract base class.

```ts
export type TAbstractMixinTarget<T> = TAbstractConstructor<{
    [P in keyof T]: T[P];
}>;
```

Source: `packages/helpers/src/common/types/class.ts`

## `TClass`

*type*

A concrete class producing `T`, with any static members allowed.

```ts
export type TClass<T> = TConstructor<T> & {
    [property: string]: any;
};
```

Source: `packages/helpers/src/common/types/class.ts`

## `TConstructor`

*type*

A concrete class constructor producing `T`.

```ts
export type TConstructor<T> = new (...args: any[]) => T;
```

Source: `packages/helpers/src/common/types/class.ts`

## `TConstValue`

*type*

The string and number values held by the `static readonly` members of const class `T`, as a plain union.

```ts
export type TConstValue<T extends TClass<any>> = Extract<ValueOf<T>, string | number> & {};
```

Source: `packages/helpers/src/common/types/const-value.ts`

## `TContentType`

*type*

One of the `ContentTypes` values.

```ts
export type TContentType = TConstValue<typeof ContentTypes>;
```

Source: `packages/helpers/src/common/constants/mime.ts`

## `TDurationUnit`

*type*

One of the `DurationUnits` values, e.g. `'second'`.

```ts
export type TDurationUnit = TConstValue<typeof DurationUnits>;
```

Source: `packages/helpers/src/common/constants/duration.ts`

## `TFieldMappingDataType`

*type*

Valid field mapping data type values.

```ts
export type TFieldMappingDataType = TConstValue<typeof FieldMappingDataTypes>;
```

Source: `packages/helpers/src/common/types/field-mapping.ts`

## `TFieldMappingNames`

*type*

The union of `name` values in a list of field mappings.

```ts
export type TFieldMappingNames<T extends Array<IFieldMapping>> = Extract<T[number], {
    type: Exclude<T[number]['type'], undefined>;
}>['name'];
```

Source: `packages/helpers/src/common/types/field-mapping.ts`

## `TFileExtension`

*type*

One of the `FileExtensions` values, with its leading dot.

```ts
export type TFileExtension = TConstValue<typeof FileExtensions>;
```

Source: `packages/helpers/src/common/constants/mime.ts`

## `TGrpcMethod`

*type*

A gRPC call kind from `GRPC.Methods`, lowercase.

```ts
export type TGrpcMethod = ValueOf<typeof GRPC.Methods>;

/** gRPC constants: call kinds, protocol headers and header values, and the numeric status codes by name. */
export declare class GRPC {
    /** Standard gRPC methods (lowercase). */
    static readonly Methods: {
        readonly UNARY: "unary";
        readonly SERVER_STREAMING: "server_streaming";
        readonly CLIENT_STREAMING: "client_streaming";
        readonly BIDI_STREAMING: "bidi_streaming";
    };
    /** Standard gRPC protocol headers (PROTOCOL-HTTP2.md). */
    static readonly Headers: {
        readonly CONTENT_TYPE: "content-type";
        readonly TE: "te";
        readonly USER_AGENT: "user-agent";
        readonly GRPC_TIMEOUT: "grpc-timeout";
        readonly GRPC_ENCODING: "grpc-encoding";
        readonly GRPC_ACCEPT_ENCODING: "grpc-accept-encoding";
        readonly GRPC_MESSAGE_TYPE: "grpc-message-type";
        readonly GRPC_STATUS: "grpc-status";
        readonly GRPC_MESSAGE: "grpc-message";
        readonly GRPC_STATUS_DETAILS_BIN: "grpc-status-details-bin";
        readonly GRPC_PREVIOUS_RPC_ATTEMPTS: "grpc-previous-rpc-attempts";
        readonly GRPC_RETRY_PUSHBACK_MS: "grpc-retry-pushback-ms";
        readonly GRPC_TRACE_BIN: "grpc-trace-bin";
        readonly GRPC_TAGS_BIN: "grpc-tags-bin";
    };
    /** gRPC MIME / Content-Type values. */
    static readonly HeaderValues: {
        readonly GRPC: "application/grpc";
        readonly GRPC_PROTO: "application/grpc+proto";
        readonly GRPC_JSON: "application/grpc+json";
        readonly GRPC_WEB: "application/grpc-web";
        readonly GRPC_WEB_PROTO: "application/grpc-web+proto";
        readonly GRPC_WEB_JSON: "application/grpc-web+json";
        readonly GRPC_WEB_TEXT: "application/grpc-web-text";
    };
    /** Standard gRPC status codes (google.rpc.Code). */
    static readonly ResultCodes: {
        readonly OK: 0;
        readonly CANCELLED: 1;
        readonly UNKNOWN: 2;
        readonly INVALID_ARGUMENT: 3;
        readonly DEADLINE_EXCEEDED: 4;
        readonly NOT_FOUND: 5;
        readonly ALREADY_EXISTS: 6;
        readonly PERMISSION_DENIED: 7;
        readonly RESOURCE_EXHAUSTED: 8;
        readonly FAILED_PRECONDITION: 9;
        readonly ABORTED: 10;
        readonly OUT_OF_RANGE: 11;
        readonly UNIMPLEMENTED: 12;
        readonly INTERNAL: 13;
        readonly UNAVAILABLE: 14;
        readonly DATA_LOSS: 15;
        readonly UNAUTHENTICATED: 16;
    };
}
```

Source: `packages/helpers/src/common/constants/grpc.ts`

## `TGrpcResultCode`

*type*

A numeric gRPC status code from `GRPC.ResultCodes` (`0` is OK).

```ts
export type TGrpcResultCode = ValueOf<typeof GRPC.ResultCodes>;

/** gRPC constants: call kinds, protocol headers and header values, and the numeric status codes by name. */
export declare class GRPC {
    /** Standard gRPC methods (lowercase). */
    static readonly Methods: {
        readonly UNARY: "unary";
        readonly SERVER_STREAMING: "server_streaming";
        readonly CLIENT_STREAMING: "client_streaming";
        readonly BIDI_STREAMING: "bidi_streaming";
    };
    /** Standard gRPC protocol headers (PROTOCOL-HTTP2.md). */
    static readonly Headers: {
        readonly CONTENT_TYPE: "content-type";
        readonly TE: "te";
        readonly USER_AGENT: "user-agent";
        readonly GRPC_TIMEOUT: "grpc-timeout";
        readonly GRPC_ENCODING: "grpc-encoding";
        readonly GRPC_ACCEPT_ENCODING: "grpc-accept-encoding";
        readonly GRPC_MESSAGE_TYPE: "grpc-message-type";
        readonly GRPC_STATUS: "grpc-status";
        readonly GRPC_MESSAGE: "grpc-message";
        readonly GRPC_STATUS_DETAILS_BIN: "grpc-status-details-bin";
        readonly GRPC_PREVIOUS_RPC_ATTEMPTS: "grpc-previous-rpc-attempts";
        readonly GRPC_RETRY_PUSHBACK_MS: "grpc-retry-pushback-ms";
        readonly GRPC_TRACE_BIN: "grpc-trace-bin";
        readonly GRPC_TAGS_BIN: "grpc-tags-bin";
    };
    /** gRPC MIME / Content-Type values. */
    static readonly HeaderValues: {
        readonly GRPC: "application/grpc";
        readonly GRPC_PROTO: "application/grpc+proto";
        readonly GRPC_JSON: "application/grpc+json";
        readonly GRPC_WEB: "application/grpc-web";
        readonly GRPC_WEB_PROTO: "application/grpc-web+proto";
        readonly GRPC_WEB_JSON: "application/grpc-web+json";
        readonly GRPC_WEB_TEXT: "application/grpc-web-text";
    };
    /** Standard gRPC status codes (google.rpc.Code). */
    static readonly ResultCodes: {
        readonly OK: 0;
        readonly CANCELLED: 1;
        readonly UNKNOWN: 2;
        readonly INVALID_ARGUMENT: 3;
        readonly DEADLINE_EXCEEDED: 4;
        readonly NOT_FOUND: 5;
        readonly ALREADY_EXISTS: 6;
        readonly PERMISSION_DENIED: 7;
        readonly RESOURCE_EXHAUSTED: 8;
        readonly FAILED_PRECONDITION: 9;
        readonly ABORTED: 10;
        readonly OUT_OF_RANGE: 11;
        readonly UNIMPLEMENTED: 12;
        readonly INTERNAL: 13;
        readonly UNAVAILABLE: 14;
        readonly DATA_LOSS: 15;
        readonly UNAUTHENTICATED: 16;
    };
}
```

Source: `packages/helpers/src/common/constants/grpc.ts`

## `THttpMethod`

*type*

An HTTP method from `HTTP.Methods`, in lowercase or uppercase.

```ts
export type THttpMethod = ValueOf<typeof HTTP.Methods> | Uppercase<ValueOf<typeof HTTP.Methods>>;

/** HTTP constants: header names, CORS headers, header values, methods, protocols and status codes. Header names, methods and protocols are lowercase. */
export declare class HTTP {
    /** Standard and common HTTP headers (lowercase per HTTP/2 convention). */
    static readonly Headers: {
        readonly CONTENT_DISPOSITION: "content-disposition";
        readonly CONTENT_ENCODING: "content-encoding";
        readonly CONTENT_LENGTH: "content-length";
        readonly CONTENT_TYPE: "content-type";
        readonly CONTENT_RANGE: "content-range";
        readonly CONTENT_SECURITY_POLICY: "content-security-policy";
        readonly ACCEPT: "accept";
        readonly ACCEPT_ENCODING: "accept-encoding";
        readonly ACCEPT_LANGUAGE: "accept-language";
        readonly AUTHORIZATION: "authorization";
        readonly COOKIE: "cookie";
        readonly HOST: "host";
        readonly IF_MODIFIED_SINCE: "if-modified-since";
        readonly IF_NONE_MATCH: "if-none-match";
        readonly ORIGIN: "origin";
        readonly REFERER: "referer";
        readonly USER_AGENT: "user-agent";
        readonly ALLOW: "allow";
        readonly CACHE_CONTROL: "cache-control";
        readonly ETAG: "etag";
        readonly LAST_MODIFIED: "last-modified";
        readonly LOCATION: "location";
        readonly RETRY_AFTER: "retry-after";
        readonly SET_COOKIE: "set-cookie";
        readonly VARY: "vary";
        readonly WWW_AUTHENTICATE: "www-authenticate";
        readonly ACCESS_CONTROL_ALLOW_CREDENTIALS: "access-control-allow-credentials";
        readonly ACCESS_CONTROL_ALLOW_HEADERS: "access-control-allow-headers";
        readonly ACCESS_CONTROL_ALLOW_METHODS: "access-control-allow-methods";
        readonly ACCESS_CONTROL_ALLOW_ORIGIN: "access-control-allow-origin";
        readonly ACCESS_CONTROL_EXPOSE_HEADERS: "access-control-expose-headers";
        readonly ACCESS_CONTROL_MAX_AGE: "access-control-max-age";
        readonly ACCESS_CONTROL_REQUEST_HEADERS: "access-control-request-headers";
        readonly ACCESS_CONTROL_REQUEST_METHOD: "access-control-request-method";
        readonly CONNECTION: "connection";
        readonly TRANSFER_ENCODING: "transfer-encoding";
        readonly UPGRADE: "upgrade";
        readonly STRICT_TRANSPORT_SECURITY: "strict-transport-security";
        readonly X_CONTENT_TYPE_OPTIONS: "x-content-type-options";
        readonly X_FRAME_OPTIONS: "x-frame-options";
        readonly FORWARDED: "forwarded";
        readonly X_FORWARDED_FOR: "x-forwarded-for";
        readonly X_FORWARDED_HOST: "x-forwarded-host";
        readonly X_FORWARDED_PROTO: "x-forwarded-proto";
        readonly X_RATELIMIT_LIMIT: "x-ratelimit-limit";
        readonly X_RATELIMIT_REMAINING: "x-ratelimit-remaining";
        readonly X_RATELIMIT_RESET: "x-ratelimit-reset";
        readonly REQUEST_TRACING_ID: "x-request-id";
        readonly REQUEST_DEVICE_INFO: "x-device-info";
        readonly REQUEST_CHANNEL: "x-request-channel";
        readonly REQUEST_COUNT_DATA: "x-request-count";
        readonly REQUEST_EXTRA: "x-request-extra";
        readonly RESPONSE_COUNT_DATA: "x-response-count";
        readonly RESPONSE_FORMAT: "x-response-format";
        readonly RESPONSE_EXTRA: "x-response-extra";
    };
    /**
     * The headers IGNIS adds to a request and to a response, for a CORS configuration that lists them
     * by hand: spread `ALLOW` into the allowed request headers and `EXPOSE` into the exposed ones, so
     * a header IGNIS adds later needs no change there.
     */
    static readonly CorsHeaders: {
        readonly ALLOW: readonly ["x-request-id", "x-request-count", "x-request-extra", "x-request-channel", "x-device-info"];
        readonly EXPOSE: readonly ["content-range", "x-request-id", "x-response-count", "x-response-format", "x-response-extra"];
    };
    /** Common MIME / Content-Type values. */
    static readonly HeaderValues: {
        readonly APPLICATION_FORM_URLENCODED: "application/x-www-form-urlencoded";
        readonly APPLICATION_GRAPHQL_JSON: "application/graphql+json";
        readonly APPLICATION_GZIP: "application/gzip";
        readonly APPLICATION_JAVASCRIPT: "application/javascript";
        readonly APPLICATION_JSON: "application/json";
        readonly APPLICATION_MSGPACK: "application/msgpack";
        readonly APPLICATION_NDJSON: "application/x-ndjson";
        readonly APPLICATION_OCTET_STREAM: "application/octet-stream";
        readonly APPLICATION_PDF: "application/pdf";
        readonly APPLICATION_PROTOBUF: "application/x-protobuf";
        readonly APPLICATION_XML: "application/xml";
        readonly APPLICATION_ZIP: "application/zip";
        readonly MULTIPART_FORM_DATA: "multipart/form-data";
        readonly TEXT_CSS: "text/css";
        readonly TEXT_CSV: "text/csv";
        readonly TEXT_EVENT_STREAM: "text/event-stream";
        readonly TEXT_HTML: "text/html";
        readonly TEXT_PLAIN: "text/plain";
        readonly TEXT_XML: "text/xml";
        readonly IMAGE_GIF: "image/gif";
        readonly IMAGE_JPEG: "image/jpeg";
        readonly IMAGE_PNG: "image/png";
        readonly IMAGE_SVG: "image/svg+xml";
        readonly IMAGE_WEBP: "image/webp";
    };
    /** Standard HTTP methods (lowercase). */
    static readonly Methods: {
        readonly GET: "get";
        readonly POST: "post";
        readonly PUT: "put";
        readonly PATCH: "patch";
        readonly DELETE: "delete";
        readonly HEAD: "head";
        readonly OPTIONS: "options";
        readonly QUERY: "query";
    };
    /** Standard HTTP protocols (lowercase). */
    static readonly Protocols: {
        readonly HTTP: "http";
        readonly HTTPS: "https";
    };
    /** HTTP status codes grouped by class (1xx - 5xx). */
    static readonly ResultCodes: {
        /** 1xx - Informational. */
        readonly RS_1: {
            readonly Continue: 100;
            readonly SwitchingProtocols: 101;
            readonly EarlyHints: 103;
        };
        /** 2xx - Success. */
        readonly RS_2: {
            readonly Ok: 200;
            readonly Created: 201;
            readonly Accepted: 202;
            readonly NonAuthoritativeInformation: 203;
            readonly NoContent: 204;
            readonly ResetContent: 205;
            readonly PartialContent: 206;
            readonly MultiStatus: 207;
        };
        /** 3xx - Redirection. */
        readonly RS_3: {
            readonly MovedPermanently: 301;
            readonly Found: 302;
            readonly NotModified: 304;
            readonly TemporaryRedirect: 307;
            readonly PermanentRedirect: 308;
        };
        /** 4xx - Client error. */
        readonly RS_4: {
            readonly BadRequest: 400;
            readonly Unauthorized: 401;
            readonly PaymentRequired: 402;
            readonly Forbidden: 403;
            readonly NotFound: 404;
            readonly MethodNotAllowed: 405;
            readonly NotAcceptable: 406;
            readonly RequestTimeout: 408;
            readonly Conflict: 409;
            readonly Gone: 410;
            readonly LengthRequired: 411;
            readonly PreconditionFailed: 412;
            readonly ContentTooLarge: 413;
            readonly URITooLong: 414;
            readonly UnsupportedMediaType: 415;
            readonly RangeNotSatisfiable: 416;
            readonly ExpectationFailed: 417;
            readonly UnprocessableEntity: 422;
            readonly Locked: 423;
            readonly FailedDependency: 424;
            readonly TooEarly: 425;
            readonly UpgradeRequired: 426;
            readonly PreconditionRequired: 428;
            readonly TooManyRequests: 429;
            readonly RequestHeaderFieldsTooLarge: 431;
            readonly UnavailableForLegalReasons: 451;
        };
        /** 5xx - Server error. */
        readonly RS_5: {
            readonly InternalServerError: 500;
            readonly NotImplemented: 501;
            readonly BadGateway: 502;
            readonly ServiceUnavailable: 503;
            readonly GatewayTimeout: 504;
            readonly HTTPVersionNotSupported: 505;
            readonly InsufficientStorage: 507;
            readonly LoopDetected: 508;
            readonly NetworkAuthenticationRequired: 511;
        };
    };
}
```

Source: `packages/helpers/src/common/constants/http.ts`

## `THttpProtocol`

*type*

An HTTP protocol from `HTTP.Protocols`, in lowercase or uppercase.

```ts
export type THttpProtocol = ValueOf<typeof HTTP.Protocols> | Uppercase<ValueOf<typeof HTTP.Protocols>>;

/** HTTP constants: header names, CORS headers, header values, methods, protocols and status codes. Header names, methods and protocols are lowercase. */
export declare class HTTP {
    /** Standard and common HTTP headers (lowercase per HTTP/2 convention). */
    static readonly Headers: {
        readonly CONTENT_DISPOSITION: "content-disposition";
        readonly CONTENT_ENCODING: "content-encoding";
        readonly CONTENT_LENGTH: "content-length";
        readonly CONTENT_TYPE: "content-type";
        readonly CONTENT_RANGE: "content-range";
        readonly CONTENT_SECURITY_POLICY: "content-security-policy";
        readonly ACCEPT: "accept";
        readonly ACCEPT_ENCODING: "accept-encoding";
        readonly ACCEPT_LANGUAGE: "accept-language";
        readonly AUTHORIZATION: "authorization";
        readonly COOKIE: "cookie";
        readonly HOST: "host";
        readonly IF_MODIFIED_SINCE: "if-modified-since";
        readonly IF_NONE_MATCH: "if-none-match";
        readonly ORIGIN: "origin";
        readonly REFERER: "referer";
        readonly USER_AGENT: "user-agent";
        readonly ALLOW: "allow";
        readonly CACHE_CONTROL: "cache-control";
        readonly ETAG: "etag";
        readonly LAST_MODIFIED: "last-modified";
        readonly LOCATION: "location";
        readonly RETRY_AFTER: "retry-after";
        readonly SET_COOKIE: "set-cookie";
        readonly VARY: "vary";
        readonly WWW_AUTHENTICATE: "www-authenticate";
        readonly ACCESS_CONTROL_ALLOW_CREDENTIALS: "access-control-allow-credentials";
        readonly ACCESS_CONTROL_ALLOW_HEADERS: "access-control-allow-headers";
        readonly ACCESS_CONTROL_ALLOW_METHODS: "access-control-allow-methods";
        readonly ACCESS_CONTROL_ALLOW_ORIGIN: "access-control-allow-origin";
        readonly ACCESS_CONTROL_EXPOSE_HEADERS: "access-control-expose-headers";
        readonly ACCESS_CONTROL_MAX_AGE: "access-control-max-age";
        readonly ACCESS_CONTROL_REQUEST_HEADERS: "access-control-request-headers";
        readonly ACCESS_CONTROL_REQUEST_METHOD: "access-control-request-method";
        readonly CONNECTION: "connection";
        readonly TRANSFER_ENCODING: "transfer-encoding";
        readonly UPGRADE: "upgrade";
        readonly STRICT_TRANSPORT_SECURITY: "strict-transport-security";
        readonly X_CONTENT_TYPE_OPTIONS: "x-content-type-options";
        readonly X_FRAME_OPTIONS: "x-frame-options";
        readonly FORWARDED: "forwarded";
        readonly X_FORWARDED_FOR: "x-forwarded-for";
        readonly X_FORWARDED_HOST: "x-forwarded-host";
        readonly X_FORWARDED_PROTO: "x-forwarded-proto";
        readonly X_RATELIMIT_LIMIT: "x-ratelimit-limit";
        readonly X_RATELIMIT_REMAINING: "x-ratelimit-remaining";
        readonly X_RATELIMIT_RESET: "x-ratelimit-reset";
        readonly REQUEST_TRACING_ID: "x-request-id";
        readonly REQUEST_DEVICE_INFO: "x-device-info";
        readonly REQUEST_CHANNEL: "x-request-channel";
        readonly REQUEST_COUNT_DATA: "x-request-count";
        readonly REQUEST_EXTRA: "x-request-extra";
        readonly RESPONSE_COUNT_DATA: "x-response-count";
        readonly RESPONSE_FORMAT: "x-response-format";
        readonly RESPONSE_EXTRA: "x-response-extra";
    };
    /**
     * The headers IGNIS adds to a request and to a response, for a CORS configuration that lists them
     * by hand: spread `ALLOW` into the allowed request headers and `EXPOSE` into the exposed ones, so
     * a header IGNIS adds later needs no change there.
     */
    static readonly CorsHeaders: {
        readonly ALLOW: readonly ["x-request-id", "x-request-count", "x-request-extra", "x-request-channel", "x-device-info"];
        readonly EXPOSE: readonly ["content-range", "x-request-id", "x-response-count", "x-response-format", "x-response-extra"];
    };
    /** Common MIME / Content-Type values. */
    static readonly HeaderValues: {
        readonly APPLICATION_FORM_URLENCODED: "application/x-www-form-urlencoded";
        readonly APPLICATION_GRAPHQL_JSON: "application/graphql+json";
        readonly APPLICATION_GZIP: "application/gzip";
        readonly APPLICATION_JAVASCRIPT: "application/javascript";
        readonly APPLICATION_JSON: "application/json";
        readonly APPLICATION_MSGPACK: "application/msgpack";
        readonly APPLICATION_NDJSON: "application/x-ndjson";
        readonly APPLICATION_OCTET_STREAM: "application/octet-stream";
        readonly APPLICATION_PDF: "application/pdf";
        readonly APPLICATION_PROTOBUF: "application/x-protobuf";
        readonly APPLICATION_XML: "application/xml";
        readonly APPLICATION_ZIP: "application/zip";
        readonly MULTIPART_FORM_DATA: "multipart/form-data";
        readonly TEXT_CSS: "text/css";
        readonly TEXT_CSV: "text/csv";
        readonly TEXT_EVENT_STREAM: "text/event-stream";
        readonly TEXT_HTML: "text/html";
        readonly TEXT_PLAIN: "text/plain";
        readonly TEXT_XML: "text/xml";
        readonly IMAGE_GIF: "image/gif";
        readonly IMAGE_JPEG: "image/jpeg";
        readonly IMAGE_PNG: "image/png";
        readonly IMAGE_SVG: "image/svg+xml";
        readonly IMAGE_WEBP: "image/webp";
    };
    /** Standard HTTP methods (lowercase). */
    static readonly Methods: {
        readonly GET: "get";
        readonly POST: "post";
        readonly PUT: "put";
        readonly PATCH: "patch";
        readonly DELETE: "delete";
        readonly HEAD: "head";
        readonly OPTIONS: "options";
        readonly QUERY: "query";
    };
    /** Standard HTTP protocols (lowercase). */
    static readonly Protocols: {
        readonly HTTP: "http";
        readonly HTTPS: "https";
    };
    /** HTTP status codes grouped by class (1xx - 5xx). */
    static readonly ResultCodes: {
        /** 1xx - Informational. */
        readonly RS_1: {
            readonly Continue: 100;
            readonly SwitchingProtocols: 101;
            readonly EarlyHints: 103;
        };
        /** 2xx - Success. */
        readonly RS_2: {
            readonly Ok: 200;
            readonly Created: 201;
            readonly Accepted: 202;
            readonly NonAuthoritativeInformation: 203;
            readonly NoContent: 204;
            readonly ResetContent: 205;
            readonly PartialContent: 206;
            readonly MultiStatus: 207;
        };
        /** 3xx - Redirection. */
        readonly RS_3: {
            readonly MovedPermanently: 301;
            readonly Found: 302;
            readonly NotModified: 304;
            readonly TemporaryRedirect: 307;
            readonly PermanentRedirect: 308;
        };
        /** 4xx - Client error. */
        readonly RS_4: {
            readonly BadRequest: 400;
            readonly Unauthorized: 401;
            readonly PaymentRequired: 402;
            readonly Forbidden: 403;
            readonly NotFound: 404;
            readonly MethodNotAllowed: 405;
            readonly NotAcceptable: 406;
            readonly RequestTimeout: 408;
            readonly Conflict: 409;
            readonly Gone: 410;
            readonly LengthRequired: 411;
            readonly PreconditionFailed: 412;
            readonly ContentTooLarge: 413;
            readonly URITooLong: 414;
            readonly UnsupportedMediaType: 415;
            readonly RangeNotSatisfiable: 416;
            readonly ExpectationFailed: 417;
            readonly UnprocessableEntity: 422;
            readonly Locked: 423;
            readonly FailedDependency: 424;
            readonly TooEarly: 425;
            readonly UpgradeRequired: 426;
            readonly PreconditionRequired: 428;
            readonly TooManyRequests: 429;
            readonly RequestHeaderFieldsTooLarge: 431;
            readonly UnavailableForLegalReasons: 451;
        };
        /** 5xx - Server error. */
        readonly RS_5: {
            readonly InternalServerError: 500;
            readonly NotImplemented: 501;
            readonly BadGateway: 502;
            readonly ServiceUnavailable: 503;
            readonly GatewayTimeout: 504;
            readonly HTTPVersionNotSupported: 505;
            readonly InsufficientStorage: 507;
            readonly LoopDetected: 508;
            readonly NetworkAuthenticationRequired: 511;
        };
    };
}
```

Source: `packages/helpers/src/common/constants/http.ts`

## `THttpResultCode`

*type*

A numeric HTTP status code from any class in `HTTP.ResultCodes`.

```ts
export type THttpResultCode = ValueOf<typeof HTTP.ResultCodes>;

/** HTTP constants: header names, CORS headers, header values, methods, protocols and status codes. Header names, methods and protocols are lowercase. */
export declare class HTTP {
    /** Standard and common HTTP headers (lowercase per HTTP/2 convention). */
    static readonly Headers: {
        readonly CONTENT_DISPOSITION: "content-disposition";
        readonly CONTENT_ENCODING: "content-encoding";
        readonly CONTENT_LENGTH: "content-length";
        readonly CONTENT_TYPE: "content-type";
        readonly CONTENT_RANGE: "content-range";
        readonly CONTENT_SECURITY_POLICY: "content-security-policy";
        readonly ACCEPT: "accept";
        readonly ACCEPT_ENCODING: "accept-encoding";
        readonly ACCEPT_LANGUAGE: "accept-language";
        readonly AUTHORIZATION: "authorization";
        readonly COOKIE: "cookie";
        readonly HOST: "host";
        readonly IF_MODIFIED_SINCE: "if-modified-since";
        readonly IF_NONE_MATCH: "if-none-match";
        readonly ORIGIN: "origin";
        readonly REFERER: "referer";
        readonly USER_AGENT: "user-agent";
        readonly ALLOW: "allow";
        readonly CACHE_CONTROL: "cache-control";
        readonly ETAG: "etag";
        readonly LAST_MODIFIED: "last-modified";
        readonly LOCATION: "location";
        readonly RETRY_AFTER: "retry-after";
        readonly SET_COOKIE: "set-cookie";
        readonly VARY: "vary";
        readonly WWW_AUTHENTICATE: "www-authenticate";
        readonly ACCESS_CONTROL_ALLOW_CREDENTIALS: "access-control-allow-credentials";
        readonly ACCESS_CONTROL_ALLOW_HEADERS: "access-control-allow-headers";
        readonly ACCESS_CONTROL_ALLOW_METHODS: "access-control-allow-methods";
        readonly ACCESS_CONTROL_ALLOW_ORIGIN: "access-control-allow-origin";
        readonly ACCESS_CONTROL_EXPOSE_HEADERS: "access-control-expose-headers";
        readonly ACCESS_CONTROL_MAX_AGE: "access-control-max-age";
        readonly ACCESS_CONTROL_REQUEST_HEADERS: "access-control-request-headers";
        readonly ACCESS_CONTROL_REQUEST_METHOD: "access-control-request-method";
        readonly CONNECTION: "connection";
        readonly TRANSFER_ENCODING: "transfer-encoding";
        readonly UPGRADE: "upgrade";
        readonly STRICT_TRANSPORT_SECURITY: "strict-transport-security";
        readonly X_CONTENT_TYPE_OPTIONS: "x-content-type-options";
        readonly X_FRAME_OPTIONS: "x-frame-options";
        readonly FORWARDED: "forwarded";
        readonly X_FORWARDED_FOR: "x-forwarded-for";
        readonly X_FORWARDED_HOST: "x-forwarded-host";
        readonly X_FORWARDED_PROTO: "x-forwarded-proto";
        readonly X_RATELIMIT_LIMIT: "x-ratelimit-limit";
        readonly X_RATELIMIT_REMAINING: "x-ratelimit-remaining";
        readonly X_RATELIMIT_RESET: "x-ratelimit-reset";
        readonly REQUEST_TRACING_ID: "x-request-id";
        readonly REQUEST_DEVICE_INFO: "x-device-info";
        readonly REQUEST_CHANNEL: "x-request-channel";
        readonly REQUEST_COUNT_DATA: "x-request-count";
        readonly REQUEST_EXTRA: "x-request-extra";
        readonly RESPONSE_COUNT_DATA: "x-response-count";
        readonly RESPONSE_FORMAT: "x-response-format";
        readonly RESPONSE_EXTRA: "x-response-extra";
    };
    /**
     * The headers IGNIS adds to a request and to a response, for a CORS configuration that lists them
     * by hand: spread `ALLOW` into the allowed request headers and `EXPOSE` into the exposed ones, so
     * a header IGNIS adds later needs no change there.
     */
    static readonly CorsHeaders: {
        readonly ALLOW: readonly ["x-request-id", "x-request-count", "x-request-extra", "x-request-channel", "x-device-info"];
        readonly EXPOSE: readonly ["content-range", "x-request-id", "x-response-count", "x-response-format", "x-response-extra"];
    };
    /** Common MIME / Content-Type values. */
    static readonly HeaderValues: {
        readonly APPLICATION_FORM_URLENCODED: "application/x-www-form-urlencoded";
        readonly APPLICATION_GRAPHQL_JSON: "application/graphql+json";
        readonly APPLICATION_GZIP: "application/gzip";
        readonly APPLICATION_JAVASCRIPT: "application/javascript";
        readonly APPLICATION_JSON: "application/json";
        readonly APPLICATION_MSGPACK: "application/msgpack";
        readonly APPLICATION_NDJSON: "application/x-ndjson";
        readonly APPLICATION_OCTET_STREAM: "application/octet-stream";
        readonly APPLICATION_PDF: "application/pdf";
        readonly APPLICATION_PROTOBUF: "application/x-protobuf";
        readonly APPLICATION_XML: "application/xml";
        readonly APPLICATION_ZIP: "application/zip";
        readonly MULTIPART_FORM_DATA: "multipart/form-data";
        readonly TEXT_CSS: "text/css";
        readonly TEXT_CSV: "text/csv";
        readonly TEXT_EVENT_STREAM: "text/event-stream";
        readonly TEXT_HTML: "text/html";
        readonly TEXT_PLAIN: "text/plain";
        readonly TEXT_XML: "text/xml";
        readonly IMAGE_GIF: "image/gif";
        readonly IMAGE_JPEG: "image/jpeg";
        readonly IMAGE_PNG: "image/png";
        readonly IMAGE_SVG: "image/svg+xml";
        readonly IMAGE_WEBP: "image/webp";
    };
    /** Standard HTTP methods (lowercase). */
    static readonly Methods: {
        readonly GET: "get";
        readonly POST: "post";
        readonly PUT: "put";
        readonly PATCH: "patch";
        readonly DELETE: "delete";
        readonly HEAD: "head";
        readonly OPTIONS: "options";
        readonly QUERY: "query";
    };
    /** Standard HTTP protocols (lowercase). */
    static readonly Protocols: {
        readonly HTTP: "http";
        readonly HTTPS: "https";
    };
    /** HTTP status codes grouped by class (1xx - 5xx). */
    static readonly ResultCodes: {
        /** 1xx - Informational. */
        readonly RS_1: {
            readonly Continue: 100;
            readonly SwitchingProtocols: 101;
            readonly EarlyHints: 103;
        };
        /** 2xx - Success. */
        readonly RS_2: {
            readonly Ok: 200;
            readonly Created: 201;
            readonly Accepted: 202;
            readonly NonAuthoritativeInformation: 203;
            readonly NoContent: 204;
            readonly ResetContent: 205;
            readonly PartialContent: 206;
            readonly MultiStatus: 207;
        };
        /** 3xx - Redirection. */
        readonly RS_3: {
            readonly MovedPermanently: 301;
            readonly Found: 302;
            readonly NotModified: 304;
            readonly TemporaryRedirect: 307;
            readonly PermanentRedirect: 308;
        };
        /** 4xx - Client error. */
        readonly RS_4: {
            readonly BadRequest: 400;
            readonly Unauthorized: 401;
            readonly PaymentRequired: 402;
            readonly Forbidden: 403;
            readonly NotFound: 404;
            readonly MethodNotAllowed: 405;
            readonly NotAcceptable: 406;
            readonly RequestTimeout: 408;
            readonly Conflict: 409;
            readonly Gone: 410;
            readonly LengthRequired: 411;
            readonly PreconditionFailed: 412;
            readonly ContentTooLarge: 413;
            readonly URITooLong: 414;
            readonly UnsupportedMediaType: 415;
            readonly RangeNotSatisfiable: 416;
            readonly ExpectationFailed: 417;
            readonly UnprocessableEntity: 422;
            readonly Locked: 423;
            readonly FailedDependency: 424;
            readonly TooEarly: 425;
            readonly UpgradeRequired: 426;
            readonly PreconditionRequired: 428;
            readonly TooManyRequests: 429;
            readonly RequestHeaderFieldsTooLarge: 431;
            readonly UnavailableForLegalReasons: 451;
        };
        /** 5xx - Server error. */
        readonly RS_5: {
            readonly InternalServerError: 500;
            readonly NotImplemented: 501;
            readonly BadGateway: 502;
            readonly ServiceUnavailable: 503;
            readonly GatewayTimeout: 504;
            readonly HTTPVersionNotSupported: 505;
            readonly InsufficientStorage: 507;
            readonly LoopDetected: 508;
            readonly NetworkAuthenticationRequired: 511;
        };
    };
}
```

Source: `packages/helpers/src/common/constants/http.ts`

## `TInjectionGetter`

*type*

Reads one value by binding `key` from the container; the caller supplies `T`.

```ts
export type TInjectionGetter = <T>(opts: {
    key: string | symbol;
}) => T;
```

Source: `packages/helpers/src/common/types/injection.ts`

## `TMimeTypes`

*type*

One of the `MimeTypes` values.

```ts
export type TMimeTypes = TConstValue<typeof MimeTypes>;
```

Source: `packages/helpers/src/common/constants/mime.ts`

## `TMixinTarget`

*type*

The constructor type a mixin accepts as its base: it must produce at least the members of `T`.

```ts
export type TMixinTarget<T> = TConstructor<{
    [P in keyof T]: T[P];
}>;
```

Source: `packages/helpers/src/common/types/class.ts`

## `TNullable`

*type*

`T`, `undefined` or `null`.

```ts
export type TNullable<T> = T | undefined | null;
```

Source: `packages/helpers/src/common/types/utility.ts`

## `TNumberConstValue`

*type*

The number values held by the `static readonly` members of const class `T`, as a plain union.

```ts
export type TNumberConstValue<T extends TClass<any>> = Extract<ValueOf<T>, number> & {};
```

Source: `packages/helpers/src/common/types/const-value.ts`

## `TObjectFromFieldMappings`

*type*

The object a list of field mappings yields: one key per `name`, typed from its `type` (`string`, `number`, `boolean`, `strings` or `numbers`). Needs the list typed as a literal (`as const`) to narrow.

```ts
export type TObjectFromFieldMappings<T extends readonly {
    name: string;
    type: string;
    [extra: string | symbol]: any;
}[]> = {
    [K in T[number]['name']]: T extends {
        name: K;
        type: 'string';
        [extra: string | symbol]: any;
    } ? string : T extends {
        name: K;
        type: 'number';
        [extra: string | symbol]: any;
    } ? number : T extends {
        name: K;
        type: 'boolean';
        [extra: string | symbol]: any;
    } ? boolean : T extends {
        name: K;
        type: 'strings';
        [extra: string | symbol]: any;
    } ? string[] : T extends {
        name: K;
        type: 'numbers';
        [extra: string | symbol]: any;
    } ? number[] : never;
};
```

Source: `packages/helpers/src/common/types/field-mapping.ts`

## `TOptions`

*type*

An options object of shape `T`; empty by default.

```ts
export type TOptions<T extends object = {}> = T;
```

Source: `packages/helpers/src/common/types/utility.ts`

## `TPrettify`

*type*

Flattens an intersection of types into one object type, for readable hovers.

```ts
export type TPrettify<T> = {
    [K in keyof T]: T[K];
} & {};
```

Source: `packages/helpers/src/common/types/utility.ts`

## `TRuntimeModule`

*type*

The runtime names `RuntimeModules` holds; only `bun` today.

```ts
export type TRuntimeModule = TConstValue<typeof RuntimeModules>;
```

Source: `packages/helpers/src/common/constants/app.ts`

## `TStringConstValue`

*type*

The string values held by the `static readonly` members of const class `T`, as a plain union.

```ts
export type TStringConstValue<T extends TClass<any>> = Extract<ValueOf<T>, string> & {};
```

Source: `packages/helpers/src/common/types/const-value.ts`

## `ValueOf`

*type*

The union of the property value types of `T`.

```ts
export type ValueOf<T> = T[keyof T];
```

Source: `packages/helpers/src/common/types/utility.ts`

## `ValueOptional`

*type*

`T` with the keys `K` made optional.

```ts
export type ValueOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
```

Source: `packages/helpers/src/common/types/utility.ts`

## `ValueOptionalExcept`

*type*

`T` with every key optional except `K`.

```ts
export type ValueOptionalExcept<T, K extends keyof T> = Pick<T, K> & Partial<Omit<T, K>>;
```

Source: `packages/helpers/src/common/types/utility.ts`

## `ValueOrPromise`

*type*

`T` or a promise of `T`; `await` it to get `T` either way.

```ts
export type ValueOrPromise<T> = T | Promise<T>;
```

Source: `packages/helpers/src/common/types/utility.ts`

## Re-exported

- `isClass` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `ObjectUtility` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `ResolverUtility` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TAsyncResolver` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TResolver` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TValueOrAsyncResolver` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TValueOrResolver` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
