import { type RelationTypes } from './constants';

/** An entity class that declares its relations by name, as `ModelFactory.defineEntity` builds one. */
interface IEntityWithRelations {
  relationDefinitions: Record<string, { type: string }> | undefined;
}

type TDefinitionsOf<Entity extends IEntityWithRelations> = NonNullable<
  Entity['relationDefinitions']
>;

/** The names of the entity's `one` relations: the only ones a child can be scoped through. None, when it declares no relations. */
export type TOneRelationNameOf<Entity extends IEntityWithRelations> = [
  TDefinitionsOf<Entity>,
] extends [never]
  ? never
  : {
      [
        Name in keyof TDefinitionsOf<Entity> & string
      ]: TDefinitionsOf<Entity>[Name]['type'] extends typeof RelationTypes.ONE ? Name : never;
    }[keyof TDefinitionsOf<Entity> & string];

/**
 * The value of `settings.access.through`: scope this model through the parent a `one` relation points at. `of` is the
 * only way to make one: the constructor is private and the class has a member no plain object has, so a hand-written
 * `{ relation: 'x' }` does not compile and the name is always checked against the entity.
 */
export class ScopeThrough<RelationName extends string = string> {
  protected readonly kind = 'scope-through';

  private constructor(readonly relation: RelationName) {}

  /**
   * `entity` is read for its type only: a misspelled relation, a to-many one or a name held in a plain `string` does not compile.
   *
   * @example
   * ```typescript
   * import { ScopeThrough } from '@venizia/ignis';
   * import { ModelFactory, one } from '@venizia/ignis-connectors/postgres';
   * import { integer, pgTable, serial } from 'drizzle-orm/pg-core';
   *
   * const productTable = pgTable('Product', { id: serial('id').primaryKey() });
   * const variantTable = pgTable('Variant', {
   *   id: serial('id').primaryKey(),
   *   productId: integer('product_id').references(() => productTable.id),
   * });
   * const Variant = ModelFactory.defineEntity({ table: variantTable, relations: () => ({ product: one(productTable) }) });
   * const through = ScopeThrough.of({ entity: Variant, relation: 'product' });
   * ```
   */
  static of<Entity extends IEntityWithRelations, Name extends TOneRelationNameOf<Entity>>(opts: {
    entity: Entity;
    relation: Name;
  }): ScopeThrough<Name> {
    return new ScopeThrough(opts.relation);
  }
}
