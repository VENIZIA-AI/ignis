import { z } from '@hono/zod-openapi';
import { requiredString } from '@venizia/ignis';

// ================================================================================
export const SignInRequestSchema = z.object({
  identifier: z
    .object({
      scheme: z.string().nonempty(),
      value: z.string().nonempty(),
    })
    .openapi({
      required: ['scheme', 'value'],
      description: 'Sign-In Identifier',
    }),
  credential: z
    .object({
      scheme: requiredString(),
      value: requiredString({ min: 8 }),
    })
    .openapi({
      required: ['scheme', 'value'],
      description: 'Sign-In Credential',
    }),
  clientId: z.string().optional().openapi({
    description: 'Authenticate Provider',
  }),
});
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
export type TSignInRequestSchema = z.infer<typeof SignInRequestSchema>;
export type TSignInResponseSchema = z.infer<typeof SignInResponseSchema>;

// ================================================================================
export const SignUpRequestSchema = z.object({
  username: z.string().nonempty().trim().min(4).max(80),
  credential: z.string().nonempty().trim().min(4).max(80),
});
export const SignUpResponseSchema = z.object({
  message: z.string().nonempty().openapi({
    description: 'Sign-Up Response Message',
  }),
});
export type TSignUpRequestSchema = z.infer<typeof SignUpRequestSchema>;
export type TSignUpResponseSchema = z.infer<typeof SignUpResponseSchema>;

// ================================================================================
export const ChangePasswordRequestSchema = z.object({
  scheme: z.string().nonempty(),
  oldCredential: z.string().nonempty().min(4).max(80),
  newCredential: z.string().nonempty().min(4).max(80),
  userId: z.string().nonempty(),
});
export const ChangePasswordResponseSchema = z.object({
  message: z.string().nonempty().openapi({
    description: 'Change Password Response Message',
  }),
});
export type TChangePasswordRequestSchema = z.infer<typeof ChangePasswordRequestSchema>;
export type TChangePasswordResponseSchema = z.infer<typeof ChangePasswordResponseSchema>;

// ================================================================================
export const GetUserInformationRequestSchema = z.object({});
export const GetUserInformationResponseSchema = z.object({});
export type TGetUserInformationRequestSchema = z.infer<typeof GetUserInformationRequestSchema>;
export type TGetUserInformationResponseSchema = z.infer<typeof GetUserInformationResponseSchema>;
