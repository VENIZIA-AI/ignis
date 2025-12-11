import { HasDefault, NotNull } from "drizzle-orm";
import { PgTimestampBuilderInitial, timestamp } from "drizzle-orm/pg-core";
import { TColumnDefinitions } from "../common/types";

export type TTzEnricherOptions = {
  created?: { columnName: string; withTimezone: boolean };
  modified?: { enable: false } | { enable?: true; columnName: string; withTimezone: boolean };
  deleted?: { enable: false } | { enable?: true; columnName: string; withTimezone: boolean };
};

export type TTzEnricherResult<ColumnDefinitions extends TColumnDefinitions = TColumnDefinitions> =
  ColumnDefinitions & {
    createdAt: NotNull<HasDefault<PgTimestampBuilderInitial<string>>>;
    modifiedAt?: NotNull<HasDefault<PgTimestampBuilderInitial<string>>>;
    deletedAt?: PgTimestampBuilderInitial<string>;
  };

export const generateTzColumnDefs = (opts?: TTzEnricherOptions) => {
  const {
    created = { columnName: "created_at", withTimezone: true },
    modified = { enable: true, columnName: "modified_at", withTimezone: true },
    deleted = { enable: false },
  } = opts ?? {};

  let rs = {
    createdAt: timestamp(created.columnName, {
      mode: "date",
      withTimezone: created.withTimezone,
    })
      .defaultNow()
      .notNull(),
  };

  if (!modified.enable && !deleted.enable) {
    return rs;
  }

  if (modified.enable) {
    rs = Object.assign({}, rs, {
      modifiedAt: timestamp(modified.columnName, {
        mode: "date",
        withTimezone: modified.withTimezone,
      })
        .defaultNow()
        .notNull()
        .$onUpdate(() => {
          return new Date();
        }),
    });
  }

  if (deleted.enable) {
    rs = Object.assign({}, rs, {
      deletedAt: timestamp(deleted.columnName, {
        mode: "date",
        withTimezone: deleted.withTimezone,
      }),
    });
  }

  return rs;
};

export const enrichTz = (baseSchema: TColumnDefinitions, opts?: TTzEnricherOptions) => {
  const defs = generateTzColumnDefs(opts);
  return Object.assign({}, baseSchema, defs);
};
