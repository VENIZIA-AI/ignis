import type { IdType } from '@/base';
import type { TNullable } from '@venizia/ignis-helpers/common';
import type { TAuthorizationAction } from '../common/constants';
import { AuthorizationActions } from '../common/constants';

/** Builders for `Permission` catalog rows (the `obj` axis the scoped matcher resolves), generic over `TName` so i18n and plain-text apps both fit; only framework-owned columns (code/subject/method/action/scope/description/parentId) are produced - app columns are added by the caller. */
export class AuthorizationPermissionBuilder {
  /** Sentinel `method` for a coarse resource node (a grant target that is not a route). */
  static readonly RESOURCE_NODE_METHOD = '*';

  /** Standard repository method → base action. Unlisted methods (custom ops, aggregates) resolve to `execute`. */
  static readonly METHOD_ACTIONS: Readonly<Record<string, TAuthorizationAction>> = {
    find: AuthorizationActions.READ,
    findById: AuthorizationActions.READ,
    findOne: AuthorizationActions.READ,
    count: AuthorizationActions.READ,
    create: AuthorizationActions.CREATE,
    updateById: AuthorizationActions.UPDATE,
    updateBy: AuthorizationActions.UPDATE,
    deleteById: AuthorizationActions.DELETE,
    deleteBy: AuthorizationActions.DELETE,
  };

  /** The CRUD methods {@link crud} generates by default. */
  static readonly DEFAULT_CRUD_METHODS: ReadonlyArray<string> = [
    'find',
    'findById',
    'findOne',
    'count',
    'create',
    'updateById',
    'updateBy',
    'deleteById',
    'deleteBy',
  ];

  /** Base action for a method: a known CRUD method maps to read/create/update/delete; anything else → `execute`. */
  static actionForMethod(method: string): TAuthorizationAction {
    return AuthorizationPermissionBuilder.METHOD_ACTIONS[method] ?? AuthorizationActions.EXECUTE;
  }

  /** One operation-level permission, `code = <subject>.<method>`. `action` defaults to {@link actionForMethod}. */
  static operation<TName>(opts: {
    subject: string;
    method: string;
    scope: string;
    name: TName;
    description?: TNullable<TName>;
    action?: TAuthorizationAction;
    parentId?: TNullable<IdType>;
  }) {
    return {
      code: [opts.subject, opts.method].join('.'),
      subject: opts.subject,
      method: opts.method,
      action: opts.action ?? AuthorizationPermissionBuilder.actionForMethod(opts.method),
      scope: opts.scope,
      description: opts.description ?? null,
      parentId: opts.parentId ?? null,
      name: opts.name,
    };
  }

  /** A coarse resource node used as a grant target: `code` is the bare name, `method` the {@link RESOURCE_NODE_METHOD} sentinel, `action` defaults to `manage` (grants carry their own action). */
  static resourceNode<TName>(opts: {
    code: string;
    subject?: string;
    scope: string;
    name: TName;
    description?: TNullable<TName>;
    action?: TAuthorizationAction;
    parentId?: TNullable<IdType>;
  }) {
    return {
      code: opts.code,
      subject: opts.subject ?? opts.code,
      method: AuthorizationPermissionBuilder.RESOURCE_NODE_METHOD,
      action: opts.action ?? AuthorizationActions.MANAGE,
      scope: opts.scope,
      description: opts.description ?? null,
      parentId: opts.parentId ?? null,
      name: opts.name,
    };
  }

  /** The CRUD permission set for a subject. `name` (and optional `description`) are per-method formatters, so the app supplies its own labels/i18n; the framework only owns the method-to-action map and the code shape. */
  static crud<TName>(opts: {
    subject: string;
    scope: string;
    name: (ctx: { subject: string; method: string; action: TAuthorizationAction }) => TName;
    description?: (ctx: {
      subject: string;
      method: string;
      action: TAuthorizationAction;
    }) => TNullable<TName>;
    methods?: ReadonlyArray<string>;
  }) {
    const methods = opts.methods ?? AuthorizationPermissionBuilder.DEFAULT_CRUD_METHODS;

    return methods.map(method => {
      const action = AuthorizationPermissionBuilder.actionForMethod(method);
      const ctx: { subject: string; method: string; action: TAuthorizationAction } = {
        subject: opts.subject,
        method,
        action,
      };

      return AuthorizationPermissionBuilder.operation<TName>({
        subject: opts.subject,
        method,
        scope: opts.scope,
        action,
        name: opts.name(ctx),
        description: opts.description ? opts.description(ctx) : undefined,
      });
    });
  }

  /** g4 resource matcher (r.obj vs p.obj): derives standard edges (endpoint ⊂ subject ⊂ `*`) from the dotted code {@link operation} produces, while non-standard nesting stays stored g4 edges served by `ResourceRoleManager`. Registered via `enforcer.addFunction` - must stay static. */
  static objectMatch(requested: string, granted: string): boolean {
    if (granted === '*') {
      return true;
    }

    if (requested === granted) {
      return true;
    }

    return requested.startsWith(`${granted}.`);
  }
}
