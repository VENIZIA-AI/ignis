import { BindingNamespaces } from '@/common/bindings';
import { BindingKeys, MetadataRegistry } from '@/helpers/inversion';
import type { TClass } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';

/**
 * Injects `repositories.<repositoryName>` into constructor parameter 0 of a factory-generated
 * controller, so a subclass needs no constructor. Recorded as metadata rather than a parameter
 * decorator, which Bun drops in some configurations. A subclass that declares its own `@inject` at
 * index 0 wins, and a sibling subclass keeps the factory's key.
 */
export const registerFactoryRepositoryInjection = (opts: {
  target: TClass<unknown>;
  factoryName: string;
  controllerName: string;
  repositoryName: string;
}): void => {
  const { target, factoryName, controllerName, repositoryName } = opts;

  if (!repositoryName) {
    throw getError({
      message: `[${factoryName}] Invalid repository name | controller: ${controllerName} | repository.name must name the repository binding`,
    });
  }

  MetadataRegistry.getInstance().setInjectMetadata({
    target,
    index: 0,
    metadata: {
      key: BindingKeys.build({ namespace: BindingNamespaces.REPOSITORY, key: repositoryName }),
      index: 0,
      isOptional: false,
    },
  });
};
