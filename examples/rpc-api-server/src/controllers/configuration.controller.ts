import { Configuration } from '@/models/configuration.model';
import { ConfigurationRepository } from '@/repositories/configuration.repository';
import { Authentication, controller, ControllerFactory } from '@venizia/ignis';

const BASE_PATH = '/configurations';

/** Generates the CRUD routes; every one of them demands a valid JWT. */
const BaseCrudController = ControllerFactory.defineCrudController({
  entity: Configuration,
  repository: { name: ConfigurationRepository.name },
  controller: { name: 'ConfigurationController', basePath: BASE_PATH },
  authenticate: { strategies: [Authentication.STRATEGY_JWT] },
});

@controller({ path: BASE_PATH })
export class ConfigurationController extends BaseCrudController {}
