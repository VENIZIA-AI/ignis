import type { TQueryOperatorHandlers } from '@venizia/ignis-kernel';
import { Sorts } from '@venizia/ignis-kernel';
import type { TTableColumns } from '@/relational/core/repositories/common';
import { FilterBuilder } from '@/relational/core/repositories/dialect/filter';
import type { TConstValue } from '@venizia/ignis-helpers/common';
import type { SQL } from 'drizzle-orm';
import { sql, StringChunk } from 'drizzle-orm';
import { assertNotBlobJsonColumn, toSqliteJsonExtractionChunks } from './internal';
import { SqliteQueryOperators } from './query';

const SORT_DIRECTIONS: Record<TConstValue<typeof Sorts>, StringChunk> = {
  [Sorts.ASC]: new StringChunk(' ASC'),
  [Sorts.DESC]: new StringChunk(' DESC'),
};

/**
 * Adds the SQLite operator table and `json_extract` path syntax; everything else - merging,
 * where/orderBy, column selection, include, hidden-column exclusion - is inherited unchanged.
 *
 * The neutral column check is NARROWED rather than replaced: requiring the declared json mode is
 * what stops a mistyped `title.tier` compiling to a `json_extract` that silently returns NULL.
 */
export class SqliteFilterBuilder extends FilterBuilder {
  protected override get operators(): TQueryOperatorHandlers {
    return SqliteQueryOperators.FNS;
  }

  protected override validateJsonColumn(opts: {
    key: string;
    columns: TTableColumns;
    tableName: string;
    methodName: string;
  }): { column: TTableColumns[string]; path: string[] } {
    const { tableName, methodName } = opts;

    const validated = super.validateJsonColumn(opts);

    assertNotBlobJsonColumn({
      column: validated.column,
      tableName,
      scope: `[${SqliteFilterBuilder.name}][${methodName}]`,
    });

    return validated;
  }

  /**
   * `json_extract` hands back the JSON value in its own SQLite type - a
   * JSON number arrives INTEGER or REAL - so there is no text extraction
   * to repair. Postgres needs a cast only because `#>>` is always text.
   */
  protected override jsonNeedsNumericCast(): boolean {
    return false;
  }

  protected override buildJsonWhereCondition(opts: {
    key: string;
    value: any;
    columns: TTableColumns;
    tableName: string;
  }): SQL[] {
    const { key, value, columns, tableName } = opts;

    const { column, path } = this.validateJsonColumn({
      key,
      columns,
      tableName,
      methodName: 'buildJsonWhereCondition',
    });

    const extraction = sql.fromList(toSqliteJsonExtractionChunks({ column, path }));

    if (!this.isOperatorObject({ value })) {
      return [this.buildValueCondition({ column: extraction, value })];
    }

    // Both arguments are the same expression: `json_extract` is already
    // typed, so the inherited walk has no cast variant to switch to.
    return this.buildJsonOperatorConditions({
      jsonPath: extraction,
      safeNumericCast: extraction,
      operators: value,
    });
  }

  protected override buildJsonOrderBy(opts: {
    key: string;
    direction: TConstValue<typeof Sorts>;
    columns: TTableColumns;
    tableName: string;
  }): SQL {
    const { key, direction, columns, tableName } = opts;

    const { column, path } = this.validateJsonColumn({
      key,
      columns,
      tableName,
      methodName: 'buildJsonOrderBy',
    });

    const chunks = toSqliteJsonExtractionChunks({ column, path });
    chunks.push(SORT_DIRECTIONS[direction]);

    return sql.fromList(chunks);
  }
}
