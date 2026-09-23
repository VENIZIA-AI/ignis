import { Authentication, BaseRestController, controller, get, post } from '@venizia/ignis';
import type { TRouteContext, ValueOrPromise } from '@venizia/ignis';
import { Environment, HTTP } from '@venizia/ignis-helpers';
import { uuidV7 } from '@venizia/ignis-helpers/uuid';
import { RouteConfigs, TRoute5Body } from './definitions';

@controller({ path: '/test', when: () => !Environment.is({ name: Environment.PRODUCTION }) })
export class TestController extends BaseRestController {
  constructor() {
    super({ scope: TestController.name });
  }

  override binding(): ValueOrPromise<void> {
    // Example 1: Using 'defineRoute' to define a controller endpoint
    this.defineRoute({
      configs: RouteConfigs['/1'],
      handler: context => {
        return context.json({ message: 'Hello' }, HTTP.ResultCodes.RS_2.Ok);
      },
    });

    // Example 2: Using 'defineRoute' to define a authenticated controller endpoint
    this.defineRoute({
      configs: RouteConfigs['/2'],
      handler: context => {
        return context.json({ message: 'Hello 2' }, HTTP.ResultCodes.RS_2.Ok);
      },
    });

    // Example 3: Using 'bindRoute' to define a controller endpoint
    this.bindRoute({
      configs: RouteConfigs['/3'],
    }).to({
      handler: context => {
        this.logger.for('/3').info('Current user | %j', context.get(Authentication.CURRENT_USER));
        return context.json({ message: 'Hello 3' }, HTTP.ResultCodes.RS_2.Ok);
      },
    });
  }

  // Example 4: Using '@get' decorator to register a route from RouteConfigs
  @get({ configs: RouteConfigs['/4'] })
  getWithDecorator(context: TRouteContext) {
    // `RouteConfigs` is typed `Record<string, IAuthRouteConfig>`, so the decorator cannot narrow
    // to this one route's literal shape: `context` is the hand-written `TRouteContext`, not inferred.
    return context.json(
      { message: 'Hello from decorator', method: 'GET' },
      HTTP.ResultCodes.RS_2.Ok,
    );
  }

  // Example 5: Using '@post' decorator with a validated request body
  @post({ configs: RouteConfigs['/5'] })
  createWithDecorator(context: TRouteContext) {
    // The body's compile-time type comes from this explicit generic, not inference - the request
    // is still validated against `route5BodySchema` at runtime regardless.
    const body = context.req.valid<TRoute5Body>('json');

    return context.json(
      {
        id: uuidV7(),
        name: body.name,
        age: body.age,
      },
      HTTP.ResultCodes.RS_2.Ok,
    );
  }
}
