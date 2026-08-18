/** Headers are carried as tuples: a `Headers` instance is not structured-cloneable. */
export type TEnvelopeHeaders = Array<[string, string]>;

export interface IBffRequestEnvelope {
  id: string;
  method: string;
  url: string;
  headers: TEnvelopeHeaders;
  /** Buffered, never a stream - `ReadableStream` does not transfer in Safari. */
  body?: ArrayBuffer;
}

export interface IBffResponseEnvelope {
  id: string;
  status: number;
  statusText?: string;
  headers: TEnvelopeHeaders;
  body?: ArrayBuffer;
}

/**
 * A custom `Error` subclass loses its name, its own properties and its prototype through structured
 * clone, so an `ApplicationError` cannot cross as itself. It crosses as its normalised shape and is
 * rebuilt with `fromError` on the far side.
 */
export interface IBffErrorEnvelope {
  id: string;
  /**
   * Carried explicitly, because `fromError` defaults a missing one to 400. This envelope is only
   * ever produced when something escaped Hono's `onError` - the 500-class failures a UI must not
   * classify as its own bad request.
   */
  statusCode: number;
  error: { text: string; code?: string; args?: unknown };
}
