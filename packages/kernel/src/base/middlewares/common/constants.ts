/**
 * Restates `hono/request-id`'s own augmentation so it reaches every consumer of this package.
 *
 * The augmentation only applies where `hono/request-id` is in the program, and since the middleware
 * moved into `RestApplication.registerDefaultMiddlewares()` no consumer imports it any more - which
 * silently untypes `context.get(REQUEST_ID_KEY)` for them. Identical member, so it merges rather
 * than conflicts wherever both are loaded.
 */
declare module 'hono' {
  interface ContextVariableMap {
    requestId: string;
  }
}

/** Hono context key the request id is stamped under; not-found and app-error read the same key so all three agree on one identifier. */
export const REQUEST_ID_KEY = 'requestId';
