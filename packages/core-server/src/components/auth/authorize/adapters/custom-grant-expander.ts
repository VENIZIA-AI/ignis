import type { IdType } from '@/base';
import { readResultRows } from '@/utilities';
import { BaseHelper } from '@venizia/ignis-helpers/core';
import {
  AuthorizationActions,
  AuthorizationPermissionBuilder,
  AuthorizationPolicyVariants,
  GrantBuilder,
  type TCustomGrantMetadata,
} from '@venizia/ignis-kernel';
import { sql, type SQL } from 'drizzle-orm';
import { PolicyConnectorResolver } from './connector';
import type { ICasbinPolicySource, IScopedCasbinEntities } from './common';

const DEFAULT_SCHEMA = 'public';

/** A custom row that survived {@link CustomGrantExpander.rejectCustomRow}, ready for op-to-catalog resolution. */
export type TCustomGrantRow = {
  subjectId: IdType;
  objectSubject: string;
  ops: string[];
  domain: string;
  effect: string;
};

/**
 * Expands "custom" operation-subset grants (`metadata.ops`) into one casbin line per catalogued
 * operation. Isolated from the filtered-policy loader on purpose: it owns its own SQL
 * (`queryOperationCatalog`) and error vocabulary, and never reaches back into ScopedCasbinAdapter.
 */
export class CustomGrantExpander extends BaseHelper {
  protected readonly dataSource: ICasbinPolicySource;
  protected readonly permission: IScopedCasbinEntities['permission'];
  protected readonly softDelete: IScopedCasbinEntities['softDelete'];

  constructor(opts: {
    dataSource: ICasbinPolicySource;
    entities: Pick<IScopedCasbinEntities, 'permission' | 'softDelete'>;
  }) {
    super({ scope: CustomGrantExpander.name });
    this.dataSource = opts.dataSource;
    this.permission = opts.entities.permission;
    this.softDelete = opts.entities.softDelete;
  }

  /** Why a custom-looking grant row cannot be honoured, or null when it is well formed. */
  rejectCustomRow(opts: {
    row: { subjectId: IdType; objectCode: string; objectMethod: string };
    parsed: TCustomGrantMetadata | null;
    isCustomAction: boolean;
    metadataColumnName?: string;
  }): string | null {
    const { row, parsed, isCustomAction, metadataColumnName } = opts;

    if (isCustomAction && !metadataColumnName) {
      return `Skipping custom grant - entities.policyDefinition.metadata.columnName is not mapped, so metadata.ops cannot be read | subject id: ${row.subjectId} | object: ${row.objectCode}`;
    }

    if (isCustomAction && !parsed) {
      return `Skipping custom grant - metadata.ops is missing, empty, or not an array of non-empty strings | subject id: ${row.subjectId} | object: ${row.objectCode}`;
    }

    if (!isCustomAction && parsed) {
      return `Skipping grant - metadata.ops is present but action is not "${AuthorizationActions.CUSTOM}", so the intent is ambiguous | subject id: ${row.subjectId} | object: ${row.objectCode}`;
    }

    if (row.objectMethod !== AuthorizationPermissionBuilder.RESOURCE_NODE_METHOD) {
      return `Skipping custom grant - the target must be a subject-level resource node | subject id: ${row.subjectId} | object: ${row.objectCode}`;
    }

    return null;
  }

  /** Resolve every custom row's ops in one catalog query, then emit one line per resolved operation. Unresolvable ops come back as `rejections` rather than being logged here - the caller owns the logger the tests swap. */
  async expandCustomGrants(opts: {
    subjectType: string;
    customRows: TCustomGrantRow[];
  }): Promise<{ lines: string[]; rejections: string[] }> {
    if (!opts.customRows.length) {
      return { lines: [], rejections: [] };
    }

    const seen = new Set<string>();
    const pairs: Array<{ subject: string; method: string }> = [];

    const candidates = opts.customRows.flatMap(row =>
      row.ops.map(op => ({ subject: row.objectSubject, method: op })),
    );

    for (const candidate of candidates) {
      const key = `${candidate.subject}.${candidate.method}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      pairs.push(candidate);
    }

    const catalog = await this.queryOperationCatalog({ pairs });
    const byKey = new Map(catalog.map(entry => [`${entry.subject}.${entry.method}`, entry]));
    const lines: string[] = [];
    const rejections: string[] = [];

    for (const row of opts.customRows) {
      const { valid, unknown } = GrantBuilder.getInstance().validateCustomGrantOps({
        ops: row.ops,
        subject: row.objectSubject,
        catalog,
      });

      if (unknown.length) {
        rejections.push(
          `Skipping unresolvable operations in a custom grant | subject id: ${row.subjectId} | resource: ${row.objectSubject} | unknown: ${unknown.join(', ')}`,
        );
      }

      for (const op of valid) {
        const entry = byKey.get(`${row.objectSubject}.${op}`)!;

        lines.push(
          `${AuthorizationPolicyVariants.GRANT.rule}, ${opts.subjectType}_${row.subjectId}, ${row.domain}, ${entry.code}, ${entry.action}, ${row.effect}`,
        );
      }
    }

    return { lines, rejections };
  }

  /** Schema-qualified table reference (`"<schema>"."<table>"`) for use after FROM/JOIN with an alias. */
  private qualifiedTable(opts: { table: { schemaName?: string; tableName: string } }): SQL {
    const { table } = opts;
    const schema = table.schemaName ?? DEFAULT_SCHEMA;
    return sql`${sql.identifier(schema)}.${sql.identifier(table.tableName)}`;
  }

  /** `AND <alias>.<col> IS NULL` when soft-delete is on, else empty. The alias is emitted raw to match the unquoted FROM alias - quoting folds it to a different case and breaks the join. */
  private softDeleteClause(opts: { alias: string }): SQL {
    const sd = this.softDelete;
    if (!sd?.use) {
      return sql.empty();
    }

    return sql` AND ${sql.raw(opts.alias)}.${sql.identifier(sd.columnName)} IS NULL`;
  }

  /** Resolve `(subject, method)` pairs to catalogued operations. One query for the whole extraction. */
  private async queryOperationCatalog(opts: {
    pairs: Array<{ subject: string; method: string }>;
  }): Promise<Array<{ subject: string; method: string; code: string; action: string }>> {
    if (!opts.pairs.length) {
      return [];
    }

    const permissionTable = this.qualifiedTable({ table: this.permission });
    const connector = PolicyConnectorResolver.resolve({
      source: this.dataSource,
      caller: CustomGrantExpander.name,
    });

    const result = await connector.execute(sql`
      SELECT permission.subject, permission.method, permission.code, permission.action
      FROM ${permissionTable} permission
      WHERE (permission.subject, permission.method) IN (${sql.join(
        opts.pairs.map(pair => sql`(${pair.subject}, ${pair.method})`),
        sql`, `,
      )})
        AND permission.method <> ${AuthorizationPermissionBuilder.RESOURCE_NODE_METHOD}${this.softDeleteClause(
          { alias: 'permission' },
        )}
    `);

    return readResultRows<{ subject: string; method: string; code: string; action: string }>({
      result,
    });
  }
}
