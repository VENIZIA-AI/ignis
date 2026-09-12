import { BaseRestController, TRouteContext } from '@/base/controllers';
import { api, inject } from '@/base/metadata';
import { jsonContent, jsonResponse } from '@venizia/ignis-kernel';
import type { IApplicationInfo } from '@venizia/ignis-kernel';
import { z } from '@hono/zod-openapi';
import { HTTP, ValueOrPromise } from '@venizia/ignis-helpers/common';
import {
  HealthCheckBindingKeys,
  HealthCheckHeaders,
  HealthCheckRestPaths,
  type IHealthCheckOptions,
} from './common';
import { HealthCheckReporter } from './reporter';

const RouteConfigs = {
  ROOT: {
    method: HTTP.Methods.GET,
    path: HealthCheckRestPaths.ROOT,
    responses: jsonResponse({
      schema: z.object({ status: z.string(), timestamp: z.iso.datetime() }).openapi({
        description: 'HealthCheck Schema',
        examples: [{ status: 'ok', timestamp: new Date().toISOString() }],
      }),
      description: 'Health check status',
    }),
  },
  STATS: {
    method: HTTP.Methods.GET,
    path: HealthCheckRestPaths.STATS,
    responses: jsonResponse({
      schema: z
        .object({
          status: z.string(),
          timestamp: z.iso.datetime(),
          build: z.object({
            service: z.string(),
            version: z.string(),
            commit: z.string(),
            branch: z.string(),
            builtAt: z.string(),
          }),
          process: z.object({
            pid: z.number(),
            uptime: z.number(),
            uptimeHuman: z.string(),
            runtime: z.string(),
            environment: z.string(),
          }),
          memory: z.object({ rss: z.string(), heapUsed: z.string(), heapTotal: z.string() }),
        })
        .openapi({ description: 'HealthCheck Stats Schema' }),
      description:
        'Build stamp, process and memory - closed outside the development environments unless enabled',
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

export class HealthCheckController extends BaseRestController {
  /**
   * Both dependencies arrive through the container, so two applications in one process each get
   * their own gate - a static field would let the last one to boot decide for every other.
   */
  constructor(
    @inject({ key: HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS, isOptional: true })
    private readonly healthOptions: IHealthCheckOptions = {},
    @inject({ key: HealthCheckBindingKeys.APPLICATION_INFO, isOptional: true })
    private readonly appInfo?: IApplicationInfo,
  ) {
    super({ scope: HealthCheckController.name });

    // Note: This is optional declare internal controller route definitions
    this.definitions = RouteConfigs;
  }

  override binding(): ValueOrPromise<void> {
    // Public liveness probe: status and clock only. Nothing here names a runtime or a version.
    this.bindRoute({ configs: RouteConfigs.ROOT }).to({
      handler: context => {
        return context.json(HealthCheckReporter.buildSummary(), HTTP.ResultCodes.RS_2.Ok);
      },
    });

    if (!HealthCheckReporter.isStatsEnabled({ options: this.healthOptions })) {
      this.logger
        .for(this.binding.name)
        .debug('Stats route disabled | path: %s', HealthCheckRestPaths.STATS);
      return;
    }

    this.bindRoute({ configs: RouteConfigs.STATS }).to({
      handler: context => {
        // `context.notFound()`, not a thrown 404: it runs the application's own notFound handler,
        // so the refusal is byte-identical to the answer for a route that was never mounted. A
        // thrown `ApplicationError` serializes a different body and would confirm the route exists.
        if (
          !HealthCheckReporter.isStatsAuthorized({
            options: this.healthOptions,
            header: context.req.header(HealthCheckHeaders.SECRET_KEY),
          })
        ) {
          return context.notFound();
        }

        return context.json(
          HealthCheckReporter.buildStats({ options: this.healthOptions, appInfo: this.appInfo }),
          HTTP.ResultCodes.RS_2.Ok,
        );
      },
    });
  }

  // Method 3: Using 'decorators' to create a controller route, with an explicit type assertion for the validated request data
  @api({ configs: RouteConfigs.PING })
  pingPong(context: TRouteContext) {
    const { message } = context.req.valid<{ type?: string; message: string }>('json');

    // Return type is automatically validated against the response schema
    return context.json(
      { type: 'PONG', date: new Date().toISOString(), message },
      HTTP.ResultCodes.RS_2.Ok,
    );
  }
}
