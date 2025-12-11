import { integer, PgIntegerBuilderInitial, PgTextBuilderInitial, text } from "drizzle-orm/pg-core";
import { TColumnDefinitions } from "../common/types";

type TUserAuditColumnOpts = {
  dataType: "string" | "number";
  columnName: string;
};

export type TUserAuditEnricherOptions = {
  created?: TUserAuditColumnOpts;
  modified?: TUserAuditColumnOpts;
};

export type TUserAuditEnricherResult<
  ColumnDefinitions extends TColumnDefinitions = TColumnDefinitions,
> = ColumnDefinitions & {
  createdBy: PgIntegerBuilderInitial<string> | PgTextBuilderInitial<string, [string, ...string[]]>;
  modifiedBy: PgIntegerBuilderInitial<string> | PgTextBuilderInitial<string, [string, ...string[]]>;
};

export const generateUserAuditColumnDefs = (opts?: TUserAuditEnricherOptions) => {
  const {
    created = { dataType: "number", columnName: "created_by" },
    modified = { dataType: "number", columnName: "modified_by" },
  } = opts ?? {};

  return {
    createdBy:
      created.dataType === "number" ? integer(created.columnName) : text(created.columnName),
    modifiedBy:
      modified.dataType === "number" ? integer(modified.columnName) : text(modified.columnName),
  };
};

export const enrichUserAudit = <ColumnDefinitions extends TColumnDefinitions = TColumnDefinitions>(
  baseSchema: ColumnDefinitions,
  opts?: TUserAuditEnricherOptions,
): TUserAuditEnricherResult<ColumnDefinitions> => {
  const defs = generateUserAuditColumnDefs(opts);
  return Object.assign({}, baseSchema, defs);
};
