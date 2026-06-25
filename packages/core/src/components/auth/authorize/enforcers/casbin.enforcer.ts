import { TContext } from '@/base/controllers/common/types';
import { inject } from '@/base/metadata/injectors';
import { BaseHelper, BasePoolHelper, getError, HTTP, TNullable } from '@venizia/ignis-helpers';
import type { Enforcer as CasbinEnforcerType, Helper as CasbinHelperType } from 'casbin';
import { Env } from 'hono';
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
  ICasbinEnforcerCachedRedis,
  ICasbinEnforcerOptions,
  ICasbinRules,
  objectMatch,
  type IAuthorizationRequest,
  type TAuthorizationDecision,
  type TCasbinDomainMatchingFunction,
} from '../common';

/** Normalizer for the scoped/custom payload path — the exact shape returned by defaultScopedPayloadFn(). */
type TNormalizePayloadFn<E extends Env, TAction, TResource> = (opts: {
  user: IAuthorizationUser;
  action: TAction;
  resource: TResource;
  context: TContext<E, string>;
}) => { subject: string; resource: string; action: string; domain?: string };

// Casbin Authorization Enforcer — wraps casbin (optional peer dep)
//
// Each request evaluates on its OWN enforcer borrowed from a BasePoolHelper<Enforcer>. This kills the
// shared-model concurrency race: a borrowed enforcer is clearPolicy'd + loaded with THIS user's lines +
// buildRoleLinks'd + enforceSync'd atomically inside the same pool.use callback, and the pool destroys
// the enforcer on any error (fail-closed). Pooled enforcers are created WITHOUT an adapter (no DB load at
// warmup); the adapter is only used by the isolated throwaway extractor (extractUserLines).

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
  // cacheKey → the in-progress line-fetch for that key. Lets concurrent misses for the SAME user
  // share one extraction instead of all hitting the DB (see fetchLinesWithRedisCache).
  private readonly pendingLineFetches = new Map<string, Promise<string[]>>();

  // Resolved once in configure(): options.normalizePayloadFn / scoped are fixed after configure, so
  // we memoize the payload normalizer instead of rebuilding a closure on every evaluate() (hot path).
  // Stays `null` until configure() runs; resolves to `undefined` when not scoped + no custom fn (3-arg path).
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

    // Memoize the payload normalizer once — options.{normalizePayloadFn,scoped} are fixed after configure(),
    // so evaluate() reads this field instead of rebuilding a closure per request (hot path).
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

        // NO adapter → no DB load at warmup. Policies are loaded per-request in evaluate().
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

  /**
   * Boot-time smoke test for the matcher. casbin compiles the matcher expression LAZILY — not in
   * newEnforcer() or buildRoleLinks(), but on the first enforce — so a broken matcher would otherwise
   * only surface on the first real request (a 500 for a real user). Running one dummy enforceSync here
   * forces that compile at warmup, turning these into a fail-at-boot for an authz component:
   *   - matcher syntax errors in the model,
   *   - references to functions that registerMatchers() didn't register (e.g. a renamed g-relation),
   *   - request arity mismatch (4-token scoped model vs the 3/4 args we pass).
   * Bonus: enforceSync also throws if a matcher func is async — but every func we register is a sync
   * built-in, so that branch is effectively unreachable; the real value is the compile/wiring check above.
   */
  protected assertMatcherCompilesSync(opts: { enforcer: CasbinEnforcerType }) {
    try {
      if (this.options.isScoped || this.options.normalizePayloadFn) {
        opts.enforcer.enforceSync('::warmup', '::warmup', '::warmup', '::warmup');
        return;
      }

      opts.enforcer.enforceSync('::warmup', '::warmup', '::warmup');
    } catch (error) {
      throw getError({
        message: `[CasbinAuthorizationEnforcer] Matcher smoke test failed at warmup — the model matcher did not compile (check matcher syntax, that every referenced function is registered, and the request arity). ${String(error)}`,
      });
    }
  }

  // IAuthorizationEnforcer — public API

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
      fn: async enforcer => {
        // Load THIS user's lines + buildRoleLinks BEFORE any enforceSync on the borrowed enforcer.
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

        // Domain-aware enforcement: enforceSync(sub, dom, obj, act).
        // In scoped mode the model is 4-token (r = sub, dom, obj, act); a request with no resolvable
        // domain MUST still enforce with a domain — default to SYSTEM_WIDE, never fall through to the
        // 3-arg path (which would shift args against the scoped model and silently misjudge).
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

  /**
   * Run the matcher synchronously and, on DENY, log WHICH policy rule decided it. enforceExSync returns
   * `[isAllowed, matchedPolicy]` where matchedPolicy is the deciding rule (or `[]` when nothing matched →
   * default-deny). The explain index is computed by the effector regardless of this call, so capturing it
   * carries no meaningful cost over enforceSync — it just surfaces the reason for a denial to the logs.
   */
  protected enforceWithExplain(opts: { enforcer: CasbinEnforcerType; vals: string[] }): boolean {
    const [isAllowed, matchedPolicy] = opts.enforcer.enforceExSync(...opts.vals);

    if (!isAllowed) {
      this.logger
        .for(this.evaluate.name)
        .info(
          'DENY | request: [%s] | matchedPolicy: %s',
          opts.vals.join(', '),
          matchedPolicy.length ? matchedPolicy.join(', ') : '<none — default-deny>',
        );
    }

    return isAllowed;
  }

  // Cache management — optional IAuthorizationEnforcer members (on-demand)
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

    // Resolve the key once: drop the stale entry, then re-cache warm. Extraction runs on an ISOLATED
    // throwaway enforcer (not a serving model), so a concurrent request cannot make us cache another
    // user's policies under this key.
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

  /** Compute the user's cache key and reject an empty result — consistent with the read path. */
  protected async resolveCacheKey(opts: {
    user: IAuthorizationUser;
    cached: ICasbinEnforcerCachedRedis & { use: true };
  }): Promise<string> {
    const cacheKey = await opts.cached.options.keyFn({ user: opts.user });
    if (!cacheKey) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.BadRequest,
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
      await enforcer.addFunction('objectMatch', objectMatch);

      // objectMatch is the matching func for the resource hierarchy relation (g4 under the
      // request-tuple numbering); reference the constant so it tracks any future renumber.
      await enforcer.addNamedMatchingFunc(
        AuthorizationPolicyVariants.RESOURCE_INHERITS.rule,
        objectMatch,
      );
    }

    await enforcer.buildRoleLinks();
  }

  /** Map a CasbinDomainMatchingFunctions value to casbin's Util.*Func matcher. */
  protected resolveDomainMatchingFn(opts: {
    casbin: typeof import('casbin');
    name: TCasbinDomainMatchingFunction;
  }): (arg1: string, arg2: string) => boolean {
    // `Util` is casbin's bag of built-in comparison functions. Each `*Func` takes two strings
    // (the request value, the stored/policy value) and returns whether they "match":
    //   keyMatchFunc   — `*` is the only wildcard. keyMatch("anything","*")=true; exact otherwise.
    //                    (Best for domains: only treats `*` specially, never splits on `/` or `:`,
    //                     so it can never accidentally pattern-match a `Merchant_<uuid>`.)
    //   keyMatch2Func  — adds URL-path `:param` segments (e.g. "/u/:id" matches "/u/1").
    //   keyMatch3Func  — adds `{param}` segments (e.g. "/u/{id}").
    //   keyMatch4Func  — `{param}` with repeated-name equality checks.
    //   regexMatchFunc — treats the stored value as a full regular expression.
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
      // No domain here — evaluate() fills it from request.domain (set by the provider).
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

  /**
   * Fetch the user's policy lines, collapsing concurrent cache misses for the same key onto a single
   * extraction (via `pendingLineFetches`) instead of letting every request hit the DB at once.
   * Note: best-effort — two misses can both get past the cache read before either records its fetch
   * in the map, so both extract once (benign: per-user lines are identical). It collapses the common
   * case; the fast cache-hit path stays OUTSIDE the map to avoid needless contention.
   */
  protected async fetchLinesWithRedisCache(opts: {
    user: IAuthorizationUser;
    cached: ICasbinEnforcerCachedRedis & { use: true };
  }): Promise<string[]> {
    const { user, cached } = opts;
    const cacheKey = await this.resolveCacheKey({ user, cached });

    // Cache hit — Redis owns expiry (PX on write), so a present key is fresh by definition.
    // A corrupted/legacy entry must NOT 500 the request: discard it and fall through to refetch.
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

    // Cache miss (or discarded corrupt entry) — extract from an ISOLATED enforcer so a concurrent
    // load cannot contaminate the cache, persist it, then return the lines for THIS request.
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

  /**
   * Extract a user's policy lines from an ISOLATED throwaway enforcer (its own model + the adapter),
   * never a pooled serving enforcer. This is the core of the anti-poisoning design: concurrent requests
   * on pooled enforcers can't change what we cache for this user. Used by buildRules + rebuild.
   */
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

  /**
   * Serialize ALL policy + grouping rule types of an enforcer's model back into casbin lines.
   * Covers every p-type (p, p2, …) and g-type (g, g2, g3, g4, g5, …) — not just `p`/`g` — so the
   * cached payload is complete for the scoped model (resource/action/domain hierarchies + membership).
   * Reads stored rules (independent of role-link matching funcs), so the loader needs none registered.
   */
  protected async extractLinesFrom(enforcer: CasbinEnforcerType): Promise<string[]> {
    const model = enforcer.getModel();
    const lines: string[] = [];

    const policyTypes = model.model.get(CasbinRuleVariants.P);
    if (policyTypes) {
      for (const ptype of policyTypes.keys()) {
        const rules = await enforcer.getNamedPolicy(ptype);
        for (const rule of rules) {
          lines.push([ptype, ...rule].join(', '));
        }
      }
    }

    const groupingTypes = model.model.get(CasbinRuleVariants.G);
    if (groupingTypes) {
      for (const gtype of groupingTypes.keys()) {
        const rules = await enforcer.getNamedGroupingPolicy(gtype);
        for (const rule of rules) {
          lines.push([gtype, ...rule].join(', '));
        }
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
