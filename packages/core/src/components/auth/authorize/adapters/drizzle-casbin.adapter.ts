import { TAnyConnector } from '@/base/datasources';
import { BaseHelper } from '@venizia/ignis-helpers';
import type { FilteredAdapter, Model } from 'casbin';
import { sql } from 'drizzle-orm';

// --------------------------------------------------------------------------------------------------------
// Adapter Types
// --------------------------------------------------------------------------------------------------------

export interface IDrizzleCasbinAdapterOptions {
  connector: TAnyConnector;
  entities: {
    permission: { tableName: string; principalName: string };
    role: { tableName: string; principalName: string };
    policyDefinition: { tableName: string; principalName: string };
  };
}

export interface ICasbinPolicyFilter {
  principalType: string;
  principalValue: string | number;
}

// --------------------------------------------------------------------------------------------------------
// Row types returned from raw queries
// --------------------------------------------------------------------------------------------------------

type TPolicyRow = {
  variant: string;
  code: string;
  action: string | null;
  subjectType: string;
  subjectId: string | number;
  effect: string | null;
  domain: string | null;
};

type TRoleRow = {
  id: string | number;
  identifier: string;
};

type TUserRoleRow = {
  targetId: string | number;
  domain: string | null;
};

// --------------------------------------------------------------------------------------------------------
// Drizzle Casbin Adapter — read-only FilteredAdapter using raw queries
// --------------------------------------------------------------------------------------------------------

export class DrizzleCasbinAdapter extends BaseHelper implements FilteredAdapter {
  private connector: TAnyConnector;
  private entities: IDrizzleCasbinAdapterOptions['entities'];

  constructor(opts: IDrizzleCasbinAdapterOptions) {
    super({ scope: DrizzleCasbinAdapter.name });
    this.connector = opts.connector;
    this.entities = opts.entities;
  }

  // ---------------------------------------------------------------------------
  // No-op — this adapter is filtered-only (isFiltered() always returns true)
  // ---------------------------------------------------------------------------
  async loadPolicy(): Promise<void> {
    return;
  }

  // ---------------------------------------------------------------------------
  // Load policies filtered by a specific principal
  // ---------------------------------------------------------------------------
  async loadFilteredPolicy(model: Model, filter: ICasbinPolicyFilter): Promise<void> {
    const { Helper } = await import('casbin');
    const { role: rol } = this.entities;
    const { principalType, principalValue } = filter;

    const roleMap = await this.buildRoleMap();
    const loadLine = (line: string) => Helper.loadPolicyLine(line, model);

    // 1. Direct permissions assigned to the principal
    const directLines = await this.buildDirectPolicies({
      principalType,
      principalValue,
      roleMap,
      rolePrincipal: rol.principalName,
    });
    directLines.forEach(loadLine);

    // 2. Role assignments + group lines
    const { lines: groupLines, userRoles } = await this.buildGroupPolicies({
      principalType,
      principalValue,
      roleMap,
    });
    groupLines.forEach(loadLine);

    // 3. Permissions inherited through roles
    if (userRoles.length) {
      const roleIds = userRoles.map(r => r.targetId);
      const roleLines = await this.buildRolePolicies({
        roleIds,
        roleMap,
        rolePrincipal: rol.principalName,
      });
      roleLines.forEach(loadLine);
    }

    this.logger
      .for(this.loadFilteredPolicy.name)
      .debug('Loaded filtered policies for %s: %s', principalType, principalValue);
  }

  // ---------------------------------------------------------------------------
  // Query helpers
  // ---------------------------------------------------------------------------

  private async buildRoleMap(): Promise<Map<string, string>> {
    const { role: rol } = this.entities;
    const roleRows = await this.connector.execute<TRoleRow>(sql`
      SELECT id, identifier FROM ${sql.identifier(rol.tableName)}
    `);
    return new Map(roleRows.rows.map(row => [String(row.id), row.identifier]));
  }

  private async buildDirectPolicies(opts: {
    principalType: string;
    principalValue: string | number;
    roleMap: Map<string, string>;
    rolePrincipal: string;
  }): Promise<string[]> {
    const { permission: perm, policyDefinition: pd } = this.entities;
    const { principalType, principalValue, roleMap, rolePrincipal } = opts;

    const result = await this.connector.execute<TPolicyRow>(sql`
      SELECT pd.variant, p.code, pd.action,
             pd.subject_type AS "subjectType", pd.subject_id AS "subjectId",
             pd.effect, pd.domain
      FROM ${sql.identifier(pd.tableName)} pd
      INNER JOIN ${sql.identifier(perm.tableName)} p ON pd.target_id = p.id
      WHERE pd.subject_type = ${principalType}
        AND pd.subject_id = ${principalValue}
        AND pd.target_type = ${perm.principalName}
    `);

    return result.rows.reduce<string[]>((lines, row) => {
      const line = this.toPolicyLine({ row, roleMap, rolePrincipal });
      if (line) {
        lines.push(line);
      }
      return lines;
    }, []);
  }

  private async buildGroupPolicies(opts: {
    principalType: string;
    principalValue: string | number;
    roleMap: Map<string, string>;
  }): Promise<{ lines: string[]; userRoles: TUserRoleRow[] }> {
    const { role: rol, policyDefinition: pd } = this.entities;
    const { principalType, principalValue, roleMap } = opts;

    const result = await this.connector.execute<TUserRoleRow>(sql`
      SELECT pd.target_id AS "targetId", pd.domain
      FROM ${sql.identifier(pd.tableName)} pd
      WHERE pd.subject_type = ${principalType}
        AND pd.subject_id = ${principalValue}
        AND pd.target_type = ${rol.principalName}
    `);

    const lines = result.rows.reduce<string[]>((acc, ur) => {
      const roleIdentifier = roleMap.get(String(ur.targetId));
      if (!roleIdentifier) {
        return acc;
      }

      acc.push(
        ur.domain
          ? `g, ${principalType}_${principalValue}, role_${roleIdentifier}, ${ur.domain}`
          : `g, ${principalType}_${principalValue}, role_${roleIdentifier}`,
      );
      return acc;
    }, []);

    return { lines, userRoles: result.rows };
  }

  private async buildRolePolicies(opts: {
    roleIds: (string | number)[];
    roleMap: Map<string, string>;
    rolePrincipal: string;
  }): Promise<string[]> {
    const { permission: perm, role: rol, policyDefinition: pd } = this.entities;
    const { roleIds, roleMap, rolePrincipal } = opts;

    const result = await this.connector.execute<TPolicyRow>(sql`
      SELECT pd.variant, p.code, pd.action,
             pd.subject_type AS "subjectType", pd.subject_id AS "subjectId",
             pd.effect, pd.domain
      FROM ${sql.identifier(pd.tableName)} pd
      INNER JOIN ${sql.identifier(perm.tableName)} p ON pd.target_id = p.id
      WHERE pd.subject_type = ${rol.principalName}
        AND pd.subject_id = ANY(${roleIds})
        AND pd.target_type = ${perm.principalName}
    `);

    return result.rows.reduce<string[]>((lines, row) => {
      const line = this.toPolicyLine({ row, roleMap, rolePrincipal });
      if (line) {
        lines.push(line);
      }
      return lines;
    }, []);
  }

  // ---------------------------------------------------------------------------
  // Line formatter
  // ---------------------------------------------------------------------------

  private toPolicyLine(opts: {
    row: TPolicyRow;
    roleMap: Map<string, string>;
    rolePrincipal: string;
  }): string | null {
    const { row, roleMap, rolePrincipal } = opts;
    const { code, action, domain } = row;
    const effect = row.effect ?? 'allow';

    // Policy rows (variant='policy') must have an action; group rows are handled separately
    if (!action) {
      return null;
    }

    let subject: string;
    if (row.subjectType === rolePrincipal) {
      const identifier = roleMap.get(String(row.subjectId));
      subject = `role_${identifier ?? row.subjectId}`;
    } else {
      subject = `${row.subjectType}_${row.subjectId}`;
    }

    if (domain) {
      return `p, ${subject}, ${domain}, ${code}, ${action}, ${effect}`;
    }
    return `p, ${subject}, ${code}, ${action}, ${effect}`;
  }

  // ---------------------------------------------------------------------------
  // FilteredAdapter interface — read-only, write methods are no-ops
  // ---------------------------------------------------------------------------

  isFiltered(): boolean {
    return true;
  }

  async savePolicy(): Promise<boolean> {
    return true;
  }

  async addPolicy(): Promise<void> {
    return;
  }

  async removePolicy(): Promise<void> {
    return;
  }

  async removeFilteredPolicy(): Promise<void> {
    return;
  }
}
