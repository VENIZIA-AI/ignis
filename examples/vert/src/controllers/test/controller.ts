import {
  BaseController,
  controller,
  get,
  HTTP,
  IControllerOptions,
  post,
  TRouteContext,
  ValueOrPromise,
} from '@venizia/ignis';
import { RouteConfigs, TRoute5Body } from './definitions';

@controller({ path: '/test' })
export class TestController extends BaseController {
  constructor(opts: IControllerOptions) {
    super({
      ...opts,
      scope: TestController.name,
    });
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
        return context.json({ message: 'Hello 3' }, HTTP.ResultCodes.RS_2.Ok);
      },
    });
  }

  // Example 4: Using '@get' decorator with automatic type inference
  // No need to manually type context - it's automatically inferred from ROUTE_CONFIGS.decoratorGet
  @get({ configs: RouteConfigs['/4'] })
  getWithDecorator(context: TRouteContext) {
    // context is fully typed - try hovering over it in your IDE!
    // Return type is also validated against the response schema
    return context.json(
      { message: 'Hello from decorator', method: 'GET' },
      HTTP.ResultCodes.RS_2.Ok,
    );
  }

  // Example 5: Using '@post' decorator with request body validation
  // Both request and response are fully type-safe!
  @post({ configs: RouteConfigs['/5'] })
  createWithDecorator(context: TRouteContext) {
    // context.req.valid('json') is automatically typed as { name: string, age: number }
    const body = context.req.valid<TRoute5Body>('json');

    // TypeScript will validate that the response matches the schema:
    // { id: string, name: string, age: number }
    return context.json(
      {
        id: crypto.randomUUID(),
        name: body.name,
        age: body.age,
      },
      HTTP.ResultCodes.RS_2.Ok,
    );
  }
}
