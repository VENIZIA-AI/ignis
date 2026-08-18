import { TContext } from '@venizia/ignis-kernel';
import { inject } from '@venizia/ignis-kernel';
import { BaseHelper, BasePoolHelper, getError } from '@venizia/ignis-helpers/core';
import { TNullable } from '@venizia/ignis-helpers/common';
import type { Enforcer as CasbinEnforcerType, Helper as CasbinHelperType } from 'casbin';
import { Env } from 'hono';
import { AuthorizationPermissionBuilder } from '@venizia/ignis-kernel';
import {
  AuthorizationDecisions,
  AuthorizationDomainScopes,
  AuthorizationEnforcerTypes,
  AuthorizationPolicyVariants,
  AuthorizeBindingKeys,
  CasbinDomainMatchingFunctions,
  CasbinEnforcerModelDrivers,
  CasbinRuleVariants,
  IAuthorizationEnforcer,
  IAuthorizationUser,
  AuthorizationErrors,
  ICasbinEnforcerCachedRedis,
  ICasbinEnforcerOptions,
  ICasbinRules,
  type IAuthorizationRequest,
  type TAuthorizationDecision,
  type TCasbinDomainMatchingFunction,
} from '@venizia/ignis-kernel';
import { ResourceRoleManager } from './resource-role-manager';

/** Payload shape for the scoped/custom path, matching defaultScopedPayloadFn(). */
type TNormalizePayloadFn<E extends Env, TAction, TResource> = (opts: {
  user: IAuthorizationUser;
  action: TAction;
  resource: TResource;
  context: TContext<E, string>;
}) => { subject: string; resource: string; action: string; domain?: string };

// Wraps casbin (optional peer dep). Each request borrows its own pooled enforcer; any error during use destroys it (fail-closed). Pooled enforcers carry no adapter - only extractUserLines uses one.

export class CasbinAuthorizationEnforcer<
  E extends Env = Env,
  TAction extends string = string,
  TResource extends string = string,
>
  extends BaseHelper
  implements IAuthorizationEnforcer<E, TAction, TResource, ICasbinRules>
{
  name = CasbinAuthorizationEnforcer.name;
  private readonly MIN_EXPIRES_IN = 10_000;

  private pool: TNullable<BasePoolHelper<CasbinEnforcerType>> = null;
  private helper: TNullable<typeof CasbinHelperType> = null;
  // cacheKey -> in-progress line-fetch; concurrent misses for the same user share one extraction instead of all hitting the DB (see fetchLinesWithRedisCache).
  private readonly pendingLineFetches = new Map<string, Promise<string[]>>();

  // Memoized in configure() (options are fixed after) to avoid rebuilding this closure on every evaluate() (hot path).
  private resolvedPayloadFn: TNullable<TNormalizePayloadFn<E, TAction, TResource>> = null;

  constructor(
    @inject({ key: AuthorizeBindingKeys.enforcerOptions(AuthorizationEnforcerTypes.CASBIN) })
    private options: ICasbinEnforcerOptions<E, TAction, TResource>,
  ) {
    super({ scope: CasbinAuthorizationEnforcer.name });
  }

  // Lifecycle

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

    this.helper = casbin.Helper;

    this.resolvedPayloadFn = this.options.normalizePayloadFn ?? this.defaultScopedPayloadFn();

    const { cached } = this.options;
    if (cached.use) {
      this.validateExpiresIn({ expiresIn: cached.options.expiresIn });
    }

    this.pool = new BasePoolHelper<CasbinEnforcerType>({
      scope: `${CasbinAuthorizationEnforcer.name}.Pool`,
      size: this.options.poolSize ?? 16,
      acquireTimeoutMs: this.options.poolAcquireTimeoutMs ?? 5000,
      create: async () => {
        const model = this.resolveModel({ casbin, model: this.options.model });

        const enforcer = await casbin.newEnforcer(model);
        await this.registerMatchers({ enforcer, casbin });
        this.assertMatcherCompilesSync({ enforcer });

        return enforcer;
      },
    });
    await this.pool.warmup();

    this.logger
      .for(this.configure.name)
      .info(
        'Casbin enforcer pool ready (size: %s, cached: %s)',
        this.options.poolSize ?? 16,
        cached.use ? cached.driver : 'none',
      );
  }

  destroy(): void {
    this.pool?.destroy().catch(error => {
      this.logger.for(this.destroy.name).warn('Pool destroy failed: %s', error);
    });
  }

  /** casbin compiles the matcher lazily (first enforce, not newEnforcer/buildRoleLinks); this dummy enforceSync forces the compile at warmup so syntax / unregistered-function / arity errors fail boot. */
  protected assertMatcherCompilesSync(opts: { enforcer: CasbinEnforcerType }) {
    try {
      if (this.options.isScoped || this.options.normalizePayloadFn) {
        opts.enforcer.enforceSync('::warmup', '::warmup', '::warmup', '::warmup');
        return;
      }

      opts.enforcer.enforceSync('::warmup', '::warmup', '::warmup');
    } catch (error) {
      throw getError({
        message: `[CasbinAuthorizationEnforcer] Matcher smoke test failed at warmup - the model matcher did not compile (check matcher syntax, that every referenced function is registered, and the request arity). ${String(error)}`,
      });
    }
  }

  // IAuthorizationEnforcer - public API

  async buildRules(opts: {
    user: IAuthorizationUser;
    context: TContext<E, string>;
  }): Promise<ICasbinRules> {
    const { user } = opts;
    const cached = this.options.cached;

    const lines = cached.use
      ? await this.fetchLinesWithRedisCache({ user, cached })
      : await this.extractUserLines({ user });

    return { user, lines };
  }

  async evaluate(opts: {
    rules: ICasbinRules;
    request: IAuthorizationRequest<TAction, TResource>;
    context: TContext<E, string>;
  }): Promise<TAuthorizationDecision> {
    if (!this.pool) {
      throw getError({
        message: '[CasbinAuthorizationEnforcer] Not configured. Call configure() first.',
      });
    }

    if (!opts.request?.action || !opts.request?.resource) {
      throw getError({
        message: '[CasbinAuthorizationEnforcer] request.action and request.resource are required.',
      });
    }

    const { rules, request, context } = opts;
    const { user, lines } = rules;

    return this.pool.use({
      execution: async enforcer => {
        await this.loadPolicyLinesIntoModel({ enforcer, lines });

        const normalizePayloadFn = this.resolvedPayloadFn;

        if (!normalizePayloadFn) {
          const subject = `${user.principalType}_${user.userId}`;
          const isAllowed = this.enforceWithExplain({
            enforcer,
            vals: [subject, String(request.resource), String(request.action)],
          });
          return isAllowed ? AuthorizationDecisions.ALLOW : AuthorizationDecisions.DENY;
        }

        const normalized = normalizePayloadFn({
          user,
          action: request.action,
          resource: request.resource,
          context,
        });

        // Scoped model is 4-token (sub, dom, obj, act): a request with no resolvable domain still needs one - default SYSTEM_WIDE, never the 3-arg path, which misaligns args and silently misjudges.
        const domain =
          normalized.domain ??
          request.domain ??
          (this.options.isScoped ? AuthorizationDomainScopes.SYSTEM_WIDE : undefined);

        const vals = domain
          ? [normalized.subject, domain, normalized.resource, normalized.action]
          : [normalized.subject, normalized.resource, normalized.action];
        const isAllowed = this.enforceWithExplain({ enforcer, vals });

        return isAllowed ? AuthorizationDecisions.ALLOW : AuthorizationDecisions.DENY;
      },
    });
  }

  /** On DENY, logs the deciding policy rule; matchedPolicy is `[]` when nothing matched (default-deny). */
  protected enforceWithExplain(opts: { enforcer: CasbinEnforcerType; vals: string[] }): boolean {
    const [isAllowed, matchedPolicy] = opts.enforcer.enforceExSync(...opts.vals);

    if (!isAllowed) {
      this.logger
        .for(this.evaluate.name)
        .info(
          'DENY | request: [%s] | matchedPolicy: %s',
          opts.vals.join(', '),
          matchedPolicy.length ? matchedPolicy.join(', ') : '<none - default-deny>',
        );
    }

    return isAllowed;
  }

  // Cache management - optional IAuthorizationEnforcer members (on-demand)
  async invalidateUserCache(opts: {
    user: IAuthorizationUser;
  }): Promise<{ invalidatedKeys: number }> {
    const cached = this.requireRedisCache();
    const cacheKey = await this.resolveCacheKey({ user: opts.user, cached });
    const invalidatedKeys = await cached.options.connection.del({ keys: [cacheKey] });

    this.logger
      .for(this.invalidateUserCache.name)
      .info(
        'Invalidated authz cache | user: %s | key: %s | deleted: %s',
        opts.user.userId,
        cacheKey,
        invalidatedKeys,
      );

    return { invalidatedKeys };
  }

  async rebuildUserCache(opts: {
    user: IAuthorizationUser;
  }): Promise<{ cacheKey: string; lineCount: number }> {
    const cached = this.requireRedisCache();

    // Extraction runs on an isolated throwaway enforcer (not a serving model), so a concurrent request cannot make us cache another user's policies under this key.
    const cacheKey = await this.resolveCacheKey({ user: opts.user, cached });
    await cached.options.connection.del({ keys: [cacheKey] });

    const lines = await this.extractUserLines({ user: opts.user });
    await this.writeCachedPolicyLines({ cacheKey, lines, options: cached.options });

    this.logger
      .for(this.rebuildUserCache.name)
      .info(
        'Rebuilt authz cache | user: %s | key: %s | lines: %s',
        opts.user.userId,
        cacheKey,
        lines.length,
      );

    return { cacheKey, lineCount: lines.length };
  }

  /** Compute the user's cache key and reject an empty result - consistent with the read path. */
  protected async resolveCacheKey(opts: {
    user: IAuthorizationUser;
    cached: ICasbinEnforcerCachedRedis & { use: true };
  }): Promise<string> {
    const cacheKey = await opts.cached.options.keyFn({ user: opts.user });
    if (!cacheKey) {
      throw getError({
        error: AuthorizationErrors.CACHE_KEY_INVALID,
        message: '[CasbinAuthorizationEnforcer] keyFn returned an empty cache key.',
      });
    }

    return cacheKey;
  }

  /** Narrow `options.cached` to the redis variant; cache management is redis-only. */
  protected requireRedisCache(): ICasbinEnforcerCachedRedis & { use: true } {
    const { cached } = this.options;

    if (!cached.use) {
      throw getError({
        message:
          '[CasbinAuthorizationEnforcer] Cache management requires the redis cache driver, but caching is disabled.',
      });
    }

    return cached;
  }

  // Matchers & model resolvers

  protected async registerMatchers(opts: {
    enforcer: CasbinEnforcerType;
    casbin: typeof import('casbin');
  }): Promise<void> {
    const { enforcer, casbin } = opts;
    const { domainMatching, isScoped } = this.options;

    if (domainMatching) {
      if (!enforcer.getNamedRoleManager(domainMatching.roleDefinition)) {
        throw getError({
          message: `[registerMatchers] Role definition "${domainMatching.roleDefinition}" is not declared in the Casbin model. Declare it under [role_definition] (e.g. \`g = _, _, _\`) before enabling domainMatching.`,
        });
      }

      const matchFn = this.resolveDomainMatchingFn({ casbin, name: domainMatching.fn });
      await enforcer.addNamedDomainMatchingFunc(domainMatching.roleDefinition, matchFn);
    }

    if (isScoped) {
      await enforcer.addNamedDomainMatchingFunc(CasbinRuleVariants.G, casbin.Util.keyMatchFunc);
      await enforcer.addFunction('objectMatch', AuthorizationPermissionBuilder.objectMatch);

      // A dedicated role manager for the resource axis, NOT addNamedMatchingFunc: a matching func sets casbin's `hasPattern`, which makes every hasLink rebuild the whole g4 graph.
      enforcer.setNamedRoleManager(
        AuthorizationPolicyVariants.RESOURCE_INHERITS.rule,
        new ResourceRoleManager(),
      );
    }

    await enforcer.buildRoleLinks();
  }

  /** Map a CasbinDomainMatchingFunctions value to casbin's Util.*Func matcher. */
  protected resolveDomainMatchingFn(opts: {
    casbin: typeof import('casbin');
    name: TCasbinDomainMatchingFunction;
  }): (arg1: string, arg2: string) => boolean {
    // casbin Util built-ins: (requestValue, policyValue) => match. keyMatchFunc only special-cases `*` (never splits on `/` or `:`), so it cannot pattern-match a `Merchant_<uuid>`; see CasbinDomainMatchingFunctions for per-function semantics.
    const { Util } = opts.casbin;
    switch (opts.name) {
      case CasbinDomainMatchingFunctions.KEY_MATCH: {
        return Util.keyMatchFunc;
      }
      case CasbinDomainMatchingFunctions.KEY_MATCH_2: {
        return Util.keyMatch2Func;
      }
      case CasbinDomainMatchingFunctions.KEY_MATCH_3: {
        return Util.keyMatch3Func;
      }
      case CasbinDomainMatchingFunctions.KEY_MATCH_4: {
        return Util.keyMatch4Func;
      }
      case CasbinDomainMatchingFunctions.REGEX_MATCH: {
        return Util.regexMatchFunc;
      }
      default: {
        throw getError({
          message: `[resolveDomainMatchingFn] Unsupported func: ${opts.name} | Valids: [${[...CasbinDomainMatchingFunctions.SCHEME_SET].join(', ')}]`,
        });
      }
    }
  }

  /** Default (sub,dom,obj,act) payload for the scoped model; domain comes from request.domain. */
  protected defaultScopedPayloadFn(): TNormalizePayloadFn<E, TAction, TResource> | undefined {
    if (!this.options.isScoped) {
      return undefined;
    }

    return (opts: {
      user: IAuthorizationUser;
      action: TAction;
      resource: TResource;
    }): { subject: string; resource: string; action: string; domain?: string } => {
      // No domain here - evaluate() fills it from request.domain (set by the provider).
      return {
        subject: `${opts.user.principalType}_${opts.user.userId}`,
        resource: String(opts.resource),
        action: String(opts.action),
      };
    };
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

  // Policy loading internals

  /** Fetch the user's lines, collapsing concurrent misses per key onto one extraction. Best-effort: two misses may race past the cache read and both extract (benign - per-user lines are identical). */
  protected async fetchLinesWithRedisCache(opts: {
    user: IAuthorizationUser;
    cached: ICasbinEnforcerCachedRedis & { use: true };
  }): Promise<string[]> {
    const { user, cached } = opts;
    const cacheKey = await this.resolveCacheKey({ user, cached });

    // Cache hit - Redis owns expiry (PX on write), so a present key is fresh; a corrupted/legacy entry must NOT 500 the request, so it is discarded and refetched.
    const raw = await cached.options.connection.get({ key: cacheKey });
    if (raw) {
      const lines = this.parseCachedPolicyLines({ raw, cacheKey });

      if (lines) {
        return lines;
      }
    }

    const existing = this.pendingLineFetches.get(cacheKey);
    if (existing) {
      return existing;
    }

    // Cache miss (or discarded corrupt entry) - extract from an ISOLATED enforcer so a concurrent load cannot contaminate the cache, persist it, then return the lines for THIS request.
    const task = async () => {
      const lines = await this.extractUserLines({ user });
      await this.writeCachedPolicyLines({ cacheKey, lines, options: cached.options });
      return lines;
    };

    const promise = task().finally(() => {
      this.pendingLineFetches.delete(cacheKey);
    });

    this.pendingLineFetches.set(cacheKey, promise);
    return promise;
  }

  /** Single source of truth for the Redis cache encoding. Used by miss-path and rebuild. */
  protected async writeCachedPolicyLines(opts: {
    cacheKey: string;
    lines: string[];
    options: ICasbinEnforcerCachedRedis['options'];
  }): Promise<void> {
    await opts.options.connection.set({
      key: opts.cacheKey,
      value: opts.lines,
      options: { expiresIn: opts.options.expiresIn },
    });
  }

  /** Decode cached policy lines; on any corruption, log and return null so the caller refetches. */
  protected parseCachedPolicyLines(opts: { raw: string; cacheKey: string }): TNullable<string[]> {
    try {
      const parsed = JSON.parse(opts.raw);

      if (!Array.isArray(parsed) || parsed.some(line => typeof line !== 'string')) {
        throw getError({
          message: '[CasbinAuthorizationEnforcer] Cached payload is not an array of policy lines.',
        });
      }

      return parsed as string[];
    } catch (error) {
      this.logger
        .for(this.parseCachedPolicyLines.name)
        .warn('Discarding corrupted authz cache entry | key: %s | error: %s', opts.cacheKey, error);
      return null;
    }
  }

  /** Extract a user's lines from an ISOLATED throwaway enforcer (own model + adapter), never a pooled serving one, so concurrent requests cannot change what we cache. */
  protected async extractUserLines(opts: { user: IAuthorizationUser }): Promise<string[]> {
    const casbin = await import('casbin');
    const model = this.resolveModel({ casbin, model: this.options.model });
    const loader = await casbin.newEnforcer(model, this.options.adapter);

    if (!loader.loadFilteredPolicy) {
      throw getError({
        message: '[extractUserLines] Adapter does not support loadFilteredPolicy.',
      });
    }

    await loader.loadFilteredPolicy({
      principal: { type: opts.user.principalType, id: opts.user.userId },
    });

    return this.extractLinesFrom(loader);
  }

  /** Serialize ALL p-types and g-types (not just `p`/`g`) back into casbin lines so the cached payload is complete for the scoped model; it reads stored rules, so the loader needs no matching funcs registered. */
  protected async extractLinesFrom(enforcer: CasbinEnforcerType): Promise<string[]> {
    const model = enforcer.getModel();
    const lines: string[] = [];

    const policyTypes = model.model.get(CasbinRuleVariants.P);
    for (const ptype of policyTypes?.keys() ?? []) {
      const rules = await enforcer.getNamedPolicy(ptype);
      for (const rule of rules) {
        lines.push([ptype, ...rule].join(', '));
      }
    }

    const groupingTypes = model.model.get(CasbinRuleVariants.G);
    for (const gtype of groupingTypes?.keys() ?? []) {
      const rules = await enforcer.getNamedGroupingPolicy(gtype);
      for (const rule of rules) {
        lines.push([gtype, ...rule].join(', '));
      }
    }

    return lines;
  }

  /** Atomically reset a borrowed enforcer's model to exactly `lines` + rebuild role links. */
  protected async loadPolicyLinesIntoModel(opts: {
    enforcer: CasbinEnforcerType;
    lines: string[];
  }): Promise<void> {
    if (!this.helper) {
      throw getError({
        message: '[loadPolicyLinesIntoModel] Not configured. Call configure() first.',
      });
    }

    const model = opts.enforcer.getModel();
    model.clearPolicy();

    for (const line of opts.lines) {
      this.helper.loadPolicyLine(line, model);
    }

    await opts.enforcer.buildRoleLinks();
  }
}
