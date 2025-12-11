import { z } from '@hono/zod-openapi';
import {
  BaseApplication,
  BaseController,
  controller,
  get,
  HTTP,
  IApplicationInfo,
  jsonContent,
} from '@venizia/ignis';
import { Context } from 'hono';
import appInfo from './../package.json';

// 1. Define a controller
@controller({ path: '/hello' })
class HelloController extends BaseController {
  constructor() {
    super({ scope: 'HelloController', path: '/hello' });
  }

  // NOTE: This is a function that must be overridden.
  override binding() {
    // Bind dependencies here (if needed)
    // Extra binding routes with functional way, use `bindRoute` or `defineRoute`
  }

  @get({
    configs: {
      path: '/',
      method: HTTP.Methods.GET,
      responses: {
        [HTTP.ResultCodes.RS_2.Ok]: jsonContent({
          description: 'Says hello',
          schema: z.object({ message: z.string() }),
        }),
      },
    },
  })
  sayHello(c: Context) {
    return c.json({ message: 'Hello from Ignis!' }, HTTP.ResultCodes.RS_2.Ok);
  }
}

// 2. Create the application
class App extends BaseApplication {
  getAppInfo(): IApplicationInfo {
    return appInfo;
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
    path: { base: '/api', isStrict: false },
  },
});

app.start();
