import { AuthorizationActions } from '@/base/auth/authorize/common/constants';
import type { IAuthorizationSpec } from '@/base/auth/authorize/common/types';
import { getError } from '@venizia/ignis-helpers/core';
import type { ICustomizableRoutes } from '../common';

/** The generated routes that change data: the ones that must never be answered by a `read` permission. */
const WRITE_VERBS = ['create', 'updateById', 'updateBy', 'deleteById', 'deleteBy'] as const;

const describeSpec = (spec: IAuthorizationSpec): string => {
  return `{ action: ${String(spec.action)}, resource: ${String(spec.resource)} }`;
};

/**
 * Refuses a CRUD controller whose enabled write verb would inherit a controller-level `authorize`
 * that is only a `read` permission: the verb would then answer to anyone who may read.
 *
 * A write verb is fine when it declares its own `authorize` (a spec, an array, or `{ skip: true }`),
 * skips authentication, is not enabled, or the controller is `readonly`. Only the literal action
 * `read` is detected; a custom action name is the application's own vocabulary. An array counts when
 * every spec in it is `read`, since the specs of one route must all pass.
 */
export const assertWriteVerbsDeclareAuthorize = (opts: {
  controllerName: string;
  authorize: IAuthorizationSpec | IAuthorizationSpec[] | undefined;
  routes: ICustomizableRoutes | undefined;
  readonly: boolean | undefined;
  enabledRoutes: Array<keyof ICustomizableRoutes> | undefined;
}): void => {
  const { controllerName, authorize, routes, readonly, enabledRoutes } = opts;

  if (readonly || authorize == null) {
    return;
  }

  const specs = Array.isArray(authorize) ? authorize : [authorize];
  const isReadOnlyPermission =
    specs.length > 0 && specs.every((spec) => spec.action === AuthorizationActions.READ);

  if (!isReadOnlyPermission) {
    return;
  }

  const offending = WRITE_VERBS.filter((verb) => {
    const isEnabled = enabledRoutes
      ? enabledRoutes.includes(verb)
      : routes?.[verb]?.enabled !== false;
    if (!isEnabled) {
      return false;
    }

    const route = routes?.[verb];
    return route?.authenticate?.skip !== true && route?.authorize == null;
  });

  if (offending.length === 0) {
    return;
  }

  const inherited = specs.map(describeSpec).join(', ');
  const verbs = offending.map((verb) => `${controllerName}.${verb}`).join(', ');
  const hasBulkVerb = offending.some((verb) => verb === 'updateBy' || verb === 'deleteBy');

  throw getError({
    message: [
      `[defineCrudController] Write routes would inherit a read-only authorize | controller: ${controllerName} | routes: ${verbs} | inherited: ${inherited}`,
      'Anyone allowed to read could then create, update or delete.',
      `Fix: declare routes.<verb>.authorize for each of them (a spec, an array or { skip: true }), or set controller.readonly, or leave them out of controller.enabledRoutes.`,
      ...(hasBulkVerb
        ? [
            'updateBy and deleteBy are bulk routes on the collection and are generated unless controller.enabledRoutes lists the routes you want, so dropping them there closes this too.',
          ]
        : []),
    ].join(' | '),
  });
};
