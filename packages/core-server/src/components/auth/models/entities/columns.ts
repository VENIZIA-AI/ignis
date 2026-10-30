import { isoTimestamp } from '@venizia/ignis-connectors/postgres';
import type { TConstValue } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import {
  AuthorizationDomainScopes,
  RoleStatuses,
  UserStatuses,
  UserTypes,
} from '@venizia/ignis-kernel';
import type {
  TAuthorizationDecision,
  TAuthorizationPolicyVariant,
  TIdSchemaType,
  TSubsetGrantMetadata,
} from '@venizia/ignis-kernel';
import type { PgIntegerBuilderInitial, PgTextBuilderInitial } from 'drizzle-orm/pg-core';
import { integer, jsonb, text } from 'drizzle-orm/pg-core';
import type { TPermissionCommonColumns, TPermissionOptions } from './permission.model';
import type { TPolicyDefinitionOptions } from './policy-definition.model';

type TPermissionColumnDef<Opts extends TPermissionOptions | undefined = undefined> = Opts extends {
  idType: infer IdType;
}
  ? IdType extends 'string'
    ? TPermissionCommonColumns & {
        parentId: PgTextBuilderInitial<string, [string, ...string[]]>;
      }
    : TPermissionCommonColumns & {
        parentId: PgIntegerBuilderInitial<string>;
      }
  : TPermissionCommonColumns & {
      parentId: PgIntegerBuilderInitial<string>;
    };

/** Extracts the app-declared extra variants from `Opts`, or `never` when none were declared. */
type TExtraPolicyVariantOf<Opts> = Opts extends {
  extraVariants?: ReadonlyArray<infer ExtraVariant extends string>;
}
  ? ExtraVariant
  : never;

/** Column shape is inferred, never hand-declared, so it can never drift from the `$type<>()` narrowing below. */
const buildCommonPolicyDefinitionColumns = <
  ExtraVariant extends string = never,
  Metadata extends object = TSubsetGrantMetadata,
>() => ({
  metadata: jsonb('metadata').$type<Metadata>(),
  variant: text('variant').$type<TAuthorizationPolicyVariant | ExtraVariant>().notNull(),

  subjectType: text('subject_type').notNull(),
  targetType: text('target_type').notNull(),

  // `null` IS `ANY_MEMBER`, not "unknown"; the literal is refused by `AuthModelColumns.buildPolicyDefinitionDomainShapeCheck`.
  domainType: text('domain_type'),

  action: text('action'),
  effect: text('effect').$type<TAuthorizationDecision>(),
});

export type TPolicyDefinitionCommonColumns<
  ExtraVariant extends string = never,
  Metadata extends object = TSubsetGrantMetadata,
> = ReturnType<typeof buildCommonPolicyDefinitionColumns<ExtraVariant, Metadata>>;

type TPolicyDefinitionColumnDef<
  Opts extends TPolicyDefinitionOptions<string> | undefined = undefined,
  Metadata extends object = TSubsetGrantMetadata,
> = Opts extends { idType: 'string' }
  ? TPolicyDefinitionCommonColumns<TExtraPolicyVariantOf<Opts>, Metadata> & {
      subjectId: ReturnType<typeof text>;
      targetId: ReturnType<typeof text>;
      domainId: ReturnType<typeof text>;
    }
  : TPolicyDefinitionCommonColumns<TExtraPolicyVariantOf<Opts>, Metadata> & {
      subjectId: ReturnType<typeof integer>;
      targetId: ReturnType<typeof integer>;
      domainId: ReturnType<typeof integer>;
    };

/** The Drizzle column sets of the auth tables, spread into a table the application declares (`...AuthModelColumns.buildUser()`). */
export class AuthModelColumns {
  static buildUser(opts?: { idType: TIdSchemaType }) {
    return {
      realm: text('realm').default(''),
      status: text('status')
        .$type<TConstValue<typeof UserStatuses>>()
        .notNull()
        .default(UserStatuses.UNKNOWN),
      type: text('type').$type<TConstValue<typeof UserTypes>>().notNull().default(UserTypes.SYSTEM),
      activatedAt: isoTimestamp('activated_at', { withTimezone: true }),
      lastLoginAt: isoTimestamp('last_login_at', { withTimezone: true }),
      parentId: opts?.idType === 'string' ? text('parent_id') : integer('parent_id'),
    };
  }

  static buildRole() {
    return {
      identifier: text('identifier').unique().notNull(),
      name: text('name').notNull(),
      description: text('description'),
      priority: integer('priority').notNull(),
      status: text('status')
        .$type<TConstValue<typeof RoleStatuses>>()
        .notNull()
        .default(RoleStatuses.ACTIVATED),
    };
  }

  static buildPermission<Opts extends TPermissionOptions | undefined>(
    opts?: Opts,
  ): TPermissionColumnDef<Opts> {
    const { idType = 'number' } = opts ?? {};

    switch (idType) {
      case 'number': {
        return {
          code: text('code').unique().notNull(),
          name: text('name').notNull(),
          subject: text('subject').notNull(),
          method: text('method').notNull(),
          action: text('action').notNull(),
          scope: text('scope').notNull(),
          description: text('description'),
          parentId: integer('parent_id'),
        } as TPermissionColumnDef<Opts>;
      }
      case 'string': {
        return {
          code: text('code').unique().notNull(),
          name: text('name').notNull(),
          subject: text('subject').notNull(),
          method: text('method').notNull(),
          action: text('action').notNull(),
          scope: text('scope').notNull(),
          description: text('description'),
          parentId: text('parent_id'),
        } as TPermissionColumnDef<Opts>;
      }
      default: {
        throw getError({
          message: `[AuthModelColumns.buildPermission] Invalid idType | idType: ${idType}`,
        });
      }
    }
  }

  /**
   * `Metadata` is a type parameter, not an `opts` field: unlike `extraVariants` there is no runtime
   * value to infer from, so supplying it means spelling `Opts` too (no partial inference):
   * `AuthModelColumns.buildPolicyDefinition<{ idType: 'string' }, IMyMetadata>({ idType: 'string' })`.
   * Keep `ops` in a custom shape if the app also issues subset grants - `customGrant` writes it.
   */
  static buildPolicyDefinition<
    const Opts extends TPolicyDefinitionOptions<string> | undefined = undefined,
    Metadata extends object = TSubsetGrantMetadata,
  >(opts?: Opts): TPolicyDefinitionColumnDef<Opts, Metadata> {
    const { idType = 'number' } = opts ?? {};

    const common = buildCommonPolicyDefinitionColumns<TExtraPolicyVariantOf<Opts>, Metadata>();

    switch (idType) {
      case 'number': {
        return {
          ...common,
          subjectId: integer('subject_id').notNull(),
          targetId: integer('target_id').notNull(),
          domainId: integer('domain_id'),
        } as TPolicyDefinitionColumnDef<Opts, Metadata>;
      }
      case 'string': {
        return {
          ...common,
          subjectId: text('subject_id').notNull(),
          targetId: text('target_id').notNull(),
          domainId: text('domain_id'),
        } as TPolicyDefinitionColumnDef<Opts, Metadata>;
      }
      default: {
        throw getError({
          message: `[AuthModelColumns.buildPolicyDefinition] Invalid idType | idType: ${idType}`,
        });
      }
    }
  }

  /**
   * The three legal `(domain_type, domain_id)` pairs, as CHECK predicate TEXT for a migration - text,
   * not a Drizzle `SQL`, because a column ref in a `sql` template renders schema-qualified, which a
   * table-level CHECK rejects.
   *
   * The `IS NOT NULL` guard on the last branch looks redundant next to `NOT IN` and is not: a NULL
   * `domain_type` makes `NOT IN` evaluate to NULL, and a CHECK rejects only on FALSE - without it an id
   * with no type passes.
   */
  static buildPolicyDefinitionDomainShapeCheck(opts?: {
    domainTypeColumn?: string;
    domainIdColumn?: string;
  }): string {
    const { domainTypeColumn = 'domain_type', domainIdColumn = 'domain_id' } = opts ?? {};
    const { ANY_MEMBER, SYSTEM_WIDE } = AuthorizationDomainScopes;

    return [
      `(${domainTypeColumn} IS NULL AND ${domainIdColumn} IS NULL)`,
      `OR (${domainTypeColumn} = '${SYSTEM_WIDE}' AND ${domainIdColumn} IS NULL)`,
      `OR (
      ${domainTypeColumn} IS NOT NULL
      AND ${domainTypeColumn} NOT IN ('${ANY_MEMBER}', '${SYSTEM_WIDE}')
      AND ${domainIdColumn} IS NOT NULL
    )`,
    ].join('\n');
  }
}
