import { getError } from '@venizia/ignis-helpers/core';
import { Authentication, RequestContextRegistry } from '@venizia/ignis-kernel';

/**
 * Who to stamp on `created_by` / `modified_by`. Engine-neutral on purpose: the column BUILDERS
 * differ per dialect, this decision does not, and it was byte-identical in the postgres and sqlite
 * enrichers - so every review of this security-adjacent path had to happen twice.
 *
 * CAUTION: fire-and-forget promises may run outside async context, losing AUDIT_USER_ID.
 *
 * The context comes from the registry, never from `hono/context-storage` directly: that module
 * constructs an `AsyncLocalStorage` in its own body, which is a `TypeError` at import in a browser.
 * A host with no resolver installed reports "no request context" - the first branch below.
 */
export const resolveAuditUserId = <T>(opts: {
  allowAnonymous: boolean;
  columnField: string;
}): T | null => {
  const context = RequestContextRegistry.resolve();
  if (!context) {
    if (!opts.allowAnonymous) {
      throw getError({
        message: `[getCurrentUserId] Invalid request context to identify user | columnName: ${opts.columnField} | allowAnonymous: ${opts.allowAnonymous}`,
      });
    }

    return null;
  }

  const userId = context.get(Authentication.AUDIT_USER_ID);
  if (!userId && !opts.allowAnonymous) {
    throw getError({
      message: `[getCurrentUserId] No AUDIT_USER_ID found in request context | columnName: ${opts.columnField} | allowAnonymous: ${opts.allowAnonymous} | userId: ${userId}`,
    });
  }

  return (userId as T) ?? null;
};
