import { Configuration } from '@/models';
import { ConfigurationRepository } from '@/repositories';
import {
  Authentication,
  BindingKeys,
  BindingNamespaces,
  controller,
  ControllerFactory,
  inject,
  TInferSchema,
  TRouteContext,
} from '@venizia/ignis';
import { z } from '@hono/zod-openapi';

const BASE_PATH = '/configurations';

// -----------------------------------------------------------------------------
// Custom Schemas for Request/Response Customization
// -----------------------------------------------------------------------------

/**
 * Custom create request body schema.
 * - Omits auto-generated fields (id, createdAt, updatedAt, createdBy, modifiedBy, dataType)
 * - Adds validation rules
 */
const CreateConfigurationSchema = z
  .object({
    code: z
      .string()
      .min(1)
      .max(100)
      .openapi({ description: 'Unique configuration code', example: 'APP_THEME' }),
    description: z
      .string()
      .max(500)
      .optional()
      .openapi({ description: 'Configuration description', example: 'Application theme setting' }),
    group: z
      .string()
      .min(1)
      .max(50)
      .openapi({ description: 'Configuration group', example: 'appearance' }),
  })
  .strict()
  .openapi({ description: 'Request body for creating a new configuration' });

// -----------------------------------------------------------------------------
// Controller Factory Definition
// -----------------------------------------------------------------------------

const _Controller = ControllerFactory.defineCrudController({
  repository: { name: ConfigurationRepository.name },
  controller: {
    name: 'ConfigurationController',
    basePath: BASE_PATH,
  },
  authenticate: { strategies: [Authentication.STRATEGY_JWT, Authentication.STRATEGY_BASIC] },
  entity: () => Configuration,

  // ---------------------------------------------------------------------------
  // Custom Routes Configuration
  // ---------------------------------------------------------------------------
  routes: {
    // -------------------------------------------------------------------------
    // COUNT - Public endpoint, no auth required
    // -------------------------------------------------------------------------
    count: {
      skipAuth: true,
    },

    // -------------------------------------------------------------------------
    // CREATE - custom request body
    // -------------------------------------------------------------------------
    create: {
      authenticate: { strategies: [Authentication.STRATEGY_BASIC] },
      request: {
        body: CreateConfigurationSchema,
      },
      response: {
        schema: z.object({ message: z.string() }),
      },
    },

    // -------------------------------------------------------------------------
    // DELETE_BY_ID - Requires JWT auth
    // -------------------------------------------------------------------------
    deleteById: {
      authenticate: { strategies: [Authentication.STRATEGY_JWT] },
    },
  },
});

// Infered route definition type
// type TRouteDefinitions = InstanceType<typeof _Controller>['definitions'];

// -----------------------------------------------------------------------------
// Controller Implementation
// -----------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Override CREATE - Add custom business logic
  // ---------------------------------------------------------------------------
  /**
   * Override the create method to add custom business logic.
   *
   * Example customizations:
   * - Auto-set audit fields (createdBy, modifiedBy)
   * - Validate business rules
   * - Transform data before saving
   */
  override async create(opts: { context: TRouteContext }) {
    const { context } = opts;
    const data = context.req.valid<TInferSchema<typeof CreateConfigurationSchema>>('json');

    this.logger.info(
      '[create] Creating configuration | code: %s | group: %s | desc: %s',
      data.code,
      data.group,
      data.description,
    );

    // You can add custom logic here:
    // - Validate business rules
    // - Transform data
    // - Set audit fields from context (e.g., context.get('currentUser'))

    // Call parent implementation
    return super.create(opts);
  }

  // ---------------------------------------------------------------------------
  // Override UPDATE_BY_ID - Add custom business logic
  // ---------------------------------------------------------------------------
  /**
   * Override updateById to add custom business logic.
   */
  override async updateById(opts: { context: TRouteContext }) {
    const { context } = opts;
    const { id } = context.req.valid<{ id: string }>('param');
    const data = context.req.valid<// specify JSON Type here
    any>('json');

    this.logger.info('[updateById] Updating configuration | id: %s | data: %j', id, data);

    // Add custom logic here if needed

    return super.updateById(opts);
  }

  // ---------------------------------------------------------------------------
  // Override DELETE_BY_ID - Add soft delete or audit logging
  // ---------------------------------------------------------------------------
  /**
   * Override deleteById to add audit logging or implement soft delete.
   */
  override async deleteById(opts: { context: TRouteContext }) {
    const { context } = opts;
    const { id } = context.req.valid<{ id: string }>('param');

    this.logger.warn('[deleteById] Deleting configuration | id: %s', id);

    // Example: Implement soft delete instead of hard delete
    // const result = await this.repository.updateById({
    //   id,
    //   data: { deletedAt: new Date().toISOString() },
    // });
    // return context.json(result, 200);

    // Or call parent for hard delete
    return super.deleteById(opts);
  }
}
