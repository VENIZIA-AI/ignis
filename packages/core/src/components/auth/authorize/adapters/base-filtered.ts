import { IdType } from '@/base';
import { IDataSource, TAnyConnector } from '@/base/datasources';
import { BaseHelper } from '@venizia/ignis-helpers';
import { type FilteredAdapter, type Model } from 'casbin';

/** Filter passed to loadFilteredPolicy: which principal's policies to load. */
export interface ICasbinPolicyFilter {
  principal: { type: string; id: IdType };
}

/**
 * Read-only base for casbin FilteredAdapters backed by a datasource.
 *
 * It owns the boilerplate every filtered adapter repeats — the datasource/connector plumbing, the
 * `isFiltered() === true` flag, the no-op write methods (read-only), and a `loadLines` helper — so a
 * subclass only implements {@link loadFilteredPolicy}: query the store for ONE principal's policies
 * and turn them into casbin lines.
 *
 * `TFilter` is the filter shape (defaults to {@link ICasbinPolicyFilter}); subclasses may narrow it.
 */
export abstract class BaseFilteredAdapter<TFilter = ICasbinPolicyFilter>
  extends BaseHelper
  implements FilteredAdapter
{
  protected readonly dataSource: IDataSource;

  constructor(opts: { scope: string; dataSource: IDataSource }) {
    super({ scope: opts.scope });
    this.dataSource = opts.dataSource;
  }

  protected get connector(): TAnyConnector {
    return this.dataSource.connector;
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
