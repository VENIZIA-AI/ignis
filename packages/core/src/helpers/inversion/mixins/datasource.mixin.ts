import type { TMixinTarget } from '@venizia/ignis-helpers';
import type { MetadataRegistry as _MetadataRegistry } from '@venizia/ignis-inversion';
import { MetadataKeys } from '../common/keys';
import type { IDataSourceMetadata } from '../common/types';

export const DatasourceMetadataMixin = <BaseClass extends TMixinTarget<_MetadataRegistry>>(
  baseClass: BaseClass,
) => {
  return class extends baseClass {
    setDataSourceMetadata<Target extends object = object>(opts: {
      target: Target;
      metadata: IDataSourceMetadata;
    }): void {
      const { target, metadata } = opts;

      Reflect.defineMetadata(
        MetadataKeys.DATASOURCE,
        Object.assign({}, { autoDiscovery: true }, metadata),
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
