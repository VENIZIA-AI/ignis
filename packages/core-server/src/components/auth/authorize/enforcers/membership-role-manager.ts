import type { RoleManager } from 'casbin';
import { BaseRoleManager } from './base-role-manager';
import type { DomainHierarchyStore } from './domain-hierarchy';

/** `g2` axis (`g2(r.sub, r.dom)`): membership holds when the user joined the request domain or any
 * ancestor of it, walking the shared graph plus the per-request overlay. Memberships are
 * per-principal and rebuilt every request, so `clear()` wipes all. */
export class MembershipRoleManager extends BaseRoleManager implements RoleManager {
  private readonly store: DomainHierarchyStore;
  private readonly overlay?: Map<
    string, // child domain
    Set<string> // set of parent domains
  >;
  private memberships = new Map<
    string, // user
    Set<string> // set of joined domains
  >();

  constructor(opts: { store: DomainHierarchyStore; overlay?: Map<string, Set<string>> }) {
    super({ scope: MembershipRoleManager.name });
    this.store = opts.store;
    this.overlay = opts.overlay;
  }

  async clear(): Promise<void> {
    this.memberships = new Map<string, Set<string>>();
    this.graphReported = false;
  }

  async addLink(user: string, domain: string): Promise<void> {
    const existing = this.memberships.get(user);
    if (existing) {
      existing.add(domain);
    } else {
      this.memberships.set(user, new Set<string>([domain]));
    }
  }

  async deleteLink(user: string, domain: string): Promise<void> {
    this.memberships.get(user)?.delete(domain);
  }

  /** True when `name1` (user) joined `name2` (request domain) itself, or any ancestor of it. Walks UP from the request domain only - walking down from every joined domain would fan out over the whole subtree. */
  syncedHasLink(name1: string, name2: string): boolean {
    this.store.refreshIfStale();
    this.reportGraphOnce(() => ({
      message: 'membership role manager initialized | nodes: %d | edges: %d',
      args: [this.store.graph.nodeCount, this.store.graph.edgeCount],
    }));

    const joined = this.memberships.get(name1);
    if (!joined || joined.size === 0) {
      return false;
    }

    const ancestors = MembershipRoleManager.collectAncestors({
      graph: this.store.graph,
      overlay: this.overlay,
      node: name2,
    });
    for (const ancestor of ancestors) {
      if (joined.has(ancestor)) {
        return true;
      }
    }

    return false;
  }

  /** Local membership state only, not the shared graph - correct for hasLink, incomplete for casbin's management API. */
  async getRoles(name: string): Promise<string[]> {
    return [...(this.memberships.get(name) ?? [])];
  }

  async getUsers(name: string): Promise<string[]> {
    const users: string[] = [];

    for (const [user, domains] of this.memberships) {
      if (domains.has(name)) {
        users.push(user);
      }
    }

    return users;
  }
}
