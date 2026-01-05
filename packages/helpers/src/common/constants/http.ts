import { ValueOf } from '../types';

export class HTTP {
  static readonly Headers = {
    AUTHORIZATION: 'authorization',
    CACHE_CONTROL: 'cache-control',
    CONTENT_DISPOSITION: 'content-disposition',
    CONTENT_ENCODING: 'content-encoding',
    CONTENT_LENGTH: 'content-length',
    CONTENT_TYPE: 'content-type',
    CONTENT_RANGE: 'content-range',
    ETAG: 'etag',

    LAST_MODIFIED: 'last-modified',

    REQUEST_TRACING_ID: 'x-request-id',
    REQUEST_DEVICE_INFO: 'x-device-info',
    REQUEST_CHANNEL: 'x-request-channel',

    REQUEST_COUNT_DATA: 'x-request-count',
    RESPONSE_COUNT_DATA: 'x-response-count',

    RESPONSE_FORMAT: 'x-response-format',
  } as const;

  static readonly HeaderValues = {
    APPLICATION_FORM_URLENCODED: 'application/x-www-form-urlencoded',
    APPLICATION_JSON: 'application/json',
    APPPLICATION_OCTET_STREAM: 'application/octet-stream',
    MULTIPART_FORM_DATA: 'multipart/form-data',
    TEXT_PLAIN: 'text/plain',
  } as const;

  static readonly Methods = {
    GET: 'get',
    POST: 'post',
    PUT: 'put',
    PATCH: 'patch',
    DELETE: 'delete',
    HEAD: 'head',
    OPTIONS: 'options',
  } as const;

  static readonly ResultCodes = {
    RS_FAIL: 0,
    RS_SUCCESS: 1,
    RS_UNKNOWN_ERROR: -199,

    // 2xx successful – the request was successfully received, understood, and accepted
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

    // 3xx redirection – further action needs to be taken in order to complete the request
    RS_3: {
      MovedPermanently: 301,
      Found: 302,
      NotModified: 304,
      TemporaryRedirect: 307,
      PermanentRedirect: 308,
    },

    // 4xx client error – the request contains bad syntax or cannot be fulfilled
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

    // 5xx server error – the server failed to fulfil an apparently valid request
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
