import { z } from '@hono/zod-openapi';

// Response bodies of the auth routes. Declaring them is what types `data.token` in the generated
// client; without them the routes answer an open object.
export const SignUpResponseSchema = z
  .object({ id: z.string(), username: z.string() })
  .openapi('SignUpResponse');

export const SignInResponseSchema = z
  .object({ token: z.string().openapi({ description: 'Send as `Authorization: Bearer <token>`' }) })
  .openapi('SignInResponse');

export const ChangePasswordResponseSchema = z
  .object({ id: z.string() })
  .openapi('ChangePasswordResponse');

export type TSignUpResponse = z.infer<typeof SignUpResponseSchema>;
export type TSignInResponse = z.infer<typeof SignInResponseSchema>;
export type TChangePasswordResponse = z.infer<typeof ChangePasswordResponseSchema>;
