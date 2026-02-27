import { BaseEntity, TTableSchemaWithId } from '@/base/models';
import { MetadataRegistry } from '@/helpers/inversion';
import { TMixinTarget } from '@venizia/ignis-helpers';
import { TFilter } from '../common';
import { FilterBuilder } from '../operators';

/** Mixin that auto-applies default filters from model metadata (e.g., soft delete). */
export const DefaultFilterMixin = <T extends TMixinTarget<object>>(baseClass: T) => {
  abstract class Mixed extends baseClass {
    _defaultFilter: TFilter | null | undefined = null;

    abstract getEntity(): BaseEntity<TTableSchemaWithId>;
    abstract get filterBuilder(): FilterBuilder;

    /** Gets default filter from model metadata. Cached after first access. */
    getDefaultFilter() {
      if (this._defaultFilter !== null) {
        return this._defaultFilter;
      }

      const registry = MetadataRegistry.getInstance();
      const modelEntry = registry.getModelEntry({ name: this.getEntity().name });
      const defaultFilter = modelEntry?.metadata?.settings?.defaultFilter;

      this._defaultFilter = defaultFilter;
      return this._defaultFilter;
    }

    hasDefaultFilter(): boolean {
      const defaultFilter = this.getDefaultFilter();
      return defaultFilter !== undefined && Object.keys(defaultFilter).length > 0;
    }

    /** Merges default filter with user filter. Skippable via shouldSkipDefaultFilter. */
    applyDefaultFilter<DataObject = any>(opts: {
      userFilter?: TFilter<DataObject>;
      shouldSkipDefaultFilter?: boolean;
    }): TFilter<DataObject> {
      const { userFilter, shouldSkipDefaultFilter } = opts;

      if (shouldSkipDefaultFilter) {
        return userFilter ?? {};
      }

      const defaultFilter = this.getDefaultFilter();
      if (!defaultFilter) {
        return userFilter ?? {};
      }

      return this.filterBuilder.mergeFilter({ defaultFilter, userFilter });
    }
  }

  return Mixed;
};
