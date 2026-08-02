import type { TQueryOperatorHandlers } from '@/base/repositories/common';
import { FilterBuilder } from '@/connectors/relational/repositories/dialect/filter';
import { PostgresQueryOperators } from './query';

/** Postgres's `FilterBuilder`: the neutral filter translation plus the Postgres operator table. The whole `where` / `order` / `include` walk is inherited unchanged. */
export class PostgresFilterBuilder extends FilterBuilder {
  protected override get operators(): TQueryOperatorHandlers {
    return PostgresQueryOperators.FNS;
  }
}

// No `as FilterBuilder` alias here: `FilterBuilder` is the neutral tier's name, so re-exporting this
// subclass under it publishes two different classes under one name across sibling sub-paths
// (`@venizia/ignis/postgres` and `@venizia/ignis/relational`).
