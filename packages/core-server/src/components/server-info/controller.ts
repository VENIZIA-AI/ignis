import { BaseRestController } from '@/base/controllers';
import { OpenApiResponses } from '@venizia/ignis-kernel';
import { z } from '@hono/zod-openapi';
import { HTTP, type ValueOrPromise } from '@venizia/ignis-helpers/common';
import { ServerInfoCacheControls, ServerInfoRestPaths } from './common';
import { ServerInfoReporter } from './reporter';

const RouteConfigs = {
  TIME: {
    method: HTTP.Methods.GET,
    path: ServerInfoRestPaths.TIME,
    responses: OpenApiResponses.jsonResponse({
      schema: z
        .object({
          server: z.object({
            date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            time: z.string().regex(/^\d{2}:\d{2}:\d{2}\.\d{3}$/),
            epoch: z.number().int(),
            iso: z.iso.datetime({ offset: true }),
          }),
          tz: z.string(),
          utc: z.object({
            offset: z.string().regex(/^[+-]\d{2}:\d{2}$/),
            minutes: z.number().int(),
            iso: z.iso.datetime(),
          }),
        })
        .openapi({
          description: 'Server time',
          examples: [
            {
              server: {
                date: '2026-11-10',
                time: '15:00:00.123',
                epoch: 1794297600123,
                iso: '2026-11-10T15:00:00.123+07:00',
              },
              tz: 'Asia/Ho_Chi_Minh',
              utc: { offset: '+07:00', minutes: 420, iso: '2026-11-10T08:00:00.123Z' },
            },
          ],
        }),
      description:
        'The server clock: local date and time, epoch milliseconds, time zone, UTC offset and the UTC instant',
    }),
  },
} as const;

/**
 * Serves `GET <path>/time`, a PUBLIC route with no authentication.
 *
 * Everything this controller answers must be safe to publish and must not help an attacker: a
 * clock and a time zone, nothing else. No version, runtime, pid, memory or environment - those
 * belong to the gated `/health/stats`. A new route here needs that same test.
 */
export class ServerInfoController extends BaseRestController {
  constructor() {
    super({ scope: ServerInfoController.name });

    this.definitions = RouteConfigs;
  }

  override binding(): ValueOrPromise<void> {
    this.bindRoute({ configs: RouteConfigs.TIME }).to({
      handler: (context) => {
        // A cached time is a wrong time; without this a cache or a service worker may serve it stale.
        context.header(HTTP.Headers.CACHE_CONTROL, ServerInfoCacheControls.NO_STORE);

        return context.json(ServerInfoReporter.buildTime(), HTTP.ResultCodes.RS_2.Ok);
      },
    });
  }
}
