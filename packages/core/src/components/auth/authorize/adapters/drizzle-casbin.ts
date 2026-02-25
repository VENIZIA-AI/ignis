import { IDataSource, TAnyConnector } from '@/base/datasources';
import { sql } from 'drizzle-orm';
import { CasbinRuleVariants } from '../common';
import {
  BaseFilteredAdapter,
  type IBaseFilteredAdapterEntities,
  type ICasbinPolicyFilter,
  type TBasePolicyRow,
} from './base-filtered';

// --------------------------------------------------------------------------------------------------------
// Drizzle Adapter Types
// --------------------------------------------------------------------------------------------------------

export interface IDrizzleCasbinEntities extends IBaseFilteredAdapterEntities {
  permission: { tableName: string; principalType: string };
  role: { tableName: string; principalType: string };
  policyDefinition: { tableName: string; principalType: string };
}

export interface IDrizzleCasbinAdapterOptions {
  dataSource: IDataSource;
  entities: IDrizzleCasbinEntities;
}

// --------------------------------------------------------------------------------------------------------
// Drizzle Casbin Adapter — read-only FilteredAdapter using raw SQL queries
// --------------------------------------------------------------------------------------------------------

export class DrizzleCasbinAdapter extends BaseFilteredAdapter<IDrizzleCasbinEntities> {
  private connector: TAnyConnector;

  constructor(opts: IDrizzleCasbinAdapterOptions) {
    super({ scope: DrizzleCasbinAdapter.name, entities: opts.entities });
    this.connector = opts.dataSource.connector;
  }

  // ---------------------------------------------------------------------------
  // Query builders
  // ---------------------------------------------------------------------------

  protected async buildDirectPolicies(opts: {
    filter: ICasbinPolicyFilter;
    rolePrincipal: string;
  }): Promise<string[]> {
    const { permission: perm, policyDefinition: pd } = this.entities;
    const { principalType, principalValue } = opts.filter;

    const result = await this.connector.execute<TBasePolicyRow>(sql`
      SELECT pd.variant, p.code, pd.action,
             pd.subject_type AS "subjectType", pd.subject_id AS "subjectId",
             pd.effect, pd.domain
      FROM ${sql.identifier(pd.tableName)} pd
      INNER JOIN ${sql.identifier(perm.tableName)} p ON pd.target_id = p.id
      WHERE pd.variant = ${CasbinRuleVariants.POLICY}
        AND pd.subject_type = ${principalType}
        AND pd.subject_id = ${principalValue}
        AND pd.target_type = ${perm.principalType}
    `);

    const policyLines: Array<string> = [];
    if (!result.rows.length) {
      return policyLines;
    }

    for (const row of result.rows) {
      const line = this.toPolicyLine({ row });
      if (!line) {
        continue;
      }

      policyLines.push(line);
    }

    return policyLines;
  }

  protected async buildGroupPolicies(opts: {
    filter: ICasbinPolicyFilter;
  }): Promise<{ lines: string[]; roleIds: (string | number)[] }> {
    const { role: rol, policyDefinition: pd } = this.entities;
    const { principalType, principalValue } = opts.filter;

    type TRow = { targetId: string | number; domain: string | null };

    const result = await this.connector.execute<TRow>(sql`
      SELECT pd.target_id AS "targetId", pd.domain
      FROM ${sql.identifier(pd.tableName)} pd
      WHERE pd.variant = ${CasbinRuleVariants.GROUP}
        AND pd.subject_type = ${principalType}
        AND pd.subject_id = ${principalValue}
        AND pd.target_type = ${rol.principalType}
    `);

    const policyLines: Array<string> = [];
    const roleIds: (string | number)[] = [];

    if (!result.rows.length) {
      return { lines: policyLines, roleIds };
    }

    for (const row of result.rows) {
      roleIds.push(row.targetId);

      policyLines.push(
        this.toGroupLine({
          subject: `${principalType}_${principalValue}`,
          role: `${rol.principalType}_${row.targetId}`,
          domain: this.formatDomain(row.domain),
        }),
      );
    }

    return { lines: policyLines, roleIds };
  }

  protected async buildRolePolicies(opts: {
    roleIds: (string | number)[];
    rolePrincipal: string;
  }): Promise<string[]> {
    const { permission: perm, role: rol, policyDefinition: pd } = this.entities;
    const { roleIds } = opts;

    const result = await this.connector.execute<TBasePolicyRow>(sql`
      SELECT pd.variant, p.code, pd.action,
             pd.subject_type AS "subjectType", pd.subject_id AS "subjectId",
             pd.effect, pd.domain
      FROM ${sql.identifier(pd.tableName)} pd
      INNER JOIN ${sql.identifier(perm.tableName)} p ON pd.target_id = p.id
      WHERE pd.variant = ${CasbinRuleVariants.POLICY}
        AND pd.subject_type = ${rol.principalType}
        AND pd.subject_id IN (${sql.join(
          roleIds.map(id => sql`${id}`),
          sql`, `,
        )})
        AND pd.target_type = ${perm.principalType}
    `);

    const policyLines: Array<string> = [];

    if (!result.rows.length) {
      return policyLines;
    }

    for (const row of result.rows) {
      const line = this.toPolicyLine({ row });
      if (!line) {
        continue;
      }

      policyLines.push(line);
    }

    return policyLines;
  }
}
