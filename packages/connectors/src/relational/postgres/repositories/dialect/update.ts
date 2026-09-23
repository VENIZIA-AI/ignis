import { RelationalUpdateBuilder } from '@/relational/core/repositories/dialect';
import type { SQL } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

/**
 * Composes nested JSON path updates as chained `jsonb_set` calls.
 * The neutral base owns the split and the path validation.
 */
export class UpdateBuilder extends RelationalUpdateBuilder {
  private static readonly SOURCE_TABLE = sql.raw('json_update_source');
  private static readonly DOCUMENT_COLUMN = sql.raw('document');
  private static readonly SOURCE_DOCUMENT = sql.raw('json_update_source.document');

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

    const valueLiteral = sql.raw(this.serializeJsonValue(value));

    if (path.length === 1) {
      return sql`jsonb_set(${target}, ${this.toPathLiteral({ path })}, ${valueLiteral}, true)`;
    }

    // `create_missing` creates only the LAST key, so each level is set from the inside out onto its
    // parent, a missing parent read as `{}`. `target` is aliased once so a chained target is not
    // repeated per level.
    let composed = valueLiteral;
    for (let depth = path.length; depth > 0; depth--) {
      const parent = this.toParentNode({ path: path.slice(0, depth - 1) });
      const key = this.toPathLiteral({ path: [path[depth - 1]] });
      composed = sql`jsonb_set(${parent}, ${key}, ${composed}, true)`;
    }

    // A scalar parent yields NULL through the chain; coalescing keeps the document as it was.
    return sql`(SELECT coalesce(${composed}, ${UpdateBuilder.SOURCE_DOCUMENT}) FROM (SELECT ${target} AS ${UpdateBuilder.DOCUMENT_COLUMN}) AS ${UpdateBuilder.SOURCE_TABLE})`;
  }

  private toPathLiteral(opts: { path: string[] }): SQL {
    return sql.raw(`'{${opts.path.join(',')}}'`);
  }

  /** The document at `path`: `{}` when missing, NULL when it is a scalar nothing can be set inside. */
  private toParentNode(opts: { path: string[] }): SQL {
    if (opts.path.length === 0) {
      return UpdateBuilder.SOURCE_DOCUMENT;
    }

    const node = sql`${UpdateBuilder.SOURCE_DOCUMENT} #> ${this.toPathLiteral(opts)}`;

    return sql`CASE WHEN ${node} IS NULL THEN '{}'::jsonb WHEN jsonb_typeof(${node}) IN ('object', 'array') THEN ${node} END`;
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
