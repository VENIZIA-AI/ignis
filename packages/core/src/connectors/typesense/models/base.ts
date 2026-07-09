import type { z } from '@hono/zod-openapi';
import { getError } from '@venizia/ignis-helpers';

import type { TSchemaType } from '@/base/models';
import { AbstractEntity } from '@/base/models';
import type { ISearchCollectionDefinition, TSearchDocument } from './types';
import { deriveSearchDocumentSchema } from './zod-derivation';

/**
 * Engine-neutral search-document entity: derives zod schemas from an `ISearchCollectionDefinition`.
 * The `Schema` generic is instance-side only, so the `schema` field carries the caller's literal
 * collection type instead of the widened interface - mirrors `BasePostgresEntity`'s
 * static-wide / instance-narrow `schema` duality.
 */
export class BaseSearchEntity<
  Schema extends ISearchCollectionDefinition = ISearchCollectionDefinition,
> extends AbstractEntity {
  schema: Schema;

  // Phantom type carriers (no runtime value; `declare` emits nothing).
  declare readonly $inferData?: TSearchDocument<Schema>;
  declare readonly $inferPersist?: TSearchDocument<Schema>;

  static COLLECTION_NAME?: string;
  static AUTHORIZATION_SUBJECT?: string;

  static schema: ISearchCollectionDefinition;

  static documentSchema?: z.ZodTypeAny;
  private static readonly _schemaCache = new Map<Function, Map<TSchemaType, z.ZodTypeAny>>();

  constructor(opts?: { name?: string; schema?: Schema }) {
    const ctor = new.target as typeof BaseSearchEntity;
    const name = opts?.name ?? ctor.COLLECTION_NAME ?? ctor.schema?.name ?? ctor.name;

    super({ name });

    this.schema = opts?.schema ?? (ctor.schema as Schema);
  }

  getSchema<T = unknown>(opts: { type: TSchemaType }): T {
    const ctor = this.constructor as typeof BaseSearchEntity;

    if (ctor.documentSchema) {
      return ctor.documentSchema as T;
    }

    if (!this.schema) {
      throw getError({
        message: `[BaseSearchEntity] Missing collection definition | name: ${this.name} | define a static "schema" (via defineSearchCollection) or pass one to the constructor`,
      });
    }

    if (this.schema !== ctor.schema) {
      return deriveSearchDocumentSchema({ definition: this.schema, type: opts.type }) as T;
    }

    let byType = BaseSearchEntity._schemaCache.get(ctor);
    if (!byType) {
      byType = new Map<TSchemaType, z.ZodTypeAny>();
      BaseSearchEntity._schemaCache.set(ctor, byType);
    }

    const cached = byType.get(opts.type);
    if (cached) {
      return cached as T;
    }

    const derived = deriveSearchDocumentSchema({ definition: this.schema, type: opts.type });
    byType.set(opts.type, derived);
    return derived as T;
  }
}
