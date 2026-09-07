/** JSON-RPC 2.0 reserved error codes (https://www.jsonrpc.org/specification#error_object). */
export class RpcErrorCodes {
  static readonly PARSE = -32700;
  static readonly INVALID_REQUEST = -32600;
  static readonly METHOD_NOT_FOUND = -32601;
  static readonly INVALID_PARAMS = -32602;
  static readonly INTERNAL = -32603;
}
