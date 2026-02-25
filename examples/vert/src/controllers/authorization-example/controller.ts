import {
  Authentication,
  BaseController,
  controller,
  HTTP,
  IControllerOptions,
  ValueOrPromise,
} from '@venizia/ignis';
import { RouteConfigs } from './definitions';

@controller({ path: '/authz-example' })
export class AuthorizationExampleController extends BaseController {
  constructor(opts: IControllerOptions) {
    super({
      ...opts,
      scope: AuthorizationExampleController.name,
    });
  }

  override binding(): ValueOrPromise<void> {
    // Public — no auth, no authz
    this.defineRoute({
      configs: RouteConfigs['/public'],
      handler: context => {
        return context.json(
          { message: 'This is a public endpoint — no authentication required' },
          HTTP.ResultCodes.RS_2.Ok,
        );
      },
    });

    // JWT auth only — no authorization check
    this.defineRoute({
      configs: RouteConfigs['/profile'],
      handler: context => {
        const user = context.get(Authentication.CURRENT_USER);
        return context.json(
          { message: 'Authenticated user profile', userId: String(user?.userId ?? 'unknown') },
          HTTP.ResultCodes.RS_2.Ok,
        );
      },
    });

    // JWT auth + authorization: read:configuration
    this.defineRoute({
      configs: RouteConfigs['/configurations'],
      handler: context => {
        return context.json(
          {
            message: 'Authorized to read configurations',
            data: ['app.name=Vert', 'app.version=1.0.0'],
          },
          HTTP.ResultCodes.RS_2.Ok,
        );
      },
    });

    // JWT auth + authorization: create:user
    this.defineRoute({
      configs: RouteConfigs['/users'],
      handler: context => {
        return context.json({ message: 'Authorized to create users' }, HTTP.ResultCodes.RS_2.Ok);
      },
    });

    // JWT auth + authorization with allowedRoles
    this.defineRoute({
      configs: RouteConfigs['/admin/dashboard'],
      handler: context => {
        return context.json(
          { message: 'Admin dashboard access granted', stats: {} },
          HTTP.ResultCodes.RS_2.Ok,
        );
      },
    });
  }
}
