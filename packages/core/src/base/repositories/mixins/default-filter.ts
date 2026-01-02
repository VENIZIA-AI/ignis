import { BaseEntity, TTableSchemaWithId } from '@/base/models';
import { MetadataRegistry } from '@/helpers/inversion';
import { TMixinTarget } from '@venizia/ignis-helpers';
import { TFilter } from '../common';
import { FilterBuilder } from '../operators';

export const DefaultFilterMixin = <T extends TMixinTarget<object>>(baseClass: T) => {
  abstract class Mixed extends baseClass {
    _defaultFilter: TFilter | null | undefined = null;

    /**
     * Abstract methods - must be implemented by the class using this mixin.
     */
    abstract getEntity(): BaseEntity<TTableSchemaWithId>;
    abstract get filterBuilder(): FilterBuilder;

    // ---------------------------------------------------------------------------
    // Default Filter
    // ---------------------------------------------------------------------------

    /**
     * Get default filter from model metadata.
     * Cached for performance - computed once per repository instance.
     */
    getDefaultFilter() {
      // null = not computed yet, undefined = computed as "no default filter"
      if (this._defaultFilter !== null) {
        return this._defaultFilter;
      }

      const registry = MetadataRegistry.getInstance();
      const modelEntry = registry.getModelEntry({ name: this.getEntity().name });
      const defaultFilter = modelEntry?.metadata?.settings?.defaultFilter;

      this._defaultFilter = defaultFilter;
      return this._defaultFilter;
    }

    /**
     * Check if this entity has default filter configured.
     */
    hasDefaultFilter(): boolean {
      const defaultFilter = this.getDefaultFilter();
      return defaultFilter !== undefined && Object.keys(defaultFilter).length > 0;
    }

    /**
     * Apply default filter to user-provided filter.
     * Returns merged filter or user filter if skipDefaultFilter is true.
     */
    applyDefaultFilter<DataObject = any>(opts: {
      userFilter?: TFilter<DataObject>;
      skipDefaultFilter?: boolean;
    }): TFilter<DataObject> {
      const { userFilter, skipDefaultFilter } = opts;

      // Skip default filter if explicitly requested
      if (skipDefaultFilter) {
        return userFilter ?? {};
      }

      // Get default filter from model metadata
      const defaultFilter = this.getDefaultFilter();

      // No default filter configured - return user filter
      if (!defaultFilter) {
        return userFilter ?? {};
      }

      // Merge default filter with user filter
      return this.filterBuilder.mergeFilter({ defaultFilter, userFilter });
    }
  }

  return Mixed;
};
