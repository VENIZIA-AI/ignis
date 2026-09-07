import type { AxiosInstance, AxiosResponse } from 'axios';
import type { TFetcherVariant } from '../../common';

export type TFetcherResponse<T extends TFetcherVariant> = T extends 'node-fetch'
  ? Response
  : AxiosResponse;

export type TFetcherWorker<T extends TFetcherVariant> = T extends 'axios'
  ? AxiosInstance
  : typeof fetch;
