import { getError } from '@venizia/ignis-helpers/core';
import type { TAuthorizationDecision, TAuthorizationPolicyVariant } from '@venizia/ignis-kernel';
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
const buildCommonPolicyDefinitionColumns = <ExtraVariant extends string = never>() => ({
  metadata: jsonb('metadata'),

  variant: text('variant').$type<TAuthorizationPolicyVariant | ExtraVariant>().notNull(),

  subjectType: text('subject_type').notNull(),
  targetType: text('target_type').notNull(),
  domainType: text('domain_type'),

  action: text('action'),
  effect: text('effect').$type<TAuthorizationDecision>(),
  domain: text('domain'),
});

export type TPolicyDefinitionCommonColumns<ExtraVariant extends string = never> = ReturnType<
  typeof buildCommonPolicyDefinitionColumns<ExtraVariant>
>;

type TPolicyDefinitionColumnDef<
  Opts extends TPolicyDefinitionOptions<string> | undefined = undefined,
> = Opts extends { idType: 'string' }
  ? TPolicyDefinitionCommonColumns<TExtraPolicyVariantOf<Opts>> & {
      subjectId: ReturnType<typeof text>;
      targetId: ReturnType<typeof text>;
      domainId: ReturnType<typeof text>;
    }
  : TPolicyDefinitionCommonColumns<TExtraPolicyVariantOf<Opts>> & {
      subjectId: ReturnType<typeof integer>;
      targetId: ReturnType<typeof integer>;
      domainId: ReturnType<typeof integer>;
    };

export const extraPolicyDefinitionColumns = <
  const Opts extends TPolicyDefinitionOptions<string> | undefined = undefined,
>(
  opts?: Opts,
): TPolicyDefinitionColumnDef<Opts> => {
  const { idType = 'number' } = opts ?? {};

  const common = buildCommonPolicyDefinitionColumns<TExtraPolicyVariantOf<Opts>>();

  switch (idType) {
    case 'number': {
      return {
        ...common,
        subjectId: integer('subject_id').notNull(),
        targetId: integer('target_id').notNull(),
        domainId: integer('domain_id'),
      } as TPolicyDefinitionColumnDef<Opts>;
    }
    case 'string': {
      return {
        ...common,
        subjectId: text('subject_id').notNull(),
        targetId: text('target_id').notNull(),
        domainId: text('domain_id'),
      } as TPolicyDefinitionColumnDef<Opts>;
    }
    default: {
      throw getError({
        message: `[extraPolicyDefinitionColumns] Invalid idType | idType: ${idType}`,
      });
    }
  }
};

/**
 * The three legal `(domain_type, domain_id)` pairs, as CHECK predicate TEXT for a migration.
 *
 * Text, not a Drizzle `SQL` object, because that is where this constraint actually goes: a column
 * reference inside a Drizzle `sql` template renders schema-qualified (`"table"."column"`), which is
 * not valid inside a table-level CHECK. Migrations here are raw SQL, so the helper matches them.
 *
 * ```sql
 * ALTER TABLE policy_definitions
 *   ADD CONSTRAINT policy_definition_domain_shape
 *   CHECK (<policyDefinitionDomainShapeCheck()>);
 * ```
 *
 * Both directions are enforced, because half a constraint still admits half the broken rows: an
 * absent or sentinel type REQUIRES a null id, and a typed domain REQUIRES a non-null one.
 * The `IS NOT NULL` guard on the last branch looks redundant next to `NOT IN` and is not: a NULL
 * `domain_type` makes `NOT IN` evaluate to NULL, and a CHECK only rejects on FALSE - so without it,
 * an id with no type PASSES. Verified against a real Postgres, not reasoned about.
 *
 * `ANY_MEMBER` is refused outright - null already means it, and one state reachable two ways is the
 * bug this column split exists to remove.
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
