import type { TIdSchemaType } from '@venizia/ignis-kernel';
import { AuthModelColumns } from './columns';

export type TPolicyDefinitionOptions<ExtraVariant extends string = never> = {
  idType?: TIdSchemaType;
  /**
   * App-only edge kinds stored in this same table alongside IGNIS's seven (e.g. `merchant_role`).
   * `ScopedCasbinAdapter` never selects an undeclared variant - it is purely the consumer's data.
   * Pass as an inline array literal; the `const` type parameter below infers the literal union
   * from it without needing `as const`.
   */
  extraVariants?: ReadonlyArray<ExtraVariant>;
};

/** @deprecated Use `AuthModelColumns.buildPolicyDefinition(opts)`. Removed in 0.5. */
export const extraPolicyDefinitionColumns = AuthModelColumns.buildPolicyDefinition;

/** @deprecated Use `AuthModelColumns.buildPolicyDefinitionDomainShapeCheck(opts)`. Removed in 0.5. */
export const policyDefinitionDomainShapeCheck =
  AuthModelColumns.buildPolicyDefinitionDomainShapeCheck;
