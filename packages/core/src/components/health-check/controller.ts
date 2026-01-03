import { BaseController, IControllerOptions, TRouteContext } from '@/base/controllers';
import { api } from '@/base/metadata';
import { jsonContent, jsonResponse } from '@/base/models';
import { z } from '@hono/zod-openapi';
import { HTTP, ValueOrPromise } from '@venizia/ignis-helpers';
import { HealthCheckRestPaths } from './common';

const RouteConfigs = {
  ROOT: {
    method: HTTP.Methods.GET,
    path: HealthCheckRestPaths.ROOT,
    responses: jsonResponse({
      schema: z.object({ status: z.string() }).openapi({
        description: 'HealthCheck Schema',
        examples: [{ status: 'ok' }],
      }),
      description: 'Health check status',
    }),
  },
  PING: {
    method: HTTP.Methods.POST,
    path: HealthCheckRestPaths.PING,
    request: {
      body: jsonContent({
        description: 'PING | Request body',
        schema: z.object({
          type: z.string().optional().default('PING'),
          message: z.string().min(1).max(255),
        }),
      }),
    },
    responses: jsonResponse({
      schema: z
        .object({
          type: z.string().optional().default('PONG'),
          date: z.iso.datetime(),
          message: z.string(),
        })
        .openapi({
          description: 'HealthCheck PingPong Schema',
          examples: [{ date: new Date().toISOString(), message: 'ok' }],
        }),
      description: 'HealthCheck PingPong Message',
    }),
  },
} as const;

// -----------------------------------------------------------------------------
export class HealthCheckController extends BaseController {
  constructor(opts: IControllerOptions) {
    super({
      ...opts,
      scope: HealthCheckController.name,
    });

    // Note: This is optional declare internal controller route definitions
    this.definitions = RouteConfigs;
  }

  override binding(): ValueOrPromise<void> {
    // Method 1: Using 'bindRoute' to create a controller route
    this.bindRoute({ configs: RouteConfigs.ROOT }).to({
      handler: context => {
        return context.json({ status: 'ok' }, HTTP.ResultCodes.RS_2.Ok);
      },
    });

    // Method 2: Using 'defineRoute' to create a controller route
    /* this.defineRoute({
      configs: RouteConfigs.ROOT,
      handler: context => {
        return context.json({ status: 'ok' }, HTTP.ResultCodes.RS_2.Ok);
      },
    }); */
  }

  // Method 3: Using 'decorators' to create a controller route
  // Note: No need to manually type the context and return type!
  // The @api decorator automatically infers them from the route config
  @api({ configs: RouteConfigs.PING })
  pingPong(context: TRouteContext<typeof RouteConfigs.PING>) {
    // context.req.valid('json') is automatically typed as { type?: string, message: string }
    const { message } = context.req.valid('json');

    // Return type is automatically validated against the response schema
    return context.json(
      { type: 'PONG', date: new Date().toISOString(), message },
      HTTP.ResultCodes.RS_2.Ok,
    );
  }
}
