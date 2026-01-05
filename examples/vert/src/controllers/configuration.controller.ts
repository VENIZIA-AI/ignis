import { Configuration } from '@/models';
import { ConfigurationRepository } from '@/repositories';
import {
  Authentication,
  BindingKeys,
  BindingNamespaces,
  controller,
  ControllerFactory,
  inject,
} from '@venizia/ignis';

const BASE_PATH = '/configurations';

const _Controller = ControllerFactory.defineCrudController({
  repository: { name: ConfigurationRepository.name },
  controller: {
    name: 'ConfigurationController',
    basePath: BASE_PATH,
  },
  authStrategies: [Authentication.STRATEGY_JWT],

  // Define entity by direct declare entity class
  // entity: Configuration,

  // Define entity by entity class resolver
  entity: () => Configuration,
});

@controller({ path: BASE_PATH })
export class ConfigurationController extends _Controller {
  constructor(
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: ConfigurationRepository.name,
      }),
    })
    repository: ConfigurationRepository,
  ) {
    super(repository);
  }
}
