import { TContext } from '@/base/controllers/common/types';
import { inject } from '@/base/metadata/injectors';
import { BaseHelper, getError } from '@venizia/ignis-helpers';
import { IAuthUser } from '../../authenticate';
import {
  AuthorizeBindingKeys,
  IAuthorizationEnforcer,
  IAuthorizeOptions,
  TAuthorizationConditions,
} from '../common';

// --------------------------------------------------------------------------------------------------------
// Casbin Authorization Enforcer — wraps casbin (optional peer dep)
// --------------------------------------------------------------------------------------------------------

export class CasbinAuthorizationEnforcer
  extends BaseHelper
  implements IAuthorizationEnforcer<IAuthUser>
{
  name = 'casbin';

  private enforcer: any = null;

  constructor(@inject({ key: AuthorizeBindingKeys.OPTIONS }) private options: IAuthorizeOptions) {
    super({ scope: CasbinAuthorizationEnforcer.name });
  }

  // ---------------------------------------------------------------------------
  async configure(): Promise<void> {
    let casbin: typeof import('casbin');

    try {
      casbin = await import('casbin');
    } catch {
      throw getError({
        message:
          '[CasbinAuthorizationEnforcer] casbin is not installed. Install it with: bun add casbin',
      });
    }

    const { casbinOptions } = this.options;
    if (!casbinOptions) {
      throw getError({
        message:
          '[CasbinAuthorizationEnforcer] casbinOptions is required when using Casbin enforcer',
      });
    }

    this.enforcer = await casbin.newEnforcer(casbinOptions.model, casbinOptions.adapter);
    this.logger.for(this.configure.name).info('Casbin enforcer initialized');
  }

  // ---------------------------------------------------------------------------
  // Casbin uses the user object as "abilities" — the casbin engine evaluates policies internally.
  async buildAbilities(opts: { user: IAuthUser; context: TContext }): Promise<IAuthUser> {
    const { user } = opts;

    if (this.options.casbinOptions?.useFilteredPolicy && this.enforcer?.loadFilteredPolicy) {
      const userRoles = (user as Record<string, unknown>).roles as
        | Array<{ id: string | number; identifier: string }>
        | undefined;

      const filters = [`user_${user.userId}`];
      if (userRoles?.length) {
        for (const role of userRoles) {
          filters.push(`role_${role.identifier}`);
        }
      }

      await this.enforcer.loadFilteredPolicy({ p: filters });
      this.logger
        .for(this.buildAbilities.name)
        .debug('Loaded filtered policies for user: %s', user.userId);
    }

    return user;
  }

  // ---------------------------------------------------------------------------
  evaluate(opts: {
    abilities: IAuthUser;
    action: string;
    resource: string;
    conditions?: TAuthorizationConditions;
  }): boolean {
    if (!this.enforcer) {
      throw getError({
        message: '[CasbinAuthorizationEnforcer] Enforcer not initialized. Call configure() first.',
      });
    }

    const { abilities: user } = opts;
    const { normalizePayloadFn } = this.options;

    let subject = `user_${user.userId}`;
    let resource = opts.resource;
    let action = opts.action;

    if (normalizePayloadFn) {
      const normalized = normalizePayloadFn({ user, action, resource });
      subject = normalized.subject;
      resource = normalized.resource;
      action = normalized.action;
    }

    return this.enforcer.enforceSync(subject, resource, action);
  }
}
