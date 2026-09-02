import type {
  IArtifactMetadata,
  IArtifactRegistrationOptions,
  TBindingScope,
} from '@/helpers/inversion';
import { ArtifactTypes, MetadataRegistry } from '@/helpers/inversion';
import { getError } from '@venizia/ignis-helpers/core';

/** The root stereotype: marks a class as an artifact the application registers, with its registration defaults. Every other stereotype calls it. */
export const injectable = <ApplicationType = unknown>(
  opts: IArtifactMetadata<ApplicationType>,
): ClassDecorator => {
  return target => {
    if (!ArtifactTypes.isValid(opts.type)) {
      throw getError({
        message: `[injectable][${target.name}] Invalid artifact type: '${opts.type}' | Expected one of: ${[...ArtifactTypes.SCHEME_SET].join(', ')}`,
      });
    }

    MetadataRegistry.getInstance().setArtifactMetadata({ target, metadata: opts });
  };
};

export const service = <ApplicationType = unknown>(
  opts?: IArtifactRegistrationOptions<ApplicationType>,
): ClassDecorator => {
  return injectable<ApplicationType>({ type: ArtifactTypes.SERVICE, ...opts });
};

export const component = <ApplicationType = unknown>(
  opts?: IArtifactRegistrationOptions<ApplicationType>,
): ClassDecorator => {
  return injectable<ApplicationType>({ type: ArtifactTypes.COMPONENT, ...opts });
};

/** Marks a component method as the provider of `key`. `registerArtifacts` binds the key to a lazy provider that resolves the component and calls the method; SINGLETON unless `scope` says otherwise. */
export const provide = (opts: { key: string; scope?: TBindingScope }): MethodDecorator => {
  return (target, propertyKey) => {
    MetadataRegistry.getInstance().addProvideMetadata({
      target: target.constructor,
      metadata: {
        methodName: propertyKey,
        key: opts.key,
        ...(opts.scope ? { scope: opts.scope } : {}),
      },
    });
  };
};

/** The registration defaults a stereotype forwards to `@injectable`, copied field by field so an absent option stays absent. */
export const pickRegistrationOptions = <ApplicationType = unknown>(opts: {
  metadata: IArtifactRegistrationOptions<ApplicationType>;
}): IArtifactRegistrationOptions<ApplicationType> => {
  const { binding, allowOverride, scope, order, when } = opts.metadata;
  const registration: IArtifactRegistrationOptions<ApplicationType> = {};

  if (binding !== undefined) {
    registration.binding = binding;
  }
  if (allowOverride !== undefined) {
    registration.allowOverride = allowOverride;
  }
  if (scope !== undefined) {
    registration.scope = scope;
  }
  if (order !== undefined) {
    registration.order = order;
  }
  if (when !== undefined) {
    registration.when = when;
  }

  return registration;
};
