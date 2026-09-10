import { MetadataRegistry } from '@/helpers/inversion';
import { SingletonRealm } from '@/helpers/singleton-realm';
import type { TClass } from '@venizia/ignis-helpers/common';
import { BaseHelper, getError } from '@venizia/ignis-helpers/core';
import type { IArtifactIndex, IConditionalArtifactIndex, TArtifactIndexInput } from './common';
import { ArtifactIndexFields } from './common';

/** Turns a `configs.artifacts` input into the classes to register: flattens nested indexes, drops the classes whose `when` says no, orders the rest. It never touches the container - `registerArtifacts` does the binding. */
export class ArtifactIndexHelper extends BaseHelper {
  static readonly SINGLETON_REALM_KEY = 'artifact-index-helper';

  private constructor() {
    super({ scope: ArtifactIndexHelper.name });
  }

  static getInstance(): ArtifactIndexHelper {
    return SingletonRealm.resolve({
      key: ArtifactIndexHelper.SINGLETON_REALM_KEY,
      create: () => new ArtifactIndexHelper(),
    });
  }

  /** Every kind of the input, each already filtered by `when` and sorted by `order`, keyed the way `IArtifactIndex` is. */
  async resolve(opts: {
    input: TArtifactIndexInput;
    application: unknown;
  }): Promise<Required<IArtifactIndex>> {
    const { input, application } = opts;
    const indexes = await this.flatten({ input, application });

    const rawConfigurations = await this.select({
      indexes,
      field: ArtifactIndexFields.CONFIGURATIONS,
      application,
    });
    const configurations = this.sortConfigurationsTopologically({
      classes: rawConfigurations,
    });

    const dataSources = await this.select({
      indexes,
      field: ArtifactIndexFields.DATA_SOURCES,
      application,
    });
    const components = await this.select({
      indexes,
      field: ArtifactIndexFields.COMPONENTS,
      application,
    });
    const repositories = await this.select({
      indexes,
      field: ArtifactIndexFields.REPOSITORIES,
      application,
    });
    const services = await this.select({
      indexes,
      field: ArtifactIndexFields.SERVICES,
      application,
    });
    const controllers = await this.select({
      indexes,
      field: ArtifactIndexFields.CONTROLLERS,
      application,
    });

    return { configurations, dataSources, components, repositories, services, controllers };
  }

  /**
   * Topologically sort configurations based on `after` dependencies.
   * Siblings with no dependency relation are sorted deterministically by class name.
   * Throws if an unknown `after` dependency is referenced or if a dependency cycle is detected.
   */
  sortConfigurationsTopologically(opts: { classes: ReadonlyArray<TClass<any>> }): TClass<any>[] {
    const { classes } = opts;
    if (classes.length === 0) {
      return [];
    }

    const registry = MetadataRegistry.getInstance();
    const classMap = new Map<string, TClass<any>>();
    for (const target of classes) {
      classMap.set(target.name, target);
    }

    // Build graph: edge A -> B means A must run before B (B declared after: [A])
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const target of classes) {
      inDegree.set(target.name, 0);
      adjacency.set(target.name, []);
    }

    for (const target of classes) {
      const metadata = registry.getArtifactMetadata({ target });
      const afterList = metadata?.after ?? [];

      for (const prereq of afterList) {
        const prereqName = typeof prereq === 'function' ? prereq.name : String(prereq);
        if (!classMap.has(prereqName)) {
          throw getError({
            message: `[sortConfigurationsTopologically][${target.name}] Declared 'after' dependency '${prereqName}' is not registered as a configuration`,
          });
        }

        adjacency.get(prereqName)!.push(target.name);
        inDegree.set(target.name, (inDegree.get(target.name) ?? 0) + 1);
      }
    }

    // Kahn's algorithm with priority queue (sorted by class name for deterministic sibling ordering)
    const available: string[] = [];
    for (const [name, deg] of inDegree.entries()) {
      if (deg === 0) {
        available.push(name);
      }
    }
    available.sort((a, b) => a.localeCompare(b));

    const sortedNames: string[] = [];

    while (available.length > 0) {
      const current = available.shift()!;
      sortedNames.push(current);

      const dependents = adjacency.get(current) ?? [];
      for (const dep of dependents) {
        const newDeg = inDegree.get(dep)! - 1;
        inDegree.set(dep, newDeg);
        if (newDeg === 0) {
          available.push(dep);
          available.sort((a, b) => a.localeCompare(b));
        }
      }
    }

    if (sortedNames.length !== classes.length) {
      const unvisited = classes.filter(c => !sortedNames.includes(c.name)).map(c => c.name);
      throw getError({
        message: `[sortConfigurationsTopologically] Dependency cycle detected in configurations: ${unvisited.join(', ')}`,
      });
    }

    return sortedNames.map(name => classMap.get(name)!);
  }

  /** One index, or arrays nested to any depth, as a flat list in input order; a conditional entry contributes its subtree only when its `when` answers true. */
  async flatten(opts: {
    input: TArtifactIndexInput;
    application: unknown;
  }): Promise<IArtifactIndex[]> {
    const { input, application } = opts;
    if (Array.isArray(input)) {
      const nested = await Promise.all(
        input.map(entry => this.flatten({ input: entry, application })),
      );
      return nested.flat();
    }

    if (this.isConditional(input)) {
      const isSelected = await input.when({ application });
      if (!isSelected) {
        this.logger.debug('Skipped by condition | conditional index entry');
        return [];
      }

      return this.flatten({ input: input.index, application });
    }

    return [input];
  }

  /** Positional on purpose: a type predicate narrows its own parameter, and an options object would narrow the wrapper instead of `input`. */
  private isConditional(
    entry: IArtifactIndex | IConditionalArtifactIndex,
  ): entry is IConditionalArtifactIndex {
    return 'when' in entry && 'index' in entry;
  }

  /** The classes of one kind across every index, minus those whose `when` says no, sorted by `order` (stable). The `when` conditions run concurrently: each reads config and environment, never another artifact. */
  async select<Field extends keyof IArtifactIndex>(opts: {
    indexes: IArtifactIndex[];
    field: Field;
    application: unknown;
  }): Promise<NonNullable<IArtifactIndex[Field]>[number][]> {
    const { indexes, field, application } = opts;
    const registry = MetadataRegistry.getInstance();

    const listed = indexes.flatMap(index => [...(index[field] ?? [])]);
    const decisions = await Promise.all(
      listed.map(target => this.isSelected({ target, application })),
    );

    const kept = listed.filter((target, position) => {
      if (decisions[position]) {
        return true;
      }

      this.logger.debug('Skipped by condition | kind: %s | class: %s', field, target.name);
      return false;
    });

    return kept
      .map((target, position) => ({
        target,
        position,
        order: registry.getArtifactMetadata({ target })?.order ?? 0,
      }))
      .sort((a, b) => a.order - b.order || a.position - b.position)
      .map(entry => entry.target);
  }

  private async isSelected(opts: {
    target: TClass<unknown>;
    application: unknown;
  }): Promise<boolean> {
    const { target, application } = opts;
    const when = MetadataRegistry.getInstance().getArtifactMetadata({ target })?.when;
    if (!when) {
      return true;
    }
    return when({ application });
  }
}
