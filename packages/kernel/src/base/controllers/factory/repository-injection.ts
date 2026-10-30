import type { TClass } from '@venizia/ignis-helpers/common';
import { ControllerFactory } from './controller';

/** @deprecated Use ControllerFactory.registerRepositoryInjection({ target, factoryName, controllerName, repositoryName }). Removed in 0.5. */
export const registerFactoryRepositoryInjection = (opts: {
  target: TClass<unknown>;
  factoryName: string;
  controllerName: string;
  repositoryName: string;
}): void => {
  ControllerFactory.registerRepositoryInjection(opts);
};
