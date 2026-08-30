import { getError } from '@venizia/ignis-helpers/core';
import type { TAuthorizationDecision, TAuthorizationPolicyVariant } from '@venizia/ignis-kernel';
import { integer, jsonb, text } from 'drizzle-orm/pg-core';

export type TPolicyDefinitionOptions = {
  idType?: 'string' | 'number';
};

/** Column shape is inferred, never hand-declared, so it can never drift from the `$type<>()` narrowing below. */
const buildCommonPolicyDefinitionColumns = () => ({
  // Narrowed to AuthorizationPolicyVariants.ALL's seven edge kinds - a typo here is a silent 403, not a compile error.
  variant: text('variant').$type<TAuthorizationPolicyVariant>().notNull(),
  subjectType: text('subject_type').notNull(),
  targetType: text('target_type').notNull(),

  // Open-ended: grant rows carry a Permission-catalog action code, not a value from a fixed lattice.
  action: text('action'),

  // Narrowed to AuthorizationDecisions (allow/deny/abstain).
  effect: text('effect').$type<TAuthorizationDecision>(),
  domain: text('domain'),

  // Nullable: only subset grants populate it, and a consumer may map its own column instead.
  metadata: jsonb('metadata'),
});

export type TPolicyDefinitionCommonColumns = ReturnType<typeof buildCommonPolicyDefinitionColumns>;

type TPolicyDefinitionColumnDef<Opts extends TPolicyDefinitionOptions | undefined = undefined> =
  Opts extends { idType: 'string' }
    ? TPolicyDefinitionCommonColumns & {
        subjectId: ReturnType<typeof text>;
        targetId: ReturnType<typeof text>;
      }
    : TPolicyDefinitionCommonColumns & {
        subjectId: ReturnType<typeof integer>;
        targetId: ReturnType<typeof integer>;
      };

export const extraPolicyDefinitionColumns = <Opts extends TPolicyDefinitionOptions | undefined>(
  opts?: Opts,
): TPolicyDefinitionColumnDef<Opts> => {
  const { idType = 'number' } = opts ?? {};

  const common = buildCommonPolicyDefinitionColumns();

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
