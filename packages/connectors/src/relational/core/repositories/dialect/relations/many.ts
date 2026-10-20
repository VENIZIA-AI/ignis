import type { TManyMetadata } from './common';

/** The drizzle config of a `many` relation: its key names it, unless it writes a `relationName`. */
export class ManyRelations {
  static configFor(opts: { name: string; metadata: TManyMetadata }) {
    return Object.assign({}, { relationName: opts.name }, opts.metadata);
  }
}
