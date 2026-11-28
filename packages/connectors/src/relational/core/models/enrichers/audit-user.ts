import { Execution, getError } from '@venizia/ignis-helpers/core';
import { Authentication, RequestContextRegistry } from '@venizia/ignis-kernel';

/**
 * Who to stamp on `created_by` / `modified_by`. Engine-neutral on purpose: the column BUILDERS
 * differ per dialect, this decision does not, and it was byte-identical in the postgres and sqlite
 * enrichers - so every review of this security-adjacent path had to happen twice.
 *
 * The user is the one of the execution frame, else the one authentication put on the request: a job or a system run
 * names it in `Execution.run`.
 *
 * The context comes from the registry, never from `hono/context-storage` directly: that module
 * constructs an `AsyncLocalStorage` in its own body, which is a `TypeError` at import in a browser.
 * A host with no resolver installed reports "no request context" - the first branch below.
 */
export class AuditUserResolver {
  static resolveAuditUserId<T>(opts: { allowAnonymous: boolean; columnField: string }): T | null {
    const context = RequestContextRegistry.resolve();
    // The user the frame names wins over the one its request's authentication set. An empty text names nobody.
    const named = Execution.current()?.userId;
    const frameUserId = named === '' ? undefined : named;

    if (!context && frameUserId === undefined) {
      if (!opts.allowAnonymous) {
        throw getError({
          message: `[getCurrentUserId] Invalid request context to identify user | columnName: ${opts.columnField} | allowAnonymous: ${opts.allowAnonymous}`,
        });
      }

      return null;
    }

    const userId: unknown = frameUserId ?? context?.get(Authentication.AUDIT_USER_ID);
    // `0` is a user.
    const isMissing = userId === undefined || userId === null || userId === '';

    if (isMissing && !opts.allowAnonymous) {
      throw getError({
        message: `[getCurrentUserId] No AUDIT_USER_ID found in request context | columnName: ${opts.columnField} | allowAnonymous: ${opts.allowAnonymous} | userId: ${String(userId)}`,
      });
    }

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the request context holds whatever the application's authentication put there; the caller names its type
    return isMissing ? null : (userId as T);
  }
}
