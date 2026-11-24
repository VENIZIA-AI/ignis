import type { z } from 'zod';
import { getError } from '@venizia/ignis-helpers/core';

import type { TSchemaType } from '@venizia/ignis-kernel';
import { AbstractEntity } from '@venizia/ignis-kernel/repository';
import type { ISearchCollectionDefinition, TSearchDocument } from './common';
import { SearchCollectionFactory } from './define-search-collection';

/** Engine-neutral search-document entity deriving zod schemas from an `ISearchCollectionDefinition`. `Schema` is instance-side only so `schema` carries the caller's literal collection type - mirrors `BasePostgresEntity`'s static-wide / instance-narrow duality. */
export class BaseSearchEntity<
  Schema extends ISearchCollectionDefinition = ISearchCollectionDefinition,
> extends AbstractEntity {
  schema: Schema;

  // Phantom type carriers (no runtime value; `declare` emits nothing).
  declare readonly $inferData?: TSearchDocument<Schema>;
  declare readonly $inferPersist?: TSearchDocument<Schema>;

  static COLLECTION_NAME?: string;

  /**
   * What an authorization rule names this model by: the `authorize.principal` of `@model`, else the model's name (the class
   * name, which a minified build changes: give the principal to any model a rule names). `@model` defines the principal on
   * the class; a class that is not decorated, or has no principal, answers its name, so the value is never `undefined` and
   * `Model.AUTHORIZATION_SUBJECT` needs no `!`.
   */
  static get AUTHORIZATION_SUBJECT(): string {
    return this.name;
  }

  /**
   * A subclass that declares `static readonly AUTHORIZATION_SUBJECT = '...'` is compiled by `tsc` (with
   * `useDefineForClassFields: false`, which IGNIS needs) to an assignment: this setter turns it into the class's own value,
   * as a field declaration would be under Bun.
   */
  static set AUTHORIZATION_SUBJECT(value: string) {
    Object.defineProperty(this, 'AUTHORIZATION_SUBJECT', {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }

  static schema: ISearchCollectionDefinition;

  static documentSchema?: z.ZodType;
  private static readonly _schemaCache = new Map<Function, Map<TSchemaType, z.ZodType>>();

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
        message: `[BaseSearchEntity] Missing collection definition | name: ${this.name} | define a static "schema" (via SearchCollectionFactory.define) or pass one to the constructor`,
      });
    }

    if (this.schema !== ctor.schema) {
      return SearchCollectionFactory.deriveDocumentSchema({
        definition: this.schema,
        type: opts.type,
      }) as T;
    }

    let byType = BaseSearchEntity._schemaCache.get(ctor);

    if (!byType) {
      byType = new Map<TSchemaType, z.ZodType>();
      BaseSearchEntity._schemaCache.set(ctor, byType);
    }

    const cached = byType.get(opts.type);

    if (cached) {
      return cached as T;
    }

    const derived = SearchCollectionFactory.deriveDocumentSchema({
      definition: this.schema,
      type: opts.type,
    });
    byType.set(opts.type, derived);

    return derived as T;
  }
}
