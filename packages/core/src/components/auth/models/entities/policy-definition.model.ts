import { getError } from '@venizia/ignis-helpers';
import { integer, jsonb, text } from 'drizzle-orm/pg-core';

export type TPolicyDefinitionOptions = {
  idType?: 'string' | 'number';
};

export type TPolicyDefinitionCommonColumns = {
  variant: ReturnType<typeof text>;
  subjectType: ReturnType<typeof text>;
  targetType: ReturnType<typeof text>;
  action: ReturnType<typeof text>;
  effect: ReturnType<typeof text>;
  domain: ReturnType<typeof text>;
  metadata: ReturnType<typeof jsonb>;
};

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

  const common = {
    variant: text('variant').notNull(),
    subjectType: text('subject_type').notNull(),
    targetType: text('target_type').notNull(),
    action: text('action'),
    effect: text('effect'),
    domain: text('domain'),

    // Nullable: only subset grants populate it, and a consumer may map its own column instead.
    metadata: jsonb('metadata'),
  };

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
