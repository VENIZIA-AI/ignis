import type { IdType } from '@/base';
import type { TNullable } from '@venizia/ignis-helpers/common';

export type TDomainHierarchyEdge = { child: string; parent: string };

export interface IScopedCasbinPolicyFilter {
  principal: { type: string; id: IdType };
}

/** A grant row as fetched, before it becomes casbin lines. Permission columns are null when the join misses. */
export type TGrantRow = {
  subjectId: IdType;
  objectCode: TNullable<string>;
  objectSubject: TNullable<string>;
  objectMethod: TNullable<string>;
  action: TNullable<string>;
  effect: TNullable<string>;
  domain: TNullable<string>;
  metadata?: unknown;
};

/**
 * Per-principal domain edges sourced from business data the app already owns (e.g. a tenant
 * foreign key) - read live on every cache miss, never duplicated into `domain_inherits`. An app
 * whose hierarchy genuinely lives in `domain_inherits` rows does not need this hook at all: the
 * DOMAIN_EDGE branch above already emits those as `g3` lines. `domains` is the principal's own
 * domain closure, already `<Type>_<id>` tokens; the returned edges must be too - neither side
 * re-formats them.
 *
 * `domains` is the principal's **membership closure** - built from `join_domain` rows plus both
 * ends of every `domainEdge` row. It is NOT the set of domains the principal holds a role in via
 * `assign_role`: a principal can carry `assign_role` at a domain it never joined. A hook ported
 * from a mechanism that derived its domains from `assign_role` will silently lose access for
 * exactly those principals - no error, no log, just fewer edges reaching `g`/`g2`/`g3` than before.
 *
 * More than one hierarchy axis (e.g. an organizer tree and a separate region tree)? Write one
 * function per axis and concatenate their results here - this hook deliberately takes a single
 * function, so composition stays visible in the application, not hidden inside the framework:
 * `resolveDomainEdges: async opts => [...(await organizerEdges(opts)), ...(await regionEdges(opts))]`.
 */
export type TResolveDomainEdgesFn = (opts: {
  principal: { type: string; id: IdType };
  domains: string[];
}) => Promise<TDomainHierarchyEdge[]>;
