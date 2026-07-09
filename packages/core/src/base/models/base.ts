import { BaseHelper } from '@venizia/ignis-helpers';
import type { TIdSchemaType, TSchemaType } from './common';

/** Engine-neutral entity root: named, scoped-logged, zod-schema-capable. */
export abstract class AbstractEntity<Schema = unknown> extends BaseHelper {
  name: string;

  constructor(opts: { name: string }) {
    super({ scope: opts.name });
    this.name = opts.name;
  }

  abstract getSchema<T = Schema>(opts: { type: TSchemaType }): T;

  /** Path-param id shape for this entity - default 'string' (every document-family id, e.g. Typesense's). */
  getIdType(): TIdSchemaType {
    return 'string';
  }

  toObject() {
    return { ...this };
  }

  toJSON() {
    return this.toObject();
  }
}
