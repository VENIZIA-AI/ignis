import { BFF_BASE_PATH, bff } from './bff';

/**
 * Routes the page's own `fetch` into the Worker for anything under the BFF base path, and leaves
 * every other call on the network untouched.
 *
 * This is the whole integration seam. `@minimaltech/ra-core-infra` reaches the network through
 * `NodeFetchNetworkRequest`, which calls the global `fetch` and takes no custom fetcher, so the way
 * to serve react-admin from an in-browser IGNIS application is to answer that `fetch` here rather
 * than to fork the data provider. Nothing in `ra-core-infra` knows a Worker is involved.
 *
 * Installed BEFORE the application boots: the data provider captures nothing at construction, but a
 * request issued while the original `fetch` is still in place would go to the dev server and 404.
 */
export const installBffFetch = (): void => {
  const networkFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    // `new Request()` resolves a relative input against the document base, so `.url` is absolute
    // here even when the caller passed `/api/notes`.
    const request = new Request(input as RequestInfo, init);

    if (!new URL(request.url).pathname.startsWith(BFF_BASE_PATH)) {
      return networkFetch(input as RequestInfo, init);
    }

    return bff.fetch({ request });
  };
};
