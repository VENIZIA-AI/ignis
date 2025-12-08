import { $api } from "@/shared/api/base";

/**
 * Hook for sign-up mutation
 * Uses openapi-react-query for type-safe API calls
 */
export function useSignUp() {
  return $api.useMutation("post", "/auth/sign-up");
}
