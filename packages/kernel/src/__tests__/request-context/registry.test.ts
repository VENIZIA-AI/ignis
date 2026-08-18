import { RequestContextRegistry } from '@/base/request-context';
import type { Context } from 'hono';
import { afterEach, describe, expect, test } from 'bun:test';

/** Stands in for a Hono context - `resolve()` hands back whatever the resolver returned, untouched, so only identity matters here. */
const buildContext = (opts: { marker: string }): Context => {
  return { marker: opts.marker } as unknown as Context;
};

/**
 * Three states, not two. `undefined` means THERE IS NO REQUEST CONTEXT; a context that exists but
 * carries no user is a different state, reported by that context's own variables. The user-audit
 * enrichers in `@venizia/ignis-connectors` raise a different error for each, so a registry that
 * collapsed them would change behaviour on a security-adjacent path without failing anything.
 */
describe('RequestContextRegistry - the three states a caller must be able to tell apart', () => {
  afterEach(() => {
    RequestContextRegistry.clearResolver();
  });

  test('state 1a - no resolver installed resolves to undefined', () => {
    expect(RequestContextRegistry.resolve()).toBeUndefined();
  });

  test('state 1b - a resolver that finds no context resolves to undefined, the same answer', () => {
    RequestContextRegistry.setResolver({ resolver: () => undefined });

    expect(RequestContextRegistry.resolve()).toBeUndefined();
  });

  test('state 2 - a resolver that finds a context hands back that exact object', () => {
    const context = buildContext({ marker: 'live-request' });
    RequestContextRegistry.setResolver({ resolver: () => context });

    expect(RequestContextRegistry.resolve()).toBe(context);
  });

  test('clearResolver puts the registry back into state 1a, not into an empty-context state', () => {
    RequestContextRegistry.setResolver({ resolver: () => buildContext({ marker: 'live' }) });
    RequestContextRegistry.clearResolver();

    expect(RequestContextRegistry.resolve()).toBeUndefined();
  });

  test('the last resolver installed wins - a second install replaces, never stacks', () => {
    const first = buildContext({ marker: 'first' });
    const second = buildContext({ marker: 'second' });

    RequestContextRegistry.setResolver({ resolver: () => first });
    RequestContextRegistry.setResolver({ resolver: () => second });

    expect(RequestContextRegistry.resolve()).toBe(second);
  });

  /**
   * The resolver is a live read, not a cached one. Caching the first answer would freeze one
   * request's context for the whole process - every later request would stamp the first request's
   * user, and every test would still pass because the first answer is always correct.
   */
  test('the resolver is called on every resolve, so each request sees its own context', () => {
    const contexts = [buildContext({ marker: 'request-1' }), buildContext({ marker: 'request-2' })];
    let calls = 0;

    RequestContextRegistry.setResolver({
      resolver: () => {
        const context = contexts[calls];
        calls += 1;
        return context;
      },
    });

    expect(RequestContextRegistry.resolve()).toBe(contexts[0]);
    expect(RequestContextRegistry.resolve()).toBe(contexts[1]);
    expect(calls).toBe(2);
  });

  /** A resolver installed and then cleared must not leave the previous one reachable behind it. */
  test('installing, clearing and installing again resolves through the newest resolver only', () => {
    const first = buildContext({ marker: 'first' });
    RequestContextRegistry.setResolver({ resolver: () => first });
    RequestContextRegistry.clearResolver();

    const second = buildContext({ marker: 'second' });
    RequestContextRegistry.setResolver({ resolver: () => second });

    expect(RequestContextRegistry.resolve()).toBe(second);
  });
});
