import { z } from '@hono/zod-openapi';
import { IAuthRouteConfig, jsonContent, jsonResponse } from '@venizia/ignis';
import { HTTP } from '@venizia/ignis-helpers';

export const SignInRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const SignInResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int(),
  userId: z.string(),
});

export type TSignInRequest = z.infer<typeof SignInRequestSchema>;

export const RouteConfigs: Record<string, IAuthRouteConfig> = {
  ['/sign-in']: {
    method: HTTP.Methods.POST,
    path: '/sign-in',
    request: {
      body: jsonContent({
        description: 'Credentials of a real auth.users row in the Supabase project',
        schema: SignInRequestSchema,
      }),
    },
    responses: jsonResponse({
      description: 'A Supabase-issued access token, ready to be sent back as a Bearer token',
      schema: SignInResponseSchema,
    }),
  },
};
