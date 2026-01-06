import { z } from '@hono/zod-openapi';

// ================================================================================
export const SignInResponseSchema = z.object({
  userId: z.number().openapi({
    description: 'User ID',
  }),
  roles: z.array(z.string()).openapi({
    description: 'User Roles',
  }),
  token: z
    .object({
      value: z.string().nonempty(),
      type: z.string().nonempty(),
    })
    .openapi({
      description: 'Authentication Token',
    }),
});
export type TSignInResponseSchema = z.infer<typeof SignInResponseSchema>;

// ================================================================================
export const SignUpResponseSchema = z.object({
  message: z.string().nonempty().openapi({
    description: 'Sign-Up Response Message',
  }),
});
export type TSignUpResponseSchema = z.infer<typeof SignUpResponseSchema>;

// ================================================================================
export const ChangePasswordResponseSchema = z.object({
  message: z.string().nonempty().openapi({
    description: 'Change Password Response Message',
  }),
});
export type TChangePasswordResponseSchema = z.infer<typeof ChangePasswordResponseSchema>;

// ================================================================================
export const GetUserInformationResponseSchema = z.object({});
export type TGetUserInformationResponseSchema = z.infer<typeof GetUserInformationResponseSchema>;
