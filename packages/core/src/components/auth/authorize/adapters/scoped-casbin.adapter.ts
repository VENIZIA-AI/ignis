import type { IdType } from '@/base';
import { type Model } from 'casbin';
import { sql, type SQL } from 'drizzle-orm';
import {
  AuthorizationDecisions,
  AuthorizationDomainScopes,
  AuthorizationPolicyVariants,
} from '../common';
import { BaseFilteredAdapter } from './base-filtered';
import type { ICasbinPolicySource, IScopedCasbinEntities } from './types';

export interface IScopedCasbinPolicyFilter {
  principal: { type: string; id: IdType };
}

const DEFAULT_SCHEMA = 'public';

/**
 * Filtered casbin adapter for the scoped RBAC model: loads ONE principal's edges (role assignments,
 * memberships, grants) plus the shared structural hierarchy trees as casbin lines. Read-only.
 */
export class ScopedCasbinAdapter extends BaseFilteredAdapter<IScopedCasbinPolicyFilter> {
  protected readonly entities: IScopedCasbinEntities;

  constructor(opts: { dataSource: ICasbinPolicySource; entities: IScopedCasbinEntities }) {
    super({ scope: ScopedCasbinAdapter.name, dataSource: opts.dataSource });
    this.entities = opts.entities;
  }

  /**
   * Casbin's filtered-load entry point: builds the full line set for one principal (role assignments,
   * memberships, direct grants, structural trees) then expands the role closure to fetch inherited grants.
   */
  async loadFilteredPolicy(model: Model, filter: IScopedCasbinPolicyFilter): Promise<void> {
    const { principal } = filter;

    const [assignments, memberships, userGrants, structural] = await Promise.all([
      this.queryRoleAssignments({ principal }),
      this.queryMemberships({ principal }),
      this.queryGrants({ subject: { type: principal.type, ids: [principal.id] } }),
      this.loadStructuralTrees(),
    ]);

    // Needs the role closure built above, so it can't join the batch of queries above.
    const roleClosure = this.expandRoleClosure({
      role: {
        ids: assignments.roleIds,
        edges: structural.filter(line => {
          return line.startsWith(`${AuthorizationPolicyVariants.ROLE_INHERITS.rule}, `);
        }),
      },
    });

    const roleGrants = await this.queryGrants({
      subject: { type: this.entities.principals.role, ids: roleClosure },
    });

    const lines = [
      ...assignments.lines,
      ...memberships,
      ...userGrants,
      ...roleGrants,
      ...structural,
    ];

    await this.loadLines({ model, lines });
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

  /**
   * `AND <alias>.<col> IS NULL` when soft-delete is on, else empty. Alias is emitted raw (unquoted) to
   * match the unquoted FROM alias — quoting it would fold to a different case and break the join.
   */
  protected softDeleteClause(opts: { alias: string }): SQL {
    const sd = this.entities.softDelete;
    if (!sd?.use) {
      return sql.empty();
    }

    return sql` AND ${sql.raw(opts.alias)}.${sql.identifier(sd.columnName)} IS NULL`;
  }

  /**
   * Fetch the principal's `assign_role` edges as casbin `g` lines, plus the raw `roleIds` for
   * {@link expandRoleClosure}. A null domain widens the assignment to every domain (`*`).
   */
  protected async queryRoleAssignments(opts: {
    principal: { type: string; id: IdType };
  }): Promise<{ lines: string[]; roleIds: IdType[] }> {
    const { policyDefinition, principals } = this.entities;
    const policyDefinitionTable = this.qualifiedTable({ table: policyDefinition });
    const { principal } = opts;

    const rows = await this.query<{
      roleId: IdType;
      domain: string | null;
    }>({
      statement: sql`
      SELECT 
        policyDefinition.target_id AS "roleId", 
        policyDefinition.domain
      FROM ${policyDefinitionTable} policyDefinition
      WHERE policyDefinition.variant = ${AuthorizationPolicyVariants.ASSIGN_ROLE.action}
        AND policyDefinition.subject_type = ${principal.type}
        AND policyDefinition.subject_id = ${principal.id}
        AND policyDefinition.target_type = ${principals.role}${this.softDeleteClause({ alias: 'policyDefinition' })}
    `,
    });

    const lines: string[] = [];
    const roleIds: IdType[] = [];
    for (const row of rows) {
      roleIds.push(row.roleId);
      const domain = row.domain ?? '*';

      lines.push(
        `${AuthorizationPolicyVariants.ASSIGN_ROLE.rule}, ${principal.type}_${principal.id}, ${principals.role}_${row.roleId}, ${domain}`,
      );
    }

    return { lines, roleIds };
  }

  /**
   * Fetch the principal's `join_domain` edges (restricted to `domainTypes`) as casbin `g2` lines —
   * the membership relation the matcher uses to scope `ANY_MEMBER` grants.
   */
  protected async queryMemberships(opts: {
    principal: { type: string; id: IdType };
  }): Promise<string[]> {
    const { policyDefinition, domainTypes } = this.entities;
    const policyDefinitionTable = this.qualifiedTable({ table: policyDefinition });
    const { principal } = opts;

    const rows = await this.query<{
      domainType: string;
      domainId: IdType;
    }>({
      statement: sql`
      SELECT 
        policyDefinition.target_type AS "domainType", 
        policyDefinition.target_id AS "domainId"
      FROM ${policyDefinitionTable} policyDefinition
      WHERE policyDefinition.variant = ${AuthorizationPolicyVariants.JOIN_DOMAIN.action}
        AND policyDefinition.subject_type = ${principal.type}
        AND policyDefinition.subject_id = ${principal.id}
        AND policyDefinition.target_type IN (${sql.join(
          domainTypes.map(t => sql`${t}`),
          sql`, `,
        )})${this.softDeleteClause({ alias: 'policyDefinition' })}
    `,
    });

    return rows.map(
      row =>
        `${AuthorizationPolicyVariants.JOIN_DOMAIN.rule}, ${principal.type}_${principal.id}, ${row.domainType}_${row.domainId}`,
    );
  }

  /**
   * Fetch `grant` edges for the given subjects joined to `Permission`, as casbin `p` lines. Rows with
   * no `action` are skipped; null effect defaults to allow, null domain to `ANY_MEMBER`.
   */
  protected async queryGrants(opts: {
    subject: { type: string; ids: IdType[] };
  }): Promise<string[]> {
    if (!opts.subject.ids.length) {
      return [];
    }

    const { policyDefinition, permission } = this.entities;
    const policyDefinitionTable = this.qualifiedTable({ table: policyDefinition });
    const permissionTable = this.qualifiedTable({ table: permission });
    const { subject } = opts;

    const rows = await this.query<{
      subjectId: IdType;
      objectCode: string;
      action: string | null;
      effect: string | null;
      domain: string | null;
    }>({
      statement: sql`
      SELECT
        policyDefinition.subject_id AS "subjectId",
        permission.code AS "objectCode",
        policyDefinition.action,
        policyDefinition.effect,
        policyDefinition.domain
      FROM ${policyDefinitionTable} policyDefinition
        INNER JOIN ${permissionTable} permission
          ON policyDefinition.target_id = permission.id${this.softDeleteClause({ alias: 'permission' })}
      WHERE policyDefinition.variant = ${AuthorizationPolicyVariants.GRANT.action}
        AND policyDefinition.subject_type = ${subject.type}
        AND policyDefinition.subject_id IN (${sql.join(
          subject.ids.map(id => sql`${id}`),
          sql`, `,
        )})${this.softDeleteClause({ alias: 'policyDefinition' })}
    `,
    });

    const lines: string[] = [];
    for (const row of rows) {
      if (!row.action) {
        continue;
      }

      const domain = row.domain ?? AuthorizationDomainScopes.ANY_MEMBER;
      const effect = row.effect ?? AuthorizationDecisions.ALLOW;

      lines.push(
        `${AuthorizationPolicyVariants.GRANT.rule}, ${subject.type}_${row.subjectId}, ${domain}, ${row.objectCode}, ${row.action}, ${effect}`,
      );
    }

    return lines;
  }

  /** Load the system-wide hierarchy edges (role/resource/action/domain inherits), read fresh every call. */
  protected async loadStructuralTrees(): Promise<string[]> {
    const [roleEdges, resourceEdges, actionEdges, domainEdges] = await Promise.all([
      this.queryRoleInherits(),
      this.queryResourceInherits(),
      this.queryActionInherits(),
      this.queryDomainInherits(),
    ]);

    return [...roleEdges, ...resourceEdges, ...actionEdges, ...domainEdges];
  }

  /** Every `role_inherits` edge as a casbin `g` line with a wildcard domain; seeds {@link expandRoleClosure}. */
  protected async queryRoleInherits(): Promise<string[]> {
    const { policyDefinition, principals } = this.entities;
    const policyDefinitionTable = this.qualifiedTable({ table: policyDefinition });

    const rows = await this.query<{
      childId: IdType;
      parentId: IdType;
    }>({
      statement: sql`
      SELECT
        policyDefinition.subject_id AS "childId",
        policyDefinition.target_id AS "parentId"
      FROM ${policyDefinitionTable} policyDefinition
      WHERE policyDefinition.variant = ${AuthorizationPolicyVariants.ROLE_INHERITS.action}${this.softDeleteClause({ alias: 'policyDefinition' })}
    `,
    });

    return rows.map(r => {
      return `${AuthorizationPolicyVariants.ROLE_INHERITS.rule}, ${principals.role}_${r.childId}, ${principals.role}_${r.parentId}, *`;
    });
  }

  /**
   * Every `resource_inherits` edge as a casbin `g4` line (resource codes, `obj` axis) — a permission
   * on a parent resource also covers its children.
   */
  protected async queryResourceInherits(): Promise<string[]> {
    const { policyDefinition, permission } = this.entities;
    const policyDefinitionTable = this.qualifiedTable({ table: policyDefinition });
    const permissionTable = this.qualifiedTable({ table: permission });

    const rows = await this.query<{ childCode: string; parentCode: string }>({
      statement: sql`
      SELECT
        child_permission.code AS "childCode",
        parent_permission.code AS "parentCode"
      FROM ${policyDefinitionTable} policyDefinition
        INNER JOIN ${permissionTable} child_permission ON policyDefinition.subject_id = child_permission.id
        INNER JOIN ${permissionTable} parent_permission ON policyDefinition.target_id = parent_permission.id
      WHERE policyDefinition.variant = ${AuthorizationPolicyVariants.RESOURCE_INHERITS.action}${this.softDeleteClause({ alias: 'policyDefinition' })}
    `,
    });

    return rows.map(
      r => `${AuthorizationPolicyVariants.RESOURCE_INHERITS.rule}, ${r.childCode}, ${r.parentCode}`,
    );
  }

  /**
   * Every `action_inherits` edge as a casbin `g5` line (`act` axis, e.g. `manage` implies `read`).
   * Kept separate from resource_inherits so resource x action doesn't explode into combined edges.
   */
  protected async queryActionInherits(): Promise<string[]> {
    const { policyDefinition } = this.entities;
    const policyDefinitionTable = this.qualifiedTable({ table: policyDefinition });

    const rows = await this.query<{ childCode: string; parentCode: string }>({
      statement: sql`
      SELECT
        policyDefinition.subject_id AS "childCode",
        policyDefinition.target_id AS "parentCode"
      FROM ${policyDefinitionTable} policyDefinition
      WHERE policyDefinition.variant = ${AuthorizationPolicyVariants.ACTION_INHERITS.action}${this.softDeleteClause({ alias: 'policyDefinition' })}
    `,
    });

    return rows.map(
      r => `${AuthorizationPolicyVariants.ACTION_INHERITS.rule}, ${r.childCode}, ${r.parentCode}`,
    );
  }

  /** Every `domain_inherits` edge as a casbin `g3` line — lets a grant on a parent domain cascade down. */
  protected async queryDomainInherits(): Promise<string[]> {
    const { policyDefinition } = this.entities;
    const policyDefinitionTable = this.qualifiedTable({ table: policyDefinition });

    const rows = await this.query<{
      childType: string;
      childId: IdType;
      parentType: string;
      parentId: IdType;
    }>({
      statement: sql`
      SELECT
        policyDefinition.subject_type AS "childType",
        policyDefinition.subject_id AS "childId",
        policyDefinition.target_type AS "parentType",
        policyDefinition.target_id AS "parentId"
      FROM ${policyDefinitionTable} policyDefinition
      WHERE policyDefinition.variant = ${AuthorizationPolicyVariants.DOMAIN_INHERITS.action}${this.softDeleteClause({ alias: 'policyDefinition' })}
    `,
    });

    return rows.map(
      r =>
        `${AuthorizationPolicyVariants.DOMAIN_INHERITS.rule}, ${r.childType}_${r.childId}, ${r.parentType}_${r.parentId}`,
    );
  }

  /** BFS over role_inherits edges to collect a role set + all transitive parents. Cycle-safe. */
  protected expandRoleClosure(opts: { role: { ids: IdType[]; edges: string[] } }): IdType[] {
    const { role } = this.entities.principals;
    const prefix = `${role}_`;

    const parentsOf = new Map<string, string[]>();

    for (const line of opts.role.edges) {
      const parts = line.split(',').map(s => s.trim());
      if (parts[0] !== AuthorizationPolicyVariants.ROLE_INHERITS.rule || parts.length < 3) {
        continue;
      }

      const child = parts[1].startsWith(prefix) ? parts[1].slice(prefix.length) : parts[1];
      const parent = parts[2].startsWith(prefix) ? parts[2].slice(prefix.length) : parts[2];
      const list = parentsOf.get(child) ?? [];

      list.push(parent);
      parentsOf.set(child, list);
    }

    const rs = new Set<string>();

    const queue = opts.role.ids.map(String);
    while (queue.length) {
      const current = queue.shift()!;

      if (rs.has(current)) {
        continue;
      }

      rs.add(current);

      const parents = parentsOf.get(current) ?? [];
      for (const parent of parents) {
        if (!rs.has(parent)) {
          queue.push(parent);
        }
      }
    }

    return [...rs];
  }
}
