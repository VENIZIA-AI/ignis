import { BaseHelper } from '@venizia/ignis-helpers/core';

/**
 * Shared casbin `RoleManager` scaffolding for the resource, domain-hierarchy, and membership
 * role managers: the debug-only interface members (`printRoles`, `getDomains`, `getAllDomains`),
 * the `hasLink` wrapper around the synchronous `syncedHasLink`, the once-per-`clear()`
 * overlay-initialized log line, and the shared ancestor walk both hierarchy-aware managers use.
 */
export abstract class BaseRoleManager extends BaseHelper {
  protected graphReported = false;

  abstract syncedHasLink(name1: string, name2: string): boolean;

  async hasLink(name1: string, name2: string): Promise<boolean> {
    return this.syncedHasLink(name1, name2);
  }

  /** casbin calls this after buildRoleLinks purely as a debug hook; none of the role managers log from here. */
  async printRoles(): Promise<void> {}

  async getDomains(): Promise<string[]> {
    return [];
  }

  async getAllDomains(): Promise<string[]> {
    return [];
  }

  /** Logs the initialized-overlay line once per `clear()` cycle; `build` is only invoked the first time so counts stay lazy. */
  protected reportGraphOnce(build: () => { message: string; args: unknown[] }): void {
    if (this.graphReported) {
      return;
    }
    this.graphReported = true;

    const { message, args } = build();
    this.logger.for(this.syncedHasLink.name).debug(message, ...args);
  }

  /** Node and edge counts of a domain-hierarchy overlay, for the once-per-`clear()` debug log. */
  protected static overlayStats(overlay?: Map<string, Set<string>>): {
    nodeCount: number;
    edgeCount: number;
  } {
    if (!overlay) {
      return { nodeCount: 0, edgeCount: 0 };
    }

    let edgeCount = 0;
    for (const parents of overlay.values()) {
      edgeCount += parents.size;
    }

    return { nodeCount: overlay.size, edgeCount };
  }

  /** `node` itself plus every ancestor reachable by walking the overlay's child->parent edges,
   * node first. Cycle-safe: visited Set + index cursor, never shift(). Static - `ResourceRoleManager`
   * extends this base with no overlay of this shape, so this must not force instance state onto it. */
  protected static collectAncestors(opts: {
    overlay?: Map<string, Set<string>>;
    node: string;
  }): string[] {
    const { overlay, node } = opts;
    const result: string[] = [node];
    const visited = new Set<string>([node]);
    const queue: string[] = [node];

    let head = 0;
    while (head < queue.length) {
      const current = queue[head];
      head += 1;

      const parents = overlay?.get(current);
      if (!parents) {
        continue;
      }

      for (const parent of parents) {
        if (visited.has(parent)) {
          continue;
        }
        visited.add(parent);
        result.push(parent);
        queue.push(parent);
      }
    }

    return result;
  }
}
