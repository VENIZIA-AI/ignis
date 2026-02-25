import { TContext } from '@/base/controllers/common/types';
import { inject } from '@/base/metadata/injectors';
import { BaseHelper, getError, HTTP, TNullable } from '@venizia/ignis-helpers';
import type {
  CachedEnforcer as CasbinCachedEnforcerType,
  Enforcer as CasbinEnforcerType,
} from 'casbin';
import { Env } from 'hono';
import { IAuthUser } from '../../authenticate';
import {
  AuthorizationDecisions,
  AuthorizeBindingKeys,
  IAuthorizationEnforcer,
  IAuthorizeOptions,
  ICasbinEnforcerCachedMemory,
  ICasbinEnforcerCachedRedis,
  type IAuthorizationComparable,
  type IAuthorizationRequest,
  type TAuthorizationDecision,
} from '../common';

// --------------------------------------------------------------------------------------------------------
// Casbin Authorization Enforcer — wraps casbin (optional peer dep)
// --------------------------------------------------------------------------------------------------------

export class CasbinAuthorizationEnforcer<
  E extends Env = Env,
  TAction extends string | IAuthorizationComparable = string,
  TResource extends string | IAuthorizationComparable = string,
>
  extends BaseHelper
  implements IAuthorizationEnforcer<E, TAction, TResource, IAuthUser>
{
  name = 'casbin';
  private readonly MIN_EXPIRES_IN = 10_000;

  private enforcer: TNullable<CasbinEnforcerType | CasbinCachedEnforcerType> = null;
  private inMemoryInvalidationTimer: TNullable<NodeJS.Timeout> = null;

  constructor(
    @inject({ key: AuthorizeBindingKeys.OPTIONS })
    private options: IAuthorizeOptions<E, TAction, TResource>,
  ) {
    super({ scope: CasbinAuthorizationEnforcer.name });
  }

  // ---------------------------------------------------------------------------
  async configure(): Promise<void> {
    let casbin: typeof import('casbin');

    try {
      casbin = await import('casbin');
    } catch {
      throw getError({
        message: '[CasbinAuthorizationEnforcer] "casbin" is not installed',
      });
    }

    const casbinOptions = this.options.enforcers?.casbin;
    if (!casbinOptions) {
      throw getError({
        message: '[CasbinAuthorizationEnforcer] options.enforcers.casbin is required.',
      });
    }

    if (!casbinOptions.model) {
      throw getError({
        message: '[CasbinAuthorizationEnforcer] options.enforcers.casbin.model is required.',
      });
    }

    const { cached } = casbinOptions;
    const common = { casbin, model: casbinOptions.model, adapter: casbinOptions.adapter };

    if (!cached.use) {
      this.enforcer = await casbin.newEnforcer(common.model, common.adapter);
    } else {
      switch (cached.driver) {
        case 'in-memory': {
          await this.configureInMemoryCache({ ...common, cached });
          break;
        }
        case 'redis': {
          await this.configureRedisCache({ ...common, cached });
          break;
        }
        default: {
          throw getError({
            message: '[configure] Invalid cached.driver | Valids: [in-memory, redis]',
          });
        }
      }
    }

    this.logger
      .for(this.configure.name)
      .info(
        'Casbin enforcer initialized (cached: %s, driver: %s)',
        cached.use,
        cached.use ? cached.driver : 'none',
      );
  }

  // ---------------------------------------------------------------------------
  private async configureInMemoryCache(opts: {
    casbin: typeof import('casbin');
    model: string;
    adapter?: unknown;
    cached: ICasbinEnforcerCachedMemory;
  }): Promise<void> {
    const { casbin, model, adapter, cached } = opts;
    const { expiresIn } = cached.options;

    this.validateExpiresIn({ expiresIn });

    this.enforcer = await casbin.newCachedEnforcer(model, adapter);

    this.inMemoryInvalidationTimer = setInterval(() => {
      if (!this.enforcer) {
        return;
      }

      (this.enforcer as CasbinCachedEnforcerType).invalidateCache();

      this.logger.info('[configureInMemoryCache] Enforcer cache INVALIDATED | name: %s', this.name);
    }, expiresIn);
  }

  // ---------------------------------------------------------------------------
  private async configureRedisCache(opts: {
    casbin: typeof import('casbin');
    model: string;
    adapter?: unknown;
    cached: ICasbinEnforcerCachedRedis;
  }): Promise<void> {
    const { casbin, model, adapter, cached } = opts;
    const { expiresIn } = cached.options;

    this.validateExpiresIn({ expiresIn });
    this.enforcer = await casbin.newEnforcer(model, adapter);
  }

  // ---------------------------------------------------------------------------
  private validateExpiresIn(opts: { expiresIn: number }): void {
    if (opts.expiresIn < this.MIN_EXPIRES_IN) {
      throw getError({
        message: `[CasbinAuthorizationEnforcer] cached.options.expiresIn must be >= ${this.MIN_EXPIRES_IN} (ms) | Received: ${opts.expiresIn}`,
      });
    }
  }

  // ---------------------------------------------------------------------------
  async buildRules(opts: {
    user: { principalType: string } & IAuthUser;
    context: TContext<E, string>;
  }): Promise<IAuthUser> {
    const { user } = opts;

    if (!this.enforcer) {
      throw getError({
        message: '[CasbinAuthorizationEnforcer] Enforcer not initialized. Call configure() first.',
      });
    }

    if (!this.options.enforcers?.casbin?.useFilteredPolicy) {
      throw getError({
        message: '[CasbinAuthorizationEnforcer] useFilteredPolicy must be enabled to build rules.',
      });
    }

    if (!this.enforcer.loadFilteredPolicy) {
      throw getError({
        message: '[CasbinAuthorizationEnforcer] Adapter does not support loadFilteredPolicy.',
      });
    }

    const cached = this.options.enforcers.casbin.cached;

    if (!cached.use) {
      await this.loadPoliciesFromAdapter({ user });
      return user;
    }

    switch (cached.driver) {
      case 'in-memory': {
        await this.loadPoliciesFromAdapter({ user });
        break;
      }
      case 'redis': {
        await this.loadPoliciesWithRedisCache({ user, cached });
        break;
      }
      default: {
        throw getError({
          message: '[buildRules] Invalid cached.driver | Valids: [in-memory, redis]',
        });
      }
    }
    return user;
  }

  // ---------------------------------------------------------------------------
  private async loadPoliciesFromAdapter(opts: { user: { principalType: string } & IAuthUser }) {
    if (!this.enforcer) {
      throw getError({
        message:
          '[loadPoliciesFromAdapter] Invalid state of enforcer | Enforcer is not initialized!',
      });
    }

    await this.enforcer.loadFilteredPolicy({
      principalType: opts.user.principalType,
      principalValue: opts.user.userId,
    });
  }

  // ---------------------------------------------------------------------------
  private async loadPoliciesWithRedisCache(opts: {
    user: { principalType: string } & IAuthUser;
    cached: ICasbinEnforcerCachedRedis;
  }) {
    const logger = this.logger.for(this.loadPoliciesWithRedisCache.name);
    const {
      user,
      cached: { options },
    } = opts;

    const cacheKey = await options.keyFn({ user });

    if (!cacheKey) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.BadRequest,
        message:
          '[loadPoliciesWithRedisCache] Invalid cachedKey to start validate user authorization!',
      });
    }

    const redisClient = options.connection.client;

    // Cache hit — load lines directly into model
    const cachedData = await redisClient.get(cacheKey);
    if (cachedData) {
      await this.loadPolicyLinesIntoModel({ lines: JSON.parse(cachedData) });
      logger.info('Loaded CACHED Policies into model | user: %s', user.userId);
      return;
    }

    // Cache miss — load from adapter, extract lines, cache in Redis
    await this.loadPoliciesFromAdapter({ user });
    const lines = this.extractPolicyLines();
    await redisClient.set(cacheKey, JSON.stringify(lines), 'PX', options.expiresIn);
    logger.info('Loaded ADAPTER + CACHED Policies into model | user: %s', user.userId);
  }

  // ---------------------------------------------------------------------------
  private async extractPolicyLines() {
    if (!this.enforcer) {
      throw getError({
        message: '[extractPolicyLines] Invalid state of enforcer | Enforcer is not initialized!',
      });
    }

    const pRules = await this.enforcer.getPolicy();
    const ps = pRules.map(r => ['p', ...r].join(', '));

    const gRules = await this.enforcer.getGroupingPolicy();
    const gs = gRules.map(r => ['g', ...r].join(', '));

    return [...ps, ...gs];
  }

  // ---------------------------------------------------------------------------
  private async loadPolicyLinesIntoModel(opts: { lines: string[] }): Promise<void> {
    const { Helper } = await import('casbin');

    const model = this.enforcer!.getModel();
    model.clearPolicy();

    for (const line of opts.lines) {
      Helper.loadPolicyLine(line, model);
    }
  }

  // ---------------------------------------------------------------------------
  async evaluate(opts: {
    rules: IAuthUser;
    request: IAuthorizationRequest<TAction, TResource>;
    context: TContext<E, string>;
  }): Promise<TAuthorizationDecision> {
    if (!this.enforcer) {
      throw getError({
        message: '[CasbinAuthorizationEnforcer] Enforcer not initialized. Call configure() first.',
      });
    }

    if (!opts.request?.action || !opts.request?.resource) {
      throw getError({
        message: '[CasbinAuthorizationEnforcer] request.action and request.resource are required.',
      });
    }

    const { rules: user, request, context } = opts;
    const normalizePayloadFn = this.options.enforcers?.casbin?.normalizePayloadFn;

    let isAllowed: boolean;

    if (!normalizePayloadFn) {
      const subject = `user_${user.userId}`;
      isAllowed = this.enforcer.enforceSync(subject, request.resource, request.action);
      return isAllowed ? AuthorizationDecisions.ALLOW : AuthorizationDecisions.DENY;
    }

    const normalized = normalizePayloadFn({
      user,
      action: request.action,
      resource: request.resource,
      context,
    });

    // Domain-aware enforcement: enforceSync(sub, dom, obj, act)
    if (normalized.domain) {
      isAllowed = this.enforcer.enforceSync(
        normalized.subject,
        normalized.domain,
        normalized.resource,
        normalized.action,
      );
    } else {
      isAllowed = this.enforcer.enforceSync(
        normalized.subject,
        normalized.resource,
        normalized.action,
      );
    }

    return isAllowed ? AuthorizationDecisions.ALLOW : AuthorizationDecisions.DENY;
  }

  destroy() {
    if (!this.inMemoryInvalidationTimer) {
      return;
    }

    clearInterval(this.inMemoryInvalidationTimer);
    this.inMemoryInvalidationTimer = null;
  }
}
