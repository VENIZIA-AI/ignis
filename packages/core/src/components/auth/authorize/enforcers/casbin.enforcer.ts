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
  AuthorizationEnforcerTypes,
  AuthorizeBindingKeys,
  CasbinEnforcerCachedDrivers,
  CasbinEnforcerModelDrivers,
  CasbinRuleVariants,
  IAuthorizationEnforcer,
  ICasbinEnforcerCachedRedis,
  ICasbinEnforcerOptions,
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
  name = CasbinAuthorizationEnforcer.name;
  private readonly MIN_EXPIRES_IN = 10_000;

  private enforcer: TNullable<CasbinEnforcerType | CasbinCachedEnforcerType> = null;
  private inMemoryInvalidationTimer: TNullable<NodeJS.Timeout> = null;

  constructor(
    @inject({ key: AuthorizeBindingKeys.enforcerOptions(AuthorizationEnforcerTypes.CASBIN) })
    private options: ICasbinEnforcerOptions<E, TAction, TResource>,
  ) {
    super({ scope: CasbinAuthorizationEnforcer.name });
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
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

    if (!this.options.model) {
      throw getError({
        message: '[CasbinAuthorizationEnforcer] options.model is required.',
      });
    }

    const model = this.resolveModel({ casbin, model: this.options.model });
    const { cached } = this.options;

    this.enforcer = await this.resolveCasbinEnforcer({
      casbin,
      model,
      adapter: this.options.adapter,
      cached,
    });

    this.logger
      .for(this.configure.name)
      .info(
        'Casbin enforcer initialized (cached: %s, driver: %s)',
        cached.use,
        cached.use ? cached.driver : 'none',
      );
  }

  destroy() {
    if (!this.inMemoryInvalidationTimer) {
      return;
    }

    clearInterval(this.inMemoryInvalidationTimer);
    this.inMemoryInvalidationTimer = null;
  }

  // ---------------------------------------------------------------------------
  // IAuthorizationEnforcer — public API
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

    if (!this.enforcer.loadFilteredPolicy) {
      throw getError({
        message: '[CasbinAuthorizationEnforcer] Adapter does not support loadFilteredPolicy.',
      });
    }

    const cached = this.options.cached;

    if (!cached.use) {
      await this.loadPoliciesFromAdapter({ user });
      return user;
    }

    switch (cached.driver) {
      case CasbinEnforcerCachedDrivers.IN_MEMORY: {
        await this.loadPoliciesFromAdapter({ user });
        break;
      }
      case CasbinEnforcerCachedDrivers.REDIS: {
        await this.loadPoliciesWithRedisCache({ user, cached });
        break;
      }
      default: {
        throw getError({
          message: `[buildRules] Invalid cached.driver | Valids: [${CasbinEnforcerCachedDrivers.IN_MEMORY}, ${CasbinEnforcerCachedDrivers.REDIS}]`,
        });
      }
    }
    return user;
  }

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
    const normalizePayloadFn = this.options.normalizePayloadFn;

    let isAllowed: boolean;

    if (!normalizePayloadFn) {
      const subject = `${user.principalType}_${user.userId}`;
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

  // ---------------------------------------------------------------------------
  // Enforcer & model resolvers
  // ---------------------------------------------------------------------------

  protected async resolveCasbinEnforcer(opts: {
    casbin: typeof import('casbin');
    model: import('casbin').Model;
    adapter?: unknown;
    cached: ICasbinEnforcerOptions['cached'];
  }): Promise<CasbinEnforcerType | CasbinCachedEnforcerType> {
    const { casbin, model, adapter, cached } = opts;

    if (!cached.use) {
      return casbin.newEnforcer(model, adapter);
    }

    switch (cached.driver) {
      case CasbinEnforcerCachedDrivers.IN_MEMORY: {
        this.validateExpiresIn({ expiresIn: cached.options.expiresIn });

        const enforcer = await casbin.newCachedEnforcer(model, adapter);

        this.inMemoryInvalidationTimer = setInterval(() => {
          enforcer.invalidateCache();
          this.logger.info(
            '[resolveCasbinEnforcer] Enforcer cache INVALIDATED | name: %s',
            this.name,
          );
        }, cached.options.expiresIn);

        return enforcer;
      }
      case CasbinEnforcerCachedDrivers.REDIS: {
        this.validateExpiresIn({ expiresIn: cached.options.expiresIn });
        return casbin.newEnforcer(model, adapter);
      }
      default: {
        throw getError({
          message: `[resolveCasbinEnforcer] Invalid cached.driver | Valids: [${CasbinEnforcerCachedDrivers.IN_MEMORY}, ${CasbinEnforcerCachedDrivers.REDIS}]`,
        });
      }
    }
  }

  protected resolveModel(opts: {
    casbin: typeof import('casbin');
    model: ICasbinEnforcerOptions['model'];
  }) {
    const { casbin, model } = opts;

    switch (model.driver) {
      case CasbinEnforcerModelDrivers.FILE: {
        return casbin.newModelFromFile(model.definition);
      }
      case CasbinEnforcerModelDrivers.TEXT: {
        return casbin.newModelFromString(model.definition);
      }
      default: {
        throw getError({
          message: `[resolveModel] Invalid model.driver | Valids: [${CasbinEnforcerModelDrivers.FILE}, ${CasbinEnforcerModelDrivers.TEXT}]`,
        });
      }
    }
  }

  protected validateExpiresIn(opts: { expiresIn: number }): void {
    if (opts.expiresIn >= this.MIN_EXPIRES_IN) {
      return;
    }

    throw getError({
      message: `[CasbinAuthorizationEnforcer] cached.options.expiresIn must be >= ${this.MIN_EXPIRES_IN} (ms) | Received: ${opts.expiresIn}`,
    });
  }

  // ---------------------------------------------------------------------------
  // Policy loading internals
  // ---------------------------------------------------------------------------

  protected async loadPoliciesFromAdapter(opts: { user: { principalType: string } & IAuthUser }) {
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

  protected async loadPoliciesWithRedisCache(opts: {
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
      const lines = JSON.parse(cachedData);
      await this.loadPolicyLinesIntoModel({ lines });
      logger.info('Loaded CACHED Policies into model | user: %s', user.userId);
      return;
    }

    // Cache miss — load from adapter, extract lines, cache in Redis
    await this.loadPoliciesFromAdapter({ user });
    const lines = await this.extractPolicyLines();
    await redisClient.set(cacheKey, JSON.stringify(lines), 'PX', options.expiresIn);
    logger.info('Loaded ADAPTER + CACHED Policies into model | user: %s', user.userId);
  }

  protected async extractPolicyLines() {
    if (!this.enforcer) {
      throw getError({
        message: '[extractPolicyLines] Invalid state of enforcer | Enforcer is not initialized!',
      });
    }

    const pRules = await this.enforcer.getPolicy();
    const ps = pRules.map(r => [CasbinRuleVariants.P, ...r].join(', '));

    const gRules = await this.enforcer.getGroupingPolicy();
    const gs = gRules.map(r => [CasbinRuleVariants.G, ...r].join(', '));

    return [...ps, ...gs];
  }

  protected async loadPolicyLinesIntoModel(opts: { lines: string[] }): Promise<void> {
    if (!this.enforcer) {
      throw getError({
        message: '[loadPolicyLinesIntoModel] Enforcer not initialized. Call configure() first.',
      });
    }

    const { Helper } = await import('casbin');

    const model = this.enforcer.getModel();
    model.clearPolicy();

    for (const line of opts.lines) {
      Helper.loadPolicyLine(line, model);
    }

    await this.enforcer.buildRoleLinks();
  }
}
