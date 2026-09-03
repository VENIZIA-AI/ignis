import { getError } from '@venizia/ignis-helpers/core';
import type { IBffTransport } from './common/types';

/**
 * Marks the patched `fetch` so a second install is refused rather than silently stacking. `Symbol.for`
 * and not a private symbol: two copies of this package in one page must still see each other's mark.
 */
const BRIDGE_MARKER = Symbol.for('@venizia/ignis-worker/bff-fetch');

type TFetch = typeof globalThis.fetch;

/** The carrier whose `fetch` is replaced - `globalThis` in a page, an object a test controls otherwise. */
interface IFetchCarrier {
  fetch: TFetch;
}

export interface IInstallBffFetchOptions {
  /** Anything implementing the transport contract, so an in-process transport works in a test. */
  transport: IBffTransport;
  /**
   * Path prefixes the BFF owns, matched against the request's PATHNAME. Everything else is passed
   * to the original `fetch` untouched.
   */
  basePath: string | Array<string>;
  /** Defaults to `globalThis`. */
  carrier?: IFetchCarrier;
}

/**
 * Resolves a request's absolute URL WITHOUT constructing a `Request`.
 *
 * This is the whole reason this helper exists rather than one obvious line. `new Request(input)`,
 * where `input` is a `Request` carrying a body, marks that body disturbed - so building one just to
 * read `.url` breaks the very pass-through it is deciding about: the next line hands the same, now
 * unreadable, request to the network.
 *
 * Measured, because the runtimes disagree. Chromium:
 *
 *     original.bodyUsed            // false
 *     new Request(original)
 *     original.bodyUsed            // true
 *     await original.text()        // TypeError: body stream already read
 *
 * Bun does NOT disturb it, so the unit tests pass either way and cannot guard this. The browser is
 * where this code runs, so the browser is the behaviour to write for.
 */
const resolveRequestUrl = (input: RequestInfo | URL): string => {
  if (typeof input === 'string') {
    return new URL(input, globalThis.location?.href).href;
  }

  if (input instanceof URL) {
    return input.href;
  }

  return input.url;
};

const toPrefixList = (basePath: string | Array<string>): Array<string> => {
  const prefixes = (Array.isArray(basePath) ? basePath : [basePath]).filter(
    prefix => prefix.length > 0,
  );

  if (prefixes.length === 0) {
    throw getError({
      message:
        '[installBffFetch] Invalid basePath | At least one non-empty path prefix is required',
    });
  }

  return prefixes;
};

/**
 * Routes the page's own `fetch` into a BFF transport for anything under `basePath`, and leaves every
 * other call on the network untouched.
 *
 * This is the seam that lets an existing HTTP client talk to an in-browser IGNIS application without
 * knowing one exists. A data provider, an SDK or a generated client reaches the network through the
 * global `fetch` and usually accepts no custom fetcher, so answering that `fetch` is the only place
 * an in-browser backend becomes a drop-in swap rather than a fork of the client.
 *
 * Install it BEFORE the application that will use it boots: a request issued while the original
 * `fetch` is still in place leaves the page and 404s against whatever is serving it.
 *
 * @returns The uninstall function. It restores the previous `fetch` only if this bridge is still the
 * installed one - if something patched `fetch` afterwards, restoring would silently discard that.
 */
export const installBffFetch = (opts: IInstallBffFetchOptions): (() => void) => {
  const { transport, basePath } = opts;
  const carrier = opts.carrier ?? (globalThis as unknown as IFetchCarrier);

  const prefixes = toPrefixList(basePath);
  const previousFetch = carrier.fetch;

  if (Object.getOwnPropertyDescriptor(previousFetch, BRIDGE_MARKER)) {
    throw getError({
      message:
        '[installBffFetch] A BFF fetch bridge is already installed | Uninstall it first, or pass every prefix to a single install',
    });
  }

  const networkFetch = previousFetch.bind(carrier) as TFetch;

  const bridged = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const { pathname } = new URL(resolveRequestUrl(input));

    if (!prefixes.some(prefix => pathname.startsWith(prefix))) {
      return networkFetch(input, init);
    }

    // Constructed only now, on the branch that owns the request - so the pass-through above never
    // disturbs a body it is about to hand to the network.
    return transport.fetch({ request: new Request(input, init) });
  };

  // Whatever the runtime hung on `fetch` comes along - Bun puts `preconnect` there, and a
  // replacement that dropped it would break any caller reaching for it. Copying the descriptors is
  // also what makes this satisfy `typeof fetch` rather than merely resembling it.
  Object.defineProperties(bridged, Object.getOwnPropertyDescriptors(previousFetch));
  Object.defineProperty(bridged, BRIDGE_MARKER, { value: true });

  carrier.fetch = bridged as TFetch;

  return () => {
    if (carrier.fetch !== bridged) {
      return;
    }

    carrier.fetch = previousFetch;
  };
};
