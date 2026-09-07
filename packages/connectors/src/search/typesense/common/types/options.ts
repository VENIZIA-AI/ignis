import type { ISearchConnectorCallbacks } from '@/search/core';
import type { ITypesenseNode } from './client';

export interface ITypesenseConnectorOptions extends ISearchConnectorCallbacks {
  name: string;
  nodes: ITypesenseNode[];
  apiKey: string;
  connectionTimeoutSeconds?: number;
  numRetries?: number;
  scope?: string;
  identifier?: string;
}

export interface ITypesenseDataSourceSettings {
  nodes: Array<{ host: string; port: number; protocol?: string }>;
  apiKey: string;
  connectionTimeoutSeconds?: number;
  numRetries?: number;
}
