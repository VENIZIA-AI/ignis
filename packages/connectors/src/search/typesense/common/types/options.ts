import type { ISearchConnectorCallbacks } from '@/search/core';
import type { ITypesenseClientLike, ITypesenseNode } from './client';

/** Options of `TypesenseConnector`. `connectionTimeoutSeconds` defaults to 5 and applies to the whole client. */
export interface ITypesenseConnectorOptions extends ISearchConnectorCallbacks {
  name: string;
  nodes: ITypesenseNode[];
  apiKey: string;
  connectionTimeoutSeconds?: number;
  numRetries?: number;
  scope?: string;
  identifier?: string;
  /**
   * Builds the client of one call that sets `timeoutMs`: `typesense-js` has one timeout per client, so a per-call
   * timeout runs on its own client with `connectionTimeoutSeconds` set. The default builds a `Client` from `nodes`,
   * `apiKey` and `numRetries`; pass it when you inject your own `client` (a test fake, a wrapped client).
   */
  createClient?: (opts: { connectionTimeoutSeconds: number }) => ITypesenseClientLike;
}

/** What a call can say about itself. */
export interface ITypesenseCallOptions {
  /**
   * Overrides the client's `connectionTimeoutSeconds` (5 s by default) for this call: a positive integer of milliseconds.
   * It is how long to wait for the engine's answer and, once a body is arriving, the longest silence before the call fails;
   * it is not a deadline for the whole transfer. A call that answers late (an import, a schema change) needs it; a stream
   * whose reader pauses (an import of each batch, a slow disk) needs it larger than the longest pause.
   */
  timeoutMs?: number;
}

/** Datasource `config` for Typesense: server nodes, API key, and the client's timeout and retry settings. */
export interface ITypesenseDataSourceSettings {
  nodes: Array<{ host: string; port: number; protocol?: string }>;
  apiKey: string;
  connectionTimeoutSeconds?: number;
  numRetries?: number;
}
