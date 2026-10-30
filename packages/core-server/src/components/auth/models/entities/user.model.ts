import type { TIdSchemaType } from '@venizia/ignis-kernel';
import { AuthModelColumns } from './columns';

/** @deprecated Use `AuthModelColumns.buildUser(opts)`. Removed in 0.5. */
export const extraUserColumns = (opts?: { idType: TIdSchemaType }) =>
  AuthModelColumns.buildUser(opts);
