import {
  BaseController,
  controller,
  htmlContent,
  HTTP,
  type IControllerOptions,
  type ValueOrPromise,
} from '@venizia/ignis';
import { AboutPage } from '@/views/pages/about.page';
import { HomePage } from '@/views/pages/home.page';

@controller({ path: '/' })
export class ViewController extends BaseController {
  constructor(opts: IControllerOptions) {
    super({
      ...opts,
      scope: ViewController.name,
      path: '/',
    });
  }

  override binding(): ValueOrPromise<void> {
    // Home page with JSX
    this.defineJSXRoute({
      configs: {
        path: '/',
        method: 'get',
        description: 'Home page rendered with JSX',
        tags: ['Views'],
        responses: {
          [HTTP.ResultCodes.RS_2.Ok]: htmlContent({
            description: 'Home page HTML',
          }),
        },
      },
      handler: c => {
        const timestamp = new Date().toISOString();
        return c.html(<HomePage timestamp={timestamp} />);
      },
    });

    // About page with JSX
    this.defineJSXRoute({
      configs: {
        path: '/about',
        method: 'get',
        description: 'About page rendered with JSX',
        tags: ['Views'],
        responses: {
          [HTTP.ResultCodes.RS_2.Ok]: htmlContent({
            description: 'About page HTML',
          }),
        },
      },
      handler: c => {
        return c.html(<AboutPage />);
      },
    });
  }
}