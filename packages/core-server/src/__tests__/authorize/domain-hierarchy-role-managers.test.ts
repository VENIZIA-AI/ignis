import { DomainHierarchyRoleManager } from '@/components/auth/authorize/enforcers/domain-hierarchy-role-manager';
import { MembershipRoleManager } from '@/components/auth/authorize/enforcers/membership-role-manager';
import { describe, expect, it } from 'bun:test';
import type { ILogger } from '@venizia/ignis-helpers/core';

type TFakeEdge = { child: string; parent: string };

/**
 * Hand-rolled stand-ins for DomainHierarchyGraph/DomainHierarchyStore mirroring only their
 * documented public contract, so these tests never depend on the sibling implementation file.
 * DomainHierarchyStore/Graph carry private fields, so passing these to the real constructor
 * types needs a plain `as any` - the two shapes are structurally identical but nominally distinct.
 */
class FakeDomainHierarchyGraph {
  private readonly parents = new Map<string, Set<string>>();
  private readonly nodes = new Set<string>();

  constructor(edges: TFakeEdge[]) {
    for (const edge of edges) {
      this.nodes.add(edge.child);
      this.nodes.add(edge.parent);

      const existing = this.parents.get(edge.child);
      if (existing) {
        existing.add(edge.parent);
      } else {
        this.parents.set(edge.child, new Set<string>([edge.parent]));
      }
    }
  }

  isDescendantOf(opts: { descendant: string; ancestor: string }): boolean {
    const { descendant, ancestor } = opts;
    if (descendant === ancestor) {
      return true;
    }

    const visited = new Set<string>([descendant]);
    const queue: string[] = [descendant];

    let head = 0;
    while (head < queue.length) {
      const current = queue[head];
      head += 1;

      const parents = this.parents.get(current);
      if (!parents) {
        continue;
      }

      for (const parent of parents) {
        if (parent === ancestor) {
          return true;
        }
        if (!visited.has(parent)) {
          visited.add(parent);
          queue.push(parent);
        }
      }
    }

    return false;
  }

  ancestorsOf(opts: { node: string }): string[] {
    const { node } = opts;
    const result: string[] = [node];
    const visited = new Set<string>([node]);
    const queue: string[] = [node];

    let head = 0;
    while (head < queue.length) {
      const current = queue[head];
      head += 1;

      const parents = this.parents.get(current);
      if (!parents) {
        continue;
      }

      for (const parent of parents) {
        if (!visited.has(parent)) {
          visited.add(parent);
          result.push(parent);
          queue.push(parent);
        }
      }
    }

    return result;
  }

  get nodeCount(): number {
    return this.nodes.size;
  }

  get edgeCount(): number {
    let count = 0;
    for (const set of this.parents.values()) {
      count += set.size;
    }
    return count;
  }
}

class FakeDomainHierarchyStore {
  readonly graph: FakeDomainHierarchyGraph;
  refreshCalls = 0;

  constructor(edges: TFakeEdge[] = []) {
    this.graph = new FakeDomainHierarchyGraph(edges);
  }

  refreshIfStale(): void {
    this.refreshCalls += 1;
  }
}

const noopLogger = (): ILogger => {
  const noop = (): void => {};
  const logger: ILogger = {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    emerg: noop,
    log: noop,
    for: () => logger,
  };
  return logger;
};

describe('DomainHierarchyRoleManager', () => {
  const merchantUnderOrganizer = (): FakeDomainHierarchyStore =>
    new FakeDomainHierarchyStore([{ child: 'Merchant_123', parent: 'Organizer_456' }]);

  describe('non-reversed (g3 axis)', () => {
    it('treats a domain as linked to itself even when it is unknown to the graph', () => {
      const manager = new DomainHierarchyRoleManager({
        store: new FakeDomainHierarchyStore() as any,
      });
      expect(manager.syncedHasLink('Ghost_Domain', 'Ghost_Domain')).toBe(true);
    });

    it('resolves a shared-graph descendant edge', () => {
      const manager = new DomainHierarchyRoleManager({
        store: merchantUnderOrganizer() as any,
      });
      expect(manager.syncedHasLink('Merchant_123', 'Organizer_456')).toBe(true);
    });

    it('does not resolve the reverse direction of a shared-graph edge', () => {
      const manager = new DomainHierarchyRoleManager({
        store: merchantUnderOrganizer() as any,
      });
      expect(manager.syncedHasLink('Organizer_456', 'Merchant_123')).toBe(false);
    });

    it('returns false for a domain with no edge to the target', () => {
      const manager = new DomainHierarchyRoleManager({
        store: merchantUnderOrganizer() as any,
      });
      expect(manager.syncedHasLink('Merchant_999', 'Organizer_456')).toBe(false);
    });
  });

  describe('reversed mode (g axis domain hierarchy)', () => {
    it('flips the direct-edge and reverse-direction results', () => {
      const manager = new DomainHierarchyRoleManager({
        store: merchantUnderOrganizer() as any,
        reversed: true,
      });

      expect(manager.syncedHasLink('Merchant_123', 'Organizer_456')).toBe(false);
      expect(manager.syncedHasLink('Organizer_456', 'Merchant_123')).toBe(true);
    });

    it('still returns false for domains with no edge either way', () => {
      const manager = new DomainHierarchyRoleManager({
        store: merchantUnderOrganizer() as any,
        reversed: true,
      });
      expect(manager.syncedHasLink('Merchant_999', 'Organizer_456')).toBe(false);
    });

    it('still treats a domain as linked to itself', () => {
      const manager = new DomainHierarchyRoleManager({
        store: new FakeDomainHierarchyStore() as any,
        reversed: true,
      });
      expect(manager.syncedHasLink('Ghost_Domain', 'Ghost_Domain')).toBe(true);
    });
  });

  describe('overlay (per-principal g3 policy lines fed through addLink)', () => {
    it('honours an edge added only through addLink', async () => {
      const manager = new DomainHierarchyRoleManager({
        store: merchantUnderOrganizer() as any,
      });

      await manager.addLink('Merchant_777', 'Organizer_888');
      expect(manager.syncedHasLink('Merchant_777', 'Organizer_888')).toBe(true);
    });

    it('clear() drops the overlay edge while the shared-graph answer survives', async () => {
      const manager = new DomainHierarchyRoleManager({
        store: merchantUnderOrganizer() as any,
      });

      await manager.addLink('Merchant_777', 'Organizer_888');
      await manager.clear();

      expect(manager.syncedHasLink('Merchant_777', 'Organizer_888')).toBe(false);
      expect(manager.syncedHasLink('Merchant_123', 'Organizer_456')).toBe(true);
    });

    it('addLink called twice with the same pair does not corrupt the walk', async () => {
      const manager = new DomainHierarchyRoleManager({
        store: merchantUnderOrganizer() as any,
      });

      await manager.addLink('Merchant_777', 'Organizer_888');
      await manager.addLink('Merchant_777', 'Organizer_888');

      expect(manager.syncedHasLink('Merchant_777', 'Organizer_888')).toBe(true);
      expect(await manager.getRoles('Merchant_777')).toEqual(['Organizer_888']);
    });

    it('walks a chain that mixes an overlay edge with a shared-graph edge', async () => {
      const manager = new DomainHierarchyRoleManager({
        store: merchantUnderOrganizer() as any,
      });

      // Overlay edge Merchant_123 -> Group_999 on top of the shared Merchant_123 -> Organizer_456 edge.
      await manager.addLink('Merchant_123', 'Group_999');
      expect(manager.syncedHasLink('Merchant_123', 'Group_999')).toBe(true);
      expect(manager.syncedHasLink('Merchant_123', 'Organizer_456')).toBe(true);
    });

    it('terminates on a cycle introduced through addLink', async () => {
      const manager = new DomainHierarchyRoleManager({
        store: new FakeDomainHierarchyStore() as any,
      });

      await manager.addLink('A', 'B');
      await manager.addLink('B', 'C');
      await manager.addLink('C', 'A');

      expect(manager.syncedHasLink('A', 'C')).toBe(true);
      expect(manager.syncedHasLink('A', 'Missing')).toBe(false);
    });
  });

  it('calls store.refreshIfStale() on every syncedHasLink call', () => {
    const store = new FakeDomainHierarchyStore();
    const manager = new DomainHierarchyRoleManager({ store: store as any });

    manager.syncedHasLink('Merchant_123', 'Merchant_123');
    manager.syncedHasLink('Merchant_123', 'Merchant_123');

    expect(store.refreshCalls).toBe(2);
  });

  it('emits the graph-size debug log once per build, again after clear()', async () => {
    const manager = new DomainHierarchyRoleManager({
      store: merchantUnderOrganizer() as any,
    });

    const debugCalls: unknown[][] = [];
    const logger = noopLogger();
    logger.debug = (...args: unknown[]): void => {
      debugCalls.push(args);
    };
    manager.logger = logger;

    manager.syncedHasLink('Merchant_123', 'Organizer_456');
    manager.syncedHasLink('Merchant_123', 'Organizer_456');
    expect(debugCalls.length).toBe(1);

    await manager.clear();
    debugCalls.length = 0;

    manager.syncedHasLink('Merchant_123', 'Organizer_456');
    expect(debugCalls.length).toBe(1);
  });
});

describe('DomainHierarchyRoleManager - shared overlay (defect 4)', () => {
  it('an edge added via addLink on the non-reversed (g3) instance is visible, reversed, on the reversed (g) instance', async () => {
    const sharedOverlay = new Map<string, Set<string>>();
    const store = new FakeDomainHierarchyStore() as any;

    const g3Manager = new DomainHierarchyRoleManager({ store, overlay: sharedOverlay });
    const gManager = new DomainHierarchyRoleManager({
      store,
      reversed: true,
      overlay: sharedOverlay,
    });

    await g3Manager.addLink('Merchant_123', 'Organizer_456');

    // g3's own convention: syncedHasLink(child, parent).
    expect(g3Manager.syncedHasLink('Merchant_123', 'Organizer_456')).toBe(true);
    // g's convention is the opposite order (syncedHasLink(storedDomain, requestDomain)).
    expect(gManager.syncedHasLink('Organizer_456', 'Merchant_123')).toBe(true);
  });

  it('clear() on the non-reversed instance drops the edge for both instances', async () => {
    const sharedOverlay = new Map<string, Set<string>>();
    const store = new FakeDomainHierarchyStore() as any;

    const g3Manager = new DomainHierarchyRoleManager({ store, overlay: sharedOverlay });
    const gManager = new DomainHierarchyRoleManager({
      store,
      reversed: true,
      overlay: sharedOverlay,
    });

    await g3Manager.addLink('Merchant_123', 'Organizer_456');
    await g3Manager.clear();

    expect(g3Manager.syncedHasLink('Merchant_123', 'Organizer_456')).toBe(false);
    expect(gManager.syncedHasLink('Organizer_456', 'Merchant_123')).toBe(false);
  });

  it('without an explicit overlay, each instance still gets its own (back-compat for any other caller)', async () => {
    const store = new FakeDomainHierarchyStore() as any;

    const first = new DomainHierarchyRoleManager({ store });
    const second = new DomainHierarchyRoleManager({ store });

    await first.addLink('Merchant_123', 'Organizer_456');

    expect(first.syncedHasLink('Merchant_123', 'Organizer_456')).toBe(true);
    expect(second.syncedHasLink('Merchant_123', 'Organizer_456')).toBe(false);
  });
});

describe('MembershipRoleManager', () => {
  const twoOrganizers = (): FakeDomainHierarchyStore =>
    new FakeDomainHierarchyStore([
      { child: 'Merchant_123', parent: 'Organizer_456' },
      { child: 'Merchant_999', parent: 'Organizer_789' },
    ]);

  it('a user who joined the parent organizer is a member of its child merchant', async () => {
    const manager = new MembershipRoleManager({ store: twoOrganizers() as any });
    await manager.addLink('User_7', 'Organizer_456');

    expect(manager.syncedHasLink('User_7', 'Merchant_123')).toBe(true);
  });

  it("a user who joined one organizer is not a member of a different organizer's merchant", async () => {
    const manager = new MembershipRoleManager({ store: twoOrganizers() as any });
    await manager.addLink('User_7', 'Organizer_456');

    expect(manager.syncedHasLink('User_7', 'Merchant_999')).toBe(false);
  });

  it('a user who joined one organizer is not a member of a different organizer directly', async () => {
    const manager = new MembershipRoleManager({ store: twoOrganizers() as any });
    await manager.addLink('User_7', 'Organizer_456');

    expect(manager.syncedHasLink('User_7', 'Organizer_789')).toBe(false);
  });

  it('fails closed for SYSTEM_WIDE as the request domain even for a user who joined a real domain', async () => {
    const manager = new MembershipRoleManager({ store: twoOrganizers() as any });
    await manager.addLink('User_7', 'Organizer_456');

    expect(manager.syncedHasLink('User_7', 'SYSTEM_WIDE')).toBe(false);
  });

  it('a direct join is honoured for the domain itself', async () => {
    const manager = new MembershipRoleManager({ store: twoOrganizers() as any });
    await manager.addLink('User_7', 'Merchant_123');

    expect(manager.syncedHasLink('User_7', 'Merchant_123')).toBe(true);
  });

  it('clear() drops every join', async () => {
    const manager = new MembershipRoleManager({ store: twoOrganizers() as any });
    await manager.addLink('User_7', 'Organizer_456');
    await manager.clear();

    expect(manager.syncedHasLink('User_7', 'Merchant_123')).toBe(false);
    expect(manager.syncedHasLink('User_7', 'Organizer_456')).toBe(false);
  });

  it('addLink called twice with the same pair does not duplicate the membership', async () => {
    const manager = new MembershipRoleManager({ store: twoOrganizers() as any });
    await manager.addLink('User_7', 'Organizer_456');
    await manager.addLink('User_7', 'Organizer_456');

    expect(await manager.getRoles('User_7')).toEqual(['Organizer_456']);
  });

  it('calls store.refreshIfStale() on every syncedHasLink call', () => {
    const store = twoOrganizers();
    const manager = new MembershipRoleManager({ store: store as any });

    manager.syncedHasLink('User_7', 'Merchant_123');
    manager.syncedHasLink('User_7', 'Merchant_123');

    expect(store.refreshCalls).toBe(2);
  });
});

describe('MembershipRoleManager - overlay (membership sees fresh g3 edges, like the role axis)', () => {
  it('a user joined only at the parent organizer is a member of a brand-new child merchant known only through the overlay', async () => {
    const overlay = new Map<string, Set<string>>([['Merchant_new', new Set(['Organizer_456'])]]);
    const manager = new MembershipRoleManager({
      store: new FakeDomainHierarchyStore() as any,
      overlay,
    });
    await manager.addLink('User_7', 'Organizer_456');

    expect(manager.syncedHasLink('User_7', 'Merchant_new')).toBe(true);
  });

  it('without the overlay, the same membership still denies at the brand-new child merchant', async () => {
    const manager = new MembershipRoleManager({ store: new FakeDomainHierarchyStore() as any });
    await manager.addLink('User_7', 'Organizer_456');

    expect(manager.syncedHasLink('User_7', 'Merchant_new')).toBe(false);
  });

  it('a sibling merchant carried in the overlay under a different organizer still denies', async () => {
    const overlay = new Map<string, Set<string>>([
      ['Merchant_new', new Set(['Organizer_456'])],
      ['Merchant_other', new Set(['Organizer_999'])],
    ]);
    const manager = new MembershipRoleManager({
      store: new FakeDomainHierarchyStore() as any,
      overlay,
    });
    await manager.addLink('User_7', 'Organizer_456');

    expect(manager.syncedHasLink('User_7', 'Merchant_other')).toBe(false);
  });
});
