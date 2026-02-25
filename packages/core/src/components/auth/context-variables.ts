import { IdType } from '@/base/models/common/types';
import { Authentication } from './authenticate/common/constants';
import { Authorization } from './authorize/common/constants';
import type { IAuthUser } from './authenticate/common/types';

// --------------------------------------------------------------------------------------------------------
// Unified Hono ContextVariableMap augmentation for all auth subsystems
// --------------------------------------------------------------------------------------------------------

declare module 'hono' {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  interface ContextVariableMap {
    // Authentication
    [Authentication.CURRENT_USER]: IAuthUser;
    [Authentication.AUDIT_USER_ID]: IdType;
    [Authentication.SKIP_AUTHENTICATION]: boolean;

    // Authorization
    [Authorization.RULES]: unknown;
    [Authorization.SKIP_AUTHORIZATION]: boolean;
  }
}
