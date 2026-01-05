import { BaseEntity, TTableSchemaWithId } from '@/base/models';
import { MetadataRegistry } from '@/helpers/inversion';
import { TMixinTarget } from '@venizia/ignis-helpers';
import { TFilter } from '../common';
import { FilterBuilder } from '../operators';

// -----------------------------------------------------------------------------
// Default Filter Mixin
// -----------------------------------------------------------------------------

/**
 * Mixin that adds default filter support to repositories.
 *
 * This mixin provides functionality to:
 * - Retrieve default filters defined in model metadata
 * - Automatically apply default filters to user queries
 * - Allow bypassing default filters when needed
 *
 * Common use cases include soft delete filters (e.g., `{ where: { isDeleted: false } }`)
 * that are automatically applied to all queries.
 *
 * @template T - The base class type to extend
 * @param baseClass - The base class to mix into
 * @returns The mixed class with default filter support
 *
 * @example
 * ```typescript
 * // In model metadata
 * @model({ settings: { defaultFilter: { where: { isDeleted: false } } } })
 * export class User extends BaseEntity<typeof UserSchema> { ... }
 *
 * // Default filter is automatically applied
 * const activeUsers = await userRepo.find({ filter: {} });
 * // SQL: SELECT * FROM users WHERE is_deleted = false
 *
 * // Bypass default filter when needed
 * const allUsers = await userRepo.find({
 *   filter: {},
 *   options: { shouldSkipDefaultFilter: true }
 * });
 * ```
 */
export const DefaultFilterMixin = <T extends TMixinTarget<object>>(baseClass: T) => {
  abstract class Mixed extends baseClass {
    /** Cached default filter. Null until first access, undefined if no default filter. */
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
     * Gets default filter from model metadata.
     * Cached for performance - computed once per repository instance.
     *
     * @returns The default filter or undefined if not configured
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
     * Returns merged filter or user filter if shouldSkipDefaultFilter is true.
     */
    applyDefaultFilter<DataObject = any>(opts: {
      userFilter?: TFilter<DataObject>;
      shouldSkipDefaultFilter?: boolean;
    }): TFilter<DataObject> {
      const { userFilter, shouldSkipDefaultFilter } = opts;

      // Skip default filter if explicitly requested
      if (shouldSkipDefaultFilter) {
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
