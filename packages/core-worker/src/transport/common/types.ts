export interface IBffTransport {
  fetch(opts: { request: Request }): Promise<Response>;
}
