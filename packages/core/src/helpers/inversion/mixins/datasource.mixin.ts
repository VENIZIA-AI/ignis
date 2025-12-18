import { TMixinTarget } from '@venizia/ignis-helpers';
import { MetadataRegistry as _MetadataRegistry } from '@venizia/ignis-inversion';
import { MetadataKeys } from '../common/keys';
import { IDataSourceMetadata } from '../common/types';

// -----------------------------------------------------------------
// DataSource Metadata
// -----------------------------------------------------------------
export const DatasourceMetadataMixin = <BaseClass extends TMixinTarget<_MetadataRegistry>>(
  baseClass: BaseClass,
  // mixinOpts: { },
) => {
  return class extends baseClass {
    setDataSourceMetadata<Target extends object = object>(opts: {
      target: Target;
      metadata: IDataSourceMetadata;
    }): void {
      const { target, metadata } = opts;

      Reflect.defineMetadata(
        MetadataKeys.DATASOURCE,
        Object.assign(
          {},
          { autoDiscovery: true }, // Default autoDiscovery to true
          metadata, // User can disable autoDiscovery by passing autoDiscovery = false here
        ),
        target,
      );
    }

    getDataSourceMetadata<Target extends object = object>(opts: {
      target: Target;
    }): IDataSourceMetadata | undefined {
      const { target } = opts;
      return Reflect.getMetadata(MetadataKeys.DATASOURCE, target);
    }
  };
};
