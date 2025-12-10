import { BaseApplication, IApplicationInfo, controller, get, HTTP, jsonContent } from '@vez/ignis';
import { BaseController } from '@vez/ignis';
import { Context } from 'hono';
import { z } from '@hono/zod-openapi';

// 1. Define a controller
@controller({ path: '/hello' })
class HelloController extends BaseController {
  constructor() {
    super({ scope: 'HelloController', path: '/hello' });
  }

  binding() {
    // Bind dependencies here (if needed)
  }

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
    return c.json({ message: 'Hello from Ignis!' });
  }
}

// 2. Create the application
class App extends BaseApplication {
  getAppInfo(): IApplicationInfo {
    return { name: 'my-app', version: '1.0.0' };
  }

  staticConfigure() {
    // Static configuration before dependency injection
  }

  preConfigure() {
    this.controller(HelloController);
  }

  postConfigure() {
    // Configuration after all bindings are complete
  }

  setupMiddlewares() {
    // Custom middleware setup (optional)
  }
}

// 3. Start the server
const app = new App({
  scope: 'App',
  config: {
    host: '0.0.0.0',
    port: 3000,
    path: { base: '/api' }
  }
});

app.start();
