import { readResultRows } from '@/utilities';
import { BaseHelper } from '@venizia/ignis-helpers';
import { type FilteredAdapter, type Model } from 'casbin';
import type { SQL } from 'drizzle-orm';
import type { ICasbinPolicyFilter, ICasbinPolicySource, TCasbinPolicyConnector } from './types';

/**
 * Read-only base for casbin FilteredAdapters backed by a datasource — owns the connector plumbing
 * and no-op write methods; subclasses only implement {@link loadFilteredPolicy} per principal.
 */
export abstract class BaseFilteredAdapter<TFilter = ICasbinPolicyFilter>
  extends BaseHelper
  implements FilteredAdapter
{
  protected readonly dataSource: ICasbinPolicySource;

  constructor(opts: { scope: string; dataSource: ICasbinPolicySource }) {
    super({ scope: opts.scope });
    this.dataSource = opts.dataSource;
  }

  protected get connector(): TCasbinPolicyConnector {
    return this.dataSource.connector;
  }

  /**
   * Runs a raw statement and returns its rows. Drizzle's `execute()` result shape differs per driver
   * - node-postgres yields `{ rows }`, postgres-js yields the row list itself - so adapters must never
   * read `.rows` directly.
   */
  protected async query<TRow>(opts: { statement: SQL }): Promise<TRow[]> {
    const result = await this.connector.execute(opts.statement);
    return readResultRows<TRow>({ result });
  }

  /** Load ONLY the policies matching `filter` into `model` (the store is read for one principal). */
  abstract loadFilteredPolicy(model: Model, filter: TFilter): Promise<void>;

  isFiltered(): boolean {
    return true;
  }

  // Read-only adapter — write methods are intentional no-ops.
  async loadPolicy(): Promise<void> {}
  async savePolicy(): Promise<boolean> {
    return true;
  }
  async addPolicy(): Promise<void> {}
  async removePolicy(): Promise<void> {}
  async removeFilteredPolicy(): Promise<void> {}

  /** Parse + load casbin policy lines into a model. Shared by subclasses' loadFilteredPolicy. */
  protected async loadLines(opts: { model: Model; lines: string[] }): Promise<void> {
    const { Helper } = await import('casbin');
    for (const line of opts.lines) {
      Helper.loadPolicyLine(line, opts.model);
    }
  }
}
