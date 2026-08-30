import { BaseHelper, getError } from '@venizia/ignis-helpers/core';
import type { TNullable } from '@venizia/ignis-helpers/common';

export type TDomainEdge = { child: string; parent: string };

const DEFAULT_REFRESH_MS = 60_000;

/** Immutable child->parent domain tree shared by every principal. Walks are cycle-safe: app data may contain a cycle. */
export class DomainHierarchyGraph extends BaseHelper {
  private readonly parents = new Map<
    string, // child domain
    Set<string> // set of parent domains
  >();
  private readonly nodes = new Set<string>();

  constructor(opts: { edges: TDomainEdge[] }) {
    super({ scope: DomainHierarchyGraph.name });

    for (const edge of opts.edges) {
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

  /** True when `descendant` IS `ancestor`, or reaches it by walking child->parent. Self-match is required: it replaces the free self-link casbin's DefaultRoleManager gives, which callers depend on. */
  isDescendantOf(opts: { descendant: string; ancestor: string }): boolean {
    const { descendant, ancestor } = opts;
    if (descendant === ancestor) {
      return true;
    }

    const visited = new Set<string>([descendant]);
    const queue: string[] = [descendant];

    // Index cursor rather than shift(): shift() is O(n) and would make the walk quadratic.
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

        if (visited.has(parent)) {
          continue;
        }
        visited.add(parent);
        queue.push(parent);
      }
    }

    return false;
  }

  /** `node` itself plus every ancestor reachable from it, nearest first. Returns `[node]` for an unknown
   * node. Cycle-safe: visited Set + index cursor, never shift(). */
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

/** Owns the current graph and reloads it on a TTL. One instance per enforcer; every pooled enforcer and role manager holds this same reference, so a reload is a single swap. */
export class DomainHierarchyStore extends BaseHelper {
  private static readonly EMPTY_GRAPH = new DomainHierarchyGraph({ edges: [] });

  private readonly load: () => Promise<TDomainEdge[]>;
  private readonly refreshMs: number;
  private readonly maxStaleMs?: number;

  private currentGraph: TNullable<DomainHierarchyGraph> = null;
  private lastLoadedAt = 0;
  // Set at the START of every attempt. refreshIfStale() gates on this, never on lastLoadedAt, so an
  // outage costs one attempt per refreshMs rather than one per enforce.
  private lastAttemptAt = 0;
  private pendingReload: TNullable<Promise<void>> = null;
  private destroyed = false;
  // Keeps the maxStaleMs error to one line per staleness episode; reset on the next successful load.
  private staleCeilingLogged = false;

  constructor(opts: {
    load: () => Promise<TDomainEdge[]>;
    refreshMs?: number;
    maxStaleMs?: number;
  }) {
    super({ scope: DomainHierarchyStore.name });
    this.load = opts.load;
    this.refreshMs = opts.refreshMs ?? DEFAULT_REFRESH_MS;
    this.maxStaleMs = opts.maxStaleMs;
  }

  /** Load the first snapshot. Call once from the enforcer's configure(); throws if the initial load fails (fail-closed at boot, never serve with an empty tree by accident). */
  async warmup(): Promise<void> {
    this.lastAttemptAt = Date.now();

    let edges: TDomainEdge[];
    try {
      edges = await this.load();
    } catch (error) {
      throw getError({
        message: `[DomainHierarchyStore] Initial load failed - refusing to boot with an empty domain tree. ${String(error)}`,
      });
    }

    this.currentGraph = new DomainHierarchyGraph({ edges });
    this.lastLoadedAt = Date.now();

    this.logger
      .for(this.warmup.name)
      .info(
        'Domain hierarchy warmed up | nodes: %d | edges: %d',
        this.currentGraph.nodeCount,
        this.currentGraph.edgeCount,
      );
  }

  /** The current snapshot; synchronous because role managers call it on the enforce hot path. Past
   * `maxStaleMs` it returns an EMPTY graph rather than throwing - throwing would turn a database
   * blip into a total outage, while empty degrades to pre-feature behavior (hierarchy-derived
   * access stops, directly-assigned access keeps working). */
  get graph(): DomainHierarchyGraph {
    if (!this.currentGraph) {
      throw getError({
        message: '[DomainHierarchyStore] Not warmed up. Call warmup() first.',
      });
    }

    if (this.maxStaleMs !== undefined && Date.now() - this.lastLoadedAt > this.maxStaleMs) {
      if (!this.staleCeilingLogged) {
        this.staleCeilingLogged = true;
        this.logger
          .for('graph')
          .error(
            'Domain hierarchy snapshot exceeded maxStaleMs (%dms) with no successful reload; serving an EMPTY graph until the next one - hierarchy-derived access stops, directly-assigned access keeps working.',
            this.maxStaleMs,
          );
      }

      return DomainHierarchyStore.EMPTY_GRAPH;
    }

    return this.currentGraph;
  }

  /** Force a reload now, ignoring the TTL. Used by cache-invalidation hooks. Concurrent calls collapse onto one in-flight reload. */
  async reload(): Promise<void> {
    if (this.pendingReload) {
      return this.pendingReload;
    }

    const task = this.performReload().finally(() => {
      this.pendingReload = null;
    });

    this.pendingReload = task;
    return task;
  }

  /** Kick off a background reload if the TTL expired since the last ATTEMPT (not the last success). Non-blocking and safe to call on the hot path: it never throws, and a failed reload keeps serving the previous snapshot (logged at warn). */
  refreshIfStale(): void {
    if (this.destroyed) {
      return;
    }

    if (Date.now() - this.lastAttemptAt < this.refreshMs) {
      return;
    }

    this.reload().catch(error => {
      this.logger
        .for(this.refreshIfStale.name)
        .warn(
          'Background domain hierarchy reload failed; keeping previous snapshot | error: %s',
          error,
        );
    });
  }

  destroy(): void {
    this.destroyed = true;
    this.pendingReload = null;
  }

  private async performReload(): Promise<void> {
    this.lastAttemptAt = Date.now();

    const edges = await this.load();
    this.currentGraph = new DomainHierarchyGraph({ edges });
    this.lastLoadedAt = Date.now();
    this.staleCeilingLogged = false;
  }
}
