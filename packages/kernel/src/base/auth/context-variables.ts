import type { IdType } from '@/base/models/common/types';
import type { Authentication } from './authenticate/common/constants';
import type { Authorization } from './authorize/common/constants';
import type { IAuthUser } from './authenticate/common/types';

declare module 'hono' {
  interface ContextVariableMap {
    [Authentication.CURRENT_USER]: IAuthUser;
    [Authentication.AUDIT_USER_ID]: IdType;
    [Authentication.SKIP_AUTHENTICATION]: boolean;
    [Authorization.RULES]: unknown;
    [Authorization.SKIP_AUTHORIZATION]: boolean;
  }
}
