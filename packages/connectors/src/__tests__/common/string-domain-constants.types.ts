import type { TIdSchemaType } from '@venizia/ignis-kernel';
import type { TBigIntMode } from '@/relational/postgres/models/common/constants';
import type {
  TPrincipalEnricherOptions,
  TUserAuditColumnOpts,
} from '@/relational/postgres/models/common/types';

/** Compiles only while the option types keep accepting the plain literals they used to be. */
export type TEnricherIdSample = {
  polymorphicIdType: NonNullable<TPrincipalEnricherOptions['polymorphicIdType']> & TIdSchemaType;
  dataType: TUserAuditColumnOpts['dataType'];
  mode: TBigIntMode;
};
