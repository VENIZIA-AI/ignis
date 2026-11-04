import type { TIdSchemaType } from '@venizia/ignis-kernel';
import type { NotNull } from 'drizzle-orm';
import type { PgTextBuilderInitial } from 'drizzle-orm/pg-core';

/** Options of the permission table builder; `idType` selects the primary key type. */
export type TPermissionOptions = {
  idType?: TIdSchemaType;
};

/** Drizzle column set of the permission table: text `code`, `name`, `method`, `subject`, `action`, `scope` (all not null) and a nullable `description`. */
export type TPermissionCommonColumns = {
  code: NotNull<PgTextBuilderInitial<string, [string, ...string[]]>>;
  name: NotNull<PgTextBuilderInitial<string, [string, ...string[]]>>;
  method: NotNull<PgTextBuilderInitial<string, [string, ...string[]]>>;
  subject: NotNull<PgTextBuilderInitial<string, [string, ...string[]]>>;
  action: NotNull<PgTextBuilderInitial<string, [string, ...string[]]>>;
  scope: NotNull<PgTextBuilderInitial<string, [string, ...string[]]>>;
  description: PgTextBuilderInitial<string, [string, ...string[]]>;
};
