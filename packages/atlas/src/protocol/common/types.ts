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

export interface IRpcError {
  code: TRpcErrorCode;
  message: string;
}

export interface IRpcResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: IRpcError;
}
