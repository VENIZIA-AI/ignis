import {
  DomainHierarchyGraph,
  DomainHierarchyStore,
} from '@/components/auth/authorize/enforcers/domain-hierarchy';
import { describe, expect, it } from 'bun:test';
import { expectRejection } from '../rejection.helper';

/** Flush the microtask/macrotask queue so a fire-and-forget async chain (e.g. refreshIfStale) has a chance to settle. */
const flush = async (): Promise<void> => {
  await new Promise<void>(resolve => setTimeout(resolve, 0));
};

describe('DomainHierarchyGraph', () => {
  it('treats a node as a descendant of itself even when unknown to the graph', () => {
    const graph = new DomainHierarchyGraph({ edges: [] });
    expect(graph.isDescendantOf({ descendant: 'A', ancestor: 'A' })).toBe(true);
  });

  it('walks multiple hops: Merchant -> Organizer -> Group', () => {
    const graph = new DomainHierarchyGraph({
      edges: [
        { child: 'Merchant_123', parent: 'Organizer_456' },
        { child: 'Organizer_456', parent: 'Group_789' },
      ],
    });
    expect(graph.isDescendantOf({ descendant: 'Merchant_123', ancestor: 'Group_789' })).toBe(true);
  });

  it('is strict about direction: a parent is not a descendant of its child', () => {
    const graph = new DomainHierarchyGraph({
      edges: [{ child: 'Merchant_123', parent: 'Organizer_456' }],
    });
    expect(graph.isDescendantOf({ descendant: 'Merchant_123', ancestor: 'Organizer_456' })).toBe(
      true,
    );
    expect(graph.isDescendantOf({ descendant: 'Organizer_456', ancestor: 'Merchant_123' })).toBe(
      false,
    );
  });

  it('never matches siblings sharing the same parent', () => {
    const graph = new DomainHierarchyGraph({
      edges: [
        { child: 'Merchant_1', parent: 'Organizer' },
        { child: 'Merchant_2', parent: 'Organizer' },
      ],
    });
    expect(graph.isDescendantOf({ descendant: 'Merchant_1', ancestor: 'Merchant_2' })).toBe(false);
  });

  it('terminates on a cycle without hanging', () => {
    const graph = new DomainHierarchyGraph({
      edges: [
        { child: 'A', parent: 'B' },
        { child: 'B', parent: 'A' },
      ],
    });
    expect(graph.isDescendantOf({ descendant: 'A', ancestor: 'B' })).toBe(true);
    expect(graph.isDescendantOf({ descendant: 'A', ancestor: 'Missing' })).toBe(false);
  });

  it('terminates on a self-edge without hanging', () => {
    const graph = new DomainHierarchyGraph({ edges: [{ child: 'A', parent: 'A' }] });
    expect(graph.isDescendantOf({ descendant: 'A', ancestor: 'A' })).toBe(true);
    expect(graph.isDescendantOf({ descendant: 'A', ancestor: 'Missing' })).toBe(false);
  });

  it('returns false for an unknown node against a known ancestor, and ancestorsOf returns just the node', () => {
    const graph = new DomainHierarchyGraph({
      edges: [{ child: 'Merchant_123', parent: 'Organizer_456' }],
    });
    expect(graph.isDescendantOf({ descendant: 'Ghost', ancestor: 'Organizer_456' })).toBe(false);
    expect(graph.ancestorsOf({ node: 'Ghost' })).toEqual(['Ghost']);
  });

  it('visits a diamond ancestor once and still resolves true', () => {
    const graph = new DomainHierarchyGraph({
      edges: [
        { child: 'Merchant', parent: 'Organizer1' },
        { child: 'Merchant', parent: 'Organizer2' },
        { child: 'Organizer1', parent: 'Group' },
        { child: 'Organizer2', parent: 'Group' },
      ],
    });
    expect(graph.isDescendantOf({ descendant: 'Merchant', ancestor: 'Group' })).toBe(true);

    const ancestors = graph.ancestorsOf({ node: 'Merchant' });
    expect(ancestors[0]).toBe('Merchant');
    expect(ancestors.filter(node => node === 'Group')).toHaveLength(1);
    expect(new Set(ancestors)).toEqual(new Set(['Merchant', 'Organizer1', 'Organizer2', 'Group']));
  });

  it('ancestorsOf returns the node itself first, then ancestors nearest first', () => {
    const graph = new DomainHierarchyGraph({
      edges: [
        { child: 'Merchant_123', parent: 'Organizer_456' },
        { child: 'Organizer_456', parent: 'Group_789' },
      ],
    });
    expect(graph.ancestorsOf({ node: 'Merchant_123' })).toEqual([
      'Merchant_123',
      'Organizer_456',
      'Group_789',
    ]);
  });

  it('reports nodeCount and edgeCount', () => {
    const graph = new DomainHierarchyGraph({
      edges: [
        { child: 'Merchant_123', parent: 'Organizer_456' },
        { child: 'Organizer_456', parent: 'Group_789' },
      ],
    });
    expect(graph.nodeCount).toBe(3);
    expect(graph.edgeCount).toBe(2);
  });

  it('reports zero nodeCount and edgeCount for an empty graph', () => {
    const graph = new DomainHierarchyGraph({ edges: [] });
    expect(graph.nodeCount).toBe(0);
    expect(graph.edgeCount).toBe(0);
  });
});

describe('DomainHierarchyStore', () => {
  it('throws a clear error when graph is read before warmup()', () => {
    const store = new DomainHierarchyStore({ load: async () => [] });
    expect(() => store.graph).toThrow();
  });

  it('warmup() loads the first snapshot and graph() reflects it', async () => {
    const store = new DomainHierarchyStore({
      load: async () => [{ child: 'Merchant_123', parent: 'Organizer_456' }],
    });
    await store.warmup();
    expect(
      store.graph.isDescendantOf({ descendant: 'Merchant_123', ancestor: 'Organizer_456' }),
    ).toBe(true);
  });

  it('warmup() throws (fail-closed) when the initial load rejects', async () => {
    const store = new DomainHierarchyStore({
      load: async () => {
        throw new Error('boot load boom');
      },
    });
    await expectRejection({ task: store.warmup(), message: /.*/ });
    expect(() => store.graph).toThrow();
  });

  it('refreshIfStale() does not reload before the TTL', async () => {
    let loadCalls = 0;
    const store = new DomainHierarchyStore({
      load: async () => {
        loadCalls += 1;
        return [{ child: 'A', parent: 'B' }];
      },
      refreshMs: 60_000,
    });
    await store.warmup();
    expect(loadCalls).toBe(1);

    store.refreshIfStale();
    await flush();
    expect(loadCalls).toBe(1);
  });

  it('refreshIfStale() reloads once the TTL has expired', async () => {
    let loadCalls = 0;
    const store = new DomainHierarchyStore({
      load: async () => {
        loadCalls += 1;
        return [{ child: 'A', parent: 'B' }];
      },
      refreshMs: 0,
    });
    await store.warmup();
    expect(loadCalls).toBe(1);

    store.refreshIfStale();
    await flush();
    expect(loadCalls).toBe(2);
  });

  it('refreshIfStale() never throws when load rejects, and keeps the previous snapshot', async () => {
    let loadCalls = 0;
    const store = new DomainHierarchyStore({
      load: async () => {
        loadCalls += 1;
        if (loadCalls === 1) {
          return [{ child: 'A', parent: 'B' }];
        }
        throw new Error('reload boom');
      },
      refreshMs: 0,
    });
    await store.warmup();

    expect(() => store.refreshIfStale()).not.toThrow();
    await flush();

    expect(loadCalls).toBe(2);
    // Previous snapshot must still be intact after the failed reload.
    expect(store.graph.isDescendantOf({ descendant: 'A', ancestor: 'B' })).toBe(true);
  });

  it('collapses concurrent refreshIfStale() calls onto exactly one load() call', async () => {
    let loadCalls = 0;
    const store = new DomainHierarchyStore({
      load: async () => {
        loadCalls += 1;
        return [{ child: 'A', parent: 'B' }];
      },
      refreshMs: 0,
    });
    await store.warmup();
    expect(loadCalls).toBe(1);

    store.refreshIfStale();
    store.refreshIfStale();
    store.refreshIfStale();
    await flush();

    // 1 from warmup() + exactly 1 collapsed reload, not 3.
    expect(loadCalls).toBe(2);
  });

  it('reload() forces a reload ignoring the TTL', async () => {
    let loadCalls = 0;
    const store = new DomainHierarchyStore({
      load: async () => {
        loadCalls += 1;
        return [{ child: 'A', parent: `Parent_${loadCalls}` }];
      },
      refreshMs: 60_000,
    });
    await store.warmup();
    expect(store.graph.isDescendantOf({ descendant: 'A', ancestor: 'Parent_1' })).toBe(true);

    await store.reload();
    expect(loadCalls).toBe(2);
    expect(store.graph.isDescendantOf({ descendant: 'A', ancestor: 'Parent_2' })).toBe(true);
  });

  it('reload() collapses concurrent callers onto one in-flight load()', async () => {
    let loadCalls = 0;
    const store = new DomainHierarchyStore({
      load: async () => {
        loadCalls += 1;
        await flush();
        return [{ child: 'A', parent: 'B' }];
      },
      refreshMs: 60_000,
    });
    await store.warmup();
    expect(loadCalls).toBe(1);

    const [first, second] = await Promise.all([store.reload(), store.reload()]);
    expect(first).toBeUndefined();
    expect(second).toBeUndefined();
    expect(loadCalls).toBe(2);
  });

  it('destroy() stops further background reloads', async () => {
    let loadCalls = 0;
    const store = new DomainHierarchyStore({
      load: async () => {
        loadCalls += 1;
        return [{ child: 'A', parent: 'B' }];
      },
      refreshMs: 0,
    });
    await store.warmup();
    store.destroy();

    store.refreshIfStale();
    await flush();
    expect(loadCalls).toBe(1);
  });

  // Defect 1: a failed background reload must not be retried on every single call - only once per refreshMs.
  it('produces exactly ONE load() call across many refreshIfStale() invocations while load keeps failing', async () => {
    let loadCalls = 0;
    const store = new DomainHierarchyStore({
      load: async () => {
        loadCalls += 1;
        throw new Error('database unhealthy');
      },
      refreshMs: 60_000,
    });

    // Simulates many enforce() calls over time, each hitting syncedHasLink -> refreshIfStale(),
    // with real async gaps between them so the failed pendingReload has settled by the next call.
    for (let i = 0; i < 20; i += 1) {
      store.refreshIfStale();
      await flush();
    }

    expect(loadCalls).toBe(1);
  });

  it('retries a failing background reload again once refreshMs has elapsed', async () => {
    let loadCalls = 0;
    const store = new DomainHierarchyStore({
      load: async () => {
        loadCalls += 1;
        throw new Error('database unhealthy');
      },
      refreshMs: 10,
    });

    store.refreshIfStale();
    await flush();
    expect(loadCalls).toBe(1);

    await new Promise<void>(resolve => setTimeout(resolve, 20));

    store.refreshIfStale();
    await flush();
    expect(loadCalls).toBe(2);
  });
});

describe('DomainHierarchyStore - maxStaleMs (defect 3)', () => {
  it('serves the previous snapshot indefinitely when maxStaleMs is unset', async () => {
    const store = new DomainHierarchyStore({
      load: async () => [{ child: 'A', parent: 'B' }],
      refreshMs: 60_000,
    });
    await store.warmup();

    await new Promise<void>(resolve => setTimeout(resolve, 30));

    expect(store.graph.isDescendantOf({ descendant: 'A', ancestor: 'B' })).toBe(true);
  });

  it('graph getter returns an EMPTY graph once the snapshot outlives maxStaleMs', async () => {
    const store = new DomainHierarchyStore({
      load: async () => [{ child: 'A', parent: 'B' }],
      refreshMs: 60_000,
      maxStaleMs: 10,
    });
    await store.warmup();
    expect(store.graph.isDescendantOf({ descendant: 'A', ancestor: 'B' })).toBe(true);

    await new Promise<void>(resolve => setTimeout(resolve, 30));

    expect(store.graph.nodeCount).toBe(0);
    expect(store.graph.edgeCount).toBe(0);
    expect(store.graph.isDescendantOf({ descendant: 'A', ancestor: 'B' })).toBe(false);
    // Self-match is intrinsic to isDescendantOf and survives even an empty graph.
    expect(store.graph.isDescendantOf({ descendant: 'A', ancestor: 'A' })).toBe(true);
  });

  it('never throws when the ceiling is crossed - degrades to empty instead', async () => {
    const store = new DomainHierarchyStore({
      load: async () => [{ child: 'A', parent: 'B' }],
      refreshMs: 60_000,
      maxStaleMs: 5,
    });
    await store.warmup();

    await new Promise<void>(resolve => setTimeout(resolve, 20));

    expect(() => store.graph).not.toThrow();
  });

  it('logs the ceiling breach once per episode, then again after it recurs past the next reload', async () => {
    const store = new DomainHierarchyStore({
      load: async () => [{ child: 'A', parent: 'B' }],
      refreshMs: 60_000,
      maxStaleMs: 10,
    });
    await store.warmup();

    const errorCalls: unknown[][] = [];
    const fakeLogger: typeof store.logger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: (...args: unknown[]) => {
        errorCalls.push(args);
      },
      emerg: () => {},
      log: () => {},
      for: () => fakeLogger,
    };
    store.logger = fakeLogger;

    await new Promise<void>(resolve => setTimeout(resolve, 30));
    expect(store.graph.nodeCount).toBe(0);
    expect(store.graph.nodeCount).toBe(0);
    expect(store.graph.nodeCount).toBe(0);
    expect(errorCalls.length).toBe(1);

    // A successful reload resets the flag; the NEXT staleness episode logs again exactly once.
    await store.reload();
    expect(errorCalls.length).toBe(1);

    await new Promise<void>(resolve => setTimeout(resolve, 30));
    expect(store.graph.nodeCount).toBe(0);
    expect(store.graph.nodeCount).toBe(0);
    expect(errorCalls.length).toBe(2);
  });
});
