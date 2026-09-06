import type { TConstValue } from '@venizia/ignis-helpers/common';
import type { RpcErrorCodes } from './constants';

export type TRpcErrorCode = TConstValue<typeof RpcErrorCodes>;

export interface IToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface IToolHandler {
  definition: IToolDefinition;
  call: (opts: { args: unknown }) => Promise<unknown>;
}

/** Fields read off an inbound line; anything else in the payload is ignored. */
export interface IRpcRequest {
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
}

/** `code` is a plain number, not `TRpcErrorCode`: a tool-thrown `RpcError` can carry any code, not only the five reserved ones. */
export interface IRpcError {
  code: number;
  message: string;
}

export interface IRpcResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: IRpcError;
}
