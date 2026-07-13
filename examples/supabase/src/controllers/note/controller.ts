import { NoteService } from '@/services';
import {
  Authentication,
  BaseRestController,
  BindingNamespaces,
  controller,
  del,
  get,
  inject,
  post,
  TRouteContext,
  ValueOrPromise,
} from '@venizia/ignis';
import { getError, HTTP } from '@venizia/ignis-helpers';
import { BindingKeys } from '@venizia/ignis-inversion';
import { RouteConfigs, TCreateNoteRequest } from './definitions';

@controller({ path: '/notes' })
export class NoteController extends BaseRestController {
  constructor(
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.SERVICE,
        key: NoteService.name,
      }),
    })
    private noteService: NoteService,
  ) {
    super({ scope: NoteController.name });
  }

  override binding(): ValueOrPromise<void> {
    // Routes are declared with decorators; nothing to bind imperatively.
  }

  /**
   * The verified Supabase JWT payload, as claims.
   *
   * IGNIS's `IJWTTokenPayload` speaks `userId` + `roles`; GoTrue speaks `sub` + `role`. The shapes do
   * not coincide, and this is where that is reconciled - the claims handed to Postgres are the
   * token's own, because `auth.uid()` reads `sub` and nothing else.
   */
  private getClaims(context: TRouteContext): Record<string, unknown> {
    const claims = context.get(Authentication.CURRENT_USER) as Record<string, unknown> | undefined;

    if (!claims?.['sub']) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
        message: 'Authenticated token carries no `sub` claim - auth.uid() would resolve to null',
      });
    }

    return claims;
  }

  @get({ configs: RouteConfigs['/'] })
  async find(context: TRouteContext) {
    const data = await this.noteService.find({ claims: this.getClaims(context) });
    return context.json({ data, count: data.length }, HTTP.ResultCodes.RS_2.Ok);
  }

  @post({ configs: RouteConfigs['/create'] })
  async create(context: TRouteContext) {
    const body = (await context.req.json()) as TCreateNoteRequest;
    const data = await this.noteService.create({ claims: this.getClaims(context), data: body });
    return context.json(data, HTTP.ResultCodes.RS_2.Ok);
  }

  @del({ configs: RouteConfigs['/delete'] })
  async deleteById(context: TRouteContext) {
    // RouteConfigs is typed as Record<string, IAuthRouteConfig>, so the per-route param shape is not
    // inferred here - the zod schema on the route is what actually enforces it.
    const { id } = context.req.valid('param') as { id: string };
    const rs = await this.noteService.deleteById({ claims: this.getClaims(context), id });
    return context.json(rs, HTTP.ResultCodes.RS_2.Ok);
  }

  /** No authentication, no auth context, no RLS. Deliberately - it is the control group. */
  @get({ configs: RouteConfigs['/unscoped'] })
  async findUnscoped(context: TRouteContext) {
    const data = await this.noteService.findUnscoped();
    return context.json({ data, count: data.length }, HTTP.ResultCodes.RS_2.Ok);
  }
}
