import { generatePrincipalColumnDefs } from '@/base/models';
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
export type TUserRoleOptions = {
  idType?: 'string' | 'number' | 'uuid';
};

export type TUserRoleCommonColumns = ReturnType<
  typeof generatePrincipalColumnDefs<'principal', 'string' | 'number' | 'uuid'>
>;

type TUserRoleColumnDef<Opts extends TUserRoleOptions | undefined = undefined> = Opts extends {
  idType: 'string';
}
  ? TUserRoleCommonColumns & {
      userId: NotNull<PgTextBuilderInitial<string, [string, ...string[]]>>;
    }
  : Opts extends { idType: 'uuid' }
    ? TUserRoleCommonColumns & {
        userId: NotNull<PgUUIDBuilderInitial<string>>;
      }
    : TUserRoleCommonColumns & {
        userId: NotNull<PgIntegerBuilderInitial<string>>;
      };

export const extraUserRoleColumns = <Opts extends TUserRoleOptions | undefined>(
  opts?: Opts,
): TUserRoleColumnDef<Opts> => {
  const { idType = 'number' } = opts ?? {};
  const principalColumns = generatePrincipalColumnDefs({
    defaultPolymorphic: 'Role',
    polymorphicIdType: idType,
  });

  switch (idType) {
    case 'number': {
      return {
        ...principalColumns,
        userId: integer('user_id').notNull(),
      } as TUserRoleColumnDef<Opts>;
    }
    case 'string': {
      return {
        ...principalColumns,
        userId: text('user_id').notNull(),
      } as TUserRoleColumnDef<Opts>;
    }
    case 'uuid': {
      return {
        ...principalColumns,
        userId: uuid('user_id').notNull(),
      } as TUserRoleColumnDef<Opts>;
    }
    default: {
      throw getError({
        message: `[extraUserRoleColumns] Invalid idType | idType: ${idType}`,
      });
    }
  }
};
