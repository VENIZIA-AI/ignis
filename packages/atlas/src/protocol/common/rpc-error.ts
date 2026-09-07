/** A client-caused failure a tool's `call` throws; `Transport` maps it straight to a JSON-RPC error with `code`. */
export class RpcError extends Error {
  readonly code: number;

  constructor(opts: { code: number; message: string }) {
    super(opts.message);
    this.code = opts.code;
  }
}
