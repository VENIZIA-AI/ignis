import type { RoleManager } from 'casbin';
import { BaseRoleManager } from './base';

/**
 * Serves the `g3` axis (`g3(r.dom, p.dom)`) and, with `reversed`, casbin's
 * `DefaultRoleManager.addDomainHierarchy()` on `g`, which asks in the opposite argument order.
 * `clear()` wipes only the overlay, never shared across requests: `buildRoleLinksInternal` clears
 * every registered role manager each request. Pass both instances one `overlay` so per-request `g3`
 * edges reach the `g` axis, which casbin never puts in `rmMap` and so never feeds `addLink`.
 */
export class DomainHierarchyRoleManager extends BaseRoleManager implements RoleManager {
  private readonly reversed: boolean;
  private readonly overlay: Map<
    string, // child domain
    Set<string> // set of parent domains
  >;

  constructor(opts: { reversed?: boolean; overlay?: Map<string, Set<string>> }) {
    super({ scope: DomainHierarchyRoleManager.name });
    this.reversed = opts.reversed ?? false;
    this.overlay = opts.overlay ?? new Map<string, Set<string>>();
  }

  /** Mutates the map in place - never reassigns `this.overlay` - so a caller sharing this map with another instance (see `opts.overlay`) sees the clear too. */
  async clear(): Promise<void> {
    this.overlay.clear();
    this.graphReported = false;
  }

  async addLink(child: string, parent: string): Promise<void> {
    const existing = this.overlay.get(child);
    if (existing) {
      existing.add(parent);
    } else {
      this.overlay.set(child, new Set<string>([parent]));
    }

    if (!this.overlay.has(parent)) {
      this.overlay.set(parent, new Set<string>());
    }
  }

  async deleteLink(child: string, parent: string): Promise<void> {
    this.overlay.get(child)?.delete(parent);
  }

  syncedHasLink(name1: string, name2: string): boolean {
    this.reportGraphOnce(() => {
      const { nodeCount, edgeCount } = DomainHierarchyRoleManager.overlayStats(this.overlay);
      return {
        message: 'domain-hierarchy role manager initialized | nodes: %d | edges: %d | reversed: %s',
        args: [nodeCount, edgeCount, this.reversed],
      };
    });

    const start = this.reversed ? name2 : name1;
    const target = this.reversed ? name1 : name2;

    return this.reaches({ start, target });
  }

  /** Local overlay only, not the shared graph - correct for hasLink, incomplete for casbin's management API. */
  async getRoles(name: string): Promise<string[]> {
    return [...(this.overlay.get(name) ?? [])];
  }

  async getUsers(name: string): Promise<string[]> {
    const users: string[] = [];

    for (const [child, parents] of this.overlay) {
      if (parents.has(name)) {
        users.push(child);
      }
    }

    return users;
  }

  /** True when `start` is `target`, or reaches it through the overlay. */
  private reaches(opts: { start: string; target: string }): boolean {
    const { start, target } = opts;

    if (start === target) {
      return true;
    }

    const ancestors = DomainHierarchyRoleManager.collectAncestors({
      overlay: this.overlay,
      node: start,
    });
    return ancestors.includes(target);
  }
}
