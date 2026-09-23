import { z } from '@hono/zod-openapi';
import { Configuration } from '@/models';
import { ConfigurationRepository } from '@/repositories';
import {
  Authentication,
  controller,
  ControllerFactory,
  TInferSchema,
  TRouteContext,
} from '@venizia/ignis';

const BASE_PATH = '/configurations';

/** The create body names the fields a client may set; `.strict()` rejects any other. */
const CreateConfigurationSchema = z
  .object({
    code: z.string().min(1).max(100).openapi({ example: 'APP_THEME' }),
    description: z.string().max(500).optional().openapi({ example: 'Application theme setting' }),
    group: z.string().min(1).max(50).openapi({ example: 'appearance' }),
  })
  .strict()
  .openapi({ description: 'Request body for creating a configuration' });

/**
 * The CRUD routes from the factory, with per-route authentication: every route takes a JWT or
 * Basic credentials, `count` is public, `create` takes Basic only, and both deletes take a JWT only.
 */
const BaseCrudController = ControllerFactory.defineCrudController({
  entity: Configuration,
  repository: { name: ConfigurationRepository.name },
  controller: { name: 'ConfigurationController', basePath: BASE_PATH },
  authenticate: { strategies: [Authentication.STRATEGY_JWT, Authentication.STRATEGY_BASIC] },
  routes: {
    count: { authenticate: { skip: true } },
    create: {
      authenticate: { strategies: [Authentication.STRATEGY_BASIC] },
      request: { body: CreateConfigurationSchema },
    },
    deleteById: { authenticate: { strategies: [Authentication.STRATEGY_JWT] } },
    deleteBy: { authenticate: { strategies: [Authentication.STRATEGY_JWT] } },
  },
});

/** Overrides a generated handler to add behaviour around it, then calls the generated one. */
@controller({ path: BASE_PATH })
export class ConfigurationController extends BaseCrudController {
  override async create(opts: { context: TRouteContext }) {
    const { context } = opts;
    const user = context.get(Authentication.CURRENT_USER);
    const data = context.req.valid<TInferSchema<typeof CreateConfigurationSchema>>('json');

    this.logger
      .for('create')
      .info('Creating configuration | code: %s | by: %s', data.code, user?.userId);

    return super.create(opts);
  }

  override async deleteById(opts: { context: TRouteContext }) {
    const { id } = opts.context.req.valid<{ id: string }>('param');
    this.logger.for('deleteById').warn('Deleting configuration | id: %s', id);

    return super.deleteById(opts);
  }
}
