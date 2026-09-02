import type { TMixinTarget } from '@venizia/ignis-helpers/common';
import type { MetadataRegistry as _MetadataRegistry } from '@venizia/ignis-inversion';
import { MetadataKeys } from '../common/keys';
import type { IArtifactMetadata, IProvideMetadata } from '../common/types';

export const ArtifactMetadataMixin = <BaseClass extends TMixinTarget<_MetadataRegistry>>(
  baseClass: BaseClass,
) => {
  return class extends baseClass {
    setArtifactMetadata<Target extends object = object, ApplicationType = unknown>(opts: {
      target: Target;
      metadata: IArtifactMetadata<ApplicationType>;
    }): void {
      Reflect.defineMetadata(MetadataKeys.ARTIFACT, opts.metadata, opts.target);
    }

    // Own metadata only: a subclass of a decorated class is not itself an artifact.
    getArtifactMetadata<Target extends object = object>(opts: {
      target: Target;
    }): IArtifactMetadata | undefined {
      return Reflect.getOwnMetadata(MetadataKeys.ARTIFACT, opts.target);
    }

    addProvideMetadata<Target extends object = object>(opts: {
      target: Target;
      metadata: IProvideMetadata;
    }): void {
      const current = this.getProvideMetadata({ target: opts.target });
      Reflect.defineMetadata(MetadataKeys.PROVIDES, [...current, opts.metadata], opts.target);
    }

    getProvideMetadata<Target extends object = object>(opts: {
      target: Target;
    }): IProvideMetadata[] {
      return Reflect.getOwnMetadata(MetadataKeys.PROVIDES, opts.target) ?? [];
    }
  };
};
