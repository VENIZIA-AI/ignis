import { getError } from '@venizia/ignis-helpers/core';
import type {
  TAuthorizationDecision,
  TAuthorizationPolicyVariant,
  TSubsetGrantMetadata,
} from '@venizia/ignis-kernel';
import { AuthorizationDomainScopes } from '@venizia/ignis-kernel';
import { integer, jsonb, text } from 'drizzle-orm/pg-core';

export type TPolicyDefinitionOptions<ExtraVariant extends string = never> = {
  idType?: 'string' | 'number';
  /**
   * App-only edge kinds stored in this same table alongside IGNIS's seven (e.g. `merchant_role`).
   * `ScopedCasbinAdapter` never selects an undeclared variant - it is purely the consumer's data.
   * Pass as an inline array literal; the `const` type parameter below infers the literal union
   * from it without needing `as const`.
   */
  extraVariants?: ReadonlyArray<ExtraVariant>;
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

  // `null` IS `ANY_MEMBER`, not "unknown"; the literal is refused by `policyDefinitionDomainShapeCheck`.
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

/**
 * `Metadata` is a type parameter, not an `opts` field: unlike `extraVariants` there is no runtime
 * value to infer from, so supplying it means spelling `Opts` too (no partial inference):
 * `extraPolicyDefinitionColumns<{ idType: 'string' }, IMyMetadata>({ idType: 'string' })`.
 * Keep `ops` in a custom shape if the app also issues subset grants - `customGrant` writes it.
 */
export const extraPolicyDefinitionColumns = <
  const Opts extends TPolicyDefinitionOptions<string> | undefined = undefined,
  Metadata extends object = TSubsetGrantMetadata,
>(
  opts?: Opts,
): TPolicyDefinitionColumnDef<Opts, Metadata> => {
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
        message: `[extraPolicyDefinitionColumns] Invalid idType | idType: ${idType}`,
      });
    }
  }
};

/**
 * The three legal `(domain_type, domain_id)` pairs, as CHECK predicate TEXT for a migration - text,
 * not a Drizzle `SQL`, because a column ref in a `sql` template renders schema-qualified, which a
 * table-level CHECK rejects.
 *
 * The `IS NOT NULL` guard on the last branch looks redundant next to `NOT IN` and is not: a NULL
 * `domain_type` makes `NOT IN` evaluate to NULL, and a CHECK rejects only on FALSE - without it an id
 * with no type passes.
 */
export const policyDefinitionDomainShapeCheck = (opts?: {
  domainTypeColumn?: string;
  domainIdColumn?: string;
}): string => {
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
};
