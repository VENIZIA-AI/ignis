import { BindingNamespaces } from '@/common/bindings';
import { BindingKeys, MetadataRegistry } from '@/helpers/inversion';
import { getError } from '@venizia/ignis-helpers/core';

/**
 * Injects the named repository into constructor parameter 0 of a generated CRUD controller, so a
 * subclass needs no constructor. Recorded as metadata rather than a parameter decorator, which Bun
 * drops in some configurations. A subclass that declares its own `@inject` at index 0 wins.
 */
export const registerCrudRepositoryInjection = (opts: {
  target: Function;
  controllerName: string;
  repositoryName: string;
}): void => {
  const { target, controllerName, repositoryName } = opts;

  if (!repositoryName) {
    throw getError({
      message: `[defineCrudController] Invalid repository name | controller: ${controllerName} | repository.name must name the repository binding`,
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
