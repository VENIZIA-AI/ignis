import { NoteService } from '@/services/note.service';
import {
  Authentication,
  AuthenticateStrategy,
  BaseRestController,
  controller,
  del,
  get,
  type IAuthRouteConfig,
  inject,
  jsonContent,
  jsonResponse,
  post,
  type TRouteContext,
} from '@venizia/ignis';
import { getError, HTTP } from '@venizia/ignis-helpers';
import { z } from '@hono/zod-openapi';

const NoteSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  title: z.string(),
  content: z.string().nullable(),
  isPrivate: z.boolean(),
});

const CreateNoteSchema = z.object({
  title: z.string().min(1),
  content: z.string().optional(),
  isPrivate: z.boolean().optional(),
});

type TCreateNoteRequest = z.infer<typeof CreateNoteSchema>;

const authenticated: IAuthRouteConfig['authenticate'] = { strategies: [AuthenticateStrategy.JWT] };

const RouteConfigs: Record<string, IAuthRouteConfig> = {
  ['/']: {
    method: HTTP.Methods.GET,
    path: '/',
    authenticate: authenticated,
    responses: jsonResponse({
      description: 'Notes visible to the caller. Scoped by RLS, not by a where clause.',
      schema: z.object({ data: z.array(NoteSchema), count: z.number().int() }),
    }),
  },
  ['/create']: {
    method: HTTP.Methods.POST,
    path: '/',
    authenticate: authenticated,
    request: {
      body: jsonContent({
        description: 'A new note. Ownership is not part of the payload - the database stamps it.',
        schema: CreateNoteSchema,
      }),
    },
    responses: jsonResponse({ description: 'The created note', schema: NoteSchema }),
  },
  ['/delete']: {
    method: HTTP.Methods.DELETE,
    path: '/:id',
    authenticate: authenticated,
    request: { params: z.object({ id: z.string() }) },
    responses: jsonResponse({
      description: 'Rows deleted. A note owned by someone else matches nothing, so count is 0.',
      schema: z.object({ count: z.number().int() }),
    }),
  },
  ['/unscoped']: {
    method: HTTP.Methods.GET,
    path: '/unscoped',
    responses: jsonResponse({
      description:
        'EVERY note in the table. Same repository, same table - but no auth context, so the query runs as the connection role and RLS never engages. The control group.',
      schema: z.object({ data: z.array(NoteSchema), count: z.number().int() }),
    }),
  },
};

@controller({ path: '/notes' })
export class NoteController extends BaseRestController {
  constructor(
    @inject({ key: 'services.NoteService' })
    private noteService: NoteService,
  ) {
    super({ scope: NoteController.name });
  }

  override binding() {
    // Routes are declared with decorators; nothing to bind imperatively.
  }

  /**
   * The verified token payload, as claims. Supabase Auth issues `sub` + `role`; IGNIS's own token
   * shape is `userId` + `roles`. This app verifies a token shaped like Supabase's, so the claims read
   * here are the payload itself - `auth.uid()` reads `sub`, and nothing else.
   */
  private getClaims(context: TRouteContext): Record<string, unknown> {
    const claims: Record<string, unknown> | undefined = context.get(Authentication.CURRENT_USER);

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
    const body = context.req.valid<TCreateNoteRequest>('json');
    const data = await this.noteService.create({ claims: this.getClaims(context), data: body });
    return context.json(data, HTTP.ResultCodes.RS_2.Ok);
  }

  @del({ configs: RouteConfigs['/delete'] })
  async deleteById(context: TRouteContext) {
    const { id } = context.req.valid<{ id: string }>('param');
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
