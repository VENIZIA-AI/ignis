import { z } from '@hono/zod-openapi';
import {
  BaseRestController,
  controller,
  get,
  jsonContent,
  type TRouteContext,
} from '@venizia/ignis';
import { HTTP } from '@venizia/ignis-helpers';

@controller({ path: '/hello' })
export class HelloController extends BaseRestController {
  constructor() {
    super({ scope: HelloController.name });
  }

  // binding() is abstract - leave it empty when every route uses @get/@post decorators.
  override binding() {}

  @get({
    configs: {
      path: '/',
      responses: {
        [HTTP.ResultCodes.RS_2.Ok]: jsonContent({
          description: 'Says hello',
          schema: z.object({ message: z.string() }),
        }),
      },
    },
  })
  sayHello(context: TRouteContext) {
    return context.json({ message: 'Hello from IGNIS!' }, HTTP.ResultCodes.RS_2.Ok);
  }
}
