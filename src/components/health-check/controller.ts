import { BaseController, IControllerOptions } from '@/base/controllers';
import { HTTP, ValueOrPromise } from '@/common';
import { jsonContent } from '@/utilities/schema.utility';
import { z } from '@hono/zod-openapi';

export class HealthCheckController extends BaseController {
  constructor(opts: IControllerOptions) {
    super({
      ...opts,
      scope: HealthCheckController.name,
    });
  }

  override binding(): ValueOrPromise<void> {
    const HealthCheckOkSchema = z.object({ status: z.string() }).openapi({
      description: 'HealthCheck Schema',
      examples: [{ status: 'ok' }],
    });

    this.defineRoute({
      configs: {
        method: 'get',
        path: '/',
        responses: {
          [HTTP.ResultCodes.RS_2.Ok]: jsonContent({
            schema: HealthCheckOkSchema,
            description: 'Health check status',
          }),
        },
      },
      handler: context => {
        return context.json<z.infer<typeof HealthCheckOkSchema>>(
          { status: 'ok' },
          HTTP.ResultCodes.RS_2.Ok,
        );
      },
    });
  }
}
