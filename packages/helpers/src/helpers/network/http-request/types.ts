import { AxiosInstance, AxiosResponse } from 'axios';

export type TFetcherVariant = 'node-fetch' | 'axios';
export type TFetcherResponse<T extends TFetcherVariant> = T extends 'node-fetch'
  ? Response
  : AxiosResponse;

export type TFetcherWorker<T extends TFetcherVariant> = T extends 'axios'
  ? AxiosInstance
  : typeof fetch;
