import { z } from '@hono/zod-openapi';
import {
  Authentication,
  BaseController,
  controller,
  HTTP,
  IControllerOptions,
  jsonContent,
  ValueOrPromise,
} from '@vez/ignis';

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

    /* this.defineRoute({
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
      handler: context => {
        return context.json({ message: 'Hello 3' }, HTTP.ResultCodes.RS_2.Ok);
      },
    }); */
  }
}
