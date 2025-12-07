import { BaseController, IControllerOptions } from '@/base/controllers';
import { jsonContent } from '@/base/models';
import { z } from '@hono/zod-openapi';
import { HTTP, ValueOrPromise } from '@vez/ignis-helpers';

export class HealthCheckController extends BaseController {
  constructor(opts: IControllerOptions) {
    super({
      ...opts,
      scope: HealthCheckController.name,
    });
  }

  override binding(): ValueOrPromise<void> {
    // Method 1: Using 'bindRoute' to create a controller route
    this.bindRoute({
      configs: {
        method: 'get',
        path: '/',
        responses: {
          [HTTP.ResultCodes.RS_2.Ok]: jsonContent({
            schema: z.object({ status: z.string() }).openapi({
              description: 'HealthCheck Schema',
              examples: [{ status: 'ok' }],
            }),
            description: 'Health check status',
          }),
        },
      },
    }).to({
      handler: context => {
        return context.json({ status: 'ok' }, HTTP.ResultCodes.RS_2.Ok);
      },
    });

    // Method 2: Using 'defineRoute' to create a controller route
    /* this.defineRoute({
      configs: {
        method: 'get',
        path: '/',
        responses: {
          [HTTP.ResultCodes.RS_2.Ok]: jsonContent({
            schema: z.object({ status: z.string() }).openapi({
              description: 'HealthCheck Schema',
              examples: [{ status: 'ok' }],
            }),
            description: 'Health check status',
          }),
        },
      },
      handler: context => {
        return context.json({ status: 'ok' }, HTTP.ResultCodes.RS_2.Ok);
      },
    }); */
  }

  // Method 3: Using 'decorators' to create a controller route
  // @api({
  //   configs: {
  //     method: 'get',
  //     path: '/abc/:id',
  //     request: {
  //       params: idParamsSchema({ idType: 'string' }),
  //     },
  //     responses: {
  //       [HTTP.ResultCodes.RS_2.Ok]: jsonContent({
  //         schema: z.object({ status: z.string() }).openapi({
  //           description: 'HealthCheck Schema',
  //           examples: [{ status: 'ok' }],
  //         }),
  //         description: 'Health check status',
  //       }),
  //     },
  //   },
  // })
  // getServerStatus(c: Context) {
  //   console.log(c, (c.req as any).valid('params'), c.req.param);
  //   return c.json({ status: 'ok' }, HTTP.ResultCodes.RS_2.Ok);
  // }
}
