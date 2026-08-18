import { SingletonRealm } from '../../singleton-realm';

/** Engine-neutral: the registry is shared across connectors, so each connector narrows at its own call site. */
export type TRelationBuilder = (opts: {
  source: unknown;
  relations: unknown;
}) => { relations?: unknown } | undefined;

/**
 * The relational connector installs itself here from its own module body. The mixin must not import
 * the connector: one value import of `createRelations` drags `drizzle-orm` into every graph that
 * uses `@repository`.
 */
interface IBuilderSlot {
  builder: TRelationBuilder | undefined;
}

export class RelationBuilderRegistry {
  static readonly SINGLETON_REAL_KEY = 'relation-builder';

  /** Realm-anchored like the other cross-package registries: connectors installs into one copy of this package and the `@repository` mixin resolves from the other, which throws "no relation builder is registered". */
  private static slot(): IBuilderSlot {
    return SingletonRealm.resolve({
      key: RelationBuilderRegistry.SINGLETON_REAL_KEY,
      create: (): IBuilderSlot => ({ builder: undefined }),
    });
  }

  static set(opts: { builder: TRelationBuilder }): void {
    this.slot().builder = opts.builder;
  }

  static resolve(): TRelationBuilder | undefined {
    return this.slot().builder;
  }
}
