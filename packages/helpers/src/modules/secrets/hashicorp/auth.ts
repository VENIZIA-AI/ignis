import { z } from 'zod';
import { VaultAuthMethods } from '../common';

/** Validates the Vault login config; `method` selects the token, AppRole or Kubernetes shape. */
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

/** A validated Vault login config, discriminated by `method`. */
export type TVaultAuth = z.infer<typeof vaultAuthSchema>;
