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

    this.defineAuthRoute({
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
        return context.json({ status: 'Hello 2' }, HTTP.ResultCodes.RS_2.Ok);
      },
    });
  }
}
