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
export class RelationBuilderRegistry {
  private static builder: TRelationBuilder | undefined;

  static set(opts: { builder: TRelationBuilder }): void {
    RelationBuilderRegistry.builder = opts.builder;
  }

  static resolve(): TRelationBuilder | undefined {
    return RelationBuilderRegistry.builder;
  }
}
