import { AboutPage } from '@/views/pages/about.page';
import { HomePage } from '@/views/pages/home.page';
import { BaseRestController, controller, htmlResponse } from '@venizia/ignis';
import { HTTP, ValueOrPromise } from '@venizia/ignis-helpers';

/** Server-rendered pages: each handler returns `context.html(<Page />)`. */
@controller({ path: '/' })
export class ViewController extends BaseRestController {
  constructor() {
    super({ scope: ViewController.name });
  }

  override binding(): ValueOrPromise<void> {
    this.defineJSXRoute({
      configs: {
        path: '/',
        method: HTTP.Methods.GET,
        responses: htmlResponse({ description: 'Home page' }),
      },
      handler: context => context.html(<HomePage />),
    });

    this.defineJSXRoute({
      configs: {
        path: '/about',
        method: HTTP.Methods.GET,
        responses: htmlResponse({ description: 'About page' }),
      },
      handler: context => context.html(<AboutPage />),
    });
  }
}
