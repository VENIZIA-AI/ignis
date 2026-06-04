import { IdType } from '@/base';
import { IDataSource } from '@/base/datasources';
import { type Model } from 'casbin';
import { sql, type SQL } from 'drizzle-orm';
import {
  AuthorizationDecisions,
  AuthorizationDomainScopes,
  AuthorizationPolicyVariants,
} from '../common';
import { BaseFilteredAdapter } from './base-filtered';
import { type IScopedCasbinEntities } from './types';

// Re-export so consumers can import the entity-mapping type straight from the adapter module.
export type { IScopedCasbinEntities };

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

  constructor(opts: { dataSource: IDataSource; entities: IScopedCasbinEntities }) {
    super({ scope: ScopedCasbinAdapter.name, dataSource: opts.dataSource });
    this.entities = opts.entities;
  }

  /**
   * Casbin's filtered-load entry point: build the full line set for ONE principal and load it into
   * the model. Runs in two waves —
   *   Wave 1 (parallel): the principal's own edges (role assignments → g, memberships → g2, direct
   *     grants → p) plus the shared structural trees (role/resource/action/domain inherits).
   *   Wave 2: expand the assigned roles to their transitive parents (role closure over role_inherits),
   *     then fetch the grants those roles carry — so a user inherits permissions from parent roles.
   * The concatenated lines are handed to {@link loadLines}; the enforcer caches the result per user
   * in Redis, so this only runs on a cache MISS.
   */
  async loadFilteredPolicy(model: Model, filter: IScopedCasbinPolicyFilter): Promise<void> {
    const { principal } = filter;

    // Wave 1 — independent per-user queries + structural trees, in parallel.
    const [assignments, memberships, userGrants, structural] = await Promise.all([
      this.queryRoleAssignments({ principal }),
      this.queryMemberships({ principal }),
      this.queryGrants({ subject: { type: principal.type, ids: [principal.id] } }),
      this.loadStructuralTrees(),
    ]);

    // Wave 2 — role grants need the role closure (built from the role_inherits edges loaded above).
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
   * `AND <alias>.<col> IS NULL` when soft-delete on; empty otherwise. The alias is emitted RAW (not
   * quoted) so it matches the unquoted alias declared in the FROM clause (`FROM ... policyDefinition`):
   * Postgres folds unquoted identifiers to lower-case, so a quoted `"policyDefinition"` would resolve
   * to a DIFFERENT relation than the unquoted FROM alias → 42P01 "missing FROM-clause entry". The alias
   * is always a hard-coded literal supplied by this adapter, never user input, so emitting it raw is
   * safe; the (config-supplied) column name stays quoted via `sql.identifier`.
   */
  protected softDeleteClause(opts: { alias: string }): SQL {
    const sd = this.entities.softDelete;
    if (!sd?.use) {
      return sql.empty();
    }

    return sql` AND ${sql.raw(opts.alias)}.${sql.identifier(sd.columnName)} IS NULL`;
  }

  /**
   * Fetch the principal's `assign_role` edges and emit them as casbin `g` lines (role membership).
   * Returns both the lines AND the raw `roleIds`, which Wave 2 feeds into {@link expandRoleClosure}.
   * A null domain widens the assignment to every domain (`*`).
   * e.g. `g, User_u1, Role_r1, *` — "u1 holds Role r1 in any domain".
   */
  protected async queryRoleAssignments(opts: {
    principal: { type: string; id: IdType };
  }): Promise<{ lines: string[]; roleIds: IdType[] }> {
    const { policyDefinition, principals } = this.entities;
    const policyDefinitionTable = this.qualifiedTable({ table: policyDefinition });
    const { principal } = opts;

    const result = await this.connector.execute<{
      roleId: IdType;
      domain: string | null;
    }>(sql`
      SELECT 
        policyDefinition.target_id AS "roleId", 
        policyDefinition.domain
      FROM ${policyDefinitionTable} policyDefinition
      WHERE policyDefinition.variant = ${AuthorizationPolicyVariants.ASSIGN_ROLE.action}
        AND policyDefinition.subject_type = ${principal.type}
        AND policyDefinition.subject_id = ${principal.id}
        AND policyDefinition.target_type = ${principals.role}${this.softDeleteClause({ alias: 'policyDefinition' })}
    `);

    const lines: string[] = [];
    const roleIds: IdType[] = [];
    for (const row of result.rows) {
      roleIds.push(row.roleId);
      const domain = row.domain ?? '*';

      lines.push(
        `${AuthorizationPolicyVariants.ASSIGN_ROLE.rule}, ${principal.type}_${principal.id}, ${principals.role}_${row.roleId}, ${domain}`,
      );
    }

    return { lines, roleIds };
  }

  /**
   * Fetch the principal's `join_domain` edges (restricted to the configured `domainTypes`) and emit
   * them as casbin `g2` lines — the membership relation the matcher uses to scope `ANY_MEMBER` grants.
   * e.g. `g2, User_u1, Merchant_7` — "u1 is a member of Merchant 7".
   */
  protected async queryMemberships(opts: {
    principal: { type: string; id: IdType };
  }): Promise<string[]> {
    const { policyDefinition, domainTypes } = this.entities;
    const policyDefinitionTable = this.qualifiedTable({ table: policyDefinition });
    const { principal } = opts;

    const result = await this.connector.execute<{
      domainType: string;
      domainId: IdType;
    }>(sql`
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
    `);

    return result.rows.map(
      row =>
        `${AuthorizationPolicyVariants.JOIN_DOMAIN.rule}, ${principal.type}_${principal.id}, ${row.domainType}_${row.domainId}`,
    );
  }

  /**
   * Fetch `grant` edges for the given subjects (a User or a set of Roles) joined to `Permission` for
   * the object code, and emit them as casbin `p` policy lines. Used twice per load: once for the
   * user's direct grants, once for the grants of every role in the closure. Rows with no `action` are
   * skipped; a null effect defaults to allow, a null domain to `ANY_MEMBER`. Empty `ids` short-circuits
   * without touching the DB.
   * e.g. `p, Role_5, ANY_MEMBER, Order, read, allow` — "Role 5 may read Order in any joined domain".
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

    const result = await this.connector.execute<{
      subjectId: IdType;
      objectCode: string;
      action: string | null;
      effect: string | null;
      domain: string | null;
    }>(sql`
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
    `);

    const lines: string[] = [];
    for (const row of result.rows) {
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

  /**
   * Load the system-wide hierarchy edges (role/resource/action/domain inherits) — read fresh on each
   * call. These are the same for every user, but at this scale the four queries are cheap and run in
   * the same parallel wave as the per-user queries; the per-user `lines` are themselves cached in Redis
   * by the enforcer, so this only runs on a cache MISS. (No in-process cache → never goes stale.)
   */
  protected async loadStructuralTrees(): Promise<string[]> {
    const [roleEdges, resourceEdges, actionEdges, domainEdges] = await Promise.all([
      this.queryRoleInherits(),
      this.queryResourceInherits(),
      this.queryActionInherits(),
      this.queryDomainInherits(),
    ]);

    return [...roleEdges, ...resourceEdges, ...actionEdges, ...domainEdges];
  }

  /**
   * Shared role hierarchy: every `role_inherits` edge as a casbin `g` line with a wildcard domain.
   * These are the SAME for all users (org structure, not a user) and also seed {@link expandRoleClosure}.
   * e.g. `g, Role_r2, Role_r1, *` — "Role r2 inherits Role r1 in any domain".
   */
  protected async queryRoleInherits(): Promise<string[]> {
    const { policyDefinition, principals } = this.entities;
    const policyDefinitionTable = this.qualifiedTable({ table: policyDefinition });

    const result = await this.connector.execute<{
      childId: IdType;
      parentId: IdType;
    }>(sql`
      SELECT
        policyDefinition.subject_id AS "childId",
        policyDefinition.target_id AS "parentId"
      FROM ${policyDefinitionTable} policyDefinition
      WHERE policyDefinition.variant = ${AuthorizationPolicyVariants.ROLE_INHERITS.action}${this.softDeleteClause({ alias: 'policyDefinition' })}
    `);

    return result.rows.map(r => {
      return `${AuthorizationPolicyVariants.ROLE_INHERITS.rule}, ${principals.role}_${r.childId}, ${principals.role}_${r.parentId}, *`;
    });
  }

  /**
   * Shared resource hierarchy: every `resource_inherits` edge as a casbin `g4` line, joining
   * `Permission` twice (child + parent) to emit the resource CODES the `objectMatch` g4-func traverses.
   * The `obj` axis — a permission on a parent resource also covers its children.
   * e.g. `g4, OrderItem, Order` — "OrderItem is a child resource of Order".
   */
  protected async queryResourceInherits(): Promise<string[]> {
    const { policyDefinition, permission } = this.entities;
    const policyDefinitionTable = this.qualifiedTable({ table: policyDefinition });
    const permissionTable = this.qualifiedTable({ table: permission });

    const result = await this.connector.execute<{ childCode: string; parentCode: string }>(sql`
      SELECT
        child_permission.code AS "childCode",
        parent_permission.code AS "parentCode"
      FROM ${policyDefinitionTable} policyDefinition
        INNER JOIN ${permissionTable} child_permission ON policyDefinition.subject_id = child_permission.id
        INNER JOIN ${permissionTable} parent_permission ON policyDefinition.target_id = parent_permission.id
      WHERE policyDefinition.variant = ${AuthorizationPolicyVariants.RESOURCE_INHERITS.action}${this.softDeleteClause({ alias: 'policyDefinition' })}
    `);

    return result.rows.map(
      r => `${AuthorizationPolicyVariants.RESOURCE_INHERITS.rule}, ${r.childCode}, ${r.parentCode}`,
    );
  }

  /**
   * Shared action hierarchy: every `action_inherits` edge as a casbin `g5` line. Same shape as
   * resource_inherits but a DIFFERENT axis — the `act` axis (e.g. `manage` covers `read`/`update`).
   * Kept separate so resource × action stays factored instead of exploding to R×A combined edges.
   * e.g. `g5, read, manage` — "the read action is implied by manage".
   */
  protected async queryActionInherits(): Promise<string[]> {
    const { policyDefinition } = this.entities;
    const policyDefinitionTable = this.qualifiedTable({ table: policyDefinition });

    const result = await this.connector.execute<{ childCode: string; parentCode: string }>(sql`
      SELECT
        policyDefinition.subject_id AS "childCode",
        policyDefinition.target_id AS "parentCode"
      FROM ${policyDefinitionTable} policyDefinition
      WHERE policyDefinition.variant = ${AuthorizationPolicyVariants.ACTION_INHERITS.action}${this.softDeleteClause({ alias: 'policyDefinition' })}
    `);

    return result.rows.map(
      r => `${AuthorizationPolicyVariants.ACTION_INHERITS.rule}, ${r.childCode}, ${r.parentCode}`,
    );
  }

  /**
   * Shared domain hierarchy: every `domain_inherits` edge as a casbin `g3` line, with typed
   * `<type>_<id>` endpoints — lets a grant in a parent domain cascade to child domains.
   * e.g. `g3, Branch_1, Company_2` — "Branch 1 sits under Company 2".
   */
  protected async queryDomainInherits(): Promise<string[]> {
    const { policyDefinition } = this.entities;
    const policyDefinitionTable = this.qualifiedTable({ table: policyDefinition });

    const result = await this.connector.execute<{
      childType: string;
      childId: IdType;
      parentType: string;
      parentId: IdType;
    }>(sql`
      SELECT
        policyDefinition.subject_type AS "childType",
        policyDefinition.subject_id AS "childId",
        policyDefinition.target_type AS "parentType",
        policyDefinition.target_id AS "parentId"
      FROM ${policyDefinitionTable} policyDefinition
      WHERE policyDefinition.variant = ${AuthorizationPolicyVariants.DOMAIN_INHERITS.action}${this.softDeleteClause({ alias: 'policyDefinition' })}
    `);

    return result.rows.map(
      r =>
        `${AuthorizationPolicyVariants.DOMAIN_INHERITS.rule}, ${r.childType}_${r.childId}, ${r.parentType}_${r.parentId}`,
    );
  }

  /** BFS over role_inherits edges to collect a role set + all transitive parents. Cycle-safe. */
  protected expandRoleClosure(opts: { role: { ids: IdType[]; edges: string[] } }): IdType[] {
    const { role } = this.entities.principals;
    const prefix = `${role}_`;

    // Build child → parents map from "g, Role_<child>, Role_<parent>, *" lines.
    const parentsOf = new Map<string, string[]>();

    for (const line of opts.role.edges) {
      const parts = line.split(',').map(s => s.trim()); // ['g','Role_child','Role_parent','*']
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
