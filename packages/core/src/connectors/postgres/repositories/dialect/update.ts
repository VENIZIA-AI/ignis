import { RelationalUpdateBuilder } from '@/connectors/relational/repositories/dialect';
import type { SQL } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

/**
 * Composes nested JSON path updates as chained `jsonb_set` calls.
 * The neutral base owns the split and the path validation.
 */
export class UpdateBuilder extends RelationalUpdateBuilder {
  constructor() {
    super({ scope: UpdateBuilder.name });
  }

  /**
   * The path and the value are RAW, not bound: `jsonb_set` takes a `text[]` and a `jsonb`, and a
   * bound parameter arrives as untyped text. Safe only because the base has already run every path
   * component through `validateJsonPathComponents`, whose pattern admits no quote.
   */
  protected override composeJsonSet(opts: { target: SQL; path: string[]; value: any }): SQL {
    const { target, path, value } = opts;

    const pathLiteral = sql.raw(`'{${path.join(',')}}'`);
    const valueLiteral = sql.raw(this.serializeJsonValue(value));

    return sql`jsonb_set(${target}, ${pathLiteral}, ${valueLiteral}, true)`;
  }

  /** Serializes a JavaScript value to a PostgreSQL JSONB literal. */
  private serializeJsonValue(value: any): string {
    if (value === null) {
      return "'null'::jsonb";
    }

    const jsonString = JSON.stringify(value).replace(/'/g, "''");

    return `'${jsonString}'::jsonb`;
  }
}
