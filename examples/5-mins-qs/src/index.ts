import { z } from '@hono/zod-openapi';
import {
  BaseApplication,
  BaseRestController,
  controller,
  get,
  IApplicationInfo,
  jsonContent,
  ApiReferenceComponent,
} from '@venizia/ignis';
import { HTTP } from '@venizia/ignis-helpers';
import { Context } from 'hono';

@controller({ path: '/hello' })
class HelloController extends BaseRestController {
  constructor() {
    super({ scope: 'HelloController', path: '/hello' });
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
  sayHello(c: Context) {
    return c.json({ message: 'Hello from IGNIS!' }, HTTP.ResultCodes.RS_2.Ok);
  }
}

class App extends BaseApplication {
  getAppInfo(): IApplicationInfo {
    return { name: 'my-app', version: '1.0.0', description: 'My first IGNIS app' };
  }

  staticConfigure() {}

  preConfigure() {
    this.component(ApiReferenceComponent);
    this.controller(HelloController);
  }

  postConfigure() {}

  setupMiddlewares() {}
}

const app = new App({
  scope: 'App',
  config: {
    host: '0.0.0.0',
    port: Number(process.env.PORT ?? 3000),
    path: { base: '/api', isStrict: false },
  },
});

app.init();
await app.start();
