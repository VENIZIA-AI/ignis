import type { RoleManager } from 'casbin';
import { BaseRoleManager } from './base';

/** Resource-axis (`g4`) role manager: `addMatchingFunc` would set `hasPattern` and disable DefaultRoleManager's O(1) fast path, so prefix ancestors are walked manually; `addLink` must stay idempotent because `buildRoleLinks` re-adds every edge once per request. */
export class ResourceRoleManager extends BaseRoleManager implements RoleManager {
  private parents = new Map<
    string, // Child module
    Set<string> // Set of Parent modules
  >();

  constructor() {
    super({ scope: ResourceRoleManager.name });
  }

  async clear(): Promise<void> {
    this.parents = new Map<string, Set<string>>();
    this.graphReported = false;
  }

  async addLink(child: string, parent: string): Promise<void> {
    const existing = this.parents.get(child);

    if (existing) {
      existing.add(parent);
    } else {
      this.parents.set(child, new Set<string>([parent]));
    }

    if (!this.parents.has(parent)) {
      this.parents.set(parent, new Set<string>());
    }
  }

  async deleteLink(child: string, parent: string): Promise<void> {
    this.parents.get(child)?.delete(parent);
  }

  syncedHasLink(name1: string, name2: string): boolean {
    this.reportGraphOnce(() => {
      const nodeCount = this.parents.size;
      const edgeCount = Array.from(this.parents.values()).reduce((sum, set) => sum + set.size, 0);
      return {
        message: 'resource-role initialized | nodes: %d | edges: %d',
        args: [nodeCount, edgeCount],
      };
    });

    if (name1 === name2) {
      return true;
    }

    const seeds = this.collectStoredAncestors({ name: name1 });
    if (seeds.length === 0) {
      return false;
    }

    const visited = new Set<string>();
    const queue: string[] = [...seeds];

    // Index cursor rather than shift(): shift() is O(n) and would make the walk quadratic.
    let head = 0;
    while (head < queue.length) {
      const current = queue[head];
      head += 1;

      if (current === name2) {
        return true;
      }

      if (visited.has(current)) {
        continue;
      }
      visited.add(current);

      const parents = this.parents.get(current);
      if (parents) {
        queue.push(...parents);
      }
    }

    return false;
  }

  async getRoles(name: string): Promise<string[]> {
    return [...(this.parents.get(name) ?? [])];
  }

  async getUsers(name: string): Promise<string[]> {
    const users: string[] = [];

    for (const [child, parents] of this.parents) {
      if (parents.has(name)) {
        users.push(child);
      }
    }

    return users;
  }

  /** All stored prefix ancestors of a dotted code (`a.b.c` -> `a.b` -> `a`), not only the deepest, plus a literal stored `'*'` node - `objectMatch(anything, '*')` is always true, so a `g4` edge whose child is `'*'` must stay reachable from every request object. */
  private collectStoredAncestors(opts: { name: string }): string[] {
    const ancestors: string[] = [];

    if (this.parents.has(opts.name)) {
      ancestors.push(opts.name);
    }

    let current = opts.name;
    for (;;) {
      const index = current.lastIndexOf('.');
      if (index === -1) {
        break;
      }

      current = current.slice(0, index);
      if (this.parents.has(current)) {
        ancestors.push(current);
      }
    }

    if (this.parents.has('*') && !ancestors.includes('*')) {
      ancestors.push('*');
    }

    return ancestors;
  }
}
