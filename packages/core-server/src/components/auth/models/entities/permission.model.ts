import type { TIdSchemaType } from '@venizia/ignis-kernel';
import type { NotNull } from 'drizzle-orm';
import type { PgTextBuilderInitial } from 'drizzle-orm/pg-core';
import { AuthModelColumns } from './columns';

export type TPermissionOptions = {
  idType?: TIdSchemaType;
};

export type TPermissionCommonColumns = {
  code: NotNull<PgTextBuilderInitial<string, [string, ...string[]]>>;
  name: NotNull<PgTextBuilderInitial<string, [string, ...string[]]>>;
  method: NotNull<PgTextBuilderInitial<string, [string, ...string[]]>>;
  subject: NotNull<PgTextBuilderInitial<string, [string, ...string[]]>>;
  action: NotNull<PgTextBuilderInitial<string, [string, ...string[]]>>;
  scope: NotNull<PgTextBuilderInitial<string, [string, ...string[]]>>;
  description: PgTextBuilderInitial<string, [string, ...string[]]>;
};

/** @deprecated Use `AuthModelColumns.buildPermission(opts)`. Removed in 0.5. */
export const extraPermissionColumns = AuthModelColumns.buildPermission;
