import { MetadataRegistry } from '@/helpers/inversion';
import { SingletonRealm } from '@/helpers/singleton-realm';
import type { TClass } from '@venizia/ignis-helpers/common';
import { BaseHelper } from '@venizia/ignis-helpers/core';
import type { IArtifactIndex, TArtifactIndexInput } from './common';
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
    const indexes = this.flatten({ input });

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

    return { dataSources, components, repositories, services, controllers };
  }

  /** One index, or arrays nested to any depth, as a flat list in input order. */
  flatten(opts: { input: TArtifactIndexInput }): IArtifactIndex[] {
    const { input } = opts;
    if (Array.isArray(input)) {
      return input.flatMap(entry => this.flatten({ input: entry }));
    }

    return [input];
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
    const decisions = await Promise.all(listed.map(ctor => this.isSelected({ ctor, application })));

    const kept = listed.filter((ctor, position) => {
      if (decisions[position]) {
        return true;
      }

      this.logger.debug('Skipped by condition | kind: %s | class: %s', field, ctor.name);
      return false;
    });

    return kept
      .map((ctor, position) => ({
        ctor,
        position,
        order: registry.getArtifactMetadata({ target: ctor })?.order ?? 0,
      }))
      .sort((a, b) => a.order - b.order || a.position - b.position)
      .map(entry => entry.ctor);
  }

  private async isSelected(opts: {
    ctor: TClass<unknown>;
    application: unknown;
  }): Promise<boolean> {
    const { ctor, application } = opts;
    const when = MetadataRegistry.getInstance().getArtifactMetadata({ target: ctor })?.when;
    if (!when) {
      return true;
    }

    return when({ application });
  }
}
