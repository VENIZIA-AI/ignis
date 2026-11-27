import { Authentication, BaseRestController, controller, get, post } from '@venizia/ignis';
import type { ValueOrPromise, TContextOf } from '@venizia/ignis';
import { Environment, HTTP } from '@venizia/ignis-helpers';
import { UuidV7Generator } from '@venizia/ignis-helpers/uuid';
import { RouteConfigs } from './definitions';

@controller({ path: '/test', when: () => !Environment.is({ name: Environment.PRODUCTION }) })
export class TestController extends BaseRestController {
  constructor() {
    super({ scope: TestController.name });
  }

  override binding(): ValueOrPromise<void> {
    // Example 1: Using 'defineRoute' to define a controller endpoint
    this.defineRoute({
      configs: RouteConfigs['/1'],
      handler: (context) => {
        return context.json({ message: 'Hello' }, HTTP.ResultCodes.RS_2.Ok);
      },
    });

    // Example 2: Using 'defineRoute' to define a authenticated controller endpoint
    this.defineRoute({
      configs: RouteConfigs['/2'],
      handler: (context) => {
        return context.json({ message: 'Hello 2' }, HTTP.ResultCodes.RS_2.Ok);
      },
    });

    // Example 3: Using 'bindRoute' to define a controller endpoint
    this.bindRoute({
      configs: RouteConfigs['/3'],
    }).to({
      handler: (context) => {
        this.logger.for('/3').info('Current user | %j', context.get(Authentication.CURRENT_USER));

        return context.json({ message: 'Hello 3' }, HTTP.ResultCodes.RS_2.Ok);
      },
    });
  }

  // Example 4: Using '@get' decorator to register a route from RouteConfigs
  @get({ configs: RouteConfigs['/4'] })
  getWithDecorator(context: TContextOf<(typeof RouteConfigs)['/4']>) {
    return context.json(
      { message: 'Hello from decorator', method: 'GET' },
      HTTP.ResultCodes.RS_2.Ok,
    );
  }

  // Example 5: Using '@post' decorator with a validated request body
  @post({ configs: RouteConfigs['/5'] })
  createWithDecorator(context: TContextOf<(typeof RouteConfigs)['/5']>) {
    // `body` is typed from the route's body schema, through `TContextOf`.
    const body = context.req.valid('json');

    return context.json(
      {
        id: UuidV7Generator.generate(),
        name: body.name,
        age: body.age,
      },
      HTTP.ResultCodes.RS_2.Ok,
    );
  }
}
