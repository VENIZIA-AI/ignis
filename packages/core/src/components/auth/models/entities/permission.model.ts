import { getError } from '@venizia/ignis-helpers';
import { NotNull } from 'drizzle-orm';
import {
  integer,
  PgIntegerBuilderInitial,
  PgTextBuilderInitial,
  PgUUIDBuilderInitial,
  text,
  uuid,
} from 'drizzle-orm/pg-core';

// -------------------------------------------------------------------------------------------
export type TPermissionOptions = {
  idType?: 'string' | 'number';
};

export type TPermissionCommonColumns = {
  code: NotNull<PgTextBuilderInitial<string, [string, ...string[]]>>;
  name: NotNull<PgTextBuilderInitial<string, [string, ...string[]]>>;
  subject: NotNull<PgTextBuilderInitial<string, [string, ...string[]]>>;
  pType: NotNull<PgTextBuilderInitial<string, [string, ...string[]]>>;
  action: NotNull<PgTextBuilderInitial<string, [string, ...string[]]>>;
  scope: NotNull<PgTextBuilderInitial<string, [string, ...string[]]>>;
};

type TPermissionColumnDef<Opts extends TPermissionOptions | undefined = undefined> = Opts extends {
  idType: infer IdType;
}
  ? IdType extends 'string'
    ? TPermissionCommonColumns & {
        parentId: PgUUIDBuilderInitial<string>;
      }
    : TPermissionCommonColumns & {
        parentId: PgIntegerBuilderInitial<string>;
      }
  : TPermissionCommonColumns & {
      parentId: PgIntegerBuilderInitial<string>;
    };

export const extraPermissionColumns = <Opts extends TPermissionOptions | undefined>(
  opts?: Opts,
): TPermissionColumnDef<Opts> => {
  const { idType = 'number' } = opts ?? {};

  switch (idType) {
    case 'number': {
      return {
        code: text('code').unique().notNull(),
        name: text('name').notNull(),
        subject: text('subject').notNull(),
        pType: text('p_type').notNull(),
        action: text('action').notNull(),
        scope: text('scope').notNull(),
        parentId: integer('parent_id'),
      } as TPermissionColumnDef<Opts>;
    }
    case 'string': {
      return {
        code: text('code').unique().notNull(),
        name: text('name').notNull(),
        subject: text('subject').notNull(),
        pType: text('p_type').notNull(),
        action: text('action').notNull(),
        scope: text('scope').notNull(),
        parentId: uuid('parent_id'),
      } as TPermissionColumnDef<Opts>;
    }
    default: {
      throw getError({
        message: `[extraPermissionColumns] Invalid idType | idType: ${idType}`,
      });
    }
  }
};
