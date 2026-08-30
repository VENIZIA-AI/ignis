import type { IdType } from '@/base';
import type { TConstValue, TNullable } from '@venizia/ignis-helpers/common';
import { type Model } from 'casbin';
import { sql, type SQL } from 'drizzle-orm';
import { GrantBuilder } from '@venizia/ignis-kernel';
import {
  AuthorizationActions,
  AuthorizationDecisions,
  AuthorizationDomainScopes,
  AuthorizationPolicyVariants,
} from '@venizia/ignis-kernel';
import { BaseFilteredAdapter } from './base-filtered';
import { CustomGrantExpander, type TCustomGrantRow } from './custom-grant-expander';
import type { ICasbinPolicySource, IScopedCasbinEntities } from './types';

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

export class PrincipalPolicyEdges {
  static readonly DIRECT = 'direct';
  static readonly ROLE_EDGE = 'roleEdge';
  static readonly ROLE_GRANT = 'roleGrant';
  static readonly DOMAIN_EDGE = 'domainEdge';
}

/** A row from the single principal-policy statement; `kind` says which branch produced it. */
export type TPrincipalPolicyRow = TGrantRow & {
  kind: TConstValue<typeof PrincipalPolicyEdges>;
  variant: string;
  targetType: TNullable<string>;
  targetId: IdType;
};

const DEFAULT_SCHEMA = 'public';

/**
 * Per-principal domain edges sourced from business data the app already owns (e.g. a tenant
 * foreign key) - read live on every cache miss, never duplicated into `domain_inherits`. An app
 * whose hierarchy genuinely lives in `domain_inherits` rows does not need this hook at all: the
 * DOMAIN_EDGE branch above already emits those as `g3` lines. `domains` is the principal's own
 * domain closure, already `<Type>_<id>` tokens; the returned edges must be too - neither side
 * re-formats them.
 */
export type TResolveDomainEdgesFn = (opts: {
  principal: { type: string; id: IdType };
  domains: string[];
}) => Promise<TDomainHierarchyEdge[]>;

/** Filtered casbin adapter for the scoped RBAC model: loads ONE principal's edges (role assignments, memberships, grants) plus the shared structural hierarchy trees as casbin lines. Read-only. */
export class ScopedCasbinAdapter extends BaseFilteredAdapter<IScopedCasbinPolicyFilter> {
  protected readonly entities: IScopedCasbinEntities;
  protected readonly customGrantExpander: CustomGrantExpander;
  protected readonly resolveDomainEdges?: TResolveDomainEdgesFn;

  constructor(opts: {
    dataSource: ICasbinPolicySource;
    entities: IScopedCasbinEntities;
    resolveDomainEdges?: TResolveDomainEdgesFn;
  }) {
    super({ scope: ScopedCasbinAdapter.name, dataSource: opts.dataSource });
    this.entities = opts.entities;
    this.resolveDomainEdges = opts.resolveDomainEdges;
    this.customGrantExpander = new CustomGrantExpander({
      dataSource: opts.dataSource,
      entities: { permission: opts.entities.permission, softDelete: opts.entities.softDelete },
    });
  }

  /**
   * One wave: the principal-scoped CTE and the merged structural-edges query are issued together -
   * the role closure resolves in SQL, so neither waits on the other. `resolveDomainEdges` cannot
   * join that wave - it needs the domain closure the principal-scoped CTE produces - but it does
   * not wait for the structural-edges query either: both run concurrently once the closure is known.
   */
  async loadFilteredPolicy(model: Model, filter: IScopedCasbinPolicyFilter): Promise<void> {
    const { principal } = filter;
    const { principals } = this.entities;

    const principalPoliciesPromise = this.queryPrincipalPolicies({ principal });
    const structuralEdgesPromise = this.queryEdgePolicies();
    const principalRows = await principalPoliciesPromise;

    const lines: string[] = [];
    const directGrants: TGrantRow[] = [];
    const roleGrants: TGrantRow[] = [];
    const domainClosure = new Set<string>();

    for (const row of principalRows) {
      switch (row.kind) {
        case PrincipalPolicyEdges.ROLE_EDGE: {
          lines.push(
            `${AuthorizationPolicyVariants.ROLE_INHERITS.rule}, ${principals.role}_${row.subjectId}, ${principals.role}_${row.targetId}, *`,
          );
          break;
        }

        case PrincipalPolicyEdges.ROLE_GRANT: {
          roleGrants.push(row);
          break;
        }

        case PrincipalPolicyEdges.DOMAIN_EDGE: {
          lines.push(
            `${AuthorizationPolicyVariants.DOMAIN_INHERITS.rule}, ${row.subjectId}, ${row.targetId}`,
          );
          // Both ends are, by construction, members of the principal's domain_closure CTE.
          domainClosure.add(String(row.subjectId));
          domainClosure.add(String(row.targetId));
          break;
        }

        default: {
          if (row.variant === AuthorizationPolicyVariants.JOIN_DOMAIN.action) {
            domainClosure.add(`${row.targetType}_${row.targetId}`);
          }
          this.collectDirectRow({ row, principal, lines, directGrants });
          break;
        }
      }
    }

    const hookLinesPromise = this.resolveDomainEdgeLines({
      principal,
      domains: [...domainClosure],
    });

    lines.push(
      ...(await this.buildGrantLines({ subjectType: principal.type, rows: directGrants })),
    );
    lines.push(...(await this.buildGrantLines({ subjectType: principals.role, rows: roleGrants })));

    const [structuralEdges, hookLines] = await Promise.all([
      structuralEdgesPromise,
      hookLinesPromise,
    ]);
    lines.push(...structuralEdges);
    lines.push(...hookLines);

    await this.loadLines({ model, lines });
  }

  /** Route one `direct` row to its casbin line, or to the grant batch. */
  protected collectDirectRow(opts: {
    row: TPrincipalPolicyRow;
    principal: { type: string; id: IdType };
    lines: string[];
    directGrants: TGrantRow[];
  }): void {
    const { row, principal, lines, directGrants } = opts;
    const { principals } = this.entities;

    switch (row.variant) {
      case AuthorizationPolicyVariants.ASSIGN_ROLE.action: {
        lines.push(
          `${AuthorizationPolicyVariants.ASSIGN_ROLE.rule}, ${principal.type}_${principal.id}, ${principals.role}_${row.targetId}, ${row.domain ?? '*'}`,
        );
        break;
      }

      case AuthorizationPolicyVariants.JOIN_DOMAIN.action: {
        lines.push(
          `${AuthorizationPolicyVariants.JOIN_DOMAIN.rule}, ${principal.type}_${principal.id}, ${row.targetType}_${row.targetId}`,
        );
        break;
      }

      case AuthorizationPolicyVariants.GRANT.action: {
        directGrants.push(row);
        break;
      }

      default: {
        this.logger
          .for(this.collectDirectRow.name)
          .error('Unexpected variant in the direct branch | variant: %s', row.variant);
        break;
      }
    }
  }

  /**
   * Calls the `resolveDomainEdges` hook, if supplied, and turns its edges into `g3` lines using
   * the same shape the DOMAIN_EDGE branch emits. A throwing hook is logged and treated as no
   * edges - the rows already gathered for this principal still load. This is the safe direction:
   * a missing hierarchy edge can only narrow what `g`/`g2`/`g3` reach, never widen it, so the
   * failure degrades to less access rather than either an outage or excess access.
   */
  protected async resolveDomainEdgeLines(opts: {
    principal: { type: string; id: IdType };
    domains: string[];
  }): Promise<string[]> {
    if (!this.resolveDomainEdges) {
      return [];
    }

    let edges: TDomainHierarchyEdge[];
    try {
      edges = await this.resolveDomainEdges(opts);
    } catch (error) {
      this.logger
        .for(this.resolveDomainEdgeLines.name)
        .error(
          'resolveDomainEdges hook threw - continuing without its edges for this load | principal: %s_%s | error: %s',
          opts.principal.type,
          opts.principal.id,
          error,
        );
      return [];
    }

    return edges.map(
      edge => `${AuthorizationPolicyVariants.DOMAIN_INHERITS.rule}, ${edge.child}, ${edge.parent}`,
    );
  }

  /** Schema for a table, defaulting to `public`. */
  protected schemaOf(table: { schemaName?: string }): string {
    return table.schemaName ?? DEFAULT_SCHEMA;
  }

  /** Schema-qualified table reference (`"<schema>"."<table>"`) for use after FROM/JOIN with an alias. */
  protected qualifiedTable(opts: { table: { schemaName?: string; tableName: string } }): SQL {
    const { table } = opts;
    return sql`${sql.identifier(this.schemaOf(table))}.${sql.identifier(table.tableName)}`;
  }

  /** `AND <alias>.<col> IS NULL` when soft-delete is on, else empty. The alias is emitted raw to match the unquoted FROM alias - quoting folds it to a different case and breaks the join. */
  protected softDeleteClause(opts: { alias: string }): SQL {
    const sd = this.entities.softDelete;
    if (!sd?.use) {
      return sql.empty();
    }

    return sql` AND ${sql.raw(opts.alias)}.${sql.identifier(sd.columnName)} IS NULL`;
  }

  /** One statement for everything scoped to a principal: its own edges, the role_inherits edges reachable from its roles, and the grants of that closure. `UNION` in the recursive term is what terminates a cyclic role graph. */
  protected async queryPrincipalPolicies(opts: {
    principal: { type: string; id: IdType };
  }): Promise<TPrincipalPolicyRow[]> {
    const { policyDefinition, permission, principals, domainTypes } = this.entities;
    const policyDefinitionTable = this.qualifiedTable({ table: policyDefinition });
    const permissionTable = this.qualifiedTable({ table: permission });
    const { principal } = opts;

    const metadataColumnName = policyDefinition.metadata?.columnName;
    const metadataSelection = metadataColumnName
      ? sql`, policyDefinition.${sql.identifier(metadataColumnName)} AS "metadata"`
      : sql.empty();
    const metadataNull = metadataColumnName ? sql`, NULL::jsonb AS "metadata"` : sql.empty();

    const domainTypeList = sql.join(
      domainTypes.map(domainType => sql`${domainType}`),
      sql`, `,
    );

    const rows = await this.query<TPrincipalPolicyRow>({
      statement: sql`
      WITH RECURSIVE role_closure AS (
        SELECT policyDefinition.target_id AS role_id
        FROM ${policyDefinitionTable} policyDefinition
        WHERE policyDefinition.variant = ${AuthorizationPolicyVariants.ASSIGN_ROLE.action}
          AND policyDefinition.subject_type = ${principal.type}
          AND policyDefinition.subject_id = ${principal.id}
          AND policyDefinition.target_type = ${principals.role}${this.softDeleteClause({ alias: 'policyDefinition' })}

        UNION

        SELECT policyDefinition.target_id
        FROM ${policyDefinitionTable} policyDefinition
          JOIN role_closure ON policyDefinition.subject_id = role_closure.role_id
        WHERE policyDefinition.variant = ${AuthorizationPolicyVariants.ROLE_INHERITS.action}${this.softDeleteClause({ alias: 'policyDefinition' })}
      ),

      domain_closure AS (
        SELECT policyDefinition.target_type AS dom_type, policyDefinition.target_id AS dom_id
        FROM ${policyDefinitionTable} policyDefinition
        WHERE policyDefinition.variant = ${AuthorizationPolicyVariants.JOIN_DOMAIN.action}
          AND policyDefinition.subject_type = ${principal.type}
          AND policyDefinition.subject_id = ${principal.id}
          AND policyDefinition.target_type IN (${domainTypeList})${this.softDeleteClause({ alias: 'policyDefinition' })}

        UNION

        SELECT policyDefinition.target_type, policyDefinition.target_id
        FROM ${policyDefinitionTable} policyDefinition
          JOIN domain_closure ON policyDefinition.subject_type = domain_closure.dom_type
                             AND policyDefinition.subject_id = domain_closure.dom_id
        WHERE policyDefinition.variant = ${AuthorizationPolicyVariants.DOMAIN_INHERITS.action}${this.softDeleteClause({ alias: 'policyDefinition' })}
      )

      SELECT
        ${PrincipalPolicyEdges.DIRECT}::text AS "kind",
        policyDefinition.variant,
        policyDefinition.subject_id::text AS "subjectId",
        policyDefinition.target_type AS "targetType",
        policyDefinition.target_id::text AS "targetId",
        policyDefinition.action,
        policyDefinition.effect,
        policyDefinition.domain,
        permission.code AS "objectCode",
        permission.subject AS "objectSubject",
        permission.method AS "objectMethod"${metadataSelection}
      FROM ${policyDefinitionTable} policyDefinition
        LEFT JOIN ${permissionTable} permission
          ON policyDefinition.target_id = permission.id${this.softDeleteClause({ alias: 'permission' })}
      WHERE policyDefinition.subject_type = ${principal.type}
        AND policyDefinition.subject_id = ${principal.id}
        AND policyDefinition.variant IN (
          ${AuthorizationPolicyVariants.ASSIGN_ROLE.action},
          ${AuthorizationPolicyVariants.JOIN_DOMAIN.action},
          ${AuthorizationPolicyVariants.GRANT.action}
        )
        AND (
          policyDefinition.variant <> ${AuthorizationPolicyVariants.JOIN_DOMAIN.action}
          OR policyDefinition.target_type IN (${domainTypeList})
        )${this.softDeleteClause({ alias: 'policyDefinition' })}

      UNION ALL

      SELECT
        ${PrincipalPolicyEdges.ROLE_EDGE}::text AS "kind",
        policyDefinition.variant,
        policyDefinition.subject_id::text AS "subjectId",
        policyDefinition.target_type AS "targetType",
        policyDefinition.target_id::text AS "targetId",
        NULL AS "action",
        NULL AS "effect",
        NULL AS "domain",
        NULL AS "objectCode",
        NULL AS "objectSubject",
        NULL AS "objectMethod"${metadataNull}
      FROM ${policyDefinitionTable} policyDefinition
        JOIN role_closure ON policyDefinition.subject_id = role_closure.role_id
      WHERE policyDefinition.variant = ${AuthorizationPolicyVariants.ROLE_INHERITS.action}${this.softDeleteClause({ alias: 'policyDefinition' })}

      UNION ALL

      SELECT
        ${PrincipalPolicyEdges.ROLE_GRANT}::text AS "kind",
        policyDefinition.variant,
        policyDefinition.subject_id::text AS "subjectId",
        policyDefinition.target_type AS "targetType",
        policyDefinition.target_id::text AS "targetId",
        policyDefinition.action,
        policyDefinition.effect,
        policyDefinition.domain,
        permission.code AS "objectCode",
        permission.subject AS "objectSubject",
        permission.method AS "objectMethod"${metadataSelection}
      FROM ${policyDefinitionTable} policyDefinition
        JOIN role_closure ON policyDefinition.subject_id = role_closure.role_id
        LEFT JOIN ${permissionTable} permission
          ON policyDefinition.target_id = permission.id${this.softDeleteClause({ alias: 'permission' })}
      WHERE policyDefinition.variant = ${AuthorizationPolicyVariants.GRANT.action}
        AND policyDefinition.subject_type = ${principals.role}${this.softDeleteClause({ alias: 'policyDefinition' })}

      UNION ALL

      SELECT
        ${PrincipalPolicyEdges.DOMAIN_EDGE}::text AS "kind",
        policyDefinition.variant,
        policyDefinition.subject_type || '_' || policyDefinition.subject_id::text AS "subjectId",
        NULL AS "targetType",
        policyDefinition.target_type || '_' || policyDefinition.target_id::text AS "targetId",
        NULL AS "action",
        NULL AS "effect",
        NULL AS "domain",
        NULL AS "objectCode",
        NULL AS "objectSubject",
        NULL AS "objectMethod"${metadataNull}
      FROM ${policyDefinitionTable} policyDefinition
        JOIN domain_closure ON policyDefinition.subject_type = domain_closure.dom_type
                           AND policyDefinition.subject_id = domain_closure.dom_id
      WHERE policyDefinition.variant = ${AuthorizationPolicyVariants.DOMAIN_INHERITS.action}${this.softDeleteClause({ alias: 'policyDefinition' })}
    `,
    });

    return rows;
  }

  /** Turn fetched grant rows into casbin lines. Shared by the direct and role-closure branches. */
  protected async buildGrantLines(opts: {
    subjectType: string;
    rows: TGrantRow[];
  }): Promise<string[]> {
    const { subjectType, rows } = opts;
    const metadataColumnName = this.entities.policyDefinition.metadata?.columnName;

    const lines: string[] = [];
    const customRows: TCustomGrantRow[] = [];

    for (const row of rows) {
      if (!row.objectCode) {
        this.logger
          .for(this.buildGrantLines.name)
          .error(
            'Skipping grant row whose permission did not resolve - the target is missing or soft-deleted | subject: %s_%s',
            subjectType,
            row.subjectId,
          );
        continue;
      }

      const domain = row.domain ?? AuthorizationDomainScopes.ANY_MEMBER;
      const effect = row.effect ?? AuthorizationDecisions.ALLOW;
      const parsed = metadataColumnName
        ? GrantBuilder.getInstance().parseCustomGrantMetadata({ metadata: row.metadata })
        : null;
      const isCustomAction = row.action === AuthorizationActions.CUSTOM;
      const isCustomRow = isCustomAction || Boolean(parsed);

      if (!isCustomRow && !row.action) {
        this.logger
          .for(this.buildGrantLines.name)
          .error(
            'Skipping grant row with no action - the permission it should confer is silently missing | subject: %s_%s | object: %s',
            subjectType,
            row.subjectId,
            row.objectCode,
          );
        continue;
      }

      if (!isCustomRow) {
        lines.push(
          `${AuthorizationPolicyVariants.GRANT.rule}, ${subjectType}_${row.subjectId}, ${domain}, ${row.objectCode}, ${row.action}, ${effect}`,
        );
        continue;
      }

      if (!row.objectSubject || !row.objectMethod) {
        this.logger
          .for(this.buildGrantLines.name)
          .error(
            'Skipping custom grant row whose subject or method did not resolve - the target is missing or soft-deleted | subject: %s_%s | object: %s',
            subjectType,
            row.subjectId,
            row.objectCode,
          );
        continue;
      }

      const rejection = this.customGrantExpander.rejectCustomRow({
        row: {
          subjectId: row.subjectId,
          objectCode: row.objectCode,
          objectMethod: row.objectMethod,
        },
        parsed,
        isCustomAction,
        metadataColumnName,
      });

      if (rejection) {
        this.logger.for(this.buildGrantLines.name).error(rejection);
        continue;
      }

      customRows.push({
        subjectId: row.subjectId,
        objectSubject: row.objectSubject,
        ops: parsed!.ops,
        domain,
        effect,
      });
    }

    const expanded = await this.customGrantExpander.expandCustomGrants({ subjectType, customRows });
    for (const rejection of expanded.rejections) {
      this.logger.for(this.buildGrantLines.name).error(rejection);
    }
    lines.push(...expanded.lines);

    return lines;
  }

  /** The two code-fixed structural trees only (`g4` resource, `g5` action) - constant regardless of tenant count. Domain edges (`g3`) grow with the domain count, so they are principal-scoped in {@link queryPrincipalPolicies} instead. */
  protected async queryEdgePolicies(): Promise<string[]> {
    const { policyDefinition, permission } = this.entities;
    const policyDefinitionTable = this.qualifiedTable({ table: policyDefinition });
    const permissionTable = this.qualifiedTable({ table: permission });

    const rows = await this.query<{ rel: string; child: string; parent: string }>({
      statement: sql`
      SELECT
        ${AuthorizationPolicyVariants.RESOURCE_INHERITS.rule} AS "rel",
        child_permission.code AS "child",
        parent_permission.code AS "parent"
      FROM ${policyDefinitionTable} policyDefinition
        INNER JOIN ${permissionTable} child_permission ON policyDefinition.subject_id = child_permission.id
        INNER JOIN ${permissionTable} parent_permission ON policyDefinition.target_id = parent_permission.id
      WHERE policyDefinition.variant = ${AuthorizationPolicyVariants.RESOURCE_INHERITS.action}${this.softDeleteClause({ alias: 'policyDefinition' })}

      UNION ALL

      SELECT
        ${AuthorizationPolicyVariants.ACTION_INHERITS.rule} AS "rel",
        policyDefinition.subject_id::text AS "child",
        policyDefinition.target_id::text AS "parent"
      FROM ${policyDefinitionTable} policyDefinition
      WHERE policyDefinition.variant = ${AuthorizationPolicyVariants.ACTION_INHERITS.action}${this.softDeleteClause({ alias: 'policyDefinition' })}
    `,
    });

    return rows.map(row => `${row.rel}, ${row.child}, ${row.parent}`);
  }
}
