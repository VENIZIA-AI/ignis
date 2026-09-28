import type { TQueryOperatorHandlers } from '@venizia/ignis-kernel';
import { Sorts } from '@venizia/ignis-kernel';
import type { TTableColumns } from '@/relational/core/repositories/common';
import { FilterBuilder } from '@/relational/core/repositories/dialect/filter';
import type { TConstValue } from '@venizia/ignis-helpers/common';
import type { SQL } from 'drizzle-orm';
import { sql, StringChunk } from 'drizzle-orm';
import { PostgresQueryOperators } from './query';

const SORT_KEYWORDS: Record<TConstValue<typeof Sorts>, string> = {
  [Sorts.ASC]: 'ASC',
  [Sorts.DESC]: 'DESC',
};

const CAST_OPEN = new StringChunk('CASE WHEN (');
const CAST_GUARD = new StringChunk(") ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (");
const CAST_CLOSE = new StringChunk(')::numeric ELSE NULL END');

/** Adds the Postgres operator table and `#>>`/`#>` JSON-path syntax to the neutral translation. */
export class PostgresFilterBuilder extends FilterBuilder {
  protected override get operators(): TQueryOperatorHandlers {
    return PostgresQueryOperators.FNS;
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

    // The Drizzle column chunk is qualified or aliased like a plain key. `#>>` yields text, so a
    // numeric operand needs the regex-guarded cast (a non-numeric value stays NULL).
    const pathSuffix = new StringChunk(` #>> '{${path.join(',')}}'`);

    if (!this.isOperatorObject({ value })) {
      const jsonExtraction = this.jsonNeedsNumericCast({
        operators: this.toBareJsonOperators({ value }),
      })
        ? this.toSafeNumericCast({ column, pathSuffix })
        : sql.fromList([column, pathSuffix]);

      return [this.buildValueCondition({ column: jsonExtraction, value })];
    }

    return this.buildJsonOperatorConditions({
      jsonPath: sql.fromList([column, pathSuffix]),
      safeNumericCast: this.toSafeNumericCast({ column, pathSuffix }),
      operators: value,
    });
  }

  /** One flat fragment: every nested `SQL` level costs a render pass. */
  private toSafeNumericCast(opts: { column: TTableColumns[string]; pathSuffix: StringChunk }): SQL {
    const { column, pathSuffix } = opts;

    return sql.fromList([
      CAST_OPEN,
      column,
      pathSuffix,
      CAST_GUARD,
      column,
      pathSuffix,
      CAST_CLOSE,
    ]);
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

    return sql.fromList([
      column,
      new StringChunk(` #> '{${path.join(',')}}' ${SORT_KEYWORDS[direction]}`),
    ]);
  }
}

// No `as FilterBuilder` alias here: that name belongs to the neutral tier, and re-exporting this
// subclass under it publishes two different classes under one name across sibling sub-paths.
