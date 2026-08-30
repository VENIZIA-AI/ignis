import { TContext } from '@venizia/ignis-kernel';
import { inject } from '@venizia/ignis-kernel';
import { BaseHelper, BasePoolHelper, getError } from '@venizia/ignis-helpers/core';
import { TNullable } from '@venizia/ignis-helpers/common';
import type {
  Enforcer as CasbinEnforcerType,
  Helper as CasbinHelperType,
  RoleManager as CasbinRoleManagerType,
} from 'casbin';
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
  ICasbinEnforcerOptions,
  ICasbinRules,
  type IAuthorizationRequest,
  type TAuthorizationDecision,
  type TCasbinDomainMatchingFunction,
} from '@venizia/ignis-kernel';
import { DomainHierarchyStore } from './domain-hierarchy';
import { DomainHierarchyRoleManager } from './domain-hierarchy-role-manager';
import { MembershipRoleManager } from './membership-role-manager';
import { PolicyLineCodec } from './policy-line-codec';
import { ResourceRoleManager } from './resource-role-manager';
import { UserPolicyLineCache } from './user-policy-line-cache';

/** Payload shape for the scoped/custom path, matching defaultScopedPayloadFn(). */
type TNormalizePayloadFn<E extends Env, TAction, TResource> = (opts: {
  user: IAuthorizationUser;
  action: TAction;
  resource: TResource;
  context: TContext<E, string>;
}) => { subject: string; resource: string; action: string; domain?: string };

/** `addDomainHierarchy` lives on casbin's `DefaultRoleManager`, not on the `RoleManager` interface or the `Enforcer` facade - feature-detect it on whatever `getNamedRoleManager` returns. */
interface ICasbinRoleManagerWithDomainHierarchy {
  addDomainHierarchy?(rm: CasbinRoleManagerType): Promise<void>;
}

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
  private domainHierarchyStore: TNullable<DomainHierarchyStore> = null;
  // Lazily created on first cache use (see requireRedisCache) - one instance for the enforcer's lifetime so its single-flight de-dup map actually dedupes.
  private userPolicyLineCache: TNullable<UserPolicyLineCache> = null;

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

    if (this.options.domainHierarchy) {
      const domainHierarchyStore = new DomainHierarchyStore({
        load: this.options.domainHierarchy.load,
        refreshMs: this.options.domainHierarchy.refreshMs,
        maxStaleMs: this.options.domainHierarchy.maxStaleMs,
      });
      // Must fail boot, never serve with an empty tree - warmup() throws on a failed initial load.
      await domainHierarchyStore.warmup();
      // Assigned before the pool is created: pool.create() runs registerMatchers(), which reads this field.
      this.domainHierarchyStore = domainHierarchyStore;
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
        'Casbin enforcer pool ready (size: %s, cached: %s, domainHierarchy: %s, edges: %s)',
        this.options.poolSize ?? 16,
        cached.use ? cached.driver : 'none',
        this.domainHierarchyStore ? 'on' : 'off',
        this.domainHierarchyStore?.graph.edgeCount ?? 0,
      );
  }

  destroy(): void {
    this.pool?.destroy().catch(error => {
      this.logger.for(this.destroy.name).warn('Pool destroy failed: %s', error);
    });
    this.domainHierarchyStore?.destroy();
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
      ? await this.requireRedisCache().fetch({ user })
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
    const { cacheKey, invalidatedKeys } = await this.requireRedisCache().invalidate({
      user: opts.user,
    });

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
    // Extraction runs on an isolated throwaway enforcer (not a serving model), so a concurrent request cannot make us cache another user's policies under this key.
    const { cacheKey, lines } = await this.requireRedisCache().rebuild({ user: opts.user });

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

  /**
   * Force-reload the shared domain-hierarchy tree now, ignoring its TTL. Refreshes only THIS
   * process - it is not a cluster-wide broadcast, so a multi-instance deployment needs one call
   * per process to make e.g. a newly created child domain visible everywhere immediately.
   */
  async invalidateDomainHierarchy(): Promise<{ nodeCount: number; edgeCount: number }> {
    if (!this.domainHierarchyStore) {
      throw getError({
        message:
          '[CasbinAuthorizationEnforcer] invalidateDomainHierarchy() was called but options.domainHierarchy is not enabled on this enforcer.',
      });
    }

    await this.domainHierarchyStore.reload();
    const { nodeCount, edgeCount } = this.domainHierarchyStore.graph;

    this.logger
      .for(this.invalidateDomainHierarchy.name)
      .info('Domain hierarchy reloaded | nodes: %s | edges: %s', nodeCount, edgeCount);

    return { nodeCount, edgeCount };
  }

  /** Narrow `options.cached` to the redis variant and lazily create the per-user line cache - memoized so its single-flight de-dup map is shared across calls rather than reset on every access. */
  protected requireRedisCache(): UserPolicyLineCache {
    const { cached } = this.options;

    if (!cached.use) {
      throw getError({
        message:
          '[CasbinAuthorizationEnforcer] Cache management requires the redis cache driver, but caching is disabled.',
      });
    }

    return (this.userPolicyLineCache ??= new UserPolicyLineCache({
      cached,
      loadLines: opts => this.extractUserLines(opts),
    }));
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

      const { domainHierarchyStore } = this;
      if (domainHierarchyStore) {
        // Shared across g2, g3, and the reversed `g` instance below: casbin never puts the
        // `g`-axis hierarchy manager in rmMap, so it never receives addLink and would miss
        // per-request g3 edges - g2 needs the same freshness for a just-created child domain.
        const domainHierarchyOverlay = new Map<string, Set<string>>();

        // g2 (membership) and g3 (domain nesting, request-domain-first) sit on their own axes.
        enforcer.setNamedRoleManager(
          CasbinRuleVariants.G2,
          new MembershipRoleManager({
            store: domainHierarchyStore,
            overlay: domainHierarchyOverlay,
          }),
        );

        enforcer.setNamedRoleManager(
          CasbinRuleVariants.G3,
          new DomainHierarchyRoleManager({
            store: domainHierarchyStore,
            overlay: domainHierarchyOverlay,
          }),
        );

        // addNamedDomainMatchingFunc(G, keyMatchFunc) above must stay: generateTempRoles ORs
        // hasDomainPattern with hasDomainHierarchy, and role_inherits `*` rides the keyMatch path.
        const gRoleManager = enforcer.getNamedRoleManager(CasbinRuleVariants.G) as
          (CasbinRoleManagerType & ICasbinRoleManagerWithDomainHierarchy) | undefined;

        if (!gRoleManager?.addDomainHierarchy) {
          throw getError({
            message:
              '[registerMatchers] The "g" role manager does not expose addDomainHierarchy() - domainHierarchy requires casbin\'s DefaultRoleManager on the g axis (present in casbin ^5.51.1, this package\'s pinned range). Upgrade casbin, or check that a custom role manager was not substituted for "g".',
          });
        }

        await gRoleManager.addDomainHierarchy(
          new DomainHierarchyRoleManager({
            store: domainHierarchyStore,
            reversed: true,
            overlay: domainHierarchyOverlay,
          }),
        );
      }
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

  /** Resolves this enforcer's model, then delegates the isolated-enforcer extraction (own model + adapter, never a pooled serving one, so concurrent requests cannot change what we cache) to PolicyLineCodec. */
  protected async extractUserLines(opts: { user: IAuthorizationUser }): Promise<string[]> {
    const casbin = await import('casbin');
    const model = this.resolveModel({ casbin, model: this.options.model });

    return PolicyLineCodec.extractUserLines({
      casbin,
      model,
      adapter: this.options.adapter,
      user: opts.user,
    });
  }

  /** Requires configure() to have resolved the casbin Helper; the clearPolicy + loadPolicyLine + buildRoleLinks ordering lives in PolicyLineCodec. */
  protected async loadPolicyLinesIntoModel(opts: {
    enforcer: CasbinEnforcerType;
    lines: string[];
  }): Promise<void> {
    if (!this.helper) {
      throw getError({
        message: '[loadPolicyLinesIntoModel] Not configured. Call configure() first.',
      });
    }

    await PolicyLineCodec.loadLinesIntoModel({
      enforcer: opts.enforcer,
      lines: opts.lines,
      helper: this.helper,
    });
  }
}
