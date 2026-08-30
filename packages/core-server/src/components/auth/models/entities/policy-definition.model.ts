import { getError } from '@venizia/ignis-helpers/core';
import type { TAuthorizationDecision, TAuthorizationPolicyVariant } from '@venizia/ignis-kernel';
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
  // Narrowed to AuthorizationPolicyVariants.ALL's seven edge kinds plus any app-declared extras -
  // a typo here is a silent 403, not a compile error.
  variant: text('variant').$type<TAuthorizationPolicyVariant | ExtraVariant>().notNull(),
  subjectType: text('subject_type').notNull(),
  targetType: text('target_type').notNull(),

  // Open-ended: grant rows carry a Permission-catalog action code, not a value from a fixed lattice.
  action: text('action'),

  // Narrowed to AuthorizationDecisions (allow/deny/abstain) and NOT extensible like `variant`:
  // the casbin effect evaluator itself reads this value, so an unknown effect is a correctness
  // bug in enforcement, not a harmless unselected row.
  effect: text('effect').$type<TAuthorizationDecision>(),
  domain: text('domain'),

  // Nullable: only subset grants populate it, and a consumer may map its own column instead.
  metadata: jsonb('metadata'),
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
    }
  : TPolicyDefinitionCommonColumns<TExtraPolicyVariantOf<Opts>> & {
      subjectId: ReturnType<typeof integer>;
      targetId: ReturnType<typeof integer>;
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
      } as TPolicyDefinitionColumnDef<Opts>;
    }
    case 'string': {
      return {
        ...common,
        subjectId: text('subject_id').notNull(),
        targetId: text('target_id').notNull(),
      } as TPolicyDefinitionColumnDef<Opts>;
    }
    default: {
      throw getError({
        message: `[extraPolicyDefinitionColumns] Invalid idType | idType: ${idType}`,
      });
    }
  }
};
