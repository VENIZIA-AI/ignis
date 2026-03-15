import { ValueOf } from '../types';

export class HTTP {
  /** Standard and common HTTP headers (lowercase per HTTP/2 convention). */
  static readonly Headers = {
    // Content
    CONTENT_DISPOSITION: 'content-disposition',
    CONTENT_ENCODING: 'content-encoding',
    CONTENT_LENGTH: 'content-length',
    CONTENT_TYPE: 'content-type',
    CONTENT_RANGE: 'content-range',
    CONTENT_SECURITY_POLICY: 'content-security-policy',

    // Request — content negotiation & conditionals
    ACCEPT: 'accept',
    ACCEPT_ENCODING: 'accept-encoding',
    ACCEPT_LANGUAGE: 'accept-language',
    AUTHORIZATION: 'authorization',
    COOKIE: 'cookie',
    HOST: 'host',
    IF_MODIFIED_SINCE: 'if-modified-since',
    IF_NONE_MATCH: 'if-none-match',
    ORIGIN: 'origin',
    REFERER: 'referer',
    USER_AGENT: 'user-agent',

    // Response — caching, auth challenges & redirects
    ALLOW: 'allow',
    CACHE_CONTROL: 'cache-control',
    ETAG: 'etag',
    LAST_MODIFIED: 'last-modified',
    LOCATION: 'location',
    RETRY_AFTER: 'retry-after',
    SET_COOKIE: 'set-cookie',
    VARY: 'vary',
    WWW_AUTHENTICATE: 'www-authenticate',

    // CORS (RFC 6454 / Fetch spec)
    ACCESS_CONTROL_ALLOW_CREDENTIALS: 'access-control-allow-credentials',
    ACCESS_CONTROL_ALLOW_HEADERS: 'access-control-allow-headers',
    ACCESS_CONTROL_ALLOW_METHODS: 'access-control-allow-methods',
    ACCESS_CONTROL_ALLOW_ORIGIN: 'access-control-allow-origin',
    ACCESS_CONTROL_EXPOSE_HEADERS: 'access-control-expose-headers',
    ACCESS_CONTROL_MAX_AGE: 'access-control-max-age',
    ACCESS_CONTROL_REQUEST_HEADERS: 'access-control-request-headers',
    ACCESS_CONTROL_REQUEST_METHOD: 'access-control-request-method',

    // Transport
    CONNECTION: 'connection',
    TRANSFER_ENCODING: 'transfer-encoding',
    UPGRADE: 'upgrade',

    // Security
    STRICT_TRANSPORT_SECURITY: 'strict-transport-security',
    X_CONTENT_TYPE_OPTIONS: 'x-content-type-options',
    X_FRAME_OPTIONS: 'x-frame-options',

    // Proxy / forwarding (de facto standard)
    FORWARDED: 'forwarded',
    X_FORWARDED_FOR: 'x-forwarded-for',
    X_FORWARDED_HOST: 'x-forwarded-host',
    X_FORWARDED_PROTO: 'x-forwarded-proto',

    // Rate limiting (de facto standard)
    X_RATELIMIT_LIMIT: 'x-ratelimit-limit',
    X_RATELIMIT_REMAINING: 'x-ratelimit-remaining',
    X_RATELIMIT_RESET: 'x-ratelimit-reset',

    // Ignis custom
    REQUEST_TRACING_ID: 'x-request-id',
    REQUEST_DEVICE_INFO: 'x-device-info',
    REQUEST_CHANNEL: 'x-request-channel',
    REQUEST_COUNT_DATA: 'x-request-count',
    RESPONSE_COUNT_DATA: 'x-response-count',
    RESPONSE_FORMAT: 'x-response-format',
  } as const;

  /** Common MIME / Content-Type values. */
  static readonly HeaderValues = {
    // Application
    APPLICATION_FORM_URLENCODED: 'application/x-www-form-urlencoded',
    APPLICATION_GRAPHQL_JSON: 'application/graphql+json',
    APPLICATION_GZIP: 'application/gzip',
    APPLICATION_JAVASCRIPT: 'application/javascript',
    APPLICATION_JSON: 'application/json',
    APPLICATION_MSGPACK: 'application/msgpack',
    APPLICATION_NDJSON: 'application/x-ndjson',
    APPLICATION_OCTET_STREAM: 'application/octet-stream',
    APPLICATION_PDF: 'application/pdf',
    APPLICATION_PROTOBUF: 'application/x-protobuf',
    APPLICATION_XML: 'application/xml',
    APPLICATION_ZIP: 'application/zip',

    // Multipart
    MULTIPART_FORM_DATA: 'multipart/form-data',

    // Text
    TEXT_CSS: 'text/css',
    TEXT_CSV: 'text/csv',
    TEXT_EVENT_STREAM: 'text/event-stream',
    TEXT_HTML: 'text/html',
    TEXT_PLAIN: 'text/plain',
    TEXT_XML: 'text/xml',

    // Image
    IMAGE_GIF: 'image/gif',
    IMAGE_JPEG: 'image/jpeg',
    IMAGE_PNG: 'image/png',
    IMAGE_SVG: 'image/svg+xml',
    IMAGE_WEBP: 'image/webp',
  } as const;

  /** Standard HTTP methods (lowercase). */
  static readonly Methods = {
    GET: 'get',
    POST: 'post',
    PUT: 'put',
    PATCH: 'patch',
    DELETE: 'delete',
    HEAD: 'head',
    OPTIONS: 'options',
  } as const;

  /** HTTP status codes grouped by class (1xx–5xx). */
  static readonly ResultCodes = {
    /** 1xx — Informational. */
    RS_1: {
      Continue: 100,
      SwitchingProtocols: 101,
      EarlyHints: 103,
    },

    /** 2xx — Success. */
    RS_2: {
      Ok: 200,
      Created: 201,
      Accepted: 202,
      NonAuthoritativeInformation: 203,
      NoContent: 204,
      ResetContent: 205,
      PartialContent: 206,
      MultiStatus: 207,
    },

    /** 3xx — Redirection. */
    RS_3: {
      MovedPermanently: 301,
      Found: 302,
      NotModified: 304,
      TemporaryRedirect: 307,
      PermanentRedirect: 308,
    },

    /** 4xx — Client error. */
    RS_4: {
      BadRequest: 400,
      Unauthorized: 401,
      PaymentRequired: 402,
      Forbidden: 403,
      NotFound: 404,
      MethodNotAllowed: 405,
      NotAcceptable: 406,
      RequestTimeout: 408,
      Conflict: 409,
      Gone: 410,
      LengthRequired: 411,
      PreconditionFailed: 412,
      ContentTooLarge: 413,
      URITooLong: 414,
      UnsupportedMediaType: 415,
      RangeNotSatisfiable: 416,
      ExpectationFailed: 417,
      UnprocessableEntity: 422,
      Locked: 423,
      FailedDependency: 424,
      TooEarly: 425,
      UpgradeRequired: 426,
      PreconditionRequired: 428,
      TooManyRequests: 429,
      RequestHeaderFieldsTooLarge: 431,
      UnavailableForLegalReasons: 451,
    },

    /** 5xx — Server error. */
    RS_5: {
      InternalServerError: 500,
      NotImplemented: 501,
      BadGateway: 502,
      ServiceUnavailable: 503,
      GatewayTimeout: 504,
      HTTPVersionNotSupported: 505,
      InsufficientStorage: 507,
      LoopDetected: 508,
      NetworkAuthenticationRequired: 511,
    },
  } as const;
}

export type THttpMethod = ValueOf<typeof HTTP.Methods>;
export type THttpResultCode = ValueOf<typeof HTTP.ResultCodes>;
