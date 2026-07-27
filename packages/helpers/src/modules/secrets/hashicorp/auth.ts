import { z } from 'zod';
import { VaultAuthMethods } from '../common';

export const vaultAuthSchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal(VaultAuthMethods.TOKEN), token: z.string() }),
  z.object({
    method: z.literal(VaultAuthMethods.APP_ROLE),
    roleId: z.string(),
    secretId: z.string(),
    mountPath: z.string().optional(),
  }),
  z.object({
    method: z.literal(VaultAuthMethods.KUBERNETES),
    role: z.string(),
    jwtPath: z.string().optional(),
    mountPath: z.string().optional(),
  }),
]);

export type TVaultAuth = z.infer<typeof vaultAuthSchema>;
