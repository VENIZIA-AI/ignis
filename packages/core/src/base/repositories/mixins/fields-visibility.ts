import { BaseEntity, TTableSchemaWithId } from '@/base/models';
import { MetadataRegistry } from '@/helpers/inversion';
import { TMixinTarget } from '@venizia/ignis-helpers';
import { getTableColumns } from 'drizzle-orm';

// -----------------------------------------------------------------------------
// Fields Visibility Mixin
// -----------------------------------------------------------------------------

/**
 * Mixin that adds hidden/visible property management to repositories.
 *
 * This mixin provides functionality to:
 * - Track hidden properties defined in model metadata
 * - Generate visible properties for Drizzle select/returning operations
 * - Cache computed properties for performance
 *
 * Hidden properties are automatically excluded from query results at the SQL level,
 * preventing sensitive data (like passwords) from being returned.
 *
 * @template T - The base class type to extend
 * @param baseClass - The base class to mix into
 * @returns The mixed class with fields visibility support
 *
 * @example
 * ```typescript
 * // In model metadata
 * @model({ settings: { hiddenProperties: ['password', 'secretToken'] } })
 * export class User extends BaseEntity<typeof UserSchema> { ... }
 *
 * // In repository, hidden fields are automatically excluded
 * const users = await userRepo.find({ filter: {} });
 * // users won't include 'password' or 'secretToken' fields
 * ```
 */
export const FieldsVisibilityMixin = <T extends TMixinTarget<object>>(baseClass: T) => {
  abstract class Mixed extends baseClass {
    /** Cached set of hidden property names. Null until first access. */
    _hiddenProperties: Set<string> | null = null;

    /** Cached visible properties object. Null until first access, undefined if no hidden props. */
    _visibleProperties: Record<string, any> | null | undefined = null;

    /**
     * Abstract method - must be implemented by the class using this mixin.
     * @returns The entity instance for this repository
     */
    abstract getEntity(): BaseEntity<TTableSchemaWithId>;

    // ---------------------------------------------------------------------------
    // Hidden Properties
    // ---------------------------------------------------------------------------

    /**
     * Gets the set of hidden property names.
     * Auto-resolves from model metadata on first access.
     */
    get hiddenProperties(): Set<string> {
      return this.getHiddenProperties();
    }

    /** Sets the hidden properties set. */
    set hiddenProperties(value: Set<string>) {
      this._hiddenProperties = value;
    }

    /**
     * Gets hidden properties from model metadata.
     * Cached for performance - computed once per repository instance.
     *
     * @returns Set of hidden property names
     */
    getHiddenProperties(): Set<string> {
      if (this._hiddenProperties !== null) {
        return this._hiddenProperties;
      }

      const registry = MetadataRegistry.getInstance();
      const modelEntry = registry.getModelEntry({ name: this.getEntity().name });
      const hiddenProps = modelEntry?.metadata?.settings?.hiddenProperties ?? [];

      this._hiddenProperties = new Set(hiddenProps);
      return this._hiddenProperties;
    }

    /**
     * Checks if this entity has hidden properties configured.
     *
     * @returns True if there are hidden properties
     */
    hasHiddenProperties(): boolean {
      return this.getHiddenProperties().size > 0;
    }

    // ---------------------------------------------------------------------------
    // Visible Properties
    // ---------------------------------------------------------------------------

    /**
     * Gets visible properties object.
     * Auto-resolves from schema excluding hidden properties.
     */
    get visibleProperties(): Record<string, any> | undefined {
      return this.getVisibleProperties();
    }

    set visibleProperties(value: Record<string, any> | undefined) {
      this._visibleProperties = value;
    }

    /**
     * Get visible properties object for Drizzle select/returning.
     * Excludes hidden properties. Cached for performance.
     *
     * @returns Column object for Drizzle (e.g., { id: schema.id, email: schema.email })
     *          or undefined if no hidden properties (use default select all behavior)
     */
    getVisibleProperties(): Record<string, any> | undefined {
      // null = not computed yet, undefined = computed as "no hidden properties"
      if (this._visibleProperties !== null) {
        return this._visibleProperties;
      }

      const hiddenProps = this.getHiddenProperties();

      // If no hidden properties, cache and return undefined (signal to use default behavior)
      if (hiddenProps.size === 0) {
        this._visibleProperties = undefined;
        return undefined;
      }

      // Build columns object excluding hidden properties
      const schema = this.getEntity().schema;
      const columns = getTableColumns(schema);
      const visibleProperties: Record<string, any> = {};

      for (const key in columns) {
        if (!hiddenProps.has(key)) {
          visibleProperties[key] = columns[key];
        }
      }

      this._visibleProperties = visibleProperties;
      return this._visibleProperties;
    }
  }

  return Mixed;
};
