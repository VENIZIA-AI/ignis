import type { TAnyObjectSchema } from '@/base/controllers/common/schema-builders';

/** Options for defining the auth controller. `serviceKey` is the container key of the `IAuthService` it calls; each `payload` entry overrides the request or response schema of one route. */
export type TDefineAuthControllerOpts = {
  restPath?: string;
  serviceKey: string;
  requireAuthenticatedSignUp?: boolean;
  payload?: {
    signIn?: {
      request: { schema: TAnyObjectSchema };
      response: { schema: TAnyObjectSchema };
    };
    signUp?: {
      request: { schema: TAnyObjectSchema };
      response: { schema: TAnyObjectSchema };
    };
    changePassword?: {
      request: { schema?: TAnyObjectSchema };
      response: { schema: TAnyObjectSchema };
    };
    refreshToken?: {
      response: { schema: TAnyObjectSchema };
    };
    getUserInformation?: {
      response: { schema: TAnyObjectSchema };
    };
  };
};

/** REST options of the authenticate component: `controllerOpts` is required when `useAuthController` is `true`. */
export type TAuthenticationRestOptions = {} & (
  | { useAuthController?: false | undefined }
  | {
      useAuthController: true;
      controllerOpts: TDefineAuthControllerOpts;
    }
);
