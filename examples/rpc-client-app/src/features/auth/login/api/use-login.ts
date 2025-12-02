import { $api } from "@/shared/api/base";

/**
 * Login mutation hook
 * Provides type-safe API call for user authentication
 */
export function useLogin() {
  return $api.useMutation("post", "/auth/sign-in");
}
