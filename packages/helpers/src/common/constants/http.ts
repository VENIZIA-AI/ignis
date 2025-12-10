import { ValueOf } from "../types";

export class HTTP {
  static readonly Headers = {
    AUTHORIZATION: "authorization",
    REQUEST_TRACING_ID: "x-request-id",
  } as const;

  static readonly HeaderValues = {
    APPLICATION_JSON: "application/json",
    APPLICATION_FORM_URLENCODED: "application/x-www-form-urlencoded",
    TEXT_PLAIN: "text/plain",
    MULTIPART_FORM_DATA: "multipart/form-data",
  } as const;

  static readonly Methods = {
    GET: "get",
    POST: "post",
    PUT: "put",
    PATCH: "patch",
    DELETE: "delete",
    HEAD: "head",
    OPTIONS: "options",
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
    },

    // 4xx client error – the request contains bad syntax or cannot be fulfilled
    RS_4: {
      BadRequest: 400,
      Unauthorized: 401,
      PaymentRequired: 402,
      Forbidden: 403,
      NotFound: 404,
      MethodNotAllowed: 405,
      RequestTimeout: 408,
      ContentTooLarge: 413,
      URITooLong: 414,
      UnsupportedMediaType: 415,
      UnprocessableEntity: 422,
    },

    // 5xx server error – the server failed to fulfil an apparently valid request
    RS_5: {
      InternalServerError: 500,
      NotImplemented: 501,
    },
  } as const;
}

export type THttpMethod = ValueOf<typeof HTTP.Methods>;
export type THttpResultCode = ValueOf<typeof HTTP.ResultCodes>;
