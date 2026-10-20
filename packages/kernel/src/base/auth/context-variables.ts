import type { IdType } from '@/base/models/common';
import type { Authentication } from './authenticate/common/constants';
import type { Authorization } from './authorize/common/constants';
import type { IAuthUser } from './authenticate/common/types';

declare module 'hono' {
  interface ContextVariableMap {
    [Authentication.CURRENT_USER]: IAuthUser;
    [Authentication.AUDIT_USER_ID]: IdType;
    [Authentication.SKIP_AUTHENTICATION]: boolean;
    /**
     * Rule sets built for THIS request, keyed by enforcer name. A single slot used to hold one
     * anonymous rule set, so a second `authorize()` naming a different enforcer silently evaluated
     * against the first one's rules - and nothing could detect the mismatch, because the value
     * carried no ownership.
     */
    [Authorization.RULES]: Map<string, unknown>;
    [Authorization.SKIP_AUTHORIZATION]: boolean;
  }
}
