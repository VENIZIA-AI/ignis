import type { Context } from 'hono';

/**
 * Reads the host's ambient request context, synchronously. `undefined` means THERE IS NO REQUEST
 * CONTEXT - a distinct state from a context that carries no user, and callers act on the difference.
 */
export type TRequestContextResolver = () => Context | undefined;
