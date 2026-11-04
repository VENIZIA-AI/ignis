import type { IdType } from '@/base';
import type { TConstValue, TNullable } from '@venizia/ignis-helpers/common';
import type { TGrantRow } from './common';

/** The `kind` values of a `TPrincipalPolicyRow`: which branch of the principal-policy statement produced the row. */
export class PrincipalPolicyEdges {
  static readonly DIRECT = 'direct';
  static readonly ROLE_EDGE = 'roleEdge';
  static readonly ROLE_GRANT = 'roleGrant';
  static readonly DOMAIN_EDGE = 'domainEdge';
}

/** A row from the single principal-policy statement; `kind` says which branch produced it. */
export type TPrincipalPolicyRow = TGrantRow & {
  kind: TConstValue<typeof PrincipalPolicyEdges>;
  variant: string;
  targetType: TNullable<string>;
  targetId: IdType;
};
