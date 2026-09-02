import type { AuthorizationPolicyBuilder } from '../../builders/policy.builder';
import type { TAuthorizationAction } from '../constants';

/** Shape of `PolicyDefinition.metadata` on a subset ("custom") grant. `ops` holds bare method names (e.g. `"find"`), not full permission codes. */
export type TCustomGrantMetadata = { ops: string[] };

export type TGrantIntent = { tier: TAuthorizationAction } | { ops: string[] };

/** Per-operation rows carry `targetId` = the operation's code, not a database id; the consumer resolves codes to ids when persisting. */
export type TPlannedGrantRow = ReturnType<typeof AuthorizationPolicyBuilder.grant> & {
  metadata?: { ops: string[] };
};
