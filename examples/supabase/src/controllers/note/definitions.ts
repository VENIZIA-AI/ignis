import { z } from '@hono/zod-openapi';
import { AuthenticateStrategy, IAuthRouteConfig, jsonContent, jsonResponse } from '@venizia/ignis';
import { HTTP } from '@venizia/ignis-helpers';

export const NoteSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  title: z.string(),
  content: z.string().nullable(),
  isPrivate: z.boolean(),
  createdAt: z.string(),
  modifiedAt: z.string(),
});

export const CreateNoteRequestSchema = z.object({
  title: z.string().min(1),
  content: z.string().optional(),
  isPrivate: z.boolean().optional(),
});

export type TCreateNoteRequest = z.infer<typeof CreateNoteRequestSchema>;

const authenticated: IAuthRouteConfig['authenticate'] = {
  strategies: [AuthenticateStrategy.JWT],
};

export const RouteConfigs: Record<string, IAuthRouteConfig> = {
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
        schema: CreateNoteRequestSchema,
      }),
    },
    responses: jsonResponse({
      description: 'The created note',
      schema: NoteSchema,
    }),
  },

  ['/delete']: {
    method: HTTP.Methods.DELETE,
    path: '/:id',
    authenticate: authenticated,
    request: { params: z.object({ id: z.string().uuid() }) },
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
        'EVERY note in the table. Same repository, same table - but no auth context, so the query runs as the connection role and RLS never engages. This is the control group.',
      schema: z.object({ data: z.array(NoteSchema), count: z.number().int() }),
    }),
  },
};
