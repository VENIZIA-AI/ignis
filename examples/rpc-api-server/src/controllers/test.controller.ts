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
        path: '/:id',
        method: 'get',
        request: {
          params: z.object({
            id: z.string().openapi({
              param: {
                name: 'id',
                in: 'path',
              },
              example: '123',
            }),
          }),
        },
        responses: {
          [HTTP.ResultCodes.RS_2.Ok]: jsonContent({
            description: 'test dynamic message content',
            schema: z.object({ message: z.string() }),
          }),
        },
      },
      handler: context => {
        const { id } = context.req.valid('param');
        return context.json(
          { message: `Hello there!`, id: id },
          HTTP.ResultCodes.RS_2.Ok,
        );
      },
    });

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
  }
}
