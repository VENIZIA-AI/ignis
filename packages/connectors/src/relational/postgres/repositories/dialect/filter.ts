import type { Sorts, TQueryOperatorHandlers } from '@venizia/ignis-kernel';
import type { TTableColumns } from '@/relational/core/repositories/common';
import { FilterBuilder } from '@/relational/core/repositories/dialect/filter';
import type { TConstValue } from '@venizia/ignis-helpers/common';
import type { SQL } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { PostgresQueryOperators } from './query';

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

    // `#>>` always yields text, so a numeric operand needs the cast or
    // Postgres answers 'operator does not exist: text = integer'. The regex
    // guard keeps a non-numeric value NULL instead of aborting the scan.
    const jsonPath = `"${column.name}" #>> '{${path.join(',')}}'`;
    const safeNumericCast = `CASE WHEN (${jsonPath}) ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (${jsonPath})::numeric ELSE NULL END`;

    if (!this.isOperatorObject({ value })) {
      const jsonExtraction = this.jsonNeedsNumericCast({
        operators: this.toBareJsonOperators({ value }),
      })
        ? sql.raw(safeNumericCast)
        : sql.raw(jsonPath);

      return [this.buildValueCondition({ column: jsonExtraction, value })];
    }

    return this.buildJsonOperatorConditions({ jsonPath, safeNumericCast, operators: value });
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

    return sql.raw(`"${column.name}" #> '{${path.join(',')}}' ${direction.toUpperCase()}`);
  }
}

// No `as FilterBuilder` alias here: that name belongs to the neutral tier, and re-exporting this
// subclass under it publishes two different classes under one name across sibling sub-paths.
