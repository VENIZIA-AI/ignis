import { BaseEntity, TTableSchemaWithId } from '@/base/models';
import { MetadataRegistry } from '@/helpers/inversion';
import { TMixinTarget } from '@venizia/ignis-helpers';
import { getTableColumns } from 'drizzle-orm';

/** Mixin that excludes hidden properties from query results at SQL level. */
export const FieldsVisibilityMixin = <T extends TMixinTarget<object>>(baseClass: T) => {
  abstract class Mixed extends baseClass {
    _hiddenProperties: Set<string> | null = null;
    _visibleProperties: Record<string, any> | null | undefined = null;

    abstract getEntity(): BaseEntity<TTableSchemaWithId>;

    get hiddenProperties(): Set<string> {
      return this.getHiddenProperties();
    }

    set hiddenProperties(value: Set<string>) {
      this._hiddenProperties = value;
    }

    /** Gets hidden properties from model metadata. Cached after first access. */
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

    hasHiddenProperties(): boolean {
      return this.getHiddenProperties().size > 0;
    }
    get visibleProperties(): Record<string, any> | undefined {
      return this.getVisibleProperties();
    }

    set visibleProperties(value: Record<string, any> | undefined) {
      this._visibleProperties = value;
    }

    /** Gets visible properties for Drizzle select/returning. Undefined if no hidden props. Cached. */
    getVisibleProperties(): Record<string, any> | undefined {
      if (this._visibleProperties !== null) {
        return this._visibleProperties;
      }

      const hiddenProps = this.getHiddenProperties();

      if (hiddenProps.size === 0) {
        this._visibleProperties = undefined;
        return undefined;
      }

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
