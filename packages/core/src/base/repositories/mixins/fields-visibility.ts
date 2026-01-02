import { BaseEntity, TTableSchemaWithId } from '@/base/models';
import { MetadataRegistry } from '@/helpers/inversion';
import { TMixinTarget } from '@venizia/ignis-helpers';
import { getTableColumns } from 'drizzle-orm';

export const FieldsVisibilityMixin = <T extends TMixinTarget<object>>(baseClass: T) => {
  abstract class Mixed extends baseClass {
    _hiddenProperties: Set<string> | null = null;
    _visibleProperties: Record<string, any> | null | undefined = null;

    /**
     * Abstract method - must be implemented by the class using this mixin.
     */
    abstract getEntity(): BaseEntity<TTableSchemaWithId>;

    // ---------------------------------------------------------------------------
    // Hidden Properties
    // ---------------------------------------------------------------------------

    /**
     * Get hidden properties - auto-resolves from model metadata
     */
    get hiddenProperties(): Set<string> {
      return this.getHiddenProperties();
    }

    set hiddenProperties(value: Set<string>) {
      this._hiddenProperties = value;
    }

    /**
     * Get hidden properties from model metadata.
     * Cached for performance - computed once per repository instance.
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
     * Check if this entity has hidden properties configured.
     */
    hasHiddenProperties(): boolean {
      return this.getHiddenProperties().size > 0;
    }

    // ---------------------------------------------------------------------------
    // Visible Properties
    // ---------------------------------------------------------------------------

    /**
     * Get visible properties - auto-resolves from schema excluding hidden properties
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
