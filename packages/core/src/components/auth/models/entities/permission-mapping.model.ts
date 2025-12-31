import { getError } from '@venizia/ignis-helpers';

import { NotNull } from 'drizzle-orm';
import {
  integer,
  PgIntegerBuilderInitial,
  PgTextBuilderInitial,
  text,
} from 'drizzle-orm/pg-core';

// -------------------------------------------------------------------------------------------
export type TPermissionMappingOptions = {
  idType?: 'string' | 'number';
};

export type TPermissionMappingCommonColumns = {
  effect: PgTextBuilderInitial<string, [string, ...string[]]>;
};

type TPermissionMappingColumnDef<Opts extends TPermissionMappingOptions | undefined = undefined> =
  Opts extends { idType: infer IdType }
    ? IdType extends 'string'
      ? TPermissionMappingCommonColumns & {
          userId: PgTextBuilderInitial<string, [string, ...string[]]>;
          roleId: PgTextBuilderInitial<string, [string, ...string[]]>;
          permissionId: NotNull<PgTextBuilderInitial<string, [string, ...string[]]>>;
        }
      : TPermissionMappingCommonColumns & {
          userId: PgIntegerBuilderInitial<string>;
          roleId: PgIntegerBuilderInitial<string>;
          permissionId: NotNull<PgIntegerBuilderInitial<string>>;
        }
    : TPermissionMappingCommonColumns & {
        userId: PgIntegerBuilderInitial<string>;
        roleId: PgIntegerBuilderInitial<string>;
        permissionId: NotNull<PgIntegerBuilderInitial<string>>;
      };

export const extraPermissionMappingColumns = <Opts extends TPermissionMappingOptions | undefined>(
  opts?: Opts,
): TPermissionMappingColumnDef<Opts> => {
  const { idType = 'number' } = opts ?? {};

  switch (idType) {
    case 'string': {
      return {
        effect: text('effect'),
        userId: text('user_id'),
        roleId: text('role_id'),
        permissionId: text('permission_id').notNull(),
      } as TPermissionMappingColumnDef<Opts>;
    }
    case 'number': {
      return {
        effect: text('effect'),
        userId: integer('user_id'),
        roleId: integer('role_id'),
        permissionId: integer('permission_id').notNull(),
      } as TPermissionMappingColumnDef<Opts>;
    }
    default: {
      throw getError({
        message: `[extraPermissionMappingColumns] Invalid idType | idType: ${idType}`,
      });
    }
  }
};
