import { IDataSource, TAnyConnector } from '@/base/datasources';
import { sql } from 'drizzle-orm';
import { CasbinRuleVariants } from '../common';
import {
  BaseFilteredAdapter,
  type IBaseFilteredAdapterEntities,
  type ICasbinPolicyFilter,
  type TBasePolicyRow,
} from './base-filtered';
export interface IDrizzleCasbinEntities extends IBaseFilteredAdapterEntities {
  permission: {
    schemaName?: string;
    tableName: string;
    principalType: string;
  };
  role: {
    schemaName?: string;
    tableName: string;
    principalType: string;
  };
  policyDefinition: {
    schemaName?: string;
    tableName: string;
    principalType: string;
  };
}

export interface IDrizzleCasbinAdapterOptions {
  dataSource: IDataSource;
  entities: IDrizzleCasbinEntities;
}

// Drizzle Casbin Adapter — read-only FilteredAdapter using raw SQL queries

export class DrizzleCasbinAdapter extends BaseFilteredAdapter<IDrizzleCasbinEntities> {
  private dataSource: IDataSource;

  private static readonly DEFAULT_SCHEMA = 'public';

  private get connector(): TAnyConnector {
    return this.dataSource.connector;
  }

  constructor(opts: IDrizzleCasbinAdapterOptions) {
    // set default schema
    if (opts.entities) {
      if (opts.entities.permission) {
        opts.entities.permission.schemaName =
          opts.entities.permission.schemaName ?? DrizzleCasbinAdapter.DEFAULT_SCHEMA;
      }

      if (opts.entities.role) {
        opts.entities.role.schemaName =
          opts.entities.role.schemaName ?? DrizzleCasbinAdapter.DEFAULT_SCHEMA;
      }

      if (opts.entities.policyDefinition) {
        opts.entities.policyDefinition.schemaName =
          opts.entities.policyDefinition.schemaName ?? DrizzleCasbinAdapter.DEFAULT_SCHEMA;
      }
    }

    super({ scope: DrizzleCasbinAdapter.name, entities: opts.entities });
    this.dataSource = opts.dataSource;
  }

  // Query builders

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
      FROM ${sql.identifier(pd.schemaName!)}.${sql.identifier(pd.tableName)} pd
      INNER JOIN ${sql.identifier(perm.schemaName!)}.${sql.identifier(perm.tableName)} p ON pd.target_id = p.id
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
      FROM ${sql.identifier(pd.schemaName!)}.${sql.identifier(pd.tableName)} pd
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
      FROM ${sql.identifier(pd.schemaName!)}.${sql.identifier(pd.tableName)} pd
      INNER JOIN ${sql.identifier(perm.schemaName!)}.${sql.identifier(perm.tableName)} p ON pd.target_id = p.id
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
