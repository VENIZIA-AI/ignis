import { z } from '@hono/zod-openapi';
import {
  Authentication,
  BaseController,
  controller,
  get,
  HTTP,
  IControllerOptions,
  jsonContent,
  jsonResponse,
  post,
  TRouteContext,
  ValueOrPromise,
} from '@vez/ignis';

// Define route configs as const for type inference
const ROUTE_CONFIGS = {
  ['/4']: {
    method: HTTP.Methods.GET,
    path: '/4',
    responses: jsonResponse({
      description: 'Test decorator GET endpoint',
      schema: z.object({ message: z.string(), method: z.string() }),
    }),
  },
  ['/5']: {
    method: HTTP.Methods.POST,
    path: '/5',
    request: {
      body: jsonContent({
        description: 'Request body for POST',
        schema: z.object({ name: z.string(), age: z.number().int().positive() }),
      }),
    },
    responses: jsonResponse({
      description: 'Test decorator POST endpoint',
      schema: z.object({ id: z.string(), name: z.string(), age: z.number() }),
    }),
  },
} as const;

@controller({ path: '/test' })
export class TestController extends BaseController {
  constructor(opts: IControllerOptions) {
    super({
      ...opts,
      scope: TestController.name,
      path: '/test',
    });
  }

  override binding(): ValueOrPromise<void> {
    // Example 1: Using 'defineRoute' to define a controller endpoint
    this.defineRoute({
      configs: {
        path: '/1',
        method: 'get',
        responses: {
          [HTTP.ResultCodes.RS_2.Ok]: jsonContent({
            description: 'Test message content 1',
            schema: z.object({ message: z.string() }),
          }),
        },
      },
      handler: context => {
        return context.json({ message: 'Hello' }, HTTP.ResultCodes.RS_2.Ok);
      },
    });

    // Example 2: Using 'defineRoute' to define a authenticated controller endpoint
    this.defineRoute({
      configs: {
        path: '/2',
        method: 'get',
        authStrategies: [Authentication.STRATEGY_JWT],
        responses: {
          [HTTP.ResultCodes.RS_2.Ok]: jsonContent({
            description: 'Test message content 1',
            schema: z.object({ message: z.string() }),
          }),
        },
      },
      handler: context => {
        return context.json({ message: 'Hello 2' }, HTTP.ResultCodes.RS_2.Ok);
      },
    });

    // Example 3: Using 'bindRoute' to define a controller endpoint
    this.bindRoute({
      configs: {
        path: '/3',
        method: 'get',
        responses: {
          [HTTP.ResultCodes.RS_2.Ok]: jsonContent({
            description: 'Test message content 3',
            schema: z.object({ message: z.string() }),
          }),
        },
      },
    }).to({
      handler: context => {
        return context.json({ message: 'Hello 3' }, HTTP.ResultCodes.RS_2.Ok);
      },
    });
  }

  // Example 4: Using '@get' decorator with automatic type inference
  // No need to manually type context - it's automatically inferred from ROUTE_CONFIGS.decoratorGet
  @get({ configs: ROUTE_CONFIGS['/4'] })
  getWithDecorator(context: TRouteContext<(typeof ROUTE_CONFIGS)['/4']>) {
    // context is fully typed - try hovering over it in your IDE!
    // Return type is also validated against the response schema
    return context.json(
      { message: 'Hello from decorator', method: 'GET' },
      HTTP.ResultCodes.RS_2.Ok,
    );
  }

  // Example 5: Using '@post' decorator with request body validation
  // Both request and response are fully type-safe!
  @post({ configs: ROUTE_CONFIGS['/5'] })
  createWithDecorator(context: TRouteContext<(typeof ROUTE_CONFIGS)['/5']>) {
    // context.req.valid('json') is automatically typed as { name: string, age: number }
    const body = context.req.valid('json');

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
