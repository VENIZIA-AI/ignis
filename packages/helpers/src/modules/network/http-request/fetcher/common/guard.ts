import type { IUrlSafetyPolicy } from '@/modules/network/utilities/url-safety/common/types';

/** One hop the guard vetted: the url to send to, and the addresses to connect to (empty: connect as the client would). */
export interface IFetchGuardHop {
  url: URL;
  addresses: string[];
}

/** A guarded call: vets the first url and every redirect target, one hop at a time. */
export interface IFetchGuardRoute {
  vet(opts: { url: string; signal?: AbortSignal }): Promise<IFetchGuardHop>;
}

/**
 * The seam between a fetcher, which is browser-pure, and the url guard, which resolves names with `node:dns`. The server
 * half is `UrlGuard`; a fetcher is handed it as `guardEngine`, so a browser bundle never reaches the resolver.
 */
export interface IFetchGuard {
  createRoute(opts: { policy: IUrlSafetyPolicy }): IFetchGuardRoute;
}
