import { ConfigurationRepository } from '@/repositories/configuration.repository';
import { Authentication, controller, CrudControllerFactory, CrudRoutes } from '@venizia/ignis';

const BASE_PATH = '/configurations';

/** Generates the CRUD routes; every one of them demands a valid JWT. */
const BaseCrudController = CrudControllerFactory.build({
  repository: ConfigurationRepository,
  authenticate: { strategies: [Authentication.STRATEGY_JWT] },
  routes: {
    ...CrudRoutes.READ,
    create: true,
    updateById: true,
    updateBy: true,
    deleteById: true,
    deleteBy: true,
  },
});

@controller({ path: BASE_PATH })
export class ConfigurationController extends BaseCrudController {}
