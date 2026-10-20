import { SingletonRealm } from '@/helpers/singleton-realm';
import type { IdType } from '@/base';
import { BaseHelper, getError } from '@venizia/ignis-helpers/core';
import { type TNullable } from '@venizia/ignis-helpers/common';
import {
  AuthorizationActions,
  AuthorizationDecisions,
  type TAuthorizationAction,
  type TAuthorizationDecision,
  type TGrantIntent,
  type TPlannedGrantRow,
} from '../common';
import { AuthorizationPolicyBuilder, type TPolicyDomainInput } from './policy.builder';

/** One closure pass over the action lattice: adds every child reachable from an already-covered parent, reporting whether the set grew. */
const expandCoveredActions = (opts: { covered: Set<string> }): boolean => {
  const { covered } = opts;
  let grew = false;

  for (const edge of AuthorizationActions.LATTICE) {
    if (!covered.has(edge.parent) || covered.has(edge.child)) {
      continue;
    }

    covered.add(edge.child);
    grew = true;
  }

  return grew;
};

export class GrantBuilder extends BaseHelper {
  static readonly SINGLETON_REAL_KEY = 'grant-builder';

  /** Tiers a caller may ask for; `custom` is an encoding marker and is never a valid intent. */
  private static readonly PLANNABLE_TIERS = new Set<string>([
    AuthorizationActions.READ,
    AuthorizationActions.WRITE,
    AuthorizationActions.EXECUTE,
    AuthorizationActions.MANAGE,
  ]);

  /** Tried after `manage`; disjoint from each other, since an operation has one catalogued action. */
  private static readonly NARROW_TIERS: ReadonlyArray<TAuthorizationAction> = [
    AuthorizationActions.READ,
    AuthorizationActions.WRITE,
    AuthorizationActions.EXECUTE,
  ];

  constructor() {
    super({ scope: GrantBuilder.name });
  }

  static getInstance() {
    return SingletonRealm.resolve({
      key: GrantBuilder.SINGLETON_REAL_KEY,
      create: () => new GrantBuilder(),
    });
  }

  decodeMetadata<MetadataType = unknown>(opts: { metadata: MetadataType }) {
    if (typeof opts.metadata !== 'string') {
      return opts.metadata;
    }

    try {
      return JSON.parse(opts.metadata);
    } catch (error) {
      this.logger
        .for(this.decodeMetadata.name)
        .error('Failed to parse metadata | Error: %s', error);
      return null;
    }
  }

  /** Read `{ ops }` off a grant row's metadata, or null when the shape is unusable. Callers treat null as a defect to log and skip - never as an empty grant. */
  parseCustomGrantMetadata(opts: { metadata: unknown }): { ops: string[] } | null {
    const decoded = this.decodeMetadata(opts);

    if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) {
      return null;
    }

    const ops = (decoded as { ops?: unknown }).ops;
    if (!Array.isArray(ops) || ops.length === 0) {
      return null;
    }

    const seen = new Set<string>();
    const unique: string[] = [];

    for (const op of ops) {
      if (typeof op !== 'string' || op.length === 0) {
        return null;
      }

      if (!seen.has(op)) {
        seen.add(op);
        unique.push(op);
      }
    }

    return { ops: unique };
  }

  /** Split operation names into those present in the catalog for `subject` and those that are not. Pure - the caller supplies the catalog slice; the adapter re-runs this independently at read time. */
  validateCustomGrantOps(opts: {
    ops: string[];
    subject: string;
    catalog: Array<{ subject: string; method: string }>;
  }): { valid: string[]; unknown: string[] } {
    const known = new Set<string>();

    for (const entry of opts.catalog) {
      if (entry.subject === opts.subject) {
        known.add(entry.method);
      }
    }

    const valid: string[] = [];
    const unknown: string[] = [];

    for (const op of opts.ops) {
      if (known.has(op)) {
        valid.push(op);
        continue;
      }

      unknown.push(op);
    }

    return { valid, unknown };
  }

  /** Actions a tier confers, derived from LATTICE rather than hardcoded so the two cannot drift. */
  actionsCoveredBy(opts: { tier: TAuthorizationAction }): Set<string> {
    const covered = new Set<string>([opts.tier]);

    let grew = true;
    while (grew) {
      grew = expandCoveredActions({ covered });
    }

    return covered;
  }

  /** Decide which rows express an intent: a custom row is a last resort, so as much of the selection as possible collapses into tier grants first. `exact` disables collapsing when the caller means these operations and no future ones. Pure - the caller supplies the catalog and persists. */
  planGrant(opts: {
    subject: { type: string; id: IdType };
    resource: { type: string; id: IdType; subject: string };
    intent: TGrantIntent;
    catalog: Array<{ subject: string; method: string; code: string; action: string }>;
    domain?: TNullable<TPolicyDomainInput>;
    effect?: TAuthorizationDecision;
    supportsCustomMetadata?: boolean;
    exact?: boolean;
  }): TPlannedGrantRow[] {
    const effect = opts.effect ?? AuthorizationDecisions.ALLOW;
    const domain = opts.domain ?? null;

    if ('tier' in opts.intent) {
      if (!GrantBuilder.PLANNABLE_TIERS.has(opts.intent.tier)) {
        throw getError({
          message: `[planGrant] Invalid tier: ${opts.intent.tier} | Valids: [${[...GrantBuilder.PLANNABLE_TIERS].join(', ')}]`,
        });
      }

      return [
        AuthorizationPolicyBuilder.grant({
          subject: opts.subject,
          permission: { type: opts.resource.type, id: opts.resource.id },
          action: opts.intent.tier,
          domain,
          effect,
        }),
      ];
    }

    const seen = new Set<string>();
    const ops: string[] = [];

    for (const op of opts.intent.ops) {
      if (seen.has(op)) {
        continue;
      }

      seen.add(op);
      ops.push(op);
    }

    if (!ops.length) {
      throw getError({ message: '[planGrant] intent.ops must not be empty.' });
    }

    const subjectCatalog = opts.catalog.filter(entry => entry.subject === opts.resource.subject);
    const byMethod = new Map(subjectCatalog.map(entry => [entry.method, entry]));

    const unknown = ops.filter(op => !byMethod.has(op));
    if (unknown.length) {
      throw getError({
        message: `[planGrant] Unknown operations for resource "${opts.resource.subject}": ${unknown.join(', ')}`,
      });
    }

    const tierRow = (tier: TAuthorizationAction) =>
      AuthorizationPolicyBuilder.grant({
        subject: opts.subject,
        permission: { type: opts.resource.type, id: opts.resource.id },
        action: tier,
        domain,
        effect,
      });

    const rows: TPlannedGrantRow[] = [];
    const remaining = new Set(ops);

    if (opts.exact !== true) {
      this.collapseRemainingIntoTiers({ subjectCatalog, remaining, rows, tierRow });
    }

    const leftover = ops.filter(op => remaining.has(op));

    if (!leftover.length) {
      return rows;
    }

    const isPerOperationGrant = leftover.length === 1 || opts.supportsCustomMetadata === false;

    if (!isPerOperationGrant) {
      rows.push(
        AuthorizationPolicyBuilder.customGrant({
          subject: opts.subject,
          permission: { type: opts.resource.type, id: opts.resource.id },
          ops: leftover,
          domain,
          effect,
        }),
      );

      return rows;
    }

    for (const op of leftover) {
      const entry = byMethod.get(op);
      if (!entry) {
        throw getError({ message: `[planGrant] No catalog entry for operation "${op}".` });
      }

      rows.push(
        AuthorizationPolicyBuilder.grant({
          subject: opts.subject,
          permission: { type: opts.resource.type, id: entry.code },
          action: entry.action,
          domain,
          effect,
        }),
      );
    }

    return rows;
  }

  /** Collapse `remaining` into the fewest tier grants, mutating `remaining` and appending to `rows`. */
  protected collapseRemainingIntoTiers(opts: {
    subjectCatalog: Array<{ subject: string; method: string; code: string; action: string }>;
    remaining: Set<string>;
    rows: TPlannedGrantRow[];
    tierRow: (tier: TAuthorizationAction) => TPlannedGrantRow;
  }): void {
    const { subjectCatalog, remaining, rows, tierRow } = opts;

    // manage equals read+write+execute only when the subject has at least one operation in EACH narrow tier; otherwise manage also covers a future tier, which is more than the narrow tiers confer today.
    const spansAllNarrowTiers = GrantBuilder.NARROW_TIERS.every(tier => {
      const covered = this.actionsCoveredBy({ tier });
      return subjectCatalog.some(entry => covered.has(entry.action));
    });

    const manageCovered = this.actionsCoveredBy({ tier: AuthorizationActions.MANAGE });
    const manageOps = subjectCatalog
      .filter(entry => manageCovered.has(entry.action))
      .map(entry => entry.method);

    if (
      spansAllNarrowTiers &&
      manageOps.length &&
      manageOps.every(method => remaining.has(method))
    ) {
      rows.push(tierRow(AuthorizationActions.MANAGE));
      for (const method of manageOps) {
        remaining.delete(method);
      }

      return;
    }

    for (const tier of GrantBuilder.NARROW_TIERS) {
      const covered = this.actionsCoveredBy({ tier });
      const methods = subjectCatalog
        .filter(entry => covered.has(entry.action))
        .map(entry => entry.method);

      if (!methods.length || !methods.every(method => remaining.has(method))) {
        continue;
      }

      rows.push(tierRow(tier));
      for (const method of methods) {
        remaining.delete(method);
      }
    }
  }
}
