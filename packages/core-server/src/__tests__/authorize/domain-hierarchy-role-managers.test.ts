import { DomainHierarchyRoleManager } from '@/components/auth/authorize/role-managers/domain-hierarchy';
import { MembershipRoleManager } from '@/components/auth/authorize/role-managers/membership';
import { describe, expect, it } from 'bun:test';
import type { ILogger } from '@venizia/ignis-helpers/core';

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
  describe('non-reversed (g3 axis) - overlay only, no persistent graph behind it', () => {
    it('treats a domain as linked to itself even when it is unknown to the overlay', () => {
      const manager = new DomainHierarchyRoleManager({});
      expect(manager.syncedHasLink('Ghost_Domain', 'Ghost_Domain')).toBe(true);
    });

    it('resolves a direct edge added via addLink', async () => {
      const manager = new DomainHierarchyRoleManager({});
      await manager.addLink('Merchant_123', 'Organizer_456');
      expect(manager.syncedHasLink('Merchant_123', 'Organizer_456')).toBe(true);
    });

    it('does not resolve the reverse direction of an addLink edge', async () => {
      const manager = new DomainHierarchyRoleManager({});
      await manager.addLink('Merchant_123', 'Organizer_456');
      expect(manager.syncedHasLink('Organizer_456', 'Merchant_123')).toBe(false);
    });

    it('returns false for a domain with no edge to the target', async () => {
      const manager = new DomainHierarchyRoleManager({});
      await manager.addLink('Merchant_123', 'Organizer_456');
      expect(manager.syncedHasLink('Merchant_999', 'Organizer_456')).toBe(false);
    });
  });

  describe('reversed mode (g axis domain hierarchy)', () => {
    it('flips the direct-edge and reverse-direction results', async () => {
      const manager = new DomainHierarchyRoleManager({ reversed: true });
      await manager.addLink('Merchant_123', 'Organizer_456');

      expect(manager.syncedHasLink('Merchant_123', 'Organizer_456')).toBe(false);
      expect(manager.syncedHasLink('Organizer_456', 'Merchant_123')).toBe(true);
    });

    it('still returns false for domains with no edge either way', async () => {
      const manager = new DomainHierarchyRoleManager({ reversed: true });
      await manager.addLink('Merchant_123', 'Organizer_456');
      expect(manager.syncedHasLink('Merchant_999', 'Organizer_456')).toBe(false);
    });

    it('still treats a domain as linked to itself', () => {
      const manager = new DomainHierarchyRoleManager({ reversed: true });
      expect(manager.syncedHasLink('Ghost_Domain', 'Ghost_Domain')).toBe(true);
    });
  });

  describe('overlay (per-principal g3 policy lines fed through addLink)', () => {
    it('honours an edge added only through addLink', async () => {
      const manager = new DomainHierarchyRoleManager({});

      await manager.addLink('Merchant_777', 'Organizer_888');
      expect(manager.syncedHasLink('Merchant_777', 'Organizer_888')).toBe(true);
    });

    it('clear() drops every overlay edge', async () => {
      const manager = new DomainHierarchyRoleManager({});

      await manager.addLink('Merchant_777', 'Organizer_888');
      await manager.clear();

      expect(manager.syncedHasLink('Merchant_777', 'Organizer_888')).toBe(false);
    });

    it('addLink called twice with the same pair does not corrupt the walk', async () => {
      const manager = new DomainHierarchyRoleManager({});

      await manager.addLink('Merchant_777', 'Organizer_888');
      await manager.addLink('Merchant_777', 'Organizer_888');

      expect(manager.syncedHasLink('Merchant_777', 'Organizer_888')).toBe(true);
      expect(await manager.getRoles('Merchant_777')).toEqual(['Organizer_888']);
    });

    it('walks a chain of two overlay edges', async () => {
      const manager = new DomainHierarchyRoleManager({});

      await manager.addLink('Merchant_123', 'Organizer_456');
      await manager.addLink('Organizer_456', 'Group_999');

      expect(manager.syncedHasLink('Merchant_123', 'Group_999')).toBe(true);
      expect(manager.syncedHasLink('Merchant_123', 'Organizer_456')).toBe(true);
    });

    it('terminates on a cycle introduced through addLink', async () => {
      const manager = new DomainHierarchyRoleManager({});

      await manager.addLink('A', 'B');
      await manager.addLink('B', 'C');
      await manager.addLink('C', 'A');

      expect(manager.syncedHasLink('A', 'C')).toBe(true);
      expect(manager.syncedHasLink('A', 'Missing')).toBe(false);
    });
  });

  it('emits the overlay-size debug log once per build, again after clear()', async () => {
    const manager = new DomainHierarchyRoleManager({});
    await manager.addLink('Merchant_123', 'Organizer_456');

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

describe('DomainHierarchyRoleManager - shared overlay', () => {
  it('an edge added via addLink on the non-reversed (g3) instance is visible, reversed, on the reversed (g) instance', async () => {
    const sharedOverlay = new Map<string, Set<string>>();

    const g3Manager = new DomainHierarchyRoleManager({ overlay: sharedOverlay });
    const gManager = new DomainHierarchyRoleManager({ reversed: true, overlay: sharedOverlay });

    await g3Manager.addLink('Merchant_123', 'Organizer_456');

    // g3's own convention: syncedHasLink(child, parent).
    expect(g3Manager.syncedHasLink('Merchant_123', 'Organizer_456')).toBe(true);
    // g's convention is the opposite order (syncedHasLink(storedDomain, requestDomain)).
    expect(gManager.syncedHasLink('Organizer_456', 'Merchant_123')).toBe(true);
  });

  it('clear() on the non-reversed instance drops the edge for both instances', async () => {
    const sharedOverlay = new Map<string, Set<string>>();

    const g3Manager = new DomainHierarchyRoleManager({ overlay: sharedOverlay });
    const gManager = new DomainHierarchyRoleManager({ reversed: true, overlay: sharedOverlay });

    await g3Manager.addLink('Merchant_123', 'Organizer_456');
    await g3Manager.clear();

    expect(g3Manager.syncedHasLink('Merchant_123', 'Organizer_456')).toBe(false);
    expect(gManager.syncedHasLink('Organizer_456', 'Merchant_123')).toBe(false);
  });

  it('without an explicit overlay, each instance still gets its own (back-compat for any other caller)', async () => {
    const first = new DomainHierarchyRoleManager({});
    const second = new DomainHierarchyRoleManager({});

    await first.addLink('Merchant_123', 'Organizer_456');

    expect(first.syncedHasLink('Merchant_123', 'Organizer_456')).toBe(true);
    expect(second.syncedHasLink('Merchant_123', 'Organizer_456')).toBe(false);
  });
});

describe('MembershipRoleManager', () => {
  const twoOrganizersOverlay = (): Map<string, Set<string>> =>
    new Map<string, Set<string>>([
      ['Merchant_123', new Set(['Organizer_456'])],
      ['Merchant_999', new Set(['Organizer_789'])],
    ]);

  it('a user who joined the parent organizer is a member of its child merchant', async () => {
    const manager = new MembershipRoleManager({ overlay: twoOrganizersOverlay() });
    await manager.addLink('User_7', 'Organizer_456');

    expect(manager.syncedHasLink('User_7', 'Merchant_123')).toBe(true);
  });

  it("a user who joined one organizer is not a member of a different organizer's merchant", async () => {
    const manager = new MembershipRoleManager({ overlay: twoOrganizersOverlay() });
    await manager.addLink('User_7', 'Organizer_456');

    expect(manager.syncedHasLink('User_7', 'Merchant_999')).toBe(false);
  });

  it('a user who joined one organizer is not a member of a different organizer directly', async () => {
    const manager = new MembershipRoleManager({ overlay: twoOrganizersOverlay() });
    await manager.addLink('User_7', 'Organizer_456');

    expect(manager.syncedHasLink('User_7', 'Organizer_789')).toBe(false);
  });

  it('fails closed for SYSTEM_WIDE as the request domain even for a user who joined a real domain', async () => {
    const manager = new MembershipRoleManager({ overlay: twoOrganizersOverlay() });
    await manager.addLink('User_7', 'Organizer_456');

    expect(manager.syncedHasLink('User_7', 'SYSTEM_WIDE')).toBe(false);
  });

  it('a direct join is honoured for the domain itself', async () => {
    const manager = new MembershipRoleManager({ overlay: twoOrganizersOverlay() });
    await manager.addLink('User_7', 'Merchant_123');

    expect(manager.syncedHasLink('User_7', 'Merchant_123')).toBe(true);
  });

  it('clear() drops every join', async () => {
    const manager = new MembershipRoleManager({ overlay: twoOrganizersOverlay() });
    await manager.addLink('User_7', 'Organizer_456');
    await manager.clear();

    expect(manager.syncedHasLink('User_7', 'Merchant_123')).toBe(false);
    expect(manager.syncedHasLink('User_7', 'Organizer_456')).toBe(false);
  });

  it('addLink called twice with the same pair does not duplicate the membership', async () => {
    const manager = new MembershipRoleManager({ overlay: twoOrganizersOverlay() });
    await manager.addLink('User_7', 'Organizer_456');
    await manager.addLink('User_7', 'Organizer_456');

    expect(await manager.getRoles('User_7')).toEqual(['Organizer_456']);
  });
});

describe('MembershipRoleManager - overlay (membership sees fresh g3 edges, like the role axis)', () => {
  it('a user joined only at the parent organizer is a member of a brand-new child merchant known only through the overlay', async () => {
    const overlay = new Map<string, Set<string>>([['Merchant_new', new Set(['Organizer_456'])]]);
    const manager = new MembershipRoleManager({ overlay });
    await manager.addLink('User_7', 'Organizer_456');

    expect(manager.syncedHasLink('User_7', 'Merchant_new')).toBe(true);
  });

  it('without the overlay, the same membership still denies at the brand-new child merchant', async () => {
    const manager = new MembershipRoleManager({});
    await manager.addLink('User_7', 'Organizer_456');

    expect(manager.syncedHasLink('User_7', 'Merchant_new')).toBe(false);
  });

  it('a sibling merchant carried in the overlay under a different organizer still denies', async () => {
    const overlay = new Map<string, Set<string>>([
      ['Merchant_new', new Set(['Organizer_456'])],
      ['Merchant_other', new Set(['Organizer_999'])],
    ]);
    const manager = new MembershipRoleManager({ overlay });
    await manager.addLink('User_7', 'Organizer_456');

    expect(manager.syncedHasLink('User_7', 'Merchant_other')).toBe(false);
  });
});
