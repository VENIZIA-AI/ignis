import type {
  IArtifactMetadata,
  IArtifactRegistrationOptions,
  TBindingScope,
} from '@/helpers/inversion';
import { ArtifactTypes, MetadataRegistry } from '@/helpers/inversion';
import { getError } from '@venizia/ignis-helpers/core';

/** The root stereotype: marks a class as an artifact the application registers, with its registration defaults. Every other stereotype calls it. */
export const injectable = <App = unknown>(opts: IArtifactMetadata<App>): ClassDecorator => {
  return target => {
    if (!ArtifactTypes.isValid(opts.type)) {
      throw getError({
        message: `[injectable][${target.name}] Invalid artifact type: '${opts.type}' | Expected one of: ${[...ArtifactTypes.SCHEME_SET].join(', ')}`,
      });
    }

    MetadataRegistry.getInstance().setArtifactMetadata({
      target,
      metadata: opts as IArtifactMetadata,
    });
  };
};

export const service = <App = unknown>(
  opts?: IArtifactRegistrationOptions<App>,
): ClassDecorator => {
  return injectable<App>({ type: ArtifactTypes.SERVICE, ...opts });
};

export const component = <App = unknown>(
  opts?: IArtifactRegistrationOptions<App>,
): ClassDecorator => {
  return injectable<App>({ type: ArtifactTypes.COMPONENT, ...opts });
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

/** Splits a stereotype's metadata into the registration defaults and the rest, so each reader sees only its own fields. */
export const splitRegistrationOptions = <Metadata extends IArtifactRegistrationOptions>(opts: {
  metadata: Metadata;
}): {
  registration: IArtifactRegistrationOptions;
  rest: Omit<Metadata, keyof IArtifactRegistrationOptions>;
} => {
  const { binding, allowOverride, scope, order, when, ...rest } = opts.metadata;
  const registration: IArtifactRegistrationOptions = {};

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

  return { registration, rest };
};
