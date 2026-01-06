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
export type TSignInRequestSchema = z.infer<typeof SignInRequestSchema>;

// ================================================================================
export const SignUpRequestSchema = z.object({
  username: z.string().nonempty().trim().min(4).max(80),
  credential: z.string().nonempty().trim().min(4).max(80),
});
export type TSignUpRequestSchema = z.infer<typeof SignUpRequestSchema>;

// ================================================================================
export const ChangePasswordRequestSchema = z.object({
  scheme: z.string().nonempty(),
  oldCredential: z.string().nonempty().min(4).max(80),
  newCredential: z.string().nonempty().min(4).max(80),
  userId: z.string().nonempty(),
});
export type TChangePasswordRequestSchema = z.infer<typeof ChangePasswordRequestSchema>;

// ================================================================================
export const GetUserInformationRequestSchema = z.object({});
export type TGetUserInformationRequestSchema = z.infer<typeof GetUserInformationRequestSchema>;
