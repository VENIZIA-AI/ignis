/**
 * `fetchGuarded` as the tests of the guard wrote it before the guard moved into the fetchers: one call, a policy, an
 * engine. It is a `NativeFetcher` with a `guard`, so these tests exercise the real pipeline.
 */

import type { THttpMethod } from '@/common/constants/http';
import type { IFetchGuard } from '@/modules/network/http-request/fetcher/common/guard';
import { NativeFetcher } from '@/modules/network/http-request/fetcher/native-fetcher';
import type { IUrlSafetyPolicy } from '@/modules/network/utilities/url-safety/common/types';

export const createFetchGuarded = (opts: { engine: IFetchGuard }) => {
  return (call: {
    url: string;
    policy?: IUrlSafetyPolicy;
    method?: THttpMethod;
    headers?: Record<string, string>;
    body?: string | Uint8Array;
    signal?: AbortSignal;
  }) =>
    new NativeFetcher({ name: 'guarded-test', guardEngine: opts.engine }).send({
      url: call.url,
      method: call.method,
      headers: call.headers,
      body: call.body,
      signal: call.signal,
      guard: call.policy ?? {},
      // The tests read the answer whatever its status: the typed error is what they assert on, so keep the default.
    });
};
