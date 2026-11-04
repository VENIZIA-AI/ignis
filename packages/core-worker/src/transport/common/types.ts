/** The contract a BFF transport fulfils: turns a `Request` into a `Response`, wherever the server runs. */
export interface IBffTransport {
  fetch(opts: { request: Request }): Promise<Response>;
}
